"""Genera un .cex de CE3X con la envolvente ya puesta.

QUE HACE
--------
Coge la geometria que produce el proyecto (`ce3x_geometry.json`), una ficha de
datos del caso (`ce3x_datos.json`: lo que NO sale de la geometria) y una
PLANTILLA .cex del propio certificador, y escribe un .cex que CE3X abre con la
envolvente medida y clasificada dentro.

POR QUE SOBRE UNA PLANTILLA Y NO DESDE UN FICHERO VACIO
-------------------------------------------------------
Un .cex son 15 pickles y aqui solo se saben escribir tres: administrativos (1),
datos generales (2) y envolvente (3). Los otros doce —instalaciones, patrones
de sombra, fechas y un ULTIMO PICKLE que es un HMAC con clave que no sabemos
calcular (ver docs/11)— se copian de la plantilla BYTE A BYTE.

La plantilla es un `.cex` que el certificador guarda desde CE3X con sus datos
de tecnico y nada mas (`ejemplos/CEE VIRGEN.cex`, 947 bytes).

LO QUE ESTE FICHERO NO DECIDE
-----------------------------
Ni una transmitancia, ni una superficie, ni una altura. Todo eso viene dado en
la ficha de datos, con su procedencia escrita. Aqui solo se traduce a la forma
que espera CE3X, que esta medida sobre 1.196 ficheros reales (docs/11).

USO
---
    python tools/generar_cex.py ^
      --geometria  salida/ce3x_geometry.json ^
      --datos      ejemplos/<caso>/ce3x_datos.json ^
      --plantilla  "ejemplos/CEE VIRGEN.cex" ^
      --salida     "salida/<caso>.cex"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import leer_cex as L        # noqa: E402
import pickle0 as P         # noqa: E402
from pickle0 import Cadena  # noqa: E402

# Los indices de los pickles que sabemos escribir. El resto se copia.
ADMINISTRATIVOS = 1
GENERALES = 2
ENVOLVENTE = 3
INSTALACIONES = 4

# El proyecto orienta con N/S/E/O; CE3X escribe los nombres largos. Vocabulario
# medido sobre las 10.000 fachadas del corpus (docs/11).
ORIENTACION = {"N": "Norte", "S": "Sur", "E": "Este", "O": "Oeste",
               "NE": "NE", "NO": "NO", "SE": "SE", "SO": "SO"}

SIN_PATRON = "Sin patrón"


class GeneracionError(Exception):
    """Falta un dato o la plantilla no sirve. No se escribe nada a medias."""


# --------------------------------------------------------------------------
# La ficha de datos: cada valor lleva su procedencia
# --------------------------------------------------------------------------

def _v(dato: Any, donde: str) -> Any:
    """Saca `valor` de una entrada de la ficha, y protesta si esta a null."""
    if isinstance(dato, dict) and "valor" in dato:
        dato = dato["valor"]
    if dato is None:
        raise GeneracionError(f"falta un dato obligatorio: {donde}")
    return dato


def _opcional(dato: Any) -> str:
    """Un dato que puede faltar: se queda vacio, NO se inventa."""
    if isinstance(dato, dict) and "valor" in dato:
        dato = dato["valor"]
    return "" if dato is None else str(dato)


# --------------------------------------------------------------------------
# Los registros de la envolvente (forma medida en docs/11)
# --------------------------------------------------------------------------

def _numf(x: Any):
    """El numero, o None si el campo venia vacio."""
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _num(x: Any) -> str:
    """Un numero como lo teclearia el certificador: sin ceros de mas."""
    if x is None or x == "":
        return ""
    f = float(x)
    return f"{f:.2f}".rstrip("0").rstrip(".") if f != int(f) else str(int(f))


def muro(nombre, superficie, orientacion, largo, alto, espacio, term) -> list:
    """Fachada: 15 campos, acaba en 'aire'."""
    u, masa = term["u"], term["masa"]
    return [nombre, Cadena("Fachada"), _num(superficie), u, masa,
            ORIENTACION[orientacion], "", SIN_PATRON,
            "Conocidas", [True, str(u), str(masa)],
            _num(largo), _num(alto), "1", espacio, Cadena("aire")]


def medianera(nombre, superficie, largo, alto, espacio, term) -> list:
    """Medianera: 13 campos, sin orientacion ni transmitancia, acaba en 'edificio'."""
    return [nombre, Cadena("Fachada"), _num(superficie), term["u"], Cadena(str(term["masa"])),
            "", "", SIN_PATRON,
            _num(largo), _num(alto), "1", espacio, Cadena("edificio")]


def cubierta(nombre, superficie, espacio, term) -> list:
    """Cubierta al aire: 15 campos, campo 5 = 'Techo'."""
    u, masa = term["u"], term["masa"]
    return [nombre, Cadena("Cubierta"), _num(superficie), u, masa,
            Cadena("Techo"), "", SIN_PATRON,
            "Conocidas", [term.get("forma", "Cubierta plana"), True, str(u), str(masa)],
            "", "", "1", espacio, Cadena("aire")]


def suelo_terreno(nombre, superficie, espacio, term) -> list:
    """Suelo contra terreno: 17 campos. Va SIEMPRE 'Por defecto'.

    No es una preferencia: de los 15.704 cerramientos del corpus, ni uno solo
    tiene un suelo contra terreno en modo 'Conocidas'. CE3X modela el terreno
    aparte, y meterle una U a mano seria escribir algo que CE3X no escribe.
    """
    return [nombre, Cadena("Suelo"), _num(superficie), term["u"], term["masa"],
            Cadena("Suelo"), Cadena(""), SIN_PATRON,
            "Por defecto", True, "", [],
            "", "", "1", espacio, Cadena("terreno")]


# --------------------------------------------------------------------------
# Huecos y puentes termicos
# --------------------------------------------------------------------------

# Lo que CE3X deriva del tipo de vidrio y de marco. MEDIDO sobre los 14.494
# huecos del corpus: la correspondencia es univoca, no es una tabla inventada.
VIDRIO = {                       # tipoVidrio -> (Uvidrio, Gvidrio)
    "Simple": (5.7, 0.82),
    "Doble": (3.3, 0.75),
    "Doble bajo emisivo": (2.7, 0.65),
}
MARCO = {                        # tipoMarco -> Umarco
    "Metálico sin RPT": 5.7,
    "Metálico con RPT": 4.0,
    "PVC": 2.2,
    "Madera": 2.2,
}
PERMEABILIDAD = {"Poco estanco": "100", "Estanco": "50"}

# El bloque de proteccion solar cuando no hay ninguna. Es la forma exacta que
# escribe CE3X; no se toca.
_SIN_PROTECCION = ["", "", "", "", "", "", ["", 0, 0], ["", 0, 0], "", False,
                   False, "", False, False, "", "", "", False, False, False,
                   False, False, False, False, ["", ""]]

# Puentes termicos: psi por defecto de CE3X, y de donde sale la longitud.
# Todo MEDIDO sobre los 55.771 puentes del corpus.
PSI = {
    "Contorno de hueco": 0.55,
    "Caja de Persiana": 1.49,
    "Encuentro de fachada con forjado": 1.58,
    "Pilar en Esquina": 0.78,
    "Pilar integrado en fachada": 1.05,
    "Encuentro de fachada con cubierta": 1.04,
    "Encuentro de fachada con solera": 0.14,
}


def hueco(h: dict, cerramiento: list, espacio: str, defecto: dict):
    """Un hueco, como el `INST` que escribe CE3X.

    `cerramientoAsociado` enlaza POR EL NOMBRE del muro, y `orientacion` se
    hereda del muro: no se pide aparte, seria una ocasion de contradecirse.
    """
    ancho = float(_v(h.get("ancho"), f"huecos.{h.get('id')}.ancho"))
    alto = float(_v(h.get("alto"), f"huecos.{h.get('id')}.alto"))
    vidrio = h.get("vidrio", defecto.get("vidrio", "Doble"))
    marco = h.get("marco", defecto.get("marco", "Metálico sin RPT"))
    estanco = h.get("permeabilidad", defecto.get("permeabilidad", "Poco estanco"))
    if vidrio not in VIDRIO:
        raise GeneracionError(f"tipo de vidrio no valido: {vidrio!r}. CE3X usa {list(VIDRIO)}")
    if marco not in MARCO:
        raise GeneracionError(f"tipo de marco no valido: {marco!r}. CE3X usa {list(MARCO)}")
    u_vid, g_vid = VIDRIO[vidrio]

    return P.Instancia("Envolvente.objetosEnvolvente", "HuecoEstimadas", {
        Cadena("__tipo__"): Cadena("HuecoEstimadas"),
        Cadena("descripcion"): str(h["id"]),
        Cadena("tipo"): Cadena(h.get("tipo", "Hueco")),
        Cadena("cerramientoAsociado"): str(cerramiento[0]),
        Cadena("orientacion"): (str(cerramiento[5])
                                if cerramiento[1] == "Fachada" else ""),
        Cadena("subgrupo"): espacio,
        Cadena("longitud"): _num(ancho),
        Cadena("altura"): _num(alto),
        Cadena("superficie"): _num(round(ancho * alto, 2)),
        Cadena("multiplicador"): str(h.get("mult", 1)),
        Cadena("tipoVidrio"): vidrio,
        Cadena("tipoMarco"): marco,
        Cadena("porcMarco"): str(h.get("porc_marco", defecto.get("porc_marco", "20"))),
        Cadena("Uvidrio"): u_vid,
        Cadena("Gvidrio"): g_vid,
        Cadena("Umarco"): MARCO[marco],
        Cadena("permeabilidadChoice"): estanco,
        Cadena("permeabilidadValor"): PERMEABILIDAD[estanco],
        Cadena("absortividadValor"): str(h.get("absortividad", "0.75")),
        Cadena("absortividadPosiciones"): [0, 1],
        Cadena("patronSombras"): SIN_PATRON,
        Cadena("dobleVentana"): False,
        Cadena("tieneProteccionSolar"): False,
        Cadena("elementosProteccionSolar"): _SIN_PROTECCION,
        Cadena("correctorFSCTE"): 1.0,
        Cadena("correctorFSInvierno"): 1.0,
        Cadena("correctorFSVerano"): 1.0,
    })


def puente(tipo: str, longitud, asociado: str, espacio: str,
           etiqueta: str | None = None) -> list:
    """Un puente termico: nueve campos.

    Cuidado con los dos nombres, que no siempre son el mismo: el NOMBRE del
    puente se remata con el hueco cuando el puente es de un hueco
    (`PT Contorno de hueco-V1`), pero `cerramientoAsociado` es SIEMPRE el muro.
    """
    if tipo not in PSI:
        raise GeneracionError(f"puente termico no contemplado: {tipo!r}")
    return [f"PT {tipo}-{etiqueta or asociado}", Cadena("PT"), tipo, PSI[tipo],
            _num(longitud), Cadena("defecto_fi"), Cadena("defecto"),
            asociado, espacio]


def particion(nombre, superficie, sentido, espacio, term,
              largo="", alto="") -> list:
    """Particion con espacio no habitable: 15 campos.

    El tipo de espacio (campo 5) y el sentido (campo -1) van EMPAREJADOS, y no
    de cualquier manera: 'Local en superficie', 'Camara Sanitaria' y
    'Garaje/espacio enterrado' solo salen con 'horizontal inferior'; hacia
    arriba CE3X solo usa 'Espacio bajo cubierta inclinada' y 'Otro'.
    """
    u, masa = term["u"], term["masa"]
    tipo = term.get("tipo_espacio", "")
    return [nombre, "Partición Interior", _num(superficie), u, masa,
            tipo, "", SIN_PATRON,
            "Conocidas", [str(u)],
            _num(largo), _num(alto), "", espacio, Cadena(sentido)]


# --------------------------------------------------------------------------
# Instalaciones (pickle 4)
# --------------------------------------------------------------------------

# El pickle 4 son 12 huecos, uno por tipo de equipo. Medido sobre el corpus.
SLOTS = ["ACS", "calefaccion", "refrigeracion", "climatizacion", "mixto2",
         "mixto3", "renovable", "iluminacion", "ventilacion", "ventiladores",
         "bombas", ""]

# CE3X no guarda el rendimiento estacional que calcula: lo CALCULA. Pero la
# cuenta se puede medir, y sale limpia: para una caldera estandar con carga
# media 0,2, el estacional es el de combustion MENOS una constante que solo
# depende del aislamiento de la caldera.
#
#   aislamiento                     n     mediana   (min..max)
#   Sin aislamiento                202     35,1     31,7..36,2
#   Antigua con mal aislamiento    139     28,2     17,0..29,3
#   Antigua con aislamiento medio   61     24,0     22,7..24,6
#   Bien aislada y mantenida        35     12,8     11,9..12,8
#
# La dispersion que queda la mete la potencia. Por eso el numero que escribimos
# es una APROXIMACION del que CE3X pondra, y hay que decirlo: en cuanto el
# certificador toque el equipo, CE3X lo recalcula y manda el suyo.
K_ESTACIONAL = {
    "Sin aislamiento": 35.1,
    "Antigua con mal aislamiento": 28.2,
    "Antigua con aislamiento medio": 24.0,
    "Bien aislada y mantenida": 12.8,
}

# Los dos bloques de interruptores del equipo. Forma exacta que escribe CE3X
# (466 de 620 equipos mixtos del corpus); no se tocan.
_INTERRUPTORES = [False, False, True, False, False, True, False]
_COLA_PARAMETROS = [1.0, 0.0]


def equipo_mixto(eq: dict, espacio: str) -> tuple[list, list[str]]:
    """Un equipo mixto de calefaccion y ACS (el slot 'mixto2')."""
    avisos: list[str] = []
    aisl = _v(eq.get("aislamiento"), "instalaciones.aislamiento")
    if aisl not in K_ESTACIONAL:
        raise GeneracionError(f"aislamiento de caldera no valido: {aisl!r}. "
                              f"CE3X usa {list(K_ESTACIONAL)}")
    rend_comb = float(_v(eq.get("rend_combustion"), "instalaciones.rend_combustion"))
    estacional = round(rend_comb - K_ESTACIONAL[aisl], 1)
    avisos.append(
        f"instalacion {eq['nombre']}: el rendimiento estacional {estacional} % NO es "
        f"un dato, es lo que CALCULA CE3X. Aqui va aproximado ({rend_comb} de "
        f"combustion menos {K_ESTACIONAL[aisl]}, medido en el corpus). Abre "
        f"Instalaciones y dale a Modificar para que CE3X ponga el suyo.")

    sup_acs = _num(_v(eq.get("superficie_acs"), "instalaciones.superficie_acs"))
    sup_cal = _num(_v(eq.get("superficie_calefaccion"), "instalaciones.superficie_calefaccion"))
    acum = eq.get("acumulacion")
    if acum:
        bloque_acum = [True, str(acum["volumen"]), str(acum.get("t_alta", "80")),
                       str(acum.get("t_baja", "60")), str(acum.get("ua", "4.7")),
                       "Por defecto", str(acum.get("mult", "1"))]
    else:
        bloque_acum = [False]

    return [
        str(eq["nombre"]),
        Cadena("mixto2"),
        [estacional, estacional, ""],
        str(_v(eq.get("generador"), "instalaciones.generador")),
        str(_v(eq.get("combustible"), "instalaciones.combustible")),
        [[sup_acs, "100"], [sup_cal, "100"], ["", ""]],
        "Estimado según Instalación",
        [aisl, str(rend_comb).rstrip("0").rstrip("."),
         str(eq.get("carga_media", "0.2")),
         str(_v(eq.get("potencia"), "instalaciones.potencia")),
         list(_INTERRUPTORES), list(_COLA_PARAMETROS)],
        bloque_acum,
        espacio,
    ], avisos


def construir_instalaciones(datos: dict, plantilla: list,
                            zonas: set[str] | None = None) -> tuple[list, list[str]]:
    """Los 12 slots del pickle 4. Lo que no se sepa se queda vacio.

    OJO con la zona del equipo: es el mismo campo traicionero que en los
    cerramientos. Si apunta a una zona que no existe, **CE3X abre el fichero y
    la caldera no aparece**, sin decir nada. Paso el 2026-09-11 con la Domusa de
    Los Yebenes: se le escribio la cadena "auto" tal cual.
    """
    slots: list[list] = [[] for _ in SLOTS]
    if isinstance(plantilla, list) and len(plantilla) == len(SLOTS):
        slots = [list(x) if isinstance(x, list) else [] for x in plantilla]
    avisos: list[str] = []
    espacio = datos["envolvente"]["espacio"]
    if str(espacio).lower() == "auto":
        # los equipos van a la raiz: 604 de los 620 equipos mixtos del corpus
        espacio = "Edificio Objeto"
    for eq in datos.get("instalaciones", []):
        tipo = eq.get("slot", "mixto2")
        if tipo not in SLOTS:
            raise GeneracionError(f"tipo de equipo no contemplado: {tipo!r}")
        if tipo != "mixto2":
            raise GeneracionError(
                f"de momento solo se sabe escribir 'mixto2' (calefaccion+ACS); "
                f"pediste {tipo!r}")
        zona = eq.get("zona", espacio)
        declaradas = (zonas or set()) | {"Edificio Objeto"}
        if zona not in declaradas:
            raise GeneracionError(
                f"el equipo {eq.get('nombre')!r} dice estar en la zona {zona!r}, "
                f"que no existe. Declaradas: {sorted(declaradas)}. CE3X abriria "
                f"el fichero y la instalacion NO apareceria.")
        registro, av = equipo_mixto(eq, zona)
        slots[SLOTS.index(tipo)].append(registro)
        avisos.extend(av)
        if eq.get("de"):
            avisos.append(f"instalacion {eq['nombre']}: {eq['de']}")
    return slots, avisos


# --------------------------------------------------------------------------
# De la geometria del proyecto a la envolvente de CE3X
# --------------------------------------------------------------------------

def nombre_zona(nivel: int | None) -> str:
    """Como se llama cada planta en el arbol de CE3X."""
    if nivel is None:
        return "Edificio Objeto"
    if nivel == 0:
        return "PLANTA BAJA"
    return f"SOTANO {abs(nivel)}" if nivel < 0 else f"PLANTA {nivel}"


def zonas_por_planta(geo: dict) -> list[dict]:
    """Una zona por planta HABITABLE, con la superficie CONSTRUIDA de Catastro.

    El arbol de CE3X se separa por plantas, y la superficie de cada zona es la
    construida que declara Catastro para esa planta — no la de la huella
    geometrica: son el dato del certificador y el que cuadra con la ficha.
    """
    por_nivel: dict[int, float] = {}
    for s in geo.get("modelo", {}).get("spaces", []):
        if not (s.get("attrs") or {}).get("habitable"):
            continue
        nivel = s.get("floor")
        if nivel is None:
            continue
        por_nivel[nivel] = por_nivel.get(nivel, 0.0) + float(s.get("area") or 0)
    return [{"nombre": nombre_zona(n), "superficie": round(a, 2), "nivel": n}
            for n, a in sorted(por_nivel.items())]


def _superficie(entrada: Any, medida: float) -> float:
    """La que diga la ficha; si no dice nada, LA MEDIDA.

    Antes se aplicaba el valor de la ficha a todos los cerramientos del mismo
    tipo, y con dos cubiertas de distinta superficie se escribia la misma dos
    veces. La medida manda salvo que se la sobreescriba a proposito.
    """
    if isinstance(entrada, dict):
        entrada = entrada.get("superficie")
    v = _numf(entrada)
    return medida if v is None else v


def construir_envolvente(geo: dict, datos: dict) -> tuple[list, list[str]]:
    """Devuelve (pickle 3, avisos)."""
    cfg = datos["envolvente"]
    term = datos["termicas"]

    # "auto": una zona por planta habitable, con la superficie construida de
    # Catastro. Cada cerramiento cae en la zona de SU planta.
    auto = str(cfg.get("espacio", "")).lower() == "auto"
    zonas_auto = zonas_por_planta(geo) if auto else []
    por_nivel = {z["nivel"]: z["nombre"] for z in zonas_auto}
    espacio = "Edificio Objeto" if auto else cfg["espacio"]

    # medianeras que el certificador ha marcado como particion vertical
    como_particion = set(cfg.get("medianeras_como_particion", []))
    plantas = set(cfg["incluir_plantas"])
    excluidos = set(cfg["excluir_ids"]["ids"])
    avisos: list[str] = []

    def medida(el: dict, campo: str):
        """Cada medida viene envuelta con su procedencia; aqui solo el numero."""
        v = el.get(campo)
        return v.get("value") if isinstance(v, dict) else v

    cerramientos: list[list] = []
    for el in geo["elementos"]:
        ident, tipo, planta = el["id"], el["tipo"], el["planta"]
        if ident in excluidos or planta not in plantas:
            continue
        sup_medida = medida(el, "superficie")
        zona = por_nivel.get(el.get("nivel"), espacio) if auto else espacio

        if tipo == "FACHADA":
            cerramientos.append(muro(
                f"{ident} {el['subtipo']}", sup_medida, el["orientacion"],
                medida(el, "largo"), medida(el, "alto"), zona, term["fachada"]))
        elif tipo == "MEDIANERA":
            # Una medianera es adiabatica SOLO si al otro lado hay vivienda. Si
            # el certificador sabe que hay un garaje, deja de serlo y pasa a ser
            # una particion vertical con su U: por ahi si se pierde calor.
            if ident in como_particion:
                cerramientos.append(particion(
                    f"{ident} PARTICION CON EL VECINO", sup_medida, "vertical",
                    zona, term["particion_vertical"],
                    largo=medida(el, "largo"), alto=medida(el, "alto")))
                avisos.append(
                    f"{ident}: escrito como PARTICION VERTICAL, no como medianera "
                    f"(el certificador dice que al otro lado hay un espacio no "
                    f"habitable). Deja de ser adiabatico.")
            else:
                cerramientos.append(medianera(
                    f"{ident} MEDIANERA", sup_medida,
                    medida(el, "largo"), medida(el, "alto"), zona, term["medianera"]))
        elif tipo == "SUELO":
            sup = _superficie(cfg.get("suelo"), sup_medida)
            if abs(sup - sup_medida) > 0.01:
                avisos.append(
                    f"{ident}: se escribe {sup} m2 (decision del certificador) y la "
                    f"geometria mide {sup_medida} m2")
            cerramientos.append(suelo_terreno(
                f"{ident} SUELO EN TERRENO", sup, zona, term["suelo_terreno"]))
        elif tipo == "CUBIERTA":
            sup = _superficie(cfg.get("cubierta"), sup_medida)
            if abs(sup - sup_medida) > 0.01:
                avisos.append(
                    f"{ident}: se escribe {sup} m2 (derivado de la superficie de "
                    f"vivienda) y la geometria mide {sup_medida} m2")
            cerramientos.append(cubierta(
                f"{ident} CUBIERTA", sup, zona, term["cubierta"]))
        elif tipo == "PARTICION_INTERIOR_HORIZONTAL":
            sup = _superficie(cfg.get("particion_superior"), sup_medida)
            cerramientos.append(particion(
                f"{ident} PARTICION", sup, term["particion_superior"].get(
                    "sentido", "horizontal superior"),
                zona, term["particion_superior"]))
        else:
            avisos.append(f"{ident}: tipo {tipo} no contemplado, NO se escribe")

    # La particion vertical con el almacen de PB no sale de la geometria: no hay
    # poligono para ese uso. Va aparte y con el aviso puesto.
    pv = cfg.get("particion_vertical_almacen_pb")
    if pv:
        cerramientos.append(particion(
            "PV01 PARTICION CON ALMACEN PB (ESTIMADA - MEDIR EN VISITA)",
            _v(pv["superficie"], "particion_vertical.superficie"), "vertical",
            espacio, term["particion_vertical"],
            largo=pv.get("largo", ""), alto=pv.get("alto", "")))
        avisos.append(f"PV01: superficie ESTIMADA, no medida. {pv['de']}")

    # --- LAS ZONAS ---------------------------------------------------------
    # El arbol de CE3X es raiz -> zona -> cerramientos. Un cerramiento que
    # apunte a una zona que no existe NO SE VE: el fichero abre y la envolvente
    # sale vacia. Paso por ahi el 2026-09-10.
    declaradas_cfg = zonas_auto if auto else cfg.get("zonas", [])
    zonas = [
        P.Instancia("ventanaSubgrupo", "claseZona", {
            Cadena("nombre"): z["nombre"],
            Cadena("raiz"): z.get("raiz", "Edificio Objeto"),
            Cadena("tipo"): z.get("tipo", "Subgrupo"),
            Cadena("superficie"): str(z["superficie"]),
        })
        for z in declaradas_cfg
    ]

    declaradas = {z["nombre"] for z in declaradas_cfg} | {"Edificio Objeto"}

    def _sin_zona(que, usadas):
        """Nada puede colgar de una zona que no esta declarada.

        Es el fallo mas caro del formato y el mas silencioso: CE3X abre el
        fichero tan contento y sencillamente NO ENSENA lo que cuelga de una
        zona que no existe. Se comprueba por separado para cerramientos,
        huecos y puentes, porque cada uno se ha colado por su lado."""
        huerfanas = usadas - declaradas
        if huerfanas:
            raise GeneracionError(
                f"estos {que} apuntan a zonas que no existen: {sorted(huerfanas)}. "
                f"Declaradas: {sorted(declaradas)}. CE3X no los ensenaria. "
                f"Declara la zona en envolvente.zonas o usa 'Edificio Objeto'.")

    _sin_zona("cerramientos", {str(c[-2]) for c in cerramientos})

    # --- LOS HUECOS --------------------------------------------------------
    por_nombre = {str(c[0]): c for c in cerramientos}
    # El nombre del cerramiento lleva pegado a que da ("FBSO1 CALLE"), pero
    # quien senala el hueco solo conoce el identificador ("FBSO1"). Se admite,
    # porque el identificador YA es unico; si algun dia dejara de serlo, se
    # dice en vez de elegir por el certificador.
    por_id = {}
    for c in cerramientos:
        por_id.setdefault(str(c[0]).split(" ")[0], []).append(c)

    def _soporte(clave):
        if clave in por_nombre:
            return por_nombre[clave]
        iguales = por_id.get(str(clave), [])
        if len(iguales) == 1:
            return iguales[0]
        if len(iguales) > 1:
            raise GeneracionError(
                f"{clave!r} no dice cual: hay {len(iguales)} cerramientos que "
                f"empiezan asi ({[str(c[0]) for c in iguales]}).")
        return None
    huecos = []
    defecto = cfg.get("huecos_defecto", {})
    # El nombre del hueco es lo que CE3X ensena en el arbol Y lo que usa el
    # puente termico para decir de que hueco es. Si se repite, el certificador
    # no puede saber cual es cual.
    vistos, entrada_huecos = set(), []
    for h in cfg.get("huecos", []):
        nombre = str(h.get("id") or h.get("nombre") or "")
        if not nombre:
            raise GeneracionError(
                f"hay un hueco sin nombre en {h.get('cerramiento')!r}. El nombre "
                f"es lo que se ve en CE3X: no puede ir en blanco.")
        if nombre in vistos:
            raise GeneracionError(
                f"el nombre de hueco {nombre!r} esta repetido. CE3X enlaza los "
                f"puentes termicos por el nombre: tiene que ser unico.")
        vistos.add(nombre)
        h = dict(h, id=nombre)
        entrada_huecos.append(h)
        soporte = _soporte(h.get("cerramiento"))
        if soporte is None:
            raise GeneracionError(
                f"el hueco {h.get('id')!r} dice ir en {h.get('cerramiento')!r}, "
                f"que no es ninguno de los cerramientos escritos. Hay: "
                f"{sorted(por_nombre)}")
        if str(soporte[-1]) not in ("aire", "terreno"):
            raise GeneracionError(
                f"el hueco {h.get('id')!r} esta en {soporte[0]!r}, que da a "
                f"{soporte[-1]!r}. Un hueco solo va en un cerramiento al exterior.")
        huecos.append(hueco(h, soporte, str(soporte[-2]), defecto))
        if h.get("de"):
            avisos.append(f"hueco {h['id']}: {h['de']}")

    # --- LOS PUENTES TERMICOS ---------------------------------------------
    # Solo se generan los que salen de una MEDIDA, con la regla que usa CE3X
    # (medida sobre los 55.771 puentes del corpus). Los pilares integrados en
    # fachada NO: su numero no lo dice ni Catastro ni una foto, lo cuenta el
    # certificador, asi que se piden en la ficha o no van.
    puentes = []
    for h, inst in zip(entrada_huecos, huecos):
        a = float(inst.estado[Cadena("longitud")])
        b = float(inst.estado[Cadena("altura")])
        muro_h = str(inst.estado[Cadena("cerramientoAsociado")])
        zona_h = str(inst.estado[Cadena("subgrupo")])
        puentes.append(puente("Contorno de hueco", 2 * (a + b), muro_h, zona_h,
                              etiqueta=h["id"]))
        if h.get("persiana", defecto.get("persiana", False)):
            puentes.append(puente("Caja de Persiana", a, muro_h, zona_h,
                                  etiqueta=h["id"]))

    for c in cerramientos:
        if str(c[1]) != "Fachada" or str(c[-1]) != "aire":
            continue
        largo, alto = _numf(c[-5]), _numf(c[-4])
        if largo:
            puentes.append(puente("Encuentro de fachada con forjado", largo,
                                  str(c[0]), str(c[-2])))
        if alto:
            puentes.append(puente("Pilar en Esquina", alto, str(c[0]), str(c[-2])))

    for extra in cfg.get("puentes_extra", []):
        soporte_pt = _soporte(extra["asociado"])
        puentes.append(puente(extra["tipo"], extra["longitud"],
                              str(soporte_pt[0]) if soporte_pt else extra["asociado"],
                              str(soporte_pt[-2]) if soporte_pt else espacio))
        avisos.append(f"puente {extra['tipo']} sobre {extra['asociado']}: "
                      f"{extra.get('de', 'anadido a mano en la ficha')}")

    _sin_zona("huecos", {str(h.estado[Cadena("subgrupo")]) for h in huecos})
    _sin_zona("puentes termicos", {str(p[-1]) for p in puentes})

    if cerramientos and not huecos:
        avisos.append("SIN HUECOS: el .cex sale con la envolvente opaca y ninguna "
                      "ventana. Los 1.192 .cex reales con envolvente llevan huecos.")

    return [cerramientos, huecos, puentes, zonas], avisos


# CE3X guarda las dos imagenes del pickle 2 como PNG en base64, y SIEMPRE
# escaladas a 134 px de alto (el ancho sale de la proporcion). Medido sobre
# 1.186 de los 1.188 ficheros del corpus: no hay ni una excepcion.
ALTO_IMAGEN = 134

# Lo que haya ido mal con las imagenes, para contarlo al final.
AVISOS_IMAGEN: list[str] = []


#: Como empiezan los ficheros de imagen. Se mira esto y no la longitud del
#: texto: una ruta de disco jamas decodifica a algo que empiece asi, y una
#: imagen corta seguiria siendo una imagen. En hex para que el fuente no
#: lleve escapes que alguien pueda romper al editarlo.
_FIRMAS = tuple(bytes.fromhex(h) for h in (
    "89504e470d0a",   # PNG
    "ffd8ff",         # JPEG
    "47494638",       # GIF
    "424d",           # BMP
    "52494646",       # RIFF (WebP)
    "49492a00",       # TIFF little endian
    "4d4d002a",       # TIFF big endian
))


def _bytes_de_imagen(valor: Any):
    """Los bytes si `valor` los trae dentro; `None` si es una ruta.

    Se acepta `data:image/jpeg;base64,...` y el base64 pelado. Se distingue
    por el CONTENIDO —lo decodificado tiene que empezar como una imagen—, no
    por la pinta del texto: adivinar por la longitud fallaba con las fotos
    pequenas.
    """
    import base64
    import io as _io

    if isinstance(valor, (bytes, bytearray)):
        return _io.BytesIO(bytes(valor))
    if not isinstance(valor, str):
        return None
    texto = valor.strip()
    if texto.startswith("data:"):
        _, _, texto = texto.partition(",")
        texto = texto.strip()
    try:
        crudo = base64.b64decode(texto, validate=True)
    except Exception:                    # noqa: BLE001
        return None
    if not crudo.startswith(_FIRMAS):
        return None
    return _io.BytesIO(crudo)


def imagen(ruta: Any) -> str:
    """Prepara una imagen para el pickle 2: PNG de 134 px de alto, en base64.

    Admite una RUTA en disco o los BYTES en base64 (con o sin `data:` delante).
    Lo segundo es lo que usa el servicio: la foto vive en Drive, no en el disco
    del contenedor, asi que quien llama manda el contenido, no donde esta.
    """
    if isinstance(ruta, dict):
        ruta = ruta.get("valor")
    if not ruta:
        return ""
    try:
        from PIL import Image
    except ImportError as exc:                      # pragma: no cover
        raise GeneracionError(
            "hace falta Pillow para meter imagenes: pip install Pillow") from exc

    import base64
    import io as _io

    fuente: Any = _bytes_de_imagen(ruta)
    if fuente is None:
        p = Path(ruta)
        if not p.is_file():
            raise GeneracionError(f"no existe la imagen {p}")
        fuente = p

    im = Image.open(fuente)
    try:
        im.load()
    except OSError as exc:
        # Pasa con fotos bajadas a medias. Se aprovecha lo que hay —CE3X solo
        # guarda una miniatura— pero se DICE, que si no el certificador se
        # encuentra media foto gris sin saber por que.
        from PIL import ImageFile
        ImageFile.LOAD_TRUNCATED_IMAGES = True
        try:
            if hasattr(fuente, "seek"):
                fuente.seek(0)
            im = Image.open(fuente)
            im.load()
        finally:
            ImageFile.LOAD_TRUNCATED_IMAGES = False
        AVISOS_IMAGEN.append(f"{p.name}: el fichero esta INCOMPLETO ({exc}). "
                             f"Se usa lo que se ha podido leer.")
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    ancho = max(1, round(im.width * ALTO_IMAGEN / im.height))
    im = im.resize((ancho, ALTO_IMAGEN), Image.LANCZOS)
    buf = _io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def construir_generales(datos: dict, plantilla: list) -> list:
    """Los 21 campos del pickle 2, sobre lo que ya trajera la plantilla."""
    g = datos["generales"]
    out = list(plantilla) if len(plantilla) == 21 else [""] * 21
    out[0] = _v(g["normativa"], "generales.normativa")
    out[1] = _v(g["tipo_edificio"], "generales.tipo_edificio")
    out[2] = _v(datos["administrativos"]["provincia"], "administrativos.provincia")
    out[3] = _v(datos["administrativos"]["localidad_lista"], "administrativos.localidad_lista")
    out[4] = _v(g["zona_climatica_he1"], "generales.zona_climatica_he1")
    out[5] = _v(g["zona_climatica_he4"], "generales.zona_climatica_he4")
    out[6] = str(_v(g["superficie_util_habitable"], "generales.superficie_util_habitable"))
    out[7] = str(_v(g["altura_libre_planta"], "generales.altura_libre_planta"))
    out[8] = str(_v(g["n_plantas_habitables"], "generales.n_plantas_habitables"))
    out[9] = str(_v(g["demanda_acs"], "generales.demanda_acs"))
    out[10] = _v(g["masa_particiones"], "generales.masa_particiones")
    out[11] = False
    out[12] = _opcional(datos["administrativos"]["localidad_texto"])
    out[13] = [False, "", ""]
    out[14] = False
    out[15] = "Y"
    out[16] = str(_v(g["ventilacion"], "generales.ventilacion"))
    out[17] = imagen(g.get("foto_edificio"))      # foto de fachada
    out[18] = imagen(g.get("plano_situacion"))    # plano/croquis de Catastro
    out[19] = str(_v(g["ano_construccion"], "generales.ano_construccion"))
    out[20] = ""
    return out


#: Los campos del pickle 1 que son del TECNICO que firma, y no del edificio.
#: Su sitio natural es la ficha del certificador, no la plantilla: una
#: plantilla con estos campos rellenos lleva dentro el DNI y el telefono de una
#: persona, y eso no puede vivir en un repositorio ni en una imagen Docker.
CAMPOS_TECNICO = {
    "empresa": 10, "nombre": 11, "telefono": 12, "email": 13,
    "nif": 19, "cif_empresa": 20, "direccion": 21, "provincia": 22,
    "municipio": 23, "codigo_postal": 24, "titulacion": 25,
}


def construir_administrativos(datos: dict, plantilla: list) -> list:
    """Los 26 campos del pickle 1.

    El bloque del TECNICO (quien firma) se toma de `datos["tecnico"]` si viene;
    si no, se deja lo que traiga la plantilla. Asi el mismo motor sirve a varios
    certificadores y la plantilla puede ir en blanco.
    """
    a = datos["administrativos"]
    out = list(plantilla) if len(plantilla) == 26 else [""] * 26

    tecnico = datos.get("tecnico") or {}
    for clave, i in CAMPOS_TECNICO.items():
        if clave in tecnico:
            out[i] = _opcional(tecnico[clave])

    out[0] = _v(a["nombre_edificio"], "administrativos.nombre_edificio")
    out[1] = _v(a["direccion"], "administrativos.direccion")
    out[2] = _v(a["localidad_lista"], "administrativos.localidad_lista")
    out[3] = _v(a["provincia"], "administrativos.provincia")
    out[4] = _opcional(a["localidad_texto"])
    out[5] = _opcional(a["cliente_nombre"])
    out[7] = _opcional(a["cliente_direccion"])
    out[8] = _opcional(a["cliente_telefono"])
    out[9] = _opcional(a["cliente_email"])
    out[14] = _opcional(a["codigo_postal"])
    out[15] = [_v(a["referencia_catastral"], "administrativos.referencia_catastral")]
    out[16] = _opcional(a["cliente_localidad"])
    out[17] = _opcional(a["cliente_provincia"])
    out[18] = _opcional(a["cliente_cp"])
    # Los del tecnico ya se han puesto arriba, o se han dejado como estaban.
    return out


# --------------------------------------------------------------------------
# Montaje
# --------------------------------------------------------------------------

def montar(plantilla: Path, nuevos: dict[int, Any]) -> bytes:
    """Sustituye los pickles indicados y copia los demas byte a byte."""
    cex = L.trocear(plantilla)
    if not cex.version_conocida:
        raise GeneracionError(
            f"la plantilla dice ser {cex.version!r}, que no es una version probada")
    data: bytes = cex._data  # type: ignore[attr-defined]

    trozos: list[bytes] = []
    for p in cex.pickles:
        if p.indice in nuevos:
            trozos.append(P.volcar(nuevos[p.indice]).encode("raw_unicode_escape"))
        else:
            trozos.append(data[p.offset:p.offset + p.tam])
    return b"".join(trozos).replace(L.LF, L.CRLF)


# --------------------------------------------------------------------------
# Contraste contra lo que hacen los certificadores de verdad
# --------------------------------------------------------------------------

# Percentiles medidos sobre **327 unifamiliares con referencia catastral unica**
# sacadas del corpus de .cex (cada fichero lleva su RC en el pickle 1, campo 15).
# No es una norma: es lo que sale cuando un humano modela una vivienda como
# estas. Salirse no significa estar mal — significa que hay que mirarlo.
BANDAS = {
    "hueco / fachada": (0.096, 0.169, 0.320,
                        "pocos huecos o demasiado pequenos"),
    "hueco / superficie util": (0.0899, 0.1503, 0.2643,
                                "pocos huecos o demasiado pequenos"),
    "envolvente / superficie util": (1.747, 2.401, 3.136,
                                     "la envolvente no cuadra con la superficie"),
    "numero de huecos": (7, 11, 17, "faltan huecos por meter"),
}


def contrastar(envolvente: list, superficie_util: float | None) -> list[str]:
    """Compara lo generado con esas 327 viviendas y dice donde se sale.

    Es el contrapeso de todo lo demas: el fichero puede estar perfectamente
    formado y aun asi describir una casa que no se parece a ninguna.
    """
    cerr, huecos = envolvente[0], envolvente[1]
    fachada = sum(_numf(c[2]) or 0 for c in cerr
                  if str(c[1]) == "Fachada" and str(c[-1]) != "edificio")
    opaca = sum(_numf(c[2]) or 0 for c in cerr
                if str(c[1]) in ("Fachada", "Cubierta", "Suelo"))
    hueco = sum((_numf(h.estado[Cadena("superficie")]) or 0)
                * (_numf(h.estado[Cadena("multiplicador")]) or 1)
                for h in huecos)

    medidos = {"numero de huecos": float(len(huecos))}
    if fachada:
        medidos["hueco / fachada"] = hueco / fachada
    if superficie_util:
        medidos["hueco / superficie util"] = hueco / superficie_util
        medidos["envolvente / superficie util"] = opaca / superficie_util

    avisos = []
    for nombre, valor in medidos.items():
        p10, p50, p90, pista = BANDAS[nombre]
        if valor < p10:
            avisos.append(
                f"{nombre} = {valor:.3f}, POR DEBAJO del p10 ({p10}) de 327 "
                f"unifamiliares reales (mediana {p50}): {pista}.")
        elif valor > p90:
            avisos.append(
                f"{nombre} = {valor:.3f}, POR ENCIMA del p90 ({p90}) de 327 "
                f"unifamiliares reales (mediana {p50}).")
    return avisos


def _comparable(x: Any) -> Any:
    """Deja un dato en una forma que se pueda comparar antes y despues.

    Lo que se escribe como `pickle0.Instancia` vuelve del lector como
    `leer_cex.Opaco`: son la misma cosa vista de ida y de vuelta, y hay que
    compararlas por clase y estado, no por tipo de Python.
    """
    if isinstance(x, P.Instancia):
        return (f"{x.modulo}.{x.clase}", _comparable(x.estado))
    if isinstance(x, L.Opaco):
        return (x.clase, _comparable(x.estado))
    if isinstance(x, dict):
        return {str(k): _comparable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_comparable(v) for v in x]
    if isinstance(x, str):
        return str(x)
    return x


def comprobar(salida: Path, esperado: dict[int, Any]) -> list[str]:
    """Relee lo escrito y comprueba que dice lo que se queria decir."""
    cex = L.trocear(salida)
    problemas = []
    if len(cex.pickles) != 15:
        problemas.append(f"han salido {len(cex.pickles)} pickles y CE3X espera 15")
    for i, valor in esperado.items():
        if _comparable(L.leer(cex, i)) != _comparable(valor):
            problemas.append(f"el pickle {i} no se relee igual que se escribio")
    for p in cex.pickles:
        if p.error:
            problemas.append(f"pickle {p.indice}: {p.error}")
    return problemas


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Genera un .cex con la envolvente puesta.")
    ap.add_argument("--geometria", type=Path, required=True)
    ap.add_argument("--datos", type=Path, required=True)
    ap.add_argument("--plantilla", type=Path, required=True)
    ap.add_argument("--salida", type=Path, required=True)
    args = ap.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    geo = json.loads(args.geometria.read_text(encoding="utf-8"))
    datos = json.loads(args.datos.read_text(encoding="utf-8"))
    base = L.trocear(args.plantilla)

    try:
        envolvente, avisos = construir_envolvente(geo, datos)
        zonas_decl = {str(z.estado[Cadena("nombre")]) for z in envolvente[3]}
        instalaciones, av_ins = construir_instalaciones(
            datos, L.leer(base, INSTALACIONES), zonas_decl)
        avisos.extend(av_ins)
        nuevos = {
            ADMINISTRATIVOS: construir_administrativos(datos, L.leer(base, ADMINISTRATIVOS)),
            GENERALES: construir_generales(datos, L.leer(base, GENERALES)),
            ENVOLVENTE: envolvente,
            INSTALACIONES: instalaciones,
        }
        salida = montar(args.plantilla, nuevos)
    except GeneracionError as exc:
        print(f"NO SE GENERA: {exc}")
        return 1

    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_bytes(salida)

    problemas = comprobar(args.salida, nuevos)

    print(f"{args.salida}  ({len(salida)} bytes)")
    print(f"  plantilla   {args.plantilla.name}")
    print(f"  cerramientos {len(envolvente[0])}")
    for c in envolvente[0]:
        print(f"     {str(c[0])[:44]:<46} {str(c[1]):<19} {str(c[2]):>8} m2   -> {c[-1]}")
    avisos.extend(AVISOS_IMAGEN)      # las imagenes se leen despues del resto
    fuera = contrastar(envolvente,
                       _numf(datos["generales"]["superficie_util_habitable"]["valor"]))
    if avisos:
        print("\n  LO QUE NO ES UNA MEDIDA:")
        for a in avisos:
            print(f"     - {a}")
    if problemas:
        print("\n  PROBLEMAS AL RELEER:")
        for p in problemas:
            print(f"     - {p}")
        return 1
    print("\n  releido y comprobado: los 15 pickles estan y dicen lo que se escribio")
    return 0


if __name__ == "__main__":
    sys.exit(main())
