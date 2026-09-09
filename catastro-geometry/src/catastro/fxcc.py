"""Cartografia catastral por plantas: DXF y FXCC (§6).

POR QUE EXISTE ESTE MODULO
--------------------------
Los servicios publicos de Catastro dan el USO y la SUPERFICIE por planta
(Consulta_DNPRC -> `lcons`), y dan la GEOMETRIA de la parcela y del edificio
(INSPIRE WFS). Lo que NO dan por ninguna via publica automatizable es el
VINCULO entre las dos cosas: que poligono concreto es el garaje y cual la
vivienda. Ese vinculo solo esta en la cartografia catastral detallada:

  * DXF de la parcela  - descarga desde la Sede Electronica del Catastro
        Sede -> Consulta de bienes inmuebles -> [RC] -> "Cartografia" ->
        "Descargar croquis / DXF".
        Es una descarga interactiva con CAPTCHA para usuario no identificado.
        Con certificado digital o Cl@ve no hay captcha, pero sigue siendo la
        web, no un endpoint documentado.
        => NO hay endpoint reproducible. No se hace scraping (§6).

  * FXCC (Formato de intercambio de Cartografia Catastral) - fichero de
        intercambio municipal completo. Se obtiene por la via de "Descarga de
        cartografia vectorial" de la Sede, que exige identificacion, o por
        convenio con la D.G. del Catastro.

Por eso este modulo es un LECTOR DE FICHERO APORTADO (`--dxf` / `--fxcc`), no
un cliente de red. Con el fichero delante, el reparto uso <-> poligono si sale.

ESTADO
------
  * DXF   : implementado y probado (lector de codigos de grupo, sin dependencias).
  * FXCC  : NO INTERPRETADO. Se lee y se inventaria por tipo de registro, pero
            no se traduce a geometria: no se ha podido contrastar el layout
            contra un fichero real, y un parser de formato fijo adivinado
            produciria poligonos plausibles y falsos. Ver README §6.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

from shapely.geometry import LineString, Polygon
from shapely.geometry.base import BaseGeometry

log = logging.getLogger(__name__)

#: Capas del DXF de Catastro que llevan el contorno de lo construido.
CAPAS_CONSTRUCCION = ("constru", "subparce", "subparcela", "construccion")
CAPAS_PARCELA = ("parcela", "masa", "limites")
CAPAS_ROTULO = ("rotulos", "textos", "texto", "rotulo")

_ROMANOS = {"I": 1, "V": 5, "X": 10}


def numero_plantas(rotulo: str) -> int | None:
    """'II' -> 2, '-I' -> -1, 'III+TZA' -> 3, 'I+P' -> 1.

    El rotulo de una subparcela de construccion en la cartografia catastral es
    el numero de plantas en romanos. Lo que va detras del '+' (terraza,
    porche, patio) no suma plantas.
    """
    if not rotulo:
        return None
    t = rotulo.strip().upper().replace(" ", "")
    negativo = t.startswith("-")
    t = t.lstrip("-")
    t = re.split(r"[+/(]", t)[0]
    if not t or any(c not in _ROMANOS for c in t):
        return None
    total, prev = 0, 0
    for c in reversed(t):
        v = _ROMANOS[c]
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    if total == 0:
        return None
    return -total if negativo else total


@dataclass
class EntidadDXF:
    tipo: str                       # LWPOLYLINE | POLYLINE | TEXT | MTEXT
    capa: str
    geometry: BaseGeometry | None = None
    texto: str | None = None
    punto: tuple[float, float] | None = None


def _pares(path: Path):
    """Un DXF es una secuencia de (codigo de grupo, valor), una por linea."""
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        while True:
            code = fh.readline()
            if not code:
                return
            val = fh.readline()
            if not val:
                return
            code = code.strip()
            if not code.lstrip("-").isdigit():
                continue
            yield int(code), val.rstrip("\n").rstrip("\r")


def leer_dxf(path: Path) -> list[EntidadDXF]:
    """Lector minimo de DXF: polilineas y rotulos, por capa. Sin dependencias."""
    path = Path(path)
    entidades: list[EntidadDXF] = []
    actual: dict | None = None
    xs: list[float] = []
    ys: list[float] = []

    def cerrar():
        nonlocal actual, xs, ys
        if actual is None:
            return
        tipo = actual["tipo"]
        capa = actual.get("capa", "")
        if tipo in ("LWPOLYLINE", "POLYLINE") and len(xs) >= 2:
            pts = list(zip(xs, ys))
            geom: BaseGeometry
            cerrada = bool(actual.get("flags", 0) & 1) or (
                len(pts) > 2 and abs(pts[0][0] - pts[-1][0]) < 1e-6
                and abs(pts[0][1] - pts[-1][1]) < 1e-6)
            if cerrada and len(pts) >= 3:
                try:
                    geom = Polygon(pts)
                    if not geom.is_valid:
                        geom = geom.buffer(0)
                except Exception:
                    geom = LineString(pts)
            else:
                geom = LineString(pts)
            if not geom.is_empty:
                entidades.append(EntidadDXF(tipo, capa, geometry=geom))
        elif tipo in ("TEXT", "MTEXT") and actual.get("texto"):
            entidades.append(EntidadDXF(tipo, capa, texto=actual["texto"],
                                        punto=(xs[0], ys[0]) if xs and ys else None))
        actual, xs, ys = None, [], []

    en_entidades = False
    for code, val in _pares(path):
        if code == 2 and val.strip().upper() == "ENTITIES":
            en_entidades = True
            continue
        if code == 0:
            v = val.strip().upper()
            if v == "ENDSEC":
                cerrar()
                en_entidades = False
                continue
            cerrar()
            if en_entidades and v in ("LWPOLYLINE", "POLYLINE", "TEXT", "MTEXT",
                                      "VERTEX"):
                if v == "VERTEX" and entidades is not None:
                    actual = {"tipo": "VERTEX"}
                else:
                    actual = {"tipo": v}
            continue
        if actual is None:
            continue
        if code == 8:
            actual["capa"] = val.strip()
        elif code == 10:
            try:
                xs.append(float(val))
            except ValueError:
                pass
        elif code == 20:
            try:
                ys.append(float(val))
            except ValueError:
                pass
        elif code == 70:
            try:
                actual["flags"] = int(float(val))
            except ValueError:
                pass
        elif code in (1, 3):
            actual["texto"] = (actual.get("texto") or "") + val
    cerrar()
    return entidades


@dataclass
class SubparcelaConstruccion:
    """Un recinto construido con su rotulo de plantas y, si se puede, su uso."""
    poligono: Polygon
    rotulo: str | None
    plantas: int | None
    capa: str
    area_m2: float
    uso: str | None = None
    confianza_uso: float = 0.0

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if k != "poligono"}
        d["wkt"] = self.poligono.wkt
        return d


def subparcelas(entidades: list[EntidadDXF]) -> list[SubparcelaConstruccion]:
    """Poligonos de construccion con el rotulo de plantas que cae DENTRO."""
    polis = [e for e in entidades
             if e.geometry is not None and e.geometry.geom_type == "Polygon"
             and any(c in e.capa.lower() for c in CAPAS_CONSTRUCCION)]
    rotulos = [e for e in entidades if e.texto and e.punto]

    salida: list[SubparcelaConstruccion] = []
    for e in polis:
        from shapely.geometry import Point
        dentro = [r for r in rotulos if e.geometry.contains(Point(r.punto))]
        # el rotulo bueno es el que se interpreta como numero de plantas
        rot = next((r.texto for r in dentro if numero_plantas(r.texto) is not None),
                   dentro[0].texto if dentro else None)
        salida.append(SubparcelaConstruccion(
            poligono=e.geometry, rotulo=rot, plantas=numero_plantas(rot or ""),
            capa=e.capa, area_m2=round(e.geometry.area, 2)))
    return salida


def asignar_usos_por_superficie(subs: list[SubparcelaConstruccion],
                                superficie_por_uso: dict[str, float],
                                tolerancia: float = 0.15) -> None:
    """Empareja cada subparcela con un uso catastral por su SUPERFICIE.

    REGLA — solo se asigna cuando el emparejamiento es INEQUIVOCO: un unico uso
    cuya superficie cuadre dentro de la tolerancia. Si cuadran dos, no se
    asigna ninguno. Adivinar cual es el garaje es exactamente el error que
    convierte un certificado en un requerimiento.
    """
    for s in subs:
        base = s.area_m2 * (abs(s.plantas) if s.plantas else 1)
        candidatos = [(u, m2) for u, m2 in superficie_por_uso.items()
                      if m2 > 0 and abs(base - m2) / m2 <= tolerancia]
        if len(candidatos) == 1:
            s.uso, s.confianza_uso = candidatos[0][0], 0.6
        elif candidatos:
            s.uso, s.confianza_uso = None, 0.0


@dataclass
class InventarioFXCC:
    """Lo que hay dentro de un FXCC, SIN interpretar (ver cabecera del modulo)."""
    path: str
    lineas: int
    tipos_registro: dict[str, int] = field(default_factory=dict)
    interpretado: bool = False
    nota: str = ("El FXCC se inventaria pero NO se traduce a geometria: el layout de "
                 "registros no se ha podido contrastar contra un fichero real. "
                 "Usa --dxf, que si esta implementado.")


def inventario_fxcc(path: Path) -> InventarioFXCC:
    path = Path(path)
    tipos: dict[str, int] = {}
    n = 0
    with path.open("r", encoding="latin-1", errors="replace") as fh:
        for linea in fh:
            n += 1
            clave = linea[:2].strip() or "??"
            tipos[clave] = tipos.get(clave, 0) + 1
    return InventarioFXCC(str(path), n, dict(sorted(tipos.items())))


def cargar(path: Path):
    p = Path(path)
    if p.suffix.lower() == ".dxf":
        return "dxf", subparcelas(leer_dxf(p))
    return "fxcc", inventario_fxcc(p)
