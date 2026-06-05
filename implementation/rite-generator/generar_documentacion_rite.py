#!/usr/bin/env python3
"""
ORQUESTADOR — Genera la documentación RITE de un expediente:
  1. MEMORIA TÉCNICA (.docx)
  2. GUÍA DE ALTA JE6 (.pdf)  [tipo guiaburros, copiar-pegar]

Modos de uso:

  # Desde Supabase (producción): requiere DATABASE_URL en el entorno
  python generar_documentacion_rite.py --expediente 26RES060_120 --salida ./out

  # Desde un JSON ya extraído (test sin conexión)
  python generar_documentacion_rite.py --from-json examples/expediente_26RES060_120_supabase.json --salida ./out

Estructura de salida:
  out/MEMORIA_RITE_<expediente>.docx
  out/GUIA_JE6_<expediente>.pdf
"""
import os
import sys
import json
import argparse
import zipfile
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib.generar_memoria import generar_memoria, _build_field_index
from lib.mapeo import construir_relleno
from lib import generar_guia_je6 as guia
from lib import generar_borrador_certificado as borrador
from lib import supabase_client as sc

PLANTILLA = os.path.join(os.path.dirname(__file__), "assets", "plantilla_rite_jccm.docx")


def _nombres_campos(plantilla_path):
    with zipfile.ZipFile(plantilla_path, "r") as z:
        xml = z.read("word/document.xml").decode("utf-8")
    return [f["name"] for f in _build_field_index(xml)]


def generar(datos: dict, salida_dir: str):
    os.makedirs(salida_dir, exist_ok=True)
    exp = datos["expediente"]

    # 1) MEMORIA .docx
    nombres = _nombres_campos(PLANTILLA)
    text_by_pos, check_positions = construir_relleno(datos, nombres)
    out_docx = os.path.join(salida_dir, f"MEMORIA_RITE_{exp}.docx")
    generar_memoria(PLANTILLA, text_by_pos, check_positions, out_docx)
    print(f"  [OK] Memoria: {out_docx}  ({len(text_by_pos)} campos, {len(check_positions)} casillas)")

    # 2) GUÍA JE6 .pdf  +  3) BORRADOR CERTIFICADO .pdf (misma data)
    guia_datos = _datos_guia(datos)
    out_pdf = os.path.join(salida_dir, f"GUIA_JE6_{exp}.pdf")
    guia.build(guia_datos, out_pdf)
    out_borrador = os.path.join(salida_dir, f"BORRADOR_CERTIFICADO_RITE_{exp}.pdf")
    borrador.build(guia_datos, out_borrador)
    return [out_docx, out_pdf, out_borrador]


def _datos_guia(d: dict) -> dict:
    """Adapta el dict normalizado al formato que espera el generador de guía."""
    t = d["titular"]; ins = d["instalacion"]; inst = d["instalador"]; p = d["potencia"]
    return {
        "expediente": d["expediente"],
        "titular": {"nombre": t["nombre"], "ape1": t["ape1"], "ape2": t["ape2"], "nif": t["nif"]},
        "emplazamiento": {
            "direccion": ins["calle"] or t["calle"], "cp": ins["cp"],
            "provincia": ins["provincia"], "localidad": ins["localidad"],
            "ref_catastral": ins["ref_catastral"],
            "utm_x": ins.get("coord_x"), "utm_y": ins.get("coord_y")},
        "tecnicos": {
            "instalacion": "REFORMA" if d["tipo"]["reforma"] else "NUEVA",
            "caracter": "INDIVIDUAL",
            "tipo": [x for x, on in [("CALEFACCIÓN", d["objeto"]["calefaccion"]),
                                     ("AGUA CALIENTE SANITARIA", d["objeto"]["acs"]),
                                     ("REFRIGERACIÓN", d["objeto"].get("climatizacion"))] if on],
            "uso": "VIVIENDA", "combustible": "AEROTERMIA (Otros)", "almacenamiento": "NO"},
        "potencia": p,
        "solar": {"paneles": 0, "superficie": 0, "apoyo": 0},
        "memoria": {"autor": inst["nombre_firma"], "nif_autor": inst.get("nif_firma", "")},
        "instalador": {
            "razon_social": inst["razon_social"], "cif": inst["cif"],
            "num_registro_industrial": inst["num_empresa_rite"],
            "instalador_nombre": inst["nombre_firma"], "instalador_nif": inst.get("nif_firma", "")},
        "pruebas_fecha": d.get("pruebas_fecha"),
        "pruebas": [
            "Prueba de los equipos",
            "Prueba de estanqueidad redes de tuberías de agua",
            "Pruebas finales según UNE-EN 12599",
            "Ajuste y equilibrado del sistema de distribución de agua",
            "Eficiencia Energética"],
    }


def main():
    ap = argparse.ArgumentParser(description="Generador de documentación RITE")
    ap.add_argument("--expediente", help="Nº de expediente (lee de Supabase)")
    ap.add_argument("--from-json", help="Ruta a JSON crudo de expediente (modo test)")
    ap.add_argument("--salida", default="./out", help="Directorio de salida")
    ap.add_argument("--fecha-firma", default=None, help="Fecha firma (YYYY-MM-DD)")
    a = ap.parse_args()

    if a.from_json:
        with open(a.from_json, encoding="utf-8") as f:
            crudo = json.load(f)
        # El JSON de ejemplo es una lista [fila]; lo envolvemos
        if isinstance(crudo, list):
            crudo = crudo[0]
        raw = {"exp": crudo, "instalador": crudo.get("_instalador")}
        # Si no trae instalador embebido, intentar Supabase
        if raw["instalador"] is None and os.environ.get("DATABASE_URL"):
            inst_id = (crudo.get("instalacion") or {}).get("instalador_id")
            if inst_id:
                with sc._conn() as c, c.cursor(row_factory=__import__("psycopg").rows.dict_row) as cur:
                    cur.execute(sc.SQL_INSTALADOR, (inst_id,))
                    raw["instalador"] = cur.fetchone()
        datos = sc.normalizar(raw, a.fecha_firma)
    elif a.expediente:
        raw = sc.cargar_desde_supabase(a.expediente)
        datos = sc.normalizar(raw, a.fecha_firma)
    else:
        ap.error("Indica --expediente o --from-json")

    print(f"Generando documentación RITE de {datos['expediente']}...")
    rutas = generar(datos, a.salida)
    for r in rutas:
        print(f"  [OK] {r}")
    print("Hecho.")


if __name__ == "__main__":
    main()
