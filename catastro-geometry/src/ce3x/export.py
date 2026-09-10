"""Escritura de output/ce3x_geometry.{csv,json} (§14)."""
from __future__ import annotations

import csv
import json
from pathlib import Path

from .schema import COLUMNAS, ElementoCE3X


def escribir_csv(elems: list[ElementoCE3X], destino: Path) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNAS, delimiter=";")
        w.writeheader()
        for e in elems:
            w.writerow(e.fila_csv())
    return destino


def escribir_json(elems: list[ElementoCE3X], destino: Path, contexto: dict) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    doc = {**contexto, "elementos": [e.to_dict() for e in elems]}
    destino.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    return destino


def resumen(elems: list[ElementoCE3X]) -> dict:
    out: dict = {"total": len(elems), "por_tipo": {}, "revision": 0,
                 "superficie_por_tipo_m2": {}}
    for e in elems:
        out["por_tipo"][e.tipo] = out["por_tipo"].get(e.tipo, 0) + 1
        if e.superficie.available:
            out["superficie_por_tipo_m2"][e.tipo] = round(
                out["superficie_por_tipo_m2"].get(e.tipo, 0.0) + e.superficie.value, 2)
        if e.requiere_revision:
            out["revision"] += 1
    return out


def tabla_consola(elems: list[ElementoCE3X], limite: int = 60) -> str:
    """La tabla del §25, con el largo x alto a la vista."""
    cab = (f"{'ID':<7}{'Planta':<8}{'Tipo':<30}{'Contacto':<24}"
           f"{'Largo x alto':>16}{'Superficie':>13}  {'Orient.':<8}")
    filas = [cab, "-" * len(cab)]
    for e in elems[:limite]:
        lxa = e.largo_x_alto or "-"
        sup = f"{e.superficie.value:.2f} m2" if e.superficie.available else "NO DISPONIBLE"
        marca = " *" if e.requiere_revision else ""
        filas.append(f"{e.id:<7}{e.planta:<8}{e.tipo:<30}{e.contacto:<24}"
                     f"{lxa:>16}{sup:>13}  {(e.orientacion or '-'):<8}{marca}")
    if len(elems) > limite:
        filas.append(f"... y {len(elems) - limite} mas (ver el CSV)")
    filas.append("")
    filas.append("* = requiere revision humana")
    return "\n".join(filas)
