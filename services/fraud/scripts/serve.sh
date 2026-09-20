#!/usr/bin/env bash
# Serve the trained NVIDIA GraphSAGE + XGBoost scorer.
# Uses the financial-fraud-training image (PyG, XGBoost, Captum, CUDA).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${FRAUD_TRAIN_OUTPUT:-$ROOT/.cache/train}"
DATA="${FRAUD_GRAPH_DATA:-$ROOT/.cache/graph/test_gnn}"
IMAGE="${FRAUD_TRAIN_IMAGE:-nvcr.io/nvidia/cugraph/financial-fraud-training:3.0.0}"
PORT="${FRAUD_INFER_PORT:-8000}"
NAME="${FRAUD_INFER_NAME:-fsi-fraud-gnn}"

if [[ ! -f "$OUTPUT/model_final.pt" || ! -f "$OUTPUT/xgboost_fraud.json" ]]; then
  echo "Missing trained artifacts in $OUTPUT. Run scripts/train.sh first." >&2
  exit 1
fi
if [[ ! -d "$DATA/nodes" ]]; then
  echo "Graph data missing at $DATA" >&2
  exit 1
fi
if [[ -n "${NGC_API_KEY:-}" ]]; then
  echo "$NGC_API_KEY" | docker login nvcr.io -u '$oauthtoken' --password-stdin >/dev/null
fi
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run --rm --gpus all --name "$NAME" \
  --shm-size=8g \
  -p "127.0.0.1:${PORT}:8000" \
  -e FRAUD_OUTPUT=/workspace/output \
  -e FRAUD_GRAPH_DATA=/data \
  -v "$OUTPUT:/workspace/output:ro" \
  -v "$DATA:/data:ro" \
  -v "$ROOT/scripts/infer_server.py:/workspace/infer_server.py:ro" \
  --entrypoint python3 \
  "$IMAGE" \
  /workspace/infer_server.py
