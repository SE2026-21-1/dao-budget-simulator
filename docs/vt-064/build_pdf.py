"""Render the Vietnamese report and compact, linked AI/evidence appendices.

Run with a Python venv containing reportlab. Main content is also emitted as
/tmp/vt064-main-only.pdf so its page count can be inspected independently.
"""
from __future__ import annotations

import html
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUTPUT = ROOT / "BT3_23001850_VT-064.pdf"
MAIN_OUTPUT = Path("/tmp/vt064-main-only.pdf")
SOURCE_URL = (
    "https://github.com/SE2026-21-1/dao-budget-simulator/"
    "blob/personal/23001850-vt064-submission-20261114/docs/vt-064/"
)
CONTENT_WIDTH = A4[0] - 72
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuBold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVuBold",
                            italic="DejaVu", boldItalic="DejaVuBold")

BODY = ParagraphStyle("Body", fontName="DejaVu", fontSize=9.2, leading=13,
                      spaceAfter=6, splitLongWords=1, allowWidows=0, allowOrphans=0)
HEADING = ParagraphStyle("Heading", parent=BODY, fontName="DejaVuBold",
                         fontSize=11.2, leading=15, spaceBefore=11, spaceAfter=5,
                         keepWithNext=True)
SUBHEADING = ParagraphStyle("Subheading", parent=HEADING, fontSize=10, leading=13)
TITLE = ParagraphStyle("Title", parent=HEADING, fontSize=15, leading=20,
                       spaceBefore=0, spaceAfter=12)
APPENDIX_TITLE = ParagraphStyle("AppendixTitle", parent=TITLE,
                                textColor=colors.HexColor("#25345a"))
CELL = ParagraphStyle("Cell", parent=BODY, fontSize=8, leading=10.8, spaceAfter=1)
CELL_HEADER = ParagraphStyle("CellHeader", parent=CELL, fontName="DejaVuBold")
EVIDENCE = ParagraphStyle("Evidence", parent=CELL, leading=10.5, spaceAfter=1)

# Tokenize before escaping or inserting markup: a URL inside a Markdown link must
# not become a second, nested ReportLab link. Parentheses in URL paths are allowed.
INLINE = re.compile(
    r"`(?P<code>[^`]+)`"
    r"|\[(?P<label>[^\]]+)\]\((?P<href>(?:[^()\s]|\([^()\s]*\))+)"
    r'(?:\s+"[^"]*")?\)'
    r"|\*\*(?P<bold>.+?)\*\*"
    r"|\*(?P<italic>[^*]+)\*"
    r"|(?P<url>https?://[^\s<>]+)"
)


def marked(text: str, hyperlinks: bool = True) -> str:
    parts: list[str] = []
    end = 0
    for match in INLINE.finditer(text):
        parts.append(html.escape(text[end:match.start()]))
        if match["code"] is not None:
            parts.append(f'<font color="#25345a">{html.escape(match["code"])}</font>')
        elif match["label"] is not None:
            label = marked(match["label"], hyperlinks=False)
            href = urljoin(SOURCE_URL, match["href"])
            if hyperlinks and urlsplit(href).scheme in {"http", "https", "mailto"}:
                parts.append(f'<link href="{html.escape(href, quote=True)}" '
                             f'color="#174c8c">{label}</link>')
            else:
                parts.append(label)
        elif match["bold"] is not None:
            parts.append(f'<b>{marked(match["bold"], hyperlinks=hyperlinks)}</b>')
        elif match["italic"] is not None:
            parts.append(f'<i>{marked(match["italic"], hyperlinks=hyperlinks)}</i>')
        else:
            url = match["url"]
            suffix = ""
            while url and (
                url[-1] in ".,;:!?"
                or (url[-1] == ")" and url.count(")") > url.count("("))
                or (url[-1] == "]" and url.count("]") > url.count("["))
            ):
                suffix = url[-1] + suffix
                url = url[:-1]
            escaped = html.escape(url, quote=True)
            parts.append(f'<link href="{escaped}" color="#174c8c">{escaped}</link>'
                         if hyperlinks else escaped)
            parts.append(html.escape(suffix))
        end = match.end()
    parts.append(html.escape(text[end:]))
    return "".join(parts)


def evidence_line(line: str) -> Paragraph:
    # Preserve indentation, empty lines, and all failure detail; Paragraph still
    # wraps long tokens (SHA/path/URL) within the available frame or table cell.
    text = html.escape(line.expandtabs(4)).replace(" ", "&#160;")
    return Paragraph(text or "&#160;", EVIDENCE)


def table_cells(line: str) -> list[str]:
    text = line.strip()[1:]
    if text.endswith("|") and not text.endswith(r"\|"):
        text = text[:-1]
    return [cell.strip().replace(r"\|", "|")
            for cell in re.split(r"(?<!\\)\|", text)]


def markdown(path: Path, appendix: bool = False) -> list:
    lines = path.read_text(encoding="utf8").splitlines()
    flow: list = []
    i = 0
    fenced = False
    has_title = False
    if appendix and not any(line.startswith("# ") for line in lines):
        title = Paragraph("Phụ lục A — AI Usage Log", APPENDIX_TITLE)
        title.section = "appendix"
        flow.append(title)
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith("```"):
            fenced = not fenced
            i += 1
            continue
        if fenced:
            flow.append(evidence_line(lines[i]))
        elif not line:
            i += 1
            continue
        elif line == "<!-- pagebreak -->":
            flow.append(PageBreak())
        elif heading := re.match(r"^(#{1,6})\s+(.+)$", line):
            level = len(heading[1])
            text = heading[2]
            if level == 1:
                if appendix and not has_title:
                    text = re.sub(r"^Phụ lục(?:\s+A)?\s*[—–-]?\s*", "", text)
                    text = f"Phụ lục A — {text}"
                title = Paragraph(marked(text), APPENDIX_TITLE if appendix else TITLE)
                title.section = "appendix" if appendix else "main"
                flow.append(title)
                has_title = True
            else:
                flow.append(Paragraph(marked(text), HEADING if level == 2 else SUBHEADING))
        elif line.startswith("|"):
            rows: list[list[str]] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = table_cells(lines[i])
                if not all(re.fullmatch(r":?-+:?", cell.replace(" ", "")) for cell in cells):
                    rows.append(cells)
                i += 1
            if not rows:
                continue
            columns = max(map(len, rows))
            weights = {6: [44, 70, 65, 125, 156, 26],
                       5: [91, 79, 146, 103, 67],
                       4: [66, 126, 217, 77]}.get(columns, [1] * columns)
            widths = [CONTENT_WIDTH * weight / sum(weights) for weight in weights]
            data = [[Paragraph(marked(cell), CELL_HEADER if row_index == 0 else CELL)
                     for cell in row + [""] * (columns - len(row))]
                    for row_index, row in enumerate(rows)]
            table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT",
                          splitByRow=1, splitInRow=1)
            table.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8edf5")),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#9aa9bc")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f8fa")]),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ]))
            flow.extend([table, Spacer(1, 6)])
            continue
        else:
            flow.append(Paragraph(marked(line), BODY))
        i += 1
    return flow


class ReportDocument(SimpleDocTemplate):
    section = "main"

    def afterFlowable(self, flowable):
        self.section = getattr(flowable, "section", self.section)

    def afterPage(self):
        canvas = self.canv
        canvas.saveState()
        canvas.setFont("DejaVu", 8)
        canvas.drawString(36, 26, "BT3 · 23001850 · VT-064")
        section = "Phụ lục" if self.section == "appendix" else "Nội dung chính"
        canvas.drawRightString(A4[0] - 36, 26, f"{section} · Trang {self.page}")
        canvas.restoreState()




def build(path: Path, appendix: bool):
    flow = markdown(HERE / "report.md")
    if appendix:
        flow.append(PageBreak())
        flow.extend(markdown(HERE / "appendix-summary.md", appendix=True))
    doc = ReportDocument(
        str(path), pagesize=A4, leftMargin=36, rightMargin=36,
        topMargin=38, bottomMargin=39,
        title="BT3_23001850_VT-064" + (" — kèm phụ lục" if appendix else " — nội dung chính"),
        author="Phan Thanh Dũng / AI-assisted; disclosure in appendix A",
        subject="VT-064: nội dung chính và phụ lục tách biệt; không tự giảm cỡ chữ để ép số trang",
    )
    doc.build(flow)


if __name__ == "__main__":
    build(MAIN_OUTPUT, False)
    build(OUTPUT, True)
    print(f"Generated {MAIN_OUTPUT} (main content only)")
    print(f"Generated {OUTPUT} (main content and appendices)")
