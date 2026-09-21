"""Los CUERPOS del edificio: cada BuildingPart de Catastro, con lo que hay dentro.

Catastro dibuja un edificio en PARTES: la casa de dos plantas es un poligono, el
garaje adosado de una es otro, y el porche otro. El motor las UNE por nivel para
sacar la huella de cada planta —que es lo que se segmenta en paredes— y ahi se
pierde de vista que eran cuerpos distintos.

Eso importa porque la envolvente de un certificado es la de la VIVIENDA: un
aparcamiento adosado no va dentro. Catastro lo dice en `lcons` (uso APARCAMIENTO
y `habitable = False`), pero el plano filtra por NIVEL —la planta baja tiene
vivienda, luego se dibuja entera— asi que sus paredes entraban igual y habia que
apartarlas una a una.

Aqui se reconstruye esa correspondencia:
  · `inventario()` — que cuerpos hay, cuanto miden, en que niveles estan y con
    que construccion de `lcons` casan.
  · `de_cada_muro()` — a que cuerpo pertenece cada pared ya medida.

REGLA — casar cuerpo con construccion es una CONJETURA, y se dice. Catastro NO
publica el poligono de cada unidad constructiva ("geometria: NO DISPONIBLE"), asi
que lo unico que las une es la SUPERFICIE. Cuando dos cifras se parecen lo
bastante se propone, nunca se aplica solo: hay garajes que forman parte de la
vivienda y porches cerrados que son estar.
"""
from __future__ import annotations

from shapely.geometry import Point

#: Cuanto se pueden parecer una parte y una construccion para darlas por la
#: misma cosa. Medido sobre 9412508VJ8691S: el aparcamiento casa al 0,1 % y la
#: vivienda al 3,4 % (la huella incluye el grosor de los muros, la superficie
#: construida de `lcons` no siempre). Por encima del 8 % ya no se afirma nada.
TOLERANCIA = 0.08

#: A que distancia del borde de un cuerpo tiene que estar el punto medio de una
#: pared para considerarla suya. Es una pared del propio borde: la distancia es
#: cero salvo redondeos de la cartografia.
CERCA_M = 0.10


def _codigo(parte) -> str:
    return parte.original_id or ""


def niveles_de(parte, por_defecto: int = 1) -> list[int]:
    """En que niveles esta presente este cuerpo."""
    sobre = parte.plantas_sobre_rasante or por_defecto
    bajo = parte.plantas_bajo_rasante or 0
    return list(range(-bajo, 0)) + list(range(0, sobre))


def _construcciones(modelo) -> list[dict]:
    out = []
    for s in modelo.spaces:
        a = s.attrs or {}
        if not a.get("codigo") or s.area is None:
            continue
        out.append({"codigo": a["codigo"], "uso": a.get("uso_literal") or s.use,
                    "uso_normalizado": s.use, "nivel": s.floor,
                    "superficie": s.area, "habitable": a.get("habitable")})
    return out


def _casar(partes, construcciones) -> dict[str, dict]:
    """Empareja cada cuerpo con la construccion cuya superficie mas se le parece.

    Greedy por la diferencia mas pequena y 1:1: dos cuerpos no pueden ser la
    misma construccion. Una construccion solo se ofrece si esta en alguno de los
    niveles del cuerpo — la vivienda de la planta primera no describe el garaje
    de la baja aunque midan lo mismo.
    """
    parejas: list[tuple[float, str, int]] = []
    for p in partes:
        niveles = set(niveles_de(p))
        for i, c in enumerate(construcciones):
            if c["nivel"] is not None and c["nivel"] not in niveles:
                continue
            base = max(c["superficie"], 1e-6)
            dif = abs(p.geometry.area - c["superficie"]) / base
            if dif <= TOLERANCIA:
                parejas.append((dif, _codigo(p), i))

    parejas.sort()
    usados_c: set[int] = set()
    usados_p: set[str] = set()
    salida: dict[str, dict] = {}
    for dif, pid, i in parejas:
        if pid in usados_p or i in usados_c:
            continue
        usados_p.add(pid)
        usados_c.add(i)
        salida[pid] = {**construcciones[i], "parecido": round(1 - dif, 4)}
    return salida


def _usos_del_nivel(cons, niveles) -> list[dict]:
    """Lo que Catastro declara en las plantas de este cuerpo, de mayor a menor.

    Es lo que queda cuando la casacion por superficie no da: las PARTES de
    Catastro no se corresponden una a una con sus unidades constructivas — una
    parte puede llevar dentro media vivienda y medio almacen—, asi que muchas
    veces no hay a quien casar. Entonces no se puede decir QUE es este cuerpo,
    pero si QUE HAY en su planta, que es con lo que una persona decide.
    """
    ns = set(niveles or ())
    dentro = [c for c in cons if c["nivel"] is None or c["nivel"] in ns]
    return sorted(({"uso": c["uso"], "superficie": c["superficie"],
                    "habitable": c["habitable"], "nivel": c["nivel"]}
                   for c in dentro),
                  key=lambda c: -(c["superficie"] or 0))


def niveles_fuera(cuerpo: dict) -> list[int]:
    """En que NIVELES no cuenta este cuerpo, de los que ocupa.

    REGLA — un cuerpo se deja fuera POR PLANTA, no entero. Un garaje adosado
    con vivienda encima es UN BuildingPart de dos plantas: Catastro dibuja el
    prisma completo y declara APARCAMIENTO solo en la planta baja. Quitarlo de
    las dos borra las fachadas REALES de la vivienda de arriba —medido en
    2370310VJ4027S: la planta primera perdia 19 m2 y dos fachadas a la calle—.

    El nivel lo dice la CONSTRUCCION con la que casa, y solo cuando esa
    construccion NO es habitable: ahi Catastro esta diciendo "en esta planta
    esto es un garaje". Cuando el cuerpo no casa con ninguna, o casa con una
    que SI es vivienda —y el certificador la quita igual, contra Catastro—, no
    hay forma de saber en que planta sobra: sale de todas, que es lo que se
    esta pidiendo al pulsar el boton.
    """
    c = cuerpo.get("construccion") or {}
    niveles = list(cuerpo.get("niveles") or [])
    nivel = c.get("nivel")
    if nivel is None or c.get("habitable") is not False:
        return niveles
    nivel = int(nivel)
    return [nivel] if nivel in niveles else niveles


def inventario(modelo, excluidos=()) -> list[dict]:
    """Los cuerpos del edificio, listos para pintarlos y para preguntar por ellos."""
    fuera = set(excluidos or ())
    cons = _construcciones(modelo)
    casadas = _casar(modelo.partes, cons)

    out = []
    for p in modelo.partes:
        pid = _codigo(p)
        if not pid:
            continue
        c = casadas.get(pid)
        out.append({
            "id": pid,
            "superficie": round(p.geometry.area, 2),
            "plantas_sobre": p.plantas_sobre_rasante,
            "plantas_bajo": p.plantas_bajo_rasante,
            "niveles": niveles_de(p),
            "construccion": c,
            # Lo unico que decide de verdad: si Catastro dice que ahi no se vive.
            # `None` es "no se sabe", que NO es lo mismo que "no es vivienda".
            "habitable": None if c is None else c.get("habitable"),
            # Lo que Catastro declara en las plantas de este cuerpo. Se manda
            # SIEMPRE, no solo cuando no casa: aunque haya casado, saber que en
            # esa planta hay 438 m2 de almacen y 18 de vivienda es justo lo que
            # dice si el cuerpo que se esta mirando sobra.
            "usos_nivel": _usos_del_nivel(cons, niveles_de(p)),
            "fuera": pid in fuera,
            "_geom": p.geometry,
        })
    for c in out:
        # En que plantas NO cuenta. Va en la respuesta porque de aqui salen dos
        # cosas: que niveles se recortan al medir y en cuales lo pinta el plano
        # como "NO CUENTA". En las demas sigue siendo parte de la vivienda.
        c["niveles_fuera"] = niveles_fuera(c)
    return sorted(out, key=lambda c: -c["superficie"])


def de_cada_muro(elementos: list[dict], partes) -> dict[str, str]:
    """A que cuerpo pertenece cada pared: `{id del elemento: id de la parte}`.

    El muro es un trozo del borde de la huella de su planta, y esa huella es la
    UNION de los cuerpos de ese nivel: el cuerpo de una pared es aquel cuyo
    borde pasa por su punto medio. Un muro que no toque ninguno —no deberia
    haberlos— se queda sin cuerpo en vez de asignarse al primero.
    """
    from shapely import wkt as _wkt

    salida: dict[str, str] = {}
    for el in elementos:
        w = el.get("geometria_wkt")
        if not w:
            continue
        try:
            g = _wkt.loads(w)
        except Exception:                                   # noqa: BLE001
            continue
        try:
            m = g.interpolate(0.5, normalized=True)
        except Exception:                                   # noqa: BLE001
            m = Point(g.centroid)
        mejor, dmin = None, None
        for p in partes:
            d = p.geometry.exterior.distance(m) if p.geometry.geom_type == "Polygon" \
                else p.geometry.boundary.distance(m)
            if dmin is None or d < dmin:
                mejor, dmin = _codigo(p), d
        if mejor and dmin is not None and dmin <= CERCA_M:
            salida[el["id"]] = mejor
    return salida
