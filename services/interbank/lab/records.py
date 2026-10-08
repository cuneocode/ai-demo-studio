"""Each bank's settlement records: a SQLite database the agent can only read."""

from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path

from langchain_core.tools import StructuredTool

from lab.config import ORGANIZATION
from lab.events import emit

MAX_ROWS = 50


class BankRecords:
    def __init__(self, seed_sql: Path, bank: str) -> None:
        self.bank = bank
        self.seed_sql = seed_sql
        self.path = Path("/tmp") / f"{bank.lower().replace(' ', '_')}.db"
        self.path.unlink(missing_ok=True)
        with sqlite3.connect(self.path) as db:
            db.executescript(seed_sql.read_text(encoding="utf-8"))

    def schema(self) -> str:
        with self._connect() as db:
            rows = db.execute("SELECT sql FROM sqlite_master WHERE type='table'").fetchall()
        return "\n".join(row[0] + ";" for row in rows)

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(f"file:{self.path}?mode=ro", uri=True, check_same_thread=False)
        db.execute("PRAGMA query_only = ON")
        return db

    async def query(self, sql: str) -> str:
        statement = sql.strip().rstrip(";")
        if ";" in statement or not re.match(r"(?is)^\s*(select|with)\b", statement):
            result = "Rejected: only a single read-only SELECT statement is allowed."
        else:
            try:
                with self._connect() as db:
                    cursor = db.execute(statement)
                    columns = [c[0] for c in cursor.description or []]
                    rows = [dict(zip(columns, r, strict=True)) for r in cursor.fetchmany(MAX_ROWS)]
                result = json.dumps(rows, ensure_ascii=False)
            except sqlite3.Error as exc:
                result = f"SQL error: {exc}"
        await emit("", "db.query", f"{self.bank} database query",
                   target=f"{ORGANIZATION}-records", body=statement, data={"result": result})
        return result

    def tool(self) -> StructuredTool:
        return StructuredTool.from_function(
            coroutine=self.query,
            name="query_settlement_records",
            description=(
                f"Run one read-only SQL SELECT against {self.bank}'s settlement operations "
                "database (SQLite). Returns up to 50 rows as JSON."
            ),
        )
