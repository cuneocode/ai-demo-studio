FROM node:22.22.0-bookworm-slim AS ui
WORKDIR /ui
COPY demo/ui/package.json demo/ui/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY demo/ui ./
RUN npm run build

FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    OTEL_INSTRUMENTATION_A2A_SDK_ENABLED=false

RUN python -m pip install --no-cache-dir uv==0.9.27

WORKDIR /app
COPY pyproject.toml uv.lock ./
# xds-protos ships an older copy of opentelemetry/proto; restore the exporter's version.
RUN uv sync --frozen --no-dev --no-install-project \
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
