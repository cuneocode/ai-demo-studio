"""Score backends, never dead: live GNN+XGBoost sidecar, then recorded scores, then sample fixtures.

`auto` walks the chain per request, so a sidecar that drops mid-demo still yields a score,
and every response names the backend that answered (live | cache | fixture).
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import httpx

from reasons import feature_label

ROOT = Path(__file__).resolve().parent
CACHE_PATH = ROOT / ".cache" / "scores.json"
RECORDED_PATH = ROOT / "data" / "recorded_scores.json"
FIXTURE_PATH = ROOT / "data" / "fixture_scores.json"

LIVE, CACHE, FIXTURE = "live", "cache", "fixture"
BACKEND_LABEL = {LIVE: "GNN on Sparky (live)", CACHE: "Recorded scores", FIXTURE: "Sample scores"}
PROBE_TTL_S = 5.0

RISK_BANDS = {
    "high": ("High risk", "Contact customer, then block and reissue"),
    "elevated": ("Elevated risk", "Verify with the customer before the payment settles"),
    "low": ("Low risk", "No action needed; keep monitoring"),
}


class ScoreError(Exception):
    pass


def env_url(name: str, default: str) -> str:
    return (os.getenv(name) or default).rstrip("/")


def threshold() -> float:
    try:
        value = float(os.getenv("FRAUD_THRESHOLD", "0.5"))
    except ValueError:
        value = 0.5
    return min(0.95, max(0.05, value))


def risk_band(probability: float, cut: float) -> str:
    if probability >= cut:
        return "high"
    if probability >= cut * 0.7:
        return "elevated"
    return "low"


def risk_label(band: str) -> str:
    return RISK_BANDS[band][0]


def suggested_action(band: str) -> str:
    return RISK_BANDS[band][1]


def decision_for(probability: float, cut: float) -> str:
    """Legacy API field (hold / review / clear); the studio shows risk_band and suggested_action."""
    return {"high": "hold", "elevated": "review", "low": "clear"}[risk_band(probability, cut)]


def normalize_score(payload: dict) -> dict:
    probability = float(payload["probability"])
    if not 0 <= probability <= 1:
        raise ScoreError("Probability is out of range.")
    shap = []
    for item in payload.get("shap") or []:
        value = float(item["value"])
        feature = str(item["feature"])
        shap.append({
            "feature": feature,
            "label": feature_label(feature),
            "value": value,
            "direction": item.get("direction") or ("risk" if value >= 0 else "protective"),
        })
    return {"probability": probability, "shap": shap}


def _read_scores(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {key: value for key, value in data.items() if not key.startswith("_") and isinstance(value, dict)}


def load_cache() -> dict:
    """Scores recorded from the live sidecar: .cache/scores.json, else the committed data/recorded_scores.json."""
    return _read_scores(CACHE_PATH) or _read_scores(RECORDED_PATH)


def load_fixture() -> dict:
    return _read_scores(FIXTURE_PATH)


def latest_recorded_at(cache: dict) -> str | None:
    stamps = [entry.get("recorded_at") for entry in cache.values() if isinstance(entry.get("recorded_at"), str)]
    return max(stamps) if stamps else None


class Scorer:
    def __init__(self):
        self.requested = "auto"
        self.backend = "unavailable"
        self.engine: str | None = None
        self.detail = "Checking the scoring backends."
        self.ready = False
        self.cache_cases = 0
        self.recorded_at: str | None = None
        self.live_ready = False
        self.triton_ready = False
        self._probed_at = 0.0
        self._configure()
        self.triton = {"status": "not_configured", "url": self.triton_url, "model": self.model}

    def _configure(self):
        self.requested = (os.getenv("FRAUD_BACKEND") or "auto").lower()
        self.triton_url = env_url("FRAUD_TRITON_URL", "http://127.0.0.1:8000")
        self.score_url = env_url("FRAUD_SCORE_URL", "http://127.0.0.1:8000")
        self.model = os.getenv("FRAUD_TRITON_MODEL") or "fraud_pipeline_explained"

    async def _probe(self, force: bool = False):
        if not force and time.monotonic() - self._probed_at < PROBE_TTL_S:
            return
        self.live_ready = await self._production_ready()
        self.triton_ready = False if self.live_ready else await self._triton_ready()
        self._probed_at = time.monotonic()

    async def resolve(self, force: bool = False):
        self._configure()
        cache = load_cache()
        self.cache_cases = len(cache)
        self.recorded_at = latest_recorded_at(cache)
        await self._probe(force)
        live = self.live_ready or self.triton_ready
        self.triton = {
            "status": "ready" if live else "not_configured" if self.requested == FIXTURE else "unavailable",
            "url": self.score_url if self.live_ready else self.triton_url,
            "model": "gnn_xgb" if self.live_ready else self.model,
        }

        if self.requested == FIXTURE:
            return self._use_fixture("Sample scores (FRAUD_BACKEND=fixture).")
        if self.requested == CACHE:
            return self._use_cache() if cache else self._unavailable("Recorded scores are missing.")
        if self.requested in {"production", "gnn"}:
            return self._use_live("sidecar") if self.live_ready else self._unavailable("The GraphSAGE + XGBoost scorer is not reachable.")
        if self.requested == "triton":
            return self._use_live("triton") if self.triton_ready else self._unavailable("Triton /v2/health/ready is not reachable.")
        if self.live_ready:
            return self._use_live("sidecar")
        if self.triton_ready:
            return self._use_live("triton")
        if cache:
            return self._use_cache("The live GNN sidecar is offline. ")
        if load_fixture():
            return self._use_fixture("The live GNN sidecar is offline and no recorded scores exist. Showing sample scores.")
        return self._unavailable("No scoring backend is available.")

    def health(self):
        return {
            "backend": self.backend,
            "backend_label": BACKEND_LABEL.get(self.backend, "Unavailable"),
            "engine": self.engine,
            "ready": self.ready,
            "model": {
                FIXTURE: "Sample scores (synthetic)",
                CACHE: "gnn-xgb-tabformer (recorded)",
                LIVE: "gnn-xgb-tabformer" if self.engine == "sidecar" else self.model,
            }.get(self.backend, self.backend),
            "detail": self.detail,
            "threshold": threshold(),
            "requested": self.requested,
            "sidecar": {"status": "up" if (self.live_ready or self.triton_ready) else "down", "url": self.score_url},
            "triton": self.triton,
            "cache_cases": self.cache_cases,
            "recorded_at": self.recorded_at,
        }

    def chain(self) -> list[str]:
        """Backends to try for one request, in order."""
        if self.requested == FIXTURE:
            return [FIXTURE]
        if self.requested == CACHE:
            return [CACHE]
        if self.requested in {"production", "gnn", "triton"}:
            return [LIVE] if self.ready else []
        order = [LIVE] if (self.live_ready or self.triton_ready) else []
        return order + ([CACHE] if self.cache_cases else []) + [FIXTURE]

    async def score(self, case: dict) -> dict:
        """The first backend in the chain that scores this case; `fallback` lists the ones that could not."""
        if not self.ready:
            raise ScoreError(self.detail)
        skipped: list[dict] = []
        for backend in self.chain():
            started = time.monotonic()
            try:
                result = await self._score_with(backend, case)
            except ScoreError as exc:
                skipped.append({"backend": backend, "label": BACKEND_LABEL[backend], "reason": str(exc)})
                continue
            result.update({
                "backend": backend,
                "backend_label": BACKEND_LABEL[backend],
                "engine": ("sidecar" if self.live_ready else "triton") if backend == LIVE else None,
                "latency_ms": round((time.monotonic() - started) * 1000, 1),
                "fallback": skipped,
            })
            return result
        raise ScoreError(skipped[-1]["reason"] if skipped else self.detail)

    async def _score_with(self, backend: str, case: dict) -> dict:
        if backend == FIXTURE:
            payload = load_fixture().get(case["id"])
            if not payload:
                raise ScoreError("No sample score for this case.")
            return {**normalize_score(payload), "recorded_at": None}
        if backend == CACHE:
            cached = load_cache().get(case["id"])
            if not cached:
                raise ScoreError("No recorded score for this case.")
            return {**normalize_score(cached), "recorded_at": cached.get("recorded_at")}
        if self.live_ready:
            return {**await self._score_http(f"{self.score_url}/score", {"case": case, "case_id": case["id"]}), "recorded_at": None}
        return {**await self._score_triton(case), "recorded_at": None}

    def _use_fixture(self, detail: str):
        self.backend, self.engine, self.ready = FIXTURE, None, True
        self.detail = detail

    def _use_cache(self, prefix: str = ""):
        self.backend, self.engine, self.ready = CACHE, None, True
        self.detail = f"{prefix}Using {self.cache_cases} recorded scores from the GNN on Sparky."

    def _use_live(self, engine: str):
        self.backend, self.engine, self.ready = LIVE, engine, True
        self.detail = (f"Live GraphSAGE + XGBoost scoring at {self.score_url}." if engine == "sidecar"
                       else f"Scoring through Triton model {self.model}.")

    def _unavailable(self, detail: str):
        self.backend, self.engine, self.ready = "unavailable", None, False
        self.detail = detail

    async def _triton_ready(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.triton_url}/v2/models/{self.model}/ready")
            return response.status_code == 200
        except Exception:
            return False

    async def _production_ready(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.score_url}/health")
            return response.status_code == 200
        except Exception:
            return False

    async def _score_http(self, url: str, payload: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(url, json=payload)
            response.raise_for_status()
            return normalize_score(response.json())
        except ScoreError:
            raise
        except Exception:
            self._probed_at = 0.0
            raise ScoreError("The live GNN sidecar did not return a usable result.") from None

    async def _score_triton(self, case: dict) -> dict:
        url = f"{self.triton_url}/v2/models/{self.model}/infer"
        payload = {
            "id": case["id"],
            "inputs": [{
                "name": "CASE_ID",
                "datatype": "BYTES",
                "shape": [1, 1],
                "data": [case["id"]],
            }],
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(url, json=payload)
            response.raise_for_status()
            body = response.json()
        except Exception:
            self._probed_at = 0.0
            raise ScoreError("Triton inference failed. The live GNN payload is not this studio case catalog.") from None
        outputs = {item.get("name"): item for item in body.get("outputs", [])}
        probability = (outputs.get("fraud_probability") or outputs.get("probability") or {}).get("data", [None])[0]
        if probability is None:
            raise ScoreError("Triton response did not include a fraud probability.")
        shap = []
        raw_shap = (outputs.get("svs_attrs") or outputs.get("shap") or {}).get("data") or []
        names = (outputs.get("feature_names") or {}).get("data") or []
        for index, value in enumerate(raw_shap):
            name = names[index] if index < len(names) else f"feature_{index}"
            shap.append({"feature": str(name), "value": float(value)})
        return normalize_score({"probability": float(probability), "shap": shap})


scorer = Scorer()
