"""Segmentacion del perimetro y calculo de la normal exterior (§7).

REGLA — la orientacion de una fachada es la de su NORMAL EXTERIOR, no la de la
linea. Para poder calcularla sin ambiguedad se normaliza el sentido de giro de
los anillos con shapely.orient():

    * anillo EXTERIOR  -> antihorario (CCW)
    * anillos INTERIORES (patios) -> horario (CW)

Con ese convenio, para un segmento p1->p2 con d = p2 - p1, la normal exterior
es SIEMPRE (dy, -dx), en los dos casos:

    - En el exterior CCW apunta fuera del edificio.
    - En un hueco CW apunta hacia dentro del hueco, que es justo hacia donde
      mira la fachada del patio.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from shapely.geometry import LineString, Point, Polygon
from shapely.geometry.polygon import orient

from .orientation import azimut_desde_normal, orientacion


@dataclass
class Segment:
    id: str
    x1: float
    y1: float
    x2: float
    y2: float
    length_m: float
    azimuth: float
    orientation: str
    #: 'exterior' = perimetro del poligono; 'interior' = borde de un patio (hueco)
    ring: str
    ring_index: int
    #: indice del segmento dentro de su anillo, para poder rehacer el recorrido
    seq: int
    owner_id: str | None = None
    floor: int | None = None
    meta: dict = field(default_factory=dict)

    @property
    def line(self) -> LineString:
        return LineString([(self.x1, self.y1), (self.x2, self.y2)])

    @property
    def midpoint(self) -> Point:
        return Point((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    def normal(self) -> tuple[float, float]:
        dx, dy = self.x2 - self.x1, self.y2 - self.y1
        n = math.hypot(dx, dy)
        if n == 0:
            raise ValueError("segmento de longitud cero")
        return dy / n, -dx / n

    def probe(self, distancia: float = 0.35) -> Point:
        """Punto justo al otro lado del cerramiento. Sirve para saber CONTRA QUE da."""
        nx, ny = self.normal()
        m = self.midpoint
        return Point(m.x + nx * distancia, m.y + ny * distancia)

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items()}
        return d


def _pares(coords) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    pts = [(round(x, 6), round(y, 6)) for x, y, *_ in
           [(c[0], c[1]) for c in coords]]
    if pts and pts[0] == pts[-1]:
        pts = pts[:-1]
    return [(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]


def segmentar(poly: Polygon, *, owner_id: str | None = None, floor: int | None = None,
              prefijo: str = "S", min_length_m: float = 0.05,
              start: int = 1) -> list[Segment]:
    """Descompone un poligono en segmentos con su azimut y su orientacion.

    Los segmentos mas cortos que `min_length_m` se descartan: son artefactos de
    digitalizacion de la cartografia, no cerramientos.
    """
    poly = orient(poly, sign=1.0)          # exterior CCW, huecos CW
    salida: list[Segment] = []
    n = start
    anillos = [("exterior", 0, poly.exterior)] + [
        ("interior", i, r) for i, r in enumerate(poly.interiors)]

    for tipo, idx, anillo in anillos:
        for seq, ((x1, y1), (x2, y2)) in enumerate(_pares(list(anillo.coords))):
            L = math.hypot(x2 - x1, y2 - y1)
            if L < min_length_m:
                continue
            dx, dy = (x2 - x1) / L, (y2 - y1) / L
            az = azimut_desde_normal(dy, -dx)
            salida.append(Segment(
                id=f"{prefijo}{n:03d}", x1=x1, y1=y1, x2=x2, y2=y2,
                length_m=round(L, 4), azimuth=round(az, 2), orientation=orientacion(az),
                ring=tipo, ring_index=idx, seq=seq, owner_id=owner_id, floor=floor))
            n += 1
    return salida


def partir(seg: Segment, tramos: list[tuple[float, float]],
           sufijos: list[str] | None = None) -> list[Segment]:
    """Trocea un segmento por distancias medidas desde su origen.

    `tramos` son intervalos [d0, d1] en metros a lo largo del segmento. Los
    trozos heredan azimut y orientacion (una recta no cambia de orientacion al
    partirla), que es justo lo que hace falta para separar la parte medianera
    de la parte de fachada de una misma pared (§8).
    """
    salida: list[Segment] = []
    dx = (seg.x2 - seg.x1) / seg.length_m
    dy = (seg.y2 - seg.y1) / seg.length_m
    for i, (d0, d1) in enumerate(tramos):
        if d1 - d0 < 1e-9:
            continue
        suf = sufijos[i] if sufijos and i < len(sufijos) else chr(ord("a") + i)
        salida.append(Segment(
            id=f"{seg.id}{suf}", x1=seg.x1 + dx * d0, y1=seg.y1 + dy * d0,
            x2=seg.x1 + dx * d1, y2=seg.y1 + dy * d1,
            length_m=round(d1 - d0, 4), azimuth=seg.azimuth, orientation=seg.orientation,
            ring=seg.ring, ring_index=seg.ring_index, seq=seg.seq,
            owner_id=seg.owner_id, floor=seg.floor, meta=dict(seg.meta)))
    return salida
