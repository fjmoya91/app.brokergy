# ============================================================================
# puentes.py — QUE PUENTES TERMICOS TIENE ESTE EDIFICIO.
#
# Hasta 2026-09-19 esto vivia dentro de `generar_cex.py` y era una lista fija:
# por cada fachada, un forjado y un pilar en esquina; por cada hueco, su
# contorno. Salia igual en una vivienda de una planta que en un bloque, y
# dejaba FUERA la mitad de los que CE3X trae marcados por defecto —la cubierta,
# la solera, los pilares integrados— porque nadie los calculaba.
#
# Aqui se deciden mirando el edificio, como lo haria un arquitecto: donde dos
# fachadas hacen ESQUINA hay un pilar de esquina; donde la fachada muere contra
# la cubierta hay un encuentro que mide el perimetro de esa planta; un hueco
# con persiana tiene su cajon.
#
# TODO MEDIDO sobre 50 .cex de certificadores (Downloads + Documents/CEX +
# ejemplos), 1.733 puentes. Lo que dice cada regla esta contrastado ahi y se
# puede reproducir con `tests/test_puentes.py`.
#
# REGLA DE ORO — un puente que no se puede MEDIR no se inventa: se avisa y no
# se escribe. Un puente de mas es ahorro que el edificio no tiene, y va firmado.
# ============================================================================
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from errores import GeneracionError  # noqa: E402
from pickle0 import Cadena  # noqa: E402


#: Los OCHO que CE3X ofrece en «Puente termico por defecto», con su psi por
#: defecto. Los siete primeros estaban ya medidos; el del suelo en contacto con
#: el aire faltaba y sale de los 10 casos del corpus, todos con 0.97.
#:
#: El psi es el que CE3X escribe al marcar la casilla: no se toca ninguno sin
#: volver a medirlo, porque es lo que el verificador compara contra su propia
#: copia del programa.
PSI = {
    "Contorno de hueco": 0.55,
    "Caja de Persiana": 1.49,
    "Encuentro de fachada con forjado": 1.58,
    "Pilar en Esquina": 0.78,
    "Pilar integrado en fachada": 1.05,
    "Encuentro de fachada con cubierta": 1.04,
    "Encuentro de fachada con solera": 0.14,
    "Encuentro de fachada con suelo en contacto con el aire": 0.97,
}

#: A QUE CERRAMIENTO cuelga cada uno. No es una convencion nuestra: medido
#: sobre los 1.733 puentes del corpus, sin una sola excepcion.
#:
#: Los dos que se llaman «encuentro de fachada con...» y NO van sobre la
#: fachada son justo los que la app no generaba: el de cubierta cuelga de la
#: CUBIERTA y los del suelo, del SUELO. Colgarlos de una fachada no es un
#: matiz de nomenclatura — CE3X los ensena bajo el cerramiento que dice
#: `cerramientoAsociado`, y ahi el certificador no los encontraria.
SOPORTE = {
    "Contorno de hueco": "FACHADA",
    "Caja de Persiana": "FACHADA",
    "Encuentro de fachada con forjado": "FACHADA",
    "Pilar en Esquina": "FACHADA",
    "Pilar integrado en fachada": "FACHADA",
    "Encuentro de fachada con cubierta": "CUBIERTA",
    "Encuentro de fachada con solera": "SUELO",
    "Encuentro de fachada con suelo en contacto con el aire": "SUELO",
}

#: Cada cuantos metros de fachada hay un pilar, cuando nadie los ha contado.
#:
#: El numero REAL lo cuenta el certificador mirando la fachada, y por eso esto
#: es editable pared por pared. Pero la longitud que escriben los 32 ficheros
#: del corpus que lo llevan es SIEMPRE un numero entero de pilares por la
#: altura de la planta, y sobre sus 215 puentes la separacion mediana sale en
#: 3,5 m — que es ademas la luz habitual entre pilares de una vivienda.
SEPARACION_PILARES_M = 3.5

#: Menos de dos pilares no tiene un pano de fachada: uno en cada extremo. Es lo
#: que hace el corpus incluso en los panos cortos (0,69 m -> 2).
PILARES_MINIMO = 2

#: Cuanto se puede desviar de 180 grados el encuentro de dos fachadas y seguir
#: siendo la MISMA pared, no una esquina. Catastro parte una fachada en varios
#: tramos cuando cambia el vecino de enfrente o el retranqueo, y esos quiebros
#: de un par de grados no son pilares: contarlos poblaria el certificado de
#: esquinas que no existen.
TOLERANCIA_ESQUINA_GRADOS = 15.0

#: Dos extremos a menos de esto son el MISMO punto. Catastro no cierra los
#: anillos al milimetro y dos tramos consecutivos pueden no compartir
#: coordenada exacta.
JUNTA_M = 0.05


def puente(tipo: str, longitud, asociado: str, espacio: str,
           etiqueta: str | None = None) -> list:
    """Un puente termico: nueve campos, como los escribe CE3X.

    Cuidado con los dos nombres, que no siempre son el mismo: el NOMBRE del
    puente se remata con el hueco cuando el puente es de un hueco
    (`PT Contorno de hueco-V1`), pero `cerramientoAsociado` es SIEMPRE el
    cerramiento.
    """
    if tipo not in PSI:
        raise GeneracionError(f"puente termico no contemplado: {tipo!r}")
    # ⚠️ `Cadena` y no `str`: los literales del codigo de CE3X se emiten con
    # `STRING` y no con `UNICODE`. Es lo que hace que el fichero salga como el
    # que guarda el propio programa.
    return [f"PT {tipo}-{etiqueta or asociado}", Cadena("PT"), tipo, PSI[tipo],
            _num(longitud), Cadena("defecto_fi"), Cadena("defecto"),
            asociado, espacio]


# --------------------------------------------------------------------------
# Lo que se mira del edificio
# --------------------------------------------------------------------------

#: Las paredes VERTICALES. Las tres cuentan para el perimetro de una planta:
#: la cubierta se apoya igual sobre una medianera que sobre una fachada, y el
#: encuentro existe en todo su contorno.
VERTICALES = ("FACHADA", "MEDIANERA", "PARTICION_VERTICAL")


def pilares_de(largo) -> int:
    """Cuantos pilares integrados se PROPONEN en un pano de fachada.

    Es una ESTIMACION y sale marcada como tal: el numero real lo cuenta quien
    tiene la fachada delante, y por eso se puede corregir pared por pared.
    Ponerlo a 0 los quita.
    """
    try:
        L = float(largo)
    except (TypeError, ValueError):
        return 0
    if L <= 0:
        return 0
    return max(PILARES_MINIMO, round(L / SEPARACION_PILARES_M))


def extremos(wkt: str | None):
    """Los dos extremos del trazado de una pared, en coordenadas del mundo.

    Solo se miran el PRIMER punto y el ULTIMO: una pared de Catastro es un
    segmento, y lo que hace esquina son sus puntas.
    """
    if not wkt:
        return None
    pares = re.findall(r"(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)", str(wkt))
    if len(pares) < 2:
        return None
    a = (float(pares[0][0]), float(pares[0][1]))
    b = (float(pares[-1][0]), float(pares[-1][1]))
    if math.dist(a, b) < 1e-9:
        return None
    return a, b


def esquinas(paredes) -> list[dict]:
    """Donde el edificio DOBLA: los puntos en que dos fachadas hacen angulo.

    REGLA — una esquina es un HECHO GEOMETRICO, no una fachada. Hasta ahora se
    escribia un «Pilar en Esquina» por cada tramo de fachada, que es lo que
    hacen los certificadores a mano; pero un edificio rectangular tiene cuatro
    esquinas, tenga sus fachadas partidas en cuatro tramos o en trece. Sobre
    26RES060_187 eso son 13 pilares donde el edificio tiene 8.

    REGLA — solo cuentan las fachadas AL AIRE. Un pilar en esquina lo es por
    tener DOS caras al exterior; donde la fachada muere contra la medianera del
    vecino el edificio dobla, pero ese pilar solo tiene una cara fuera y ya lo
    recoge el pilar integrado en fachada.

    Cada esquina se apunta a UNA de las dos fachadas que la forman —la de
    nombre menor, para que el fichero salga igual dos veces seguidas—, porque
    el pilar es uno solo y cargarselo a las dos lo contaria dos veces.
    """
    por_nivel: dict = {}
    for p in paredes:
        if p["clase"] != "FACHADA" or p.get("destino") != "aire":
            continue
        pts = extremos(p.get("wkt"))
        if not pts:
            continue
        por_nivel.setdefault(p.get("nivel"), []).append((p, pts))

    salida = []
    for _, muros in por_nivel.items():
        # Cada punta, con la direccion en que se aleja la pared de ella.
        puntas: dict = {}
        for p, (a, b) in muros:
            for aqui, alla in ((a, b), (b, a)):
                clave = (round(aqui[0] / JUNTA_M), round(aqui[1] / JUNTA_M))
                puntas.setdefault(clave, []).append((p, _direccion(aqui, alla)))
        for _, concurren in puntas.items():
            if len(concurren) < 2:
                continue
            if not _hace_angulo(concurren):
                continue            # la misma pared partida en dos tramos
            duenyo = min((p for p, _ in concurren), key=lambda m: str(m["nombre"]))
            salida.append({"pared": duenyo,
                           "paredes": sorted(str(p["nombre"]) for p, _ in concurren)})
    return salida


def _direccion(desde, hasta):
    dx, dy = hasta[0] - desde[0], hasta[1] - desde[1]
    n = math.hypot(dx, dy) or 1.0
    return dx / n, dy / n


def _hace_angulo(concurren) -> bool:
    """¿Alguna de las paredes que se tocan aqui dobla respecto de otra?"""
    for i in range(len(concurren)):
        for j in range(i + 1, len(concurren)):
            (_, d1), (_, d2) = concurren[i], concurren[j]
            cos = max(-1.0, min(1.0, d1[0] * d2[0] + d1[1] * d2[1]))
            grados = math.degrees(math.acos(cos))
            # Dos paredes que siguen la misma linea se alejan en direcciones
            # OPUESTAS desde el punto que comparten: 180 grados.
            if abs(180.0 - grados) > TOLERANCIA_ESQUINA_GRADOS:
                return True
    return False


def perimetro_del_nivel(paredes, nivel) -> float:
    """Cuanto mide el contorno vertical de una planta.

    Es la longitud del encuentro de la cubierta —o de la solera— con las
    paredes: TODAS las verticales de esa planta, no solo las que dan a la
    calle. Una cubierta se apoya igual sobre la medianera del vecino.

    Medido sobre los 74 encuentros de cubierta y solera del corpus: contra este
    perimetro la mediana es 1,00; contra el de solo las fachadas al aire, 1,19.
    """
    total = 0.0
    for p in paredes:
        if p["clase"] not in VERTICALES or p.get("nivel") != nivel:
            continue
        try:
            total += float(p.get("largo") or 0)
        except (TypeError, ValueError):
            continue
    return round(total, 2)


# --------------------------------------------------------------------------
# El barrido
# --------------------------------------------------------------------------

def construir(paredes, huecos, cfg=None) -> tuple[list[list], list[str]]:
    """Los puentes termicos de este edificio, y lo que hay que contar de ellos.

    `paredes` son los cerramientos ya medidos, cada uno con su `nombre` (el que
    va al `.cex`), `ident` (el de Catastro, que es la clave de todo lo demas),
    `clase`, `destino`, `largo`, `alto`, `espacio` y `nivel`; las verticales,
    ademas, con su `wkt`.

    `huecos` son los ya escritos: `id`, `muro`, `espacio`, `ancho`, `alto` y si
    tiene `persiana`.
    """
    cfg = cfg or {}
    puentes: list[list] = []
    avisos: list[str] = []

    fachadas = [p for p in paredes
                if p["clase"] == "FACHADA" and p.get("destino") == "aire"]

    # --- LO QUE CUELGA DE CADA HUECO ---------------------------------------
    # El contorno existe siempre que haya hueco: es el encuentro de la ventana
    # con la fabrica. El cajon, solo si hay persiana — y hasta hoy no habia
    # forma de decirlo, asi que no salia en ningun .cex de la app pese a que 34
    # de los 50 del corpus lo llevan.
    for h in huecos:
        a, b = float(h["ancho"]), float(h["alto"])
        puentes.append(puente("Contorno de hueco", 2 * (a + b),
                              h["muro"], h["espacio"], etiqueta=h["id"]))
        if h.get("persiana"):
            puentes.append(puente("Caja de Persiana", a,
                                  h["muro"], h["espacio"], etiqueta=h["id"]))

    # --- FACHADA CON FORJADO -----------------------------------------------
    # Uno por pano y por planta, con su largo. Va SIEMPRE, tambien en una
    # vivienda de una sola planta: ahi el forjado es el de la cubierta,
    # apoyando en la fachada. Lo llevan 46 de los 50 .cex del corpus, y CE3X lo
    # trae marcado por defecto.
    for p in fachadas:
        if _pos(p.get("largo")):
            puentes.append(puente("Encuentro de fachada con forjado",
                                  p["largo"], p["nombre"], p["espacio"]))

    # --- PILARES EN ESQUINA -------------------------------------------------
    # REGLA — UNA fila por fachada, con TODAS sus esquinas dentro. Una fachada
    # puede ser duena de las dos suyas, y entonces salian dos puentes con el
    # MISMO nombre (`PT Pilar en Esquina-FBE1 PATIO` dos veces): en el arbol de
    # CE3X son dos entradas identicas que no hay forma de distinguir. Se suman
    # como ya se suman los pilares integrados — la longitud total es la misma.
    esqs = esquinas(paredes)
    if esqs:
        porpared: dict = {}
        for e in esqs:
            p = e["pared"]
            porpared.setdefault(p["nombre"], [p, 0])[1] += 1
        for p, n in porpared.values():
            if _pos(p.get("alto")):
                puentes.append(puente("Pilar en Esquina", n * float(p["alto"]),
                                      p["nombre"], p["espacio"]))
        # Sin aviso: esto SI es una medida —sale del trazado del edificio— y el
        # listado de abajo es «lo que no es una medida». Un aviso que aparece en
        # todos los ficheros y nunca hay que atender es el que ensena a ignorar
        # la lista entera.
    elif fachadas:
        # Sin trazado no se puede saber donde dobla el edificio. Se cae al
        # comportamiento de siempre —uno por pano, que es lo que hacen los
        # certificadores a mano— y se DICE, porque entonces el numero es una
        # aproximacion y no una medida.
        for p in fachadas:
            if _pos(p.get("alto")):
                puentes.append(puente("Pilar en Esquina", p["alto"],
                                      p["nombre"], p["espacio"]))
        avisos.append(
            "Los pilares en esquina salen a uno por pano de fachada: la "
            "geometria no trae el trazado de las paredes y no se puede saber "
            "donde dobla el edificio. Comprueba cuantas esquinas tiene.")

    # --- PILARES INTEGRADOS EN FACHADA -------------------------------------
    # Su numero no lo dice Catastro ni una foto: lo cuenta quien tiene la
    # fachada delante. Se PROPONE uno cada 3,5 m y se puede corregir pared por
    # pared (o poner 0 para quitarlos).
    manual = {str(k): v for k, v in (cfg.get("pilares") or {}).items()}
    estimadas = []
    for p in fachadas:
        if not _pos(p.get("alto")):
            continue
        clave = str(p.get("ident") or p["nombre"])
        propuesto = pilares_de(p.get("largo"))
        if clave in manual:
            n = _entero(manual[clave])
            if n is None:
                avisos.append(f"{clave}: «{manual[clave]}» no es un numero de "
                              f"pilares; se escriben los {propuesto} estimados.")
                n = propuesto
            elif n != propuesto:
                avisos.append(f"{clave}: {n} pilares integrados, contados por el "
                              f"certificador (la estimacion eran {propuesto}).")
        else:
            n = propuesto
            estimadas.append(f"{clave} ({n})")
        if n > 0:
            puentes.append(puente("Pilar integrado en fachada",
                                  n * float(p["alto"]), p["nombre"], p["espacio"]))
    if estimadas:
        # Esto SI hay que decirlo: es un puente que va al certificado y que no
        # ha contado nadie. Nunca ha estado en el .cex de la app, asi que la
        # primera vez que aparezca tiene que venir con su procedencia.
        avisos.append(
            f"Pilares integrados ESTIMADOS (uno cada {SEPARACION_PILARES_M:g} m) "
            f"en {', '.join(estimadas)}. Cuentalos en el panel de cada pared; "
            f"a 0 no se escribe el puente.")

    # --- FACHADA CON CUBIERTA, CON SOLERA Y CON SUELO AL AIRE --------------
    # Cuelgan de la CUBIERTA y del SUELO, no de una fachada: es lo que hacen
    # los 74 encuentros del corpus, sin una excepcion. Su longitud es el
    # contorno vertical de esa planta.
    for p in paredes:
        tipo = _encuentro_horizontal(p)
        if not tipo:
            continue
        largo = perimetro_del_nivel(paredes, p.get("nivel"))
        if not largo:
            avisos.append(
                f"{p['nombre']}: sin su «{tipo.lower()}». No hay ninguna pared "
                f"medida en esa planta, asi que no se sabe cuanto mide el "
                f"encuentro.")
            continue
        puentes.append(puente(tipo, largo, p["nombre"], p["espacio"]))

    # --- LOS ANADIDOS A MANO ------------------------------------------------
    for extra in (cfg.get("puentes_extra") or []):
        puentes.append(puente(extra["tipo"], extra["longitud"],
                              extra["asociado"], extra.get("espacio") or ""))
        avisos.append(f"puente {extra['tipo']} sobre {extra['asociado']}: "
                      f"{extra.get('de', 'anadido a mano en la ficha')}")

    return puentes, avisos


def _encuentro_horizontal(p) -> str | None:
    """Que encuentro le toca a una cubierta o a un suelo, si le toca alguno."""
    if p["clase"] == "CUBIERTA" and p.get("destino") == "aire":
        return "Encuentro de fachada con cubierta"
    if p["clase"] == "SUELO":
        if p.get("destino") == "terreno":
            return "Encuentro de fachada con solera"
        if p.get("destino") == "aire":
            return "Encuentro de fachada con suelo en contacto con el aire"
    return None


def _pos(v) -> bool:
    try:
        return float(v) > 0
    except (TypeError, ValueError):
        return False


def _entero(v):
    try:
        n = int(float(str(v).replace(",", ".")))
    except (TypeError, ValueError):
        return None
    return max(0, n)


def _num(x) -> str:
    """Un numero como lo teclearia el certificador: sin ceros de mas."""
    if x is None or x == "":
        return ""
    f = float(x)
    return f"{f:.2f}".rstrip("0").rstrip(".") if f != int(f) else str(int(f))
