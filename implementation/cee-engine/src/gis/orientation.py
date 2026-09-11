"""Azimut -> orientacion CE3X (§7).

El azimut es el de la NORMAL EXTERIOR del cerramiento (hacia donde MIRA la
fachada), no el de la linea. Se mide en grados desde el Norte y en sentido
horario, en un CRS proyectado donde +y es el Norte (EPSG:25830).
"""
from __future__ import annotations

import math

#: Las ocho orientaciones que admite CE3X.
ORIENTACIONES = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
_SECTOR = 360.0 / len(ORIENTACIONES)   # 45 grados


def azimut_desde_normal(nx: float, ny: float) -> float:
    """Vector normal (en CRS proyectado) -> azimut en grados [0, 360)."""
    if nx == 0.0 and ny == 0.0:
        raise ValueError("vector normal nulo")
    return math.degrees(math.atan2(nx, ny)) % 360.0


def orientacion(azimut: float) -> str:
    """0 -> N, 90 -> E, 180 -> S, 270 -> O. Los limites caen a mitad de sector."""
    idx = int(((azimut % 360.0) + _SECTOR / 2) // _SECTOR) % len(ORIENTACIONES)
    return ORIENTACIONES[idx]


def diferencia_angular(a: float, b: float) -> float:
    """Menor angulo entre dos azimuts, en [0, 180]."""
    return abs((a - b + 180.0) % 360.0 - 180.0)
