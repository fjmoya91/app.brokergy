#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_cifo.py — Generador local del CIFO (Certificado de Instalación / Fin de Obra CAE) de BROKERGY.

Modo AUTOSUFICIENTE de la skill generar-anexo-cifo: si el tool de backend `generar_cifo` no está
desplegado en el MCP, la skill llama a este script para producir el PDF replicando la plantilla oficial,
fusiona los anexos (fichas técnicas + EPREL) y devuelve la ruta del PDF final. La skill se encarga de
subirlo a Drive ("6. ANEXOS CAE") y enlazar el slot `cert_cifo_drive_link`.

Uso:
    python3 generar_cifo.py payload.json salida.pdf
    # payload.json: dict con los datos ya validados por la skill (ver ESQUEMA abajo)
    # anexos: lista de rutas a PDFs locales (FT cal, FT acs, Fiche EPREL, Label...) -> se fusionan al final

ESQUEMA del payload (todas las cadenas ya formateadas es-ES; números como número o cadena):
{
  "tipologia": "RES060" | "RES093" | "RES080",
  "numero_expediente": "26RES093_2",
  "actuacion_nombre": "Sustitución de caldera de combustión por una bomba de calor aire-agua (aerotermia)",
  "ficha_codigo_nombre": "RES060: Sustitución de caldera ...",
  "comunidad": "CASTILLA-LA MANCHA",
  "direccion": "CL ... , CP MUNICIPIO (PROV)",
  "ref_catastral": "....",
  "utm_x": "597481", "utm_y": "4316979",
  "facturas": "2664, 26102",
  "propietario": "NOMBRE APELLIDOS", "nif": "00000000X",
  "domicilio": "...", "telefono": "...", "email": "...",
  "fecha_inicio": "05/05/2026", "fecha_fin": "13/07/2026",
  "cal": {"tipo_ex":"...","tipo_new":"Bomba de calor","marca_ex":"...","marca_new":"...",
          "modelo_ex":"...","modelo_new":"...","energia_ex":"Gasóleo","energia_new":"Electricidad",
          "serie_ex":"NO LEGIBLE","serie_new":"...","rend_ex":"0,83","scop_new":"4,53"},
  "cambio_acs": true|false,
  "acs": {  # solo si cambio_acs. Si false -> "no aplica"/"Se mantiene la instalación existente"
          "tipo_ex":"...","marca_ex":"...","modelo_ex":"...","energia_ex":"...","serie_ex":"...",
          "rend_ex":"...","modelo_new":"...","marca_new":"...","serie_new":"...","scop_new":"..."},
  "variables": {"FP":"1","DCAL":"154,99","S":"262,00","DACS":"2731,40","ni":"0,83",
                "SCOPbdc":"4,53","SCOPdhw":"no aplica","Cb":"97,22%","AETOTAL":"38.850","Di":"15"},
  "just_dacs_metodo": "xml" | "cte",   # cómo justificar DACS en Anexo I
  "just_dacs_texto": "…",              # texto ya compuesto (xml: valor·S; cte: tabla Anejo F)
  "just_ni_texto": "…tramo aplicado…",
  "scop_cal_metodo": "eprel"|"ficha"|"catalogo",
  "scop_cal_eprel": {"cc":"2,5","etas":"119%","f1":"3%","f2":"0%","tª":"55°C","emisor":"Radiadores Convencionales","zona":"D3"},
  "scop_acs_texto": "…",               # justificación SCOPdhw (o "no aplica")
  "res093_cb": {"pdiseno":"12,58","cobertura":"79,5%","cb":"0,960","zona":"D3","p_bdc":"10,00",
                "tecnologia":"aerotermia","cond_ensayo":"A7/W35",
                "fuente_p":"Memoria Tecnica de Diseno del RITE (RD 1027/2007)",
                "fuente_p_detalle":"Suma de la columna CARGAS CALCULO del RESUMEN DE CARGAS TERMICAS POR LOCAL, firmada por tecnico competente y presentada ante el organo competente de la CCAA. NUNCA usar th de RES220/RES230."},
  "instalador": {"razon":"...","cif":"...","domicilio":"...","cargo":"Representante legal"},
  # RES080:
  "res080": {"director":"Francisco Javier Moya López","entidad":"...","titulacion":"...","email":"...","tlf":"...",
             "efi":"131.555","eff":"12.950","aetotal_kwh":"118.605",
             "desc_termica":"...","ventanas":[{...}], "cerramientos":[{...}],
             "efi_eff_tabla":[{"param":"...","ini":"...","fin":"..."}]},
  "anexos": ["/ruta/ft_cal.pdf", "/ruta/ft_acs.pdf", "/ruta/Fiche_xxx_ES.pdf"]
}
"""
import sys, json, os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                HRFlowable, KeepTogether, PageBreak)
from reportlab.pdfgen import canvas as _canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Fuente Unicode completa (Δ, η, ², →, ·, ºC…). Si no está DejaVu, cae a Helvetica (glifos limmitados).
FONT, FONT_B = "Helvetica", "Helvetica-Bold"
for _dir in ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu",
             "/Library/Fonts", "C:/Windows/Fonts"):
    try:
        pdfmetrics.registerFont(TTFont("CIFO", os.path.join(_dir, "DejaVuSans.ttf")))
        pdfmetrics.registerFont(TTFont("CIFO-B", os.path.join(_dir, "DejaVuSans-Bold.ttf")))
        pdfmetrics.registerFontFamily("CIFO", normal="CIFO", bold="CIFO-B", italic="CIFO", boldItalic="CIFO-B")
        FONT, FONT_B = "CIFO", "CIFO-B"
        break
    except Exception:
        continue

BRAND = colors.HexColor("#0B6E4F")     # verde BROKERGY (placeholder de marca)
BRAND_D = colors.HexColor("#08553C")
GREY = colors.HexColor("#5b6770")
LIGHT = colors.HexColor("#eef3f1")

styles = getSampleStyleSheet()
def S(name, **kw):
    base = kw.pop("parent", styles["Normal"])
    return ParagraphStyle(name, parent=base, **kw)

st_title = S("t", fontName=FONT_B, fontSize=15, textColor=BRAND_D, spaceAfter=2, alignment=TA_CENTER, leading=18)
st_sub   = S("s", fontName=FONT, fontSize=8.5, textColor=GREY, alignment=TA_CENTER, spaceAfter=8)
st_h     = S("h", fontName=FONT_B, fontSize=9.5, textColor=colors.white, backColor=BRAND,
             leftIndent=4, spaceBefore=8, spaceAfter=4, leading=15)
st_lbl   = S("l", fontName=FONT_B, fontSize=8, textColor=colors.HexColor("#22303a"), leading=11)
st_val   = S("v", fontName=FONT, fontSize=8, textColor=colors.HexColor("#22303a"), leading=11)
st_p     = S("p", fontName=FONT, fontSize=8.5, alignment=TA_JUSTIFY, leading=12, spaceAfter=4)
st_pb    = S("pb", fontName=FONT_B, fontSize=8.5, leading=12, spaceAfter=2)
st_small = S("sm", fontName=FONT, fontSize=7.5, textColor=GREY, leading=10)
st_cellh = S("ch", fontName=FONT_B, fontSize=7.8, textColor=colors.white, alignment=TA_CENTER, leading=10)
st_cell  = S("c", fontName=FONT, fontSize=7.8, leading=10)
st_cellb = S("cb", fontName=FONT_B, fontSize=7.8, leading=10)

def section(txt): return Paragraph(txt, st_h)

def kv_table(rows, col1=55*mm):
    """rows: list of (label, value)."""
    data = [[Paragraph(l, st_lbl), Paragraph(str(v), st_val)] for l, v in rows]
    t = Table(data, colWidths=[col1, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",(0,0),(-1,-1),1.5), ("BOTTOMPADDING",(0,0),(-1,-1),1.5),
        ("LINEBELOW",(0,0),(-1,-2),0.3,colors.HexColor("#dce5e1")),
        ("LEFTPADDING",(0,0),(-1,-1),3),
    ]))
    return t

def comp_table(header, rows):
    """Comparativa EXISTENTE / NUEVA. header: (col0,'EXISTENTE','NUEVA'). rows: (label, ex, new)."""
    data = [[Paragraph(header[0], st_cellh), Paragraph(header[1], st_cellh), Paragraph(header[2], st_cellh)]]
    for r in rows:
        data.append([Paragraph(r[0], st_cellb), Paragraph(str(r[1]), st_cell), Paragraph(str(r[2]), st_cell)])
    t = Table(data, colWidths=[52*mm, None, None])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),BRAND),
        ("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#cfdad5")),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
        ("LEFTPADDING",(0,0),(-1,-1),4),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, LIGHT]),
    ]))
    return t

def variables_table(v, tipologia):
    cols = ["FP","DCAL","S","DACS","ηi","SCOPbdc","SCOPdhw"]
    keys = ["FP","DCAL","S","DACS","ni","SCOPbdc","SCOPdhw"]
    if tipologia == "RES093":
        cols += ["Cb"]; keys += ["Cb"]
    cols += ["AETOTAL","Di"]; keys += ["AETOTAL","Di"]
    head = [Paragraph(c, st_cellh) for c in cols]
    row  = [Paragraph(str(v.get(k,"—")), st_cell) for k in keys]
    t = Table([head, row], colWidths=[ (170*mm)/len(cols) ]*len(cols))
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0),BRAND),
        ("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#cfdad5")),
        ("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),3),("BOTTOMPADDING",(0,0),(-1,-1),3),
    ]))
    return t

def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT, 7)
    canvas.setFillColor(GREY)
    num = f"{doc.numExpte}  ·  CERTIFICADO CAE  ·  Página {doc.page}"
    canvas.drawCentredString(A4[0]/2, 10*mm, num)
    canvas.setStrokeColor(colors.HexColor("#cfdad5"))
    canvas.line(20*mm, 13*mm, A4[0]-20*mm, 13*mm)
    canvas.restoreState()

def build_core(payload, out_path):
    tp = payload["tipologia"]
    doc = SimpleDocTemplate(out_path, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                            topMargin=16*mm, bottomMargin=18*mm)
    doc.numExpte = payload.get("numero_expediente","")
    E = []
    titulo = "CERTIFICADO FINAL DE OBRA CAE" if tp=="RES080" else "CERTIFICADO DE INSTALACIÓN"
    E += [Paragraph(titulo, st_title),
          Paragraph(f"Expediente {payload.get('numero_expediente','')} · Ficha {tp}", st_sub),
          HRFlowable(width="100%", thickness=1.2, color=BRAND, spaceAfter=6)]

    if tp == "RES080":
        return build_res080(payload, doc, E)

    # --- Identificación actuación ---
    E += [section("IDENTIFICACIÓN DE LA ACTUACIÓN DE AHORRO DE ENERGÍA"),
          kv_table([
            ("Nombre de la actuación", payload.get("actuacion_nombre","")),
            ("Código y nombre de la ficha", payload.get("ficha_codigo_nombre","")),
            ("Comunidad autónoma", payload.get("comunidad","")),
            ("Dirección postal instalación", payload.get("direccion","")),
            ("Referencia catastral", payload.get("ref_catastral","")),
            ("Coordenadas UTM (ETRS89)", f"X: {payload.get('utm_x','')} ; Y: {payload.get('utm_y','')}"),
            ("Facturas asociadas", payload.get("facturas","")),
          ])]
    # --- Propietario ---
    E += [section("IDENTIFICACIÓN DEL PROPIETARIO INICIAL DEL AHORRO"),
          kv_table([
            ("Propietario / Razón social", payload.get("propietario","")),
            ("NIF/NIE", payload.get("nif","")),
            ("Domicilio", payload.get("domicilio","")),
            ("Teléfono", payload.get("telefono","")),
            ("Correo electrónico", payload.get("email","")),
          ])]
    # --- Hitos ---
    E += [section("HITOS DE LA ACTUACIÓN"),
          kv_table([("Fecha de inicio", payload.get("fecha_inicio","")),
                    ("Fecha de fin", payload.get("fecha_fin",""))])]
    # --- Calefacción ---
    c = payload.get("cal",{})
    E += [section("DATOS DE LA INSTALACIÓN DE CALEFACCIÓN"),
          comp_table(("COMPARATIVA","EXISTENTE","NUEVA"), [
            ("Tipo de equipo", c.get("tipo_ex",""), c.get("tipo_new","Bomba de calor")),
            ("Marca", c.get("marca_ex",""), c.get("marca_new","")),
            ("Modelo", c.get("modelo_ex",""), c.get("modelo_new","")),
            ("Fuente de energía", c.get("energia_ex",""), c.get("energia_new","Electricidad")),
            ("Nº serie unidad exterior", c.get("serie_ex","NO LEGIBLE"), c.get("serie_new","")),
            ("SCOPbdc / Rendimiento", c.get("rend_ex",""), c.get("scop_new","")),
          ])]
    # --- ACS ---
    E += [section("DATOS DE LA INSTALACIÓN AGUA CALIENTE SANITARIA (ACS)")]
    if payload.get("cambio_acs"):
        a = payload.get("acs",{})
        E += [comp_table(("COMPARATIVA","EXISTENTE","NUEVA"), [
            ("Tipo de equipo", a.get("tipo_ex",""), a.get("tipo_new","Bomba de calor")),
            ("Marca", a.get("marca_ex",""), a.get("marca_new","")),
            ("Modelo", a.get("modelo_ex",""), a.get("modelo_new","")),
            ("Fuente de energía", a.get("energia_ex",""), a.get("energia_new","Electricidad")),
            ("Nº serie equipo ACS", a.get("serie_ex","NO LEGIBLE"), a.get("serie_new","")),
            ("SCOPdhw / Rendimiento", a.get("rend_ex",""), a.get("scop_new","")),
          ])]
    else:
        E += [Paragraph("<b>No aplica.</b> Se mantiene la instalación de ACS existente; la actuación "
                        "afecta únicamente al servicio de calefacción.", st_p)]
    # --- Variables ---
    v = payload.get("variables",{})
    E += [section("VALORES DE LAS VARIABLES PARA EL AHORRO DE ENERGÍA"),
          variables_table(v, tp), Spacer(1,4)]
    donde = [
        f"<b>FP</b> Factor de ponderación = {v.get('FP','1')}",
        f"<b>DCAL</b> Demanda de calefacción = {v.get('DCAL','')} kWh/m²·año",
        f"<b>S</b> Superficie útil habitable = {v.get('S','')} m²",
        f"<b>DACS</b> Demanda de ACS = {v.get('DACS','')} kWh/año",
        f"<b>ηi</b> Rendimiento caldera combustible fósil (PCS) = {v.get('ni','')}",
        f"<b>SCOPbdc</b> Rendimiento estacional bomba de calor calefacción = {v.get('SCOPbdc','')}",
        f"<b>SCOPdhw</b> Rendimiento estacional bomba de calor ACS = {v.get('SCOPdhw','')}",
    ]
    if tp=="RES093":
        donde.append(f"<b>Cb</b> Coeficiente de cobertura por bivalencia en paralelo = {v.get('Cb','')}")
    donde += [f"<b>AETOTAL</b> Ahorro anual de energía final total = {v.get('AETOTAL','')} kWh/año",
              f"<b>Di</b> Vida útil de la actuación = {v.get('Di','15')} años"]
    E += [Paragraph("Donde:", st_pb)] + [Paragraph(d, st_small) for d in donde]
    # --- Instalador ---
    ins = payload.get("instalador",{})
    E += [section("DATOS DE LA EMPRESA INSTALADORA"),
          kv_table([("Razón social", ins.get("razon","")),
                    ("NIF/CIF", ins.get("cif","")),
                    ("Domicilio", ins.get("domicilio","")),
                    ("Cargo firmante", ins.get("cargo","Representante legal"))]),
          Spacer(1,16),
          Paragraph("Firma y sello: ____________________________________", st_val),
          Spacer(1,10),
          Paragraph("<i>Documento borrador generado por BROKERGY para revisión. Pendiente de firma "
                    "electrónica por el flujo de la aplicación.</i>", st_small)]

    # --- ANEXO I ---
    E += [PageBreak(),
          Paragraph("ANEXO I — JUSTIFICACIÓN DE LOS VALORES DE LAS VARIABLES DE LA FÓRMULA DE CÁLCULO "
                    f"DEL AHORRO DE ENERGÍA (FICHA {tp})", st_pb),
          HRFlowable(width="100%", thickness=0.8, color=BRAND, spaceAfter=6)]
    E += [Paragraph("1. FACTOR DE PONDERACIÓN FP", st_pb),
          Paragraph(f"Este valor es {v.get('FP','1')}, tal y como indica la ficha {tp}.", st_p)]
    E += [Paragraph("2. JUSTIFICACIÓN DE DCAL", st_pb),
          Paragraph("El valor de la demanda de calefacción se ha determinado directamente a partir del "
                    "Certificado de Eficiencia Energética del Edificio, elaborado y firmado por técnico "
                    "competente conforme al RD 390/2021, de 1 de junio.", st_p)]
    E += [Paragraph("3. JUSTIFICACIÓN DE LA SUPERFICIE S", st_pb),
          Paragraph("La superficie se ha obtenido directamente del Certificado de Eficiencia Energética "
                    "adjunto a este expediente CAE.", st_p)]
    E += [Paragraph("4. JUSTIFICACIÓN DE LA DEMANDA DE ACS (DACS)", st_pb),
          Paragraph(payload.get("just_dacs_texto",""), st_p)]
    E += [Paragraph("5. RENDIMIENTO DE CALDERA COMBUSTIBLE FÓSIL REFERIDO A PCS (ηi)", st_pb),
          Paragraph(payload.get("just_ni_texto",""), st_p)]
    # SCOP calefacción
    E += [Paragraph("6. RENDIMIENTO ESTACIONAL DE LA BOMBA DE CALOR EN CALEFACCIÓN (SCOPbdc)", st_pb)]
    ep = payload.get("scop_cal_eprel")
    if payload.get("scop_cal_metodo")=="eprel" and ep:
        E += [Paragraph(f"- Zona climática {ep.get('zona','')} · Condiciones equivalentes: Cálido · "
                        f"Bomba de calor aerotérmica · Sistema de distribución: {ep.get('emisor','')} "
                        f"({ep.get('tª','')}).", st_p),
              Paragraph(f"Justificación del SCOP en calefacción — Anexo IV de la ficha {tp}:", st_pb),
              Paragraph(f"SCOP = CC · (ηs,h + F(1) + F(2)) = {ep.get('cc','2,5')} · ({ep.get('etas','')} + "
                        f"{ep.get('f1','3%')} + {ep.get('f2','0%')}) → <b>SCOP en Calefacción = "
                        f"{v.get('SCOPbdc','')}</b>", st_p),
              Paragraph("Siendo CC el coeficiente de conversión (2,5), ηs,h la eficiencia energética "
                        "estacional de calefacción obtenida de la Ficha EPREL (clima cálido y temperatura "
                        "de impulsión declaradas), F(1) el factor de corrección por tecnología (bombas de "
                        "calor aerotérmicas, 3%) y F(2) el factor de corrección por clima (0%).", st_small)]
    else:
        E += [Paragraph(f"SCOP en Calefacción = {v.get('SCOPbdc','')}. Según la ficha técnica aportada por "
                        "el fabricante que se entrega como anexo al expediente CAE.", st_p)]
    # SCOPdhw
    E += [Paragraph("7. RENDIMIENTO ESTACIONAL SCOPdhw", st_pb),
          Paragraph(payload.get("scop_acs_texto", f"SCOP en ACS = {v.get('SCOPdhw','no aplica')}."), st_p)]
    # RES093: Cb
    if tp=="RES093" and payload.get("res093_cb"):
        cb = payload["res093_cb"]
        E += [Paragraph("8. COEFICIENTE DE COBERTURA POR BIVALENCIA (Cb)", st_pb),
              Paragraph("El ahorro se pondera mediante el coeficiente de cobertura por bivalencia (Cb), "
                        "fracción de la demanda de calefacción cubierta por la bomba de calor en modo "
                        "bivalente paralelo, determinado conforme al Anexo III de la ficha RES093:", st_p),
              Paragraph(f"PASO 1 — Potencia térmica total necesaria en proyecto: "
                        f"<b>{cb.get('pdiseno','')} kW</b>. Fuente: {cb.get('fuente_p','memoria técnica de diseño del RITE')}. "
                        f"{cb.get('fuente_p_detalle','')}", st_small),
              Paragraph(f"PASO 2 — Potencia térmica nominal de la bomba de calor en las condiciones del "
                        f"Anexo III (UNE-EN 14511, {cb.get('cond_ensayo','A7/W35')}), según ficha técnica del "
                        f"fabricante: <b>{cb.get('p_bdc','')} kW</b>.", st_small),
              Paragraph(f"PASO 3 — Cobertura de la bomba: {cb.get('p_bdc','')} kW / {cb.get('pdiseno','')} kW "
                        f"= {cb.get('cobertura','')}.", st_small),
              Paragraph(f"PASO 4 — Valor aplicado en la tabla del Anexo III ({cb.get('tecnologia','aerotermia')}), "
                        f"interpolando linealmente: <b>Cb = {cb.get('cb','')}</b>.", st_small),
              Paragraph("La caldera de combustión existente se mantiene (hibridación en modo paralelo).", st_p)]

    doc.build(E, onFirstPage=_footer, onLaterPages=_footer)
    return out_path

def build_res080(payload, doc, E):
    r = payload.get("res080",{}); v = payload.get("variables",{}); c = payload.get("cal",{})
    E += [section("IDENTIFICACIÓN DE LA ACTUACIÓN DE AHORRO DE ENERGÍA"),
          kv_table([
            ("Nombre de la actuación", payload.get("actuacion_nombre","")),
            ("Código y nombre de la ficha", payload.get("ficha_codigo_nombre","RES080: Rehabilitación profunda de edificios de viviendas")),
            ("Comunidad autónoma", payload.get("comunidad","")),
            ("Dirección postal", payload.get("direccion","")),
            ("Referencia catastral", payload.get("ref_catastral","")),
            ("Coordenadas UTM", f"X: {payload.get('utm_x','')} ; Y: {payload.get('utm_y','')}"),
          ]),
          section("IDENTIFICACIÓN DEL PROPIETARIO INICIAL DEL AHORRO"),
          kv_table([("Propietario / Razón social", payload.get("propietario","")),
                    ("NIF/NIE", payload.get("nif","")),
                    ("Domicilio", payload.get("domicilio","")),
                    ("Teléfono", payload.get("telefono","")),
                    ("Correo electrónico", payload.get("email",""))]),
          section("HITOS DE LA ACTUACIÓN"),
          kv_table([("Fecha de inicio", payload.get("fecha_inicio","")),
                    ("Fecha de fin", payload.get("fecha_fin",""))]),
          section("DIRECTOR REDACTOR DEL CERTIFICADO"),
          kv_table([("Nombre", r.get("director","")),("Entidad", r.get("entidad","")),
                    ("Titulación", r.get("titulacion","")),("Email", r.get("email","")),
                    ("Teléfono", r.get("tlf",""))]),
          section("CÁLCULO DEL AHORRO DE ENERGÍA FINAL TOTAL (AETOTAL = FP · (EFi − EFf))"),
          kv_table([("EFi — consumo energía final anual antes [kWh/año]", r.get("efi","")),
                    ("EFf — consumo energía final anual después [kWh/año]", r.get("eff","")),
                    ("AETOTAL — ahorro anual de energía final [kWh/año]", r.get("aetotal_kwh",""))]),
          section("DATOS DE LA INSTALACIÓN TÉRMICA (CALEFACCIÓN)"),
          comp_table(("COMPARATIVA","EXISTENTE","NUEVA"), [
            ("Tipo de equipo", c.get("tipo_ex","Caldera"), c.get("tipo_new","Bomba de Calor (Aerotermia)")),
            ("Marca", c.get("marca_ex",""), c.get("marca_new","")),
            ("Modelo", c.get("modelo_ex",""), c.get("modelo_new","")),
            ("Combustible", c.get("energia_ex",""), c.get("energia_new","Electricidad")),
            ("Nº serie unidad exterior", c.get("serie_ex",""), c.get("serie_new","")),
            ("SCOP / Rendimiento", c.get("rend_ex","Según CEE inicial"), c.get("scop_new","")),
          ])]
    if payload.get("res080_ventanas_texto"):
        E += [section("DESCRIPCIÓN DE LA ACTUACIÓN SOBRE LAS VENTANAS"),
              Paragraph(payload.get("res080_ventanas_texto",""), st_p)]
    E += [Paragraph("<i>Documento borrador generado por BROKERGY para revisión. La firma la realiza el "
                    "director redactor por el flujo de la aplicación. Se adjuntan como anexos las fichas "
                    "técnicas de los equipos y de la carpintería/vidrio.</i>", st_small)]
    doc.build(E, onFirstPage=_footer, onLaterPages=_footer)
    return doc.filename

def merge_annexes(core_pdf, annexes, out_pdf):
    from pypdf import PdfReader, PdfWriter
    w = PdfWriter()
    for p in [core_pdf] + [a for a in annexes if a and os.path.exists(a)]:
        try:
            for pg in PdfReader(p).pages:
                w.add_page(pg)
        except Exception as e:
            sys.stderr.write(f"[warn] no se pudo anexar {p}: {e}\n")
    with open(out_pdf,"wb") as f:
        w.write(f)
    return out_pdf

def main():
    if len(sys.argv) < 3:
        print("uso: generar_cifo.py payload.json salida.pdf"); sys.exit(1)
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    core = out.replace(".pdf","_core.pdf")
    build_core(payload, core)
    annexes = payload.get("anexos", [])
    if annexes:
        merge_annexes(core, annexes, out)
    else:
        os.replace(core, out)
    print(out)

if __name__ == "__main__":
    main()
