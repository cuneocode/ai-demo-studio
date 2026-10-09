#!/usr/bin/env bash
# Serve the trained NVIDIA GraphSAGE + XGBoost scorer on 127.0.0.1:$FRAUD_INFER_PORT.
# Uses the financial-fraud-training image (PyG, XGBoost, CUDA). The whole graph
# (training split + test window) is mounted so neighbourhoods have real history;
# the server only samples payments before each scored one.
# FRAUD_INFER_DETACH=1 runs it in the background; FRAUD_DEVICE=cpu forces CPU.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${FRAUD_TRAIN_OUTPUT:-$ROOT/.cache/train}"
DATA="${FRAUD_GRAPH_DATA:-$ROOT/.cache/graph}"
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
MODE=(--rm)
[[ "${FRAUD_INFER_DETACH:-0}" == "1" ]] && MODE=(-d)
docker run "${MODE[@]}" --gpus all --name "$NAME" \
  --shm-size=8g \
  -p "127.0.0.1:${PORT}:8000" \
  -e FRAUD_OUTPUT=/workspace/output \
  -e FRAUD_GRAPH_DATA=/data \
  ${FRAUD_DEVICE:+-e FRAUD_DEVICE="$FRAUD_DEVICE"} \
  -v "$OUTPUT:/workspace/output:ro" \
  -v "$DATA:/data:ro" \
  -v "$ROOT/scripts:/workspace/scripts:ro" \
  --entrypoint python3 \
  "$IMAGE" \
  /workspace/scripts/infer_server.py
