#!/usr/bin/env python3
"""
BORRADOR del CERTIFICADO DE INSTALACIÓN TÉRMICA (RITE — trámite JE6, JCCM).

Genera un PDF con el FORMATO del certificado oficial (RD 1027/2007) relleno con
los datos del expediente, pensado para que el instalador lo revise y COPIE Y
PEGUE cada valor en la plataforma de tramitación. NO tiene validez legal.

Reutiliza la MISMA estructura de datos que la guía JE6 (ver _datos_guia()).
"""
import json
import sys
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable)

NARANJA = colors.HexColor("#E8731C")
GRIS_CAB = colors.HexColor("#2C3E50")
BORDE = colors.HexColor("#BFC9D4")
VERDE = colors.HexColor("#1E8449")

ANCHO = 182 * mm


def fmt_fecha(iso):
    if not iso:
        return ""
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception:
        return iso or ""


def _kw(x):
    try:
        f = float(x)
    except (TypeError, ValueError):
        return str(x) if x else "0"
    return f"{int(f)}" if f == int(f) else f"{f:g}"


def build(datos, output):
    doc = SimpleDocTemplate(output, pagesize=A4, topMargin=11 * mm,
                            bottomMargin=11 * mm, leftMargin=14 * mm, rightMargin=14 * mm)
    ss = getSampleStyleSheet()
    h_title = ParagraphStyle('t', parent=ss['Title'], fontSize=13.5,
                             textColor=colors.white, alignment=1, spaceAfter=0)
    h_sub = ParagraphStyle('s', parent=ss['Normal'], fontSize=7.6,
                           textColor=colors.grey, alignment=1, spaceAfter=1)
    warn = ParagraphStyle('w', parent=h_sub, textColor=NARANJA)
    sec = ParagraphStyle('sec', parent=ss['Normal'], fontSize=9,
                         textColor=colors.white, fontName='Helvetica-Bold')
    cell = ParagraphStyle('cell', parent=ss['Normal'], fontSize=9.5, leading=11.5)
    nota = ParagraphStyle('n', parent=ss['Normal'], fontSize=7.6, textColor=VERDE)

    story = []

    def C(label, value):
        """Celda de formulario: etiqueta pequeña encima, valor en negrita debajo."""
        v = "" if value in (None, "") else str(value)
        return Paragraph(f'<font size="6.4" color="#7A8794">{label.upper()}</font><br/>'
                         f'<b>{v}</b>', cell)

    def OPT(label, opciones):
        """Celda con opciones tipo casilla: marcada en negrita con ✔; sin marcar
        en gris claro y sin símbolo (Helvetica no tiene glifo de círculo vacío)."""
        marks = "&nbsp;&nbsp;&nbsp;&nbsp;".join(
            f'<b>✔ {t}</b>' if on else f'<font color="#B0B8C0">{t}</font>'
            for t, on in opciones)
        return Paragraph(f'<font size="6.4" color="#7A8794">{label.upper()}</font><br/>{marks}', cell)

    def seccion(titulo):
        tb = Table([[Paragraph(titulo, sec)]], colWidths=[ANCHO])
        tb.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), GRIS_CAB),
            ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 7)]))
        story.append(tb)

    def grid(rows, widths):
        tb = Table(rows, colWidths=widths)
        tb.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, BORDE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6)]))
        story.append(tb)
        story.append(Spacer(1, 5))

    # ── Cabecera ───────────────────────────────────────────────────────────
    banner = Table([[Paragraph("BORRADOR · CERTIFICADO DE INSTALACIÓN TÉRMICA", h_title)]],
                   colWidths=[ANCHO])
    banner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), NARANJA),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    story.append(banner)
    story.append(Spacer(1, 2))
    story.append(Paragraph(
        f"Reglamento de Instalaciones Térmicas en los Edificios (RD 1027/2007) · "
        f"www.jccm.es → Trámite JE6 · Expediente {datos.get('expediente','')}", h_sub))
    story.append(Paragraph(
        "Borrador para revisar y copiar en la plataforma de tramitación. Carece de validez legal.", warn))
    story.append(Spacer(1, 5))

    t = datos['titular']
    e = datos['emplazamiento']
    dt = datos['tecnicos']
    p = datos['potencia']
    s = datos['solar']
    m = datos['memoria']
    ins = datos['instalador']
    tipo = dt.get('tipo', [])

    # ── 1. Titular ─────────────────────────────────────────────────────────
    seccion("TITULAR DE LA INSTALACIÓN")
    grid([[C("Nombre o Razón Social", t['nombre']), C("Apellido 1º", t['ape1']),
           C("Apellido 2º", t['ape2']), C("NIF / NIE", t['nif'])]],
         [70 * mm, 41 * mm, 41 * mm, 30 * mm])

    # ── 2. Emplazamiento ───────────────────────────────────────────────────
    seccion("EMPLAZAMIENTO DE LA INSTALACIÓN")
    grid([[C("Dirección", e['direccion'])]], [ANCHO])
    grid([[C("Municipio", e['localidad']), C("Provincia", e['provincia']),
           C("Código Postal", e['cp'])]], [80 * mm, 62 * mm, 40 * mm])
    grid([[C("Referencia Catastral", e['ref_catastral']),
           C("Coordenada UTM X (ETRS89)", e.get('utm_x') or ''),
           C("Coordenada UTM Y (ETRS89)", e.get('utm_y') or '')]],
         [82 * mm, 50 * mm, 50 * mm])

    # ── 3. Datos de la instalación ─────────────────────────────────────────
    seccion("DATOS DE LA INSTALACIÓN")
    grid([[OPT("Instalación", [("Nueva", dt['instalacion'] == 'NUEVA'),
                               ("Reforma", dt['instalacion'] == 'REFORMA')]),
           OPT("Carácter de la instalación", [("Centralizada", dt['caracter'] == 'CENTRALIZADA'),
                                              ("Individual", dt['caracter'] == 'INDIVIDUAL')])]],
         [91 * mm, 91 * mm])
    grid([[OPT("Tipo de instalación", [
        ("Calefacción", 'CALEFACCIÓN' in tipo),
        ("Refrigeración", 'REFRIGERACIÓN' in tipo),
        ("Ventilación", False),
        ("Agua Caliente Sanitaria", 'AGUA CALIENTE SANITARIA' in tipo)])]], [ANCHO])

    # ── 4. Potencia / uso / combustible / solar ────────────────────────────
    seccion("POTENCIA TÉRMICA NOMINAL · USO · COMBUSTIBLE")
    grid([[C("Potencia TOTAL", f"{_kw(p['total'])} kW"), C("Calor", f"{_kw(p['calor'])} kW"),
           C("Frío", f"{_kw(p['frio'])} kW"), C("ACS", f"{_kw(p['acs'])} kW")]],
         [50 * mm, 44 * mm, 44 * mm, 44 * mm])
    grid([[OPT("Uso de la instalación", [("Vivienda", dt['uso'] == 'VIVIENDA'),
                                         ("Local", False), ("Local Institucional", False),
                                         ("Otros", dt['uso'] not in ('VIVIENDA',))]),
           C("Combustible", dt['combustible'])]],
         [110 * mm, 72 * mm])
    grid([[C("Energía solar — Nº paneles", str(s['paneles'])),
           C("Superficie paneles (m²)", str(s['superficie'])),
           C("Potencia energía apoyo (kW)", str(s['apoyo'])),
           OPT("¿Almacenamiento combustible?", [("Sí", dt['almacenamiento'] == 'SÍ'),
                                                ("No", dt['almacenamiento'] != 'SÍ')])]],
         [50 * mm, 46 * mm, 46 * mm, 40 * mm])

    # ── 5. Autor de la memoria ─────────────────────────────────────────────
    seccion("AUTOR DE LA MEMORIA TÉCNICA")
    grid([[C("Nombre y apellidos del autor de la memoria", m['autor']),
           C("NIF / NIE", m['nif_autor'])]], [132 * mm, 50 * mm])

    # ── 6. Empresa instaladora / instalador ────────────────────────────────
    seccion("EMPRESA INSTALADORA HABILITADA E INSTALADOR/A")
    grid([[C("Empresa instaladora (Razón Social)", ins['razon_social']),
           C("NIF", ins['cif']),
           C("Nº Registro Integrado Industrial", ins['num_registro_industrial'])]],
         [86 * mm, 36 * mm, 60 * mm])
    grid([[C("Instalador/a (Nombre y apellidos)", ins['instalador_nombre']),
           C("NIF", ins['instalador_nif']),
           C("Nº de Carné", ins.get('carnet_personal') or '')]],
         [86 * mm, 36 * mm, 60 * mm])

    # ── 7. Pruebas ─────────────────────────────────────────────────────────
    fpr = fmt_fecha(datos.get('pruebas_fecha'))
    seccion(f"PRUEBAS REALIZADAS CON RESULTADO SATISFACTORIO — FECHA: {fpr or '—'}")
    pruebas = datos.get('pruebas', [])
    filas = []
    for i in range(0, len(pruebas), 2):
        izq = Paragraph(f'<b>✔</b> {pruebas[i]}', cell)
        der = Paragraph(f'<b>✔</b> {pruebas[i + 1]}', cell) if i + 1 < len(pruebas) else Paragraph("", cell)
        filas.append([izq, der])
    if filas:
        grid(filas, [91 * mm, 91 * mm])

    # ── Aviso ──────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", color=VERDE, thickness=1, spaceAfter=4))
    story.append(Paragraph(
        "<b>✓ Datos extraídos del expediente (app.brokergy).</b> Revisar potencias, fechas "
        "y datos del instalador antes de presentar el certificado en la plataforma.", nota))

    doc.build(story)
    print(f"[OK] Borrador certificado: {output}")
    return output


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        d = json.load(f)
    build(d, sys.argv[2])
