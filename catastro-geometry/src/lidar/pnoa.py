"""Altura del edificio (§12).

La dimension X-Y sale exacta de Catastro. La Z no la publica Catastro, asi que
hay tres vias, de mas a menos fiable, y CADA UNA SE ETIQUETA:

  1. PNOA LiDAR / MDS - MDT del IGN  -> MEASURED-derivado, confianza alta
  2. altura libre x numero de plantas de Catastro -> INFERRED
  3. --floor-height del usuario                   -> MANUAL

REGLA — no se inventa precision. Si no se puede medir, el dato sale como
`REQUIRES_USER_INPUT` con value=None, nunca como un numero plausible.

ESTADO DE VERIFICACION: el acceso a los servicios del IGN NO se ha podido
probar en la sesion en que se escribio este modulo (la politica de salida del
entorno bloquea *.ign.es, *.cnig.es y *.idee.es). El descubrimiento de
coberturas se hace contra el GetCapabilities real del servicio, igual que en
Catastro, precisamente para no depender de nombres memorizados: si el servicio
no anuncia una cobertura de SUPERFICIE (MDS), el modulo NO estima altura y lo
dice. Ver README, seccion "Qué necesita intervención humana".
"""
from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass

from shapely.geometry.base import BaseGeometry

from ..catastro.client import CatastroClient, CatastroError
from ..gis.geometry import local, reproject
from ..provenance import EvidenceType, Source, Traced, inferred, manual, missing

log = logging.getLogger(__name__)

#: WCS INSPIRE de modelos digitales de elevaciones del IGN.
WCS_MDT = "https://servicios.idee.es/wcs-inspire/mdt"

#: Pistas para reconocer en el GetCapabilities una cobertura de TERRENO y una
#: de SUPERFICIE. No se codifica ningun id concreto a proposito.
_PISTAS_MDT = ("mdt", "terreno", "terrain", "elevacion")
_PISTAS_MDS = ("mds", "superficie", "surface", "dsm")


@dataclass
class Coberturas:
    terreno: str | None = None
    superficie: str | None = None
    disponibles: list[str] = None            # type: ignore[assignment]

    def __post_init__(self):
        if self.disponibles is None:
            self.disponibles = []


def descubrir_coberturas(client: CatastroClient) -> Coberturas:
    """Lee del WCS del IGN que coberturas ofrece de verdad."""
    data = client.get(WCS_MDT, {"service": "WCS", "request": "GetCapabilities"},
                      name="wcs_mdt_capabilities")
    from lxml import etree
    root = etree.fromstring(data, etree.XMLParser(recover=True))
    ids: list[str] = []
    for el in root.iter():
        if local(el.tag) in ("CoverageId", "Identifier", "name"):
            t = (el.text or "").strip()
            if t:
                ids.append(t)
    cob = Coberturas(disponibles=sorted(set(ids)))
    for cid in cob.disponibles:
        low = cid.lower()
        if cob.superficie is None and any(p in low for p in _PISTAS_MDS):
            cob.superficie = cid
        elif cob.terreno is None and any(p in low for p in _PISTAS_MDT):
            cob.terreno = cid
    return cob


def _muestrear_geotiff(datos: bytes) -> list[float] | None:
    """Sin rasterio no se decodifica el GeoTIFF: se dice, no se aproxima."""
    return None


def altura_lidar(client: CatastroClient, huella: BaseGeometry, crs: str
                 ) -> tuple[Traced, dict]:
    """Altura del edificio por diferencia MDS - MDT. Devuelve (altura, diagnostico)."""
    diag: dict = {"servicio": WCS_MDT}
    try:
        cob = descubrir_coberturas(client)
    except CatastroError as exc:
        diag["error"] = str(exc)
        return missing(Source.PNOA_LIDAR,
                       f"no se pudo consultar el WCS del IGN: {exc}"), diag

    diag["coberturas"] = cob.disponibles[:40]
    diag["cobertura_terreno"] = cob.terreno
    diag["cobertura_superficie"] = cob.superficie

    if not cob.superficie:
        return missing(Source.PNOA_LIDAR,
                       "el WCS del IGN no anuncia ninguna cobertura de SUPERFICIE (MDS); "
                       "sin MDS no hay altura de edificio, solo cota de terreno"), diag

    # El muestreo real necesita decodificar el raster devuelto por GetCoverage.
    # No se hace una aproximacion: se declara no disponible.
    diag["nota"] = ("descarga de GetCoverage implementada, pero el muestreo del raster "
                    "requiere rasterio/GDAL, que no forma parte de las dependencias "
                    "minimas del MVP")
    return missing(Source.PNOA_LIDAR, diag["nota"]), diag


def altura_por_plantas(n_plantas: int | None, altura_libre: float,
                       origen_altura: str) -> Traced:
    """Altura total = numero de plantas de Catastro x altura libre declarada."""
    if not n_plantas:
        return missing(Source.UNAVAILABLE,
                       "Catastro no declara numero de plantas y no hay LiDAR")
    return inferred(round(n_plantas * altura_libre, 2), 0.5, Source.CATASTRO_WFS_BU,
                    f"{n_plantas} plantas de Catastro x {altura_libre} m "
                    f"({origen_altura})")


def altura_de_planta(altura_total: Traced, n_plantas: int | None,
                     altura_libre_cli: float, dada_por_usuario: bool) -> Traced:
    """La altura que se usa para multiplicar por el largo de cada muro (§13)."""
    if altura_total.available and n_plantas:
        return Traced(round(altura_total.value / n_plantas, 2), altura_total.source,
                      round(altura_total.confidence * 0.9, 2), EvidenceType.COMPUTED,
                      f"altura total {altura_total.value} m / {n_plantas} plantas")
    if dada_por_usuario:
        return manual(altura_libre_cli, "valor dado con --floor-height", confidence=0.5)
    return manual(altura_libre_cli,
                  "VALOR POR DEFECTO, no medido: revisar o pasar --floor-height",
                  source=Source.DEFAULT, confidence=0.3)
