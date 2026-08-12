#!/usr/bin/env python3
"""
PRUEBAS DEL CERTIFICADO DE INSTALACIÓN TÉRMICA (RITE) — FUENTE ÚNICA.

El certificado oficial NO tiene una fecha de cabecera: tiene una TABLA con las
diez pruebas posibles y, al lado de cada una, la fecha en que se hizo (o "--" si
no procede). Esa tabla se imprime SIEMPRE entera y en el MISMO orden que el
modelo oficial: quien la revisa la compara casilla a casilla con el impreso, y
una tabla recortada o reordenada obliga a releerla.

Qué pruebas proceden lo decide el EMISOR, porque es lo que determina si hay
circuito de agua, red de conductos o ninguno de los dos:

  · SUELO RADIANTE / RADIADORES → hay circuito de agua, no hay red de conductos
  · CONDUCTOS (aire-aire)       → hay red de conductos, no hay circuito de agua
  · SPLITS (aire-aire)          → no hay ni red de agua ni de conductos

NOTA — "Pruebas de estanqueidad circuitos frigoríficos": no se marca en ningún
caso. En una aerotermia el circuito frigorífico viene sellado y cargado de
fábrica, así que no es una prueba de recepción en obra. Si alguna vez hay que
declararla en los equipos partidos cargados en obra, basta con añadir la
constante a `_SPLITS` / `_CONDUCTOS`.
"""

# ── Textos EXACTOS del impreso oficial ───────────────────────────────────────
EQUIPOS       = "Prueba de los equipos"
ESTANQ_AGUA   = "Prueba de estanqueidad redes de tuberías de agua"
ESTANQ_FRIGO  = "Pruebas de estanqueidad circuitos frigoríficos"
LIBRE_DILAT   = "Pruebas de Libre dilatación"
RECEP_AIRE    = "Pruebas de recepción de redes de conductos de aire"
ESTANQ_CHIM   = "Pruebas de estanqueidad chimeneas"
UNE_12599     = "Pruebas finales según UNE-EN 12599"
AJUSTE_AIRE   = "Ajuste y equilibrado del sistema de distribución y difusión de aire"
AJUSTE_AGUA   = "Ajuste y equilibrado del sistema de distribución de agua"
EFIC_ENERG    = "Eficiencia Energética"

# Disposición del impreso: se lee por FILAS, dos columnas. No se toca.
PRUEBAS_FILAS = [
    (EQUIPOS,      ESTANQ_CHIM),
    (ESTANQ_AGUA,  UNE_12599),
    (ESTANQ_FRIGO, AJUSTE_AIRE),
    (LIBRE_DILAT,  AJUSTE_AGUA),
    (RECEP_AIRE,   EFIC_ENERG),
]

# ── Qué procede según el emisor ──────────────────────────────────────────────
_AGUA = {EQUIPOS, ESTANQ_AGUA, UNE_12599, AJUSTE_AGUA, EFIC_ENERG}
_CONDUCTOS = {EQUIPOS, UNE_12599, EFIC_ENERG, RECEP_AIRE, AJUSTE_AIRE}
_SPLITS = {EQUIPOS, UNE_12599, EFIC_ENERG, AJUSTE_AIRE}

# La clave es la etiqueta que ya usa `supabase_client._EMISOR_LABELS`.
_POR_EMISOR = {
    "SUELO RADIANTE": _AGUA,
    "RADIADORES": _AGUA,
    "CONDUCTOS": _CONDUCTOS,
    "SPLITS": _SPLITS,
}


def _aplican(emisor):
    """Conjunto de pruebas que proceden. Un emisor desconocido cae en el de agua
    (radiadores y suelo radiante son la inmensa mayoría de los expedientes)."""
    return _POR_EMISOR.get((emisor or "").strip().upper(), _AGUA)


def pruebas_tabla(emisor):
    """Tabla COMPLETA en el orden del impreso, para el borrador del certificado.

    Devuelve [[{nombre, aplica}, {nombre, aplica}], ...] — una lista por fila.
    """
    ap = _aplican(emisor)
    return [[{"nombre": n, "aplica": n in ap} for n in fila] for fila in PRUEBAS_FILAS]


def pruebas_realizadas(emisor):
    """Solo las pruebas que proceden, en el orden del impreso (columna izquierda
    y luego derecha). Es lo que lista la guía JE6, donde cada línea es una casilla
    que hay que rellenar en la plataforma."""
    ap = _aplican(emisor)
    izq = [f[0] for f in PRUEBAS_FILAS if f[0] in ap]
    der = [f[1] for f in PRUEBAS_FILAS if f[1] in ap]
    return izq + der
