"""Score backends: live GNN+XGBoost when the infer sidecar is up; fixture only when forced."""
from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

CACHE_PATH = Path(__file__).resolve().parent / ".cache" / "scores.json"

FIXTURE_SCORES = {
    "txn-clean-pos": {
        "probability": 0.08,
        "shap": [
            {"feature": "merchant_neighborhood", "value": -0.11, "direction": "protective"},
            {"feature": "account_history", "value": -0.07, "direction": "protective"},
            {"feature": "transaction_amount", "value": 0.02, "direction": "risk"},
            {"feature": "payment_channel", "value": -0.03, "direction": "protective"},
        ],
    },
    "txn-compromised-merchant": {
        "probability": 0.74,
        "shap": [
            {"feature": "merchant_neighborhood", "value": 0.41, "direction": "risk"},
            {"feature": "account_gnn_embedding", "value": -0.06, "direction": "protective"},
            {"feature": "transaction_amount", "value": 0.09, "direction": "risk"},
            {"feature": "payment_channel", "value": 0.08, "direction": "risk"},
        ],
    },
    "txn-mule-ach": {
        "probability": 0.67,
        "shap": [
            {"feature": "account_neighborhood", "value": 0.29, "direction": "risk"},
            {"feature": "transaction_amount", "value": 0.18, "direction": "risk"},
            {"feature": "payment_channel", "value": 0.11, "direction": "risk"},
            {"feature": "merchant_neighborhood", "value": 0.04, "direction": "risk"},
        ],
    },
    "txn-cnp-review": {
        "probability": 0.41,
        "shap": [
            {"feature": "payment_channel", "value": 0.14, "direction": "risk"},
            {"feature": "raw_account_features", "value": 0.09, "direction": "risk"},
            {"feature": "merchant_neighborhood", "value": -0.05, "direction": "protective"},
            {"feature": "transaction_amount", "value": 0.07, "direction": "risk"},
        ],
    },
    "txn-subscription": {
        "probability": 0.11,
        "shap": [
            {"feature": "payment_channel", "value": -0.12, "direction": "protective"},
            {"feature": "merchant_neighborhood", "value": -0.08, "direction": "protective"},
            {"feature": "account_history", "value": -0.06, "direction": "protective"},
            {"feature": "transaction_amount", "value": 0.01, "direction": "risk"},
        ],
    },
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


def decision_for(probability: float, cut: float) -> str:
    if probability >= cut:
        return "hold"
    if probability >= cut * 0.7:
        return "review"
    return "clear"


def normalize_score(payload: dict) -> dict:
    probability = float(payload["probability"])
    if not 0 <= probability <= 1:
        raise ScoreError("Probability is out of range.")
    shap = []
    for item in payload.get("shap") or []:
        value = float(item["value"])
        shap.append({
            "feature": str(item["feature"]),
            "value": value,
            "direction": item.get("direction") or ("risk" if value >= 0 else "protective"),
        })
    return {"probability": probability, "shap": shap}


def load_cache() -> dict:
    if not CACHE_PATH.is_file():
        return {}
    try:
        data = json.loads(CACHE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


class Scorer:
    def __init__(self):
        self.requested = (os.getenv("FRAUD_BACKEND") or "auto").lower()
        self.triton_url = env_url("FRAUD_TRITON_URL", "http://127.0.0.1:8000")
        self.score_url = env_url("FRAUD_SCORE_URL", "http://127.0.0.1:8000")
        self.model = os.getenv("FRAUD_TRITON_MODEL") or "fraud_pipeline_explained"
        self.backend = "unavailable"
        self.detail = "Waiting for the trained GraphSAGE + XGBoost scorer."
        self.ready = False
        self.triton = {"status": "not_configured", "url": self.triton_url, "model": self.model}
        self.cache_cases = 0

    async def resolve(self):
        self.requested = (os.getenv("FRAUD_BACKEND") or "auto").lower()
        self.triton_url = env_url("FRAUD_TRITON_URL", "http://127.0.0.1:8000")
        self.score_url = env_url("FRAUD_SCORE_URL", "http://127.0.0.1:8000")
        self.model = os.getenv("FRAUD_TRITON_MODEL") or "fraud_pipeline_explained"
        cache = load_cache()
        self.cache_cases = len(cache)
        triton_ready = await self._triton_ready()
        live_ready = await self._production_ready()
        self.triton["status"] = "ready" if (triton_ready or live_ready) else "unavailable" if self.requested != "fixture" else "not_configured"
        if live_ready:
            self.triton["url"] = self.score_url
            self.triton["model"] = "gnn_xgb"

        if self.requested == "fixture":
            self._use_fixture()
            return
        if self.requested == "cache":
            if cache:
                self._use_cache()
            else:
                self._unavailable("Cached scores are missing.")
            return
        if self.requested in {"production", "gnn"}:
            if live_ready:
                self._use_production()
            else:
                self._unavailable("The GraphSAGE + XGBoost scorer is not reachable.")
            return
        if self.requested == "triton":
            if triton_ready:
                self._use_triton()
            else:
                self._unavailable("Triton /v2/health/ready is not reachable.")
            return
        if live_ready:
            self._use_production()
        elif triton_ready:
            self._use_triton()
        else:
            self._unavailable("Train the NVIDIA GNN+XGBoost stack and start scripts/serve.sh.")

    def health(self):
        return {
            "backend": self.backend,
            "ready": self.ready,
            "model": {
                "fixture": "fixture-graph-xgb",
                "cache": "cached-triton-export",
                "production_http": "gnn-xgb-tabformer",
                "triton": self.model,
            }.get(self.backend, self.backend),
            "detail": self.detail,
            "threshold": threshold(),
            "triton": self.triton,
            "cache_cases": self.cache_cases,
        }

    async def score(self, case: dict) -> dict:
        if not self.ready:
            raise ScoreError(self.detail)
        if self.backend == "fixture":
            return self._fixture_score(case["id"])
        if self.backend == "cache":
            cached = load_cache().get(case["id"])
            if not cached:
                raise ScoreError("No cached score for this case.")
            return normalize_score(cached)
        if self.backend == "production_http":
            return await self._score_http(f"{self.score_url}/score", {"case": case, "case_id": case["id"]})
        return await self._score_triton(case)

    def _use_fixture(self):
        self.backend = "fixture"
        self.ready = True
        self.detail = "Deterministic Shapley fixtures for the five studio cases."

    def _use_cache(self):
        self.backend = "cache"
        self.ready = True
        self.detail = f"Using {self.cache_cases} exported scores from services/fraud/.cache/scores.json."

    def _use_production(self):
        self.backend = "production_http"
        self.ready = True
        self.detail = f"Live GraphSAGE + XGBoost scoring at {self.score_url}."

    def _use_triton(self):
        self.backend = "triton"
        self.ready = True
        self.detail = f"Scoring through Triton model {self.model}."

    def _unavailable(self, detail: str):
        self.ready = False
        self.detail = detail

    def _fixture_score(self, case_id: str) -> dict:
        payload = FIXTURE_SCORES.get(case_id)
        if not payload:
            raise ScoreError("Unknown fixture case.")
        return normalize_score(payload)

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
            raise ScoreError("The configured score service did not return a usable result.") from None

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
