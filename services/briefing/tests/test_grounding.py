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


def test_table_metric_value_must_match_its_own_excerpt(tmp_path):
    line = "Revenue                                   $ 4,112.6    $ 2,905.0"
    (tmp_path / "source.txt").write_text(f"Income statement\n{line}\n", encoding="utf-8")
    briefing = {"metrics": [
        {"label": "Revenue", "value": 4112.6, "origin": "verbatim-table", "excerpt": line},
        # A real line from the filing cannot vouch for a number it does not contain.
        {"label": "Revenue", "value": 5000.0, "origin": "verbatim-table", "excerpt": line},
    ]}
    result = grounding.ground_briefing(briefing, tmp_path, [])
    assert [m["value"] for m in result["metrics"]] == [4112.6]
    assert result["grounding"]["dropped_metrics"] == 1


def test_xbrl_per_share_values_must_match_to_the_cent(tmp_path):
    facts = [{"label": "Diluted EPS", "value": 19.75, "concept": "EarningsPerShareDiluted"}]
    rounded = {"metrics": [{"label": "Diluted EPS", "value": 19.0, "concept": "EarningsPerShareDiluted", "origin": "xbrl"}]}
    result = grounding.ground_briefing(rounded, tmp_path, facts)
    assert result["grounding"]["dropped_metrics"] == 1
    assert result["metrics"] == [{**facts[0], "origin": "xbrl"}]


def test_whitespace_normalized_excerpt_matches():
    assert grounding.excerpt_in_text("cyber   attack\ncould", "A cyber attack could materially affect")
    assert not grounding.excerpt_in_text("totally invented", "A cyber attack could materially affect")
