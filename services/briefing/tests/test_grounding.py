from pathlib import Path

import grounding
import navigator

FIXTURES = Path(__file__).parent / "fixtures"


def _run_dir(tmp_path: Path) -> Path:
    (tmp_path / "source.html").write_text((FIXTURES / "filing.html").read_text(), encoding="utf-8")
    navigator.build_filing_toc(tmp_path, {"source": "edgar", "url": "https://www.sec.gov/x"})
    return tmp_path


def test_drops_ungrounded_facts_and_keeps_verbatim(tmp_path):
    run_dir = _run_dir(tmp_path)
    cyber = next(node for node in __import__("json").loads((run_dir / "toc.json").read_text())["nodes"] if node["title"] == "Cybersecurity Risk")
    briefing = {
        "objectives": {"status": "extracted", "facts": [
            {
                "text": "Digital platforms",
                "item": "1",
                "node_id": next(n["id"] for n in __import__("json").loads((run_dir / "toc.json").read_text())["nodes"] if n["title"] == "Our Strategy"),
                "excerpt": "Expand digital platforms for retail customers",
                "source_url": "https://www.sec.gov/x",
            },
            {
                "text": "Hallucinated moon colony",
                "item": "1",
                "node_id": cyber["id"],
                "excerpt": "We are building a lunar branch",
                "source_url": "https://www.sec.gov/x",
            },
        ]},
        "risks": {"status": "extracted", "facts": []},
        "regulatory": {"status": "extracted", "facts": []},
        "ai_initiatives": {"status": "extracted", "facts": [
            {"text": "AI trading", "item": "1", "node_id": cyber["id"], "excerpt": "not in the filing", "source_url": ""},
        ]},
        "metrics": [
            {"label": "Revenue", "value": 169430000000, "concept": "Revenues", "origin": "xbrl"},
            {"label": "Revenue", "value": 1, "concept": "Revenues", "origin": "xbrl"},
        ],
    }
    facts = [{"label": "Revenue", "value": 169430000000, "concept": "Revenues"}]
    result = grounding.ground_briefing(briefing, run_dir, facts)
    assert len(result["objectives"]["facts"]) == 1
    assert result["objectives"]["status"] == "extracted"
    assert result["ai_initiatives"]["status"] == "abstain"
    assert result["grounding"]["dropped_facts"] >= 2
    assert len(result["metrics"]) == 1
    assert result["metrics"][0]["value"] == 169430000000


def test_whitespace_normalized_excerpt_matches():
    assert grounding.excerpt_in_text("cyber   attack\ncould", "A cyber attack could materially affect")
    assert not grounding.excerpt_in_text("totally invented", "A cyber attack could materially affect")
