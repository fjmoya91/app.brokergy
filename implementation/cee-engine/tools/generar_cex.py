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
import math
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
MEDIDAS = 5
RESUMEN_MEDIDAS = 6
INFORME = 11

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


def _rumbo(orientacion, ident: str) -> str:
    """El rumbo de una FACHADA, en el vocabulario de CE3X.

    Una fachada SIN orientacion no se puede escribir: CE3X la exige y de ella
    cuelga la ganancia solar de sus huecos. Y el hueco esta justo donde nadie
    lo miraba — una PARTICION VERTICAL y una pared DIBUJADA nacen sin rumbo
    (no salen de ningun poligono, asi que no hay normal exterior de la que
    sacarlo) y al reclasificarlas a fachada nadie se lo preguntaba.

    Era un `ORIENTACION[None]` a pelo, o sea un `KeyError(None)`, cuyo `str()`
    es la cadena "None" — y eso es lo unico que llegaba a la pantalla: un
    escueto «None» sobre un expediente que no decia ni que pared era. Medido en
    26RES093_8, cuya pared dibujada PBX1 se paso a FACHADA.

    Ahora es una RESPUESTA (422) que dice que pared es y como se arregla.
    """
    clave = str(orientacion or "").strip().upper()
    if clave in ORIENTACION:
        return ORIENTACION[clave]
    if clave:
        raise GeneracionError(
            f"{ident}: '{orientacion}' no es una orientacion de CE3X "
            f"(son {', '.join(ORIENTACION)})")
    raise GeneracionError(
        f"{ident} se escribe como FACHADA y no tiene orientacion. Las "
        f"particiones y las paredes dibujadas nacen sin rumbo, porque no salen "
        f"de ningun poligono: dile en el panel de la pared hacia donde da.")


def muro(nombre, superficie, orientacion, largo, alto, espacio, term,
         ident=None) -> list:
    """Fachada: 15 campos, acaba en 'aire'."""
    u, masa = term["u"], term["masa"]
    return [nombre, Cadena("Fachada"), _num(superficie), u, masa,
            _rumbo(orientacion, ident or nombre), "", SIN_PATRON,
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


#: Los DOS valores que admite el campo `tipo` de un hueco. No es una opinion:
#: el esquema del CTE lo declara como `pattern 'Hueco|Lucernario'` y el visor
#: oficial (visorxml.codigotecnico.org) rechaza el XML con cualquier otro — con
#: el XML rechazado, el certificado NO SE PUEDE REGISTRAR.
#:
#: Medido sobre 914 XML de certificadores: 10.535 `Hueco` y 116 `Lucernario`, y
#: ni un solo `Ventana` o `Puerta` que no saliera de nosotros. Y en un .cex de
#: certificador, un hueco llamado `V1` lleva `tipo = 'Hueco'`: CE3X NO distingue
#: ahi la puerta de la ventana. Lo que hace puerta a una puerta es su 90 % de
#: marco, no este campo.
TIPO_HUECO = ("Hueco", "Lucernario")


def tipo_de_hueco(valor):
    """El `tipo` que se escribe, y el aviso si hubo que corregirlo.

    Se CORRIGE en vez de abortar: un `.cex` que no se genera deja al
    certificador sin nada, y aqui la traduccion es inequivoca —una ventana y una
    puerta son huecos—. Pero se DICE, porque un valor que no sale del programa
    es justo lo que acaba en un requerimiento tres semanas despues.
    """
    v = str(valor or "Hueco").strip()
    if v in TIPO_HUECO:
        return v, None
    return "Hueco", (f"hueco de tipo {v!r}: CE3X solo admite "
                     f"{' o '.join(TIPO_HUECO)}, se escribe 'Hueco' "
                     f"(una puerta se declara por su % de marco, no por aqui)")


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
        Cadena("tipo"): Cadena(tipo_de_hueco(h.get("tipo"))[0]),
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


#: Como declara CE3X de donde sale el rendimiento medio estacional. Son las dos
#: unicas formas que aparecen en el corpus, y NO son intercambiables: cambian la
#: casilla [6] y con ella la FORMA del bloque [7] que va detras.
#:
#:   estimado  (caldera)         [6]='Estimado segun Instalacion'
#:                               [7]=[aislamiento, rend_combustion, carga, potencia, ...]
#:   conocido  (bomba de calor)  [6]='Conocido (Ensayado/justificado)'
#:                               [7]=[rend_acs, rend_calefaccion, '']   (= [2])
#:
#: Medido sobre los 1.506 .cex de produccion: de los 138 equipos mixtos con
#: bomba de calor, 132 declaran el rendimiento como CONOCIDO — es lo que se hace
#: con una aerotermia, cuyo SCOP viene ensayado en su ficha tecnica.
RENDIMIENTO = {
    "estimado": "Estimado según Instalación",
    "conocido": "Conocido (Ensayado/justificado)",
}


def _pct(v) -> str:
    """El % de la demanda que cubre el equipo. Por defecto lo cubre todo."""
    return str(v) if v not in (None, "") else "100"


def _sup(eq: dict, clave: str) -> str:
    """La superficie servida, respetando la que venia en el .cex que se copia."""
    crudo = eq.get(clave + "_cruda")
    if crudo not in (None, ""):
        return str(crudo)
    return _num(_v(eq.get(clave), f"instalaciones.{clave}"))


def _rendimientos(eq: dict) -> tuple[list, list, list[str]]:
    """El par ([2], [7]) del registro, segun de donde salga el rendimiento.

    Devuelve ademas los avisos: en el modo ESTIMADO el estacional no es un dato
    sino una aproximacion de lo que CE3X calculara, y eso hay que decirlo.
    """
    modo = eq.get("rendimiento", "estimado")
    if modo not in RENDIMIENTO:
        raise GeneracionError(
            f"rendimiento {modo!r} no contemplado; CE3X usa {list(RENDIMIENTO)}")

    if modo == "conocido":
        # El SCOP ensayado se teclea tal cual, en %. CE3X no calcula nada aqui,
        # asi que [2] y [7] son el MISMO par y no hay nada que aproximar.
        cal = str(_v(eq.get("rend_calefaccion"), "instalaciones.rend_calefaccion"))
        acs = str(eq.get("rend_acs", "") or "")
        return [acs, cal, ""], [acs, cal, ""], []

    aisl = _v(eq.get("aislamiento"), "instalaciones.aislamiento")
    if aisl not in K_ESTACIONAL:
        raise GeneracionError(f"aislamiento de caldera no valido: {aisl!r}. "
                              f"CE3X usa {list(K_ESTACIONAL)}")
    rend_comb = float(_v(eq.get("rend_combustion"), "instalaciones.rend_combustion"))
    estacional = round(rend_comb - K_ESTACIONAL[aisl], 1)
    aviso = (
        f"instalacion {eq['nombre']}: el rendimiento estacional {estacional} % NO es "
        f"un dato, es lo que CALCULA CE3X. Aqui va aproximado ({rend_comb} de "
        f"combustion menos {K_ESTACIONAL[aisl]}, medido en el corpus). Abre "
        f"Instalaciones y dale a Modificar para que CE3X ponga el suyo.")
    cola = [aisl, str(rend_comb).rstrip("0").rstrip("."),
            str(eq.get("carga_media", "0.2")),
            str(_v(eq.get("potencia"), "instalaciones.potencia")),
            list(_INTERRUPTORES), list(_COLA_PARAMETROS)]
    return [estacional, estacional, ""], cola, [aviso]


def equipo_mixto(eq: dict, espacio: str) -> tuple[list, list[str]]:
    """Un equipo mixto de calefaccion y ACS (el slot 'mixto2'): 10 campos."""
    rend, cola, avisos = _rendimientos(eq)

    sup_acs = _sup(eq, "superficie_acs")
    sup_cal = _sup(eq, "superficie_calefaccion")
    acum = eq.get("acumulacion")
    #: El bloque tal cual venia en el .cex que se copia (ver `_heredar_acumulacion`):
    #: se reescribe IGUAL, con su UA y sus temperaturas, sin volver a componerlo.
    crudo_acum = eq.get("acumulacion_cruda")
    if crudo_acum:
        bloque_acum = list(crudo_acum)
    elif acum:
        bloque_acum = [True, str(acum["volumen"]), str(acum.get("t_alta", "80")),
                       str(acum.get("t_baja", "60")), str(acum.get("ua", "4.7")),
                       "Por defecto", str(acum.get("mult", "1"))]
    else:
        # 123 de los 138 equipos mixtos con bomba de calor del corpus van SIN
        # acumulacion. No se inventa un deposito que nadie ha declarado: si lo
        # hay, se marca en CE3X (y el aviso de la ficha lo pide).
        bloque_acum = [False]

    return [
        str(eq["nombre"]),
        Cadena("mixto2"),
        rend,
        str(_v(eq.get("generador"), "instalaciones.generador")),
        str(_v(eq.get("combustible"), "instalaciones.combustible")),
        [[sup_acs, _pct(eq.get("pct_acs"))], [sup_cal, _pct(eq.get("pct_calefaccion"))], ["", ""]],
        RENDIMIENTO[eq.get("rendimiento", "estimado")],
        cola,
        bloque_acum,
        espacio,
    ], avisos


def equipo_calefaccion(eq: dict, espacio: str) -> tuple[list, list[str]]:
    """Un equipo de SOLO calefaccion (el slot 'calefaccion'): 9 campos.

    Es el mixto sin el bloque de acumulacion y con el hueco del ACS vacio, tanto
    en los rendimientos como en la superficie. Medido sobre 226 equipos reales
    del corpus, todos con el rendimiento declarado como CONOCIDO.
    """
    rend, cola, avisos = _rendimientos(eq)
    sup_cal = _sup(eq, "superficie_calefaccion")
    return [
        str(eq["nombre"]),
        Cadena("calefaccion"),
        ["", rend[1], ""],
        str(_v(eq.get("generador"), "instalaciones.generador")),
        str(_v(eq.get("combustible"), "instalaciones.combustible")),
        [["", ""], [sup_cal, _pct(eq.get("pct_calefaccion"))], ["", ""]],
        RENDIMIENTO[eq.get("rendimiento", "estimado")],
        ["", cola[1], ""] if eq.get("rendimiento") == "conocido" else cola,
        espacio,
    ], avisos


#: Los interruptores de un equipo de SOLO ACS y de uno de SOLO refrigeracion.
#: Forma medida en «CEE DISTINTOS USOS CALEFACCION Y ACS Y AACC.cex», guardado
#: desde CE3X con los tres equipos a la vez. No se tocan, como los del mixto.
_INTERRUPTORES_ACS = [False, False, True]
_INTERRUPTORES_FRIO = [True, False, False]
_COLA_SIMPLE = [False, "1.0", "0.0"]


def equipo_acs(eq: dict, espacio: str) -> tuple[list, list[str]]:
    """Un equipo de SOLO ACS (el slot 'ACS'): 10 campos.

    Dos casos, y NO tienen la misma forma.

    ESTIMADO — el TERMO ELECTRICO: la caldera da la calefaccion y parte del
    agua, y un termo aparte da el resto. En CE3X son DOS equipos y cada uno
    declara el % de la demanda de ACS que cubre. Forma medida sobre «CEE
    DISTINTOS USOS CALEFACCION Y ACS Y AACC.cex» (Efecto Joule, Electricidad,
    82,5 m2 al 50 %, rendimiento nominal 100 %):

        ['TERMO ACS', 'ACS', [100.0, '', ''], 'Efecto Joule', 'Electricidad',
         [['82.5','50'], ['',''], ['','']], 'Estimado segun Instalacion',
         [['100.0','',''], [False,False,True], [False,'1.0','0.0']],
         [False], 'Edificio Objeto']

    CONOCIDO — la BOMBA DE CALOR DE ACS (un aerotermo, un termo aerotermico):
    su COP viene ensayado en la ficha, asi que CE3X no calcula nada y la cola
    DESAPARECE. Medido sobre el corpus: de los 544 equipos del slot ACS, 205 lo
    declaran conocido (183 de ellos bombas de calor), y en 204 de esos 205 el
    campo [7] es EXACTAMENTE el mismo trio que el [2]:

        ['BOMBA DE CALOR ACS THERMOR VM 150', 'ACS', ['334','',''],
         'Bomba de Calor - Caudal Ref. Variable', 'Electricidad',
         [['141.0','100'], ['',''], ['','']], 'Conocido (Ensayado/justificado)',
         ['334','',''], [False], 'Edificio Objeto']

    Es el mismo corte que ya hacen el mixto y el de calefaccion: la casilla [6]
    manda sobre la FORMA del bloque [7]. Escribir la cola del estimado con la
    casilla en «Conocido» deja el equipo mal definido, y entonces CE3X se niega
    a calcular la medida entera.
    """
    nominal = str(eq.get("rend_nominal", "100.0"))
    acum = eq.get("acumulacion")
    crudo_acum = eq.get("acumulacion_cruda")
    if crudo_acum:
        bloque_acum = list(crudo_acum)
    elif acum:
        bloque_acum = [True, str(acum["volumen"]), str(acum.get("t_alta", "80")),
                       str(acum.get("t_baja", "60")), str(acum.get("ua", "4.7")),
                       "Por defecto", str(acum.get("mult", "1"))]
    else:
        bloque_acum = [False]

    modo = eq.get("rendimiento", "estimado")
    if modo not in RENDIMIENTO:
        raise GeneracionError(
            f"rendimiento {modo!r} no contemplado; CE3X usa {list(RENDIMIENTO)}")

    if modo == "conocido":
        # El COP ensayado se teclea tal cual, en %. No hay nada que aproximar y
        # por eso no hay aviso: esto SI es un dato.
        rend = str(_v(eq.get("rend_acs"), "instalaciones.rend_acs"))
        campo2, cola, avisos = [rend, "", ""], [rend, "", ""], []
    else:
        # El estacional lo RECALCULA CE3X al abrir. En el medido coincide con el
        # nominal (un efecto Joule no tiene perdidas que descontar), asi que se
        # escribe ese y se dice que es aproximado.
        campo2 = [_numf(nominal) or 0.0, "", ""]
        cola = [[nominal, "", ""], list(_INTERRUPTORES_ACS), list(_COLA_SIMPLE)]
        avisos = [f"instalacion {eq['nombre']}: el rendimiento medio estacional lo "
                  f"calcula CE3X. Aqui va el nominal ({nominal} %). Abre Instalaciones "
                  f"y dale a Modificar para que ponga el suyo."]

    return [
        str(eq["nombre"]),
        Cadena("ACS"),
        campo2,
        str(_v(eq.get("generador"), "instalaciones.generador")),
        str(_v(eq.get("combustible"), "instalaciones.combustible")),
        [[_sup(eq, "superficie_acs"), _pct(eq.get("pct_acs"))], ["", ""], ["", ""]],
        RENDIMIENTO[modo],
        cola,
        bloque_acum,
        espacio,
    ], avisos


def equipo_refrigeracion(eq: dict, espacio: str) -> tuple[list, list[str]]:
    """Un equipo de SOLO refrigeracion (el slot 'refrigeracion'): 9 campos.

    Forma medida sobre el mismo fichero (Maquina frigorifica, Electricidad,
    16,5 m2 al 10 %, rendimiento nominal 250 %):

        ['AIRE ACONDICIONADO', 'refrigeracion', ['', '', 157.5],
         'Maquina frigorifica', 'Electricidad',
         [['',''], ['',''], ['16.5','10']], 'Estimado segun Instalacion',
         [['', '', '250.0'], [True,False,False], [False,'1.0','0.0'], 0],
         'Edificio Objeto']

    El `0` del final de la cola es la ANTIGUEDAD del equipo («Posterior a 2013»
    en el fichero medido). Va como esta: no se sabe que mas valores admite.
    """
    nominal = str(eq.get("rend_nominal", "250.0"))
    aviso = (f"instalacion {eq['nombre']}: el rendimiento medio estacional lo calcula "
             f"CE3X. Aqui va el nominal ({nominal} %), y la antiguedad queda como "
             f"«Posterior a 2013». Comprobalo en Instalaciones.")
    return [
        str(eq["nombre"]),
        Cadena("refrigeracion"),
        ["", "", _numf(nominal) or 0.0],
        str(_v(eq.get("generador"), "instalaciones.generador")),
        str(_v(eq.get("combustible"), "instalaciones.combustible")),
        [["", ""], ["", ""],
         [_sup(eq, "superficie_refrigeracion"), _pct(eq.get("pct_refrigeracion"))]],
        RENDIMIENTO[eq.get("rendimiento", "estimado")],
        [["", "", nominal], list(_INTERRUPTORES_FRIO), list(_COLA_SIMPLE),
         eq.get("antiguedad", 0)],
        espacio,
    ], [aviso]


def equipo_renovable(eq: dict, espacio: str) -> tuple[list, list[str]]:
    """Una CONTRIBUCION ENERGETICA (el slot 'renovable'): 6 campos.

    Es el dialogo «Definir nueva instalacion / Contribuciones energeticas», y
    tiene DOS mitades excluyentes que sus dos banderas encienden: arriba las
    fuentes de energia renovable (el % de demanda que cubren) y abajo la
    generacion electrica para autoconsumo. Un autoconsumo fotovoltaico es solo
    la segunda.

    Forma medida sobre el corpus (4 equipos de autoconsumo y 1 de solar termica
    de ACS): el bloque [3] son seis casillas —energia electrica generada, calor
    recuperado para ACS, calor recuperado para calefaccion, frio recuperado,
    energia consumida y tipo de combustible— y solo se escribe la primera.
    """
    avisos: list[str] = []
    generada = _num(eq.get("generacion_electrica_kwh"))
    pct_acs = _pct(eq.get("pct_acs")) if eq.get("pct_acs") else ""
    pct_cal = _pct(eq.get("pct_calefaccion")) if eq.get("pct_calefaccion") else ""
    pct_ref = _pct(eq.get("pct_refrigeracion")) if eq.get("pct_refrigeracion") else ""
    hay_fuentes = bool(pct_acs or pct_cal or pct_ref)
    if not generada and not hay_fuentes:
        raise GeneracionError(
            f"la contribucion «{eq.get('nombre')}» no declara ni energia generada ni "
            f"porcentaje de demanda cubierta: CE3X la abriria vacia")
    if generada:
        avisos.append(f"contribucion {eq['nombre']}: {generada} kWh/año de generacion"
                      " electrica para autoconsumo.")
    return [
        str(eq["nombre"]),
        Cadena("renovable"),
        [pct_acs, pct_cal, pct_ref, False],
        [generada, "", "", "", "", ""],
        [hay_fuentes, bool(generada)],
        espacio,
    ], avisos


#: Que funcion escribe cada slot. Lo que no este aqui NO se sabe escribir, y se
#: dice: un registro con la forma equivocada CE3X lo abre y no lo enseña.
ESCRITORES = {"mixto2": equipo_mixto, "calefaccion": equipo_calefaccion,
              "ACS": equipo_acs, "refrigeracion": equipo_refrigeracion,
              "renovable": equipo_renovable}

#: Que SERVICIOS da cada slot. Es lo que dice la propia pestaña de CE3X: un
#: 'mixto2' es "Equipo mixto de calefaccion y ACS", un 'climatizacion' es
#: calefaccion + refrigeracion, y un 'mixto3' los tres.
SERVICIOS_DEL_SLOT = {
    "ACS": {"acs"},
    "calefaccion": {"calefaccion"},
    "refrigeracion": {"refrigeracion"},
    "climatizacion": {"calefaccion", "refrigeracion"},
    "mixto2": {"calefaccion", "acs"},
    "mixto3": {"calefaccion", "refrigeracion", "acs"},
}


def slots_a_retirar(equipos: list[dict]) -> set[str]:
    """Que slots hay que VACIAR antes de escribir los equipos nuevos.

    El CEE final de una sustitucion no lleva la caldera Y la bomba de calor: la
    caldera se ha QUITADO. Asi que se retira el generador de cada servicio que
    el equipo nuevo asume, y nada mas — un `renovable` (las placas solares), la
    iluminacion o las bombas de circulacion siguen ahi porque la obra no los ha
    tocado.

    Se deduce del SLOT del equipo nuevo, no de una lista escrita a mano: si
    mañana se escribe un 'mixto3', retirara tambien la maquina de frio sin que
    haya que acordarse.
    """
    servicios: set[str] = set()
    for eq in equipos:
        servicios |= SERVICIOS_DEL_SLOT.get(eq.get("slot", "mixto2"), set())
    return {slot for slot, da in SERVICIOS_DEL_SLOT.items() if da & servicios}


def heredar_del_base(equipos: list[dict], plantilla: list) -> list[str]:
    """Lo que el .cex QUE SE COPIA ya dice y el equipo nuevo hereda.

    Dos cosas, y las dos por el mismo motivo: al copiar un fichero, lo que ya
    esta escrito en el vale mas que lo que la app deduzca, porque puede haberlo
    corregido el certificador en CE3X.
    """
    return _heredar_superficies(equipos, plantilla) + _heredar_acumulacion(equipos, plantilla)


def _heredar_acumulacion(equipos: list[dict], plantilla: list) -> list[str]:
    """El DEPOSITO de ACS es del edificio, no de la caldera.

    En el CEE inicial lo calienta la caldera y en el final la bomba de calor,
    pero el deposito es el mismo — nadie lo tira al cambiar el generador. Si se
    escribiera `[False]` porque el expediente no guarda los litros, el CEE final
    diria que la vivienda ha perdido su acumulacion de ACS, que es un cambio que
    nadie ha hecho.

    Lo que el expediente SI declare manda: ahi hay un acumulador nuevo de verdad.
    """
    avisos: list[str] = []
    if not isinstance(plantilla, list) or len(plantilla) != len(SLOTS):
        return avisos
    previa = None
    for i, nombre_slot in enumerate(SLOTS):
        if "acs" not in SERVICIOS_DEL_SLOT.get(nombre_slot, set()):
            continue
        for viejo in (plantilla[i] if isinstance(plantilla[i], list) else []):
            if len(viejo) > 8 and isinstance(viejo[8], list) and viejo[8] and viejo[8][0] is True:
                previa = viejo[8]
                break
        if previa:
            break
    if not previa:
        return avisos
    for eq in equipos:
        if "acs" not in SERVICIOS_DEL_SLOT.get(eq.get("slot", "mixto2"), set()):
            continue
        if eq.get("acumulacion"):
            continue                       # lo declarado en el expediente manda
        eq["acumulacion_cruda"] = list(previa)
        avisos.append(
            f"se conserva el deposito de ACS del .cex que se copia ({previa[1]} l): el "
            f"generador cambia, el deposito no. Si la obra lo ha cambiado, corrigelo en CE3X.")
    return avisos


def _heredar_superficies(equipos: list[dict], plantilla: list) -> list[str]:
    """La superficie servida la manda el .cex QUE SE COPIA, no la ficha.

    Es la consecuencia de copiar el inicial en vez de levantarlo de cero: si el
    certificador corrigio la superficie en CE3X —porque Catastro declaraba de
    mas, o porque dejo fuera un anejo—, la aerotermia tiene que servir la MISMA
    que servia la caldera. Escribir la de la ficha desharia su correccion sin
    decirlo, que es justo lo que no puede pasar al copiar un fichero suyo.

    Solo se hereda de un equipo que da EL MISMO servicio, y solo el numero: el
    porcentaje de demanda cubierta lo decide el equipo nuevo.
    """
    avisos: list[str] = []
    if not isinstance(plantilla, list) or len(plantilla) != len(SLOTS):
        return avisos
    # {servicio: superficie} de lo que ya hay escrito en el fichero.
    servido: dict[str, str] = {}
    for i, nombre_slot in enumerate(SLOTS):
        for viejo in (plantilla[i] if isinstance(plantilla[i], list) else []):
            if len(viejo) < 6 or not isinstance(viejo[5], list):
                continue
            acs, cal = viejo[5][0], viejo[5][1]
            da = SERVICIOS_DEL_SLOT.get(nombre_slot, set())
            if "acs" in da and isinstance(acs, list) and acs[0]:
                servido.setdefault("acs", str(acs[0]))
            if "calefaccion" in da and isinstance(cal, list) and cal[0]:
                servido.setdefault("calefaccion", str(cal[0]))

    for eq in equipos:
        for servicio, clave, pct_clave in (
                ("calefaccion", "superficie_calefaccion", "pct_calefaccion"),
                ("acs", "superficie_acs", "pct_acs")):
            if servicio not in SERVICIOS_DEL_SLOT.get(eq.get("slot", "mixto2"), set()):
                continue
            heredada = servido.get(servicio)
            if not heredada:
                continue
            propia = eq.get(clave)

            # Un equipo que cubre PARTE de la demanda (una hibridacion: la bomba
            # y la caldera se reparten el edificio) no sirve toda la superficie,
            # sirve la SUYA. Heredar la del fichero a secas le daba el edificio
            # entero a cada uno y deshacia el reparto sin decirlo.
            #
            # Lo que se hereda es el TOTAL, y el reparto se vuelve a aplicar
            # sobre el: asi manda el .cex si el certificador corrigio la
            # superficie en CE3X, y sigue mandando el C_b para repartirla.
            pct = _numf(eq.get(pct_clave))
            if pct is not None and 0 < pct < 100:
                objetivo = round((_numf(heredada) or 0.0) * pct / 100.0, 2)
                if propia not in (None, "") and _numf(propia) != objetivo:
                    avisos.append(
                        f"superficie de {servicio}: el .cex que se copia sirve {heredada} m2 "
                        f"en total, asi que a este equipo le tocan {objetivo} m2 ({_num(pct)} %) "
                        f"y la ficha decia {propia} m2. Manda la del .cex.")
                eq[clave] = objetivo
                # Sin `_cruda`: no es el numero del fichero, es su parte.
                eq.pop(clave + "_cruda", None)
                continue

            if propia not in (None, "") and _numf(propia) != _numf(heredada):
                avisos.append(
                    f"superficie de {servicio}: el .cex que se copia dice {heredada} m2 y "
                    f"la ficha {propia} m2. Se conserva la del .cex — si el certificador "
                    f"la corrigio en CE3X, esa es la buena.")
            # Se marca como CRUDO: al venir del fichero que se copia, se
            # reescribe TAL CUAL. Pasarlo por `_num` le quitaria el `.0` que
            # escribe CE3X y el equipo nuevo no saldria como estaba el viejo.
            eq[clave] = heredada
            eq[clave + "_cruda"] = heredada
    return avisos


def construir_instalaciones(datos: dict, plantilla: list,
                            zonas: set[str] | None = None,
                            retirar: set[str] | None = None) -> tuple[list, list[str]]:
    """Los 12 slots del pickle 4. Lo que no se sepa se queda vacio.

    `retirar` vacia esos slots ANTES de escribir, y es lo que convierte "añadir
    un equipo" en "SUSTITUIR el generador". Sin el, el CEE final saldria con la
    caldera y la bomba de calor conviviendo — declarando un edificio con el
    doble de generadores de los que tiene.

    OJO con la zona del equipo: es el mismo campo traicionero que en los
    cerramientos. Si apunta a una zona que no existe, **CE3X abre el fichero y
    la caldera no aparece**, sin decir nada. Paso el 2026-09-11 con la Domusa de
    Los Yebenes: se le escribio la cadena "auto" tal cual.
    """
    slots: list[list] = [[] for _ in SLOTS]
    if isinstance(plantilla, list) and len(plantilla) == len(SLOTS):
        slots = [list(x) if isinstance(x, list) else [] for x in plantilla]
    avisos: list[str] = []

    # Lo retirado se dice CON SU NOMBRE. Que de un .cex desaparezca un generador
    # no puede ser un efecto silencioso: es la actuacion entera.
    for nombre_slot in sorted(retirar or ()):
        i = SLOTS.index(nombre_slot)
        for viejo in slots[i]:
            avisos.append(
                f"se RETIRA del CEE {str(viejo[0])!r} "
                f"({str(viejo[3]) if len(viejo) > 3 else nombre_slot}): lo sustituye "
                f"el equipo nuevo. Es la actuacion.")
        slots[i] = []
    espacio = datos["envolvente"]["espacio"]
    if str(espacio).lower() == "auto":
        # los equipos van a la raiz: 604 de los 620 equipos mixtos del corpus
        espacio = "Edificio Objeto"
    for eq in datos.get("instalaciones", []):
        tipo = eq.get("slot", "mixto2")
        if tipo not in SLOTS:
            raise GeneracionError(f"tipo de equipo no contemplado: {tipo!r}")
        if tipo not in ESCRITORES:
            raise GeneracionError(
                f"no se sabe escribir el slot {tipo!r}; medidos: {list(ESCRITORES)}")
        zona = eq.get("zona", espacio)
        declaradas = (zonas or set()) | {"Edificio Objeto"}
        if zona not in declaradas:
            raise GeneracionError(
                f"el equipo {eq.get('nombre')!r} dice estar en la zona {zona!r}, "
                f"que no existe. Declaradas: {sorted(declaradas)}. CE3X abriria "
                f"el fichero y la instalacion NO apareceria.")
        registro, av = ESCRITORES[tipo](eq, zona)
        slots[SLOTS.index(tipo)].append(registro)
        avisos.extend(av)
        if eq.get("de"):
            avisos.append(f"instalacion {eq['nombre']}: {eq['de']}")
    avisos.extend(_reparto(datos.get("instalaciones", [])))
    return slots, avisos


#: Cuanta demanda de cada servicio cubren ENTRE TODOS los equipos.
#: Es lo que CE3X reparte en la columna «Porcentaje (%)» de cada equipo: una
#: caldera que da el 50 % del ACS y un termo que da el otro 50 %.
_PCT_DEL_SERVICIO = {"acs": "pct_acs", "calefaccion": "pct_calefaccion",
                     "refrigeracion": "pct_refrigeracion"}


def _reparto(equipos: list[dict]) -> list[str]:
    """Que la suma de porcentajes de cada servicio no pase del 100 %.

    Pasarse no es un detalle: significa declarar mas demanda cubierta de la que
    hay, y el certificado sale con un consumo que no cuadra con su propia
    envolvente. Quedarse corto SI es legitimo —hay demanda que no cubre nadie—
    pero conviene decirlo, porque casi siempre es que falta un equipo.

    Se AVISA, no se aborta: quien firma puede tener un motivo, y un .cex que no
    se escribe por un porcentaje es peor que uno que lo dice.
    """
    avisos: list[str] = []
    for servicio, clave in _PCT_DEL_SERVICIO.items():
        suma, cuantos = 0.0, 0
        for eq in equipos:
            if servicio not in SERVICIOS_DEL_SLOT.get(eq.get("slot", "mixto2"), set()):
                continue
            cuantos += 1
            suma += _numf(eq.get(clave)) if eq.get(clave) not in (None, "") else 100.0
        if not cuantos:
            continue
        suma = round(suma, 1)
        if suma > 100:
            avisos.append(
                f"los equipos de {servicio} suman {suma} % de la demanda: pasan del "
                f"100 %. CE3X lo admite, pero el certificado declara mas demanda "
                f"cubierta de la que hay — repasa los porcentajes.")
        elif suma < 100:
            avisos.append(
                f"los equipos de {servicio} cubren el {suma} % de la demanda: el "
                f"{round(100 - suma, 1)} % restante no lo da ninguno. Si hay otro "
                f"aparato, anadelo.")
    return avisos


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


def _a_mano(valor: float, nota: str) -> dict:
    """Una medida que ha puesto una PERSONA, con su procedencia.

    Es el mismo diccionario que produce `provenance.manual()`; se escribe a
    mano porque `tools/` no importa de `src/` (el generador se usa suelto, con
    un JSON delante y sin el motor detras).
    """
    return {"value": round(valor, 2), "source": "USER_INPUT", "confidence": 0.5,
            "evidence_type": "MANUAL", "note": nota}


def _valor(el: dict, campo: str):
    v = el.get(campo)
    return v.get("value") if isinstance(v, dict) else v


def _alto_de_planta(elementos: list, planta: str):
    """La altura libre de una planta, tomada de una pared que YA esta medida.

    No se inventa ni se vuelve a pedir: es la misma altura con la que el motor
    midio todas las fachadas de esa planta, asi que una pared dibujada a mano
    sale con la misma que sus vecinas.
    """
    for el in elementos:
        if el.get("planta") == planta and _valor(el, "alto"):
            return _valor(el, "alto")
    return None


def aplicar_paredes(geo: dict, cfg: dict):
    """Las paredes que el certificador ha MOVIDO o DIBUJADO.

    Catastro dibuja el perimetro de lo construido y se equivoca: un tabique que
    se ve perfectamente sobre la cartografia esta medio metro a un lado, o
    directamente no esta. Con el plano delante el certificador lo ve, y esto es
    lo que le deja corregirlo — pero lo que sale de aqui es una SUPERFICIE que
    va a un certificado, asi que se MIDE aqui y se AVISA siempre.

    REGLA — la medida la hace el motor, no el navegador. Le llegan los dos
    puntos tal cual se han soltado sobre el plano y de ahi sale el largo.

    Las coordenadas son las del LIENZO, y eso no es una aproximacion: el lienzo
    es el mundo trasladado y con la Y del reves (`plano_svg.plantas`), y una
    traslacion con un espejo CONSERVA LAS DISTANCIAS. Un metro del lienzo es un
    metro del edificio, asi que no hay que deshacer nada para medir.

    La superficie es largo x alto, con la MISMA altura de planta con la que el
    motor midio las demas paredes de esa planta.
    """
    elementos = [dict(el) for el in geo.get("elementos", [])]
    paredes = cfg.get("paredes") or {}
    avisos = []

    def largo_de(pts):
        try:
            (ax, ay), (bx, by) = pts[0], pts[-1]
            L = math.hypot(float(bx) - float(ax), float(by) - float(ay))
        except (TypeError, ValueError, IndexError):
            return None
        # Menos de esto no es una pared: es un resbalon del raton.
        return L if L >= 0.2 else None

    por_id = {el["id"]: el for el in elementos}

    for ident, cambio in (paredes.get("movidas") or {}).items():
        el = por_id.get(ident)
        if el is None:
            avisos.append(f"{ident}: se ha movido una pared que ya no esta en la "
                          f"geometria; no se escribe el cambio")
            continue
        L = largo_de((cambio or {}).get("lienzo") or [])
        alto = _valor(el, "alto")
        if L is None or not alto:
            avisos.append(f"{ident}: no se ha podido medir la pared movida; se "
                          f"escribe como la midio Catastro")
            continue
        antes_l = _valor(el, "largo") or 0
        antes_s = _valor(el, "superficie") or 0
        el["largo"] = _a_mano(L, "movida por el certificador sobre el plano")
        el["superficie"] = _a_mano(L * float(alto), "largo x alto de la planta")
        # Una pared que se desliza en paralelo mide LO MISMO y solo cambia de
        # sitio — y ahi repetir la cifra dos veces ("6.53 m, donde Catastro la
        # mide 6.53 m") se lee como un fallo. Lo que ha cambiado sigue
        # importando: contra que da esa pared.
        if abs(L - float(antes_l or 0)) < 0.01:
            avisos.append(
                f"{ident}: la ha MOVIDO el certificador; sigue midiendo "
                f"{L:.2f} m y {L * float(alto):.2f} m2, solo cambia de sitio")
        else:
            avisos.append(
                f"{ident}: la ha MOVIDO el certificador — {L:.2f} m y "
                f"{L * float(alto):.2f} m2, donde Catastro la mide "
                f"{antes_l:.2f} m y {antes_s:.2f} m2")

    for nueva in (paredes.get("nuevas") or []):
        ident = str((nueva or {}).get("id") or "").strip()
        planta = str((nueva or {}).get("planta") or "").strip()
        if not ident or not planta:
            continue
        if ident in por_id:
            avisos.append(f"{ident}: ya hay un cerramiento con ese nombre; la pared "
                          f"dibujada no se escribe")
            continue
        L = largo_de(nueva.get("lienzo") or [])
        alto = _alto_de_planta(elementos, planta)
        if L is None or not alto:
            avisos.append(f"{ident}: no se ha podido medir la pared dibujada "
                          f"(hacen falta sus dos extremos y la altura de la planta)")
            continue
        tipo = str(nueva.get("tipo") or "PARTICION_VERTICAL").upper()
        el = {
            "id": ident, "planta": planta, "nivel": nueva.get("nivel"),
            "tipo": tipo, "subtipo": "DIBUJADA",
            "contacto": "", "espacio_origen": "", "espacio_destino": "",
            # Una PARTICION no lleva orientacion —la de una fachada es la de
            # su normal exterior, y aqui no hay poligono del que sacarla—, asi
            # que nace vacia; es lo mismo que hace `classifier` con las
            # particiones que mide el motor. Pero si el certificador la ha
            # pasado a FACHADA, si trae la que el ha dicho — y sin ella no se
            # puede escribir. En MAYUSCULAS: es la clave con la que se traduce.
            "orientacion": str(nueva.get("orientacion") or "").strip().upper() or None,
            "azimut": None,
            "largo": _a_mano(L, "dibujada por el certificador sobre el plano"),
            "alto": _a_mano(float(alto), "altura de planta de sus vecinas"),
            "superficie": _a_mano(L * float(alto), "largo x alto de la planta"),
            "confianza": 0.5, "requiere_revision": True,
            "nota": "pared dibujada por el certificador",
            "ring": None, "segmento_origen": None, "geometria_wkt": None,
        }
        elementos.append(el)
        por_id[ident] = el
        avisos.append(
            f"{ident}: pared DIBUJADA por el certificador — {L:.2f} m y "
            f"{L * float(alto):.2f} m2. Catastro no la tiene")

    return elementos, avisos


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
    # Y, mas general: el certificador puede RECLASIFICAR cualquier pared. Lo que
    # Catastro dice de una pared es una deduccion geometrica —hay edificio
    # pegado al otro lado, o no lo hay— y se equivoca: un cobertizo sin dar de
    # alta convierte una medianera en fachada, y un patio compartido, al reves.
    # Con los colindantes a la vista en la pantalla, el certificador lo ve; esto
    # es lo que le deja corregirlo.
    reclasificado = {k: str(v).upper()
                     for k, v in (cfg.get("reclasificar") or {}).items() if v}
    # El NOMBRE de cada cerramiento, si el certificador lo ha cambiado. Es lo
    # que va a ver en CE3X, y la inicial dice de un vistazo lo que es: una
    # pared que pasa a particion deja de llamarse `FBE1` y pasa a `PBE1`.
    # Los huecos ya vienen apuntando al nombre nuevo (lo traduce la vista).
    renombrado = {k: str(v).strip() for k, v in (cfg.get("renombrar") or {}).items()
                  if str(v or "").strip()}
    # Cuales de esos nombres los ha ESCRITO una persona. Al cerramiento se le
    # pega detras LO QUE ES ("FBN1 CALLE", "SUB1 SUELO EN TERRENO") porque el
    # ident a secas es criptico en el arbol de CE3X — pero un nombre tecleado ya
    # lo dice, y "FBX1 GARAJE ABIERTO CALLE" no se lee mejor por ser mas largo.
    # El cambio de inicial al reclasificar (FBE1 -> PBE1) lo propone la app y NO
    # cuenta: ahi el sufijo sigue haciendo falta.
    propios = {str(k) for k in (cfg.get("nombres_propios") or [])}
    # La U de UNA pared concreta. La tabla de la epoca vale para el edificio,
    # pero una pared puede estar aislada y las demas no —una fachada rehecha, un
    # patio cerrado despues— y escribirlas todas iguales es declarar un edificio
    # que no existe. Lo que se ponga aqui manda sobre `termicas`.
    # Hacia donde da una pared que el certificador ha pasado a FACHADA. Una
    # particion vertical no trae rumbo —no sale de ningun poligono, asi que no
    # hay normal exterior de la que sacarlo— y una fachada sin el no se puede
    # escribir. Lo dice el, que tiene el plano y la brujula delante.
    #
    # El de una pared DIBUJADA no viene por aqui sino con ella
    # (`paredes.nuevas[].orientacion`): su elemento nace con el nombre EFECTIVO,
    # asi que una entrada aqui —que va por el id de Catastro— no casaria.
    orientado = {k: str(v).strip().upper()
                 for k, v in (cfg.get("orientaciones") or {}).items()
                 if str(v or "").strip()}
    u_pared = {}
    for k, v in (cfg.get("u_por_cerramiento") or {}).items():
        try:
            n = float(str(v).replace(",", "."))
        except (TypeError, ValueError):
            continue
        if n >= 0:
            u_pared[k] = n
    plantas = set(cfg["incluir_plantas"])
    excluidos = set(cfg["excluir_ids"]["ids"])

    # Lo que el certificador ha MOVIDO o DIBUJADO sobre el plano, ya medido. Va
    # lo PRIMERO: de aqui salen superficies que van al certificado, y todo lo de
    # abajo —reclasificar, renombrar, la U— tiene que verlas como una pared mas.
    elementos, avisos = aplicar_paredes(geo, cfg)

    def medida(el: dict, campo: str):
        """Cada medida viene envuelta con su procedencia; aqui solo el numero."""
        v = el.get(campo)
        return v.get("value") if isinstance(v, dict) else v

    cerramientos: list[list] = []
    for el in elementos:
        ident, tipo, planta = el["id"], el["tipo"], el["planta"]
        if ident in excluidos or planta not in plantas:
            continue
        if ident in reclasificado and reclasificado[ident] != tipo:
            avisos.append(
                f"{ident}: se escribe como {reclasificado[ident]} y Catastro lo "
                f"clasifica como {tipo} (lo ha cambiado el certificador)")
            tipo = reclasificado[ident]
        if tipo == "PARTICION_VERTICAL":
            # Se escribe por la rama de la medianera, que ya sabe emitir una
            # particion con su U. Asi las tres opciones que ve el certificador
            # —fachada, medianera, particion— salen de un solo camino.
            como_particion = como_particion | {ident}
            tipo = "MEDIANERA"
        sup_medida = medida(el, "superficie")
        zona = por_nivel.get(el.get("nivel"), espacio) if auto else espacio
        # El nombre puede cambiarlo el certificador; `ident` NO se toca, que es
        # la clave con la que se comprueba todo lo demas.
        nombre = renombrado.get(ident, ident)

        # Una pared DIBUJADA tampoco lo lleva: su subtipo es literalmente
        # "DIBUJADA", que dice como entro en el fichero y no que pared es.
        suyo = ident in propios or el.get("subtipo") == "DIBUJADA"

        def rotulo(sufijo):
            return nombre if suyo else f"{nombre} {sufijo}"

        def conU(term_base):
            """El bloque termico de ESTA pared, con su U si se le ha puesto."""
            if ident not in u_pared:
                return term_base
            propia = dict(term_base)
            propia["u"] = u_pared[ident]
            avisos.append(
                f"{ident}: U {u_pared[ident]} W/m2K puesta a mano "
                f"(la de la epoca es {term_base['u']})")
            return propia

        if tipo == "FACHADA":
            rumbo = orientado.get(ident) or el.get("orientacion")
            if ident in orientado and orientado[ident] != (el.get("orientacion") or ""):
                avisos.append(
                    f"{ident}: da al {orientado[ident]} porque lo ha dicho el "
                    + (f"certificador; la geometria la orienta al {el['orientacion']}"
                       if el.get("orientacion")
                       else "certificador: esta pared no trae rumbo de la geometria"))
            cerramientos.append(muro(
                rotulo(el["subtipo"]), sup_medida, rumbo,
                medida(el, "largo"), medida(el, "alto"), zona, conU(term["fachada"]),
                ident=ident))
        elif tipo == "MEDIANERA":
            # Una medianera es adiabatica SOLO si al otro lado hay vivienda. Si
            # el certificador sabe que hay un garaje, deja de serlo y pasa a ser
            # una particion vertical con su U: por ahi si se pierde calor.
            if ident in como_particion:
                cerramientos.append(particion(
                    rotulo("PARTICION CON EL VECINO"), sup_medida, "vertical",
                    zona, conU(term["particion_vertical"]),
                    largo=medida(el, "largo"), alto=medida(el, "alto")))
                avisos.append(
                    f"{ident}: escrito como PARTICION VERTICAL, no como medianera "
                    f"(el certificador dice que al otro lado hay un espacio no "
                    f"habitable). Deja de ser adiabatico.")
            else:
                cerramientos.append(medianera(
                    rotulo("MEDIANERA"), sup_medida,
                    medida(el, "largo"), medida(el, "alto"), zona, conU(term["medianera"])))
        elif tipo == "SUELO":
            sup = _superficie(cfg.get("suelo"), sup_medida)
            if abs(sup - sup_medida) > 0.01:
                avisos.append(
                    f"{ident}: se escribe {sup} m2 (decision del certificador) y la "
                    f"geometria mide {sup_medida} m2")
            cerramientos.append(suelo_terreno(
                rotulo("SUELO EN TERRENO"), sup, zona, conU(term["suelo_terreno"])))
        elif tipo == "CUBIERTA":
            sup = _superficie(cfg.get("cubierta"), sup_medida)
            if abs(sup - sup_medida) > 0.01:
                avisos.append(
                    f"{ident}: se escribe {sup} m2 (derivado de la superficie de "
                    f"vivienda) y la geometria mide {sup_medida} m2")
            cerramientos.append(cubierta(
                rotulo("CUBIERTA"), sup, zona, conU(term["cubierta"])))
        elif tipo == "PARTICION_INTERIOR_HORIZONTAL":
            sup = _superficie(cfg.get("particion_superior"), sup_medida)
            cerramientos.append(particion(
                rotulo("PARTICION"), sup, term["particion_superior"].get(
                    "sentido", "horizontal superior"),
                zona, conU(term["particion_superior"])))
        else:
            avisos.append(f"{ident}: tipo {tipo} no contemplado, NO se escribe")

    # La particion vertical con el almacen de PB no sale de la geometria: no hay
    # poligono para ese uso. Va aparte y con el aviso puesto.
    pv = cfg.get("particion_vertical_almacen_pb")
    if pv:
        cerramientos.append(particion(
            "PV01 PARTICION CON ALMACEN PB (ESTIMADA - MEDIR EN VISITA)",
            _v(pv["superficie"], "particion_vertical.superficie"), "vertical",
            espacio, conU(term["particion_vertical"]),
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
        _, aviso_tipo = tipo_de_hueco(h.get("tipo"))
        if aviso_tipo:
            avisos.append(f"{h.get('id')}: {aviso_tipo}")
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
    # Como se la llama en los avisos. Con BYTES no hay ningun fichero del que
    # sacar un nombre, y el aviso de "fichero incompleto" lo daba por hecho:
    # `p.name` reventaba con un UnboundLocalError justo en el caso que ese
    # aviso existe para contar. Lo dispara la foto de fachada del Catastro,
    # que llega mal terminada mas a menudo de lo que parece.
    origen = "la imagen recibida"
    if fuente is None:
        p = Path(ruta)
        if not p.is_file():
            raise GeneracionError(f"no existe la imagen {p}")
        fuente = p
        origen = p.name

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
        AVISOS_IMAGEN.append(f"{origen}: el fichero esta INCOMPLETO ({exc}). "
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
# La MEDIDA DE MEJORA (pickles 5 y 6)
# --------------------------------------------------------------------------
#
# Un grupo de medidas de mejora es «el mismo edificio con la instalacion del
# CEE final»: medido sobre el .cex de 26RES060_186 que guardo el certificador,
# su `cerramientosMejorados`, `huecosMejorados` y `puentesTermicosMejorados`
# son COPIA LITERAL de los tres primeros del pickle 3, y su `datosInstalaciones`
# es exactamente el pickle 4 del CEE final. Nada de eso hay que inventarlo.
#
# REGLA — lo que CALCULA CE3X se deja VACIO, nunca a ojo. El ahorro y los dos
# `datosEdificio*` llevan dentro `datosResultados` (749 claves: demandas,
# emisiones y limites de calificacion). Eso es la salida de su motor de
# calculo, y este proyecto no calcula nada termico. Rellenarlos con los de otro
# fichero pondria en el informe los ahorros de OTRA vivienda.
#
# Asi que la medida se entrega DEFINIDA y SIN CALCULAR: al abrir el .cex, el
# certificador solo tiene que pulsar «Actualizar» en Medidas de Mejora. El
# analisis economico sabemos escribirlo entero porque su forma sin calcular
# esta EN EL FICHERO: `analisisFacturas` del caso real trae `''` en los siete
# numeros, que es justo como queda lo que aun no se ha calculado.

_MM = "MedidasDeMejora.objetoGrupoMejoras"

#: Los `sistemas*MM` del grupo son el contenido de cada slot del pickle 4, con
#: el nombre que le da el dialogo de medidas. El orden es el de `SLOTS`.
SLOT_A_MM = {
    "ACS": "sistemasACSMM", "calefaccion": "sistemasCalefaccionMM",
    "refrigeracion": "sistemasRefrigeracionMM",
    "climatizacion": "sistemasClimatizacionMM",
    "mixto2": "sistemasMixto2MM", "mixto3": "sistemasMixto3MM",
    "renovable": "sistemasContribucionesMM", "iluminacion": "sistemasIluminacionMM",
    "ventilacion": "sistemasVentilacionMM", "ventiladores": "sistemasVentiladoresMM",
    "bombas": "sistemasBombasMM", "": "sistemasTorresRefrigeracionMM",
}


def _reemitible(v: Any) -> Any:
    """Un dato LEIDO de un .cex, listo para volver a escribirse.

    `leer_cex` no construye nada: los objetos de CE3X vuelven como `Opaco`. Para
    copiarlos a otro pickle hay que decirle al emisor que son instancias, y eso
    es separar el nombre del modulo del de la clase. No se importa ni se llama
    nada: sigue siendo texto leido del disco.
    """
    if isinstance(v, L.Opaco):
        modulo, _, clase = v.clase.rpartition(".")
        return P.Instancia(modulo, clase, _reemitible(v.estado))
    if isinstance(v, dict):
        return {Cadena(k) if isinstance(k, str) else k: _reemitible(x)
                for k, x in v.items()}
    if isinstance(v, list):
        return [_reemitible(x) for x in v]
    if isinstance(v, tuple):
        return tuple(_reemitible(x) for x in v)
    return v


def _sin_calcular() -> P.Instancia:
    """Un resultado economico en blanco, con la forma que tiene en el fichero."""
    demandas = lambda: P.Instancia(_MM, "ResultadoDemandasyConsumosAnalisisEconomicoConjuntoMM", {
        Cadena("ddaBrutaCal"): 0.0, Cadena("ddaNetaCal"): 0.0,
        Cadena("ddaBrutaRef"): 0.0, Cadena("ddaNetaRef"): 0.0,
        Cadena("ddaBrutaACS"): 0.0, Cadena("ddaNetaACS"): 0.0,
        Cadena("diccCal"): {}, Cadena("diccRef"): {}, Cadena("diccACS"): {},
        Cadena("diccIlum"): {}, Cadena("diccBombas"): {},
        Cadena("diccVentiladores"): {}, Cadena("diccTorresRef"): {},
        Cadena("diccContribuciones"): {},
    })
    return P.Instancia(_MM, "ResultadoAnalisisEconomicoConjuntoMM", {
        Cadena("precioAnual_CB"): "", Cadena("precioAnual_CM"): "",
        Cadena("ahorroEconomico"): "", Cadena("payBack"): "", Cadena("van"): "",
        Cadena("resultadosCB"): demandas(), Cadena("resultadosCM"): demandas(),
    })


def construir_medida(m: dict, envolvente: list, instalaciones: list,
                     ) -> tuple[list, list, list[str]]:
    """UN grupo de medidas (pickle 5) y su fila del resumen (pickle 6).

    `envolvente` es el pickle 3 de ESTE fichero (la medida no toca la obra) e
    `instalaciones` es el pickle 4 **de la medida**: el del edificio con el
    cambio que esa medida propone —la aerotermia sustituyendo a la caldera, o
    el autoconsumo añadido a lo que ya hay—. Lo compone quien llama, porque
    cada medida propone algo distinto.
    """
    avisos: list[str] = []
    nombre = str((m or {}).get("nombre") or "").strip()
    if not nombre:
        return [], [], ["Sin nombre de la medida de mejora: no se escribe ninguna."]

    sistemas = {v: [] for v in SLOT_A_MM.values()}
    for slot, equipos in zip(SLOTS, instalaciones):
        sistemas[SLOT_A_MM[slot]] = _reemitible(equipos)

    economico = P.Instancia(_MM, "AnalisisEconomicoConjuntoMM", {
        Cadena("inversionInicial"): [_numf(m.get("inversion")) or 0.0],
        Cadena("costeMantenimiento"): [_numf(m.get("coste_mantenimiento")) or 0.0],
        Cadena("vidaUtil"): [_numf(m.get("vida_util")) or 0.0],
        Cadena("analisisTeorico"): _sin_calcular(),
        Cadena("analisisFacturas"): _sin_calcular(),
    })

    instal = _reemitible(instalaciones)
    estado = {
        Cadena("nombre"): nombre,
        Cadena("caracteristicas"): str(m.get("caracteristicas") or ""),
        Cadena("otrosDatos"): str(m.get("otros_datos") or ""),
        Cadena("datosInstalaciones"): instal,
        Cadena("mejoras"): [[], ["", instal, True]],
        Cadena("medidasMejoraEnvolvente"): [],
        Cadena("cerramientosMejorados"): _reemitible(envolvente[0]),
        Cadena("huecosMejorados"): _reemitible(envolvente[1]),
        Cadena("puentesTermicosMejorados"): _reemitible(envolvente[2]),
        Cadena("analisisEconomico"): economico,
        # Lo que calcula CE3X. Se entrega vacio a proposito: ver la nota de
        # arriba. El certificador pulsa «Actualizar» y los rellena su motor.
        Cadena("ahorro"): [0.0] * 6,
        Cadena("datosEdificioOriginal"): None,
        Cadena("datosNuevoEdificio"): None,
    }
    for clave in SLOT_A_MM.values():
        estado[Cadena(clave)] = sistemas[clave]

    avisos.append(f"Medida de mejora «{nombre}» escrita SIN calcular: abre "
                  "Medidas de Mejora en CE3X y pulsa Actualizar para que salgan "
                  "su ahorro y su calificacion.")

    fila = ["Nuevas Instalaciones", nombre, "Instalaciones",
            _num(m.get("vida_util")), _num(m.get("inversion")),
            _num(m.get("coste_mantenimiento") or 0)]
    return [P.Instancia(_MM, "grupoMedidasMejora", estado)], fila, avisos


#: Los PRECIOS DE LA ENERGIA del analisis economico de CE3X: diez casillas que
#: se tecleaban a mano en cada certificado. Estos son los que usa Brokergy,
#: copiados del `.cex` revisado de 26RES060_186 y contrastados con el corpus:
#: de 238 ficheros con precios, 75 llevan exactamente este juego y son los mas
#: recientes (desde 2025-12; su mediana es 2026-05). Otros 81 son el mismo con
#: la casilla 3 —la que mas se mueve— en 0.3, y van de 2023 a 2025.
#:
#: REGLA — se escriben solo en el HUECO. Un certificado que ya los trae los ha
#: tecleado alguien, y pisarlos cambiaria el analisis economico de sus medidas
#: sin que nadie lo note. Van como TEXTO porque asi los guarda CE3X.
PRECIOS_ENERGIA = ["0.0717", "0.0934", "0.2", "0.1095", "0.15",
                   "0.0934", "0.05", "0.05", "4.5", "0.92"]


def construir_resumen_medidas(filas: list[list], plantilla: Any) -> list:
    """El pickle 6: los precios de la energia y una fila por medida."""
    base = (list(plantilla) if isinstance(plantilla, list) and len(plantilla) == 4
            else [[], [""] * 10, [], None])
    precios = base[1] if isinstance(base[1], list) and len(base[1]) == 10 else [""] * 10
    base[1] = [p if str(p).strip() else PRECIOS_ENERGIA[i]
               for i, p in enumerate(precios)]
    base[2] = [f for f in (filas or []) if f]
    return base


# --------------------------------------------------------------------------
# El cuadro de texto del informe (pickle 11)
# --------------------------------------------------------------------------

#: Las SIETE casillas del dialogo «Opciones del Informe» de CE3X, medidas sobre
#: 59 de 60 .cex del corpus (el unico que no lo trae es una plantilla virgen,
#: donde el pickle 11 es una lista VACIA). Sin medidas de mejora definidas, la
#: casilla 0 va vacia: es como lo escriben los 19 ficheros sin medidas.
_INFORME_VACIO = ["", "", "", "", "", ["", "", ""], ["", "", ""]]


def _fecha_cex(valor: Any) -> list[str] | None:
    """'2026-09-13' -> ['13', '09', '2026'], que es como lo guarda CE3X.

    Devuelve None si no hay fecha: una casilla de fecha en blanco es mejor que
    una fecha inventada, porque esa fecha se imprime en el certificado.
    """
    texto = str(valor or "").strip()
    if not texto:
        return None
    trozos = texto[:10].split("-")
    if len(trozos) != 3 or not all(t.isdigit() for t in trozos):
        return None
    ano, mes, dia = trozos
    return [f"{int(dia):02d}", f"{int(mes):02d}", ano]


def construir_informe(datos: dict, plantilla: Any) -> tuple[list, list[str]]:
    """Las casillas del informe: el texto de las pruebas y las dos fechas.

    Es lo unico del dialogo que sale del expediente. La casilla 0 (el conjunto
    de medidas que se incluye en el informe) NO se toca: la escribe CE3X al
    elegir el grupo, y ponerle un nombre que no exista en el fichero dejaria el
    informe apuntando a una medida que no esta.
    """
    inf = datos.get("informe") or {}
    base = (list(plantilla) if isinstance(plantilla, list) and len(plantilla) == 7
            else list(_INFORME_VACIO))
    avisos: list[str] = []

    texto = str(inf.get("pruebas") or "").strip()
    if texto:
        base[3] = texto
    else:
        avisos.append("Sin texto de pruebas y comprobaciones: ese cuadro del"
                      " informe sale vacio y hay que escribirlo en CE3X.")

    for clave, i, que in (("fecha_emision", 5, "emision"),
                          ("fecha_visita", 6, "visita")):
        fecha = _fecha_cex(inf.get(clave))
        if fecha:
            base[i] = fecha
        elif not (isinstance(base[i], list) and any(base[i])):
            avisos.append(f"No consta la fecha de {que}: se deja en blanco para"
                          " ponerla en CE3X.")
    return base, avisos


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
        informe, av_inf = construir_informe(datos, L.leer(base, INFORME))
        avisos.extend(av_inf)
        nuevos = {
            ADMINISTRATIVOS: construir_administrativos(datos, L.leer(base, ADMINISTRATIVOS)),
            GENERALES: construir_generales(datos, L.leer(base, GENERALES)),
            ENVOLVENTE: envolvente,
            INSTALACIONES: instalaciones,
            INFORME: informe,
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
