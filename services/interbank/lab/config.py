from __future__ import annotations

import os
from pathlib import Path


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if not value:
        raise RuntimeError(f"Required setting {name} is missing")
    return value


def secret_file(path_env: str) -> str:
    value = Path(env(path_env)).read_text(encoding="utf-8").strip()
    if not value:
        raise RuntimeError(f"Secret file referenced by {path_env} is empty")
    return value


ORGANIZATION = os.getenv("ORGANIZATION", "lab")
SERVICE_NAME = os.getenv("SERVICE_NAME", ORGANIZATION)
