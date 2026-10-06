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
    # Los niveles en los que es PROPIO: una parte anexa de otra parcela solo
    # lo es hasta su `hasta_nivel` (ver `floors.niveles_propios`).
    from .floors import niveles_propios
    return niveles_propios(parte, por_defecto)


def _construcciones(modelo) -> list[dict]:
    out = []
    for s in modelo.spaces:
        a = s.attrs or {}
        if not a.get("codigo") or s.area is None:
            continue
        out.append({"codigo": a["codigo"], "uso": a.get("uso_literal") or s.use,
                    "uso_normalizado": s.use, "nivel": s.floor,
                    "superficie": s.area, "habitable": a.get("habitable"),
                    "puerta": a.get("puerta"), "escalera": a.get("escalera")})
    return out


#: Cuanto de un recinto del croquis tiene que caer dentro de un cuerpo para
#: darlo por suyo. Croquis y cuerpos salen de la misma cartografia: lo normal
#: es el 100 %, y un recinto partido entre dos cuerpos es de los dos.
SOLAPE_CROQUIS = 0.5


def _casar_por_croquis(modelo, partes, construcciones) -> dict[str, dict]:
    """Lo que hay en cada cuerpo, planta a planta, segun el CROQUIS CATASTRAL.

    POR QUE EXISTE — 8480109VH9888S (CL Romeras 8, Villanueva de los
    Infantes): un cuerpo de dos plantas de 47,7 m2 es COMERCIO abajo y ALMACEN
    arriba, y la casacion por superficie lo daba por el PORCHE de 45 m2 de la
    planta baja. Con el croquis por plantas (`catastro/fxcc.py`) no hay que
    adivinar: se mira que recintos caen DENTRO del cuerpo en cada planta, con
    que construccion casa cada uno y si cuenta.

    Solo los cuerpos con algun recinto del croquis; los demas siguen por la
    superficie. `niveles_fuera` sale de aqui directamente: las plantas en las
    que ninguno de sus recintos cuenta.
    """
    from ..catastro import fxcc as fxcc_mod
    fx = (getattr(modelo, "catastro", None) or {}).get("_fxcc")
    if fx is None:
        return {}
    from ..pipeline import es_terciario          # noqa: PLC0415 (evita el ciclo)
    terciario = es_terciario(modelo.catastro.get("tipo_edificio_ce3x"))
    salida: dict[str, dict] = {}
    for p in partes:
        pid = _codigo(p)
        if not pid or p.geometry is None:
            continue
        niveles = niveles_de(p)
        detalle = []
        vacios = []
        for n in niveles:
            pl = fx.planta_de_nivel(n)
            if pl is None:
                continue
            antes = len(detalle)
            for r in pl.recintos:
                if r.poligono is None or r.destino == "PTO" or not r.poligono.area:
                    continue
                try:
                    dentro = r.poligono.intersection(p.geometry).area
                except Exception:                          # noqa: BLE001
                    continue
                # Suyo si cae dentro casi entero, o si llena casi todo el cuerpo:
                # un porche de 45 m2 partido en tres cuerpos es de los tres.
                if dentro < SOLAPE_CROQUIS * min(r.poligono.area, p.geometry.area):
                    continue
                con = fxcc_mod.construccion_de(r, n, construcciones)
                detalle.append({"nivel": n, "codigo": r.codigo, "literal": r.literal,
                                "superficie": r.superficie,
                                "construccion": (con or {}).get("codigo"),
                                "cuenta": fxcc_mod.cuenta(r, con, terciario)})
            if len(detalle) == antes:
                # El croquis tiene esta planta y en ella no hay NADA de esta
                # parcela dentro del cuerpo: es de otra (una casa «maclada»: el
                # porche de esta abajo, la casa del vecino encima — el
                # `.II08I09I` de la planta general).
                vacios.append(n)
        if not detalle:
            continue
        con_croquis = sorted({d["nivel"] for d in detalle} | set(vacios))
        fuera = [n for n in con_croquis if not any(d["cuenta"] for d in detalle if d["nivel"] == n)]
        # Se rotula por lo que DECIDE: en las plantas en las que sobra, lo que
        # hay ahi; si no sobra en ninguna, lo que cuenta (la vivienda), aunque
        # lleve dentro un trozo de porche — eso lo resuelve la zona.
        rotulo = [d for d in detalle if d["nivel"] in fuera] or [d for d in detalle if d["cuenta"]]
        principal = max(rotulo, key=lambda d: d["superficie"] or 0)
        usos = []
        for d in sorted(rotulo, key=lambda d: (d["nivel"], -(d["superficie"] or 0))):
            if d["literal"] not in usos:
                usos.append(d["literal"])
        salida[pid] = {
            "codigo": principal["construccion"] or principal["codigo"],
            "uso": " / ".join(usos),
            "nivel": principal["nivel"],
            "superficie": round(sum(d["superficie"] or 0 for d in rotulo), 2),
            "habitable": False if fuera else True,
            "parecido": 1.0,
            "por_croquis": True,
            "fecha_croquis": fx.asc.get("fecha"),
            "niveles_fuera": fuera,
            # Plantas en las que el croquis no pone nada de esta parcela aqui.
            "niveles_de_otra_parcela": vacios,
            "detalle": detalle,
        }
    return salida


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


def _casar_por_eliminacion(partes, construcciones, casadas) -> dict[str, dict]:
    """Los cuerpos que se quedan sin casar, cuando el RESTO ya es la vivienda.

    POR QUE EXISTE — 8919709VJ8681N (26RES080_85, CL Sol 20, Campo de
    Criptana): una casa de dos plantas (117 m2) con dos almacenes de una planta
    al fondo (47 y 28 m2). Catastro declara en la baja VIVIENDA 119 y ALMACEN
    106, pero el ALMACEN son DOS partes y ninguna de las dos se parece a 106 por
    separado: la casacion 1:1 no daba con nada y los dos almacenes se quedaban
    como "Catastro no dice que hay aqui". El certificador se paso una hora
    intentando separarlos a mano con paredes dibujadas, que no quitan
    superficie, y acabo haciendo el CEE a mano.

    Y sin embargo la respuesta esta en las cifras: en esa planta la vivienda ya
    la cubre el cuerpo de dos plantas (117 frente a 119), asi que lo que queda
    construido de UNA planta solo puede ser lo que Catastro declara aparte, que
    es ALMACEN. Eso es lo que se hace aqui, y con estas condiciones — todas ellas
    para no afirmar nada que no salga de las cifras:

      · el cuerpo esta en UN solo nivel (un anexo de una planta). Uno de varias
        plantas sin casar es ambiguo: arriba podria ser la casa;
      · en ese nivel, lo HABITABLE que declara Catastro ya lo cubren los cuerpos
        que casaron con vivienda (con la misma tolerancia que la casacion);
      · en ese nivel hay una construccion NO habitable que nadie ha casado;
      · y lo que queda sin casar no pasa de lo no habitable declarado — si
        pasara, parte de ello seria vivienda.

    Varios cuerpos pueden ser la MISMA construccion (el almacen son dos partes),
    asi que aqui no es 1:1. Van marcados `por_eliminacion`: la pantalla lo dice
    con esas palabras, y como siempre se PROPONE, no se aplica solo.
    """
    salida: dict[str, dict] = {}
    usadas = {c.get("codigo") for c in casadas.values()}
    area = {_codigo(p): p.geometry.area for p in partes}
    habitables_casados = {pid for pid, c in casadas.items() if c.get("habitable") is True}

    niveles = sorted({c["nivel"] for c in construcciones if c["nivel"] is not None})
    for n in niveles:
        aqui = [c for c in construcciones if c["nivel"] == n]
        declarado_hab = sum(c["superficie"] for c in aqui if c["habitable"] is True)
        libres_nh = [c for c in aqui if c["habitable"] is False and c["codigo"] not in usadas]
        if not libres_nh:
            continue
        en_nivel = [p for p in partes if n in niveles_de(p)]
        cubierto = sum(area[_codigo(p)] for p in en_nivel
                       if _codigo(p) in habitables_casados)
        if declarado_hab > 0 and cubierto < declarado_hab * (1 - TOLERANCIA):
            continue                    # falta vivienda: algun libre puede serlo
        sueltos = [p for p in en_nivel
                   if _codigo(p) and _codigo(p) not in casadas
                   and _codigo(p) not in salida and niveles_de(p) == [n]]
        if not sueltos:
            continue
        declarado_nh = sum(c["superficie"] for c in libres_nh)
        suma = sum(area[_codigo(p)] for p in sueltos)
        if suma > declarado_nh * (1 + TOLERANCIA):
            continue                    # sobra construido: no todo es almacen
        destino = max(libres_nh, key=lambda c: c["superficie"])
        for p in sueltos:
            salida[_codigo(p)] = {
                **destino,
                # Cuanto de lo que Catastro declara en esa construccion suman
                # los cuerpos que se le atribuyen: es la prueba que se enseña.
                "parecido": round(min(1.0, suma / max(destino["superficie"], 1e-6)), 4),
                "por_eliminacion": True,
                "vivienda_cubierta": round(cubierto, 2),
                "vivienda_declarada": round(declarado_hab, 2),
            }
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
    # Con el CROQUIS CATASTRAL se sabe planta a planta (`_casar_por_croquis`).
    if c.get("por_croquis"):
        return [n for n in c.get("niveles_fuera") or [] if n in niveles] or niveles
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
    casadas.update(_casar_por_eliminacion(modelo.partes, cons, casadas))
    # Lo que dibuja el croquis catastral MANDA sobre lo que se deduce de las
    # superficies: es un dato, no una conjetura.
    casadas.update(_casar_por_croquis(modelo, modelo.partes, cons))

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
