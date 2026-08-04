# -*- coding: utf-8 -*-
"""
Generador de FICHA TECNICA recopilatoria para la gama CARRIER AQUASNAP 30AWH-M
(bomba de calor monobloc aire-agua, R32, 8-16 kW) dada de alta en el catalogo
de aerotermia de BROKERGY.

El PDF final se compone de:
  1) Resumen BROKERGY con los datos oficiales (potencias, COP, SCOP por zona
     climatica) de los 5 modelos del catalogo (08M, 10M, 12M, 14M, 16M).
  2) ANEXO I  - Ficha comercial / brochure oficial de Carrier (30AWH-M R32).
  3) ANEXO II - Certificado + informe de ensayo HP Keymark 041-K019-23
                (cubre los modelos 012/014/016, mono y trifasico).

Pensado para adjuntarse como anexo justificativo en los certificados CIFO / CAE
(RD 36/2023): el resumen remite a los anexos, y los anexos son los documentos
oficiales originales -> trazabilidad completa, nada inventado.

Uso: python generar_ficha_carrier.py
"""
import os
import tempfile
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)
from pypdf import PdfReader, PdfWriter

# ---------------------------------------------------------------------------
# Estilo BROKERGY  (identidad corporativa: ambar #FFA000 sobre negro #0C0E12)
# ---------------------------------------------------------------------------
INK     = colors.HexColor("#0C0E12")
BRAND   = colors.HexColor("#FFA000")
BRAND_D = colors.HexColor("#E65100")
BRAND_T = colors.HexColor("#FFF8E1")
MUTED   = colors.HexColor("#9AA0A8")
GREY    = colors.HexColor("#5A6B7B")
LINE    = colors.HexColor("#D8DEE6")
ZEBRA   = colors.HexColor("#F5F6F7")

NAVY   = INK
ACCENT = BRAND
LIGHT  = ZEBRA
LIGHT2 = BRAND_T

styles = getSampleStyleSheet()
SECT = ParagraphStyle("sect", parent=styles["Normal"], fontName="Helvetica-Bold",
                      fontSize=10.5, textColor=BRAND_D, leading=13, spaceBefore=8, spaceAfter=4)
BODY = ParagraphStyle("body", parent=styles["Normal"], fontName="Helvetica",
                      fontSize=8.6, textColor=colors.HexColor("#22303C"), leading=11.5)
NOTE = ParagraphStyle("note", parent=styles["Normal"], fontName="Helvetica-Oblique",
                      fontSize=7.8, textColor=GREY, leading=10.5)
CELL = ParagraphStyle("cell", parent=styles["Normal"], fontName="Helvetica",
                      fontSize=7.9, textColor=colors.HexColor("#22303C"), leading=9.6)
CELLB = ParagraphStyle("cellb", parent=styles["Normal"], fontName="Helvetica-Bold",
                       fontSize=8.2, textColor=NAVY, leading=10)
CELLH = ParagraphStyle("cellh", parent=styles["Normal"], fontName="Helvetica-Bold",
                       fontSize=7.5, textColor=colors.white, leading=9.2, alignment=TA_CENTER)
CELLC = ParagraphStyle("cellc", parent=CELL, alignment=TA_CENTER)
CELLCB = ParagraphStyle("cellcb", parent=CELLB, alignment=TA_CENTER, textColor=BRAND_D)
DIV_BIG = ParagraphStyle("divbig", parent=styles["Normal"], fontName="Helvetica-Bold",
                         fontSize=30, textColor=BRAND, leading=34)
DIV_TIT = ParagraphStyle("divtit", parent=styles["Normal"], fontName="Helvetica-Bold",
                         fontSize=15, textColor=NAVY, leading=19, spaceBefore=4)
DIV_TXT = ParagraphStyle("divtxt", parent=styles["Normal"], fontName="Helvetica",
                         fontSize=10, textColor=colors.HexColor("#22303C"), leading=15)

GEN_DATE = "03/08/2026"


def header_footer(canvas, doc, titulo, subt):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 30 * mm, w, 30 * mm, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, h - 30 * mm, 4 * mm, 30 * mm, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont("Helvetica-Bold", 16)
    canvas.drawString(15 * mm, h - 13 * mm, "BROKERGY")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm, h - 17.5 * mm, "FICHA TECNICA DE EQUIPO  ·  Aerotermia")
    canvas.setFont("Helvetica-Bold", 11)
    canvas.setFillColor(colors.white)
    canvas.drawRightString(w - 15 * mm, h - 13 * mm, titulo)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(w - 15 * mm, h - 17.5 * mm, subt)
    canvas.setStrokeColor(BRAND)
    canvas.setLineWidth(0.8)
    canvas.line(15 * mm, 14 * mm, w - 15 * mm, 14 * mm)
    canvas.setFont("Helvetica", 6.8)
    canvas.setFillColor(GREY)
    canvas.drawString(15 * mm, 10 * mm,
        "Documento recopilatorio de datos oficiales de ensayo (HP Keymark / ficha ErP / catalogo). "
        "Generado por BROKERGY el " + GEN_DATE + ".")
    canvas.drawString(15 * mm, 6.5 * mm,
        "Resumen respaldado por los anexos oficiales adjuntos. Apto como justificacion de rendimiento en certificados CIFO (RD 36/2023).")
    canvas.drawRightString(w - 15 * mm, 6.5 * mm, "Resumen pag. %d" % doc.page)
    canvas.restoreState()


def section(txt):
    return Paragraph(txt, SECT)


def kv_table(rows, col0=42 * mm):
    data = [[Paragraph(k, CELLB), Paragraph(v, CELL)] for k, v in rows]
    t = Table(data, colWidths=[col0, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
        ("BACKGROUND", (0, 0), (0, -1), LIGHT2),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def perf_table(headers, rows, col_widths, highlight_cols=None):
    highlight_cols = highlight_cols or []
    data = [[Paragraph(h, CELLH) for h in headers]]
    for r in rows:
        data.append([Paragraph(str(c), CELLCB if j in highlight_cols else CELLC)
                     for j, c in enumerate(r)])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ]
    for c in highlight_cols:
        style.append(("BACKGROUND", (c, 1), (c, -1), BRAND_T))
    t.setStyle(TableStyle(style))
    return t


def render(path, elements, titulo, subt):
    doc = SimpleDocTemplate(path, pagesize=A4,
                            topMargin=34 * mm, bottomMargin=18 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            title="Ficha tecnica CARRIER " + subt, author="BROKERGY")
    doc.build(elements,
              onFirstPage=lambda c, d: header_footer(c, d, titulo, subt),
              onLaterPages=lambda c, d: header_footer(c, d, titulo, subt))


def divider_page(path, anexo, titulo, descripcion, fuente):
    def hf(canvas, doc):
        canvas.saveState()
        w, h = A4
        canvas.setFillColor(NAVY)
        canvas.rect(0, h - 22 * mm, w, 22 * mm, fill=1, stroke=0)
        canvas.setFillColor(ACCENT)
        canvas.rect(0, h - 22 * mm, 4 * mm, 22 * mm, fill=1, stroke=0)
        canvas.setFillColor(BRAND)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(15 * mm, h - 14 * mm, "BROKERGY")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(w - 15 * mm, h - 13 * mm, "Anexo documental")
        canvas.setStrokeColor(BRAND)
        canvas.setLineWidth(1.2)
        canvas.roundRect(15 * mm, h - 150 * mm, w - 30 * mm, 95 * mm, 5 * mm, fill=0, stroke=1)
        canvas.restoreState()
    doc = SimpleDocTemplate(path, pagesize=A4,
                            topMargin=70 * mm, bottomMargin=20 * mm,
                            leftMargin=24 * mm, rightMargin=24 * mm)
    el = [
        Paragraph(anexo, DIV_BIG),
        Spacer(1, 4),
        Paragraph(titulo, DIV_TIT),
        Spacer(1, 14),
        Paragraph(descripcion, DIV_TXT),
        Spacer(1, 16),
        Paragraph("<b>Documento:</b> " + fuente, NOTE),
        Spacer(1, 6),
        Paragraph("Las paginas siguientes reproducen el documento oficial original, sin alteracion, "
                  "como prueba de los valores recogidos en el resumen.", NOTE),
    ]
    doc.build(el, onFirstPage=hf, onLaterPages=hf)


# ---------------------------------------------------------------------------
# Contenido del resumen
# ---------------------------------------------------------------------------
def flow_calefaccion():
    e = []
    e.append(section("1.  Identificacion del equipo"))
    e.append(kv_table([
        ("Marca", "CARRIER  (gama AQUASNAP&reg;)"),
        ("Gama comercial", "30AWH-M &middot; Monobloc aire-agua reversible, refrigerante R32"),
        ("Modelos (monofasica 230V)", "<b>30AWH008H----M &middot; 010H----M &middot; 012H----M &middot; 014H----M &middot; 016H----M</b>"),
        ("Variantes trifasicas (400V)", "30AWH012H-9--M &middot; 014H-9--M &middot; 016H-9--M (mismas prestaciones que su version monofasica)"),
        ("Tipo", "Bomba de calor aire-agua monobloc (unidad exterior), reversible calefaccion/refrigeracion"),
        ("Aplicacion", "Calefaccion/refrigeracion por agua (suelo radiante, fancoil, radiadores). No incluye ACS integrada."),
        ("Titular certificado Keymark", "Riello S.p.A. - Via Ing. Pilade Riello 7, 37045 Legnago (VR), Italia"),
        ("Lugar de fabricacion", "Hefei (Anhui) y Shunde, Foshan &mdash; R.P. China"),
        ("Refrigerante", "R32  &middot;  carga 1,4-1,75 kg (mono) / 1,84 kg (ensayo Keymark)  &middot;  GWP 675"),
        ("Alimentacion", "1x230V 50Hz (08M-16M)  /  3x400V 50Hz (variantes -9--M)"),
        ("Rango de potencia calefaccion (HA1, 35&deg;C)", "8,40 - 15,90 kW  &middot;  Cascada de hasta 6 unidades"),
    ]))

    e.append(section("2.  Potencias y rendimientos nominales  (EN 14511)"))
    e.append(perf_table(
        ["Modelo", "Pot. calef. 35&deg;C (HA1)", "COP HA1", "Pot. calef. 55&deg;C (HA3)", "COP HA3"],
        [
            ["30AWH 08M", "8,40 kW", "5,15", "7,50 kW", "3,18"],
            ["30AWH 10M", "10,00 kW", "4,95", "9,50 kW", "3,10"],
            ["30AWH 12M", "12,10 kW", "4,95", "11,90 kW", "3,05"],
            ["30AWH 14M", "14,50 kW", "4,60", "13,80 kW", "2,95"],
            ["30AWH 16M", "15,90 kW", "4,50", "16,00 kW", "2,85"],
        ],
        [30 * mm, 38 * mm, 24 * mm, 38 * mm, 24 * mm],
        highlight_cols=[2, 4],
    ))
    e.append(Spacer(1, 2))
    e.append(Paragraph(
        "HA1: agua 30/35&deg;C (impulsion baja, tipo suelo radiante) &middot; HA3: agua 47/55&deg;C (impulsion media, "
        "tipo radiadores). Condiciones exteriores 7&deg;C db / 6&deg;C wb (EN 14511). Modelos 12/14/16M verificados "
        "frente al ensayo oficial HP Keymark (ver <b>ANEXO II</b>); 08/10M proceden de la ficha comercial (<b>ANEXO I</b>).", NOTE))

    e.append(section("3.  Rendimiento estacional SCOP por zona climatica  (EN 14825)"))
    e.append(Paragraph(
        "Dato determinante para el calculo del SCOP<sub>bdc</sub> en el certificado CIFO "
        "(SCOP<sub>bdc</sub> = CC &middot; (&eta;<sub>s,h</sub> + 3 %)). Zona <b>Media</b> = clima medio de Espana; "
        "<b>Calida</b> / <b>Fria</b> segun el Anexo III del RD 36/2023.", BODY))
    e.append(Spacer(1, 3))
    e.append(perf_table(
        ["Modelo", "SCOP 35&deg;C\nmedia", "SCOP 55&deg;C\nmedia", "SCOP 35&deg;C\ncalida", "SCOP 55&deg;C\ncalida", "SCOP 35&deg;C\nfria", "SCOP 55&deg;C\nfria"],
        [
            ["30AWH 08M", "5,21", "3,36", "6,99 *", "4,50 *", "&mdash;", "&mdash;"],
            ["30AWH 10M", "5,19", "3,49", "7,12 *", "4,58 *", "&mdash;", "&mdash;"],
            ["30AWH 12M", "4,81", "3,45", "6,53", "4,43", "4,08", "3,02"],
            ["30AWH 14M", "4,72", "3,47", "6,63", "4,45", "4,07", "3,05"],
            ["30AWH 16M", "4,62", "3,41", "6,33", "4,48", "4,02", "3,12"],
        ],
        [26 * mm, 23 * mm, 23 * mm, 23 * mm, 23 * mm, 21 * mm, 21 * mm],
        highlight_cols=[1, 2],
    ))
    e.append(Spacer(1, 3))
    e.append(Paragraph(
        "Valores en negro: ensayo oficial HP Keymark n.&ordm; <b>041-K019-23</b> (BRE Global / TUV SUD Guangzhou, "
        "18/10/2023), modelos 012/014/016H----M y sus variantes trifasicas -9--M (mismas prestaciones). "
        "* 08M y 10M no estan cubiertos por este Keymark: sus valores de zona calida proceden del catalogo interno "
        "de BROKERGY, sin ensayo oficial adjunto en esta ficha.", NOTE))
    e.append(Spacer(1, 2))
    e.append(Paragraph(
        "<b>Nota BROKERGY (correccion 03/08/2026):</b> los valores de SCOP del modelo <b>30AWH 16M</b> mostrados "
        "arriba (zona media y calida) proceden directamente del informe HP Keymark (ANEXO II, pag. 22-24) y "
        "sustituyen a un valor erroneo registrado previamente en el catalogo interno, que duplicaba por error los "
        "datos del modelo 30AWH 12M.", NOTE))

    e.append(section("4.  Otros datos tecnicos  (EN 12102 / dimensiones)"))
    e.append(perf_table(
        ["Modelo", "Sonido ext. (2)", "Compresor", "Carga R32", "Dimensiones L&times;An&times;Al", "Peso"],
        [
            ["30AWH 08M", "59 dB(A)", "DC Twin-rotary", "1,4 kg", "1385&times;523&times;865 mm", "105 kg"],
            ["30AWH 10M", "60 dB(A)", "DC Twin-rotary", "1,4 kg", "1385&times;523&times;865 mm", "105 kg"],
            ["30AWH 12M", "65 dB(A)", "DC Twin-rotary", "1,75 kg", "1385&times;523&times;865 mm", "129 kg"],
            ["30AWH 14M", "65 dB(A)", "DC Twin-rotary", "1,75 kg", "1385&times;523&times;865 mm", "129 kg"],
            ["30AWH 16M", "68 dB(A)", "DC Twin-rotary", "1,75 kg", "1385&times;523&times;865 mm", "129 kg"],
        ],
        [26 * mm, 26 * mm, 30 * mm, 22 * mm, 46 * mm, 20 * mm],
    ))
    e.append(Spacer(1, 2))
    e.append(Paragraph(
        "(2) Nivel de potencia sonora exterior segun EN 12102, condiciones EN 14825 (clima medio). "
        "Temperatura maxima de impulsion 65&deg;C. Condensador de tubos de cobre ranurados con aleta de aluminio hidrofilica.", NOTE))

    e.append(section("5.  Anexos y trazabilidad documental"))
    e.append(kv_table([
        ("ANEXO I", "<b>Ficha comercial / brochure oficial Carrier</b> B-RLC-029 30AWH-M R32 (07/2025) &mdash; "
                    "descripcion de la gama y tabla tecnica completa (potencias, COP, SCOP, sonido, dimensiones) "
                    "de los 10 modelos de la serie (4-16 kW)"),
        ("ANEXO II", "Certificado + Informe de ensayo <b>HP Keymark</b> n.&ordm; <b>041-K019-23</b> "
                    "(BRE Global, emitido 18/10/2023, TUV SUD Certification and Testing Guangzhou como laboratorio) "
                    "&mdash; ensayo oficial EN 14511 / EN 14825 / EN 12102 de los modelos 012/014/016H----M y sus "
                    "variantes trifasicas. Unidad de referencia ensayada: n.&ordm; serie 30AWH012-0145-016."),
        ("Normas de ensayo", "EN 14511, EN 14825, EN 12102, Reglamento UE 813/2013 (Ecodesign)"),
        ("Archivo de origen", "06. CALIDAD / 01. FICHAS TECNICAS AEROTERMIA / 30. CARRIER"),
    ]))
    e.append(Spacer(1, 4))
    e.append(Paragraph(
        "Nota: esta ficha cubre los 5 modelos monofasicos dados de alta en el catalogo de aerotermia de BROKERGY "
        "(30AWH 08M/10M/12M/14M/16M). Las variantes trifasicas -9--M comparten los mismos rendimientos segun el "
        "Keymark 041-K019-23 y quedan documentadas en el mismo anexo. Todos los valores del resumen estan "
        "respaldados por los documentos oficiales reproducidos en los anexos.", NOTE))
    return e


# ---------------------------------------------------------------------------
# Fusion (pypdf)
# ---------------------------------------------------------------------------
def append_pdf(writer, path, pages=None):
    reader = PdfReader(path)
    idx = range(len(reader.pages)) if pages is None else pages
    for i in idx:
        writer.add_page(reader.pages[i])


def build(output_path, summary_flow, titulo, subt, anexos):
    """anexos = lista de dicts {anexo, titulo, descripcion, fuente, path, pages}."""
    tmp = tempfile.mkdtemp(prefix="ficha_carrier_")
    writer = PdfWriter()

    sum_path = os.path.join(tmp, "summary.pdf")
    render(sum_path, summary_flow, titulo, subt)
    append_pdf(writer, sum_path)

    for k, ax in enumerate(anexos, 1):
        div_path = os.path.join(tmp, "div_%d.pdf" % k)
        divider_page(div_path, ax["anexo"], ax["titulo"], ax["descripcion"], ax["fuente"])
        append_pdf(writer, div_path)
        if ax.get("path"):
            append_pdf(writer, ax["path"], ax.get("pages"))
        for extra in ax.get("extra_paths", []):
            append_pdf(writer, extra)

    with open(output_path, "wb") as fh:
        writer.write(fh)
    print("OK ->", output_path, "(%d pag.)" % len(writer.pages))
    return output_path


if __name__ == "__main__":
    base = r"C:\Users\Usuario\Mi unidad\01. RD 36-2023 (CAES)\06. CALIDAD\01. FICHAS TECNICAS AEROTERMIA\30. CARRIER"

    output = build(
        os.path.join(base, "FICHA_TECNICA_CARRIER_30AWH-M_R32_08-16kW.pdf"),
        flow_calefaccion(), "Calefaccion", "30AWH-M 08-16 kW",
        [
            {
                "anexo": "ANEXO I",
                "titulo": "Ficha comercial / brochure oficial (Carrier)",
                "descripcion": "Brochure oficial de la gama AQUASNAP 30AWH-M (bomba de calor monobloc aire-agua "
                               "R32), con la descripcion del producto y la tabla tecnica completa (potencias, COP, "
                               "SCOP, sonido, dimensiones y peso) de los 10 modelos de la serie, de la cual el "
                               "catalogo de BROKERGY recoge los 5 modelos monofasicos de 8 a 16 kW.",
                "fuente": "Carrier_B-RLC-029 30AWH-M R32_Brochure_EN.pdf (paginas 2-4)",
                "path": os.path.join(base, "Carrier_B-RLC-029 30AWH-M R32_Brochure_EN.pdf"),
                "pages": [1, 2, 3],
            },
            {
                "anexo": "ANEXO II",
                "titulo": "Certificado + Informe de ensayo HP Keymark (EN 14511 / EN 14825)",
                "descripcion": "Certificado de conformidad y ensayo oficial de la base de datos europea HP "
                               "Keymark para la bomba de calor Carrier 30AWH-M 12/14/16 kW (modelos "
                               "30AWH012H----M, 014H----M, 016H----M y sus variantes trifasicas -9--M), emitido "
                               "por BRE Global y ensayado por TUV SUD Certification and Testing Co. Guangzhou. "
                               "Registro n.&ordm; 041-K019-23. Contiene los valores de COP, SCOP y &eta;s por zona "
                               "climatica (media, calida y fria) recogidos en el resumen.",
                "fuente": "30AWH012-0145-016 - CERTIFICADO KEYMARK.pdf (1 pag.) + "
                          "30AWH012-0145-016 - KEYMARK.pdf (25 pag.)",
                "path": os.path.join(base, "30AWH012-0145-016 - CERTIFICADO KEYMARK.pdf"),
                "pages": None,
                "extra_paths": [os.path.join(base, "30AWH012-0145-016 - KEYMARK.pdf")],
            },
        ],
    )
    print("Hecho.", output)
