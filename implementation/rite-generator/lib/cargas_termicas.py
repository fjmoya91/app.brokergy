#!/usr/bin/env python3
"""
Estimación de cargas térmicas por estancia (OPCIÓN B).

Las cargas por local NO están en Supabase. Se estiman repartiendo la superficie
total en estancias típicas de vivienda y aplicando un factor W/m2 según zona
climática. ESTO ES UNA ESTIMACIÓN: revisar antes de firmar.
"""

# Factor de carga térmica por zona climática (W/m2), orientativo para vivienda
FACTOR_ZONA = {
    "A": 60, "B": 70, "C": 80, "D": 90, "E": 100,
}


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
            "elementos": "", "potencia_instalada": w,
        })
    # Ajuste de redondeo en la última estancia
    if cargas and acc_sup != round(sup):
        diff = round(sup) - acc_sup
        cargas[-1]["superficie_m2"] += diff
        m2 = cargas[-1]["superficie_m2"]
        cargas[-1]["cargas_calculo"] = f"{m2}x{factor}"
        cargas[-1]["potencia_instalada"] = m2 * factor
    return cargas
