# Build from the repository root. Each service retains its own frozen environment.
FROM ghcr.io/astral-sh/uv:0.11.23 AS uv
FROM python:3.12.12-slim-bookworm
COPY --from=uv /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates libgomp1 && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home studio && mkdir -p /opt/venv && chown studio:studio /opt/venv
ARG SERVICE=wealth
ARG SOURCE_DIR=services/${SERVICE}
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy UV_NO_CACHE=1 \
    UV_CONCURRENT_INSTALLS=2 UV_CONCURRENT_DOWNLOADS=4 UV_CONCURRENT_BUILDS=1 \
    PATH=/opt/venv/bin:$PATH UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /app/services/${SERVICE}
COPY --chown=10001:10001 ${SOURCE_DIR}/pyproject.toml ${SOURCE_DIR}/uv.lock ./
RUN mkdir -p .cache && chown studio:studio . .cache
USER studio
RUN --mount=type=secret,id=studio_ca,uid=10001,gid=10001,required=false \
    if [ -f /run/secrets/studio_ca ]; then export SSL_CERT_FILE=/run/secrets/studio_ca; fi; \
    uv sync --frozen --no-dev --no-install-project
COPY --chown=10001:10001 ${SOURCE_DIR}/ ./
COPY --chown=10001:10001 services/common/ /app/services/common/
COPY --chown=10001:10001 services/llm/studio_models.py /app/services/llm/studio_models.py
COPY --chown=10001:10001 config/studio-models.default.json /app/config/studio-models.default.json
COPY --chown=10001:10001 fixtures/ /app/fixtures/
ENV STUDIO_CONTAINER=1 STUDIO_MODELS_FILE=/run/studio/models/models.json \
    SSL_CERT_FILE=/run/studio/ca.pem REQUESTS_CA_BUNDLE=/run/studio/ca.pem
EXPOSE 8000
STOPSIGNAL SIGTERM
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "15"]
