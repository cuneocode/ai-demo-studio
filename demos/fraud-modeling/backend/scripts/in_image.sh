#!/usr/bin/env bash
# Run a scripts/*.py helper inside the training image with the graph, trained
# artifacts, and .cache mounted. Usage: scripts/in_image.sh backtest.py [args...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${FRAUD_TRAIN_IMAGE:-nvcr.io/nvidia/cugraph/financial-fraud-training:3.0.0}"
SCRIPT="$1"
shift
mkdir -p "$ROOT/.cache/train" "$ROOT/.cache/graph"
exec docker run --rm --gpus all --shm-size=8g \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e PYTHONUNBUFFERED=1 \
  -v "$ROOT/.cache:/workspace/cache" \
  -v "$ROOT/.cache/graph:/data:ro" \
  -v "$ROOT/.cache/train:/workspace/output:ro" \
  -v "$ROOT/scripts:/workspace/scripts:ro" \
  --entrypoint python3 \
  "$IMAGE" \
  "/workspace/scripts/$SCRIPT" "$@"
