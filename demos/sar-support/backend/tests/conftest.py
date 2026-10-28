"""Tests never call AI Defense, Galileo, Agent Control, or a model: those env vars are blanked first."""
import json
import os
import sys
import tempfile
from pathlib import Path

for name in ("AIDEFENSE_API_KEY", "GALILEO_API_KEY", "OPENAI_API_KEY", "SPARKY_VLLM_BASE_URL", "NIM_BASE_URL",
             "SPLUNK_REALM", "SPLUNK_ACCESS_TOKEN", "OTEL_EXPORTER_OTLP_ENDPOINT"):
    os.environ[name] = ""
os.environ["AIDEFENSE_MODE"] = "enforce"
os.environ["SAR_DECISION_TIMEOUT_SECONDS"] = "30"

_registry = Path(tempfile.mkdtemp()) / "models.json"
_registry.write_text(json.dumps({"version": 2, "chain": ["openai"], "useCases": {}, "providers": {
    "openai": {"label": "OpenAI API", "kind": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-test",
               "apiKeyEnv": "OPENAI_API_KEY", "responsesApi": False, "private": False}}}))
os.environ["STUDIO_MODELS_FILE"] = str(_registry)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
