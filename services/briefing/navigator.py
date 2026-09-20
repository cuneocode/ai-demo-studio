"""Filing table of contents: titled nodes, not a blob dump."""
from __future__ import annotations

import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

TARGET_ITEMS = {"1", "1A", "1C", "7", "8", "3", "3D", "4", "5", "18"}
ITEM_RE = re.compile(
    r"(?im)^\s*(?:item\s+)(\d{1,2}[A-Z]?)\s*[.\-–—:]?\s*([^\n]{0,160})"
)
SUBHEAD_RE = re.compile(r"(?im)^\s{0,3}(?:#{1,4}\s+)?([A-Z][A-Za-z0-9 ,/'&()%-]{6,80})\s*$")
WINDOW = 4000
NODE_LIMIT = 8000


def html_to_text(raw: str) -> str:
    soup = BeautifulSoup(raw, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for tag in soup.find_all(["p", "div", "h1", "h2", "h3", "h4", "h5", "tr", "li", "table"]):
        tag.append("\n")
    return _normalize_text(soup.get_text("\n"))


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (slug[:48] or "node")


def source_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() in {".html", ".htm"}:
        return html_to_text(raw)
    return _normalize_text(raw)


def _item_slices(text: str) -> list[tuple[str, str, str]]:
    matches = list(ITEM_RE.finditer(text))
    if not matches:
        return []
    slices = []
    for index, match in enumerate(matches):
        item = match.group(1).upper()
        title = (match.group(2) or "").strip() or f"Item {item}"
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if item in TARGET_ITEMS or not slices:
            slices.append((item, title, body))
    preferred = [row for row in slices if row[0] in TARGET_ITEMS]
    return preferred or slices


def _subnodes(item: str, title: str, body: str) -> list[tuple[str, str, str]]:
    matches = [match for match in SUBHEAD_RE.finditer(body) if match.start() > 0]
    if len(matches) < 1:
        return [(item, title, body)]
    parts = []
    first = body[: matches[0].start()].strip()
    if first and len(first) > 80:
        parts.append((item, title, first))
    for index, match in enumerate(matches):
        heading = match.group(1).strip()
        if re.match(r"(?i)^item\s+\d", heading):
            continue
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        chunk = body[start:end].strip()
        if len(chunk) < 40:
            continue
        parts.append((item, heading, chunk))
    return parts or [(item, title, body)]


def _windows(text: str) -> list[tuple[str, str, str]]:
    blocks = [block.strip() for block in re.split(r"\n{2,}", text) if block.strip()]
    if not blocks:
        return [("filing", "Filing", text[:NODE_LIMIT])]
    nodes = []
    buf = ""
    index = 1
    for block in blocks:
        if buf and len(buf) + len(block) > WINDOW:
            nodes.append(("filing", f"Section {index}", buf.strip()))
            index += 1
            buf = block
        else:
            buf = f"{buf}\n\n{block}" if buf else block
    if buf.strip():
        nodes.append(("filing", f"Section {index}", buf.strip()))
    return nodes


def citation_url(meta: dict, node_id: str) -> str:
    if meta.get("source") == "upload":
        filename = meta.get("filename") or "upload"
        return f"upload:{filename}#{node_id}"
    url = meta.get("url") or ""
    return f"{url}#{node_id}" if url else f"#{node_id}"


def build_filing_toc(run_dir: Path, meta: dict | None = None) -> dict:
    meta = dict(meta or {})
    source = _find_source(run_dir)
    if source is None:
        raise FileNotFoundError("No filing source is staged at /filings/.")
    text = source_text(source)
    slices = _item_slices(text)
    parts = []
    for item, title, body in slices:
        parts.extend(_subnodes(item, title, body))
    if not parts:
        parts = _windows(text)

    nodes_dir = run_dir / "nodes"
    nodes_dir.mkdir(parents=True, exist_ok=True)
    nodes = []
    seen: set[str] = set()
    for item, title, body in parts:
        node_id = f"item-{slugify(item)}-{slugify(title)}"
        original = node_id
        n = 2
        while node_id in seen:
            node_id = f"{original}-{n}"
            n += 1
        seen.add(node_id)
        clipped = body[:NODE_LIMIT]
        url = citation_url(meta, node_id)
        md = (
            f"---\nid: {node_id}\ntitle: {title}\nitem: {item}\n"
            f"source_url: {url}\n---\n\n{clipped}\n"
        )
        rel = f"nodes/{node_id}.md"
        (run_dir / rel).write_text(md, encoding="utf-8")
        nodes.append({
            "id": node_id,
            "title": title,
            "item": item,
            "chars": len(clipped),
            "path": f"/filings/{rel}",
            "source_url": url,
        })
    toc = {"source": str(source.name), "source_url": meta.get("url"), "nodes": nodes}
    (run_dir / "toc.json").write_text(json.dumps(toc, indent=2), encoding="utf-8")
    return toc


def _find_source(run_dir: Path) -> Path | None:
    for name in ("source.txt", "source.html", "source.htm"):
        path = run_dir / name
        if path.is_file():
            return path
    return None


def node_body(run_dir: Path, node_id: str) -> str:
    path = run_dir / "nodes" / f"{node_id}.md"
    if not path.is_file():
        raise FileNotFoundError(f"Unknown filing node: {node_id}")
    return path.read_text(encoding="utf-8")
