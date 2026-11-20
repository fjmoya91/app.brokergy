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
    # Los usos del TERCIARIO. Leidos de Catastro en los cuatro ejemplos de
    # 2026-09-28: la hospederia es 'HOTELERO' entera, la iglesia 'RELIGIOSO' y
    # 'ENSEÑANZA', la residencia 'SANIDAD', y la casa rural lleva un
    # 'COMERCIO'. Antes caian todos en 'OTROS' —como un porche— y un terciario
    # se medía mal: la iglesia, solo la vivienda de la segunda planta.
    #
    # NO son habitables por si solos (ver `HABITABLES`): en un RESIDENCIAL el
    # bar de la planta baja no es la vivienda. Cuentan cuando el edificio se
    # certifica como terciario (`pipeline.aplicar_tipo_edificio`).
    "HOTEL": "TERCIARIO",
    "HOSTEL": "TERCIARIO",
    "OCIO": "TERCIARIO",
    "RELIGIOS": "TERCIARIO",
    "ENSEÑANZA": "TERCIARIO",
    "ENSENANZA": "TERCIARIO",
    "DOCENTE": "TERCIARIO",
    "SANIDAD": "TERCIARIO",
    "SANITARI": "TERCIARIO",
    "BENEFICENCIA": "TERCIARIO",
    "CULTURAL": "TERCIARIO",
    "DEPORTIV": "TERCIARIO",
    "ESPECTACUL": "TERCIARIO",
    "COMERCIO": "TERCIARIO",
}

#: Que espacios son NO HABITABLES a efectos de CE3X (particiones interiores).
NO_HABITABLES = {"GARAJE", "ALMACEN", "COMUN"}
HABITABLES = {"VIVIENDA", "LOCAL"}
#: Lo que se ACONDICIONA en un edificio TERCIARIO: la vivienda, el local y los
#: usos del terciario. Almacen, garaje, comunes y lo que no se reconoce (un
#: porche, una terraza) se quedan fuera, igual que en el residencial.
ACONDICIONADOS_TERCIARIO = {"VIVIENDA", "LOCAL", "TERCIARIO"}


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
    #: El `pt` TAL CUAL viene de Catastro ("00", "01", "02"). `planta_literal`
    #: ya esta normalizado a como se lee, y el codigo se compone con el bruto.
    planta_bruta: str | None = None
    #: La RC de 20 del INMUEBLE, solo en la consulta de PARCELA (un bloque): es
    #: lo que el `.cex` del EDIFICIO declara, una por vivienda (el XML no admite
    #: la RC de 14: «Inmueble» es \d{4}[A-Z]{2}; 26RES060_OP438).
    referencia: str | None = None

    @property
    def habitable(self) -> bool | None:
        if self.uso in HABITABLES:
            return True
        if self.uso in NO_HABITABLES:
            return False
        return None

    @property
    def codigo(self) -> str:
        """Como se llama esta construccion en la FICHA TECNICA de la app.

        Escalera/planta/puerta, que es lo que Catastro usa para distinguir dos
        filas de `lcons` de la misma parcela. La receta —y los valores por
        defecto— son los MISMOS que los de `catastroService.js`
        (`${es||'01'}/${pt||'00'}/${pu||'001'}`), porque de eso depende que lo
        que se marca en la oportunidad case aqui con su construccion. Los dos
        leen el mismo `loint`, asi que no hay nada que adivinar; pero si uno de
        los dos cambia la receta, la seleccion deja de casar EN SILENCIO.
        """
        return "/".join([self.escalera or "01",
                         self.planta_bruta or "00",
                         self.puerta or "001"])

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d["habitable"] = self.habitable
        d["codigo"] = self.codigo
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
    """Compone la direccion desde el bloque `dt`: «calle, municipio, provincia».

    Una finca RÚSTICA no trae `lous.lourb.dir` sino `lors.lorus` (polígono,
    parcela y paraje): sin leerlo salía «CEHEGIN, MURCIA» y la ficha tomaba el
    municipio por calle y dejaba la provincia vacía (26RES060_OP332).
    """
    if not isinstance(dt, dict):
        return None
    lo = _g(dt, "locs", "lous", "lourb") or _g(dt, "lourb") or {}
    dir_ = _g(lo, "dir") or {}
    partes = [dir_.get("tv"), dir_.get("nv"), dir_.get("pnp")]
    rus = _g(dt, "locs", "lors", "lorus") or {}
    if not any(partes) and rus:
        cpp = rus.get("cpp") or {}
        partes = [f"Polígono {cpp['cpo']}" if cpp.get("cpo") else None,
                  f"Parcela {cpp['cpa']}" if cpp.get("cpa") else None,
                  rus.get("npa")]
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
            planta_bruta=loint.get("pt"),
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

    # Consulta de PARCELA (finca con division horizontal): la LISTA de inmuebles.
    rcdnp = _g(res, "lrcdnp", "rcdnp") or []
    if isinstance(rcdnp, dict):
        rcdnp = [rcdnp]
    for r in rcdnp:
        rc = _g(r, "rc") or {}
        completo = "".join(str(rc.get(k) or "") for k in ("pc1", "pc2", "car", "cc1", "cc2"))
        if completo:
            out.inmuebles_parcela.append(completo)
    out.unidades = _unidades_de_parcela(rcdnp)
    if out.unidades:
        _resumir_parcela(out, rcdnp)
        out.aviso = ("La RC consultada es de PARCELA: se mide el EDIFICIO COMPLETO. Cada "
                     "inmueble de la lista es una construccion (su uso, su planta y su "
                     "superficie, con los elementos comunes repercutidos).")
    else:
        out.aviso = ("La RC consultada es de PARCELA: Catastro devuelve la lista de "
                     "inmuebles, no sus construcciones. Consulta cada RC de 20.")
    return out


def _unidades_de_parcela(rcdnp: list) -> list[UnidadConstructiva]:
    """Un BLOQUE entero: cada inmueble de la lista es una construccion.

    POR QUE EXISTE (2026-11-20, C/ Ntra. S. Buenos Libros 1, Murcia, 14 viviendas):
    el CEE de un EDIFICIO COMPLETO (la comunidad que cambia la caldera central)
    se pide con la RC de 14, y Catastro contesta a esa RC con la lista
    `lrcdnp` —un inmueble por piso, local o plaza de garaje— y ningun `lcons`.
    Sin construcciones no habia nada habitable y el motor contestaba «no hay
    plano que medir».

    REGLA — la lista ya trae lo que hace falta: el USO (`debi.luso`), la PLANTA,
    la escalera y la puerta (`loint`) y la SUPERFICIE (`debi.sfc`) de cada
    inmueble, asi que no se consulta cada RC de 20 (62 peticiones al mismo WAF del
    buscador). El codigo es el MISMO que el de una fila de `lcons`
    (escalera/planta/puerta), y por eso la seleccion de construcciones casa igual.
    La superficie es la del inmueble con sus comunes repercutidos, no la util.
    """
    out: list[UnidadConstructiva] = []
    for r in rcdnp or []:
        if not isinstance(r, dict):
            continue
        dt = _g(r, "dt") or {}
        loint = _g(dt, "locs", "lous", "lourb", "loint") or {}
        planta, planta_lit = normaliza_planta(loint.get("pt"))
        uso_lit = _g(r, "debi", "luso")
        rc = _g(r, "rc") or {}
        completo = "".join(str(rc.get(k) or "") for k in ("pc1", "pc2", "car", "cc1", "cc2"))
        out.append(UnidadConstructiva(
            referencia=completo if len(completo) == 20 else None,
            uso=normaliza_uso(uso_lit),
            uso_literal=uso_lit,
            planta=planta, planta_literal=planta_lit,
            escalera=loint.get("es"), puerta=loint.get("pu"),
            superficie_m2=_num(_g(r, "debi", "sfc")),
            planta_bruta=loint.get("pt"),
        ))
    return out


def _resumir_parcela(out: DatosInmueble, rcdnp: list) -> None:
    """Uso principal, superficie, antiguedad y direccion del EDIFICIO."""
    por_uso = out.superficie_por_uso()
    if por_uso:
        out.uso_principal = max(por_uso, key=por_uso.get)
    out.superficie_m2 = round(sum(u.superficie_m2 or 0 for u in out.unidades), 2) or None
    anios = [str(_g(r, "debi", "ant") or "") for r in rcdnp if isinstance(r, dict)]
    anios = [int(a) for a in anios if a.isdigit()]
    if anios:
        out.antiguedad = max(set(anios), key=anios.count)
    for r in rcdnp:
        dt = _g(r, "dt") if isinstance(r, dict) else None
        if dt:
            out.direccion = _direccion(dt)
            break


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
