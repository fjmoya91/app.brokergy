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

from .client import CatastroBlocked, CatastroClient, CatastroError
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

#: los WFS devuelven XML; los WCF JSON, JSON. Produccion manda
#: Accept: application/json a los WCF, y se respeta.
ACCEPT_XML = "application/xml, text/xml;q=0.9, */*;q=0.8"


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
    #: intentos FALLIDOS que se permite gastar este servicio en total. Es el
    #: freno para no castigar a Catastro cuando algo no encaja.
    presupuesto: int = 4
    _queries: dict[str, StoredQuery] | None = None
    descubrimiento: str = "sin intentar"

    # ------------------------------------------------------------ capacidades
    def capabilities(self) -> bytes:
        return self.client.get(self.url,
                               {"service": "WFS", "request": "GetCapabilities"},
                               name=f"capabilities_{self.nombre}", accept=ACCEPT_XML)

    def stored_queries(self) -> dict[str, StoredQuery]:
        """Lee del servicio los ids y parametros REALES de las stored queries."""
        if self._queries is not None:
            return self._queries
        out: dict[str, StoredQuery] = {}
        try:
            data = self.client.get(
                self.url,
                {"service": "WFS", "version": self.version, "request": "DescribeStoredQueries"},
                name=f"describestoredqueries_{self.nombre}", accept=ACCEPT_XML)
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
                    name=f"liststoredqueries_{self.nombre}", accept=ACCEPT_XML)
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
    def _combinaciones(self, sq: StoredQuery) -> list[tuple[str, str, str]]:
        """(clave_id, id, srs) a probar, de mas a menos probable.

        REGLA — no se prueban las 6 combinaciones a lo bruto. Si el servicio nos
        ha DICHO como se llama su stored query, se usa esa y punto: una peticion.
        Probar 6 variantes por consulta son 24 peticiones inutiles contra un WAF
        que corta al primer exceso, y con el que ademas trabaja produccion.
        """
        descubierto = self.descubrimiento in ("DescribeStoredQueries", "ListStoredQueries")
        if descubierto:
            # el id es el bueno; lo unico dudoso es la forma de escribir el SRS
            return [("STOREDQUERY_ID", sq.id, SRS_VARIANTES[0]),
                    ("STOREDQUERY_ID", sq.id, SRS_VARIANTES[1])]
        # sin descubrimiento: se prueban los ids documentados, UNA forma de SRS,
        # y la clave con la errata que aparece en la documentacion del Catastro
        combos = [("STOREDQUERY_ID", sq.id, SRS_VARIANTES[0]),
                  ("STOREDQUERIE_ID", sq.id, SRS_VARIANTES[0])]
        return combos

    def get_feature(self, proposito: str, refcat: str, *, name: str) -> bytes:
        """Lanza la stored query gastando el minimo de peticiones posible."""
        sq = self.elegir(proposito)
        pref = sq.param_refcat()
        errores: list[str] = []
        for clave_id, qid, srs in self._combinaciones(sq):
            if self.presupuesto <= 0:
                errores.append("agotado el presupuesto de intentos fallidos "
                               "(se para para no castigar al servicio)")
                break
            params = {"service": "WFS", "version": self.version,
                      "request": "GetFeature", clave_id: qid,
                      pref: refcat, "srsname": srs}
            try:
                data = self.client.get(self.url, params, name=name, accept=ACCEPT_XML)
                motivo = self._excepcion(data)
                if motivo is None:
                    return data
                self.presupuesto -= 1
                errores.append(f"{clave_id}/{srs}: {motivo}")
            except CatastroBlocked:
                raise                       # al WAF no se le insiste jamas
            except CatastroError as exc:
                self.presupuesto -= 1
                errores.append(f"{clave_id}/{srs}: {exc}")
        raise CatastroError(
            f"la stored query '{sq.id}' ({proposito}) no funciono en {self.nombre} "
            f"[descubrimiento: {self.descubrimiento}]. Intentos: "
            + " || ".join(errores[:4]))

    @staticmethod
    def _excepcion(data: bytes) -> str | None:
        """Devuelve el texto de la excepcion WFS, o None si la respuesta es buena."""
        cabeza = data[:4000].decode("utf-8", "ignore")
        if "ExceptionReport" not in cabeza and "ServiceException" not in cabeza:
            return None
        try:
            root = etree.fromstring(data, etree.XMLParser(recover=True))
            textos = [(e.text or "").strip() for e in root.iter()
                      if local(e.tag) in ("ExceptionText", "ServiceException")
                      and (e.text or "").strip()]
            if textos:
                return " | ".join(textos)[:200]
        except Exception:                                   # pragma: no cover
            pass
        return "excepcion WFS sin texto"


def servicios(client: CatastroClient) -> tuple[WfsService, WfsService]:
    return (WfsService(WFS_CP, "CP", client), WfsService(WFS_BU, "BU", client))
