#!/usr/bin/env bash
# Train GraphSAGE + XGBoost in the NVIDIA financial-fraud-training image.
# Writes the image's artifacts plus train_run.json (wall clock, image digest,
# peak GPU / unified-memory use) and train.log to $OUTPUT.
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

mem_used_mib() {
  awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf "%d", (t-a)/1024}' /proc/meminfo 2>/dev/null || echo 0
}
gpu_used_mib() {
  nvidia-smi --query-compute-apps=used_memory --format=csv,noheader,nounits 2>/dev/null \
    | awk '$1 ~ /^[0-9]+$/ {s+=$1} END{printf "%d", s}'
}
PEAK_FILE="$(mktemp)"
BASE_MEM="$(mem_used_mib)"
echo "0 0" >"$PEAK_FILE"
( while sleep 5; do
    read -r pg pm <"$PEAK_FILE"; g="$(gpu_used_mib)"; m="$(mem_used_mib)"
    (( g > pg )) && pg=$g; (( m > pm )) && pm=$m
    echo "$pg $pm" >"$PEAK_FILE"
  done ) &
SAMPLER=$!
trap 'kill $SAMPLER 2>/dev/null || true' EXIT

START="$(date +%s)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
set +e
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
  -c 'python3 /tmp/patch_boosting.py && exec /workspace/entrypoint.sh' 2>&1 | tee "$OUTPUT/train.log"
CODE=${PIPESTATUS[0]}
set -e
END="$(date +%s)"
kill $SAMPLER 2>/dev/null || true
read -r PEAK_GPU PEAK_MEM <"$PEAK_FILE"
rm -f "$PEAK_FILE"

DIGEST="$(docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE" 2>/dev/null || echo "")"
GNN_TRAINED=false
if grep -Eq '^\s*skip_gnn_train:\s*false' "$CONFIG"; then GNN_TRAINED=true; fi
cat >"$OUTPUT/train_run.json" <<JSON
{
  "started_at": "$STARTED_AT",
  "seconds": $((END - START)),
  "exit_code": $CODE,
  "image": "$IMAGE",
  "image_digest": "$DIGEST",
  "gnn_trained": $GNN_TRAINED,
  "peak_gpu_process_mib": ${PEAK_GPU:-0},
  "peak_system_memory_used_mib": ${PEAK_MEM:-0},
  "baseline_system_memory_used_mib": $BASE_MEM,
  "memory_note": "GB10 uses unified memory; system memory used includes the OS and other processes. GPU process memory is 0 if nvidia-smi cannot report it."
}
JSON
if [[ $CODE -ne 0 ]]; then
  echo "Training failed (exit $CODE). See $OUTPUT/train.log" >&2
  exit "$CODE"
fi
echo "Training finished in $((END - START))s. Artifacts in $OUTPUT"
