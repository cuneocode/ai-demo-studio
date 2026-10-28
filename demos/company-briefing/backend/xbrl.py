"""Deterministic metrics from SEC companyfacts. The LLM does not compute figures."""
from __future__ import annotations

from edgar import load_company_facts, pad_cik

CONCEPTS: list[tuple[str, tuple[str, ...]]] = [
    ("Revenue", (
        "Revenues",
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "SalesRevenueNet",
        "TurnoverRevenue",
    )),
    ("Net income", (
        "NetIncomeLoss",
        "ProfitLoss",
        "NetIncomeLossAvailableToCommonStockholdersBasic",
    )),
    ("Assets", ("Assets",)),
    ("Liabilities", ("Liabilities",)),
    ("Stockholders' equity", (
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
        "Equity",
    )),
]

ANNUAL_FORMS = {"10-K", "20-F", "40-F", "10-K/A", "20-F/A", "40-F/A"}


def _units(concept: dict) -> list[tuple[str, dict]]:
    rows = []
    for unit, facts in (concept.get("units") or {}).items():
        if not isinstance(facts, list):
            continue
        for fact in facts:
            if isinstance(fact, dict):
                rows.append((unit, fact))
    return rows


def _score(fact: dict, *, fy: int | None, accession: str | None) -> tuple:
    form = fact.get("form") or ""
    annual = form in ANNUAL_FORMS
    fp = (fact.get("fp") or "").upper()
    fact_fy = fact.get("fy")
    accn = fact.get("accn") or ""
    return (
        0 if accession and accn == accession else 1,
        0 if fy is not None and fact_fy == fy else 1,
        0 if fp == "FY" else 1,
        0 if annual else 1,
        0 if form in {"10-K", "20-F", "40-F"} else 1,
        -(fact_fy or 0),
    )


def _pick(concept: dict, *, fy: int | None, accession: str | None) -> tuple[str, dict] | None:
    ranked = sorted(_units(concept), key=lambda item: _score(item[1], fy=fy, accession=accession))
    if not ranked:
        return None
    unit, fact = ranked[0]
    if fy is not None and fact.get("fy") not in {fy, None} and fact.get("form") not in ANNUAL_FORMS:
        return None
    if fy is not None and fact.get("fy") not in {fy, None}:
        # Still accept FY match via period end year when `fy` is missing.
        end = str(fact.get("end") or "")
        if not end.startswith(str(fy)):
            return None
    return unit, fact


def extract_metrics(payload: dict, *, fy: int | None = None, accession: str | None = None) -> list[dict]:
    facts = payload.get("facts") or {}
    namespaces = []
    for key in ("us-gaap", "ifrs-full"):
        if key in facts:
            namespaces.append(facts[key])
    for value in facts.values():
        if value not in namespaces and isinstance(value, dict):
            namespaces.append(value)

    metrics = []
    for label, aliases in CONCEPTS:
        chosen = None
        for namespace in namespaces:
            for concept_name in aliases:
                concept = namespace.get(concept_name)
                if not isinstance(concept, dict):
                    continue
                picked = _pick(concept, fy=fy, accession=accession)
                if not picked:
                    continue
                unit, fact = picked
                chosen = {
                    "label": label,
                    "value": fact.get("val"),
                    "unit": unit,
                    "period": fact.get("end") or fact.get("instant"),
                    "concept": concept_name,
                    "accession": fact.get("accn"),
                    "form": fact.get("form"),
                    "fy": fact.get("fy"),
                    "origin": "xbrl",
                }
                break
            if chosen:
                break
        if chosen and chosen.get("value") is not None:
            metrics.append(chosen)
    return metrics


def get_company_facts(cik: str, fy: int | None = None, accession: str | None = None, *, refresh: bool = False) -> list[dict]:
    payload = load_company_facts(pad_cik(cik), refresh=refresh)
    return extract_metrics(payload, fy=fy, accession=accession)
