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
    floor_height: float = 2.70
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
                       "habitable": u.habitable,
                       "geometria": "NO DISPONIBLE en los servicios publicos de Catastro"}))
        if datos.unidades:
            modelo.diagnostics.add(
                "SPACE_GEOMETRY_UNAVAILABLE",
                "Catastro da uso/planta/superficie de cada unidad constructiva pero NO su "
                "poligono. Aporta el DXF de la parcela con --dxf para repartirlo.")

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
        from .catastro.fxcc import inventario_fxcc
        try:
            inv = inventario_fxcc(o.fxcc)
            modelo.catastro["fxcc"] = inv.__dict__
            modelo.diagnostics.add("FXCC_NOT_INTERPRETED", inv.nota)
        except Exception as exc:                          # pragma: no cover
            modelo.diagnostics.add("FXCC_UNREADABLE", f"{o.fxcc}: {exc}")

    return modelo


def _vecinos_en_nivel(modelo: Modelo, nivel: int):
    """Huella de los colindantes A LA ALTURA de la planta `nivel`."""
    completo = modelo.vecinos_geom()
    if not modelo.neighbour_partes:
        return completo
    if nivel >= 0:
        trozos = [p.geometry for p in modelo.neighbour_partes
                  if (p.plantas_sobre_rasante or 1) >= nivel + 1]
    else:
        trozos = [p.geometry for p in modelo.neighbour_partes
                  if (p.plantas_bajo_rasante or 0) >= abs(nivel)]
    return unir(trozos)


# ------------------------------------------------------------- clasificacion
def analizar(o: Opciones, modelo: Modelo) -> Resultado:
    huella = modelo.huella()
    if huella is None:
        raise CatastroError("BUILDING_GEOMETRY_UNAVAILABLE: sin huella de edificio no "
                            "hay geometria que clasificar")

    parcela = modelo.parcel.geometry if modelo.parcel else None
    vecinos = modelo.vecinos_geom()

    # huellas de espacios no habitables de la MISMA parcela (solo si hay DXF)
    no_hab = unir([s.geometry for s in modelo.spaces
                   if s.geometry is not None and s.use in ("GARAJE", "ALMACEN")])

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
                      edificios_vecinos=vecinos_nivel, no_habitables=no_hab,
                      huella_inferior=abajo.huella if abajo else None,
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
    horizontales = floors_mod.elementos_horizontales(modelo.floors)
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
    from .viz import map_html, plan_png
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
    res.ficheros = ficheros
    return ficheros
