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
import struct

DOC_XML = "word/document.xml"
RELS_XML = "word/_rels/document.xml.rels"
# La plantilla incrusta el esquema hidráulico de la página 4 como `media/image1.emf`
# (VML <v:imagedata r:id="rId7">). Lo sustituimos por la imagen que toque según si
# se cambia o no el ACS.
ESQUEMA_MEDIA_EMF = "word/media/image1.emf"


def _png_size(data: bytes):
    """Ancho/alto de un PNG leyendo la cabecera IHDR (sin dependencias externas)."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", data[16:24])
        return w, h
    return None, None


def _ajustar_esquema(xml: str, img_w: int, img_h: int) -> str:
    """Reescala la altura del hueco del esquema para respetar el ratio de la nueva
    imagen (mantiene el ancho en pt). Evita que el PNG salga deformado."""
    if not img_w or not img_h:
        return xml
    m = re.search(r'(<v:shape\b[^>]*style="width:)([\d.]+)(pt;height:)([\d.]+)(pt")', xml)
    if not m:
        return xml
    width_pt = float(m.group(2))
    new_h = round(width_pt * img_h / img_w, 1)
    return xml[:m.start()] + f"{m.group(1)}{m.group(2)}{m.group(3)}{new_h}{m.group(5)}" + xml[m.end():]


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
                    check_positions, salida_path: str,
                    esquema_img_path: str = None) -> str:
    """Genera el .docx final copiando la plantilla y reescribiendo document.xml.

    Si se pasa `esquema_img_path` (PNG), sustituye el esquema hidráulico de la
    página 4 por esa imagen: la escribe como `media/image1.png`, reapunta la
    relación rId7 (emf→png) y reajusta la altura del hueco al ratio de la imagen.
    Degrada con elegancia: si el fichero no existe, se mantiene el esquema original.
    """
    swap = None
    if esquema_img_path and os.path.exists(esquema_img_path):
        with open(esquema_img_path, "rb") as fh:
            img_bytes = fh.read()
        w, h = _png_size(img_bytes)
        swap = {"bytes": img_bytes, "w": w, "h": h}

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
                    if swap:
                        xml = _ajustar_esquema(xml, swap["w"], swap["h"])
                    data = xml.encode("utf-8")
                elif swap and n == RELS_XML:
                    data = data.replace(b"media/image1.emf", b"media/image1.png")
                elif swap and n == ESQUEMA_MEDIA_EMF:
                    continue  # se reemplaza por el PNG (escrito tras el bucle)
                zout.writestr(n, data)
            if swap:
                zout.writestr("word/media/image1.png", swap["bytes"])
    shutil.move(tmp, salida_path)
    return salida_path


def contar_campos(plantilla_path: str) -> int:
    with zipfile.ZipFile(plantilla_path, "r") as z:
        xml = z.read(DOC_XML).decode("utf-8")
    return len(_build_field_index(xml))
