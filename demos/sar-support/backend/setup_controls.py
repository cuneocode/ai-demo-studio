"""Explicit administrative operation: create and bind ONLY the SAR investigation controls.

Run manually after reviewing controls.definitions(). Normal service startup never runs
this script. Existing controls are never overwritten; unrelated controls are untouched.
"""
import asyncio
import os
from pathlib import Path

import httpx
import truststore
from dotenv import load_dotenv

truststore.inject_into_ssl()
load_dotenv(next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / ".env")
from controls import definitions, server_url  # noqa: E402


async def main():
    from agent_control_models import ControlDefinition
    from galileo.log_streams import LogStreams
    stream = LogStreams().get(name=os.environ["GALILEO_LOG_STREAM"], project_name=os.environ["GALILEO_PROJECT"])
    async with httpx.AsyncClient(base_url=server_url(), headers={"Galileo-API-Key": os.environ["GALILEO_API_KEY"]}, timeout=30) as client:
        for name, data in definitions().items():
            listing = await client.get("/api/v1/controls", params={"name": name, "include_attachments": "true"})
            listing.raise_for_status()
            found = [c for c in listing.json()["controls"] if c["name"] == name]
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
            print(f"Bound {name} (control {control_id}) to {os.environ['GALILEO_LOG_STREAM']}")


if __name__ == "__main__":
    asyncio.run(main())
