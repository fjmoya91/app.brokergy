#!/usr/bin/env python3
"""
Estimación de cargas térmicas por estancia (OPCIÓN B).

Las cargas por local NO están en Supabase. Se estiman repartiendo la superficie
total en estancias típicas de vivienda y aplicando un factor W/m2 según zona
climática. ESTO ES UNA ESTIMACIÓN: revisar antes de firmar.
"""

import math

# Factor de carga térmica por zona climática (W/m2), orientativo para vivienda
FACTOR_ZONA = {
    "A": 60, "B": 70, "C": 80, "D": 90, "E": 100,
}


# Potencia térmica de UN elemento de radiador de aluminio de 600 mm a ΔT50
# (EN 442). Los fabricantes dan 119-141 W; 100 W deja margen para la impulsión
# más baja de la aerotermia. Criterio acordado el 2026-09-22.
W_POR_ELEMENTO = 100

# Máximo de filas de la tabla de la plantilla oficial de la JCCM.
MAX_FILAS = 25


def elementos_radiador(potencia_w, emisor: str) -> str:
    """Elementos de radiador que cubren la potencia de la estancia. Solo con
    RADIADORES: con suelo radiante o unidades aire-aire la columna va en blanco."""
    if not str(emisor or "").upper().startswith("RADIADOR"):
        return ""
    try:
        w = float(potencia_w or 0)
    except (TypeError, ValueError):
        return ""
    if w <= 0:
        return ""
    return str(math.ceil(w / W_POR_ELEMENTO))


def factor_por_zona(zona_climatica: str) -> int:
    """Devuelve W/m2 según la letra de zona (D3 -> D -> 90)."""
    if not zona_climatica:
        return 90
    return FACTOR_ZONA.get(zona_climatica[0].upper(), 90)


def estimar_cargas(superficie_total: float, plantas: int,
                   zona_climatica: str, emisor: str = "RADIADOR") -> list:
    """Reparte la superficie en estancias típicas y calcula cargas.
    Devuelve lista de dicts con las columnas de la tabla RITE."""
    factor = factor_por_zona(zona_climatica)
    sup = float(superficie_total or 0)

    # Reparto porcentual típico de vivienda unifamiliar (suma 100%)
    plantilla_pb = [
        ("SALON-COMEDOR", 0.196, "S"), ("COCINA", 0.093, "E"),
        ("DORMITORIO 1", 0.082, "O"), ("BAÑO 1", 0.036, "N"),
        ("HALL-DISTRIBUIDOR", 0.067, "-"), ("ASEO", 0.026, "N"),
    ]
    plantilla_p1 = [
        ("DORMITORIO 2", 0.103, "S"), ("DORMITORIO 3", 0.093, "E"),
        ("DORMITORIO 4", 0.082, "O"), ("BAÑO 2", 0.046, "N"),
        ("DISTRIBUIDOR", 0.072, "-"), ("VESTIDOR", 0.103, "S"),
    ]

    if plantas and int(plantas) >= 2:
        reparto = [("0", x) for x in plantilla_pb] + [("1", x) for x in plantilla_p1]
    else:
        # Una sola planta: combinar todo en planta 0
        todas = plantilla_pb + plantilla_p1
        total_pct = sum(p[1] for p in todas)
        reparto = [("0", (n, pct / total_pct, o)) for (n, pct, o) in todas]

    cargas = []
    acc_sup = 0
    for idx, (planta, (local, pct, orient)) in enumerate(reparto, start=1):
        m2 = round(sup * pct)
        acc_sup += m2
        w = m2 * factor
        cargas.append({
            "planta": planta, "tipo_local": local, "num": idx,
            "superficie_m2": m2, "orientacion": orient,
            "cargas_calculo": f"{m2}x{factor}", "emisor": emisor,
            "elementos": elementos_radiador(w, emisor), "potencia_instalada": w,
        })
    # Ajuste de redondeo en la última estancia
    if cargas and acc_sup != round(sup):
        diff = round(sup) - acc_sup
        cargas[-1]["superficie_m2"] += diff
        m2 = cargas[-1]["superficie_m2"]
        cargas[-1]["cargas_calculo"] = f"{m2}x{factor}"
        cargas[-1]["potencia_instalada"] = m2 * factor
        cargas[-1]["elementos"] = elementos_radiador(m2 * factor, emisor)
    return cargas


def _num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _m2_texto(m2: float) -> str:
    return str(int(m2)) if float(m2).is_integer() else f"{m2:.1f}".replace(".", ",")


def cargas_desde_locales(rite_locales: dict, zona_climatica: str,
                         emisor: str = "RADIADORES") -> list:
    """Tabla de cargas a partir de las ESTANCIAS que se confirmaron en la app
    (`documentacion.rite_locales`). El nombre, la orientación y los m² vienen ya
    resueltos (fuente única: frontend logic/localesRite.js); aquí solo se aplica el
    factor de la zona y se cuentan los elementos. Devuelve [] si no hay estancias."""
    factor = factor_por_zona(zona_climatica)
    cargas = []
    for p in (rite_locales or {}).get("plantas") or []:
        planta = str(p.get("planta", "0"))
        for l in p.get("locales") or []:
            nombre = str(l.get("nombre") or "").strip()
            if not nombre:
                continue
            m2 = round(max(0.0, _num(l.get("m2"))), 1)
            w = round(m2 * factor)
            cargas.append({
                "planta": planta, "tipo_local": nombre, "num": len(cargas) + 1,
                "superficie_m2": _m2_texto(m2),
                "orientacion": str(l.get("orientacion") or "-"),
                "cargas_calculo": f"{_m2_texto(m2)}x{factor}", "emisor": emisor,
                "elementos": elementos_radiador(w, emisor), "potencia_instalada": w,
            })
    return cargas[:MAX_FILAS]
