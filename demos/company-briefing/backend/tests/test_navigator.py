from pathlib import Path

import navigator

FIXTURES = Path(__file__).parent / "fixtures"


def test_toc_splits_items_and_titled_subnodes(tmp_path):
    source = tmp_path / "source.html"
    source.write_text((FIXTURES / "filing.html").read_text(), encoding="utf-8")
    toc = navigator.build_filing_toc(tmp_path, {"source": "edgar", "url": "https://www.sec.gov/Archives/example.htm"})
    items = {node["item"] for node in toc["nodes"]}
    assert {"1", "1A", "1C", "7", "8"} <= items
    titles = {node["title"] for node in toc["nodes"]}
    assert "Cybersecurity Risk" in titles
    assert "Credit Risk" in titles
    cyber = next(node for node in toc["nodes"] if node["title"] == "Cybersecurity Risk")
    body = navigator.node_body(tmp_path, cyber["id"])
    assert "cyber attack could materially affect" in body
    assert "https://www.sec.gov/Archives/example.htm#" in cyber["source_url"]
    assert (tmp_path / "toc.json").is_file()


def test_upload_nodes_use_upload_citation(tmp_path):
    (tmp_path / "source.txt").write_text("Item 1. Business\nWe lend to companies.\n", encoding="utf-8")
    toc = navigator.build_filing_toc(tmp_path, {"source": "upload", "filename": "report.txt"})
    assert toc["nodes"]
    assert toc["nodes"][0]["source_url"].startswith("upload:report.txt#")
