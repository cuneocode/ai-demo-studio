FROM node:22.22.0-bookworm-slim AS ui
WORKDIR /ui
COPY demo/ui/package.json demo/ui/package-lock.json ./
RUN --mount=type=secret,id=studio_ca,required=false NODE_EXTRA_CA_CERTS=/run/secrets/studio_ca npm ci --no-audit --no-fund
COPY demo/ui ./
RUN npm run build

FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
COPY --from=ghcr.io/astral-sh/uv:0.11.23 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_NO_CACHE=1 UV_CONCURRENT_INSTALLS=2 UV_CONCURRENT_DOWNLOADS=4 UV_CONCURRENT_BUILDS=1 \
    PATH=/opt/venv/bin:$PATH \
    OTEL_INSTRUMENTATION_A2A_SDK_ENABLED=false

WORKDIR /app
COPY pyproject.toml uv.lock ./
# xds-protos ships an older copy of opentelemetry/proto; restore the exporter's version.
RUN --mount=type=secret,id=studio_ca,required=false if [ -f /run/secrets/studio_ca ]; then export SSL_CERT_FILE=/run/secrets/studio_ca; fi; uv sync --frozen --no-dev --no-install-project \
    && uv pip install --reinstall --no-deps opentelemetry-proto==1.45.0 \
    && rm -rf /root/.cache/uv

COPY lab ./lab
COPY bank_a ./bank_a
COPY bank_b ./bank_b
COPY policy ./policy
COPY demo/__init__.py demo/server.py demo/sources.py ./demo/
COPY tools ./tools
COPY --from=ui /ui/dist ./demo/ui/dist

USER 10001:10001
ENTRYPOINT ["python", "-m"]
