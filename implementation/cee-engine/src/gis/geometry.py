"""Lectura de GML de Catastro y manejo de CRS.

Se parsea por NOMBRE LOCAL, sin depender de los prefijos ni de las URI de
namespace concretas: Catastro ha cambiado de version de esquema INSPIRE varias
veces y un parser atado a 'http://inspire.ec.europa.eu/schemas/cp/4.0' se rompe
el dia que publiquen la 4.1.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Iterable

from lxml import etree
from pyproj import CRS, Transformer
from shapely.geometry import (LinearRing, LineString, MultiPolygon, Point,
                              Polygon, mapping)
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform as shapely_transform, unary_union

log = logging.getLogger(__name__)

#: CRS metrico para la peninsula (Ciudad Real cae en el huso 30).
#: NO se calculan metros sobre lat/lon (§4).
CRS_METRICO_DEFECTO = "EPSG:25830"
CRS_GEOGRAFICO = "EPSG:4326"

_GEOM_TAGS = {"Polygon", "MultiSurface", "Surface", "MultiPolygon", "Point",
              "MultiPoint", "LineString", "Curve", "MultiCurve", "Envelope"}

#: Prioridad al buscar LA geometria de un feature. `Envelope` NO esta: es el
#: bounding box de gml:boundedBy, y presentarlo como huella del edificio seria
#: un rectangulo inventado con toda la apariencia de un dato bueno. Catastro
#: pone el boundedBy ANTES de la geometria de verdad (medido en el Building de
#: 4410205WJ0641S), asi que "el primer tag geometrico que aparezca" no vale.
_PRIORIDAD_GEOM = ("MultiSurface", "Surface", "MultiPolygon", "Polygon",
                   "MultiCurve", "Curve", "LineString", "MultiPoint", "Point")


def local(tag) -> str:
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1]


# --------------------------------------------------------------------- CRS
def parse_srs_name(srs: str | None) -> tuple[str | None, bool]:
    """Devuelve (codigo EPSG, hay_que_invertir_ejes).

    - urn:ogc:def:crs:EPSG::4258  -> se respeta el orden de ejes de la autoridad
      (para geograficos EPSG eso es lat,lon => hay que invertir a x,y).
    - EPSG:4258                   -> forma corta: por convencion se lee x,y.
    """
    if not srs:
        return None, False
    m = re.search(r"(?:EPSG[:/]{1,2}(?:0/)?)(\d{4,6})", srs, re.I)
    if not m:
        return None, False
    code = f"EPSG:{m.group(1)}"
    forma_autoridad = srs.lower().startswith("urn:") or "/def/crs/" in srs.lower()
    if not forma_autoridad:
        return code, False
    try:
        eje0 = CRS.from_user_input(code).axis_info[0].abbrev.lower()
    except Exception:                                    # pragma: no cover
        return code, False
    # 'lat' / 'y' / 'n' primero => hay que invertir para obtener (x, y)
    return code, eje0 in ("lat", "n")


_transformadores: dict[tuple[str, str], Transformer] = {}


def transformer(desde: str, hasta: str) -> Transformer:
    key = (desde, hasta)
    if key not in _transformadores:
        _transformadores[key] = Transformer.from_crs(desde, hasta, always_xy=True)
    return _transformadores[key]


def reproject(geom: BaseGeometry, desde: str, hasta: str) -> BaseGeometry:
    if desde == hasta:
        return geom
    t = transformer(desde, hasta)
    return shapely_transform(lambda x, y, z=None: t.transform(x, y), geom)


# --------------------------------------------------------------- geometrias
def _floats(texto: str) -> list[float]:
    return [float(v) for v in texto.replace(",", " ").split() if v]


def _coords(el, invertir: bool, dim: int) -> list[tuple[float, float]]:
    nums = _floats(el.text or "")
    if dim >= 3 and len(nums) % 3 == 0:
        pares = [(nums[i], nums[i + 1]) for i in range(0, len(nums), 3)]
    else:
        pares = [(nums[i], nums[i + 1]) for i in range(0, len(nums) - 1, 2)]
    return [(y, x) for x, y in pares] if invertir else pares


def _dimension(el) -> int:
    for attr in ("srsDimension", "dimension"):
        for node in (el, el.getparent()):
            if node is not None and node.get(attr):
                try:
                    return int(node.get(attr))
                except ValueError:
                    pass
    return 2


def _ring(el, invertir: bool) -> list[tuple[float, float]] | None:
    """Un LinearRing puede venir como posList, como pos repetidos o como coordinates."""
    pts: list[tuple[float, float]] = []
    for hijo in el.iter():
        ln = local(hijo.tag)
        if ln in ("posList", "coordinates"):
            pts.extend(_coords(hijo, invertir, _dimension(hijo)))
        elif ln == "pos":
            pts.extend(_coords(hijo, invertir, _dimension(hijo)))
    return pts if len(pts) >= 3 else None


def _polygon(el, invertir: bool) -> Polygon | None:
    ext: list | None = None
    huecos: list[list] = []
    for hijo in el.iter():
        ln = local(hijo.tag)
        if ln in ("exterior", "outerBoundaryIs"):
            ext = _ring(hijo, invertir)
        elif ln in ("interior", "innerBoundaryIs"):
            h = _ring(hijo, invertir)
            if h:
                huecos.append(h)
    if not ext:
        return None
    try:
        p = Polygon(ext, huecos)
    except Exception as exc:                              # pragma: no cover
        log.warning("anillo invalido: %s", exc)
        return None
    if not p.is_valid:
        p = p.buffer(0)
    return p if not p.is_empty else None


def geom_from_element(el, invertir: bool) -> BaseGeometry | None:
    ln = local(el.tag)
    if ln == "Point":
        pts = _ring(el, invertir) or []
        if not pts:
            nums = []
            for h in el.iter():
                if local(h.tag) in ("pos", "coordinates"):
                    nums = _coords(h, invertir, _dimension(h))
            pts = nums
        return Point(pts[0]) if pts else None
    if ln == "LineString":
        pts = _ring(el, invertir)
        return LineString(pts) if pts and len(pts) >= 2 else None
    if ln == "Polygon":
        return _polygon(el, invertir)
    if ln in ("Surface", "MultiSurface", "MultiPolygon", "MultiCurve", "Curve"):
        polis = []
        for hijo in el.iter():
            if local(hijo.tag) in ("Polygon", "PolygonPatch"):
                p = _polygon(hijo, invertir)
                if p:
                    polis.append(p)
        if not polis:
            return None
        return polis[0] if len(polis) == 1 else MultiPolygon(
            [g for p in polis for g in (p.geoms if p.geom_type == "MultiPolygon" else [p])])
    return None


# ----------------------------------------------------------------- features
@dataclass
class Feature:
    """Una entidad tal cual la devuelve Catastro, con su geometria y sus atributos."""
    source: str
    original_id: str | None
    tipo: str
    geometry: BaseGeometry | None
    srs: str | None
    attrs: dict = field(default_factory=dict)

    def to_geojson(self, crs_salida: str | None = None) -> dict:
        g = self.geometry
        if g is not None and crs_salida and self.srs and crs_salida != self.srs:
            g = reproject(g, self.srs, crs_salida)
        return {
            "type": "Feature",
            "id": self.original_id,
            "properties": {"source": self.source, "tipo": self.tipo,
                           "original_id": self.original_id, **self.attrs},
            "geometry": mapping(g) if g is not None else None,
        }


def _atributos(el) -> dict:
    """Aplana los nodos hoja de texto del feature. Los tags geometricos se ignoran."""
    out: dict = {}
    for hijo in el.iter():
        ln = local(hijo.tag)
        if ln in _GEOM_TAGS:
            continue
        # si tiene un ancestro geometrico, es parte de la geometria
        padre = hijo.getparent()
        geo = False
        while padre is not None and padre is not el:
            if local(padre.tag) in _GEOM_TAGS:
                geo = True
                break
            padre = padre.getparent()
        if geo:
            continue
        texto = (hijo.text or "").strip()
        if texto and len(hijo) == 0:
            out.setdefault(ln, texto)
        for k, v in hijo.attrib.items():
            lk = local(k)
            if lk in ("id", "href", "nilReason", "codeSpace"):
                out.setdefault(f"{ln}@{lk}", v)
    return out


def _dentro_de_boundedby(el, tope) -> bool:
    padre = el.getparent()
    while padre is not None and padre is not tope:
        if local(padre.tag) == "boundedBy":
            return True
        padre = padre.getparent()
    return False


def _elegir_geometria(el):
    """La geometria de verdad del feature, ignorando el bounding box."""
    candidatos: dict[str, list] = {}
    for hijo in el.iter():
        ln = local(hijo.tag)
        if ln not in _GEOM_TAGS or ln == "Envelope":
            continue
        if _dentro_de_boundedby(hijo, el):
            continue
        candidatos.setdefault(ln, []).append(hijo)
    for ln in _PRIORIDAD_GEOM:
        if candidatos.get(ln):
            return candidatos[ln][0]
    return None


def parse_gml(data: bytes, source: str,
              tipos: Iterable[str] | None = None) -> list[Feature]:
    """Extrae los features de una respuesta GML de Catastro.

    `tipos` filtra por nombre local del feature (p.ej. {'CadastralParcel'}).
    Si es None se cogen todos los hijos de member/featureMember.
    """
    parser = etree.XMLParser(recover=True, huge_tree=True, resolve_entities=False)
    root = etree.fromstring(data, parser=parser)
    if root is None:
        return []

    if local(root.tag) in ("ExceptionReport", "ServiceExceptionReport"):
        textos = [(e.text or "").strip() for e in root.iter() if (e.text or "").strip()]
        raise ValueError("Catastro devolvio una excepcion WFS: " + " | ".join(textos)[:400])

    srs_global = root.get("srsName")
    feats: list[Feature] = []
    contenedores = [el for el in root.iter()
                    if local(el.tag) in ("member", "featureMember", "featureMembers")]
    candidatos = []
    for c in contenedores:
        candidatos.extend([h for h in c if isinstance(h.tag, str)])
    if not candidatos:  # algunos servicios devuelven los features colgando de la raiz
        candidatos = [h for h in root if isinstance(h.tag, str)
                      and local(h.tag) not in ("boundedBy",)]

    for el in candidatos:
        ln = local(el.tag)
        if tipos and ln not in set(tipos):
            continue
        geom_el = _elegir_geometria(el)
        srs_el = geom_el.get("srsName") if geom_el is not None else None
        if srs_el is None and geom_el is not None:
            padre = geom_el.getparent()
            while padre is not None and srs_el is None and padre is not el:
                srs_el = padre.get("srsName")
                padre = padre.getparent()
        srs_raw = srs_el or srs_global
        code, invertir = parse_srs_name(srs_raw)
        geom = geom_from_element(geom_el, invertir) if geom_el is not None else None
        fid = None
        for k, v in el.attrib.items():
            if local(k) == "id":
                fid = v
        feats.append(Feature(source=source, original_id=fid, tipo=ln,
                             geometry=geom, srs=code, attrs=_atributos(el)))
    return feats


def featurecollection(feats: list[Feature], crs_salida: str) -> dict:
    return {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": crs_salida}},
        "features": [f.to_geojson(crs_salida) for f in feats],
    }


def poligonos(feats: Iterable[Feature]) -> list[Polygon]:
    out: list[Polygon] = []
    for f in feats:
        g = f.geometry
        if g is None or g.is_empty:
            continue
        if g.geom_type == "Polygon":
            out.append(g)
        elif g.geom_type == "MultiPolygon":
            out.extend(list(g.geoms))
    return out


def union(geoms: Iterable[BaseGeometry]):
    gs = [g for g in geoms if g is not None and not g.is_empty]
    return unary_union(gs) if gs else None
