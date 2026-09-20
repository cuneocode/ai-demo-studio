from pathlib import Path

import pytest
from pypdf import PdfWriter

import documents


def test_rejects_bad_type_and_oversize():
    with pytest.raises(documents.UploadError):
        documents.validate_upload("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", b"abc")
    with pytest.raises(documents.UploadError):
        documents.validate_upload("huge.pdf", "application/pdf", b"x" * (documents.MAX_UPLOAD_BYTES + 1))
    with pytest.raises(documents.UploadError):
        documents.validate_upload("empty.txt", "text/plain", b"")
    assert documents.validate_upload("10k.html", "text/html", b"<html>ok</html>") == ".html"


def test_empty_pdf_has_clear_error(tmp_path):
    path = tmp_path / "blank.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(path)
    with pytest.raises(documents.UploadError) as exc:
        documents.extract_pdf_text(path)
    assert "no extractable text" in str(exc.value)


def test_write_source_html(tmp_path):
    target = documents.write_source(tmp_path, b"<html>Item 1</html>", ".html", "report.html")
    assert target.name == "source.html"
    assert target.read_text() == "<html>Item 1</html>"
