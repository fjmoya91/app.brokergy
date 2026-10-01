"""El CROQUIS: lo que no es vivienda, dibujado a mano alzada y ajustado a Catastro.

POR QUE EXISTE — 2119403VJ9321N (26RES060_OP246). Catastro declara en la planta
baja VIVIENDA 39, APARCAMIENTO 122 y PORCHE 36 m2 dentro de UN BuildingPart,
pero no dice que poligono es cada uso. Quien conoce la casa sabe DONDE esta el
garaje («por el norte»), pero no dibuja al centimetro ni tiene por que: su
croquis dice la forma, y los m2 los pone Catastro.

    croquis (mancha a mano alzada)  ─►  regularizar (bordes paralelos a las
    paredes)  ─►  ajustar (crecer/encoger hasta el area de Catastro)  ─►  zona

REGLA — las SUPERFICIES las pone Catastro, planta a planta; el croquis solo
dice DONDE. Criterio del usuario (29/09/2026): «la superficie debe encajar con
lo que coge de Catastro en PB y P1, mi dibujo es a mano alzada».

REGLA — lo pequeño se coloca PRIMERO. Un porche dibujado dentro de la mancha
del garaje es del porche: el garaje crece alrededor de el. Asi un garaje en L
sale solo de una mancha rectangular —que es justo como se dibuja—.

REGLA — lo que Catastro no declara no se ajusta: se usa el dibujo tal cual y se
dice. Inventar un area objetivo seria inventar la superficie calefactada.

Puro: recibe huellas y objetivos, devuelve poligonos. Quien saca las huellas y
los m2 de Catastro es `pipeline.ajustar_croquis`.
"""
from __future__ import annotations

import math

from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.ops import unary_union

#: Un borde del croquis a menos de esto de la direccion de una pared se pone
#: PARALELO a ella: a mano alzada nadie traza una recta exacta.
TOLERANCIA_GRADOS = 15.0
#: Lo que se simplifica el trazo antes de enderezarlo (m).
SIMPLIFICAR_M = 0.30
#: Limites de la busqueda del ajuste (m de crecimiento). Una mancha que
#: necesita crecer o encoger mas de esto no es un croquis de ESTA zona.
CRECER_MIN, CRECER_MAX = -10.0, 15.0
#: Cuando se da por cuadrado el area (m2).
TOLERANCIA_AREA_M2 = 0.1


def _limpia(g):
    if g is None or g.is_empty:
        return None
    g = g.buffer(0)
    if g.is_empty:
        return None
    if isinstance(g, MultiPolygon):
        partes = [p for p in g.geoms if p.area > 0.05]
        if not partes:
            return None
        g = unary_union(partes)
    return g if g.area > 0.05 else None


def _abrir(g, d=0.02):
    """Quita agujas y rebabas de un recorte (mismo criterio que `floors._abrir`)."""
    if g is None:
        return None
    return _limpia(g.buffer(-d, join_style=2).buffer(d, join_style=2)) or g


def direcciones_de(huella) -> list[float]:
    """Los angulos (rad, modulo pi) de las paredes de la huella de mas de 1 m."""
    dirs: list[float] = []
    polys = list(huella.geoms) if isinstance(huella, MultiPolygon) else [huella]
    for p in polys:
        cs = list(p.exterior.coords)
        for (x0, y0), (x1, y1) in zip(cs, cs[1:]):
            if math.hypot(x1 - x0, y1 - y0) < 1.0:
                continue
            dirs.append(math.atan2(y1 - y0, x1 - x0) % math.pi)
    return dirs


def _dif(a: float, b: float) -> float:
    d = abs(a - b) % math.pi
    return min(d, math.pi - d)


def regularizar(poly: Polygon, direcciones: list[float],
                tolerancia=TOLERANCIA_GRADOS) -> Polygon:
    """Endereza el croquis: cada borde que va casi paralelo a una pared, paralelo.

    Se rota cada borde alrededor de su punto medio y los vertices se recalculan
    como la interseccion de dos bordes consecutivos. Si dos bordes seguidos
    quedan casi paralelos, se conserva el vertice original (su interseccion se
    iria al infinito).
    """
    p = poly.simplify(SIMPLIFICAR_M, preserve_topology=True)
    if not isinstance(p, Polygon) or p.is_empty:
        return poly
    cs = list(p.exterior.coords)[:-1]
    if len(cs) < 3 or not direcciones:
        return p
    tol = math.radians(tolerancia)
    tramos = []                                   # (x0, y0, x1, y1, angulo, enderezado)
    for i, (x0, y0) in enumerate(cs):
        x1, y1 = cs[(i + 1) % len(cs)]
        ang = math.atan2(y1 - y0, x1 - x0) % math.pi
        cerca = min(direcciones, key=lambda d: _dif(d, ang))
        recto = _dif(cerca, ang) <= tol
        tramos.append((x0, y0, x1, y1, cerca if recto else ang, recto))

    # Los tramos SEGUIDOS que se enderezan a la MISMA direccion son una sola
    # recta: una linea a mano alzada se simplifica en varios trozos casi
    # alineados, y enderezados uno a uno dejarian escalones. La recta pasa por
    # la media de sus puntos medios, pesada por longitud.
    grupos: list[list] = []
    for t in tramos:
        if grupos and t[5] and grupos[-1][-1][5] and abs(_dif(grupos[-1][-1][4], t[4])) < 1e-9:
            grupos[-1].append(t)
        else:
            grupos.append([t])
    if len(grupos) > 1 and grupos[0][0][5] and grupos[-1][-1][5] \
            and abs(_dif(grupos[0][0][4], grupos[-1][-1][4])) < 1e-9:
        grupos[0] = grupos.pop() + grupos[0]
    lineas = []
    for g in grupos:
        pesos = [math.hypot(t[2] - t[0], t[3] - t[1]) or 1e-6 for t in g]
        mx = sum(w * (t[0] + t[2]) / 2 for w, t in zip(pesos, g)) / sum(pesos)
        my = sum(w * (t[1] + t[3]) / 2 for w, t in zip(pesos, g)) / sum(pesos)
        ang = g[0][4]
        lineas.append((mx, my, math.cos(ang), math.sin(ang), g[0][0], g[0][1]))
    if len(lineas) < 3:
        return p
    nuevos = []
    for i in range(len(lineas)):
        (ax, ay, adx, ady, _, _), (bx, by, bdx, bdy, sx, sy) = lineas[i - 1], lineas[i]
        det = adx * bdy - ady * bdx
        if abs(det) < 0.2:                       # casi paralelos: el vertice de siempre
            nuevos.append((sx, sy))
            continue
        t = ((bx - ax) * bdy - (by - ay) * bdx) / det
        nuevos.append((ax + t * adx, ay + t * ady))
    q = Polygon(nuevos)
    q = q if q.is_valid else q.buffer(0)
    # Si enderezar la desfigura (una mancha muy retorcida), mejor la simplificada.
    if q.is_empty or abs(q.area - p.area) > 0.5 * p.area:
        return p
    return q if isinstance(q, Polygon) else p


#: Una zona no puede tener partes mas estrechas que esto (m): al crecer
#: alrededor de otra ya colocada, dejaba una tira finisima por debajo de ella y
#: la pared de la vivienda salia entera como particion con el garaje cuando
#: un tramo da al porche (26RES060_OP246, 29/09/2026).
ANCHO_MINIMO_M = 0.8


def _sin_tiras(g):
    """Quita las partes de menos de `ANCHO_MINIMO_M` de ancho (apertura)."""
    if g is None:
        return None
    r = ANCHO_MINIMO_M / 2
    return _limpia(g.buffer(-r, join_style=2, mitre_limit=10)
                    .buffer(r, join_style=2, mitre_limit=10).intersection(g))


def ajustar(croquis: Polygon, disponible, objetivo: float):
    """Crece o encoge el croquis (mitre: los bordes rectos siguen rectos) dentro
    de lo disponible hasta que su area sea el `objetivo`. Devuelve (poligono,
    area, cuadra).

    Las tiras estrechas se quitan DENTRO de la busqueda, no despues: asi el area
    que se persigue es la de la zona limpia y el hueco de la tira lo compensa el
    resto del crecimiento."""
    def area(d):
        g = _limpia(croquis.buffer(d, join_style=2, mitre_limit=10).intersection(disponible))
        g = _sin_tiras(g)
        return (g.area if g else 0.0), g

    lo, hi = CRECER_MIN, CRECER_MAX
    a_hi, g_hi = area(hi)
    if a_hi < objetivo - TOLERANCIA_AREA_M2:
        # Ni creciendo al maximo llega: no queda sitio (o el objetivo no cabe).
        return g_hi, a_hi, False
    mejor = g_hi
    for _ in range(60):
        mid = (lo + hi) / 2
        a, g = area(mid)
        if a < objetivo:
            lo = mid
        else:
            hi, mejor = mid, g
        if hi - lo < 0.002:
            break
    a_final = mejor.area if mejor else 0.0
    return mejor, a_final, abs(a_final - objetivo) <= max(0.5, 0.01 * objetivo)


#: Dos bordes de zonas distintas que dan a la vivienda, paralelos y a menos de
#: esto (m), son la MISMA pared: se alinean. Sin esto, el garaje y el porche
#: crecian cada uno por su cuenta y la vivienda quedaba con un escalon de 37 cm
#: —un trocito de muro de 1 m2 en CE3X que no existe en la casa—.
ALINEAR_M = 0.6


def _lineas(poly: Polygon):
    """El poligono como lista de rectas (punto medio, direccion unitaria)."""
    cs = list(poly.exterior.coords)[:-1]
    out = []
    for i, (x0, y0) in enumerate(cs):
        x1, y1 = cs[(i + 1) % len(cs)]
        L = math.hypot(x1 - x0, y1 - y0)
        if L < 1e-6:
            continue
        out.append([(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / L, (y1 - y0) / L, L,
                    (x0, y0), (x1, y1)])
    return out


def _de_lineas(lineas) -> Polygon | None:
    pts = []
    for i in range(len(lineas)):
        ax, ay, adx, ady = lineas[i - 1][:4]
        bx, by, bdx, bdy = lineas[i][:4]
        det = adx * bdy - ady * bdx
        if abs(det) < 1e-6:
            pts.append(lineas[i][5])
            continue
        t = ((bx - ax) * bdy - (by - ay) * bdx) / det
        pts.append((ax + t * adx, ay + t * ady))
    q = Polygon(pts)
    return q if q.is_valid and not q.is_empty else None


def _da_a(region, l, d=0.15) -> bool:
    """¿El borde `l` tiene `region` a un lado (a `d` m de su punto medio)?"""
    nx, ny = -l[3], l[2]
    return any(region.contains(Point(l[0] + s * nx, l[1] + s * ny)) for s in (d, -d))


def alinear_escalones(zonas: list[Polygon], huella) -> list[Polygon]:
    """Junta en una sola recta los bordes casi coincidentes que dan a la vivienda
    y devuelve el area a cada zona moviendo la pared que comparten.

    Conservador: si el resultado no es valido, se solapa o descuadra mas que
    antes, se devuelven las zonas tal cual.
    """
    if len(zonas) < 2:
        return zonas
    borde = huella.boundary
    polys = [z.simplify(0.01) for z in zonas]
    if not all(isinstance(p, Polygon) for p in polys):
        return zonas
    lins = [_lineas(p) for p in polys]
    viv = huella.difference(unary_union(polys))
    areas0 = [p.area for p in polys]
    hecho = False
    for a in range(len(polys)):
        for b in range(a + 1, len(polys)):
            for ia, la in enumerate(lins[a]):
                for ib, lb in enumerate(lins[b]):
                    if abs(la[2] * lb[3] - la[3] * lb[2]) > 0.01:          # no paralelos
                        continue
                    na = (-la[3], la[2])
                    ca, cb = na[0] * la[0] + na[1] * la[1], na[0] * lb[0] + na[1] * lb[1]
                    if not 0.02 < abs(ca - cb) < ALINEAR_M:
                        continue
                    # Los dos tienen que dar a la VIVIENDA, y no a una pared.
                    if any(borde.distance(Point(l[0], l[1])) < 0.05 for l in (la, lb)):
                        continue
                    if not (_da_a(viv, la) and _da_a(viv, lb)):
                        continue
                    # Seguidos: sus tramos se tocan (o casi) a lo largo de la recta.
                    t = lambda p: p[0] * la[2] + p[1] * la[3]            # noqa: E731
                    ia0, ia1 = sorted((t(la[5]), t(la[6])))
                    ib0, ib1 = sorted((t(lb[5]), t(lb[6])))
                    if max(ia0, ib0) - min(ia1, ib1) > 0.5:
                        continue
                    c = (ca * la[4] + cb * lb[4]) / (la[4] + lb[4])
                    for l, cc in ((la, ca), (lb, cb)):
                        d = c - cc
                        l[0] += d * na[0]
                        l[1] += d * na[1]
                    hecho = True
    if not hecho:
        return zonas
    nuevas = [_de_lineas(l) for l in lins]
    if any(n is None for n in nuevas):
        return zonas
    # El AREA vuelve a su sitio moviendo la pared que comparten dos zonas.
    for a in range(len(nuevas)):
        delta = areas0[a] - nuevas[a].area
        if abs(delta) < 0.2:
            continue
        for b in range(len(nuevas)):
            if b == a:
                continue
            for la in lins[a]:
                for lb in lins[b]:
                    if abs(la[2] * lb[3] - la[3] * lb[2]) > 0.01:
                        continue
                    na = (-la[3], la[2])
                    if abs((na[0] * la[0] + na[1] * la[1]) - (na[0] * lb[0] + na[1] * lb[1])) > 0.02:
                        continue
                    # COMPARTIDA de verdad: los dos tramos se solapan a lo largo
                    # (una pared con una zona a cada lado). Dos bordes que solo
                    # siguen la misma recta —el que se acaba de alinear— no lo son.
                    t = lambda q: q[0] * la[2] + q[1] * la[3]            # noqa: E731
                    a0, a1 = sorted((t(la[5]), t(la[6])))
                    b0, b1 = sorted((t(lb[5]), t(lb[6])))
                    if min(a1, b1) - max(a0, b0) < 0.3:
                        continue
                    # Compartida: moverla hacia fuera de A agranda A y encoge B.
                    import copy
                    prueba_a, prueba_b = copy.deepcopy(lins[a]), copy.deepcopy(lins[b])
                    ja = next(i for i, x in enumerate(lins[a]) if x is la)
                    jb = next(i for i, x in enumerate(lins[b]) if x is lb)
                    # Hacia donde va el area: se prueba un paso y se escala. El
                    # signo lo da `delta` (le falta area: crecer; le sobra: encoger).
                    pa = copy.deepcopy(prueba_a)
                    pa[ja][0] += 0.1 * na[0]
                    pa[ja][1] += 0.1 * na[1]
                    g = _de_lineas(pa)
                    if g is None or abs(g.area - nuevas[a].area) < 1e-6:
                        continue
                    paso = 0.1 * delta / (g.area - nuevas[a].area)
                    for lst, j in ((prueba_a, ja), (prueba_b, jb)):
                        lst[j][0] += paso * na[0]
                        lst[j][1] += paso * na[1]
                    ga, gb = _de_lineas(prueba_a), _de_lineas(prueba_b)
                    if ga is not None and gb is not None:
                        lins[a], lins[b] = prueba_a, prueba_b
                        nuevas[a], nuevas[b] = ga, gb
                    break
                else:
                    continue
                break
    # Comprobaciones: validas, dentro, sin solaparse y sin descuadrar mas.
    total = 0.0
    for i, n in enumerate(nuevas):
        n = n.intersection(huella)
        if n.is_empty or not n.is_valid:
            return zonas
        nuevas[i] = n
    for i in range(len(nuevas)):
        for j in range(i + 1, len(nuevas)):
            if nuevas[i].intersection(nuevas[j]).area > 0.2:
                return zonas
    total = sum(abs(n.area - a0) for n, a0 in zip(nuevas, areas0))
    if total > max(1.0, 0.02 * sum(areas0)):
        return zonas
    return nuevas


def marco(huella):
    """Pasa fracciones (u, v) de la huella a coordenadas: u de OESTE a ESTE y v de
    SUR a NORTE, sobre el rectangulo girado minimo que la contiene.

    Es como da el croquis quien no tiene un raton: «el garaje es la franja norte,
    el 60 %» es `[[0,0.4],[1,0.4],[1,1],[0,1]]`.
    """
    r = huella.minimum_rotated_rectangle
    c = list(r.exterior.coords)[:4]
    e0 = (c[1][0] - c[0][0], c[1][1] - c[0][1])
    e1 = (c[2][0] - c[1][0], c[2][1] - c[1][1])
    # El eje que va mas de este a oeste es el de la u.
    eu, ev = (e0, e1) if abs(e0[0]) * math.hypot(*e1) >= abs(e1[0]) * math.hypot(*e0) else (e1, e0)
    if eu[0] < 0:
        eu = (-eu[0], -eu[1])
    if ev[1] < 0:
        ev = (-ev[0], -ev[1])
    cx, cy = r.centroid.x, r.centroid.y
    ox = cx - (eu[0] + ev[0]) / 2
    oy = cy - (eu[1] + ev[1]) / 2
    return lambda u, v: (ox + u * eu[0] + v * ev[0], oy + u * eu[1] + v * ev[1])


def ajustar_nivel(huella, trazos: list[dict], objetivos: dict[str, float],
                  ajustar_area: bool = True) -> tuple[list[dict], list[str]]:
    """Los trazos de UNA planta, ya como zonas.

    `trazos`: [{indice, uso, poligono: Polygon}] · `objetivos`: m2 por uso segun
    Catastro (ya escalados a la huella). Varios trazos del mismo uso se reparten
    su objetivo en proporcion a lo dibujado.
    """
    avisos: list[str] = []
    direcciones = direcciones_de(huella)
    prep = []
    for t in trazos:
        g = _limpia(t["poligono"])
        if g is None:
            avisos.append(f"el trazo {t['indice'] + 1} ({t['uso']}) no encierra superficie")
            continue
        if isinstance(g, MultiPolygon):
            g = max(g.geoms, key=lambda x: x.area)
        reg = regularizar(g, direcciones)
        dentro = _limpia(reg.intersection(huella))
        if dentro is None:
            avisos.append(f"el trazo {t['indice'] + 1} ({t['uso']}) no toca el edificio")
            continue
        prep.append({**t, "reg": reg, "dibujado": dentro.area})

    # El objetivo de cada trazo: el de su uso, repartido entre los del mismo uso.
    por_uso: dict[str, float] = {}
    for t in prep:
        por_uso[t["uso"]] = por_uso.get(t["uso"], 0.0) + t["dibujado"]
    for t in prep:
        total = objetivos.get(t["uso"])
        t["objetivo"] = (total * t["dibujado"] / por_uso[t["uso"]]) if total else None

    # Lo pequeno primero: lo que se dibuja dentro de otra mancha es suyo.
    prep.sort(key=lambda t: (t["objetivo"] if t["objetivo"] else t["dibujado"]))
    ocupado = None
    salida = []
    for t in prep:
        disponible = _limpia(huella.difference(ocupado)) if ocupado is not None else huella
        if disponible is None:
            avisos.append(f"el trazo {t['indice'] + 1} ({t['uso']}) no tiene sitio: lo ocupan los demas")
            continue
        if ajustar_area and t["objetivo"]:
            g, area, cuadra = ajustar(t["reg"], disponible, t["objetivo"])
            de = "ajustado a Catastro"
            if not cuadra:
                avisos.append(
                    f"{t['uso']}: Catastro declara {t['objetivo']:.1f} m2 y en el sitio dibujado "
                    f"solo caben {area:.1f}: revisa el croquis")
        else:
            g = _limpia(t["reg"].intersection(disponible))
            area = g.area if g else 0.0
            de = "dibujado tal cual"
            if ajustar_area and not t["objetivo"]:
                avisos.append(f"Catastro no declara {t['uso']} en esta planta: se usa el croquis "
                              f"tal cual ({area:.1f} m2)")
        g = _abrir(g)
        if g is None:
            continue
        if isinstance(g, MultiPolygon):
            avisos.append(f"{t['uso']}: el ajuste deja trozos sueltos; se queda el mayor")
            g = max(g.geoms, key=lambda x: x.area)
        ocupado = g if ocupado is None else unary_union([ocupado, g])
        salida.append({"indice": t["indice"], "uso": t["uso"], "poligono": g,
                       "area_m2": round(g.area, 2),
                       "objetivo_m2": round(t["objetivo"], 2) if t["objetivo"] else None,
                       "dibujado_m2": round(t["dibujado"], 2), "de": de})
    # Los bordes que dan a la vivienda y casi coinciden son la misma pared.
    if ajustar_area and len(salida) >= 2:
        alineadas = alinear_escalones([z["poligono"] for z in salida], huella)
        for z, g in zip(salida, alineadas):
            if isinstance(g, MultiPolygon):
                g = max(g.geoms, key=lambda x: x.area)
            z["poligono"], z["area_m2"] = g, round(g.area, 2)
    salida.sort(key=lambda z: z["indice"])
    return salida, avisos
