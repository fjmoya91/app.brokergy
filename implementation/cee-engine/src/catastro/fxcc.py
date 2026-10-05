"""Cartografia catastral por plantas: DXF y FXCC (§6).

POR QUE EXISTE ESTE MODULO
--------------------------
Los servicios publicos de Catastro dan el USO y la SUPERFICIE por planta
(Consulta_DNPRC -> `lcons`), y dan la GEOMETRIA de la parcela y del edificio
(INSPIRE WFS). Lo que NO dan por ninguna via publica automatizable es el
VINCULO entre las dos cosas: que poligono concreto es el garaje y cual la
vivienda. Ese vinculo solo esta en la cartografia catastral detallada:

  * FXCC por plantas (Formato de intercambio de Cartografia Catastral) - un
        ZIP con un .DXF (la geometria de la planta general y de cada planta
        significativa, en UTM) y un .ASC (las superficies por planta y uso).
        Lo publica la Sede sin identificacion ni captcha en la ficha de la
        parcela del visor: lo descarga `sede.py` (2026-10-05). Formato:
        `formato_fxcc.pdf` de la D.G. del Catastro (norma de entrega, v2024).

  * DXF suelto de la parcela (`--dxf`): lector antiguo por nombre de capa,
        que se conserva para lo que ya lo usaba.

COMO SE LEE EL FXCC (contrastado contra un fichero real, 8480109VH9888S)
-----------------------------------------------------------------------
Capas `PG-xx` (planta general) y `PSn-xx` (planta significativa n, en el orden
del .ASC, de abajo arriba). En cada planta, las lineas `LP` (perimetro) y `LI`
(interiores) delimitan los RECINTOS; cada recinto lleva un CENTROIDE virtual:
dos textos en el mismo punto, el codigo (`AU` en una planta, `AA` en la
general) y la superficie (`AS`). Aqui se poligonizan las lineas y a cada
poligono se le pega el centroide que cae dentro. Medido: los 17 recintos del
fichero de prueba salen con la superficie que rotula Catastro (< 1 %).

El codigo de un local es DESTINO.PUERTA.ESCALERA (`V.04.1`): casa con la fila
de `lcons` de esa planta, escalera y puerta — o sea, con la construccion que
ya maneja el motor, y con lo que una persona haya marcado como que cuenta.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

from shapely.geometry import LineString, Polygon
from shapely.geometry.base import BaseGeometry

log = logging.getLogger(__name__)

#: Capas del DXF de Catastro que llevan el contorno de lo construido.
CAPAS_CONSTRUCCION = ("constru", "subparce", "subparcela", "construccion")
CAPAS_PARCELA = ("parcela", "masa", "limites")
CAPAS_ROTULO = ("rotulos", "textos", "texto", "rotulo")

_ROMANOS = {"I": 1, "V": 5, "X": 10}


def numero_plantas(rotulo: str) -> int | None:
    """'II' -> 2, '-I' -> -1, 'III+TZA' -> 3, 'I+P' -> 1.

    El rotulo de una subparcela de construccion en la cartografia catastral es
    el numero de plantas en romanos. Lo que va detras del '+' (terraza,
    porche, patio) no suma plantas.
    """
    if not rotulo:
        return None
    t = rotulo.strip().upper().replace(" ", "")
    negativo = t.startswith("-")
    t = t.lstrip("-")
    t = re.split(r"[+/(]", t)[0]
    if not t or any(c not in _ROMANOS for c in t):
        return None
    total, prev = 0, 0
    for c in reversed(t):
        v = _ROMANOS[c]
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    if total == 0:
        return None
    return -total if negativo else total


@dataclass
class EntidadDXF:
    tipo: str                       # LWPOLYLINE | POLYLINE | TEXT | MTEXT
    capa: str
    geometry: BaseGeometry | None = None
    texto: str | None = None
    punto: tuple[float, float] | None = None


def _pares(path: Path):
    """Un DXF es una secuencia de (codigo de grupo, valor), una por linea."""
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        while True:
            code = fh.readline()
            if not code:
                return
            val = fh.readline()
            if not val:
                return
            code = code.strip()
            if not code.lstrip("-").isdigit():
                continue
            yield int(code), val.rstrip("\n").rstrip("\r")


def leer_dxf(path: Path) -> list[EntidadDXF]:
    """Lector minimo de DXF: polilineas y rotulos, por capa. Sin dependencias."""
    path = Path(path)
    entidades: list[EntidadDXF] = []
    actual: dict | None = None
    xs: list[float] = []
    ys: list[float] = []

    def cerrar():
        nonlocal actual, xs, ys
        if actual is None:
            return
        tipo = actual["tipo"]
        capa = actual.get("capa", "")
        if tipo in ("LWPOLYLINE", "POLYLINE") and len(xs) >= 2:
            pts = list(zip(xs, ys))
            geom: BaseGeometry
            cerrada = bool(actual.get("flags", 0) & 1) or (
                len(pts) > 2 and abs(pts[0][0] - pts[-1][0]) < 1e-6
                and abs(pts[0][1] - pts[-1][1]) < 1e-6)
            if cerrada and len(pts) >= 3:
                try:
                    geom = Polygon(pts)
                    if not geom.is_valid:
                        geom = geom.buffer(0)
                except Exception:
                    geom = LineString(pts)
            else:
                geom = LineString(pts)
            if not geom.is_empty:
                entidades.append(EntidadDXF(tipo, capa, geometry=geom))
        elif tipo in ("TEXT", "MTEXT") and actual.get("texto"):
            entidades.append(EntidadDXF(tipo, capa, texto=actual["texto"],
                                        punto=(xs[0], ys[0]) if xs and ys else None))
        actual, xs, ys = None, [], []

    en_entidades = False
    for code, val in _pares(path):
        if code == 2 and val.strip().upper() == "ENTITIES":
            en_entidades = True
            continue
        if code == 0:
            v = val.strip().upper()
            if v == "ENDSEC":
                cerrar()
                en_entidades = False
                continue
            cerrar()
            if en_entidades and v in ("LWPOLYLINE", "POLYLINE", "TEXT", "MTEXT",
                                      "VERTEX"):
                if v == "VERTEX" and entidades is not None:
                    actual = {"tipo": "VERTEX"}
                else:
                    actual = {"tipo": v}
            continue
        if actual is None:
            continue
        if code == 8:
            actual["capa"] = val.strip()
        elif code == 10:
            try:
                xs.append(float(val))
            except ValueError:
                pass
        elif code == 20:
            try:
                ys.append(float(val))
            except ValueError:
                pass
        elif code == 70:
            try:
                actual["flags"] = int(float(val))
            except ValueError:
                pass
        elif code in (1, 3):
            actual["texto"] = (actual.get("texto") or "") + val
    cerrar()
    return entidades


@dataclass
class SubparcelaConstruccion:
    """Un recinto construido con su rotulo de plantas y, si se puede, su uso."""
    poligono: Polygon
    rotulo: str | None
    plantas: int | None
    capa: str
    area_m2: float
    uso: str | None = None
    confianza_uso: float = 0.0

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if k != "poligono"}
        d["wkt"] = self.poligono.wkt
        return d


def subparcelas(entidades: list[EntidadDXF]) -> list[SubparcelaConstruccion]:
    """Poligonos de construccion con el rotulo de plantas que cae DENTRO."""
    polis = [e for e in entidades
             if e.geometry is not None and e.geometry.geom_type == "Polygon"
             and any(c in e.capa.lower() for c in CAPAS_CONSTRUCCION)]
    rotulos = [e for e in entidades if e.texto and e.punto]

    salida: list[SubparcelaConstruccion] = []
    for e in polis:
        from shapely.geometry import Point
        dentro = [r for r in rotulos if e.geometry.contains(Point(r.punto))]
        # el rotulo bueno es el que se interpreta como numero de plantas
        rot = next((r.texto for r in dentro if numero_plantas(r.texto) is not None),
                   dentro[0].texto if dentro else None)
        salida.append(SubparcelaConstruccion(
            poligono=e.geometry, rotulo=rot, plantas=numero_plantas(rot or ""),
            capa=e.capa, area_m2=round(e.geometry.area, 2)))
    return salida


def asignar_usos_por_superficie(subs: list[SubparcelaConstruccion],
                                superficie_por_uso: dict[str, float],
                                tolerancia: float = 0.15) -> None:
    """Empareja cada subparcela con un uso catastral por su SUPERFICIE.

    REGLA — solo se asigna cuando el emparejamiento es INEQUIVOCO: un unico uso
    cuya superficie cuadre dentro de la tolerancia. Si cuadran dos, no se
    asigna ninguno. Adivinar cual es el garaje es exactamente el error que
    convierte un certificado en un requerimiento.
    """
    for s in subs:
        base = s.area_m2 * (abs(s.plantas) if s.plantas else 1)
        candidatos = [(u, m2) for u, m2 in superficie_por_uso.items()
                      if m2 > 0 and abs(base - m2) / m2 <= tolerancia]
        if len(candidatos) == 1:
            s.uso, s.confianza_uso = candidatos[0][0], 0.6
        elif candidatos:
            s.uso, s.confianza_uso = None, 0.0


@dataclass
class InventarioFXCC:
    """Lo que hay dentro de un FXCC, SIN interpretar (ver cabecera del modulo)."""
    path: str
    lineas: int
    tipos_registro: dict[str, int] = field(default_factory=dict)
    interpretado: bool = False
    nota: str = ("El FXCC se inventaria pero NO se traduce a geometria: el layout de "
                 "registros no se ha podido contrastar contra un fichero real. "
                 "Usa --dxf, que si esta implementado.")


def inventario_fxcc(path: Path) -> InventarioFXCC:
    path = Path(path)
    tipos: dict[str, int] = {}
    n = 0
    with path.open("r", encoding="latin-1", errors="replace") as fh:
        for linea in fh:
            n += 1
            clave = linea[:2].strip() or "??"
            tipos[clave] = tipos.get(clave, 0) + 1
    return InventarioFXCC(str(path), n, dict(sorted(tipos.items())))


def cargar(path: Path):
    p = Path(path)
    if p.suffix.lower() == ".dxf":
        return "dxf", subparcelas(leer_dxf(p))
    return "fxcc", inventario_fxcc(p)


# ===========================================================================
# FXCC POR PLANTAS — el croquis catastral de la Sede (ver cabecera del modulo)
# ===========================================================================
import io
import math
import zipfile

#: Destinos (Anexo IV de la norma FXCC) que son EXTERIOR: patios, jardines,
#: porches, soportales y terrazas. No cuentan nunca como vivienda y, si caen
#: dentro de la huella del edificio, se quitan como un porche abierto.
DESTINOS_EXTERIOR = {
    "PTO": "PATIO", "YJD": "JARDIN", "YPO": "PORCHE 100%", "POR": "PORCHE",
    "SOP": "SOPORTAL", "YSP": "SOPORTAL 50%", "TZA": "TERRAZA",
    "YTZ": "TERRAZA CUBIERTA", "YTD": "TERRAZA DESCUBIERTA",
}

#: Destino -> literal catastral (el mismo vocabulario de `lcons`), para que la
#: clasificacion salga de `alphanumeric.normaliza_uso` y no de una tabla aparte.
#: Orden: el primer prefijo que case (los largos antes que su inicial).
_LITERAL_DESTINO = (
    ("COMUN", "ELEMENTOS COMUNES"),
    ("AAP", "APARCAMIENTO"), ("APT", "APARCAMIENTO"),
    ("YSL", "ALMACEN"), ("YDL", "ALMACEN"), ("YDG", "ALMACEN"),
    ("ZSL", "ALMACEN"), ("ZDL", "ALMACEN"), ("ZDG", "ALMACEN"),
    ("A", "ALMACEN"), ("B", "ALMACEN"),
    ("V", "VIVIENDA"),
    ("C", "COMERCIO"), ("O", "OFICINA"), ("I", "INDUSTRIAL"), ("J", "INDUSTRIAL"),
    ("G", "HOTELERO"), ("E", "ENSEÑANZA"), ("K", "DEPORTIVO"), ("R", "RELIGIOSO"),
    ("T", "ESPECTACULOS"), ("Y", "SANIDAD"), ("P", "PUBLICO"), ("M", "SUELO"),
    ("Z", "OTROS"),
)


def partir_codigo(codigo: str) -> tuple[str, str | None, str | None]:
    """'V.04.1' -> ('V', '04', '1'); 'AAP.123.12.AAAA.1234' -> ('AAP', '123', '12')."""
    trozos = [t.strip() for t in str(codigo or "").upper().split(".")]
    destino = trozos[0] if trozos else ""
    puerta = trozos[1] if len(trozos) > 1 and trozos[1] else None
    escalera = trozos[2] if len(trozos) > 2 and trozos[2] else None
    if destino == "PTO":             # 'PTO.YTD' / 'PTO.A': el resto no es puerta
        puerta = escalera = None
    return destino, puerta, escalera


def clasificar_destino(destino: str) -> tuple[str, str]:
    """(uso del motor, literal) de un codigo de destino de local.

    El uso es el vocabulario de `alphanumeric` (VIVIENDA, ALMACEN, GARAJE,
    LOCAL, TERCIARIO, COMUN, OTROS) o EXTERIOR.
    """
    from .alphanumeric import normaliza_uso
    d = str(destino or "").upper()
    if d in DESTINOS_EXTERIOR:
        return "EXTERIOR", DESTINOS_EXTERIOR[d]
    for pref, literal in _LITERAL_DESTINO:
        if d.startswith(pref):
            return normaliza_uso(literal), literal
    return "OTROS", d or "SIN CODIGO"


def _norm(v) -> str:
    t = str(v or "").strip().upper()
    return (t.lstrip("0") or "0") if t else ""


def construccion_de(recinto, nivel: int, construcciones: list[dict]) -> dict | None:
    """La fila de `lcons` que ES este recinto: misma planta, puerta y escalera.

    `construcciones`: [{codigo, nivel, puerta, escalera, habitable, ...}]. El
    codigo del recinto es DESTINO.PUERTA.ESCALERA ('V.04.1'), y la planta la da
    la hoja del croquis (medido sobre 8480109VH9888S: los 8 locales casan).
    """
    if recinto.puerta is None:
        return None
    for c in construcciones:
        if c.get("nivel") != nivel or not c.get("codigo"):
            continue
        if _norm(c.get("puerta")) != _norm(recinto.puerta):
            continue
        if recinto.escalera and c.get("escalera") and \
                _norm(c.get("escalera")) != _norm(recinto.escalera):
            continue
        return c
    return None


def cuenta(recinto, construccion: dict | None, terciario: bool) -> bool:
    """¿Cuenta como espacio habitable (o acondicionado, en un terciario)?

    REGLA — manda la CONSTRUCCION con la que casa: ahi esta lo que decidio una
    persona en la ficha tecnica y el tipo de edificio. Sin construccion, el
    codigo de destino, con las mismas listas que `alphanumeric`. Lo exterior
    (patio, porche, terraza) no cuenta nunca.
    """
    from .alphanumeric import ACONDICIONADOS_TERCIARIO, HABITABLES
    if recinto.uso == "EXTERIOR":
        return False
    if construccion is not None:
        return bool(construccion.get("habitable"))
    return recinto.uso in (ACONDICIONADOS_TERCIARIO if terciario else HABITABLES)


def niveles_de_planta(nombre: str | None) -> list[int]:
    """Los niveles reales que representa una planta significativa, por su nombre.

    La norma obliga a que el nombre ACABE en los codigos de las plantas reales:
    'BAJA 00', 'PISO 01', 'Plantas 01,02,03', 'Plantas 01 A 03', 'SOTANO -1'.
    Se traducen con `normaliza_planta`, la MISMA funcion que da la planta de
    cada fila de `lcons`: si no, un codigo y su construccion no casarian.
    """
    from .alphanumeric import normaliza_planta
    t = re.sub(r"\s+", " ", str(nombre or "").upper()).strip()
    if not t:
        return []
    m = re.search(r"(-?[0-9A-Z]{1,3}) A (-?[0-9A-Z]{1,3})$", t)
    if m:
        a, b = normaliza_planta(m.group(1))[0], normaliza_planta(m.group(2))[0]
        if a is not None and b is not None and a <= b:
            return list(range(a, b + 1))
    ultimo = t.split(" ")[-1]
    codigos = [c for c in ultimo.split(",") if c]
    nv = [normaliza_planta(c)[0] for c in codigos]
    if codigos and all(n is not None for n in nv):
        return nv
    if "SOTANO" in t and "SEMI" not in t:
        return [-1]
    if re.search(r"\bBAJA\b", t):
        return [0]
    return []


@dataclass
class Recinto:
    """Un recinto de una planta del croquis: un local con su destino, o una
    subparcela de la planta general."""
    planta: str                       # 'PG' | 'PS1' | ...
    codigo: str                       # 'V.04.1' | 'II' | 'P'
    superficie: float | None          # la ROTULADA por Catastro
    poligono: Polygon | None = None
    area: float | None = None         # la del poligono reconstruido
    destino: str | None = None
    puerta: str | None = None
    escalera: str | None = None
    uso: str | None = None            # vocabulario del motor (o EXTERIOR)
    literal: str | None = None        # COMERCIO, PORCHE 100%, ...

    def to_dict(self, decimales: int = 2) -> dict:
        d = {k: getattr(self, k) for k in ("planta", "codigo", "superficie", "area",
                                           "destino", "puerta", "escalera", "uso", "literal")}
        if self.poligono is not None and not self.poligono.is_empty:
            d["poligono"] = [[round(x, decimales), round(y, decimales)]
                             for x, y in self.poligono.exterior.coords[:-1]]
        return d


@dataclass
class PlantaFXCC:
    capa: str                         # 'PS1'
    indice: int                       # 1, 2, ...
    nombre: str | None                # 'BAJA 00'
    niveles: list[int]
    plantas_reales: int | None
    recintos: list[Recinto] = field(default_factory=list)
    declarados: list[dict] = field(default_factory=list)   # los usos del .ASC
    nivel_deducido: bool = False

    def to_dict(self) -> dict:
        return {"capa": self.capa, "nombre": self.nombre, "niveles": self.niveles,
                "plantas_reales": self.plantas_reales,
                "nivel_deducido": self.nivel_deducido,
                "declarados": self.declarados,
                "recintos": [r.to_dict() for r in self.recintos]}


@dataclass
class FXCC:
    refcat: str | None
    asc: dict
    general: list[Recinto] = field(default_factory=list)
    plantas: list[PlantaFXCC] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    #: El CRS en el que venia el DXF, si hubo que reproyectarlo (ver pipeline).
    srs_origen: str | None = None

    def planta_de_nivel(self, nivel: int) -> PlantaFXCC | None:
        for p in self.plantas:
            if nivel in p.niveles:
                return p
        return None

    def recintos(self):
        yield from self.general
        for p in self.plantas:
            yield from p.recintos

    def transformar(self, fn) -> None:
        """Aplica `fn(geom) -> geom` a todos los poligonos (reproyeccion)."""
        for r in self.recintos():
            if r.poligono is not None:
                r.poligono = fn(r.poligono)

    def huella_general(self):
        from shapely.ops import unary_union
        polis = [r.poligono for r in self.general if r.poligono is not None]
        return unary_union(polis) if polis else None

    def to_dict(self) -> dict:
        return {"refcat": self.refcat, "fecha": self.asc.get("fecha"),
                "escala": self.asc.get("escala"),
                "superficie_parcela": self.asc.get("sup_parcela"),
                "superficie_construida": self.asc.get("sup_construida"),
                "srs_origen": self.srs_origen, "avisos": list(self.avisos),
                "general": [r.to_dict() for r in self.general],
                "plantas": [p.to_dict() for p in self.plantas]}


# --------------------------------------------------------------- el .ASC
def _entero(s) -> int | None:
    try:
        return int(str(s).strip())
    except (TypeError, ValueError):
        return None


def _superficie(s) -> float | None:
    """Las superficies de la planta general van con 7 cifras, o con 9 y dos
    decimales implicitos (`000033000` = 330,00): la norma admite las dos."""
    t = str(s or "").strip()
    if not t.isdigit():
        return None
    return int(t) / 100 if len(t) == 9 else float(int(t))


def leer_asc(texto: str) -> dict:
    """El fichero alfanumerico del FXCC, campo a campo segun la norma (§2.4.1.1).

    Es un fichero de lineas: un campo por linea, en un orden fijo.
    """
    lineas = texto.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    pos = 0

    def sig() -> str:
        nonlocal pos
        v = lineas[pos] if pos < len(lineas) else ""
        pos += 1
        return v.strip()

    d: dict = {"delegacion": sig(), "gerencia": sig(), "municipio": sig(),
               "nombre_municipio": sig(), "codigo_via": sig(), "siglas": sig(),
               "nombre_via": sig(), "numero": sig(), "duplicado": sig(),
               "refpar": sig(), "refpla": sig()}
    d["refcat"] = (d["refpar"] + d["refpla"]).upper() or None
    linderos = {}
    for lado in ("DR", "IZ", "FD"):
        marca = sig()
        if marca != lado:            # fichero que no sigue la norma: se dice y se para
            d["error"] = f"se esperaba el lindero {lado} y viene {marca!r}"
            return d
        linderos[lado] = {"codigo_via": sig(), "texto": sig()}
    d["linderos"] = linderos
    d["escala"] = _entero(sig())
    d["fecha"] = sig()
    d["sup_parcela"] = _superficie(sig())
    d["sup_sobre"] = _superficie(sig())
    d["sup_bajo"] = _superficie(sig())
    d["sup_construida"] = _superficie(sig())
    plantas = []
    for _ in range(_entero(sig()) or 0):
        reales = _entero(sig())
        nombre = sig()
        usos = []
        for _u in range(_entero(sig()) or 0):
            usos.append({"codigo": sig(), "superficie": _superficie(sig())})
        plantas.append({"plantas_reales": reales, "nombre": nombre, "usos": usos})
    d["plantas"] = plantas
    if sig() == "EXPEDIENTE":
        d["expediente"] = {"ejercicio": sig(), "numero": sig(), "entidad": sig()}
    return d


# --------------------------------------------------------------- el .DXF
def leer_dxf_fxcc(texto: str) -> list[dict]:
    """Las entidades del DXF de un FXCC: polilineas (con sus VERTEX), lineas y
    textos, por capa. Lector de codigos de grupo, sin dependencias.

    A diferencia de `leer_dxf` (el antiguo), entiende las POLYLINE de estilo
    R12 —`POLYLINE` + `VERTEX`… + `SEQEND`—, que es como las escribe Catastro.
    """
    lineas = texto.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    ents: list[dict] = []
    actual: dict | None = None
    poli: dict | None = None
    for i in range(0, len(lineas) - 1, 2):
        try:
            code = int(lineas[i].strip())
        except ValueError:
            continue
        val = lineas[i + 1].strip()
        if code == 0:
            if actual is not None and actual["tipo"] == "VERTEX":
                if poli is not None and "x" in actual and "y" in actual:
                    poli["pts"].append((actual["x"], actual["y"]))
            elif actual is not None:
                ents.append(actual)
            actual = None
            if val == "POLYLINE":
                poli = {"tipo": "POLYLINE", "capa": "", "pts": [], "flags": 0}
                actual = poli
            elif val == "VERTEX":
                actual = {"tipo": "VERTEX"}
            elif val == "SEQEND":
                poli = None
            elif val in ("LWPOLYLINE", "LINE", "TEXT", "MTEXT"):
                actual = {"tipo": val, "capa": "", "pts": [], "flags": 0}
            continue
        if actual is None:
            continue
        if code == 8 and actual["tipo"] != "VERTEX":
            actual["capa"] = val
        elif code in (10, 20, 11, 21):
            try:
                f = float(val)
            except ValueError:
                continue
            if actual["tipo"] == "LWPOLYLINE":
                if code == 10:
                    actual["pts"].append([f, None])
                elif code == 20 and actual["pts"]:
                    actual["pts"][-1][1] = f
            else:
                actual[{10: "x", 20: "y", 11: "x2", 21: "y2"}[code]] = f
        elif code == 70 and actual["tipo"] != "VERTEX":
            try:
                actual["flags"] = int(float(val))
            except ValueError:
                pass
        elif code in (72, 73):
            try:
                actual[f"j{code}"] = int(float(val))
            except ValueError:
                pass
        elif code in (1, 3):
            actual["texto"] = (actual.get("texto") or "") + val
    if actual is not None and actual["tipo"] != "VERTEX":
        ents.append(actual)
    return ents


def _linea(e: dict) -> LineString | None:
    if e["tipo"] == "LINE":
        if all(k in e for k in ("x", "y", "x2", "y2")):
            return LineString([(e["x"], e["y"]), (e["x2"], e["y2"])])
        return None
    pts = [tuple(p) for p in e.get("pts") or [] if p[0] is not None and p[1] is not None]
    if len(pts) < 2:
        return None
    if e.get("flags", 0) & 1 and pts[0] != pts[-1]:
        pts.append(pts[0])
    return LineString(pts)


def _ancla(e: dict) -> tuple[float, float] | None:
    """El punto de un texto. Con justificacion (72/73) manda el punto de
    alineacion (11/21): los dos textos de un centroide lo comparten."""
    if (e.get("j72") or e.get("j73")) and "x2" in e and "y2" in e:
        return e["x2"], e["y2"]
    if "x" in e and "y" in e:
        return e["x"], e["y"]
    return None


#: Distancia maxima entre los dos textos de un mismo centroide.
_MISMO_CENTROIDE_M = 0.25


def interpretar(asc: dict, ents: list[dict]) -> FXCC:
    from shapely.geometry import Point
    from shapely.ops import polygonize, unary_union

    fx = FXCC(refcat=asc.get("refcat"), asc=asc)
    if asc.get("error"):
        fx.avisos.append(f"el .ASC no sigue la norma: {asc['error']}")

    por_capa: dict[str, list[dict]] = {}
    for e in ents:
        por_capa.setdefault(e.get("capa", "").upper(), []).append(e)
    prefijos = set()
    for capa in por_capa:
        m = re.match(r"^(PG|PS\d{1,2})-[A-Z]{2}$", capa)
        if m:
            prefijos.add(m.group(1))
    prefijos = sorted(prefijos, key=lambda p: (p != "PG", int(p[2:]) if p != "PG" else 0))

    def recintos_de(pref: str, capa_codigo: str) -> list[Recinto]:
        lineas = []
        for suf in ("LP", "LI", "LS"):
            for e in por_capa.get(f"{pref}-{suf}", []):
                g = _linea(e)
                if g is not None:
                    lineas.append(g)
        polis = list(polygonize(unary_union(lineas))) if lineas else []
        codigos = []
        for e in por_capa.get(f"{pref}-{capa_codigo}", []):
            a, txt = _ancla(e), (e.get("texto") or "").strip()
            if a and txt:
                codigos.append((a, txt))
        sups = [(_ancla(e), (e.get("texto") or "").strip())
                for e in por_capa.get(f"{pref}-AS", []) if _ancla(e)]
        salida = []
        usados = set()
        for (ax, ay), cod in codigos:
            sup = None
            if sups:
                (bx, by), txt = min(sups, key=lambda s: math.hypot(s[0][0] - ax, s[0][1] - ay))
                if math.hypot(bx - ax, by - ay) <= _MISMO_CENTROIDE_M:
                    try:
                        sup = float(txt.replace(",", "."))
                    except ValueError:
                        sup = None
            punto = Point(ax, ay)
            dentro = [i for i, p in enumerate(polis) if p.contains(punto)]
            if not dentro:
                cerca = sorted((p.distance(punto), i) for i, p in enumerate(polis))
                dentro = [cerca[0][1]] if cerca and cerca[0][0] <= 0.5 else []
            poli = polis[dentro[0]] if dentro else None
            if dentro:
                usados.add(dentro[0])
            salida.append(Recinto(planta=pref, codigo=cod, superficie=sup, poligono=poli,
                                  area=round(poli.area, 2) if poli is not None else None))
        huerfanos = [p for i, p in enumerate(polis) if i not in usados and p.area > 1.0]
        if huerfanos:
            fx.avisos.append(f"{pref}: {len(huerfanos)} recinto(s) dibujados sin rotulo ("
                             + ", ".join(f"{p.area:.1f} m2" for p in huerfanos[:4]) + ")")
        sin_poli = [r.codigo for r in salida if r.poligono is None]
        if sin_poli:
            fx.avisos.append(f"{pref}: rotulos sin recinto que los contenga: {', '.join(sin_poli)}")
        return salida

    plantas_asc = asc.get("plantas") or []
    for pref in prefijos:
        if pref == "PG":
            fx.general = recintos_de("PG", "AA")
            continue
        n = int(pref[2:])
        datos = plantas_asc[n - 1] if 0 < n <= len(plantas_asc) else {}
        nombre = datos.get("nombre")
        planta = PlantaFXCC(capa=pref, indice=n, nombre=nombre,
                            niveles=niveles_de_planta(nombre),
                            plantas_reales=datos.get("plantas_reales"),
                            declarados=list(datos.get("usos") or []))
        if not datos:
            fx.avisos.append(f"{pref}: el .ASC no describe esta planta")
        for r in recintos_de(pref, "AU"):
            r.destino, r.puerta, r.escalera = partir_codigo(r.codigo)
            r.uso, r.literal = clasificar_destino(r.destino)
            # Superficie que difiere de su poligono: se dice (las terrazas al
            # 50 % rotulan la mitad, y es correcto).
            if (r.area and r.superficie and r.destino not in ("TZA", "SOP", "YSP")
                    and abs(r.area - r.superficie) > max(1.0, 0.10 * r.superficie)):
                fx.avisos.append(f"{pref} {r.codigo}: rotula {r.superficie:g} m2 y su recinto "
                                 f"mide {r.area:.1f} m2")
            planta.recintos.append(r)
        fx.plantas.append(planta)

    # Plantas cuyo nombre no dice su nivel (un 'ATICO AT'): por su orden, que
    # la norma fija de abajo arriba. Se marca: es una deduccion.
    ultimo = None
    for p in fx.plantas:
        if not p.niveles:
            p.niveles = [ultimo + 1 if ultimo is not None else 0]
            p.nivel_deducido = True
            fx.avisos.append(f"{p.capa} ({p.nombre!r}): su nombre no dice la planta; "
                             f"se toma como nivel {p.niveles[0]} por su orden")
        ultimo = max(p.niveles)
    return fx


def leer_fxcc(origen, parcela: str | None = None) -> FXCC:
    """El FXCC por plantas, venga como venga: bytes de un ZIP, la ruta del ZIP,
    la carpeta (o el .dxf) con su .asc al lado.

    En un ZIP con varias parcelas (el de colindantes) se coge la pedida; sin
    pedir ninguna, la primera."""
    if isinstance(origen, (bytes, bytearray)) or str(origen).lower().endswith(".zip"):
        datos = bytes(origen) if isinstance(origen, (bytes, bytearray)) else Path(origen).read_bytes()
        with zipfile.ZipFile(io.BytesIO(datos)) as z:
            pares: dict[str, dict] = {}
            for n in z.namelist():
                if n.endswith("/") or "." not in n:
                    continue
                base, ext = n.rsplit(".", 1)
                if ext.lower() in ("asc", "dxf"):
                    pares.setdefault(base.upper(), {})[ext.lower()] = n
            elegido = None
            for base in sorted(pares):
                fs = pares[base]
                nombre = base.replace("\\", "/").split("/")[-1]
                if "asc" in fs and "dxf" in fs and (
                        parcela is None or nombre.startswith(parcela.upper()[:14])):
                    elegido = fs
                    break
            if elegido is None:
                raise ValueError("el ZIP no trae un .asc y un .dxf de la parcela")
            asc_txt = z.read(elegido["asc"]).decode("cp1252", "replace")
            dxf_txt = z.read(elegido["dxf"]).decode("cp1252", "replace")
    else:
        p = Path(origen)
        if p.is_dir():
            ascs = sorted(x for x in p.rglob("*") if x.suffix.lower() == ".asc")
            if not ascs:
                raise ValueError(f"no hay .asc en {p}")
            p = ascs[0]
        hermano = {x.suffix.lower(): x for x in p.parent.glob(p.stem + ".*")}
        if ".asc" not in hermano or ".dxf" not in hermano:
            raise ValueError(f"faltan el .asc o el .dxf de {p.stem}")
        asc_txt = hermano[".asc"].read_text(encoding="cp1252", errors="replace")
        dxf_txt = hermano[".dxf"].read_text(encoding="cp1252", errors="replace")
    return interpretar(leer_asc(asc_txt), leer_dxf_fxcc(dxf_txt))
