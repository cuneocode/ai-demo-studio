#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache"
DATA="${FRAUD_GRAPH_DATA:-$CACHE/graph}"
OUTPUT="${FRAUD_TRAIN_OUTPUT:-$CACHE/train}"
CONFIG="${FRAUD_TRAIN_CONFIG:-$ROOT/scripts/config.spark.yaml}"
IMAGE="${FRAUD_TRAIN_IMAGE:-nvcr.io/nvidia/cugraph/financial-fraud-training:3.0.0}"

if ! command -v docker >/dev/null; then
  echo "docker is required" >&2
  exit 1
fi
if [[ ! -d "$DATA/nodes" || ! -d "$DATA/edges" ]]; then
  echo "Graph data missing at $DATA" >&2
  exit 1
fi
if [[ -n "${NGC_API_KEY:-}" ]]; then
  echo "$NGC_API_KEY" | docker login nvcr.io -u '$oauthtoken' --password-stdin >/dev/null
fi
mkdir -p "$OUTPUT"
docker run --rm --gpus all --shm-size=16g \
  --ulimit memlock=-1 --ulimit stack=67108864 \
  -e NPROC=1 \
  -e LOG_LEVEL="${LOG_LEVEL:-INFO}" \
  -v "$DATA:/data:ro" \
  -v "$OUTPUT:/workspace/output" \
  -v "$CONFIG:/workspace/config.yaml:ro" \
  -v "$ROOT/scripts/patch_boosting.py:/tmp/patch_boosting.py:ro" \
  --entrypoint bash \
  "$IMAGE" \
  -c 'python3 /tmp/patch_boosting.py && exec /workspace/entrypoint.sh'
echo "Training finished. Artifacts in $OUTPUT"
