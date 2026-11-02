"""Render the VT-064 report and evidence into the required Unicode PDF.

Run with a Python venv containing reportlab; the source of truth is report.md/AI-usage.md.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUTPUT = ROOT / "BT3_23001850_VT-064.pdf"
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuBold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily("DejaVu", normal="DejaVu", bold="DejaVuBold")

BODY = ParagraphStyle("Body", fontName="DejaVu", fontSize=8.1, leading=12, spaceAfter=6)
HEADING = ParagraphStyle("Heading", parent=BODY, fontName="DejaVuBold", fontSize=11, leading=15, spaceBefore=11, spaceAfter=5)
TITLE = ParagraphStyle("Title", parent=BODY, fontName="DejaVuBold", fontSize=15, leading=20, spaceAfter=12)
SMALL = ParagraphStyle("Small", parent=BODY, fontSize=6.8, leading=9, spaceAfter=1)
LABEL = ParagraphStyle("Label", parent=SMALL, fontName="DejaVuBold", alignment=TA_CENTER)
MONO = ParagraphStyle("Evidence", parent=SMALL, fontSize=7, leading=10)


def marked(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", lambda m: f'<font color="#25345a">{m.group(1)}</font>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(https://[^\s<]+)", lambda m: f'<link href="{m.group(1)}">{m.group(1)}</link>', text)
    return text


def markdown(path: Path) -> list:
    lines = path.read_text(encoding="utf8").splitlines()
    flow: list = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith("# "):
            flow.append(Paragraph(marked(line[2:]), TITLE))
        elif line.startswith("## "):
            flow.append(Paragraph(marked(line[3:]), HEADING))
        elif line.startswith("| "):
            rows: list[list[str]] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
                if not all(set(cell.replace(" ", "")) <= set(":-") for cell in cells):
                    rows.append(cells)
                i += 1
            widths = {6: [44, 70, 65, 125, 156, 26],
                      5: [91, 79, 146, 103, 67],
                      4: [66, 126, 217, 77]}.get(len(rows[0]))
            if widths is None:
                widths = [486 / len(rows[0])] * len(rows[0])
            data = [[Paragraph(marked(cell), LABEL if j == 0 else SMALL)
                     for j, cell in enumerate(row)] for row in rows]
            table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
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
            flow.append(table)
            flow.append(Spacer(1, 6))
            continue
        else:
            flow.append(Paragraph(marked(line), BODY))
        i += 1
    return flow


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("DejaVu", 7)
    canvas.drawString(36, 26, "BT3 · 23001850 · VT-064")
    canvas.drawRightString(A4[0] - 36, 26, f"Trang {doc.page}")
    canvas.restoreState()


def build(path: Path, appendix: bool):
    flow = markdown(HERE / "report.md")
    if appendix:
        flow.extend([PageBreak(), Paragraph("Phụ lục A — AI Usage Log", TITLE)])
        flow.extend(markdown(HERE / "AI-usage.md"))
        flow.extend([PageBreak(), Paragraph("Phụ lục B — bằng chứng chạy", TITLE)])
        for name in ("red.log", "review-red.log", "mutation.patch", "mutation.log", "green.log", "coverage.log", "load.json"):
            text = (HERE / name).read_text(encoding="utf8").splitlines()
            if name == "mutation.patch":
                excerpt = text
            else:
                excerpt = text[-25:] if name in ("load.json", "coverage.log") else text[:12]
            flow.append(Paragraph(name, HEADING))
            flow.extend(Paragraph(html.escape(line) or " ", MONO) for line in excerpt)
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=36, rightMargin=36,
                            topMargin=38, bottomMargin=39, title="BT3_23001850_VT-064",
                            author="Phan Thanh Dung / AI-assisted draft")
    doc.build(flow, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build(Path("/tmp/vt064-main-only.pdf"), False)
    build(OUTPUT, True)
    print(f"Generated {OUTPUT}")
