"""Servicios INSPIRE WFS de la D.G. del Catastro.

    Cadastral Parcels : https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx
    Buildings         : https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx

REGLA — los identificadores de stored query NO se dan por buenos: se leen del
propio servicio con ListStoredQueries / DescribeStoredQueries y se eligen por
lo que dicen que hacen. La lista `_CANDIDATOS` es solo el respaldo para cuando
el descubrimiento no esta disponible (servicio parcialmente caido), y queda
anotado en la traza cuando se usa.

Dos rarezas conocidas del servicio, por las que se prueban variantes:
  * el parametro de la stored query aparece documentado como STOREDQUERIE_ID
    (con la errata) ademas del estandar STOREDQUERY_ID;
  * el SRS se acepta como 'EPSG::25830' ademas de 'urn:ogc:def:crs:EPSG::25830'.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from lxml import etree

from .client import CatastroClient, CatastroError
from ..gis.geometry import local

log = logging.getLogger(__name__)

WFS_CP = "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx"
WFS_BU = "https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx"

#: Respaldo si ListStoredQueries no responde. Orden = preferencia.
_CANDIDATOS = {
    "parcela": ["GetParcel",
                "urn:x-inspire:specification:gmlas:CadastralParcels:3.0:GetParcel"],
    "vecinos": ["GetNeighbourParcel", "GetParcelsByZoning",
                "urn:x-inspire:specification:gmlas:CadastralParcels:3.0:GetNeighbourParcel"],
    "edificio": ["GetBuildingByParcel", "GetBuilding",
                 "urn:x-inspire:specification:gmlas:Building:3.0:GetBuildingByParcel"],
    "partes": ["GetBuildingPartByParcel", "GetBuildingPart",
               "urn:x-inspire:specification:gmlas:Building:3.0:GetBuildingPartByParcel"],
}

#: Palabras con las que se reconoce cada stored query al leerla del servicio.
_PISTAS = {
    "parcela": (("parcel",), ("neighbour", "zoning", "building")),
    "vecinos": (("neighbour",), ()),
    "edificio": (("building",), ("part", "neighbour")),
    "partes": (("buildingpart", "building_part"), ()),
}

SRS_VARIANTES = ["EPSG::25830", "urn:ogc:def:crs:EPSG::25830", "EPSG:25830"]


@dataclass
class StoredQuery:
    id: str
    titulo: str
    parametros: list[str] = field(default_factory=list)

    def param_refcat(self) -> str:
        for p in self.parametros:
            if p.lower() in ("refcat", "referenciacatastral", "rc"):
                return p
        return "refcat"


@dataclass
class WfsService:
    url: str
    nombre: str                     # 'CP' | 'BU'
    client: CatastroClient
    version: str = "2.0.0"
    _queries: dict[str, StoredQuery] | None = None
    descubrimiento: str = "sin intentar"

    # ------------------------------------------------------------ capacidades
    def capabilities(self) -> bytes:
        return self.client.get(self.url,
                               {"service": "WFS", "request": "GetCapabilities"},
                               name=f"capabilities_{self.nombre}")

    def stored_queries(self) -> dict[str, StoredQuery]:
        """Lee del servicio los ids y parametros REALES de las stored queries."""
        if self._queries is not None:
            return self._queries
        out: dict[str, StoredQuery] = {}
        try:
            data = self.client.get(
                self.url,
                {"service": "WFS", "version": self.version, "request": "DescribeStoredQueries"},
                name=f"describestoredqueries_{self.nombre}")
            out = self._parse_describe(data)
            self.descubrimiento = "DescribeStoredQueries"
        except (CatastroError, ValueError, etree.XMLSyntaxError) as exc:
            log.warning("DescribeStoredQueries de %s fallo (%s); pruebo ListStoredQueries",
                        self.nombre, exc)
        if not out:
            try:
                data = self.client.get(
                    self.url,
                    {"service": "WFS", "version": self.version, "request": "ListStoredQueries"},
                    name=f"liststoredqueries_{self.nombre}")
                out = self._parse_list(data)
                self.descubrimiento = "ListStoredQueries"
            except (CatastroError, ValueError, etree.XMLSyntaxError) as exc:
                log.warning("ListStoredQueries de %s fallo (%s); uso la lista de respaldo",
                            self.nombre, exc)
                self.descubrimiento = "RESPALDO (el servicio no listo sus stored queries)"
        self._queries = out
        return out

    @staticmethod
    def _parse_describe(data: bytes) -> dict[str, StoredQuery]:
        root = etree.fromstring(data, etree.XMLParser(recover=True))
        out: dict[str, StoredQuery] = {}
        for el in root.iter():
            if local(el.tag) != "StoredQueryDescription":
                continue
            qid = el.get("id")
            if not qid:
                continue
            titulo = ""
            params = []
            for h in el.iter():
                ln = local(h.tag)
                if ln == "Title" and not titulo:
                    titulo = (h.text or "").strip()
                elif ln == "Parameter" and h.get("name"):
                    params.append(h.get("name"))
            out[qid] = StoredQuery(qid, titulo, params)
        return out

    @staticmethod
    def _parse_list(data: bytes) -> dict[str, StoredQuery]:
        root = etree.fromstring(data, etree.XMLParser(recover=True))
        out: dict[str, StoredQuery] = {}
        for el in root.iter():
            if local(el.tag) != "StoredQuery" or not el.get("id"):
                continue
            titulo = next((( h.text or "").strip() for h in el.iter()
                           if local(h.tag) == "Title"), "")
            out[el.get("id")] = StoredQuery(el.get("id"), titulo, [])
        return out

    # ------------------------------------------------------------- seleccion
    def elegir(self, proposito: str) -> StoredQuery:
        disponibles = self.stored_queries()
        incluye, excluye = _PISTAS[proposito]
        for qid, sq in disponibles.items():
            texto = f"{qid} {sq.titulo}".lower().replace("-", "").replace("_", "")
            if any(p.replace("_", "") in texto for p in incluye) and \
               not any(x in texto for x in excluye):
                return sq
        for cand in _CANDIDATOS[proposito]:
            if cand in disponibles:
                return disponibles[cand]
        # Respaldo puro: el id documentado, anotado como no verificado.
        return StoredQuery(_CANDIDATOS[proposito][0],
                           "(no verificado contra el servicio)", [])

    # -------------------------------------------------------------- consulta
    def get_feature(self, proposito: str, refcat: str, *, name: str) -> bytes:
        """Lanza la stored query probando las variantes conocidas del servicio."""
        sq = self.elegir(proposito)
        pref = sq.param_refcat()
        errores: list[str] = []
        for clave_id in ("STOREDQUERY_ID", "STOREDQUERIE_ID"):
            for srs in SRS_VARIANTES:
                params = {"service": "WFS", "version": self.version,
                          "request": "GetFeature", clave_id: sq.id,
                          pref: refcat, "srsname": srs}
                try:
                    data = self.client.get(self.url, params, name=name)
                    if self._es_excepcion(data):
                        errores.append(f"{clave_id}/{srs}: excepcion WFS")
                        continue
                    return data
                except CatastroError as exc:
                    errores.append(f"{clave_id}/{srs}: {exc}")
        raise CatastroError(
            f"ninguna variante de la stored query '{sq.id}' ({proposito}) funciono en "
            f"{self.nombre}. Intentos: " + " || ".join(errores[:6]))

    @staticmethod
    def _es_excepcion(data: bytes) -> bool:
        cabeza = data[:2000].decode("utf-8", "ignore")
        return "ExceptionReport" in cabeza or "ServiceException" in cabeza


def servicios(client: CatastroClient) -> tuple[WfsService, WfsService]:
    return (WfsService(WFS_CP, "CP", client), WfsService(WFS_BU, "BU", client))
