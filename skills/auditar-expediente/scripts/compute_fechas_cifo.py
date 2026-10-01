#!/usr/bin/env python3
"""Calcula fecha de inicio y fin del CIFO segun la regla BROKERGY.

Candidatos = todas las fechas de factura + la fecha de pruebas del RITE.
  Inicio CIFO = la PRIMERA (mas antigua) de esos candidatos.
  Fin CIFO    = la ULTIMA (mas reciente) de esos candidatos.

La fecha de pruebas del RITE vive en la carpeta '7. LEGALIZACION RITE'.

Uso:
  echo '{"facturas":["2024-06-14","2024-08-28","2025-03-07"],"rite_pruebas":"2025-10-21"}' | python3 compute_fechas_cifo.py
  -> inicio 2024-06-14 / fin 2025-10-21
"""
import sys
import json
from datetime import date


def _parse(d):
    if not d:
        return None
    return date.fromisoformat(d)


def compute(facturas=None, rite_pruebas=None):
    facturas = facturas or []
    candidatos = sorted(
        d for d in ([_parse(f) for f in facturas] + [_parse(rite_pruebas)]) if d
    )
    warnings = []
    if not facturas:
        warnings.append("AVISO: no hay fechas de factura")
    if not rite_pruebas:
        warnings.append("AVISO: falta la fecha de pruebas del RITE (carpeta '7. LEGALIZACION RITE')")
    if not candidatos:
        return {"fecha_inicio_cifo": None, "fecha_fin_cifo": None, "warnings": warnings}

    return {
        "fecha_inicio_cifo": candidatos[0].isoformat(),   # PRIMERA
        "fecha_fin_cifo": candidatos[-1].isoformat(),      # ULTIMA
        "warnings": warnings,
    }


if __name__ == "__main__":
    data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    out = compute(data.get("facturas", []), data.get("rite_pruebas"))
    print(json.dumps(out, indent=2, ensure_ascii=False))
