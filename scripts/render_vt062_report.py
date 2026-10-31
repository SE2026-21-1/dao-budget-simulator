#!/usr/bin/env python3
"""Render the VT-062 Markdown report with a separately paginated appendix."""

import hashlib
import io
import re
from pathlib import Path

import fitz
import markdown
from pypdf import PdfReader, PdfWriter
from weasyprint import CSS, HTML


ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs/individual/23001841-vt062"
REPORT = DOC / "BT3_23001841_VT-062.md"
OUTPUT = DOC / "BT3_23001841_VT-062.pdf"
AI_LOG = DOC / "AI-usage-log.md"
VALIDATION = ROOT / "docs/evidence/vt062/pdf-validation.txt"
APPENDIX_MARKER = "<!-- APPENDIX -->"
AI_START = "<!-- AI_USAGE_LOG_START -->"
AI_END = "<!-- AI_USAGE_LOG_END -->"


def sync_ai_log(source: str) -> str:
    log = AI_LOG.read_text()
    shifted = []
    for line in log.splitlines():
        match = re.match(r"^(#{1,5})\s+(.*)$", line)
        shifted.append("#" * min(len(match.group(1)) + 2, 6) + " " + match.group(2) if match else line)
    return source.split(AI_START)[0] + AI_START + "\n\n" + "\n".join(shifted).strip() + "\n\n" + AI_END + source.split(AI_END, 1)[1]


CSS_TEXT = r"""
@font-face { font-family: DejaVu; src: url(file:///usr/share/fonts/truetype/dejavu/DejaVuSans.ttf); }
@font-face { font-family: DejaVu; font-weight: 700; src: url(file:///usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf); }
@font-face { font-family: DejaVuMono; src: url(file:///usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf); }
@page {
  size: A4; margin: 16mm 15mm 17mm 15mm;
  @top-right { content: "BT3 · VT-062"; font: 8pt DejaVu; color: #536273; }
  @bottom-right { content: counter(page); font: 8pt DejaVu; color: #536273; }
}
html { font-family: DejaVu, sans-serif; color: #182536; }
body { font-size: 10.7pt; line-height: 1.4; }
h1 { font-size: 18pt; line-height: 1.2; margin: 0 0 11pt; color: #102a48; }
h2 { font-size: 13pt; margin: 15pt 0 5pt; color: #123e64; break-after: avoid; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; color: #123e64; break-after: avoid; }
h4, h5, h6 { font-size: 10pt; margin: 10pt 0 3pt; break-after: avoid; }
p { margin: 0 0 6pt; orphans: 2; widows: 2; }
ul, ol { margin: 0 0 7pt 17pt; padding: 0; }
li { margin: 0 0 3pt; }
blockquote { margin: 8pt 0 9pt; padding: 7pt 9pt; border-left: 3pt solid #3f779c; background: #eef4f8; }
blockquote p:last-child { margin-bottom: 0; }
table { border-collapse: collapse; width: 100%; margin: 5pt 0 10pt; table-layout: fixed; font-size: 9.1pt; line-height: 1.28; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 0.5pt solid #b8c5cf; padding: 3.1pt 3.6pt; vertical-align: top; overflow-wrap: anywhere; }
th { background: #e4eef5; font-weight: 700; }
tr:nth-child(even) td { background: #f8fafc; }
code, pre { font-family: DejaVuMono, monospace; font-size: 8.7pt; overflow-wrap: anywhere; }
pre { white-space: pre-wrap; padding: 6pt; background: #f2f5f7; border: 0.5pt solid #d7e0e6; }
a { color: #155681; text-decoration: none; overflow-wrap: anywhere; }
strong { font-weight: 700; }
.page-break { break-before: page; }
.appendix body { font-size: 9.5pt; }
.appendix h1 { break-before: page; }
.appendix h1:first-child { break-before: auto; }
"""


def to_pdf(text: str, appendix: bool) -> bytes:
    body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    class_name = "appendix" if appendix else "main"
    html = f'<!doctype html><html class="{class_name}" lang="vi"><meta charset="utf-8"><body>{body}</body></html>'
    return HTML(string=html, base_url=str(DOC)).write_pdf(stylesheets=[CSS(string=CSS_TEXT)])


def main() -> None:
    source = REPORT.read_text()
    assert APPENDIX_MARKER in source and AI_START in source and AI_END in source
    synced = sync_ai_log(source)
    if synced != source:
        REPORT.write_text(synced)
    main_text, appendix_text = synced.split(APPENDIX_MARKER, 1)
    reflection = main_text.split("## 7. Reflection", 1)[1]
    reflection_words = len(reflection.split("\n", 1)[1].split())
    if not 250 <= reflection_words <= 350:
        raise ValueError(f"Reflection word count outside 250–350: {reflection_words}")
    main_pdf = to_pdf(main_text, False)
    appendix_pdf = to_pdf(appendix_text, True)
    main_pages = len(PdfReader(io.BytesIO(main_pdf)).pages)
    appendix_pages = len(PdfReader(io.BytesIO(appendix_pdf)).pages)
    if main_pages > 8:
        raise ValueError(f"Main report has {main_pages} pages; maximum is 8")
    writer = PdfWriter()
    writer.append(io.BytesIO(main_pdf))
    writer.append(io.BytesIO(appendix_pdf))
    with OUTPUT.open("wb") as stream:
        writer.write(stream)

    pdf = fitz.open(OUTPUT)
    expected_text = ("Đào Ngọc Cường", "23001841", "SE2026-T16", "Tôi chịu trách nhiệm", "DUPLICATE", "Proposal ID")
    all_text = "\n".join(page.get_text() for page in pdf)
    missing = [item for item in expected_text if item not in all_text]
    clipped_spans = []
    min_main_font = 100.0
    font_names = set()
    embedded_font_bytes = 0
    for page_number, page in enumerate(pdf):
        font_names.update(font[3] for font in page.get_fonts(full=True))
        for font in page.get_fonts(full=True):
            if "DejaVu" in font[3]:
                embedded_font_bytes = max(embedded_font_bytes, len(pdf.extract_font(font[0])[3]))
        for block in page.get_text("dict")["blocks"]:
            if "lines" not in block:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    if x0 < -0.5 or y0 < -0.5 or x1 > page.rect.width + 0.5 or y1 > page.rect.height + 0.5:
                        clipped_spans.append((page_number + 1, span["text"][:50], tuple(round(v, 1) for v in span["bbox"])))
                    if page_number < main_pages and span["text"].strip() and span["text"].strip() != str(page_number + 1):
                        min_main_font = min(min_main_font, span["size"])
    if missing or clipped_spans or embedded_font_bytes == 0:
        raise ValueError(f"PDF validation failed: missing={missing}, clipped={clipped_spans[:5]}, fonts={sorted(font_names)}, embedded={embedded_font_bytes}")
    # Save representative main pages for visual inspection; render and inspect all pages programmatically.
    for page_number, page in enumerate(pdf):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
        if pixmap.width < 500 or pixmap.height < 700:
            raise ValueError(f"Rendered page {page_number + 1} unexpectedly small")
        if page_number in (0, 2, main_pages - 1):
            pixmap.save(ROOT / f"docs/evidence/vt062/pdf-preview-page-{page_number + 1}.png")
    report_sha = hashlib.sha256(REPORT.read_bytes()).hexdigest()
    pdf_sha = hashlib.sha256(OUTPUT.read_bytes()).hexdigest()
    validation = [
        f"MARKDOWN={REPORT}", f"MARKDOWN_SHA256={report_sha}", f"PDF={OUTPUT}", f"PDF_SHA256={pdf_sha}",
        f"MAIN_PAGES={main_pages}", f"APPENDIX_PAGES={appendix_pages}", f"TOTAL_PAGES={len(pdf)}",
        f"REFLECTION_WORDS={reflection_words}", f"MIN_MAIN_FONT_PT={min_main_font:.2f}",
        f"FONTS={','.join(sorted(font_names))}", f"MISSING_TEXT={missing}", f"CLIPPED_SPANS={len(clipped_spans)}",
        f"EMBEDDED_DEJAVU_FONT_BYTES={embedded_font_bytes}",
        "ALL_PAGES_RENDERED=YES", "EXIT_CODE=0",
    ]
    VALIDATION.write_text("\n".join(validation) + "\n")
    print("\n".join(validation))


if __name__ == "__main__":
    main()
