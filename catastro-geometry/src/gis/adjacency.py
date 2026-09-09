"""Contra QUE da cada cerramiento: medianera, patio, calle o particion (§8, §9, §10).

Todo se resuelve con operaciones geometricas sobre las huellas de Catastro. No
hay heuristicas visuales: los dos unicos parametros son `boundary_tolerance_m`
(la cartografia catastral no hace coincidir al milimetro dos parcelas
colindantes) y `patio_enclosure_ratio` (ver `clasificar_libre`).

REGLA — la tolerancia sirve para DETECTAR el contacto, nunca para MEDIRLO.
Dilatar al vecino y medir sobre el dilatado alarga la medianera en `tol` por
cada extremo: en el caso de prueba de §21 daba 6,15 m donde hay 6,00. El tramo
se mide proyectando sobre la recta la geometria del vecino SIN dilatar.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from shapely.geometry import LineString, MultiLineString, Point, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from .segments import Segment, partir


class Contacto(str, Enum):
    OTHER_BUILDING = "OTHER_BUILDING"      # medianera
    PATIO_EDIFICIO = "PATIO_EDIFICIO"      # hueco interior de la propia huella
    PATIO_PARCELA = "PATIO_PARCELA"        # patio cerrado dentro de la parcela
    EXTERIOR_CALLE = "EXTERIOR_CALLE"      # da fuera de la parcela
    EXTERIOR_RETRANQUEO = "EXTERIOR_RETRANQUEO"   # espacio libre ABIERTO de la parcela
    EXTERIOR_SOBRE_CUBIERTA = "EXTERIOR_SOBRE_CUBIERTA"  # da al aire, sobre la cubierta de abajo
    NO_HABITABLE = "NO_HABITABLE"          # particion con garaje/almacen de la parcela
    DESCONOCIDO = "DESCONOCIDO"


@dataclass
class EspacioLibre:
    """Un trozo de parcela sin edificar, con cuanto lo rodean los edificios."""
    poligono: Polygon
    cerramiento: float          # 0..1: fraccion de su borde pegada a edificios
    es_patio: bool


@dataclass
class Vecindad:
    parcela: BaseGeometry | None
    edificio_propio: BaseGeometry | None
    edificios_vecinos: BaseGeometry | None
    #: huellas de espacios NO habitables de la MISMA parcela (garaje, almacen)
    no_habitables: BaseGeometry | None = None
    #: huella de la planta INFERIOR: lo que queda fuera de esta planta y
    #: dentro de aquella es la cubierta sobre la que se levanta el muro.
    huella_inferior: BaseGeometry | None = None
    boundary_tolerance_m: float = 0.15
    min_contact_m: float = 0.30
    probe_m: float = 0.35
    #: a partir de que fraccion de borde rodeado por edificios un espacio libre
    #: deja de ser un retranqueo/jardin y pasa a ser un PATIO.
    patio_enclosure_ratio: float = 0.60
    espacios_libres: list[EspacioLibre] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.espacios_libres:
            self.espacios_libres = self._calcular_espacios_libres()

    def _todos_edificios(self) -> BaseGeometry | None:
        return unir([self.edificio_propio, self.edificios_vecinos])

    def _calcular_espacios_libres(self) -> list[EspacioLibre]:
        if self.parcela is None or self.edificio_propio is None:
            return []
        resto = self.parcela.difference(self.edificio_propio)
        if resto.is_empty:
            return []
        edif = self._todos_edificios()
        polis = list(resto.geoms) if resto.geom_type == "MultiPolygon" else [resto]
        salida: list[EspacioLibre] = []
        for p in polis:
            if p.geom_type != "Polygon" or p.area < 0.5:
                continue
            borde = p.boundary
            total = borde.length or 1.0
            pegado = 0.0
            if edif is not None:
                try:
                    pegado = borde.intersection(
                        edif.buffer(self.boundary_tolerance_m, join_style=2)).length
                except Exception:                       # pragma: no cover
                    pegado = 0.0
            ratio = min(1.0, pegado / total)
            salida.append(EspacioLibre(p, round(ratio, 3),
                                       ratio >= self.patio_enclosure_ratio))
        return salida

    def espacio_de(self, p: Point) -> EspacioLibre | None:
        for e in self.espacios_libres:
            if e.poligono.covers(p):
                return e
        cerca = [e for e in self.espacios_libres
                 if e.poligono.distance(p) <= self.boundary_tolerance_m]
        return cerca[0] if cerca else None


# --------------------------------------------------------------- contactos
def _partes_lineales(g: BaseGeometry | None) -> list[LineString]:
    if g is None or g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, MultiLineString):
        return list(g.geoms)
    if hasattr(g, "geoms"):
        out: list[LineString] = []
        for sub in g.geoms:
            out.extend(_partes_lineales(sub))
        return out
    return []


def _fusionar(intervalos: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if not intervalos:
        return []
    intervalos = sorted(intervalos)
    out = [list(intervalos[0])]
    for d0, d1 in intervalos[1:]:
        if d0 <= out[-1][1] + 1e-6:
            out[-1][1] = max(out[-1][1], d1)
        else:
            out.append([d0, d1])
    return [(round(a, 4), round(b, 4)) for a, b in out]


def intervalos_contacto(seg: Segment, obstaculo: BaseGeometry | None,
                        tol: float, min_len: float) -> list[tuple[float, float]]:
    """Tramos [d0, d1] del segmento pegados a `obstaculo`, MEDIDOS sin dilatar.

    Se toma la parte del obstaculo que cae dentro de una banda de `tol` metros
    alrededor de la recta, y se proyecta sobre la recta. Asi la tolerancia
    decide si hay contacto pero no cuanto mide.
    """
    if obstaculo is None or obstaculo.is_empty or seg.length_m <= 0:
        return []
    linea = seg.line
    try:
        banda = linea.buffer(tol, cap_style=2, join_style=2)
        dentro = obstaculo.intersection(banda)
    except Exception:                                    # pragma: no cover
        return []
    if dentro.is_empty:
        return []

    piezas = list(dentro.geoms) if hasattr(dentro, "geoms") else [dentro]
    crudos: list[tuple[float, float]] = []
    for pieza in piezas:
        if pieza.is_empty or pieza.length == 0:
            continue
        coords: list = []
        if pieza.geom_type == "Polygon":
            coords = list(pieza.exterior.coords)
        elif pieza.geom_type in ("LineString", "LinearRing"):
            coords = list(pieza.coords)
        else:
            continue
        ds = [linea.project(Point(c)) for c in coords]
        d0, d1 = max(0.0, min(ds)), min(seg.length_m, max(ds))
        if d1 - d0 >= min_len:
            crudos.append((d0, d1))
    return _fusionar(crudos)


def complemento(intervalos: list[tuple[float, float]], total: float,
                min_len: float) -> list[tuple[float, float]]:
    salida: list[tuple[float, float]] = []
    cursor = 0.0
    for d0, d1 in _fusionar(intervalos):
        if d0 - cursor >= min_len:
            salida.append((round(cursor, 4), round(d0, 4)))
        cursor = max(cursor, d1)
    if total - cursor >= min_len:
        salida.append((round(cursor, 4), round(total, 4)))
    return salida


def clasificar_libre(seg: Segment, v: Vecindad) -> tuple[Contacto, float, str]:
    """Un tramo SIN contacto con otro edificio: ¿calle, patio o retranqueo?

    Se sondea un punto justo al otro lado del muro, en la direccion de su normal
    exterior, y se mira en que espacio cae. Un patio se distingue de un jardin
    delantero por cuanto lo rodean los edificios, no por su tamano.
    """
    p = seg.probe(v.probe_m)
    if seg.ring == "interior":
        return Contacto.PATIO_EDIFICIO, 0.95, "borde de un hueco interior de la huella"

    if v.edificio_propio is not None and v.edificio_propio.contains(p):
        return Contacto.DESCONOCIDO, 0.30, ("el sondeo cae dentro de la propia huella "
                                            "(esquina concava): revisar a mano")
    if v.edificios_vecinos is not None and v.edificios_vecinos.contains(p):
        return Contacto.OTHER_BUILDING, 0.70, "el sondeo cae dentro de un edificio vecino"

    if (v.huella_inferior is not None and v.huella_inferior.covers(p)
            and not (v.edificio_propio is not None and v.edificio_propio.covers(p))):
        return (Contacto.EXTERIOR_SOBRE_CUBIERTA, 0.9,
                "da al aire exterior, levantado sobre la cubierta de la planta inferior")

    if v.parcela is not None and v.parcela.covers(p):
        e = v.espacio_de(p)
        if e is None:
            return Contacto.EXTERIOR_RETRANQUEO, 0.60, "dentro de la parcela, sin espacio libre asociado"
        if e.es_patio:
            return (Contacto.PATIO_PARCELA, 0.90,
                    f"patio: el {e.cerramiento:.0%} de su borde lo forman edificios")
        return (Contacto.EXTERIOR_RETRANQUEO, 0.90,
                f"espacio libre abierto de la parcela (solo el {e.cerramiento:.0%} "
                f"de su borde son edificios)")
    return Contacto.EXTERIOR_CALLE, 0.95, "fuera de la parcela"


@dataclass
class Tramo:
    segment: Segment
    contacto: Contacto
    confianza: float
    nota: str
    vecino_id: str | None = None


def clasificar_segmento(seg: Segment, v: Vecindad) -> list[Tramo]:
    """Parte el segmento en los trozos que tocan otro edificio y los que no (§8).

    REGLA — cada trozo se sondea POR SU CUENTA. Sondeando el punto medio del
    segmento entero, la pared de 10 m cuyo vecino ocupa 6 m daba los 4 m libres
    tambien como medianera: el punto medio (y=5) cae dentro del vecino.
    """
    medianera = intervalos_contacto(seg, v.edificios_vecinos,
                                    v.boundary_tolerance_m, v.min_contact_m)
    nohab = intervalos_contacto(seg, v.no_habitables,
                                v.boundary_tolerance_m, v.min_contact_m)
    nohab = [t for t in nohab
             if not any(t[0] >= m[0] - 1e-6 and t[1] <= m[1] + 1e-6 for m in medianera)]

    libres = complemento(medianera + nohab, seg.length_m, v.min_contact_m)

    piezas: list[tuple[tuple[float, float], str]] = (
        [(t, "MEDIANERA") for t in medianera]
        + [(t, "NO_HABITABLE") for t in nohab]
        + [(t, "LIBRE") for t in libres])
    if not piezas:
        c, conf, nota = clasificar_libre(seg, v)
        return [Tramo(seg, c, conf, nota)]
    piezas.sort(key=lambda p: p[0][0])

    entero = (len(piezas) == 1
              and abs((piezas[0][0][1] - piezas[0][0][0]) - seg.length_m) < 1e-6)
    trozos = [seg] if entero else partir(
        seg, [p[0] for p in piezas], [f"_{i + 1}" for i in range(len(piezas))])

    salida: list[Tramo] = []
    for trozo, (_, clase) in zip(trozos, piezas):
        if clase == "MEDIANERA":
            salida.append(Tramo(trozo, Contacto.OTHER_BUILDING, 1.0,
                                "coincide con la huella de un edificio colindante"))
        elif clase == "NO_HABITABLE":
            salida.append(Tramo(trozo, Contacto.NO_HABITABLE, 0.85,
                                "coincide con la huella de un espacio no habitable "
                                "de la parcela"))
        else:
            c, conf, nota = clasificar_libre(trozo, v)
            salida.append(Tramo(trozo, c, conf, nota))
    return salida


def clasificar(segmentos: list[Segment], v: Vecindad) -> list[Tramo]:
    salida: list[Tramo] = []
    for s in segmentos:
        salida.extend(clasificar_segmento(s, v))
    return salida


def patios(huella: BaseGeometry | None, v: Vecindad | None = None
           ) -> tuple[list[Polygon], list[EspacioLibre]]:
    """(patios interiores de la huella, espacios libres de la parcela) (§9)."""
    interiores: list[Polygon] = []
    if huella is not None and not huella.is_empty:
        polis = huella.geoms if huella.geom_type == "MultiPolygon" else [huella]
        for p in polis:
            interiores.extend(Polygon(r) for r in p.interiors)
    return interiores, (v.espacios_libres if v else [])


def unir(geoms) -> BaseGeometry | None:
    gs = [g for g in geoms if g is not None and not g.is_empty]
    return unary_union(gs) if gs else None


def fusionar_colineales(tramos: list[Tramo], tol_azimut: float = 0.5,
                        tol_union: float = 0.01) -> list[Tramo]:
    """Une tramos consecutivos, colineales y del mismo tipo (§7).

    La union de dos BuildingParts que comparten un lado deja un vertice en
    mitad de una pared recta: la fachada de 12 m sale partida en 8 + 4 aunque
    sea UN muro. En CE3X eso son dos filas donde hay una, y el plano de
    depuracion se llena de rotulos. Se unen solo si ademas coinciden el anillo,
    la clasificacion y la orientacion: un vertice que separa medianera de
    fachada NO se toca.
    """
    if not tramos:
        return []

    def compatible(a: Tramo, b: Tramo) -> bool:
        sa, sb = a.segment, b.segment
        return (sa.ring == sb.ring and sa.ring_index == sb.ring_index
                and sa.owner_id == sb.owner_id and sa.floor == sb.floor
                and a.contacto == b.contacto
                and abs((sa.azimuth - sb.azimuth + 180) % 360 - 180) <= tol_azimut
                and abs(sa.x2 - sb.x1) <= tol_union and abs(sa.y2 - sb.y1) <= tol_union)

    def unir_dos(a: Tramo, b: Tramo) -> Tramo:
        s = a.segment
        nuevo = Segment(
            id=s.id, x1=s.x1, y1=s.y1, x2=b.segment.x2, y2=b.segment.y2,
            length_m=round(s.length_m + b.segment.length_m, 4),
            azimuth=s.azimuth, orientation=s.orientation, ring=s.ring,
            ring_index=s.ring_index, seq=s.seq, owner_id=s.owner_id,
            floor=s.floor, meta=dict(s.meta))
        nuevo.meta["fusionado_desde"] = (s.meta.get("fusionado_desde", [s.id])
                                         + b.segment.meta.get("fusionado_desde",
                                                              [b.segment.id]))
        return Tramo(nuevo, a.contacto, min(a.confianza, b.confianza), a.nota,
                     a.vecino_id)

    salida: list[Tramo] = [tramos[0]]
    for t in tramos[1:]:
        if compatible(salida[-1], t):
            salida[-1] = unir_dos(salida[-1], t)
        else:
            salida.append(t)

    # el ultimo segmento de un anillo puede continuar en el primero
    if len(salida) > 1 and compatible(salida[-1], salida[0]):
        primero = unir_dos(salida[-1], salida[0])
        salida = [primero] + salida[1:-1]
    return salida
