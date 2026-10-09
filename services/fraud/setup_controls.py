"""Explicit administrative operation: create and bind ONLY the fraud triage controls (controls.definitions()).

    cd services/fraud && .venv/bin/python setup_controls.py

Run after reviewing the definitions. Normal service startup never runs this. Existing controls with the
same name must match exactly or the script refuses to overwrite them; unrelated controls are untouched.
"""
import asyncio
import os
from pathlib import Path

import httpx
import truststore
from dotenv import load_dotenv

truststore.inject_into_ssl()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from controls import definitions, server_url  # noqa: E402


async def main() -> None:
    from agent_control_models import ControlDefinition
    from galileo.log_streams import LogStreams

    stream = LogStreams().get(name=os.environ["GALILEO_LOG_STREAM"], project_name=os.environ["GALILEO_PROJECT"])
    async with httpx.AsyncClient(base_url=server_url(), headers={"Galileo-API-Key": os.environ["GALILEO_API_KEY"]}, timeout=30) as client:
        for name, data in definitions().items():
            listing = await client.get("/api/v1/controls", params={"name": name, "include_attachments": "true"})
            listing.raise_for_status()
            found = [row for row in listing.json()["controls"] if row["name"] == name]
            if found:
                control_id = found[0]["id"]
                current = await client.get(f"/api/v1/controls/{control_id}")
                current.raise_for_status()
                if ControlDefinition.model_validate(current.json()["data"]) != ControlDefinition.model_validate(data):
                    raise RuntimeError(f"Existing control {name} differs; refusing to overwrite it.")
            else:
                validated = await client.post("/api/v1/controls/validate", json={"data": data})
                validated.raise_for_status()
                created = await client.put("/api/v1/controls", json={"name": name, "data": data})
                created.raise_for_status()
                control_id = created.json()["control_id"]
            binding = await client.put("/api/v1/control-bindings/by-key", json={
                "target_type": "log_stream", "target_id": str(stream.id), "control_id": control_id, "enabled": True})
            binding.raise_for_status()
            print(f"Bound {name} (control {control_id}) to the configured log stream")


if __name__ == "__main__":
    asyncio.run(main())
