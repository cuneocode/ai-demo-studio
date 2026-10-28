"""Theme specialists. The supervisor never reads filing nodes."""
from __future__ import annotations

from tools import metrics_tools, theme_tools

THEME_NAMES = ("objectives", "risks", "regulatory", "ai_initiatives", "metrics")

_SHARED = """You are a filing specialist. You answer only from nodes you read under /filings/.
Do not browse the web. Do not use execute or a shell. Do not invent facts.
Workflow: list_filing_toc, then read_filing_node for at most 8 titled nodes.
Every extracted fact MUST include a verbatim excerpt copied from the node file.
If the excerpt would not appear in the node, omit the fact.
Write /filings/notes/{theme}.json with:
{{"status": "extracted"|"abstain", "reason": null or string, "facts": [
  {{"text": "...", "item": "1A", "node_id": "...", "excerpt": "verbatim from the node", "source_url": "..."}}
]}}
Grep is a discovery fallback, not the primary map. Prefer TOC titles.
Do not read the entire Item 1A as one blob.
"""

OBJECTIVES_PROMPT = _SHARED.format(theme="objectives") + """
Theme: key business objectives.
Prefer Item 1 / Item 4 / strategy subsections. Abstain if none are stated.
"""

RISKS_PROMPT = _SHARED.format(theme="risks") + """
Theme: material risks.
Prefer Item 1A / Item 3 / Item 3D. Capture distinct titled risks, not a dump of Item 1A.
"""

REGULATORY_PROMPT = _SHARED.format(theme="regulatory") + """
Theme: regulatory obligations and supervision.
Look for banking, securities, privacy, capital, or similar obligations in Item 1, 1A, 1C, or MD&A.
"""

AI_PROMPT = _SHARED.format(theme="ai_initiatives") + """
Theme: strategic initiatives related to AI.
Search TOC titles and grep for AI, machine learning, generative, or model risk.
If the filing never mentions AI, abstain. Do not infer AI from generic "digital" language alone.
"""

METRICS_PROMPT = """You extract key metrics using get_company_facts only.
Do not compute, convert, or invent figures. Do not call read_filing_node.
If a CIK is available, call get_company_facts(cik, fy) and write /filings/notes/metrics.json
from that JSON (origin=xbrl).
If there is no CIK, you may record verbatim-table metrics only when a table number
appears as an excerpt in /filings/; otherwise mark origin=absent.
Write /filings/notes/metrics.json as {"items": [...]}.
"""


def _permissions(kind: str):
    try:
        from deepagents import FilesystemPermission
    except Exception:
        try:
            from deepagents.middleware.filesystem import FilesystemPermission
        except Exception:
            return None
    if kind == "theme":
        return [
            FilesystemPermission(operations=["read"], paths=["/filings/**"], mode="allow"),
            FilesystemPermission(operations=["write"], paths=["/filings/notes/**"], mode="allow"),
            FilesystemPermission(operations=["write"], paths=["/filings/**"], mode="deny"),
        ]
    return [
        FilesystemPermission(operations=["read"], paths=["/filings/meta.json", "/filings/facts.json", "/filings/notes/**"], mode="allow"),
        FilesystemPermission(operations=["read"], paths=["/filings/nodes/**"], mode="deny"),
        FilesystemPermission(operations=["write"], paths=["/filings/notes/**"], mode="allow"),
        FilesystemPermission(operations=["write"], paths=["/filings/**"], mode="deny"),
    ]


def _spec(name: str, description: str, prompt: str, tools, kind: str = "theme") -> dict:
    spec = {
        "name": name,
        "description": description,
        "system_prompt": prompt,
        "tools": tools,
    }
    permissions = _permissions(kind)
    if permissions:
        spec["permissions"] = permissions
    return spec


def theme_subagents(model=None) -> list[dict]:
    specs = [
        _spec(
            "objectives",
            "Extract key business objectives from titled filing nodes. Cite or abstain.",
            OBJECTIVES_PROMPT,
            theme_tools("objectives"),
        ),
        _spec(
            "risks",
            "Extract material risks from titled Item 1A (or 20-F risk) nodes. Cite or abstain.",
            RISKS_PROMPT,
            theme_tools("risks"),
        ),
        _spec(
            "regulatory",
            "Extract regulatory obligations from titled filing nodes. Cite or abstain.",
            REGULATORY_PROMPT,
            theme_tools("regulatory"),
        ),
        _spec(
            "ai_initiatives",
            "Extract AI initiatives if the filing mentions AI; otherwise abstain.",
            AI_PROMPT,
            theme_tools("ai_initiatives"),
        ),
        _spec(
            "metrics",
            "Return XBRL companyfacts metrics only. Never invent or compute figures.",
            METRICS_PROMPT,
            metrics_tools(),
            kind="metrics",
        ),
    ]
    if model is not None:
        for spec in specs:
            spec["model"] = model
    return specs
