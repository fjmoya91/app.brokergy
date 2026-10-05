"""El recorrido completo: RC -> Catastro -> geometria -> tabla CE3X.

Cada etapa esta aislada: si Catastro deja caer una, se anota el codigo de
diagnostico y se sigue con lo que si haya (§19). Lo que no se consigue sale
como NO DISPONIBLE, nunca relleno con un valor plausible (§22).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from .catastro import alphanumeric, inspire, refcat as refcat_mod
from .catastro.client import CatastroClient, CatastroError
from .catastro import fxcc as fxcc_mod
from .catastro.fxcc import (asignar_usos_por_superficie, leer_dxf, subparcelas)
from .ce3x import classifier, export
from .ce3x.schema import ElementoCE3X
from .gis import floors as floors_mod
from .gis.adjacency import (Vecindad, clasificar, fusionar_colineales,
                            patios, unir)
from .gis.geometry import (CRS_METRICO_DEFECTO, Feature, featurecollection,
                           parse_gml, poligonos, reproject)
from .gis.segments import segmentar
from .lidar import pnoa
from .model import Modelo, Objeto
from .provenance import (EvidenceType, Source, Traced, computed, inferred,
                         manual, measured, missing)

log = logging.getLogger(__name__)


@dataclass
class Opciones:
    refcat: str
    output: Path = Path("output")
    data: Path = Path("data")
    cache: Path = Path("cache")
    floor_height: float = 2.80
    floor_height_dada: bool = False
    skip_lidar: bool = False
    offline: bool = False
    refresh: bool = False
    tolerancia: float = 0.15
    min_contacto: float = 0.30
    max_vecinos: int = 12
    dxf: Path | None = None
    fxcc: Path | None = None
    crs_metrico: str = CRS_METRICO_DEFECTO
    solo_descargar: bool = False
    fixture_dir: Path | None = None
    retries: int = 4
    timeout: float = 30.0
    pausa: float = 0.8


@dataclass
class Resultado:
    modelo: Modelo
    elementos: list[ElementoCE3X]
    tramos: list
    horizontales: list
    ficheros: dict[str, str]
    traza: list[dict]
    alturas: dict
    #: una entrada por planta, para el plano y el mapa de depuracion
    capas: list[dict] = None  # type: ignore[assignment]


# --------------------------------------------------------------- descarga
def _guardar(client: CatastroClient, data: bytes, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(data)


def descargar(o: Opciones, rc: refcat_mod.ReferenciaCatastral,
              modelo: Modelo) -> dict[str, list[Feature]]:
    """Trae de Catastro lo que haya y deja las respuestas CRUDAS en data/raw (§4)."""
    client = CatastroClient(cache_dir=o.cache / rc.parcela,
                            offline=o.offline, refresh=o.refresh,
                            fixture_dir=o.fixture_dir, retries=o.retries,
                            timeout=o.timeout, pause_between_calls=o.pausa)
    modelo.catastro["cliente"] = "WCF JSON + INSPIRE WFS"
    cp, bu = inspire.servicios(client)
    raw = o.data / "raw"
    feats: dict[str, list[Feature]] = {}

    # -- capacidades: los ids de stored query se LEEN, no se dan por buenos ---
    for srv, etiqueta in ((cp, "CP"), (bu, "BU")):
        try:
            _guardar(client, srv.capabilities(), raw / f"capabilities_{etiqueta}.xml")
        except CatastroError as exc:
            modelo.diagnostics.add(f"CAPABILITIES_{etiqueta}_UNAVAILABLE", str(exc))
        try:
            qs = srv.stored_queries()
            modelo.catastro[f"stored_queries_{etiqueta}"] = {
                "descubrimiento": srv.descubrimiento,
                "ids": sorted(qs.keys()),
            }
        except CatastroError as exc:                     # pragma: no cover
            modelo.diagnostics.add(f"STOREDQUERIES_{etiqueta}_UNAVAILABLE", str(exc))

    def _trae(srv, proposito, fichero, codigo, tipos=None):
        try:
            data = srv.get_feature(proposito, rc.parcela, name=f"{proposito}_{rc.parcela}")
            _guardar(client, data, raw / fichero)
            fs = parse_gml(data, srv.nombre, tipos)
            log.info("%s: %d features", fichero, len(fs))
            return fs
        except (CatastroError, ValueError) as exc:
            modelo.diagnostics.add(codigo, str(exc))
            return []

    feats["parcela"] = _trae(cp, "parcela", "parcela.gml", "PARCEL_GEOMETRY_UNAVAILABLE")
    feats["edificios"] = _trae(bu, "edificio", "edificios.gml", "BUILDING_GEOMETRY_UNAVAILABLE")
    feats["building_parts"] = _trae(bu, "partes", "building_parts.gml",
                                    "BUILDING_PARTS_UNAVAILABLE")
    feats["vecinos_parcelas"] = _trae(cp, "vecinos", "vecinos.gml",
                                      "NEIGHBOUR_PARCELS_UNAVAILABLE")

    # -- edificios de las parcelas colindantes (una llamada por vecino, EN SERIE)
    vecinos_edif: list[Feature] = []
    vecinos_partes: list[Feature] = []
    refs = []
    for f in feats["vecinos_parcelas"]:
        r = (f.attrs.get("nationalCadastralReference")
             or f.attrs.get("localId") or "")
        r = "".join(ch for ch in r.upper() if ch.isalnum())[:14]
        if len(r) == 14 and r != rc.parcela:
            refs.append(r)
    refs = list(dict.fromkeys(refs))[:o.max_vecinos]
    modelo.catastro["parcelas_colindantes"] = refs
    for r in refs:
        try:
            data = bu.get_feature("edificio", r, name=f"edificio_vecino_{r}")
            vecinos_edif.extend(parse_gml(data, f"BU:{r}"))
        except (CatastroError, ValueError) as exc:
            modelo.diagnostics.add("NEIGHBOUR_BUILDING_UNAVAILABLE", f"{r}: {exc}")
        # las plantas del vecino deciden hasta donde llega la medianera de verdad
        try:
            data = bu.get_feature("partes", r, name=f"partes_vecino_{r}")
            vecinos_partes.extend(parse_gml(data, f"BUP:{r}"))
        except (CatastroError, ValueError) as exc:
            modelo.diagnostics.add("NEIGHBOUR_PARTS_UNAVAILABLE", f"{r}: {exc}")
    if vecinos_edif:
        _guardar(client, json.dumps(
            featurecollection(vecinos_edif, o.crs_metrico), ensure_ascii=False,
            indent=1).encode("utf-8"), raw / "vecinos_edificios.geojson")
    feats["vecinos_edificios"] = vecinos_edif
    feats["vecinos_partes"] = vecinos_partes

    # -- servicios alfanumericos: uso, planta, superficie, antiguedad ----------
    try:
        datos = alphanumeric.consulta_dnprc(
            client, rc.inmueble or rc.parcela)
        _guardar(client, json.dumps(datos.raw, ensure_ascii=False, indent=1).encode("utf-8"),
                 raw / "datos_catastrales.json")
        modelo.catastro["inmueble"] = datos.to_dict()
        modelo.catastro["_datos"] = datos
    except CatastroError as exc:
        modelo.diagnostics.add("CADASTRAL_ATTRIBUTES_UNAVAILABLE", str(exc))

    modelo.catastro["traza_http"] = client.trace()
    modelo.catastro["_client"] = client
    return feats


# ------------------------------------------------------------- construccion
def _objeto(f: Feature, crs: str, use=None, floor=None, conf=1.0) -> Objeto:
    g = reproject(f.geometry, f.srs, crs) if (f.geometry is not None and f.srs) else f.geometry
    return Objeto(source=f.source, original_id=f.original_id, geometry=g,
                  area=round(g.area, 2) if g is not None and g.geom_type in
                  ("Polygon", "MultiPolygon") else None,
                  use=use, floor=floor, confidence=conf, attrs=f.attrs)


def _int(v):
    try:
        return int(float(str(v)))
    except (TypeError, ValueError):
        return None


def construir_modelo(o: Opciones, rc: refcat_mod.ReferenciaCatastral,
                     feats: dict[str, list[Feature]], modelo: Modelo) -> Modelo:
    crs = o.crs_metrico

    pars = [f for f in feats.get("parcela", []) if f.geometry is not None]
    if pars:
        # la parcela buena es la que lleva NUESTRA referencia catastral
        propia = [f for f in pars if rc.parcela in
                  "".join(str(v) for v in f.attrs.values()).upper()]
        modelo.parcel = _objeto(propia[0] if propia else pars[0], crs)
        if not propia:
            modelo.diagnostics.add(
                "PARCEL_NOT_MATCHED_BY_REFCAT",
                "ninguna parcela devuelta cita la RC pedida; se usa la primera")

    for f in feats.get("edificios", []):
        if f.geometry is None or f.tipo.lower().endswith("part"):
            continue
        modelo.buildings.append(_objeto(
            f, crs, use=f.attrs.get("currentUse") or f.attrs.get("value")))

    partes: list[floors_mod.ParteEdificio] = []
    for f in feats.get("building_parts", []):
        if f.geometry is None:
            continue
        obj = _objeto(f, crs)
        modelo.building_parts.append(obj)
        partes.append(floors_mod.ParteEdificio(
            original_id=f.original_id, geometry=obj.geometry,
            plantas_sobre_rasante=_int(f.attrs.get("numberOfFloorsAboveGround")),
            plantas_bajo_rasante=_int(f.attrs.get("numberOfFloorsBelowGround")),
            attrs=f.attrs))
    modelo.partes = partes

    # Las parcelas de alrededor, tal cual las dibuja el visor de Catastro. No
    # entran en ningun calculo: son para que el certificador SITUE la casa.
    for f in feats.get("vecinos_parcelas", []):
        if f.geometry is None:
            continue
        ref = "".join(ch for ch in str(f.attrs.get("nationalCadastralReference")
                                       or f.attrs.get("localId") or "").upper()
                      if ch.isalnum())[:14]
        if ref == rc.parcela:          # la propia no es vecina
            continue
        modelo.neighbour_parcels.append(_objeto(f, crs))

    for f in feats.get("vecinos_edificios", []):
        if f.geometry is None:
            continue
        obj = _objeto(f, crs)
        # un "vecino" que en realidad es nuestro edificio no cuenta
        propia = modelo.huella()
        if propia is not None and obj.geometry is not None and \
                obj.geometry.intersection(propia).area > 0.8 * obj.geometry.area:
            continue
        modelo.neighbours.append(obj)

    for f in feats.get("vecinos_partes", []):
        if f.geometry is None:
            continue
        obj = _objeto(f, crs)
        propia = modelo.huella()
        if propia is not None and obj.geometry is not None and \
                obj.geometry.intersection(propia).area > 0.8 * obj.geometry.area:
            continue
        modelo.neighbour_partes.append(floors_mod.ParteEdificio(
            original_id=f.original_id, geometry=obj.geometry,
            plantas_sobre_rasante=_int(f.attrs.get("numberOfFloorsAboveGround")),
            plantas_bajo_rasante=_int(f.attrs.get("numberOfFloorsBelowGround")),
            attrs=f.attrs))

    if not modelo.buildings and not modelo.building_parts:
        modelo.diagnostics.add("BUILDING_GEOMETRY_UNAVAILABLE",
                               "Catastro no ha devuelto ninguna huella de edificio "
                               "para esta parcela")

    # -- plantas y usos -------------------------------------------------------
    datos = modelo.catastro.get("_datos")
    plantas = floors_mod.plantas_desde_partes(partes)
    if not plantas and modelo.buildings:
        g = modelo.huella()
        if g is not None:
            plantas = [floors_mod.Planta(0, g, round(g.area, 2))]
            modelo.diagnostics.add(
                "FLOOR_COUNT_UNAVAILABLE",
                "sin BuildingParts no se sabe cuantas plantas tiene: se modela UNA")
    if datos is not None:
        floors_mod.asignar_usos(plantas, datos.usos_por_planta())
    modelo.floors = plantas

    # -- espacios: aqui es donde Catastro se queda corto (§6) ------------------
    if datos is not None:
        for u in datos.unidades:
            modelo.spaces.append(Objeto(
                source="CATASTRO_OVC_JSON", original_id=None, geometry=None,
                area=u.superficie_m2, use=u.uso, floor=u.planta, confidence=1.0,
                attrs={"uso_literal": u.uso_literal, "planta_literal": u.planta_literal,
                       "escalera": u.escalera, "puerta": u.puerta,
                       "codigo": u.codigo,
                       "habitable": u.habitable,
                       # Lo que dice CATASTRO, aparte de lo que acabe mandando:
                       # si el certificador cuenta un almacen como vivienda, el
                       # fichero tiene que seguir diciendo que Catastro no lo era.
                       "habitable_catastro": u.habitable,
                       "geometria": "NO DISPONIBLE en los servicios publicos de Catastro"}))
        if datos.unidades:
            modelo.diagnostics.add(
                "SPACE_GEOMETRY_UNAVAILABLE",
                "Catastro da uso/planta/superficie de cada unidad constructiva pero NO su "
                "poligono en los servicios de siempre. Lo dibuja el croquis catastral por "
                "plantas de la Sede (`sede_catastro`, o el FXCC aportado con --fxcc).")

    # -- DXF aportado: aqui SI se puede repartir uso <-> poligono -------------
    if o.dxf:
        try:
            subs = subparcelas(leer_dxf(o.dxf))
            if datos is not None:
                asignar_usos_por_superficie(subs, datos.superficie_por_uso())
            modelo.catastro["dxf"] = {"fichero": str(o.dxf),
                                      "subparcelas": [s.to_dict() for s in subs]}
            for s in subs:
                modelo.spaces.append(Objeto(
                    source="CATASTRO_DXF", original_id=s.rotulo, geometry=s.poligono,
                    area=s.area_m2, use=s.uso, floor=None,
                    confidence=s.confianza_uso,
                    attrs={"rotulo": s.rotulo, "plantas": s.plantas, "capa": s.capa}))
        except Exception as exc:                          # pragma: no cover
            modelo.diagnostics.add("DXF_UNREADABLE", f"{o.dxf}: {exc}")
    if o.fxcc:
        # El FXCC POR PLANTAS aportado a mano (el ZIP de la Sede, o su carpeta):
        # el mismo camino que el que se descarga solo (`traer_de_la_sede`).
        try:
            adjuntar_fxcc(modelo, fxcc_mod.leer_fxcc(o.fxcc, rc.parcela), fuente=str(o.fxcc))
        except Exception as exc:                          # noqa: BLE001
            modelo.diagnostics.add("FXCC_UNREADABLE", f"{o.fxcc}: {exc}")

    return modelo


# ------------------------------------------- el croquis catastral por plantas
#: Husos en los que puede venir el DXF de un FXCC (la cartografia de cada
#: municipio va en el suyo; el motor trabaja en uno solo).
_CRS_FXCC = ("EPSG:25830", "EPSG:25829", "EPSG:25831", "EPSG:25828",
             "EPSG:23030", "EPSG:23029", "EPSG:23031", "EPSG:23028")


def solo_parcela(o: Opciones, rc, modelo: Modelo) -> None:
    """Solo la PARCELA por INSPIRE, con la misma cache (mismo nombre, misma
    URL) que `descargar`: si el edificio ya se midio, no toca la red. Es lo
    minimo para abrir su ficha en la Sede."""
    client = CatastroClient(cache_dir=o.cache / rc.parcela, offline=o.offline,
                            refresh=False, retries=o.retries, timeout=o.timeout,
                            pause_between_calls=o.pausa)
    cp, _ = inspire.servicios(client)
    data = cp.get_feature("parcela", rc.parcela, name=f"parcela_{rc.parcela}")
    pars = [f for f in parse_gml(data, cp.nombre) if f.geometry is not None]
    propia = [f for f in pars if rc.parcela in "".join(str(v) for v in f.attrs.values()).upper()]
    if propia or pars:
        modelo.parcel = _objeto((propia or pars)[0], o.crs_metrico)


def punto_de_la_parcela(modelo: Modelo):
    """Un punto DENTRO de la parcela (o de la huella), en EPSG:3857: es como lo
    pide el visor de la Sede para abrir la ficha de ese sitio."""
    g = modelo.parcel.geometry if modelo.parcel is not None else modelo.huella()
    if g is None or g.is_empty:
        return None
    q = reproject(g.representative_point(), modelo.crs, "EPSG:3857")
    return q.x, q.y


def traer_de_la_sede(o: Opciones, rc, modelo: Modelo, productos=None):
    """Los productos de la Sede del Catastro (`catastro/sede.py`) y, si llega,
    el FXCC por plantas adjuntado al modelo. Nunca lanza: lo que falla queda en
    el diagnostico y la medicion sigue como siempre."""
    from .catastro import sede as sede_mod
    pt = punto_de_la_parcela(modelo)
    if pt is None:
        modelo.diagnostics.add("SEDE_CATASTRO", "sin geometria de la parcela no se puede abrir su ficha en la Sede")
        return None
    cliente = sede_mod.SedeCatastro(o.cache, offline=o.offline, refresh=o.refresh)
    res = cliente.traer(rc.parcela, pt[0], pt[1], productos or sede_mod.PARA_MEDIR)
    modelo.catastro["sede"] = res.resumen()
    if res.fallos:
        modelo.diagnostics.add("SEDE_CATASTRO", "; ".join(
            f"{sede_mod.PRODUCTOS[k].titulo if k in sede_mod.PRODUCTOS else k}: {v}"
            for k, v in res.fallos.items()))
    fich = res.ficheros.get("fxcc_plantas")
    if fich is not None:
        try:
            adjuntar_fxcc(modelo, fxcc_mod.leer_fxcc(fich.datos, rc.parcela),
                          fuente=f"Sede del Catastro ({fich.fecha[:10]})")
        except Exception as exc:                          # noqa: BLE001
            modelo.diagnostics.add("FXCC_UNREADABLE", f"el FXCC de la Sede no se ha podido leer: {exc}")
    return res


def adjuntar_fxcc(modelo: Modelo, fx, fuente: str) -> bool:
    """Cuelga del modelo el croquis catastral por plantas, si ENCAJA.

    REGLA — solo se usa si cae sobre la parcela. El DXF va en el huso de la
    cartografia del municipio; si no se solapa con la parcela de INSPIRE se
    prueba en los otros husos y, si ninguno encaja, NO se usa: unos poligonos
    fuera de sitio repartirian el garaje sobre la vivienda.

    Ademas se contrastan, planta a planta, sus superficies con las de `lcons`:
    el croquis puede ser de otra fecha (la de su .ASC) que los datos.
    """
    from shapely.ops import unary_union
    ref = modelo.parcel.geometry if modelo.parcel is not None else modelo.huella()
    polis = [r.poligono for r in fx.recintos() if r.poligono is not None]
    resumen = {"fuente": fuente, "alineado": False}
    if not polis or ref is None or ref.is_empty:
        modelo.catastro["fxcc_plantas"] = resumen | fx.to_dict()
        modelo.diagnostics.add("FXCC_PLANTAS", "el croquis catastral no trae recintos que situar")
        return False
    todo = unary_union(polis)

    def solape(g):
        return g.intersection(ref).area / g.area if g.area else 0.0

    mejor, crs_bueno = solape(todo), modelo.crs
    if mejor < 0.6:
        for crs in _CRS_FXCC:
            if crs == modelo.crs:
                continue
            try:
                s = solape(reproject(todo, crs, modelo.crs))
            except Exception:                              # noqa: BLE001
                continue
            if s > mejor:
                mejor, crs_bueno = s, crs
    if mejor < 0.6:
        modelo.catastro["fxcc_plantas"] = resumen | fx.to_dict()
        modelo.diagnostics.add(
            "FXCC_PLANTAS", f"el croquis catastral ({fuente}) no cae sobre la parcela "
            f"(solape {mejor:.0%}): no se usa")
        return False
    if crs_bueno != modelo.crs:
        fx.transformar(lambda g: reproject(g, crs_bueno, modelo.crs))
        fx.srs_origen = crs_bueno
    resumen["alineado"] = True
    modelo.catastro["_fxcc"] = fx
    # Con el croquis, el poligono de cada unidad SI esta: el aviso de que falta
    # mandaria a buscar algo que ya se tiene.
    d = modelo.diagnostics
    for i in [i for i, c in enumerate(d.codes) if c == "SPACE_GEOMETRY_UNAVAILABLE"][::-1]:
        del d.codes[i]
        del d.messages[i]

    # Superficies por planta: croquis contra `lcons` (las dos son de Catastro).
    dichos = []
    for p in fx.plantas:
        decl = sum(float(u.get("superficie") or 0) for u in p.declarados
                   if not str(u.get("codigo") or "").upper().startswith("PTO"))
        for n in p.niveles:
            lcons = sum(float(s.area or 0) for s in modelo.spaces
                        if s.floor == n and (s.attrs or {}).get("codigo"))
            if lcons and decl and abs(decl - lcons) > max(2.0, 0.05 * lcons):
                dichos.append(f"{_nombre_nivel(n)}: el croquis declara {decl:g} m2 y los datos "
                              f"catastrales {lcons:g} m2")
    if dichos:
        modelo.diagnostics.add(
            "FXCC_PLANTAS", f"el croquis catastral es de {fx.asc.get('fecha') or 'fecha desconocida'} "
            "y no coincide del todo con los datos de hoy (" + "; ".join(dichos) + ")")
    for a in fx.avisos:
        modelo.diagnostics.add("FXCC_PLANTAS", a)
    modelo.catastro["fxcc_plantas"] = resumen | fx.to_dict()
    modelo.diagnostics.add(
        "FXCC_PLANTAS", f"croquis catastral por plantas ({fuente}): "
        + "; ".join(f"{p.nombre or p.capa} -> " + ", ".join(
            f"{r.codigo} {r.literal} {r.superficie:g} m2" if r.superficie else r.codigo
            for r in p.recintos) for p in fx.plantas))
    return True


def _vecinos_en_nivel(modelo: Modelo, nivel: int):
    """Huella de los colindantes A LA ALTURA de la planta `nivel`.

    Con la vivienda delimitada a mano, lo construido fuera de su contorno EN
    ESE NIVEL (las casas de al lado) es colindante tambien. Por nivel y no
    junto: donde la casa de al lado solo tiene planta baja, la pared de la
    primera planta de esta da al aire, no a una medianera.
    """
    resto = (modelo.recorte_resto or {}).get(nivel)
    completo = modelo.vecinos_geom()
    if not modelo.neighbour_partes:
        return unir([completo, resto])
    if nivel >= 0:
        trozos = [p.geometry for p in modelo.neighbour_partes
                  if (p.plantas_sobre_rasante or 1) >= nivel + 1]
    else:
        trozos = [p.geometry for p in modelo.neighbour_partes
                  if (p.plantas_bajo_rasante or 0) >= abs(nivel)]
    return unir([*trozos, resto])


# ------------------------------------------------ delimitar la VIVIENDA a mano
#: Por debajo de esto un contorno no es una vivienda: es un clic de mas.
AREA_MINIMA_RECORTE_M2 = 4.0


class RecorteInvalido(ValueError):
    """El contorno dibujado no sirve para delimitar la vivienda."""


def recortar_vivienda(modelo: Modelo, poligono) -> str | None:
    """Deja la envolvente en la VIVIENDA que el certificador ha dibujado.

    POR QUE EXISTE: en una comunidad de adosados la parcela es la del conjunto
    —dos hileras y su calle privada, medido en 3677802WJ3437F (26RES060_205):
    188 paredes— y Catastro NO dibuja donde acaba cada casa: sus BuildingParts
    se parten por numero de plantas, no por vivienda. La envolvente de un
    certificado es la de UNA casa, y apartar a mano las paredes de las demas no
    la cierra: la linea que la separa de la de al lado no existe en el modelo.

    REGLA — lo de fuera del contorno SIGUE CONSTRUIDO y es otra vivienda. No se
    borra: se guarda por nivel en `recorte_resto` y entra como colindante, asi
    que la pared contra la casa de al lado sale como MEDIANERA (adiabatica en
    CE3X) y la que da a la calle, al patio o al jardin sigue siendo FACHADA.

    REGLA — el contorno es un PRISMA: vale para todas las plantas. Es lo que es
    una vivienda adosada, y en la planta de arriba el diente de la casa de al
    lado se resuelve solo al cortar su huella con el.

    `poligono` son los vertices EN EL CRS DEL MODELO (metros, EPSG:25830), no
    en el lienzo: el lienzo cambia al recortar —se encuadra la casa— y un
    contorno guardado en sus coordenadas se descolocaria al volver a abrir.
    """
    if not poligono:
        return None
    from shapely.geometry import Polygon
    try:
        pts = [(float(x), float(y)) for x, y in poligono]
    except (TypeError, ValueError):
        raise RecorteInvalido("el contorno de la vivienda no son pares de coordenadas")
    if len(pts) < 3:
        raise RecorteInvalido("el contorno de la vivienda necesita al menos 3 vertices")
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)          # un contorno que se cruza consigo mismo
    if poly.is_empty or poly.area < AREA_MINIMA_RECORTE_M2:
        raise RecorteInvalido("el contorno de la vivienda no encierra superficie")

    originales = list(modelo.partes)
    if not originales:
        raise RecorteInvalido("sin BuildingParts de Catastro no hay edificio que delimitar")

    # Lo de FUERA, planta a planta, sacado de lo que hay construido de verdad.
    resto: dict[int, object] = {}
    for pl in floors_mod.plantas_desde_partes(originales):
        r = floors_mod._limpia(pl.huella.difference(poly))
        if r is not None:
            resto[pl.nivel] = r

    from dataclasses import replace
    recortadas = []
    for p in originales:
        g = floors_mod._limpia(p.geometry.intersection(poly))
        if g is not None:
            recortadas.append(replace(p, geometry=g))
    if not recortadas:
        raise RecorteInvalido("el contorno dibujado no toca el edificio: dibujalo "
                              "sobre la vivienda, en el plano de la planta baja")

    total = sum(p.geometry.area for p in originales)
    modelo.partes = recortadas
    modelo.recorte = poly
    modelo.recorte_resto = resto

    plantas = floors_mod.plantas_desde_partes(recortadas)
    datos = modelo.catastro.get("_datos")
    if datos is not None:
        floors_mod.asignar_usos(plantas, datos.usos_por_planta())
    modelo.floors = plantas

    dentro = sum(p.geometry.area for p in recortadas)
    por_planta = ", ".join(f"{_nombre_nivel(p.nivel)} {p.area_m2:.1f} m2"
                           for p in plantas)
    dicho = (f"la envolvente se ha DELIMITADO A MANO a la vivienda ({por_planta}) "
             f"dentro de un edificio de {total:.0f} m2 de huella por partes; "
             f"lo construido fuera del contorno ({total - dentro:.0f} m2) se trata "
             "como las viviendas de al lado: la pared contra ellas sale como "
             "MEDIANERA y la que da a la calle, al patio o al jardin, como fachada")
    modelo.diagnostics.add("RECORTE_VIVIENDA", dicho)
    return dicho


# ------------------------------------------ que construcciones CUENTAN
def aplicar_seleccion(modelo: Modelo, incluidas) -> list[str]:
    """Deja mandando la seleccion de la OPORTUNIDAD sobre el uso de Catastro.

    POR QUE EXISTE: Catastro dice de que es cada trozo construido, y se
    equivoca. Una planta puede constar como ALMACEN y ser vivienda —pasa a
    menudo con las reformas sin declarar—, y al reves: un porche cerrado que
    consta como vivienda y no calienta nadie. Al abrir la oportunidad se marca
    en la ficha tecnica cuales cuentan, y de ahi sale la superficie con la que
    se le prometio el ahorro al cliente. Esa misma marca tiene que llegar aqui,
    o el `.cex` mide OTRO edificio que la propuesta que se firmo.

    `incluidas` son los codigos `escalera/planta/puerta` marcados. Se aplica
    sobre `attrs["habitable"]`, que es la llave de la que ya cuelga todo lo
    demas —que plantas se dibujan y se miden (`plano_svg`), la superficie util
    del `.cex` (`fichaCe3x`) y de que paredes se piden fotos—, asi que no hay
    un camino paralelo que pueda divergir.

    REGLA — sin seleccion NO se toca nada. El valor por defecto de la ficha
    tecnica es "todas las de uso VIVIENDA", que es exactamente lo que ya hace
    Catastro aqui: una oportunidad que nunca paso por esa pantalla tiene que
    seguir midiendo igual que antes de que esto existiera.

    Devuelve lo que ha CAMBIADO, para decirlo: que un almacen pase a contar
    como vivienda es una decision de una persona y no puede ser invisible.
    """
    if not incluidas:
        return []
    marcadas = {str(c).strip() for c in incluidas if str(c).strip()}
    cambios: list[str] = []
    vistos: set[str] = set()

    for s in modelo.spaces:
        codigo = (s.attrs or {}).get("codigo")
        if not codigo:
            continue                      # del DXF: no viene de `lcons`
        vistos.add(codigo)
        antes = s.attrs.get("habitable")
        ahora = codigo in marcadas
        s.attrs["habitable"] = ahora
        s.attrs["cuenta"] = ahora
        if bool(antes) == ahora:
            continue
        cambios.append(
            f"{codigo} ({s.attrs.get('uso_literal') or s.use}, "
            f"{s.attrs.get('planta_literal') or s.floor}, {s.area} m2): "
            + ("CUENTA como habitable aunque Catastro lo llame "
               f"{s.attrs.get('uso_literal') or s.use}"
               if ahora else
               "NO cuenta, aunque Catastro lo tenga como "
               f"{s.attrs.get('uso_literal') or s.use}"))

    # Un codigo marcado que aqui no existe es que las dos listas ya no son la
    # misma —Catastro ha cambiado, o la seleccion es de otra parcela—. Se dice:
    # callarlo seria medir de menos sin que nadie se entere.
    for c in sorted(marcadas - vistos):
        cambios.append(f"la oportunidad marca la construccion {c}, que no esta "
                       "en lo que devuelve Catastro hoy: comprueba la ficha tecnica")
    if cambios:
        modelo.diagnostics.add(
            "CONSTRUCCIONES_SELECCIONADAS",
            "las construcciones que cuentan las marco una persona en la "
            f"oportunidad, no el uso de Catastro: {'; '.join(cambios)}")
    return cambios


#: Los tipos de edificio de CE3X que son TERCIARIO. Las cadenas son las mismas
#: que `tools/terciario.py` y que la app (`fichaCe3x.js`).
TIPOS_TERCIARIO = ("pequeno_terciario", "gran_terciario")


def es_terciario(tipo: str | None) -> bool:
    return tipo in TIPOS_TERCIARIO


def aplicar_tipo_edificio(modelo: Modelo, tipo: str | None) -> list[str]:
    """En un TERCIARIO cuentan los usos del terciario, no solo la vivienda.

    POR QUE EXISTE: el motor mide lo HABITABLE, y hasta ahora eso era VIVIENDA y
    LOCAL. Un hotel es 'HOTELERO' en Catastro, una iglesia 'RELIGIOSO' y
    'ENSEÑANZA', una residencia 'SANIDAD': ninguno contaba. Medido sobre los
    ejemplos del 2026-09-28 —la parroquia de 25TER100_1 se habria medido solo
    por la vivienda de su segunda planta (302 de 1.272 m²), y la residencia de
    Socuéllamos, como no tiene nada «habitable», ENTERA: almacen y aparcamiento
    incluidos—.

    Solo se tocan los espacios que Catastro no decide (`habitable` a None): un
    almacen, un garaje o unos comunes siguen fuera, y lo que no se reconoce (un
    porche) tambien. Va ANTES de `aplicar_seleccion`: si una persona marco en
    la oportunidad que construcciones cuentan, eso sigue mandando.

    Se deja escrito en el modelo (`tipo_edificio_ce3x`) porque de el cuelga
    tambien que forjados se escriben (ver `floors.elementos_horizontales`).
    """
    modelo.catastro["tipo_edificio_ce3x"] = tipo if es_terciario(tipo) else "residencial"
    if not es_terciario(tipo):
        return []
    cambios = []
    for s in modelo.spaces:
        a = s.attrs if s.attrs is not None else {}
        if s.use in alphanumeric.ACONDICIONADOS_TERCIARIO and a.get("habitable") is None:
            a["habitable"] = True
            a["cuenta"] = True
            a["habitable_por_tipo"] = True
            s.attrs = a
            cambios.append(f"{a.get('codigo') or '?'} ({a.get('uso_literal') or s.use}, "
                           f"{a.get('planta_literal') or s.floor}, {s.area} m2)")
    if cambios:
        modelo.diagnostics.add(
            "USOS_TERCIARIOS",
            "es un TERCIARIO: cuentan tambien los usos del terciario que Catastro no "
            f"da por habitables ({'; '.join(cambios)}). Almacen, garaje y comunes "
            "siguen fuera. Desmarca en el desglose lo que no se acondicione.")
    return cambios


def sin_vivienda_mide_todo(modelo: Modelo) -> list[str]:
    """Si NADA cuenta como habitable, se mide el edificio ENTERO, y se dice.

    POR QUE EXISTE: hay fincas en las que Catastro no declara ninguna vivienda
    —una casa que consta entera como ALMACEN, la reforma que nunca se declaro—.
    Medido en 0005703VJ8100N (26RES060_184): planta baja y primera, las dos
    «ALMACEN». Con la regla de «solo lo habitable», al plano no le quedaba ni
    una pared, el motor devolvia un plano vacio a medias y la ventana moria con
    un escueto `'contexto'` — y encima sin salida, porque el desglose para
    marcar que cuenta solo se ve cuando ya hay plano.

    Medir todo es lo unico con sentido: si se esta certificando, alli hay una
    vivienda, y Catastro no dice cual de sus partes es. Se marca
    `habitable_por_defecto` para que la pantalla lo diga con esas palabras y
    se pueda desmarcar lo que no sea vivienda (eso ya lo guarda una persona, y
    entonces manda su seleccion).
    """
    con_codigo = [s for s in modelo.spaces if (s.attrs or {}).get("codigo")]
    if not con_codigo or any((s.attrs or {}).get("habitable") for s in modelo.spaces):
        return []
    cambios = []
    for s in con_codigo:
        s.attrs["habitable"] = True
        s.attrs["cuenta"] = True
        s.attrs["habitable_por_defecto"] = True
        cambios.append(f"{s.attrs['codigo']} ({s.attrs.get('uso_literal') or s.use}, "
                       f"{s.attrs.get('planta_literal') or s.floor}, {s.area} m2)")
    modelo.diagnostics.add(
        "SIN_VIVIENDA_EN_CATASTRO",
        "Catastro no declara ninguna vivienda en esta finca: se mide el edificio "
        f"ENTERO ({'; '.join(cambios)}). Desmarca en el desglose lo que no sea vivienda.")
    return cambios


#: Por debajo de esto una zona dibujada no es un garaje: es un clic de mas.
AREA_MINIMA_ZONA_M2 = 1.0

#: Como puede llamarse una zona que no cuenta. GARAJE, ALMACEN y el genérico
#: solo ponen nombre: en CE3X los tres se escriben igual (particion con espacio
#: no habitable). El PORCHE ABIERTO es otra cosa: es EXTERIOR (ver
#: `floors.plantas_desde_partes`).
USOS_ZONA = ("GARAJE", "ALMACEN", floors_mod.NO_HABITABLE, floors_mod.PORCHE)


def _objetivos_catastro(modelo: Modelo, nivel: int, huella_m2: float) -> tuple[dict, dict]:
    """Los m2 que Catastro declara en ESTE nivel por uso de zona, escalados a la
    huella (la suma de las unidades no siempre casa con el poligono: 197 frente
    a 195,36 en OP246). Devuelve (objetivos, declarados_sin_escalar)."""
    return _objetivos_de(modelo, nivel, huella_m2)


def _uso_zona(s) -> str:
    """El uso de ZONA de una construccion que no es vivienda."""
    a = s.attrs or {}
    literal = str(a.get("uso_literal") or s.use or "").upper()
    if literal.startswith("PORCHE"):
        return floors_mod.PORCHE
    if s.use in ("GARAJE", "ALMACEN"):
        return s.use
    return floors_mod.NO_HABITABLE


def _objetivos_de(modelo: Modelo, nivel: int, huella_m2: float,
                  sin_codigos=()) -> tuple[dict, dict]:
    """`_objetivos_catastro`, pudiendo dejar fuera construcciones concretas (las
    que ya son un CUERPO aparte: esas se quitan con «Quitar cuerpo», no con un
    croquis). La escala es siempre la de la planta entera."""
    esp = [s for s in modelo.spaces if s.floor == nivel and s.area]
    total = sum(float(s.area) for s in esp)
    escala = (huella_m2 / total) if total > 0 else 1.0
    fuera = set(sin_codigos or ())
    crudo: dict[str, float] = {}
    for s in esp:
        a = s.attrs or {}
        if a.get("habitable") or a.get("codigo") in fuera:
            continue
        uso = _uso_zona(s)
        crudo[uso] = crudo.get(uso, 0.0) + float(s.area)
    return {u: v * escala for u, v in crudo.items()}, crudo


def ajustar_croquis(modelo: Modelo, croquis, ajustar: bool = True) -> tuple[list[dict], list[dict]]:
    """El CROQUIS a mano alzada, convertido en zonas con los m2 de Catastro.

    Cada trazo es `{nivel, uso, poligono: [[x,y],...]}` en EPSG:25830 (lo que
    dibuja la ventana) o `{nivel, uso, uv: [[u,v],...]}` en fracciones de la
    huella de su planta, de OESTE a ESTE y de SUR a NORTE (lo que escribe la
    skill: «el garaje es la franja norte»). Ver `gis/croquis.py`.

    Devuelve (zonas para `leer_zonas`, detalle para la respuesta).
    """
    if not croquis:
        return [], []
    from shapely.geometry import Polygon
    from .gis import croquis as croquis_mod

    huellas = {pl.nivel: pl.huella for pl in floors_mod.plantas_desde_partes(modelo.partes)}
    por_nivel: dict[int, list[dict]] = {}
    dichos: list[str] = []
    for i, t in enumerate(croquis if isinstance(croquis, list) else []):
        if not isinstance(t, dict):
            continue
        try:
            nivel = int(t.get("nivel"))
        except (TypeError, ValueError):
            dichos.append(f"el trazo {i + 1} no dice en que planta esta")
            continue
        huella = huellas.get(nivel)
        if huella is None:
            dichos.append(f"el trazo {i + 1} es de {_nombre_nivel(nivel)}, que no existe")
            continue
        uso = str(t.get("uso") or "").strip().upper()
        uso = uso if uso in USOS_ZONA else floors_mod.NO_HABITABLE
        try:
            if t.get("uv"):
                a_xy = croquis_mod.marco(huella)
                pts = [a_xy(float(u), float(v)) for u, v in t["uv"]]
            else:
                pts = [(float(x), float(y)) for x, y in (t.get("poligono") or [])]
        except (TypeError, ValueError):
            dichos.append(f"el trazo {i + 1} no trae vertices legibles")
            continue
        if len(pts) < 3:
            dichos.append(f"el trazo {i + 1} tiene menos de 3 puntos")
            continue
        por_nivel.setdefault(nivel, []).append(
            {"indice": i, "uso": uso, "poligono": Polygon(pts)})

    zonas: list[dict] = []
    detalle: list[dict] = []
    for nivel, trazos in sorted(por_nivel.items()):
        huella = huellas[nivel]
        objetivos, declarados = _objetivos_catastro(modelo, nivel, huella.area)
        hechos, avisos = croquis_mod.ajustar_nivel(huella, trazos, objetivos, ajustar)
        dichos.extend(f"{_nombre_nivel(nivel)}: {a}" for a in avisos)
        for z in hechos:
            coords = [[round(x, 2), round(y, 2)] for x, y in z["poligono"].exterior.coords[:-1]]
            zonas.append({"nivel": nivel, "uso": z["uso"], "poligono": coords})
            detalle.append({"indice": z["indice"], "nivel": nivel, "uso": z["uso"],
                            "poligono": coords, "area_m2": z["area_m2"],
                            "objetivo_m2": z["objetivo_m2"],
                            "catastro_m2": round(declarados.get(z["uso"], 0.0), 2) or None,
                            "dibujado_m2": z["dibujado_m2"], "de": z["de"]})
        resto = huella.area - sum(z["area_m2"] for z in hechos)
        if hechos:
            dichos.append(f"{_nombre_nivel(nivel)}: croquis ajustado ("
                          + ", ".join(f"{z['uso']} {z['area_m2']:.1f} m2" for z in hechos)
                          + f"); queda de vivienda {resto:.1f} m2")
    if dichos:
        modelo.diagnostics.add("CROQUIS", "; ".join(dichos))
    return zonas, detalle


#: Por debajo de esto, lo que Catastro declara que no es vivienda en una planta
#: no merece una propuesta (redondeos entre `lcons` y la huella).
PROPUESTA_MINIMA_M2 = 4.0


def construcciones_de(modelo: Modelo) -> list[dict]:
    """Las filas de `lcons` con lo que hace falta para casarlas con un recinto
    del croquis catastral (planta, escalera, puerta) y si CUENTAN hoy."""
    out = []
    for s in modelo.spaces:
        a = s.attrs or {}
        if not a.get("codigo"):
            continue
        out.append({"codigo": a["codigo"], "nivel": s.floor, "puerta": a.get("puerta"),
                    "escalera": a.get("escalera"), "habitable": a.get("habitable"),
                    "uso": a.get("uso_literal") or s.use, "superficie": s.area})
    return out


def recinto_cuenta(modelo: Modelo, nivel: int, r) -> tuple[bool, str | None]:
    """¿Cuenta este recinto del croquis catastral? (cuenta, codigo de `lcons`).

    La decision es `fxcc.cuenta`, la misma que usa el inventario de cuerpos.
    """
    con = fxcc_mod.construccion_de(r, nivel, construcciones_de(modelo))
    terciario = es_terciario(modelo.catastro.get("tipo_edificio_ce3x"))
    return fxcc_mod.cuenta(r, con, terciario), (con or {}).get("codigo")


def _zona_de_recinto(r) -> str:
    if r.uso == "EXTERIOR":
        return floors_mod.PORCHE
    if r.uso in ("GARAJE", "ALMACEN"):
        return r.uso
    return floors_mod.NO_HABITABLE


def _propuesta_fxcc(modelo: Modelo, nivel: int, huella, aparte) -> dict | None:
    """La propuesta de una planta que DIBUJA el croquis catastral por plantas.

    No es una conjetura: son los recintos de Catastro (`fxcc.py`), con su uso.
    Se proponen —como la geometrica— y no se aplican: puede haber una obra
    posterior al croquis (la fecha va en el motivo). Lo que no cuenta se agrupa
    por uso de zona; lo que ya es un CUERPO aparte se descuenta (se quita con
    «Quitar cuerpo», no con una zona).
    """
    from shapely.ops import unary_union
    fx = modelo.catastro.get("_fxcc")
    planta = fx.planta_de_nivel(nivel) if fx is not None else None
    if planta is None:
        return None
    fuera_aparte = unary_union([g for _, g in aparte]) if aparte else None
    grupos: dict[str, list] = {}
    avisos: list[str] = []
    for r in planta.recintos:
        if r.poligono is None:
            continue
        cuenta, codigo = recinto_cuenta(modelo, nivel, r)
        if cuenta:
            continue
        g = huella.intersection(r.poligono)
        if fuera_aparte is not None and not fuera_aparte.is_empty:
            g = g.difference(fuera_aparte)
        # Las tiras que deja cruzar dos dibujos de la misma cartografia.
        g = g.buffer(-0.15, join_style=2).buffer(0.15, join_style=2).intersection(huella)
        g = floors_mod._limpia(g)
        if g is None or g.area < AREA_MINIMA_ZONA_M2:
            continue
        grupos.setdefault(_zona_de_recinto(r), []).append((r, g, codigo))
        if r.uso not in ("EXTERIOR", "GARAJE", "ALMACEN"):
            avisos.append(f"{r.codigo} ({r.literal}, {r.superficie:g} m2) no es vivienda: si se "
                          "calefacta con la casa, marcalo como que cuenta en el desglose")
    trazos = []
    for uso, piezas in grupos.items():
        unida = unary_union([g for _, g, _ in piezas])
        partes = list(getattr(unida, "geoms", [unida]))
        for parte in partes:
            if parte.geom_type != "Polygon" or parte.area < AREA_MINIMA_ZONA_M2:
                continue
            suyos = [(r, c) for r, g, c in piezas if g.intersection(parte).area > 0.5]
            trazos.append({
                "uso": uso,
                "poligono": [[round(x, 2), round(y, 2)] for x, y in parte.exterior.coords[:-1]],
                "area_m2": round(parte.area, 2),
                "catastro_m2": round(sum(r.superficie or 0 for r, _ in suyos), 2) or None,
                "ancla": [], "lado": "catastro", "confianza": "alta", "origen": "fxcc",
                "codigos": [r.codigo for r, _ in suyos],
                "por_que": ("lo dibuja el croquis catastral por plantas de Catastro "
                            f"({fx.asc.get('fecha') or 'sin fecha'}): "
                            + ", ".join(f"{r.literal} {r.codigo} ({r.superficie:g} m2)"
                                        for r, _ in suyos)),
            })
    if not trazos:
        return None
    if sum(t["area_m2"] for t in trazos) >= huella.area - AREA_MINIMA_ZONA_M2:
        return {"nivel": nivel, "origen": "fxcc", "trazos": [], "avisos": [
            "el croquis catastral no deja vivienda en esta planta: no se propone quitarla entera"]}
    return {"nivel": nivel, "origen": "fxcc", "trazos": trazos, "avisos": avisos}


def proponer_croquis(modelo: Modelo, elementos, inventario=None, niveles_hechos=(),
                     pistas=None) -> list[dict]:
    """La PROPUESTA de croquis para cada planta que la necesita (ver
    `gis/croquis_propuesta.py`).

    La necesita una planta donde Catastro declara usos que NO son vivienda
    MEZCLADOS con ella en el mismo cuerpo: lo que es un cuerpo aparte ya casado
    con su construccion (el aparcamiento adosado) se quita entero y no entra, y
    una planta que ya tiene sus zonas o su croquis tampoco — ya lo decidio una
    persona.

    `elementos`: las paredes medidas (`ElementoCE3X`). `pistas`: {uso: [ids de
    pared]} — hoy, las fachadas en cuya FOTO hay una puerta de garaje.
    Devuelve [{nivel, trazos: [...], avisos}] con los poligonos en EPSG:25830.
    """
    from shapely import wkt as shp_wkt
    from shapely.ops import unary_union
    from .gis import croquis as croquis_mod
    from .gis import croquis_propuesta as cp

    hechos = {int(n) for n in (niveles_hechos or ()) if n is not None}
    huellas = {pl.nivel: pl.huella for pl in floors_mod.plantas_desde_partes(modelo.partes)}
    # Lo que ya es un cuerpo aparte, por nivel: su construccion y su poligono.
    casados: dict[int, list] = {}
    for c in inventario or []:
        con = c.get("construccion") or {}
        if c.get("_geom") is None:
            continue
        if con.get("habitable") is False:
            for n in c.get("niveles_fuera") or []:
                casados.setdefault(int(n), []).append((con.get("codigo"), c["_geom"]))
        elif c.get("fuera"):
            # Un cuerpo que el certificador ya ha dejado fuera sin que case con
            # nada: su sitio no se propone, pero sus m2 no se sabe de que son.
            for n in c.get("niveles_fuera") or []:
                casados.setdefault(int(n), []).append((None, c["_geom"]))

    salida = []
    for nivel, huella in sorted(huellas.items()):
        if nivel in hechos or huella is None or huella.is_empty:
            continue
        aparte = casados.get(nivel, [])
        # Donde hay CROQUIS CATASTRAL de esta planta no se conjetura nada: se
        # proponen sus recintos (o nada, si todo lo que dibuja es vivienda).
        fx = modelo.catastro.get("_fxcc")
        if fx is not None and fx.planta_de_nivel(nivel) is not None:
            pr = _propuesta_fxcc(modelo, nivel, huella, aparte)
            if pr and pr.get("trazos"):
                salida.append(pr)
            continue
        objetivos, declarados = _objetivos_de(modelo, nivel, huella.area,
                                              sin_codigos=[cod for cod, _ in aparte if cod])
        objetivos = {u: v for u, v in objetivos.items() if v >= PROPUESTA_MINIMA_M2}
        if not objetivos:
            continue
        mixta = huella.difference(unary_union([g for _, g in aparte])) if aparte else huella
        if mixta.is_empty or mixta.area < sum(objetivos.values()) * 0.5:
            continue
        paredes = []
        for e in elementos or []:
            if e.nivel != nivel or not e.geometria_wkt:
                continue
            try:
                linea = shp_wkt.loads(e.geometria_wkt)
            except Exception:                              # noqa: BLE001
                continue
            if linea.geom_type not in ("LineString", "MultiLineString"):
                continue
            # Solo las paredes del BORDE de la parte mezclada.
            if linea.distance(mixta.boundary) > 0.3:
                continue
            paredes.append({"id": e.id, "tipo": e.tipo, "subtipo": e.subtipo,
                            "orientacion": e.orientacion, "linea": linea})
        semillas, notas = cp.proponer(mixta, paredes, objetivos, pistas)
        if not semillas:
            continue
        zonas, avisos = croquis_mod.ajustar_nivel(
            mixta, [{"indice": s["indice"], "uso": s["uso"], "poligono": s["poligono"]}
                    for s in semillas], objetivos, True)
        por_indice = {s["indice"]: s for s in semillas}
        trazos = []
        for z in zonas:
            s = por_indice[z["indice"]]
            trazos.append({
                "uso": z["uso"],
                "poligono": [[round(x, 2), round(y, 2)] for x, y in z["poligono"].exterior.coords[:-1]],
                "area_m2": z["area_m2"],
                "catastro_m2": round(declarados.get(z["uso"], 0.0), 2) or None,
                "ancla": s["ancla"], "lado": s["lado"],
                "por_que": s["por_que"], "confianza": s["confianza"],
            })
        salida.append({"nivel": nivel, "trazos": trazos, "avisos": notas + avisos})
    return salida


def leer_zonas(modelo: Modelo, zonas) -> list[dict]:
    """Las ZONAS que no cuentan, dibujadas planta a planta, ya validadas.

    POR QUE EXISTE — 8919709VJ8681N (26RES080_85): la casa es UN BuildingPart
    de dos plantas, y en la BAJA hay un garaje dentro de el, con la vivienda
    encima. Catastro no dibuja esa linea, y las dos herramientas que habia no
    servian: una pared dibujada separa pero no quita superficie («me seguia
    sumando la superficie de suelo»), y delimitar la vivienda es un PRISMA que
    recortaba tambien la planta primera («esa misma planta se copia en planta
    primera»).

    Una zona es un poligono en el CRS del modelo (EPSG:25830, como el contorno
    de la vivienda: el lienzo cambia al volver a medir) y el NIVEL en el que no
    cuenta. Entra por el MISMO camino que un cuerpo excluido
    (`plantas_desde_partes(fuera_por_nivel=…)`), asi que sale lo mismo: la pared
    de la casa contra el garaje es una PARTICION con espacio no habitable, la
    fachada del garaje deja de ser de la vivienda y el forjado de la planta de
    arriba es un suelo sobre espacio no habitable — no un voladizo.

    REGLA — una zona que no sirve NO tumba la medicion: se dice y se salta. Un
    poligono guardado hace meses no puede dejar el expediente sin plano.
    """
    if not zonas:
        return []
    from shapely.geometry import Polygon
    huellas = {pl.nivel: pl.huella for pl in floors_mod.plantas_desde_partes(modelo.partes)}
    salida: list[dict] = []
    dichos: list[str] = []
    for i, z in enumerate(zonas if isinstance(zonas, list) else []):
        if not isinstance(z, dict):
            continue
        try:
            nivel = int(z.get("nivel"))
            pts = [(float(x), float(y)) for x, y in (z.get("poligono") or [])]
        except (TypeError, ValueError):
            dichos.append(f"la zona {i + 1} no trae un nivel y unos vertices legibles")
            continue
        if len(pts) < 3:
            dichos.append(f"la zona {i + 1} tiene menos de 3 vertices")
            continue
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        huella = huellas.get(nivel)
        if huella is None:
            dichos.append(f"la zona {i + 1} es de {_nombre_nivel(nivel)}, que no existe")
            continue
        dentro = floors_mod._limpia(huella.intersection(poly))
        if dentro is None or dentro.area < AREA_MINIMA_ZONA_M2:
            dichos.append(f"la zona {i + 1} ({_nombre_nivel(nivel)}) no toca lo construido")
            continue
        if dentro.area >= huella.area - AREA_MINIMA_ZONA_M2:
            dichos.append(f"la zona {i + 1} cubre {_nombre_nivel(nivel)} entera: no se aplica "
                          "(no quedaria vivienda en esa planta)")
            continue
        uso = str(z.get("uso") or "").strip().upper()
        salida.append({"indice": i, "nivel": nivel, "geom": poly,
                       "uso": uso if uso in USOS_ZONA else floors_mod.NO_HABITABLE,
                       "area_m2": round(dentro.area, 2)})
    if dichos:
        modelo.diagnostics.add("ZONAS_FUERA", "; ".join(dichos))
    return salida


def excluir_cuerpos(modelo: Modelo, ids, inventario=None, zonas=None) -> list[str]:
    """Saca de la envolvente los CUERPOS que el certificador dice que no cuentan.

    POR QUE EXISTE: Catastro dibuja el edificio en partes —la casa, el garaje
    adosado, el porche— y aqui se unen por nivel para sacar la huella que se
    segmenta en paredes. La envolvente de un certificado es la de la VIVIENDA,
    asi que un aparcamiento adosado no va dentro; pero como el filtro es por
    NIVEL —la planta baja tiene vivienda, luego se dibuja entera— sus paredes
    entraban igual y habia que apartarlas una a una.

    REGLA — se quita POR PLANTA y se VUELVE A MEDIR, no se tachan sus paredes
    ni se borra el cuerpo entero. Un garaje con vivienda encima es UN
    BuildingPart de DOS plantas: Catastro dibuja el prisma completo y declara
    APARCAMIENTO solo en la baja. Borrandolo de las dos, la planta primera
    pierde su superficie y sus fachadas reales (medido en 2370310VJ4027S: 19 m2
    y dos fachadas a la calle). Los niveles los dice `cuerpos.niveles_fuera`.

    REGLA — lo que se quita SIGUE CONSTRUIDO, y por eso no se toca `buildings`.
    Se guarda en `Planta.no_habitable`, de donde salen las dos cosas que lo
    distinguen de un solar: que la pared de la casa contra el sea una PARTICION
    VERTICAL —no una fachada al aire— y que el forjado de encima sea una
    particion con espacio no habitable —no un voladizo—.
    """
    fuera = {str(i).strip() for i in (ids or []) if str(i).strip()}
    #: `zonas` son las de `leer_zonas` (ya validadas): trozos dibujados a mano
    #: que no cuentan EN UN NIVEL. Van por el mismo `fuera_por_nivel`.
    zonas = zonas or []
    if not fuera and not zonas:
        return []

    from .gis import cuerpos as cuerpos_mod
    inv = inventario if inventario is not None else cuerpos_mod.inventario(modelo)
    por_id = {c["id"]: c for c in inv}

    desconocidos = sorted(fuera - set(por_id))
    if desconocidos:
        # Un id que ya no existe es que la geometria de Catastro ha cambiado, o
        # que lo guardado es de otra parcela. Se dice: callarlo seria medir de
        # mas sin que nadie se entere.
        modelo.diagnostics.add(
            "CUERPOS_EXCLUIDOS",
            "se pidio dejar fuera " + ", ".join(desconocidos)
            + ", y ninguno esta entre los cuerpos que devuelve Catastro hoy")

    fuera_por_nivel: dict[int, list[dict]] = {}
    dichos: list[str] = []
    for pid in sorted(fuera & set(por_id)):
        c = por_id[pid]
        niveles = cuerpos_mod.niveles_fuera(c)
        geom = c.get("_geom")
        if geom is None or not niveles:
            continue
        # Cada cuerpo va con SU uso: un garaje y un almacen bajo la misma
        # planta son dos particiones distintas, y el forjado de cada una tiene
        # que decir sobre que da.
        for n in niveles:
            fuera_por_nivel.setdefault(n, []).append(
                {"geom": geom, "uso": (c.get("construccion") or {}).get("uso")
                 or floors_mod.NO_HABITABLE})
        uso = (c.get("construccion") or {}).get("uso") or "sin uso declarado"
        plantas_dichas = ", ".join(_nombre_nivel(n) for n in niveles)
        resto = [n for n in (c.get("niveles") or []) if n not in niveles]
        dichos.append(
            f"{pid} ({uso}, {geom.area:.0f} m2) en {plantas_dichas}"
            + (f"; en {', '.join(_nombre_nivel(n) for n in resto)} SIGUE contando"
               if resto else ""))

    dichas_zonas: list[str] = []
    for z in zonas:
        fuera_por_nivel.setdefault(z["nivel"], []).append(
            {"geom": z["geom"], "uso": z["uso"], "dibujada": True})
        dichas_zonas.append(f"{z['uso']} de {z['area_m2']:.0f} m2 en {_nombre_nivel(z['nivel'])}")

    if not fuera_por_nivel:
        return []

    plantas = floors_mod.plantas_desde_partes(modelo.partes,
                                              fuera_por_nivel=fuera_por_nivel)
    if not plantas or all(p.huella.is_empty for p in plantas):
        raise CatastroError("no queda ninguna planta que medir: todo lo construido "
                            "se ha dejado fuera de la envolvente")
    datos = modelo.catastro.get("_datos")
    if datos is not None:
        floors_mod.asignar_usos(plantas, datos.usos_por_planta())
    modelo.floors = plantas

    if dichos:
        modelo.diagnostics.add(
            "CUERPOS_EXCLUIDOS",
            "el certificador deja FUERA de la envolvente " + "; ".join(dichos)
            + ". Sus paredes no se miden y el edificio se ha vuelto a medir sin ellas, "
            "pero lo que hay al otro lado sigue construido: la pared que da contra el "
            "sale como PARTICION y el forjado de encima, como particion con espacio "
            "no habitable")
    if dichas_zonas:
        modelo.diagnostics.add(
            "ZONAS_FUERA",
            "el certificador ha dibujado lo que NO es vivienda en una planta: "
            + "; ".join(dichas_zonas) + ". Se resta SOLO de esa planta —la de arriba "
            "no se toca—; la pared de la casa contra la zona sale como PARTICION con "
            "espacio no habitable y el forjado de encima, como suelo sobre espacio no "
            "habitable"
            + (" (un PORCHE ABIERTO es exterior: la pared detras de el sale FACHADA y el "
               "forjado de encima, SUELO en contacto con el aire)"
               if any(z["uso"] == floors_mod.PORCHE for z in zonas) else ""))
    return dichos + dichas_zonas


def _nombre_nivel(n: int) -> str:
    if n == 0:
        return "la planta baja"
    if n < 0:
        return f"el sotano {abs(n)}"
    return f"la planta {n}"


# ------------------------------------------------------------- clasificacion
def analizar(o: Opciones, modelo: Modelo) -> Resultado:
    huella = modelo.huella()
    if huella is None:
        raise CatastroError("BUILDING_GEOMETRY_UNAVAILABLE: sin huella de edificio no "
                            "hay geometria que clasificar")

    parcela = modelo.parcel.geometry if modelo.parcel else None
    # Con la vivienda delimitada, las casas de al lado (lo que quedo fuera del
    # contorno, en cualquier nivel) son colindantes para todo lo global.
    vecinos = unir([modelo.vecinos_geom(), *(modelo.recorte_resto or {}).values()])

    # huellas de espacios no habitables de la MISMA parcela (solo si hay DXF)
    no_hab = unir([s.geometry for s in modelo.spaces
                   if s.geometry is not None and s.use in ("GARAJE", "ALMACEN")])

    def no_habitables_de(planta) -> "BaseGeometry | None":
        """Lo no habitable que toca ESTA planta: el DXF mas lo que se ha dejado
        fuera en su nivel. Sin esto, la pared de la casa contra el garaje sale
        como fachada a un espacio libre de la parcela — y ahi no hay aire, hay
        un garaje, asi que es una particion vertical y por ella se pierde calor.
        """
        return unir([no_hab, planta.no_habitable])

    v = Vecindad(parcela=parcela, edificio_propio=huella, edificios_vecinos=vecinos,
                 no_habitables=no_hab, boundary_tolerance_m=o.tolerancia,
                 min_contact_m=o.min_contacto)

    # -- altura ---------------------------------------------------------------
    n_plantas = len([p for p in modelo.floors if p.nivel >= 0]) or None
    alturas: dict = {"plantas_sobre_rasante": n_plantas}
    altura_total = missing(Source.UNAVAILABLE, "no calculada")
    if not o.skip_lidar:
        client = modelo.catastro.get("_client")
        if client is not None:
            altura_total, diag = pnoa.altura_lidar(client, huella, o.crs_metrico)
            alturas["lidar"] = diag
            if not altura_total.available:
                modelo.diagnostics.add("BUILDING_HEIGHT_UNAVAILABLE",
                                       altura_total.note or "sin LiDAR")
    else:
        alturas["lidar"] = {"omitido": "--skip-lidar"}
    if not altura_total.available:
        altura_total = pnoa.altura_por_plantas(
            n_plantas, o.floor_height,
            "--floor-height" if o.floor_height_dada else "valor por defecto")
    alturas["altura_total"] = altura_total.to_dict()

    alto = pnoa.altura_de_planta(
        altura_total if altura_total.source == Source.PNOA_LIDAR
        else missing(Source.UNAVAILABLE),
        n_plantas, o.floor_height, o.floor_height_dada)
    alturas["altura_de_planta"] = alto.to_dict()

    # -- cerramientos verticales, planta a planta -----------------------------
    # REGLA — la vecindad se calcula POR PLANTA. Un muro de la primera planta no
    # es medianera porque el vecino tenga planta baja: lo es si el vecino LLEGA
    # a esa altura. Y el "edificio propio" de esa planta es su huella, no la de
    # la planta baja, o los muros que vuelan sobre la cubierta inferior salen
    # clasificados como interiores.
    tramos_all = []
    capas: list[dict] = []
    elementos: list[ElementoCE3X] = []
    contador: dict[str, int] = {}
    sin_partes_vecinas = not modelo.neighbour_partes and bool(modelo.neighbours)
    if sin_partes_vecinas:
        modelo.diagnostics.add(
            "NEIGHBOUR_FLOORS_UNKNOWN",
            "no hay BuildingParts de los colindantes: en las plantas altas se asume "
            "que el vecino llega, y esas medianeras salen con confianza rebajada")

    por_nivel = {pl.nivel: pl for pl in modelo.floors}
    for planta in modelo.floors:
        vecinos_nivel = _vecinos_en_nivel(modelo, planta.nivel)
        abajo = por_nivel.get(planta.nivel - 1)
        vp = Vecindad(parcela=parcela, edificio_propio=planta.huella,
                      edificios_vecinos=vecinos_nivel,
                      no_habitables=no_habitables_de(planta),
                      # CONSTRUIDA, no la habitable: un muro levantado sobre la
                      # cubierta del garaje de abajo tampoco vuela al aire.
                      huella_inferior=abajo.huella_construida if abajo else None,
                      huella_global=huella,
                      vecinos_globales=vecinos,
                      boundary_tolerance_m=o.tolerancia, min_contact_m=o.min_contacto)
        segs = segmentar(planta.huella, owner_id=planta.etiqueta, floor=planta.nivel,
                         prefijo=f"{planta.etiqueta}-S")
        tramos = fusionar_colineales(clasificar(segs, vp))
        if sin_partes_vecinas and planta.nivel > 0:
            for t in tramos:
                if t.contacto.value == "OTHER_BUILDING":
                    t.confianza = min(t.confianza, 0.6)
                    t.nota += (" | sin plantas del colindante: no se ha comprobado que "
                               "llegue a esta altura")
        elementos.extend(classifier.verticales(tramos, alto, planta, contador))
        tramos_all.extend(tramos)
        capas.append({
            "titulo": (f"Planta {planta.etiqueta}"
                       + (f" - {planta.uso_dominante}" if planta.uso_dominante else "")
                       + f" - {planta.area_m2:.0f} m2"),
            "planta": planta.etiqueta, "nivel": planta.nivel,
            "huella": planta.huella, "vecinos": vecinos_nivel, "parcela": parcela,
            "tramos": tramos})

    # -- horizontales ---------------------------------------------------------
    # En un TERCIARIO el forjado entre dos plantas acondicionadas de distinto
    # uso (las aulas bajo la vivienda del sacerdote) no se escribe: a los dos
    # lados hay la misma temperatura. En el residencial no cambia nada.
    #
    # Y una planta que se MIDE es habitable para sus forjados, aunque Catastro
    # declare en ella sobre todo un garaje: sin esto, la misma planta era
    # vivienda para sus paredes y garaje para sus suelos y techos, y salian dos
    # particiones fantasma sobre toda la huella (ver `marcar_usos_medidos`).
    hab_por_nivel: dict[int, dict[str, float]] = {}
    for s in modelo.spaces:
        if (s.attrs or {}).get("habitable") and s.floor is not None and s.use:
            d = hab_por_nivel.setdefault(int(s.floor), {})
            d[s.use] = d.get(s.use, 0.0) + float(s.area or 0.0)
    medidos = floors_mod.marcar_usos_medidos(modelo.floors, hab_por_nivel)
    if medidos:
        modelo.diagnostics.add(
            "USO_MEDIDO",
            "; ".join(medidos) + ". Catastro no dice que poligono es cada uso: si en la "
            "planta hay un garaje o un porche, delimitalo («Quitar una zona») para que "
            "salgan la particion vertical contra el y el forjado de encima")
    horizontales = floors_mod.elementos_horizontales(
        modelo.floors,
        acondicionados=(alphanumeric.ACONDICIONADOS_TERCIARIO
                        if es_terciario(modelo.catastro.get("tipo_edificio_ce3x"))
                        else None))
    elementos.extend(classifier.horizontales(horizontales, contador))

    _cruzar_superficies(modelo)

    interiores, libres = patios(huella, v)
    modelo.catastro["patios"] = {
        "huecos_interiores": [{"area_m2": round(p.area, 2), "wkt": p.wkt}
                              for p in interiores],
        "espacios_libres_parcela": [
            {"area_m2": round(e.poligono.area, 2), "cerramiento": e.cerramiento,
             "es_patio": e.es_patio} for e in libres],
    }
    return Resultado(modelo, elementos, tramos_all, horizontales, {}, [],
                     alturas, capas)


def _cruzar_superficies(modelo: Modelo, tolerancia: float = 0.15) -> None:
    """Compara la superficie de la HUELLA con la que declara Catastro (§22).

    Es la comprobacion que delata haber modelado el edificio equivocado, o que
    la vivienda ocupa solo una parte del edificio de la parcela. No corrige
    nada: avisa.
    """
    datos = modelo.catastro.get("_datos")
    if datos is None:
        return
    # Solo lo que CUENTA: con un garaje dejado fuera, la huella ya no lo mide y
    # compararla contra el total declarado marcaria un desvio que no existe.
    por_planta: dict = {}
    for sp in modelo.spaces:
        a = sp.attrs or {}
        if not a.get("codigo") or sp.floor is None or not a.get("habitable"):
            continue
        por_planta.setdefault(sp.floor, {})
        por_planta[sp.floor][sp.use] = (por_planta[sp.floor].get(sp.use) or 0) + (sp.area or 0)
    if not por_planta:
        por_planta = datos.usos_por_planta()
    filas = []
    for pl in modelo.floors:
        declarada = round(sum(por_planta.get(pl.nivel, {}).values()), 2)
        fila = {"planta": pl.etiqueta, "huella_m2": pl.area_m2,
                "catastro_m2": declarada or None}
        if declarada:
            desvio = abs(pl.area_m2 - declarada) / declarada
            fila["desvio"] = round(desvio, 3)
            if desvio > tolerancia:
                modelo.diagnostics.add(
                    "FLOOR_AREA_MISMATCH",
                    f"planta {pl.etiqueta}: la huella mide {pl.area_m2:.2f} m2 y Catastro "
                    f"declara {declarada:.2f} m2 ({desvio:.0%} de desvio). El inmueble "
                    f"puede ocupar solo una parte del edificio de la parcela.")
        filas.append(fila)
    modelo.catastro["cruce_superficies"] = filas


# ------------------------------------------------------------------ salidas
def escribir_salidas(o: Opciones, res: Resultado,
                     rc: refcat_mod.ReferenciaCatastral) -> dict[str, str]:
    from .viz import map_html, plan_fotos, plan_png
    modelo = res.modelo
    out = o.output
    proc = o.data / "processed"
    ficheros: dict[str, str] = {}

    def _fc(objs, nombre):
        fs = [Feature("modelo", ob.original_id, nombre, ob.geometry, o.crs_metrico,
                      {**ob.attrs, "area": ob.area, "use": ob.use})
              for ob in objs if ob.geometry is not None]
        if not fs:
            return
        p = proc / f"{nombre}.geojson"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(featurecollection(fs, "EPSG:4326"), indent=1,
                                ensure_ascii=False), encoding="utf-8")
        # y en el CRS metrico, que es el que se usa para medir
        p2 = proc / f"{nombre}.{o.crs_metrico.replace(':', '')}.geojson"
        p2.write_text(json.dumps(featurecollection(fs, o.crs_metrico), indent=1,
                                 ensure_ascii=False), encoding="utf-8")
        ficheros[nombre] = str(p)

    if modelo.parcel:
        _fc([modelo.parcel], "parcela")
    _fc(modelo.buildings, "edificios")
    _fc(modelo.building_parts, "building_parts")
    _fc(modelo.neighbours, "vecinos")

    contexto = {
        "referencia_catastral": rc.to_dict(),
        "crs_metrico": o.crs_metrico,
        "parametros": {"boundary_tolerance_m": o.tolerancia,
                       "min_contact_m": o.min_contacto,
                       "floor_height_m": o.floor_height,
                       "floor_height_dada_por_usuario": o.floor_height_dada,
                       "skip_lidar": o.skip_lidar},
        "alturas": res.alturas,
        "modelo": {k: v for k, v in modelo.to_dict().items()},
        "resumen": export.resumen(res.elementos),
    }
    ficheros["ce3x_geometry.csv"] = str(
        export.escribir_csv(res.elementos, out / "ce3x_geometry.csv"))
    ficheros["ce3x_geometry.json"] = str(
        export.escribir_json(res.elementos, out / "ce3x_geometry.json", contexto))

    titulo = (f"{rc.inmueble or rc.parcela}"
              + (f" - {modelo.catastro.get('inmueble', {}).get('direccion')}"
                 if modelo.catastro.get("inmueble", {}).get("direccion") else ""))
    sub = (f"tolerancia {o.tolerancia} m | alto de planta "
           f"{res.alturas['altura_de_planta'].get('value')} m "
           f"({res.alturas['altura_de_planta'].get('source')})")
    ficheros["geometry_debug.png"] = str(plan_png.dibujar(
        out / "geometry_debug.png", res.capas, titulo=titulo, subtitulo=sub))
    ficheros["debug_map.html"] = str(map_html.dibujar(
        out / "debug_map.html", res.capas, o.crs_metrico,
        parcela=modelo.parcel.geometry if modelo.parcel else None,
        edificio=modelo.huella(), vecinos=modelo.vecinos_geom(),
        partes=modelo.partes, horizontales=res.horizontales, titulo=titulo))

    # El plan de fotos: que se le pide al cliente, muro por muro, con el plano
    # de cada pared marcada. Es lo que convierte "a que muro es esta foto" —el
    # problema que no resuelve un modelo mejor— en un campo de formulario.
    try:
        import json as _json
        elementos = _json.loads(
            Path(ficheros["ce3x_geometry.json"]).read_text(encoding="utf-8"))
        datos = modelo.catastro.get("_datos")
        crudo = getattr(datos, "raw", None) or modelo.catastro
        # solo se piden fotos de los espacios HABITABLES: las paredes de un
        # almacen no aportan huecos a la envolvente (ver docs/03)
        habitables = {s.use for s in modelo.spaces
                      if s.use and (s.attrs or {}).get("habitable")} or None
        plan = plan_fotos.generar(out / "fotos", elementos["elementos"], crudo,
                                  espacios=habitables)
        ficheros["plan_fotos.json"] = str(out / "fotos" / "plan_fotos.json")
        ficheros["_tomas"] = str(len(plan["tomas"]))
    except Exception as exc:                              # noqa: BLE001
        # que no se caiga la salida entera por el plan de fotos
        ficheros["plan_fotos.json"] = f"NO GENERADO: {type(exc).__name__}: {exc}"

    res.ficheros = ficheros
    return ficheros
