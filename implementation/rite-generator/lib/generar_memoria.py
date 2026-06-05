#!/usr/bin/env python3
"""
Generador de la MEMORIA TÉCNICA RITE (.docx) — modelo RD 1027/2007 JCCM.

AUTÓNOMO: no depende de librerías externas de Office. Manipula el .docx
(que es un ZIP) directamente con `zipfile` + edición de XML.

La plantilla usa campos de formulario legacy (FORMTEXT / FORMCHECKBOX) cuyos
nombres están DUPLICADOS (Texto33 ×3, Casilla31 ×N), por lo que el relleno se
hace POR POSICIÓN (índice de aparición del campo), no por nombre.

Uso:
    from lib.generar_memoria import generar_memoria
    generar_memoria(plantilla_path, text_by_pos, check_positions, salida_path)
"""
import re
import zipfile
import shutil
import os

DOC_XML = "word/document.xml"


def _esc(s: str) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _build_field_index(xml: str):
    """Lista ordenada de campos de formulario (con nombre) y su offset en el XML.
    Se ignoran los <w:ffData> sin <w:name> para alinear el índice con el mapeo."""
    fields = []
    for m in re.finditer(r"<w:ffData>(.*?)</w:ffData>", xml, re.DOTALL):
        block = m.group(1)
        name_m = re.search(r'<w:name w:val="([^"]*)"', block)
        name = name_m.group(1) if name_m else ""
        if not name:
            continue
        typ = "check" if "<w:checkBox>" in block else "text"
        fields.append({"name": name, "type": typ,
                       "start": m.start(), "end": m.end()})
    return fields


def rellenar_xml(xml: str, text_by_pos: dict, check_positions) -> str:
    """Aplica los valores por posición. Procesa de atrás hacia adelante para no
    invalidar offsets."""
    text_vals = {int(k): v for k, v in text_by_pos.items()}
    check_set = set(int(p) for p in check_positions)
    fields = _build_field_index(xml)

    for i in range(len(fields) - 1, -1, -1):
        f = fields[i]
        if f["type"] == "check" and i in check_set:
            seg = xml[f["start"]:f["end"]]
            if '<w:checked w:val="1"/>' in seg:
                continue
            if '<w:checked w:val="0"/>' in seg:
                seg2 = seg.replace('<w:checked w:val="0"/>',
                                   '<w:checked w:val="1"/>', 1)
            elif "<w:checked/>" in seg:
                seg2 = seg
            elif "<w:default w:val=" in seg:
                seg2 = re.sub(r'(<w:default w:val="[^"]*"/>)',
                              r'\1<w:checked w:val="1"/>', seg, count=1)
            else:
                seg2 = seg.replace("<w:sizeAuto/>",
                                   '<w:sizeAuto/><w:checked w:val="1"/>', 1)
            xml = xml[:f["start"]] + seg2 + xml[f["end"]:]

        elif f["type"] == "text" and i in text_vals:
            val = _esc(text_vals[i])
            after = xml[f["end"]:]
            sep = after.find('fldCharType="separate"')
            endc = after.find('fldCharType="end"')
            if sep != -1 and (endc == -1 or sep < endc):
                region = after[sep:endc] if endc != -1 else after[sep:sep + 2000]
                tm = re.search(r"(<w:t[^>]*>)(.*?)(</w:t>)", region, re.DOTALL)
                if tm:
                    abs_s = f["end"] + sep + tm.start()
                    abs_e = f["end"] + sep + tm.end()
                    xml = xml[:abs_s] + tm.group(1) + val + tm.group(3) + xml[abs_e:]
    return xml


def generar_memoria(plantilla_path: str, text_by_pos: dict,
                    check_positions, salida_path: str) -> str:
    """Genera el .docx final copiando la plantilla y reescribiendo document.xml."""
    # Copiamos la plantilla a la salida y editamos en sitio dentro del ZIP
    tmp = salida_path + ".tmp.zip"
    with zipfile.ZipFile(plantilla_path, "r") as zin:
        names = zin.namelist()
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for n in names:
                data = zin.read(n)
                if n == DOC_XML:
                    xml = data.decode("utf-8")
                    xml = rellenar_xml(xml, text_by_pos, check_positions)
                    data = xml.encode("utf-8")
                zout.writestr(n, data)
    shutil.move(tmp, salida_path)
    return salida_path


def contar_campos(plantilla_path: str) -> int:
    with zipfile.ZipFile(plantilla_path, "r") as z:
        xml = z.read(DOC_XML).decode("utf-8")
    return len(_build_field_index(xml))
