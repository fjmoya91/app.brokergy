#!/usr/bin/env python3
"""Calcula fecha de inicio y fin del CIFO segun la regla BROKERGY.

Inicio CIFO = lo PRIMERO entre las facturas de la obra y la fecha de pruebas del RITE.
Fin CIFO    = lo ULTIMO de las mismas (Fran, 16/11/2026, que corrige lo del 15/11).
Las facturas que no son de la obra (p. ej. una bancada) no se pasan.

La fecha de pruebas del RITE vive en la carpeta '7. LEGALIZACION RITE'.

TODAS las facturas cuentan para el inicio, tambien la de acopio de material o un
anticipo: es el primer compromiso en firme (RD 36/2023; Marwen CAE-2078, 12/11/2026).
No se excluye ninguna con `motivo_no_inicio` ni se retrasa con un inicio manual.

Uso:
  echo '{"facturas":["2024-06-14","2024-08-28","2025-03-07"],"rite_pruebas":"2025-10-21"}' | python3 compute_fechas_cifo.py
  -> inicio 2024-06-14 / fin 2025-10-21
  echo '{"facturas":["2025-03-07"],"rite_pruebas":"2025-02-20"}' | python3 compute_fechas_cifo.py
  -> inicio 2025-02-20 / fin 2025-03-07
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
        "fecha_inicio_cifo": candidatos[0].isoformat(),   # PRIMERA (facturas o RITE)
        "fecha_fin_cifo": candidatos[-1].isoformat(),      # ULTIMA
        "warnings": warnings,
    }


if __name__ == "__main__":
    data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    out = compute(data.get("facturas", []), data.get("rite_pruebas"))
    print(json.dumps(out, indent=2, ensure_ascii=False))
