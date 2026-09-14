"""El plano de cada planta, listo para dibujar en pantalla.

Los muros salen como coordenadas SVG a partir del WKT, no como PNG: asi se
pueden pintar por estado y se pueden PULSAR, que es toda la gracia de la vista
del certificador.

Esto va aqui y no en el navegador por la regla de siempre: **la geometria se
resuelve donde estan shapely y pyproj**. El front recibe puntos ya colocados y
no calcula ni un metro — si algun dia hay que cambiar el encuadre o el CRS, se
cambia en un sitio.

El encuadre es COMUN a todas las plantas: si cada una se escalara a su propio
tamano, la planta primera —mas pequena— saldria dibujada igual de grande que la
baja, y una encima de otra no coincidirian. Se encuadra el edificio entero.
"""

from __future__ import annotations

import re

#: Lo que se dibuja: lo que tiene un trazado en planta. Un suelo o una cubierta
#: son superficies horizontales y no se ven en un plano de paredes.
DIBUJABLES = ("FACHADA", "MEDIANERA", "PARTICION_VERTICAL")

#: Como se llama cada planta en pantalla. El resto se queda con su codigo.
NOMBRE_PLANTA = {"PB": "PLANTA BAJA"}

#: Aire alrededor del edificio, en tanto por uno del lado mayor. Sin esto los
#: rotulos de los muros del borde se salen del lienzo.
MARGEN = 0.10


def _coords(wkt: str) -> list[tuple[float, float]]:
    """Los pares X Y de un WKT, sea LINESTRING o POLYGON."""
    nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", wkt)]
    return list(zip(nums[0::2], nums[1::2]))


def _anillos(wkt: str) -> list[list[tuple[float, float]]]:
    """Los anillos de un POLYGON, por separado.

    `_coords` vale para una linea, pero un edificio de Catastro trae PATIOS:
    son anillos interiores del mismo poligono, y leidos de corrido salen unidos
    al contorno por una diagonal que cruza la casa. Se parte por los parentesis
    de cada anillo.
    """
    if not wkt:
        return []
    salida = []
    for trozo in re.findall(r"\(([^()]*)\)", wkt):
        pts = _coords(trozo)
        if len(pts) >= 3:
            salida.append(pts)
    return salida


def _nombre(codigo: str) -> str:
    if codigo in NOMBRE_PLANTA:
        return NOMBRE_PLANTA[codigo]
    if codigo.startswith("P") and codigo[1:].isdigit():
        return f"PLANTA {int(codigo[1:])}"
    if codigo.startswith("S") and codigo[1:].isdigit():
        return f"SÓTANO {int(codigo[1:])}"
    return codigo


def _orden(codigo: str) -> int:
    """De abajo arriba: S2, S1, PB, P1, P2..."""
    if codigo == "PB":
        return 0
    if codigo.startswith("P") and codigo[1:].isdigit():
        return int(codigo[1:])
    if codigo.startswith("S") and codigo[1:].isdigit():
        return -int(codigo[1:])
    return 99


def plantas(geo: dict, excluir: set[str] | None = None,
            solo_habitables: bool = True) -> dict:
    """Las plantas con sus muros ya colocados sobre un lienzo comun.

    `excluir` son los ids que el certificador deja fuera de la envolvente: se
    dibujan igual —para que se vea el edificio entero— pero marcados `fuera`,
    porque una pared que desaparece del plano sin avisar es un agujero que
    nadie encuentra.
    """
    excluir = excluir or set()
    por_planta: dict[str, list[dict]] = {}
    todos: list[dict] = []

    habitables = _habitables(geo) if solo_habitables else None

    for el in geo.get("elementos", []):
        if el.get("tipo") not in DIBUJABLES or not el.get("geometria_wkt"):
            continue
        planta = el.get("planta")
        if habitables is not None and el.get("nivel") not in habitables:
            continue
        m = {
            "id": el["id"], "planta": planta, "nivel": el.get("nivel"),
            "tipo": el["tipo"], "subtipo": el.get("subtipo"),
            "orientacion": el.get("orientacion") or "—",
            "largo": _valor(el.get("largo")),
            "alto": _valor(el.get("alto")),
            "superficie": _valor(el.get("superficie")),
            "fuera": el["id"] in excluir,
            "_pts": _coords(el["geometria_wkt"]),
        }
        todos.append(m)
        por_planta.setdefault(planta, []).append(m)

    if not todos:
        return {"ancho": 0, "alto": 0, "plantas": []}

    # Un solo encuadre para todo el edificio: las plantas tienen que poder
    # compararse una con otra de un vistazo.
    xs = [x for m in todos for x, _ in m["_pts"]]
    ys = [y for m in todos for _, y in m["_pts"]]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    margen = max(maxx - minx, maxy - miny) * MARGEN

    for m in todos:
        # La Y se invierte: en el mundo crece hacia el norte y en un SVG crece
        # hacia abajo. Sin esto el plano sale del reves y el norte, al sur.
        m["svg"] = [[round(x - minx + margen, 2), round(maxy - y + margen, 2)]
                    for x, y in m["_pts"]]
        del m["_pts"]

    def al_lienzo(pts):
        return [[round(x - minx + margen, 2), round(maxy - y + margen, 2)]
                for x, y in pts]

    contexto = _contexto(geo, al_lienzo)
    superficies = _superficies(geo)
    ancho = round(maxx - minx + margen * 2, 2)
    alto = round(maxy - miny + margen * 2, 2)
    entorno = _entorno(contexto, ancho, alto)
    return {
        "ancho": ancho,
        "alto": alto,
        # DONDE esta el lienzo en el mundo. El plano es la misma coordenada
        # trasladada (`x - minx + margen`, y la Y invertida), asi que con esto
        # se puede pedir la cartografia del Catastro por su WMS con ESTE
        # rectangulo y encaja pixel a pixel, sin ajustar nada a ojo. Se da el
        # del ENTORNO porque es el mas amplio: la misma imagen sirve para los
        # dos encuadres.
        "georef": _georef(geo, minx, miny, maxx, maxy, margen, alto, entorno),
        # Lo que hay ALREDEDOR, ya colocado sobre el mismo lienzo. No es
        # decoracion: una medianera lo es por lo que hay AL OTRO LADO, y sin
        # ver el edificio de al lado el certificador no puede juzgar si esa
        # pared da a la calle, a un patio o al vecino — que es justo lo que la
        # vista le pregunta. Se proyecta AQUI, donde estan las coordenadas.
        "contexto": contexto,
        # El encuadre AMPLIO, sobre las MISMAS coordenadas: para ver la manzana
        # hay que alejarse, y al alejarse la casa se queda del tamano de un
        # sello. Son dos tareas distintas —trabajar sobre las paredes y situar
        # la casa entre las de al lado— y no caben en un solo encuadre: medido
        # en 26RES060_186, con margen suficiente para que entre el contexto la
        # casa baja al 50% del ancho y AUN ASI solo entra la mitad de los
        # vecinos. Asi el navegador solo cambia el `viewBox`: ni un metro se
        # recalcula, y el zoom sale exacto.
        "entorno": entorno,
        "plantas": [
            {
                "id": p,
                "nombre": _nombre(p),
                "habitable": True,
                "superficie": superficies.get(_nivel_de(ms)),
                "muros": sorted(ms, key=lambda m: m["id"]),
            }
            for p, ms in sorted(por_planta.items(), key=lambda kv: _orden(kv[0]))
        ],
    }


def _georef(geo: dict, minx, miny, maxx, maxy, margen, alto, entorno) -> dict:
    """El rectangulo del lienzo en coordenadas del mundo.

    Del lienzo al mundo: `x_mundo = x_lienzo + minx - margen` y
    `y_mundo = maxy + margen - y_lienzo` (la Y va al reves en un SVG).

    Se devuelve el del ENTORNO, que contiene al de la casa: pedir dos imagenes
    seria pedirle dos veces al mismo WMS del que depende el buscador de la app.
    """
    crs = (geo.get("modelo") or {}).get("crs") or "EPSG:25830"
    oeste = minx - margen + entorno["x"]
    norte = maxy + margen - entorno["y"]
    return {
        "crs": crs,
        # [oeste, sur, este, norte] — el orden del BBOX de un WMS 1.1.1.
        "bbox": [round(oeste, 2), round(norte - entorno["alto"], 2),
                 round(oeste + entorno["ancho"], 2), round(norte, 2)],
        # Dónde va esa imagen DENTRO del lienzo, para colocarla sin calcular.
        "en_el_lienzo": {"x": entorno["x"], "y": entorno["y"],
                         "ancho": entorno["ancho"], "alto": entorno["alto"]},
    }


def _entorno(contexto: dict, ancho: float, alto: float) -> dict:
    """El rectangulo que abarca la casa Y todo lo que la rodea."""
    pts = [p for grupo in contexto.values() for anillo in grupo for p in anillo]
    if not pts:
        return {"x": 0, "y": 0, "ancho": ancho, "alto": alto}
    xs = [p[0] for p in pts] + [0.0, ancho]
    ys = [p[1] for p in pts] + [0.0, alto]
    aire = 1.0            # un metro de respiro para que nada toque el borde
    return {
        "x": round(min(xs) - aire, 2),
        "y": round(min(ys) - aire, 2),
        "ancho": round(max(xs) - min(xs) + aire * 2, 2),
        "alto": round(max(ys) - min(ys) + aire * 2, 2),
    }


def _contexto(geo: dict, al_lienzo) -> dict:
    """Vecinos, parcela y huella del propio edificio, en coordenadas del SVG.

    Se dibujan enteros aunque se salgan del lienzo: el navegador los recorta,
    igual que el visor de Catastro recorta la manzana. Lo que hace falta ver es
    la franja que TOCA cada pared, no la manzana entera — encuadrar para que
    quepan todos dejaria la casa del tamano de un sello.
    """
    modelo = geo.get("modelo") or {}

    def anillos_de(lista):
        salida = []
        for el in lista or []:
            for anillo in _anillos(el.get("geometry_wkt") or ""):
                salida.append(al_lienzo(anillo))
        return salida

    parcela = modelo.get("parcel")
    return {
        # Las masas construidas de al lado: lo que hace que una pared sea
        # medianera de verdad.
        "vecinos": anillos_de(modelo.get("neighbours")),
        # Y las LINDES de alrededor, que es lo que dibuja el visor de Catastro:
        # con solo las masas, un solar o un patio vecino salen en blanco y no
        # se distingue de la calle.
        "parcelas_vecinas": anillos_de(modelo.get("neighbour_parcels")),
        "edificio": anillos_de(modelo.get("buildings")),
        "parcela": anillos_de([parcela] if parcela else []),
    }


def _habitables(geo: dict) -> set:
    """Los niveles con espacio habitable. El sotano-garaje se queda fuera."""
    niveles = set()
    for s in geo.get("modelo", {}).get("spaces", []):
        if (s.get("attrs") or {}).get("habitable") and s.get("floor") is not None:
            niveles.add(s["floor"])
    return niveles


def _superficies(geo: dict) -> dict:
    """La construida por planta: es la que va a la zona del .cex."""
    por_nivel: dict[int, float] = {}
    for s in geo.get("modelo", {}).get("spaces", []):
        if not (s.get("attrs") or {}).get("habitable"):
            continue
        n = s.get("floor")
        if n is None:
            continue
        por_nivel[n] = por_nivel.get(n, 0.0) + float(s.get("area") or 0)
    return {n: round(a, 2) for n, a in por_nivel.items()}


def _nivel_de(muros: list[dict]):
    for m in muros:
        if m.get("nivel") is not None:
            return m["nivel"]
    return None


def _valor(v):
    """Las medidas vienen como `{value, provenance}`: aqui solo hace falta el
    numero, pero NUNCA se inventa uno si no lo hay."""
    if isinstance(v, dict):
        return v.get("value")
    return v
