"""Upload validation and text-layer PDF extraction. No OCR."""
from __future__ import annotations

from pathlib import Path

MAX_UPLOAD_BYTES = 40 * 1024 * 1024
ALLOWED_SUFFIXES = {".pdf", ".html", ".htm", ".txt"}
ALLOWED_MIME = {
    "application/pdf",
    "text/html",
    "application/xhtml+xml",
    "text/plain",
    "application/octet-stream",
    "",
}


class UploadError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def suffix_for(filename: str | None, content_type: str | None = None) -> str:
    name = (filename or "").lower()
    suffix = Path(name).suffix
    if suffix in ALLOWED_SUFFIXES:
        return suffix
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime == "application/pdf":
        return ".pdf"
    if mime in {"text/html", "application/xhtml+xml"}:
        return ".html"
    if mime == "text/plain":
        return ".txt"
    raise UploadError("Upload a PDF, HTML, or TXT annual report (40 MB or less).")


def validate_upload(filename: str | None, content_type: str | None, data: bytes) -> str:
    if not data:
        raise UploadError("The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError("Upload a PDF, HTML, or TXT annual report (40 MB or less).")
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in ALLOWED_MIME:
        raise UploadError("Upload a PDF, HTML, or TXT annual report (40 MB or less).")
    return suffix_for(filename, content_type)


def extract_pdf_text(path: Path) -> str:
    try:
        import pdfplumber
    except ImportError as exc:
        raise UploadError("PDF extraction is unavailable.", 503) from exc
    pages: list[str] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    text = "\n".join(pages).replace("\x00", "").strip()
    if not text:
        raise UploadError("This PDF has no extractable text.")
    return text


def write_source(run_dir: Path, data: bytes, suffix: str, filename: str | None) -> Path:
    run_dir.mkdir(parents=True, exist_ok=True)
    target = run_dir / f"source{suffix}"
    target.write_bytes(data)
    if suffix == ".pdf":
        text = extract_pdf_text(target)
        (run_dir / "source.txt").write_text(text, encoding="utf-8")
    elif suffix in {".html", ".htm", ".txt"}:
        text = data.decode("utf-8", errors="replace")
        if suffix == ".txt":
            (run_dir / "source.txt").write_text(text, encoding="utf-8")
        if not text.strip():
            raise UploadError("The uploaded file is empty.")
    return target
