"""Mapa de depuracion output/debug_map.html (§15).

Cada segmento es pulsable y dice su ID, su longitud, su orientacion y contra
que da. Sobre la ortofoto del PNOA y la cartografia catastral, para poder
comprobar de un vistazo que el algoritmo ha modelado el edificio CORRECTO.
"""
from __future__ import annotations

from pathlib import Path

import folium
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

from ..gis.adjacency import Tramo
from ..gis.geometry import reproject
from .plan_png import COLORES, ETIQUETA


def _gj(g: BaseGeometry | None, crs: str):
    if g is None or g.is_empty:
        return None
    return mapping(reproject(g, crs, "EPSG:4326"))


def dibujar(destino: Path, capas: list[dict], crs: str, *, parcela=None,
            edificio=None, vecinos=None, partes=None, horizontales=None,
            titulo: str = "") -> Path:
    """`capas` = una entrada por planta, la misma estructura que el plano PNG.

    REGLA — una capa conmutable POR PLANTA. Con todas las plantas dibujadas en
    la misma capa, la medianera de la planta baja queda debajo de la de la
    primera y no hay forma de pulsarla: el mapa deja de servir para comprobar.
    """
    centro_geom = edificio if edificio is not None else parcela
    if centro_geom is None:
        raise ValueError("no hay geometria que dibujar")
    c = reproject(centro_geom, crs, "EPSG:4326").centroid
    m = folium.Map(location=[c.y, c.x], zoom_start=19, max_zoom=22,
                   tiles="OpenStreetMap", control_scale=True)

    folium.raster_layers.WmsTileLayer(
        url="https://www.ign.es/wms-inspire/pnoa-ma",
        layers="OI.OrthoimageCoverage", fmt="image/png", transparent=False,
        name="Ortofoto PNOA (IGN)", overlay=False, control=True, version="1.3.0",
        attr="PNOA cedido por (c) Instituto Geografico Nacional de Espana").add_to(m)
    folium.raster_layers.WmsTileLayer(
        url="https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx",
        layers="Catastro", fmt="image/png", transparent=True,
        name="Cartografia catastral (WMS)", overlay=True, control=True,
        version="1.1.1", attr="Direccion General del Catastro").add_to(m)

    if parcela is not None:
        folium.GeoJson(_gj(parcela, crs), name="Parcela catastral",
                       style_function=lambda _: {"color": "#b8860b", "weight": 2,
                                                 "fillOpacity": 0.05}).add_to(m)
    if vecinos is not None:
        folium.GeoJson(_gj(vecinos, crs), name="Edificios colindantes",
                       style_function=lambda _: {"color": "#909090", "weight": 1,
                                                 "fillColor": "#bbbbbb",
                                                 "fillOpacity": 0.45}).add_to(m)
    if edificio is not None:
        folium.GeoJson(_gj(edificio, crs), name="Huella del edificio",
                       style_function=lambda _: {"color": "#333333", "weight": 2,
                                                 "fillColor": "#ffffff",
                                                 "fillOpacity": 0.25}).add_to(m)
    if partes:
        capa = folium.FeatureGroup(name="BuildingParts", show=False)
        for i, p in enumerate(partes):
            gj = _gj(p.geometry, crs)
            if gj:
                folium.GeoJson(gj, tooltip=(f"BuildingPart {p.original_id or i} - "
                                            f"{p.plantas_sobre_rasante} plantas sobre rasante"),
                               style_function=lambda _: {"color": "#e67e22", "weight": 1,
                                                         "fillOpacity": 0.1}).add_to(capa)
        capa.add_to(m)

    if horizontales:
        capa = folium.FeatureGroup(name="Suelos / cubiertas / particiones", show=False)
        for e in horizontales:
            gj = _gj(e.poligono, crs)
            if not gj:
                continue
            folium.GeoJson(
                gj, tooltip=f"{e.id} - {e.tipo} {e.subtipo} - {e.area_m2:.2f} m2",
                popup=folium.Popup(
                    f"<b>{e.id}</b><br>{e.tipo} / {e.subtipo}<br>"
                    f"Planta {e.planta}<br>{e.espacio_origen} &rarr; {e.espacio_destino}"
                    f"<br>{e.area_m2:.2f} m2<br><i>{e.nota}</i>", max_width=320),
                style_function=lambda _: {"color": "#6c5ce7", "weight": 1,
                                          "fillOpacity": 0.25}).add_to(capa)
        capa.add_to(m)

    for idx, capa in enumerate(capas):
        grupo = folium.FeatureGroup(
            name=f"Cerramientos - {capa.get('titulo', capa.get('planta', idx))}",
            show=(idx == 0))
        for t in capa["tramos"]:
            s = t.segment
            # el mismo ID que el CSV y el plano: el mapa existe para cruzarlo
            # con la tabla, y con el id interno del segmento no se puede.
            eid = s.meta.get("ce3x_id", s.id)
            color = COLORES.get(t.contacto, "#000000")
            linea = reproject(s.line, crs, "EPSG:4326")
            popup = folium.Popup(
                f"<b>{eid}</b> <span style='color:#777'>({s.id})</span><br>"
                f"planta: {capa.get('planta', '?')}<br>"
                f"longitud: {s.length_m:.2f} m<br>"
                f"orientacion: {s.orientation} ({s.azimuth:.1f} grados)<br>"
                f"contacto: {ETIQUETA.get(t.contacto, t.contacto.value)}<br>"
                f"confianza: {t.confianza:.2f}<br><i>{t.nota}</i>", max_width=340)
            folium.PolyLine([(y, x) for x, y in linea.coords], color=color, weight=7,
                            opacity=0.9, popup=popup,
                            tooltip=f"{eid} - {s.length_m:.2f} m - {s.orientation}"
                            ).add_to(grupo)
            mid = linea.interpolate(0.5, normalized=True)
            folium.Marker(
                [mid.y, mid.x],
                icon=folium.DivIcon(html=(
                    f'<div style="font:600 10px/1.1 system-ui;color:#111;background:#fff;'
                    f'border:1px solid {color};border-radius:4px;padding:1px 3px;'
                    f'white-space:nowrap">{eid}<br>{s.length_m:.2f} m</div>'))
            ).add_to(grupo)
        grupo.add_to(m)

    leyenda = "".join(
        f'<div><span style="display:inline-block;width:14px;height:4px;'
        f'background:{c};margin-right:6px;vertical-align:middle"></span>{ETIQUETA[k]}</div>'
        for k, c in COLORES.items())
    m.get_root().html.add_child(folium.Element(
        f'<div style="position:fixed;bottom:22px;left:12px;z-index:9999;background:#fff;'
        f'padding:10px 12px;border:1px solid #999;border-radius:6px;'
        f'font:12px/1.5 system-ui;max-width:320px">'
        f'<b>{titulo}</b><div style="margin-top:6px">{leyenda}</div></div>'))

    folium.LayerControl(collapsed=False).add_to(m)
    destino.parent.mkdir(parents=True, exist_ok=True)
    m.save(str(destino))
    return destino
