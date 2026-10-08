#!/usr/bin/env python3
"""Interbank A2A settlement demo control.

  python3 labctl.py up                 # credentials, controls, build, start
  python3 labctl.py kickoff allowed    # investigation that runs to completion
  python3 labctl.py kickoff blocked    # kickoff Cisco AI Defense blocks at Bank A's gateway
  python3 labctl.py verify <run-id> [blocked]  # check the trace in Splunk Agent Observability
  python3 labctl.py status | logs | down

Credentials are generated into .runtime/ (git-ignored, mode 0600) and mounted per
container. Vendor keys are read from the existing FSI Demo Studio .env and are never
printed.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import jwt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / ".runtime"
PKI = RUNTIME / "pki"
ROLES = RUNTIME / "roles"
FSI_ENV = Path(os.environ.get("FSI_ENV", ROOT.parents[1] / ".env"))
# The studio's Model backends choice; the agents and console mount this directory read-only.
STUDIO = ROOT.parents[1] / ".studio"
MODEL_KEYS = ("OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY")
IMAGE = "interbank-a2a-demo:0.2.0"
DEMO_URL = "http://127.0.0.1:8088"
PROJECT = "Interbank A2A Settlement Demo"
AGENT_STREAM = "Interbank settlement investigations"
BANKS = ("bank-a", "bank-b")


def sh(*command: str, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=ROOT, check=check, text=True, capture_output=capture)


def compose(*args: str, **kwargs) -> subprocess.CompletedProcess:
    return sh("docker", "compose", "--env-file", str(ROOT / ".env"), *args, **kwargs)


def write_private(path: Path, data: bytes | str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_bytes(data.encode() if isinstance(data, str) else data)
    path.chmod(0o600)


# ------------------------------------------------------------ vendor config ----

def import_vendor_env() -> None:
    source: dict[str, str] = {}
    for line in FSI_ENV.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            source[key.strip()] = value.strip().strip("'\"")
    required = ["GALILEO_API_KEY", "GALILEO_CONSOLE_URL", "AIDEFENSE_API_KEY", "AGENT_CONTROL_URL"]
    if not (STUDIO / "models.json").exists():
        required += ["OPENAI_API_KEY", "MODEL_NAME"]
    missing = [k for k in required if not source.get(k)]
    if missing:
        raise SystemExit(f"{FSI_ENV} is missing {', '.join(missing)}")
    console = source["GALILEO_CONSOLE_URL"].rstrip("/")
    api = source.get("GALILEO_API_URL", "").rstrip("/") or console.replace("://console.", "://api.", 1)
    control_url = source["AGENT_CONTROL_URL"]
    if "localhost" in control_url:
        control_url = "https://agent-control.multitenant.galileocloud.io"
    values = {
        "SPLUNK_AO_API_KEY": source["GALILEO_API_KEY"],
        "SPLUNK_AO_CONSOLE_URL": console,
        "SPLUNK_AO_API_URL": api,
        "SPLUNK_AO_PROJECT": PROJECT,
        "SPLUNK_AO_AGENT_STREAM": AGENT_STREAM,
        "AGENT_CONTROL_URL": control_url,
        "AGENT_CONTROL_API_KEY_HEADER": "Galileo-API-Key",
        "AGENT_CONTROL_RUNTIME_TOKEN_HEADER": "Authorization",
        "AIDEFENSE_API_KEY": source["AIDEFENSE_API_KEY"],
        "AIDEFENSE_REGION": source.get("AIDEFENSE_REGION", "us-west-2"),
        "AIDEFENSE_TIMEOUT": source.get("AIDEFENSE_TIMEOUT", "30"),
        "MODEL_NAME": source.get("MODEL_NAME", ""),
        "MODEL_REASONING_EFFORT": source.get("MODEL_REASONING_EFFORT", "medium"),
    }
    write_private(RUNTIME / "vendor.env", "".join(f"{k}={v}\n" for k, v in values.items()))
    # Only the two agent containers mount model.env: the model credentials a studio
    # provider may name, plus the lab's own fallback settings.
    model = {k: source[k] for k in MODEL_KEYS if source.get(k)}
    if source.get("OPENAI_API_KEY"):
        model["MODEL_API_KEY"] = source["OPENAI_API_KEY"]
    if source.get("OPENAI_BASE_URL"):
        model["MODEL_BASE_URL"] = source["OPENAI_BASE_URL"]
    write_private(RUNTIME / "model.env", "".join(f"{k}={v}\n" for k, v in model.items()))


# --------------------------------------------------------------------- PKI ----

def _name(cn: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Interbank A2A Demo"),
                      x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def _key(name: str) -> ec.EllipticCurvePrivateKey:
    path = PKI / f"{name}.key"
    if path.exists():
        return serialization.load_pem_private_key(path.read_bytes(), password=None)
    key = ec.generate_private_key(ec.SECP256R1())
    write_private(path, key.private_bytes(serialization.Encoding.PEM,
                                          serialization.PrivateFormat.PKCS8,
                                          serialization.NoEncryption()))
    return key


def _pem(obj) -> bytes:
    if isinstance(obj, x509.Certificate):
        return obj.public_bytes(serialization.Encoding.PEM)
    return obj.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                             serialization.NoEncryption())


def _usage(ca: bool) -> x509.KeyUsage:
    return x509.KeyUsage(digital_signature=True, key_encipherment=False, key_cert_sign=ca,
                         key_agreement=not ca, content_commitment=False,
                         data_encipherment=False, crl_sign=ca, encipher_only=False,
                         decipher_only=False)


def bank_ca(bank: str) -> tuple[ec.EllipticCurvePrivateKey, x509.Certificate]:
    """Self-signed local trust anchor for one bank (P-256, SHA-256)."""
    key, path = _key(f"{bank}-ca"), PKI / f"{bank}-ca.crt"
    if path.exists():
        return key, x509.load_pem_x509_certificate(path.read_bytes())
    now = datetime.now(UTC)
    cert = (x509.CertificateBuilder().subject_name(_name(f"{bank} root CA"))
            .issuer_name(_name(f"{bank} root CA")).public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=365))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(_usage(True), critical=True)
            .sign(key, hashes.SHA256()))
    write_private(path, _pem(cert))
    return key, cert


def leaf(bank: str, name: str, *, server: bool) -> tuple[bytes, bytes]:
    """Workload certificate; reissued when missing or within 7 days of expiry."""
    path = PKI / f"{name}.crt"
    key = _key(name)
    if path.exists():
        cert = x509.load_pem_x509_certificate(path.read_bytes())
        expires = getattr(cert, "not_valid_after_utc", None) or cert.not_valid_after.replace(tzinfo=UTC)
        if expires - datetime.now(UTC) > timedelta(days=7):
            return path.read_bytes(), _pem(key)
    ca_key, ca = bank_ca(bank)
    now = datetime.now(UTC)
    usages = [ExtendedKeyUsageOID.CLIENT_AUTH] + ([ExtendedKeyUsageOID.SERVER_AUTH] if server else [])
    cert = (x509.CertificateBuilder().subject_name(_name(name)).issuer_name(ca.subject)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=90))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(_usage(False), critical=True)
            .add_extension(x509.ExtendedKeyUsage(usages), critical=False)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName(name)]), critical=False)
            .sign(ca_key, hashes.SHA256()))
    write_private(path, _pem(cert))
    return _pem(cert), _pem(key)


def _b64(value: int) -> str:
    return base64.urlsafe_b64encode(value.to_bytes(32, "big")).rstrip(b"=").decode()


def jwks(name: str, kid: str) -> str:
    numbers = _key(name).public_key().public_numbers()
    return json.dumps({"keys": [{"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig",
                                 "kid": kid, "x": _b64(numbers.x), "y": _b64(numbers.y)}]})


def token(bank: str, subject: str) -> str:
    now = datetime.now(UTC)
    return jwt.encode({"iss": f"lab://{bank}-internal", "sub": subject, "aud": f"{bank}-gateway",
                       "iat": now, "exp": now + timedelta(hours=72), "jti": str(uuid.uuid4())},
                      _key(f"{bank}-internal"), algorithm="ES256",
                      headers={"kid": f"{bank}-internal-1"})


def generate_credentials() -> None:
    cas = {bank: _pem(bank_ca(bank)[1]) for bank in BANKS}
    for bank, partner in (("bank-a", "bank-b"), ("bank-b", "bank-a")):
        gateway_cert, gateway_key = leaf(bank, f"{bank}-gateway", server=True)
        agent_cert, agent_key = leaf(bank, f"{bank}-agent", server=True)
        role = ROLES / f"{bank}-gateway"
        files = {
            "gateway.crt": gateway_cert, "gateway.key": gateway_key,
            f"{bank}-ca.crt": cas[bank], f"{partner}-ca.crt": cas[partner],
            "internal-jwks.json": jwks(f"{bank}-internal", f"{bank}-internal-1"),
            f"{partner}-partner-jwks.json": jwks(f"{partner}-partner", f"{partner}-partner-1"),
            "partner-signing.key": _pem(_key(f"{bank}-partner")),
            "backend-signing.key": _pem(_key(f"{bank}-backend")),
        }
        for name, data in files.items():
            write_private(role / name, data)
        role = ROLES / f"{bank}-agent"
        for name, data in {
            "agent.crt": agent_cert, "agent.key": agent_key, f"{bank}-ca.crt": cas[bank],
            "egress.jwt": token(bank, f"{bank}-agent"),
            "gateway-jwks.json": jwks(f"{bank}-backend", f"{bank}-backend-1"),
        }.items():
            write_private(role / name, data)
    console_cert, console_key = leaf("bank-a", "operations-console", server=False)
    for name, data in {"console.crt": console_cert, "console.key": console_key,
                       "bank-a-ca.crt": cas["bank-a"],
                       "console.jwt": token("bank-a", "operations-console")}.items():
        write_private(ROLES / "console" / name, data)


# ------------------------------------------------------------------ docker ----

def extra_egress_roots() -> str:
    """Roots of a TLS-inspecting corporate proxy (e.g. Cisco Secure Access) the host trusts."""
    if os.environ.get("EXTRA_CA_FILE"):
        return Path(os.environ["EXTRA_CA_FILE"]).read_text(encoding="utf-8")
    if sys.platform != "darwin":
        return ""
    found = sh("security", "find-certificate", "-a", "-c", "Cisco Secure Access Root CA", "-p",
               "/Library/Keychains/System.keychain", check=False, capture=True)
    return found.stdout if found.returncode == 0 else ""


def write_egress_bundle() -> None:
    """Public roots plus any proxy roots, for the agents' calls to the OpenAI API."""
    public = sh("docker", "run", "--rm", "--entrypoint", "python", IMAGE, "-c",
                "import certifi; print(open(certifi.where()).read())", capture=True).stdout
    bundle = public + extra_egress_roots()
    for bank in BANKS:
        write_private(ROLES / f"{bank}-agent" / "egress-ca-bundle.pem", bundle)


def run_tool(module: str, *args: str) -> None:
    sh("docker", "run", "--rm", "--user", f"{os.getuid()}:{os.getgid()}", "--env-file",
       str(RUNTIME / "vendor.env"), "-e", "SPLUNK_AO_HOME_DIR=/tmp/.splunk", "--tmpfs", "/tmp",
       IMAGE, module, *args)


def up(_: argparse.Namespace) -> None:
    RUNTIME.mkdir(mode=0o700, exist_ok=True)
    STUDIO.mkdir(mode=0o700, exist_ok=True)
    for folder in ("runs", "telemetry/bank-a", "telemetry/bank-b"):
        (ROOT / "evidence" / folder).mkdir(parents=True, exist_ok=True)
    write_private(ROOT / ".env", f"LAB_UID={os.getuid()}\nLAB_GID={os.getgid()}\n")
    import_vendor_env()
    generate_credentials()
    sh("docker", "build", "-t", IMAGE, ".")
    write_egress_bundle()
    run_tool("tools.setup_controls")
    compose("up", "-d", "--remove-orphans", "--force-recreate")
    for _ in range(90):
        try:
            if httpx.get(f"{DEMO_URL}/health", timeout=2).status_code == 200:
                ok = compose("ps", "--format", "{{.Service}} {{.Health}}", capture=True).stdout
                if "starting" not in ok and "unhealthy" not in ok:
                    print(f"Dashboard: {DEMO_URL}")
                    return
        except httpx.HTTPError:
            pass
        time.sleep(2)
    raise SystemExit("Services did not become healthy; run: python3 labctl.py logs")


def kickoff(args: argparse.Namespace) -> None:
    examples = httpx.get(f"{DEMO_URL}/api/examples", timeout=5).json()
    prompt = examples.get(args.prompt, args.prompt)
    run = httpx.post(f"{DEMO_URL}/api/kickoff", json={"prompt": prompt}, timeout=10).json()
    print(f"{run['id']}  {prompt}\n")
    seen, started = 0, time.time()
    while True:
        data = httpx.get(f"{DEMO_URL}/api/runs/{run['id']}", params={"after": seen}, timeout=10).json()
        for event in data["events"]:
            seen += 1
            mark = {"denied": "BLOCK", "allowed": "ok", "error": "ERR"}.get(event["status"], "")
            print(f"{time.time() - started:6.1f}s {event['component']:<20} {mark:<5} {event['title']}")
        if data["run"]["status"] != "running":
            print(f"\n{data['run']['status'].upper()}\n\n{data['run'].get('report', '')}")
            return
        time.sleep(1.5)


def verify(args: argparse.Namespace) -> None:
    run_tool("tools.verify_splunk", args.run_id, *([args.mode] if args.mode else []))


def status(_: argparse.Namespace) -> None:
    compose("ps")


def logs(_: argparse.Namespace) -> None:
    compose("logs", "--tail", "80")


def down(_: argparse.Namespace) -> None:
    compose("down", "--remove-orphans")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    commands = parser.add_subparsers(required=True)
    commands.add_parser("up").set_defaults(func=up)
    start = commands.add_parser("kickoff")
    start.add_argument("prompt", help="'allowed', 'blocked', or your own kickoff text")
    start.set_defaults(func=kickoff)
    check = commands.add_parser("verify")
    check.add_argument("run_id")
    check.add_argument("mode", nargs="?", choices=["blocked"],
                       help="expect only the console, Bank A gateway and AI Defense spans")
    check.set_defaults(func=verify)
    for name, func in (("status", status), ("logs", logs), ("down", down)):
        commands.add_parser(name).set_defaults(func=func)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
