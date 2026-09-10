"""Servicios alfanumericos del Catastro (WCF JSON).

Se usan los WCF JSON, NO los ASMX: el WAF del Catastro filtra la familia ASMX
desde IPs de datacenter y devuelve un 400 con HTML. Los WCF sirven los mismos
datos sin ese filtro (medido en produccion; ver CLAUDE.md del backend).

    Consulta_DNPRC   RC          -> datos del inmueble + construcciones (uso/planta/superficie)
    Consulta_CPMRC   RC14        -> coordenadas del inmueble
    Consulta_RCCOOR  coordenadas -> RC

De aqui sale el UNICO vinculo oficial y publico entre USO y PLANTA. Lo que NO
da es el POLIGONO de cada uso: eso solo esta en la cartografia (FXCC/DXF), ver
src/catastro/fxcc.py y §6 del README.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

from .client import CatastroClient, CatastroError

log = logging.getLogger(__name__)

BASE_CALLEJERO = "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCallejero.svc/json"
BASE_COORDS = "https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json"

#: Destinos catastrales -> vocabulario del proyecto. La clave es un prefijo del
#: literal que devuelve Catastro en `lcd` / `luso`.
_USOS = {
    "VIVIENDA": "VIVIENDA",
    "RESIDENCIAL": "VIVIENDA",
    "ALMACEN": "ALMACEN",
    "ALMACÉN": "ALMACEN",
    "APARCAMIENTO": "GARAJE",
    "GARAJE": "GARAJE",
    "COMERCIAL": "LOCAL",
    "LOCAL": "LOCAL",
    "INDUSTRIAL": "LOCAL",
    "OFICINA": "LOCAL",
    "ELEMENTOS COMUNES": "COMUN",
    "SUELO": "SUELO",
}

#: Que espacios son NO HABITABLES a efectos de CE3X (particiones interiores).
NO_HABITABLES = {"GARAJE", "ALMACEN", "COMUN"}
HABITABLES = {"VIVIENDA", "LOCAL"}


def normaliza_uso(literal: str | None) -> str:
    if not literal:
        return "DESCONOCIDO"
    t = literal.strip().upper()
    for clave, val in _USOS.items():
        if t.startswith(clave) or clave in t:
            return val
    return "OTROS"


_PLANTA_TXT = {
    "BJ": 0, "PB": 0, "B": 0, "00": 0, "0": 0, "EN": 0, "T": 0, "PT": 0,
    "SO": -1, "S": -1, "SS": -1, "SM": -1, "ST": -1,
}


def normaliza_planta(txt: str | None) -> tuple[int | None, str | None]:
    """('01') -> (1, '01'). Devuelve (nivel, literal original)."""
    if txt is None:
        return None, None
    t = str(txt).strip().upper()
    if not t:
        return None, None
    if t in _PLANTA_TXT:
        return _PLANTA_TXT[t], t
    m = re.fullmatch(r"([+-]?)(\d{1,2})", t)
    if m:
        n = int(m.group(2))
        return (-n if m.group(1) == "-" else n), t
    m = re.fullmatch(r"S(\d{1,2})", t)          # S1, S2 = sotanos
    if m:
        return -int(m.group(1)), t
    return None, t


@dataclass
class UnidadConstructiva:
    """Una fila de `lcons`: un trozo construido con su uso, su planta y su superficie."""
    uso: str
    uso_literal: str | None
    planta: int | None
    planta_literal: str | None
    escalera: str | None
    puerta: str | None
    superficie_m2: float | None
    tipo_reforma: str | None = None

    @property
    def habitable(self) -> bool | None:
        if self.uso in HABITABLES:
            return True
        if self.uso in NO_HABITABLES:
            return False
        return None

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d["habitable"] = self.habitable
        return d


@dataclass
class DatosInmueble:
    refcat: str
    raw: dict
    uso_principal: str | None = None
    superficie_m2: float | None = None
    antiguedad: int | None = None
    direccion: str | None = None
    unidades: list[UnidadConstructiva] = field(default_factory=list)
    #: RC de los inmuebles de la parcela cuando la consulta es de parcela.
    inmuebles_parcela: list[str] = field(default_factory=list)
    aviso: str | None = None

    def superficie_por_uso(self) -> dict[str, float]:
        out: dict[str, float] = {}
        for u in self.unidades:
            if u.superficie_m2:
                out[u.uso] = round(out.get(u.uso, 0.0) + u.superficie_m2, 2)
        return out

    def usos_por_planta(self) -> dict[int, dict[str, float]]:
        out: dict[int, dict[str, float]] = {}
        for u in self.unidades:
            if u.planta is None:
                continue
            out.setdefault(u.planta, {})
            out[u.planta][u.uso] = round(
                out[u.planta].get(u.uso, 0.0) + (u.superficie_m2 or 0.0), 2)
        return out

    def to_dict(self) -> dict:
        return {
            "refcat": self.refcat,
            "uso_principal": self.uso_principal,
            "superficie_m2": self.superficie_m2,
            "antiguedad": self.antiguedad,
            "direccion": self.direccion,
            "unidades": [u.to_dict() for u in self.unidades],
            "superficie_por_uso": self.superficie_por_uso(),
            "usos_por_planta": {str(k): v for k, v in self.usos_por_planta().items()},
            "inmuebles_parcela": self.inmuebles_parcela,
            "aviso": self.aviso,
        }


def _g(d: Any, *ruta, default=None):
    """Navegacion defensiva: la respuesta cambia de forma segun el tipo de finca."""
    cur = d
    for k in ruta:
        if isinstance(cur, list):
            cur = cur[k] if isinstance(k, int) and len(cur) > k else None
        elif isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return default
        if cur is None:
            return default
    return cur


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _direccion(dt: dict) -> str | None:
    """Compone la direccion desde el bloque `dt` (urbano)."""
    if not isinstance(dt, dict):
        return None
    lo = _g(dt, "locs", "lous", "lourb") or _g(dt, "lourb") or {}
    dir_ = _g(lo, "dir") or {}
    partes = [dir_.get("tv"), dir_.get("nv"), dir_.get("pnp")]
    txt = " ".join(str(p) for p in partes if p)
    muni = _g(dt, "nm") or ""
    prov = _g(dt, "np") or ""
    todo = ", ".join(x for x in [txt.strip(), muni, prov] if x)
    return todo or None


def _unidades(lcons) -> list[UnidadConstructiva]:
    if lcons is None:
        return []
    # En los WCF JSON `lcons` es un ARRAY DIRECTO (en el ASMX era lcons.cons[]).
    filas = lcons if isinstance(lcons, list) else (lcons.get("cons") or [])
    if isinstance(filas, dict):
        filas = [filas]
    out: list[UnidadConstructiva] = []
    for c in filas or []:
        if not isinstance(c, dict):
            continue
        loint = _g(c, "dt", "lourb", "loint") or _g(c, "dt", "loint") or {}
        planta, planta_lit = normaliza_planta(loint.get("pt"))
        uso_lit = c.get("lcd")
        out.append(UnidadConstructiva(
            uso=normaliza_uso(uso_lit),
            uso_literal=uso_lit,
            planta=planta, planta_literal=planta_lit,
            escalera=loint.get("es"), puerta=loint.get("pu"),
            superficie_m2=_num(_g(c, "dfcons", "stl")),
            tipo_reforma=_g(c, "dfcons", "dt"),
        ))
    return out


def consulta_dnprc(client: CatastroClient, refcat: str) -> DatosInmueble:
    """RC (14 o 20) -> datos catastrales del inmueble/parcela."""
    data = client.get(f"{BASE_CALLEJERO}/Consulta_DNPRC",
                      {"Provincia": "", "Municipio": "", "RefCat": refcat},
                      name=f"dnprc_{refcat}")
    try:
        raw = json.loads(data.decode("utf-8-sig", "replace"))
    except json.JSONDecodeError as exc:
        raise CatastroError(f"Consulta_DNPRC no devolvio JSON: {data[:200]!r}") from exc

    res = raw.get("consulta_dnprcResult", raw)
    err = _g(res, "control", "cuerr")
    if err and int(err) > 0:
        desc = _g(res, "lerr", 0, "des") or _g(res, "lerr", "err", 0, "des") or "error"
        raise CatastroError(f"Catastro (Consulta_DNPRC): {desc}")

    out = DatosInmueble(refcat=refcat, raw=raw)

    bico = res.get("bico")
    if bico:
        bi = bico.get("bi") or {}
        out.uso_principal = normaliza_uso(_g(bi, "debi", "luso"))
        out.superficie_m2 = _num(_g(bi, "debi", "sfc"))
        ant = _g(bi, "debi", "ant")
        out.antiguedad = int(ant) if str(ant).isdigit() else None
        out.direccion = _direccion(bi.get("dt") or {})
        out.unidades = _unidades(bico.get("lcons"))
        if not out.unidades:
            out.aviso = ("Catastro no devolvio construcciones (lcons) para esta RC: "
                         "no hay reparto por uso/planta.")
        return out

    # Consulta de PARCELA: solo la lista de inmuebles, sin construcciones.
    rcdnp = _g(res, "lrcdnp", "rcdnp") or []
    if isinstance(rcdnp, dict):
        rcdnp = [rcdnp]
    for r in rcdnp:
        rc = _g(r, "rc") or {}
        completo = "".join(str(rc.get(k) or "") for k in ("pc1", "pc2", "car", "cc1", "cc2"))
        if completo:
            out.inmuebles_parcela.append(completo)
    out.aviso = ("La RC consultada es de PARCELA: Catastro devuelve la lista de "
                 "inmuebles, no sus construcciones. Consulta cada RC de 20.")
    return out


def consulta_cpmrc(client: CatastroClient, refcat14: str,
                   srs: str = "EPSG:25830") -> tuple[float, float, str] | None:
    """RC14 -> coordenadas del inmueble en el SRS pedido."""
    data = client.get(f"{BASE_COORDS}/Consulta_CPMRC",
                      {"Provincia": "", "Municipio": "", "SRS": srs, "RefCat": refcat14},
                      name=f"cpmrc_{refcat14}")
    try:
        raw = json.loads(data.decode("utf-8-sig", "replace"))
    except json.JSONDecodeError:
        return None
    res = raw.get("Consulta_CPMRCResult", raw)
    c = _g(res, "coordenadas", "coord", 0) or _g(res, "coordenadas", "coord") or {}
    x, y = _num(_g(c, "geo", "xcen")), _num(_g(c, "geo", "ycen"))
    if x is None or y is None:
        return None
    return x, y, srs
