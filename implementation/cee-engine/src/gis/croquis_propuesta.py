"""La PROPUESTA de croquis: donde esta, probablemente, lo que no es vivienda.

POR QUE EXISTE — el croquis a mano alzada (`gis/croquis.py`) ya pone los m2:
quien lo dibuja solo tiene que decir DONDE. Pero muchas veces ni eso hace
falta preguntarlo: un garaje esta pegado a la calle —por ahi entra el coche—,
un porche abierto da a un patio o a un espacio libre de la parcela, y un
almacen suele estar al fondo. Con eso y los m2 que Catastro declara en la
planta sale una propuesta razonable que el tecnico solo corrige.

    lados de la planta (fachadas agrupadas)  ─►  un ancla por uso  ─►  semilla
    pegada a su ancla  ─►  `croquis.ajustar_nivel` (enderezar + m2 de Catastro)

REGLA — es una PROPUESTA y se dice por que. Cada mancha lleva su ancla (las
paredes a las que se pega), el motivo y la confianza: alta si una FOTO lo dice
(hay una puerta de garaje en esa fachada), media si sale de la calle o del
patio, baja si es lo que queda. Nunca se aplica sola: la ve una persona, la
corrige y pulsa «Ajustar a Catastro», que es el mismo camino que un croquis
dibujado a mano.

REGLA — se razona por LADOS, no por paredes. Catastro trocea una fachada
en tramos cada vez que cambia el vecino de enfrente (el norte de OP246 son
cuatro: 1,25 · 3,01 · 10,09 · 0,06 m); elegir «la pared mas larga» elegiria
un trozo. Un lado es el conjunto de fachadas con la misma orientacion y a lo
mismo (calle, patio, espacio libre).

Puro: recibe la huella, las paredes y los objetivos; devuelve semillas. Quien
lo alimenta es `pipeline.proponer_croquis`.
"""
from __future__ import annotations

import math

from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge, substring, unary_union

FACHADA = "FACHADA"
MEDIANERA = "MEDIANERA"
CALLE = "CALLE"
LIBRES = ("PATIO", "ESPACIO_LIBRE_PARCELA")

#: Un tramo de menos de esto no ancla nada (Catastro deja trozos de centimetros).
TRAMO_MINIMO_M = 0.5
#: El ancho minimo de un porche o un almacen a lo largo de su pared (m).
ANCHO_MINIMO_M = 3.0

NOMBRE_LADO = {"N": "norte", "NE": "noreste", "E": "este", "SE": "sureste",
               "S": "sur", "SO": "suroeste", "O": "oeste", "NO": "noroeste"}


def _que_da(subtipo: str) -> str:
    return {"CALLE": "la calle", "PATIO": "un patio",
            "ESPACIO_LIBRE_PARCELA": "un espacio libre de la parcela"}.get(subtipo, "el exterior")


def lados(paredes: list[dict]) -> list[dict]:
    """Las fachadas (y medianeras) agrupadas por orientacion y a lo que dan.

    `paredes`: [{id, tipo, subtipo, orientacion, linea: LineString}].
    Devuelve [{clave, tipo, subtipo, orientacion, ids, linea, largo}] del mas
    largo al mas corto.
    """
    grupos: dict[tuple, dict] = {}
    for p in paredes:
        if p.get("tipo") not in (FACHADA, MEDIANERA):
            continue
        linea = p.get("linea")
        if linea is None or linea.length < TRAMO_MINIMO_M:
            continue
        clave = (p["tipo"], p.get("subtipo") or "", p.get("orientacion") or "")
        g = grupos.setdefault(clave, {"clave": clave, "tipo": p["tipo"], "subtipo": clave[1],
                                      "orientacion": clave[2], "ids": [], "lineas": []})
        g["ids"].append(p["id"])
        g["lineas"].append(linea)
    out = []
    for g in grupos.values():
        unida = linemerge(MultiLineString(g["lineas"])) if len(g["lineas"]) > 1 else g["lineas"][0]
        g["linea"] = unida
        g["largo"] = unida.length
        del g["lineas"]
        out.append(g)
    return sorted(out, key=lambda g: -g["largo"])


def _tramo_principal(linea):
    """La linea continua mas larga de un lado (un lado puede venir partido)."""
    if isinstance(linea, LineString):
        return linea
    return max(getattr(linea, "geoms", [linea]), key=lambda g: g.length)


def _semilla(lado: dict, huella, objetivo: float, entero: bool):
    """Una mancha pegada a ese lado, hacia dentro, con mas o menos el area.

    `entero`: a lo largo de TODO el lado (un garaje: la puerta puede estar en
    cualquier punto de la fachada y el garaje suele ocupar su fondo). Si no, un
    parche centrado en el tramo mas largo (un porche, un almacen).
    """
    linea = lado["linea"]
    if not entero:
        t = _tramo_principal(linea)
        ancho = min(t.length, max(ANCHO_MINIMO_M, math.sqrt(objetivo) * 1.3))
        ini = (t.length - ancho) / 2
        linea = substring(t, ini, ini + ancho)
    largo = max(linea.length, 0.1)
    fondo = max(0.8, min(objetivo / largo, 30.0))
    g = linea.buffer(fondo, cap_style=2, join_style=2).intersection(huella)
    if g.is_empty:
        return None
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda x: x.area)
    return g if g.area > 0.5 else None


def proponer(huella, paredes: list[dict], objetivos: dict[str, float],
             pistas: dict | None = None) -> tuple[list[dict], list[str]]:
    """Las semillas de la propuesta, una por uso con objetivo.

    Devuelve ([{indice, uso, poligono, ancla, lado, por_que, confianza}], notas).
    """
    pistas = pistas or {}
    todos = lados(paredes)
    fachadas = [l for l in todos if l["tipo"] == FACHADA]
    calle = [l for l in fachadas if l["subtipo"] == CALLE]
    libres = [l for l in fachadas if l["subtipo"] in LIBRES]
    ref_calle = unary_union([l["linea"] for l in calle]) if calle else None

    usados: set[tuple] = set()
    semillas: list[dict] = []
    notas: list[str] = []

    def libre(lista):
        return [l for l in lista if l["clave"] not in usados]

    def nombre(l):
        return f"{NOMBRE_LADO.get(l['orientacion'], l['orientacion'] or '?')} ({', '.join(l['ids'])})"

    orden = [u for u in ("GARAJE", "PORCHE", "ALMACEN") if objetivos.get(u)]
    orden += [u for u in objetivos if u not in orden and objetivos.get(u)]
    for uso in orden:
        objetivo = float(objetivos[uso])
        lado, por_que, confianza = None, None, "baja"
        if uso == "GARAJE":
            con_foto = [l for l in fachadas if set(l["ids"]) & set(pistas.get("GARAJE") or [])]
            if con_foto:
                lado = con_foto[0]
                por_que = f"en la foto de {', '.join(set(lado['ids']) & set(pistas['GARAJE']))} hay una puerta de garaje"
                confianza = "alta"
            elif libre(calle):
                lado = libre(calle)[0]
                por_que = f"la fachada {nombre(lado)} da a la calle: es por donde entra el coche"
                confianza = "media"
            elif libre(fachadas):
                lado = libre(fachadas)[0]
                por_que = f"no hay fachada a la calle; se pone en la más larga, {nombre(lado)}"
        elif uso == "PORCHE":
            if libre(libres):
                lado = libre(libres)[0]
                por_que = (f"la fachada {nombre(lado)} da a {_que_da(lado['subtipo'])}: "
                           "un porche abierto suele estar ahí")
                confianza = "media"
            elif libre(calle):
                lado = libre(calle)[0]
                por_que = f"no hay patio ni espacio libre; se pone en la calle, {nombre(lado)}"
            elif fachadas:
                lado = fachadas[0]
                por_que = f"se pone en la fachada más larga, {nombre(lado)}"
        else:
            # Lo que queda (almacen, otros): al FONDO, lo mas lejos de la calle.
            cand = [l for l in libre(todos) if l["tipo"] in (FACHADA, MEDIANERA)]
            if cand and ref_calle is not None:
                lado = max(cand, key=lambda l: l["linea"].interpolate(0.5, normalized=True)
                           .distance(ref_calle))
                por_que = f"al fondo, lo más lejos de la calle: {nombre(lado)}"
            elif cand:
                lado = cand[0]
                por_que = f"se pone en {nombre(lado)}"
        if lado is None:
            notas.append(f"no hay dónde anclar {uso.lower()}: dibújalo a mano")
            continue
        g = _semilla(lado, huella, objetivo, entero=(uso == "GARAJE"))
        if g is None:
            notas.append(f"{uso.lower()}: no cabe junto a {nombre(lado)}; dibújalo a mano")
            continue
        usados.add(lado["clave"])
        semillas.append({"indice": len(semillas), "uso": uso, "poligono": g,
                         "ancla": list(lado["ids"]),
                         "lado": NOMBRE_LADO.get(lado["orientacion"], lado["orientacion"]),
                         "por_que": por_que, "confianza": confianza})
    return semillas, notas
