#!/usr/bin/env bash
# Sparky vLLM: Nemotron Super NVFP4 on an NVIDIA DGX Spark dev box, first in the Studio model chain for every use case.
# Official DGX Spark path: vLLM cu130-nightly + Marlin NVFP4 (not the GNN sidecar).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
IMAGE="${NEMOTRON_IMAGE:-vllm/vllm-openai:cu130-nightly}"
NAME="${NEMOTRON_NAME:-fsi-nemotron-super}"
HOST_PORT="${NEMOTRON_PORT:-8003}"
MODEL="${NEMOTRON_MODEL:-nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4}"
PARSER="$HERE/super_v3_reasoning_parser.py"
PARSER_URL="https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/raw/main/super_v3_reasoning_parser.py"

set_from_env_file() {
  local file="$1" key="$2" line value
  if [[ -n "${!key:-}" || ! -f "$file" ]]; then
    return 0
  fi
  line="$(grep -E "^${key}=" "$file" | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  export "${key}=${value}"
}

set_from_env_file "$ROOT/.env" HF_TOKEN
set_from_env_file "$HOME/enterprise-ai-sprint/.env" HF_TOKEN

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "HF_TOKEN is required to pull $MODEL from Hugging Face." >&2
  exit 1
fi

if [[ ! -s "$PARSER" ]]; then
  curl -fsSL -o "$PARSER" "$PARSER_URL"
fi

if docker inspect fsi-fraud-gnn >/dev/null 2>&1; then
  echo "Leaving fsi-fraud-gnn on :8000 untouched."
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
# Spark playbook: Marlin NVFP4 + FP8 KV. MTP hung after weight load on this box; opt in with NEMOTRON_ENABLE_MTP=1.
EXTRA_ARGS=()
if [[ "${NEMOTRON_ENABLE_MTP:-0}" == "1" ]]; then
  EXTRA_ARGS+=(--speculative_config '{"method":"mtp","num_speculative_tokens":3,"moe_backend":"triton"}')
fi
docker run -d --name "$NAME" \
  --gpus all \
  --ipc=host \
  --shm-size=16g \
  -p "127.0.0.1:${HOST_PORT}:8000" \
  -e HF_TOKEN \
  -e VLLM_NVFP4_GEMM_BACKEND=marlin \
  -e VLLM_FLASHINFER_ALLREDUCE_BACKEND=trtllm \
  -e VLLM_USE_FLASHINFER_MOE_FP4=0 \
  -e HUGGING_FACE_HUB_TOKEN="$HF_TOKEN" \
  -v "$HOME/.cache/huggingface:/root/.cache/huggingface" \
  -v "$PARSER:/app/super_v3_reasoning_parser.py:ro" \
  "$IMAGE" \
  --model "$MODEL" \
  --served-model-name "$MODEL" \
  --host 0.0.0.0 \
  --port 8000 \
  --async-scheduling \
  --dtype auto \
  --kv-cache-dtype fp8 \
  --tensor-parallel-size 1 \
  --pipeline-parallel-size 1 \
  --data-parallel-size 1 \
  --trust-remote-code \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder \
  --gpu-memory-utilization 0.78 \
  --enable-chunked-prefill \
  --max-num-seqs 2 \
  --max-model-len 16384 \
  --max-num-batched-tokens 16384 \
  --moe-backend marlin \
  --mamba_ssm_cache_dtype float32 \
  --quantization fp4 \
  --reasoning-parser-plugin /app/super_v3_reasoning_parser.py \
  --reasoning-parser super_v3 \
  "${EXTRA_ARGS[@]}"

echo "Nemotron Super starting on http://127.0.0.1:${HOST_PORT}/v1"
echo "Logs: docker logs -f $NAME"
echo "Ready when: curl -sf http://127.0.0.1:${HOST_PORT}/v1/models"
