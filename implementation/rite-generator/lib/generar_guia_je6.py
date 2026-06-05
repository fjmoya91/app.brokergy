#!/usr/bin/env python3
"""Genera un PDF 'guiaburros' para dar de alta el certificado RITE en la plataforma JE6.
Layout tipo copia-pega: etiqueta + valor destacado por secciones."""
import json, sys
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable)

NARANJA = colors.HexColor("#E8731C")
GRIS_CAB = colors.HexColor("#3A3A3A")
GRIS_SUAVE = colors.HexColor("#F0F0F0")
AMARILLO = colors.HexColor("#FFF3CD")
ROJO = colors.HexColor("#C0392B")

def fmt_fecha(iso):
    if not iso:
        return ""
    try:
        return datetime.strptime(iso, "%Y-%m-%d").strftime("%d/%m/%Y")
    except Exception:
        return iso or ""

def build(datos, output):
    doc = SimpleDocTemplate(output, pagesize=A4,
                            topMargin=14*mm, bottomMargin=12*mm,
                            leftMargin=14*mm, rightMargin=14*mm)
    ss = getSampleStyleSheet()
    h_title = ParagraphStyle('t', parent=ss['Title'], fontSize=15,
                             textColor=GRIS_CAB, spaceAfter=2)
    h_sub = ParagraphStyle('s', parent=ss['Normal'], fontSize=8.5,
                           textColor=colors.grey, spaceAfter=8)
    sec = ParagraphStyle('sec', parent=ss['Normal'], fontSize=10.5,
                         textColor=colors.white, fontName='Helvetica-Bold')
    lbl = ParagraphStyle('lbl', parent=ss['Normal'], fontSize=8,
                         textColor=colors.HexColor("#555555"))
    val = ParagraphStyle('val', parent=ss['Normal'], fontSize=11,
                         fontName='Helvetica-Bold', textColor=colors.black)
    val_warn = ParagraphStyle('vw', parent=val, textColor=ROJO)
    nota = ParagraphStyle('n', parent=ss['Normal'], fontSize=7.5,
                          textColor=colors.grey)

    story = []
    story.append(Paragraph("GUÍA DE ALTA — CERTIFICADO RITE (Trámite JE6)", h_title))
    story.append(Paragraph(
        f"Expediente {datos['expediente']} · Copia cada valor en su campo de la plataforma "
        f"www.jccm.es → JE6 · RD 1027/2007", h_sub))
    story.append(HRFlowable(width="100%", color=NARANJA, thickness=2, spaceAfter=8))

    def seccion(titulo):
        t = Table([[Paragraph(titulo, sec)]], colWidths=[182*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),GRIS_CAB),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
            ('LEFTPADDING',(0,0),(-1,-1),8)]))
        story.append(t)
        story.append(Spacer(1, 3))

    def campos(filas):
        """filas = [(etiqueta, valor, warn?), ...] -> tabla 2 columnas pares"""
        data=[]; styles=[]
        for et, vv, *w in filas:
            warn = w[0] if w else False
            vstyle = val_warn if warn else val
            vtxt = ("" if vv is None else str(vv)) + ("  ⚠ AÑADIR A BD" if warn else "")
            data.append([Paragraph(et, lbl), Paragraph(vtxt, vstyle)])
        t = Table(data, colWidths=[58*mm, 124*mm])
        ts=[('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
            ('LINEBELOW',(0,0),(-1,-2),0.4,colors.HexColor("#DDDDDD")),
            ('LEFTPADDING',(0,0),(-1,-1),6)]
        t.setStyle(TableStyle(ts))
        story.append(t); story.append(Spacer(1,7))

    t=datos['titular']
    seccion("1 · TITULAR DE LA INSTALACIÓN")
    campos([("Nombre o Razón Social", t['nombre']),
            ("Primer Apellido", t['ape1']),
            ("Segundo Apellido", t['ape2']),
            ("NIF (sin puntos ni guiones)", t['nif'])])

    e=datos['emplazamiento']
    seccion("2 · SITUACIÓN DE LA INSTALACIÓN")
    campos([("Dirección", e['direccion']),
            ("Código Postal", e['cp']),
            ("Provincia", e['provincia']),
            ("Localidad", e['localidad']),
            ("Ref. Catastral", e['ref_catastral']),
            ("Coordenadas UTM (ETRS89)", f"X: {e.get('utm_x') or ''}    Y: {e.get('utm_y') or ''}")])

    dt=datos['tecnicos']; p=datos['potencia']
    seccion("3 · DATOS TÉCNICOS DE LA INSTALACIÓN")
    campos([("Instalación", dt['instalacion']),
            ("Carácter de la instalación", dt['caracter']),
            ("Tipo de instalación", " + ".join(dt['tipo'])),
            ("Uso al que se destina", dt['uso']),
            ("Combustible", dt['combustible']),
            ("¿Almacenamiento de combustible?", dt['almacenamiento'])])

    seccion("4 · POTENCIA TÉRMICA NOMINAL")
    campos([("Total potencia", f"{p['total']} kW"),
            ("Calor", f"{p['calor']} kW"),
            ("Frío", f"{p['frio']} kW"),
            ("ACS", f"{p['acs']} kW")])

    s=datos['solar']
    seccion("5 · ENERGÍA SOLAR")
    campos([("Nº Paneles", str(s['paneles'])),
            ("Superficie paneles", f"{s['superficie']} m²"),
            ("Potencia energía apoyo", f"{s['apoyo']} kW")])

    m=datos['memoria']
    seccion("6 · MEMORIA TÉCNICA DE DISEÑO")
    campos([("Autor de la memoria", m['autor']),
            ("NIF del autor de la MT", m['nif_autor'])])

    i=datos['instalador']
    seccion("7 · EMPRESA INSTALADORA / INSTALADOR")
    campos([("Razón Social", i['razon_social']),
            ("CIF", i['cif']),
            ("Nº Empresa RITE (Reg. Integrado Industrial)", i['num_registro_industrial']),
            ("Instalador/a", i['instalador_nombre']),
            ("NIF instalador/a", i['instalador_nif'])])

    seccion("8 · PRUEBAS REALIZADAS (fecha = fecha de factura)")
    fpr = fmt_fecha(datos['pruebas_fecha'])
    pr_rows = [[Paragraph(pr, lbl), Paragraph(fpr, val)] for pr in datos['pruebas']]
    tpr = Table(pr_rows, colWidths=[124*mm, 58*mm])
    tpr.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('LINEBELOW',(0,0),(-1,-2),0.4,colors.HexColor("#DDDDDD")),
        ('LEFTPADDING',(0,0),(-1,-1),6),
        ('BACKGROUND',(1,0),(1,-1),GRIS_SUAVE)]))
    story.append(tpr); story.append(Spacer(1,8))

    # Confirmación: todos los datos desde Supabase
    story.append(HRFlowable(width="100%", color=colors.HexColor("#27AE60"), thickness=1, spaceAfter=4))
    aviso = ("<b>✓ Todos los datos proceden de Supabase (app.brokergy).</b> "
             "Verificar potencias y fechas antes del alta definitiva en la plataforma JE6.")
    story.append(Paragraph(aviso, ParagraphStyle('av', parent=nota,
                 textColor=colors.HexColor("#1E8449"), fontSize=8)))

    doc.build(story)
    print(f"✓ PDF guiaburros generado: {output}")

if __name__=="__main__":
    with open(sys.argv[1]) as f:
        datos=json.load(f)
    build(datos, sys.argv[2])
