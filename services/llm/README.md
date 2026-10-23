# Shared model routing and optional GPU hosting

`studio_models.py` resolves the Studio model chain, per-use-case overrides, and
egress policy for Python services. Most engineers can use a hosted API or an
existing OpenAI-compatible server. That path requires no GPU on the Studio host.
See [configuration](../../docs/CONFIGURATION.md#model-backends).

## Optional DGX Spark vLLM server

The included `serve.sh` and Compose recipe target a Linux ARM64 NVIDIA DGX Spark
GB10 host with NVIDIA-enabled Docker. The default model is
`nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4`. The recipe uses 16 GB shared
memory, a Hugging Face cache volume, and port 8003. Model weights and inference
memory are additional to the Studio's requirements; no minimum capacity for other
GPU models has been established by this repo.

On your GPU host, configure `HF_TOKEN` in the shell or this checkout's root `.env`,
then run from the repository root:

```sh
bash services/llm/serve.sh
curl -fsS http://127.0.0.1:8003/v1/models
docker logs -f fsi-nemotron-super
```

The script replaces its named model container and downloads missing model assets.
Defaults are configurable with `NEMOTRON_IMAGE`, `NEMOTRON_NAME`,
`NEMOTRON_MODEL`, and `NEMOTRON_PORT`. The default image is a rolling CUDA nightly;
record and pin a tested image digest when reproducing a specific deployment.

For a separate Studio machine, create your own SSH host configuration and tunnel:

```sh
ssh -N -L 8003:127.0.0.1:8003 user@gpu-host
```

In Studio settings select a vLLM provider with base URL
`http://127.0.0.1:8003/v1`, the served model name, and Chat Completions support.
The legacy `SPARKY_VLLM_BASE_URL` variable can initialize the same route. The
name `sparky-vllm` in committed defaults is a provider ID and does not require
an SSH alias named Sparky.

Stop the model container on its host with:

```sh
docker stop fsi-nemotron-super
```

Interbank containers reach host-loopback endpoints through `host.docker.internal`.
On Linux the endpoint must also listen on the Docker bridge address. See the
[interbank guide](../interbank/README.md) before using a tunneled model with the lab.

## Fraud scoring is a separate service

The fraud GNN scorer listens on port 8000 and uses its own training artifacts and
container. Model hosting on port 8003 does not provide GNN scores. Follow the
[fraud guide](../fraud/README.md) for its GPU pipeline and disk requirements.
Stop the large model before training on a shared-memory GB10 host.

## Tests

From the root after installing the wealth environment:

```sh
npm run platform:test
```
