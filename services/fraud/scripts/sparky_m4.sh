#!/usr/bin/env bash
# End-to-end M4 run on Sparky (DGX Spark, aarch64): preprocess -> train -> cases ->
# backtest -> bench -> serve -> record scores -> model card. Steps whose outputs
# exist are skipped; FORCE=1 reruns everything. Long-running: start with
#   nohup services/fraud/scripts/sparky_m4.sh > services/fraud/.cache/m4.log 2>&1 &
# Needs NGC_API_KEY in the environment (never echoed). Downloads IBM TabFormer
# (synthetic, ~266 MB tgz) to services/fraud/.cache/raw/ when missing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache"
IMAGE="${FRAUD_TRAIN_IMAGE:-nvcr.io/nvidia/cugraph/financial-fraud-training:3.0.0}"
CSV="${TABFORMER_CSV:-$CACHE/raw/card_transaction.v1.csv}"
TABFORMER_URL="${TABFORMER_URL:-https://media.githubusercontent.com/media/IBM/TabFormer/main/data/credit_card/transactions.tgz}"
PORT="${FRAUD_INFER_PORT:-8000}"
FORCE="${FORCE:-0}"
export FRAUD_TRAIN_IMAGE="$IMAGE"

step() { echo; echo "=== $(date -u +%H:%M:%S) $*"; }
need() { [[ "$FORCE" == "1" || ! -e "$1" ]]; }

step "image $IMAGE"
if [[ -n "${NGC_API_KEY:-}" ]]; then
  echo "$NGC_API_KEY" | docker login nvcr.io -u '$oauthtoken' --password-stdin >/dev/null
fi
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  if ! docker manifest inspect "$IMAGE" | grep -q '"architecture": "arm64"'; then
    echo "No linux/arm64 manifest for $IMAGE; see services/fraud/README.md (aarch64 options)." >&2
    exit 2
  fi
  docker pull "$IMAGE"
fi

step "hardware"
python3 - "$CACHE/hardware.json" <<'PY'
import json, platform, subprocess, sys
def run(*cmd):
    try: return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()
    except Exception: return None
mem = {l.split(":")[0]: l.split()[1] for l in open("/proc/meminfo") if l.startswith(("MemTotal", "SwapTotal"))}
info = {
    "host_label": "Sparky · NVIDIA DGX Spark",
    "machine": platform.machine(),
    "os": run("sh", "-c", ". /etc/os-release && echo $PRETTY_NAME"),
    "gpu": run("nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"),
    "cuda": run("sh", "-c", "nvidia-smi | grep -o 'CUDA Version: [0-9.]*'"),
    "cpu_cores": run("nproc"),
    "memory_gib": round(int(mem["MemTotal"]) / 1048576, 1),
    "docker": run("docker", "--version"),
}
open(sys.argv[1], "w").write(json.dumps(info, indent=2))
print(info)
PY

step "dataset"
if [[ ! -f "$CSV" ]]; then
  mkdir -p "$(dirname "$CSV")"
  if ! curl -fL --retry 3 "$TABFORMER_URL" | tar xz -C "$(dirname "$CSV")" card_transaction.v1.csv; then
    echo "TabFormer download failed (Git LFS quota?). Get transactions.tgz from https://ibm.box.com/v/tabformer-data" >&2
    echo "and extract card_transaction.v1.csv to $CSV" >&2
    exit 3
  fi
fi
ls -l "$CSV"

step "preprocess"
if need "$CACHE/graph/test_gnn/cases.csv"; then
  rm -rf "$CACHE/graph"
  "$ROOT/scripts/in_image.sh" preprocess_tabformer_v3.py \
    --csv "/workspace/cache/${CSV#"$CACHE"/}" --out /workspace/cache/graph \
    --stats /workspace/cache/preprocess_stats.json
fi

step "train (GraphSAGE + XGBoost)"
if need "$CACHE/train/xgboost_fraud.json"; then
  rm -rf "$CACHE/train"
  "$ROOT/scripts/train.sh"
fi

step "select studio cases"
if need "$CACHE/studio_cases.json"; then
  "$ROOT/scripts/in_image.sh" select_studio_cases.py --graph /data --out /workspace/cache/studio_cases.json
fi

step "backtest"
if need "$CACHE/backtest.json"; then
  "$ROOT/scripts/in_image.sh" backtest.py --out /workspace/cache/backtest.json
fi

step "bench (GPU vs CPU)"
if need "$CACHE/bench.json"; then
  "$ROOT/scripts/in_image.sh" bench_score.py --out /workspace/cache/bench.json
fi

step "serve on 127.0.0.1:$PORT"
FRAUD_INFER_DETACH=1 "$ROOT/scripts/serve.sh"
for _ in $(seq 1 120); do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 5
done
curl -fsS "http://127.0.0.1:$PORT/health"; echo

step "record scores"
python3 "$ROOT/scripts/record_scores.py" --url "http://127.0.0.1:$PORT"

step "model card"
python3 "$ROOT/scripts/build_model_card.py"
step "done; the scorer keeps running as container fsi-fraud-gnn"
