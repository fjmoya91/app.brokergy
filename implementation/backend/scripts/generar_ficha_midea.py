# -*- coding: utf-8 -*-
"""
Generador de FICHA TECNICA recopilatoria (1 PDF por equipo) para los equipos
MIDEA dados de alta en el catalogo de aerotermia de BROKERGY.

Cada PDF final se compone de:
  1) Resumen BROKERGY con los datos oficiales (SCOP / ηs / COP / SEER / SCOPdhw).
  2) ANEXO I  - Certificado HP Keymark (ensayo oficial completo).
  3) ANEXO II - Ficha de producto / documento oficial del fabricante (Frigicoll-Midea).

Pensado para adjuntarse como anexo justificativo en los certificados CIFO / CAE
(RD 36/2023): el resumen remite a los anexos, y los anexos son los documentos
oficiales originales -> trazabilidad completa, nada inventado.

Uso: python generar_ficha_midea.py
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
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter

# ---------------------------------------------------------------------------
# Estilo BROKERGY  (identidad corporativa: ambar #FFA000 sobre negro #0C0E12)
# ---------------------------------------------------------------------------
INK     = colors.HexColor("#0C0E12")   # bkg.base - bandas oscuras / texto principal
INK2    = colors.HexColor("#1A1C22")   # bkg.elevated
BRAND   = colors.HexColor("#FFA000")   # ambar corporativo (acentos, wordmark)
BRAND_D = colors.HexColor("#E65100")   # ambar oscuro (texto sobre blanco)
BRAND_T = colors.HexColor("#FFF8E1")   # tinte ambar (resaltados / fondos suaves)
MUTED   = colors.HexColor("#9AA0A8")   # gris sobre fondo oscuro
GREY    = colors.HexColor("#5A6B7B")   # gris de texto secundario
LINE    = colors.HexColor("#D8DEE6")   # filete claro
ZEBRA   = colors.HexColor("#F5F6F7")   # filas alternas

# Compatibilidad con nombres previos
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
                      fontSize=8.2, textColor=colors.HexColor("#22303C"), leading=10)
CELLB = ParagraphStyle("cellb", parent=styles["Normal"], fontName="Helvetica-Bold",
                       fontSize=8.2, textColor=NAVY, leading=10)
CELLH = ParagraphStyle("cellh", parent=styles["Normal"], fontName="Helvetica-Bold",
                       fontSize=7.8, textColor=colors.white, leading=9.5, alignment=TA_CENTER)
CELLC = ParagraphStyle("cellc", parent=CELL, alignment=TA_CENTER)
CELLCB = ParagraphStyle("cellcb", parent=CELLB, alignment=TA_CENTER, textColor=BRAND_D)
DIV_BIG = ParagraphStyle("divbig", parent=styles["Normal"], fontName="Helvetica-Bold",
                         fontSize=30, textColor=BRAND, leading=34)
DIV_TIT = ParagraphStyle("divtit", parent=styles["Normal"], fontName="Helvetica-Bold",
                         fontSize=15, textColor=NAVY, leading=19, spaceBefore=4)
DIV_TXT = ParagraphStyle("divtxt", parent=styles["Normal"], fontName="Helvetica",
                         fontSize=10, textColor=colors.HexColor("#22303C"), leading=15)

GEN_DATE = "09/06/2026"


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
        "Documento recopilatorio de datos oficiales de ensayo (HP Keymark / ficha ErP / placa). "
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
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
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
                            title="Ficha tecnica MIDEA " + subt, author="BROKERGY")
    doc.build(elements,
              onFirstPage=lambda c, d: header_footer(c, d, titulo, subt),
              onLaterPages=lambda c, d: header_footer(c, d, titulo, subt))


def divider_page(path, anexo, titulo, descripcion, fuente):
    """Pagina separadora de anexo (sin numeracion de resumen)."""
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
        # marco ambar corporativo
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


def image_anexo_page(path, img_path, anexo, titulo, descripcion, fuente):
    """Pagina de anexo que incrusta una imagen oficial (p.ej. ficha de catalogo)."""
    def hf(canvas, doc):
        canvas.saveState()
        w, h = A4
        canvas.setFillColor(INK)
        canvas.rect(0, h - 22 * mm, w, 22 * mm, fill=1, stroke=0)
        canvas.setFillColor(BRAND)
        canvas.rect(0, h - 22 * mm, 4 * mm, 22 * mm, fill=1, stroke=0)
        canvas.setFillColor(BRAND)
        canvas.setFont("Helvetica-Bold", 14)
        canvas.drawString(15 * mm, h - 14 * mm, "BROKERGY")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(w - 15 * mm, h - 13 * mm, "Anexo documental")
        canvas.setStrokeColor(BRAND)
        canvas.setLineWidth(0.8)
        canvas.line(15 * mm, 14 * mm, w - 15 * mm, 14 * mm)
        canvas.setFillColor(GREY)
        canvas.setFont("Helvetica", 6.8)
        canvas.drawString(15 * mm, 9 * mm,
            "Documento oficial de la marca reproducido como prueba. Generado por BROKERGY el " + GEN_DATE + ".")
        canvas.restoreState()

    iw, ih = ImageReader(img_path).getSize()
    maxw, maxh = 178 * mm, 165 * mm
    sc = min(maxw / iw, maxh / ih)
    img = Image(img_path, width=iw * sc, height=ih * sc)
    img.hAlign = "CENTER"

    doc = SimpleDocTemplate(path, pagesize=A4,
                            topMargin=30 * mm, bottomMargin=18 * mm,
                            leftMargin=15 * mm, rightMargin=15 * mm)
    el = [
        Paragraph(anexo, DIV_BIG),
        Spacer(1, 2),
        Paragraph(titulo, DIV_TIT),
        Spacer(1, 6),
        Paragraph(descripcion, DIV_TXT),
        Spacer(1, 3),
        Paragraph("<b>Documento:</b> " + fuente, NOTE),
        Spacer(1, 8),
        img,
    ]
    doc.build(el, onFirstPage=hf, onLaterPages=hf)


# ---------------------------------------------------------------------------
# Contenido de los resumenes
# ---------------------------------------------------------------------------
def flow_calefaccion():
    e = []
    e.append(section("1.  Identificacion del equipo"))
    e.append(kv_table([
        ("Marca", "MIDEA"),
        ("Gama comercial", "M-Thermal Monobloc (serie A)"),
        ("Modelo", "<b>MHC-V8W/D2N8-B2E30</b>"),
        ("Tipo", "Bomba de calor aire-agua monobloc (unidad exterior), reversible"),
        ("Aplicacion", "Calefaccion / refrigeracion por agua (suelo radiante, fancoil, radiadores)"),
        ("Fabricante", "GD Midea Heating &amp; Ventilating Equipment Co., Ltd. (Foshan, China)"),
        ("Importador UE", "Frigicoll S.A. - Blasco de Garay 4-6, 08960 Sant Just Desvern (Barcelona)"),
        ("Refrigerante", "R32  ·  carga 1400 g  ·  GWP 675  ·  0,95 t CO<sub>2</sub> eq"),
        ("Alimentacion", "220-240 V ~ 50 Hz (monofasica)"),
        ("Resist. apoyo (IBH)", "3000 W  ·  Potencia nominal absorbida 3400 W + 3000 W (IBH)"),
        ("Caudal de aire", "4030 m<sup>3</sup>/h  ·  Nivel potencia sonora exterior 59 dB(A)  ·  IP24"),
        ("N.&ordm; de serie (placa)", "541S8459102A3060100002"),
    ]))

    e.append(section("2.  Potencias y rendimientos nominales  (EN 14511-2)"))
    e.append(perf_table(
        ["Modo / condicion", "Pot. termica", "Pot. absorbida", "COP / EER"],
        [
            ["Calefaccion  A7 / W35  (baja temp.)", "8,40 kW", "1,63 kW", "<b>COP 5,15</b>"],
            ["Calefaccion  A7 / W55  (media temp.)", "7,50 kW", "2,36 kW", "<b>COP 3,18</b>"],
            ["Refrigeracion  A35 / W18  (agua 23/18)", "8,30 kW", "1,64 kW", "EER 5,05"],
            ["Refrigeracion  A35 / W7  (agua 12/7)", "7,45 kW", "2,22 kW", "EER 3,35"],
        ],
        [70 * mm, 36 * mm, 36 * mm, 38 * mm],
        highlight_cols=[3],
    ))
    e.append(Spacer(1, 3))
    e.append(Paragraph(
        "Eficiencia estacional en refrigeracion (EN 14825):  <b>SEER 5,83</b> (agua 7&deg;C)  /  <b>SEER 8,95</b> (agua 18&deg;C)  "
        "&mdash;  &eta;<sub>s,c</sub> 230,1 % / 355,1 % (clase A+++).", NOTE))

    e.append(section("3.  Rendimiento estacional en CALEFACCION  (EN 14825 / Reg. UE 811/2013)"))
    e.append(Paragraph(
        "Dato determinante para el calculo del SCOP<sub>bdc</sub> en el certificado CIFO. "
        "Valores certificados HP Keymark para la unidad monobloc MHC-V8W/D2N8-B (ver <b>ANEXO II</b>).", BODY))
    e.append(Spacer(1, 3))
    e.append(perf_table(
        ["Zona climatica", "Aplicacion", "&eta;s (%)", "SCOP", "Prated (kW)", "Clase"],
        [
            ["Media (Average)", "35&deg;C - baja",  "205", "5,21", "8,12", "A+++"],
            ["Media (Average)", "55&deg;C - media", "132", "3,36", "6,60", "A++"],
            ["Calida (Warmer)", "35&deg;C - baja",  "273", "6,99", "8,12", "&mdash;"],
            ["Calida (Warmer)", "55&deg;C - media", "177", "4,50", "8,37", "&mdash;"],
            ["Fria (Colder)",   "35&deg;C - baja",  "170", "4,32", "6,98", "&mdash;"],
            ["Fria (Colder)",   "55&deg;C - media", "112", "2,88", "5,78", "&mdash;"],
        ],
        [34 * mm, 30 * mm, 24 * mm, 24 * mm, 30 * mm, 24 * mm],
        highlight_cols=[3],
    ))
    e.append(Spacer(1, 3))
    e.append(Paragraph(
        "Relacion con el CIFO:  SCOP<sub>bdc</sub> = CC &middot; (&eta;<sub>s,h</sub> + F(1) + F(2)) = 2,5 &middot; (&eta;s + 3 % + 0 %).  "
        "Ej. clima medio 55&deg;C: 2,5 &middot; (132 % + 3 %) = 3,36.", NOTE))

    e.append(section("4.  COP a carga parcial  ·  clima medio  (EN 14825)"))
    e.append(perf_table(
        ["Temp. impulsion", "COP Tj=-7&deg;C", "COP Tj=+2&deg;C", "COP Tj=+7&deg;C", "COP Tj=+12&deg;C", "Tbiv / TOL"],
        [
            ["35&deg;C (baja)",  "3,35", "5,09", "6,82", "8,35", "-7 / -10&deg;C"],
            ["55&deg;C (media)", "2,16", "3,30", "4,34", "5,33", "-7 / -10&deg;C"],
        ],
        [30 * mm, 27 * mm, 27 * mm, 27 * mm, 28 * mm, 27 * mm],
    ))
    e.append(Spacer(1, 2))
    e.append(Paragraph(
        "Limite de temperatura del agua (WTOL) 65&deg;C  ·  Coef. degradacion Cdh 0,90  ·  "
        "Resist. apoyo Psup 1,69 kW (electrica)  ·  Consumo anual Q<sub>HE</sub> 4056 kWh (clima medio, 55&deg;C).", NOTE))

    e.append(section("5.  Anexos y trazabilidad documental"))
    e.append(kv_table([
        ("ANEXO I", "<b>Ficha de producto Frigicoll / Midea</b> M-Thermon A 8 (doc. 21FPM_ESFREN) &mdash; SCOP, COP y SEER publicados por el fabricante"),
        ("ANEXO II", "Certificado <b>HP Keymark</b> n.&ordm; <b>041-K007-06</b> (BRE Global, 02/12/2020) &mdash; ensayo oficial EN 14825 (29 pag.)"),
        ("Ficha ErP / etiqueta", "Reg. UE 811/2013 · documento ErP_MHC-V8W-D2N8-BE30 · clase A+++ (35&deg;C) / A++ (55&deg;C)"),
        ("Normas de ensayo", "EN 14825, EN 14511, EN 12102"),
        ("Archivo de origen", "06. CALIDAD / 01. FICHAS TECNICAS AEROTERMIA / 29. MIDEA"),
    ]))
    e.append(Spacer(1, 4))
    e.append(Paragraph(
        "Nota: los modelos MHC-V8W/D2N8-B, -BE30 y -B2E30 comparten datos de ensayo ErP/Keymark; la variante -B2E30 "
        "corresponde a la unidad con resistencia de apoyo integrada de 3 kW (1F). Todos los valores del resumen estan "
        "respaldados por los documentos oficiales reproducidos en los anexos.", NOTE))
    return e


def flow_acs():
    e = []
    e.append(section("1.  Identificacion del equipo"))
    e.append(kv_table([
        ("Marca", "MIDEA"),
        ("Modelo", "<b>RSJ-15/190RDN3-F1</b>"),
        ("Tipo", "Bomba de calor para ACS (aire-agua) con deposito integrado &mdash; termo aerotermico"),
        ("Aplicacion", "Produccion de agua caliente sanitaria (ACS)"),
        ("Fabricante", "GD Midea Heating &amp; Ventilating Equipment Co., Ltd. (Foshan, China)"),
        ("Importador UE", "Frigicoll S.A. - Blasco de Garay 4-6, 08960 Sant Just Desvern (Barcelona)"),
        ("Refrigerante", "R134a  ·  carga 1,0 kg  ·  GWP 1430  ·  1,43 t CO<sub>2</sub> eq"),
        ("Alimentacion", "220-240 V ~ 50 Hz (monofasica)"),
        ("Potencia calorifica", "1500 W  ·  Potencia absorbida 3900 W  ·  Resist. electrica 3150 W"),
        ("Deposito ACS", "190 L (nominal) &mdash; 185 L segun placa de caracteristicas"),
        ("Temp. max. ACS", "70&deg;C  ·  Tuberia entrada/salida DN20  ·  Peso 107 kg  ·  IP21"),
        ("Nivel sonoro", "58 dB(A) (potencia sonora unidad interior)"),
    ]))

    e.append(section("2.  Rendimiento en ACS  (EN 16147 / Reg. UE 814/2013)"))
    e.append(Paragraph(
        "Dato determinante para el calculo del SCOP<sub>dhw</sub> en el certificado CIFO. "
        "Perfil de carga declarado: <b>L</b>.  Valores certificados HP Keymark (ver <b>ANEXO II</b>).", BODY))
    e.append(Spacer(1, 3))
    e.append(perf_table(
        ["Zona climatica", "COP", "&eta;wh (%)", "T. ref. ACS", "Mezcla 40&deg;C", "T. calent."],
        [
            ["Media (Average)", "2,70", "116", "53,3&deg;C", "239 L", "7 h 11"],
            ["Calida (Warmer)", "3,40", "144", "53,4&deg;C", "238 L", "5 h 11"],
            ["Fria (Colder)",   "2,30",  "97", "50,1&deg;C", "222 L", "8 h 08"],
        ],
        [34 * mm, 22 * mm, 26 * mm, 28 * mm, 28 * mm, 28 * mm],
        highlight_cols=[1, 2],
    ))
    e.append(Spacer(1, 3))
    e.append(Paragraph(
        "Relacion con el CIFO:  &middot; Anexo IV RES060:  SCOP<sub>dhw</sub> = CC &times; &eta;<sub>wh</sub> = 2,5 &times; (&eta;wh/100)  "
        "(clima medio: 2,5 &times; 1,16 = 2,90).   &middot; Anexo VI RES060 (caso 3):  SCOP<sub>dhw</sub> = COP &times; F<sub>c</sub>(zona).", NOTE))

    e.append(section("3.  Otros datos de operacion"))
    e.append(kv_table([
        ("Limites de operacion", "Temperatura ambiente de trabajo y dispositivos de seguridad verificados (EN 16147)"),
        ("Consumo en espera", "29 W (clima medio) / 27 W (calido) / 43 W (frio)"),
        ("Potencia sonora", "58 dB(A) en todas las zonas climaticas (EN 12102-2)"),
    ]))

    e.append(section("4.  Anexos y trazabilidad documental"))
    e.append(kv_table([
        ("ANEXO I", "<b>Ficha comercial Frigicoll / Midea COMBO</b> (catalogo: RSJ-15/190RDN3-F1 &mdash; SCOP,ACS 2,7 / perfil L, COP, clase A+) + Declaracion UE de conformidad"),
        ("ANEXO II", "Certificado <b>HP Keymark</b> n.&ordm; <b>041-K007-16</b> (BRE, 26/04/2023) &mdash; ensayo oficial EN 16147 (5 pag.)"),
        ("Normas de ensayo", "EN 16147, EN 12102-2"),
        ("Archivo de origen", "06. CALIDAD / 01. FICHAS TECNICAS AEROTERMIA / 29. MIDEA / ACS"),
    ]))
    e.append(Spacer(1, 4))
    e.append(Paragraph(
        "Nota: el rendimiento de ACS se declara por perfil de carga (aqui perfil L). El SCOP<sub>dhw</sub> a aplicar en el "
        "CIFO se obtiene del &eta;wh o del COP de la zona climatica correspondiente segun el anexo de calculo utilizado. "
        "Todos los valores del resumen estan respaldados por los documentos oficiales reproducidos en los anexos.", NOTE))
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
    tmp = tempfile.mkdtemp(prefix="ficha_midea_")
    writer = PdfWriter()

    # 1) Resumen
    sum_path = os.path.join(tmp, "summary.pdf")
    render(sum_path, summary_flow, titulo, subt)
    append_pdf(writer, sum_path)

    # 2..n) Anexos (separador/imagen + documento)
    for k, ax in enumerate(anexos, 1):
        if ax.get("image"):
            img_path = os.path.join(tmp, "imgax_%d.pdf" % k)
            image_anexo_page(img_path, ax["image"], ax["anexo"], ax["titulo"],
                             ax["descripcion"], ax["fuente"])
            append_pdf(writer, img_path)
        else:
            div_path = os.path.join(tmp, "div_%d.pdf" % k)
            divider_page(div_path, ax["anexo"], ax["titulo"], ax["descripcion"], ax["fuente"])
            append_pdf(writer, div_path)
        if ax.get("path"):
            append_pdf(writer, ax["path"], ax.get("pages"))

    with open(output_path, "wb") as fh:
        writer.write(fh)
    print("OK ->", output_path, "(%d pag.)" % len(writer.pages))


if __name__ == "__main__":
    base = r"C:\Users\Usuario\Mi unidad\01. RD 36-2023 (CAES)\06. CALIDAD\01. FICHAS TECNICAS AEROTERMIA\29. MIDEA"

    # ---- CALEFACCION ----
    build(
        os.path.join(base, "FICHA_TECNICA_MIDEA_MHC-V8W-D2N8-B2E30_CALEFACCION.pdf"),
        flow_calefaccion(), "Calefaccion", "MHC-V8W/D2N8-B2E30",
        [
            {
                "anexo": "ANEXO I",
                "titulo": "Ficha tecnica de la marca (Frigicoll / Midea)",
                "descripcion": "Ficha de producto oficial del conjunto M-Thermon A 8 (MHC-V8W/D2N8-BE30) publicada "
                               "por Frigicoll (importador oficial Midea en Espana), con las prestaciones nominales, "
                               "el SCOP por zona climatica y el SEER (7&deg;C / 18&deg;C) del equipo.",
                "fuente": "21FPM_ESFREN_AER_M-THERMON-A_ES.pdf (paginas del modelo A 8)",
                "path": os.path.join(base, "21FPM_ESFREN_AER_M-THERMON-A_ES.pdf"),
                "pages": [4, 5],  # 0-based: ficha + dimensiones del modelo A8
            },
            {
                "anexo": "ANEXO II",
                "titulo": "Certificado HP Keymark - Ensayo oficial (EN 14825)",
                "descripcion": "Resumen de prestaciones certificadas de la bomba de calor MHC-V8W/D2N8-B "
                               "(serie M-thermal A 8-10 kW), emitido por la base de datos europea HP Keymark "
                               "y verificado por el organismo BRE Global. Registro n.&ordm; 041-K007-06. "
                               "Contiene los valores de SCOP, &eta;s y COP por zona climatica recogidos en el resumen.",
                "fuente": "HP-Keymark-Midea-M-thermal-A-series-8-10-kW.pdf (29 pag.)",
                "path": os.path.join(base, "HP-Keymark-Midea-M-thermal-A-series-8-10-kW.pdf"),
                "pages": None,
            },
        ],
    )

    # ---- ACS ----
    build(
        os.path.join(base, "ACS", "FICHA_TECNICA_MIDEA_RSJ-15-190RDN3-F1_ACS.pdf"),
        flow_acs(), "ACS", "RSJ-15/190RDN3-F1",
        [
            {
                "anexo": "ANEXO I",
                "titulo": "Ficha tecnica comercial de la marca (Frigicoll / Midea COMBO)",
                "descripcion": "Pagina del catalogo oficial Frigicoll / Midea de la gama COMBO (bombas de calor "
                               "para ACS), que incluye el modelo RSJ-15/190RDN3-F1 con su SCOP,ACS / perfil de carga "
                               "(2,7 / L), COP, clasificacion energetica A+, temperatura de referencia y volumen de "
                               "ACS. A continuacion se adjunta la Declaracion UE de conformidad del fabricante.",
                "fuente": "Combo Midea.jpg (catalogo Frigicoll/Midea) + 231025_DC_M_AER_COMBO (Decl. UE 814/2013)",
                "image": os.path.join(base, "ACS", "Combo Midea.jpg"),
                "path": os.path.join(base, "ACS", "231025_DC_M_AER_COMBO_RSJ-15-190RDN3-F1-ES-FR-EN.pdf"),
                "pages": None,
            },
            {
                "anexo": "ANEXO II",
                "titulo": "Certificado HP Keymark - Ensayo oficial (EN 16147)",
                "descripcion": "Informe de prestaciones certificadas de la bomba de calor para ACS "
                               "RSJ-15/190RDN3-F1, emitido por la base de datos europea HP Keymark y verificado "
                               "por el organismo BRE. Registro n.&ordm; 041-K007-16. Contiene los valores de COP, "
                               "&eta;dhw y perfil de carga por zona climatica recogidos en el resumen.",
                "fuente": "KEYMARK.pdf (5 pag.)",
                "path": os.path.join(base, "ACS", "KEYMARK.pdf"),
                "pages": None,
            },
        ],
    )
    print("Hecho.")
