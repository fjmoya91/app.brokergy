"""La VERSION del .cex: CE3X 2.3 (hasta el 30/09/2026) y CE3X 3.1 (desde el 01/10/2026).

QUE CAMBIA DE UNA A OTRA — PREGUNTADO A LA PROPIA 3.1
-----------------------------------------------------
Nada de esto esta deducido mirando ficheros a ojo: se le pregunto a CE3X 3.1
ejecutando su propio codigo (el Python 2.7 que trae instalado, ver
`tools/oraculo_ce3x/`), y se contrasto con los 5 ejemplos oficiales que trae y
con un .cex que un tecnico migro a mano. Abriendo un .cex 2.3 de la app, sus
paneles devuelven lo que guardaria la 3.1, lo que exige para calificar y lo que
exige para escribir el XML del certificado.

  pickle 0   la cabecera: 'CEXv2.3 Residencial' -> 'CE3Xv3.1 Residencial'
             (y lo mismo con PequeñoTerciario / GranTerciario).
  pickle 1   26 -> 29 campos: [26] grado de proteccion, [27] partes protegidas
             (lista), [28] uso del edificio (RD 390/2021). Y [25], la
             titulacion, pasa a ser un DESPLEGABLE de 21 opciones: un texto que
             no case con ninguna sale en el XML como «Otra(.*)».
  pickle 2   21 -> 26 campos: [21] normativa «otros», [22] superficie util
             (RD 390/2021), [23] nº de viviendas o unidades de uso, [24] plantas
             bajo rasante, [25] plantas sobre rasante. La 3.1 NO CALIFICA con
             ellos vacios («Revise los siguientes campos de la pestaña de Datos
             Generales…»). La normativa pasa de 4 a 7 tramos (`NORMATIVAS`).
  pickle 3   la envolvente, IGUAL.
  pickle 4   12 -> 14 slots ([12] generadores termosolares, [13] generadores
             electricos, objetos nuevos). Los equipos que NO son una caldera
             estimada ganan un BLOQUE DE POTENCIAS [ACS, calefaccion,
             refrigeracion] en kW, justo antes de la zona, y su cola gana el TIPO
             DE BOMBA DE CALOR (0 Aire-Aire, 1 Aire-Agua, 2 Agua-Aire, 3
             Agua-Agua). Sin esas potencias la 3.1 califica pero NO ESCRIBE EL
             XML («termo ACS: Rellene potencia ACS»). Una caldera estimada no lo
             necesita: su potencia ya va en su cola, y es la que el XML de la
             3.1 declara (medido: 27,80 kW en el XML de un .cex migrado, la de
             su cola). Las placas de autoconsumo exigen su potencia pico (7.º
             elemento del bloque de energia): sin ella el XML sale sin
             `<Tablas>` y el PDF con la marca de agua de «incompleto».
  pickle 5   las medidas: la 3.1 abre y calcula las de la 2.3 tal cual (los
             ejemplos oficiales de la 3.1 las traen asi), y su XML solo lleva sus
             indicadores, no sus equipos.
  pickle 11  el informe: 7 -> 8 casillas (la 8.ª, un texto, va vacia).
  pickles 6-10, 12-14  iguales; el HMAC del 14 la 3.1 tampoco lo comprueba.

Y LO QUE NO CAMBIA: el CALCULO. Medido con el motor de la 3.1 sobre el mismo
fichero de la app (26RES093_9): demanda de calefaccion 266,71, ACS 12,50,
refrigeracion 18,58 y emisiones 35,23 — las mismas cifras que dio la 2.3. Ni
la normativa (sus seis valores) ni el tipo de bomba de calor (los cuatro)
mueven un decimal. Un CEE inicial de la 2.3 y un final de la 3.1 siguen siendo
comparables.

COMO SE USA
-----------
Los escritores de `generar_cex.py` siguen produciendo la forma 2.3: estan
medidos sobre 1.600 `.cex` reales y son la fuente unica de cada registro. Este
modulo trabaja en las FRONTERAS:

  · al ESCRIBIR una 3.1 eleva lo construido (`elevar`) y pone la cabecera;
  · al LEER un .cex 3.1 baja sus equipos a la forma interna
    (`instalaciones_a_23`) y guarda aparte lo que la 2.3 no tiene (potencias,
    tipo de bomba, los dos slots nuevos) para devolverlo intacto al escribir.

Asi el resto del motor no tiene que saber que hay dos versiones.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Callable

from errores import GeneracionError

VERSIONES = ("2.3", "3.1")

#: Desde el 01/10/2026 se certifica con la 3.1. La 2.3 queda para lo que ya
#: estaba hecho con ella y para quien la pida expresamente.
POR_DEFECTO = "3.1"

#: Lo que escribe cada programa en el pickle 0. La ñ es la de CE3X.
TEXTO = {
    ("2.3", "residencial"): "CEXv2.3 Residencial",
    ("2.3", "pequeno_terciario"): "CEXv2.3 PequeñoTerciario",
    ("2.3", "gran_terciario"): "CEXv2.3 GranTerciario",
    ("3.1", "residencial"): "CE3Xv3.1 Residencial",
    ("3.1", "pequeno_terciario"): "CE3Xv3.1 PequeñoTerciario",
    ("3.1", "gran_terciario"): "CE3Xv3.1 GranTerciario",
}

#: Los indices de los pickles que cambian de forma entre versiones.
ADMINISTRATIVOS, GENERALES, INSTALACIONES, MEDIDAS, INFORME = 1, 2, 4, 5, 11


def texto(version: str, tipo: str) -> str:
    t = TEXTO.get((version, tipo))
    if t is None:
        raise GeneracionError(f"version {version!r} / programa {tipo!r} no contemplados")
    return t


def cabecera(version: str, tipo: str) -> bytes:
    """El pickle 0 tal y como lo escribe CE3X, sin el CRLF (lo repone quien monta).

    Es un STRING de Python 2: la ñ va ESCAPADA (`\\xf1`, cuatro bytes), copiado
    byte a byte de los `.cex` reales de las dos versiones.
    """
    return b"S'" + texto(version, tipo).replace("ñ", "\\xf1").encode("ascii") + b"'\np0\n."


def de_cabecera(cab: Any) -> tuple[str, str] | None:
    """(version, programa) de un pickle 0 ya leido, o None si no es uno conocido."""
    for clave, valor in TEXTO.items():
        if valor == cab:
            return clave
    return None


def version_de(cex: Any) -> str | None:
    """La version de un .cex ya troceado (`leer_cex.Cex`)."""
    vt = de_cabecera(getattr(cex, "version", None))
    return vt[0] if vt else None


def programa_de(cex: Any) -> str | None:
    """El programa (residencial / pequeño / gran terciario) de un .cex troceado."""
    vt = de_cabecera(getattr(cex, "version", None))
    return vt[1] if vt else None


def version_pedida(datos: dict | None, defecto: str | None = None) -> str:
    """La version con la que se escribe. Sin decir nada, la vigente (3.1)."""
    v = str((datos or {}).get("version_ce3x") or defecto or POR_DEFECTO).strip()
    if v not in VERSIONES:
        raise GeneracionError(
            f"version de CE3X {v!r} no contemplada; son {', '.join(VERSIONES)}")
    return v


# --------------------------------------------------------------------------
# Las listas cerradas de la 3.1 (leidas de su codigo, en su orden)
# --------------------------------------------------------------------------

#: `moduloXML.listadosXML.listadoTitulacion`. La ultima es «Otra(.*)»: cuando
#: el texto no casa, la 3.1 escribe eso TAL CUAL en el XML del certificado.
TITULACIONES = (
    "Arquitectura", "Arquitectura técnica o aparejadores",
    "Ingeniería Aeronáutica", "Ingeniería Agrónoma",
    "Ingeniería de Caminos, Canales y Puertos", "Ingeniería Industrial",
    "Ingeniería de Minas", "Ingeniería de Montes", "Ingeniería Naval y Oceánica",
    "Ingeniería de Telecomunicación", "Ingeniería Técnica Aeronáutica",
    "Ingeniería Técnica Agrícola", "Ingeniería Técnica Forestal",
    "Ingeniería Técnica Industrial", "Ingeniería Técnica de Minas",
    "Ingeniería Técnica Naval", "Ingeniería Técnica de Obras Públicas",
    "Ingeniería Técnica Telecomunicación", "Ingeniería Técnica Topógrafía",
    "Ingeniería Química", "Otra(.*)",
)

#: El desplegable «Grado de proteccion» de Datos administrativos
#: (`Calculos.listados.Proteccion.getListadoGradosProteccion`). Se guarda la
#: clave; la 3.1 rotula «Integral o equivalente», etc.
GRADOS_PROTECCION = ("Ninguna", "Integral", "Estructural", "Ambiental")

#: «Partes protegidas» (`Proteccion.getListadoProteccionesParaGuardar`): se
#: marcan las que lo estan y se guarda la LISTA de las marcadas.
PARTES_PROTEGIDAS = ("Fachada", "Cubierta", "Portal", "Escaleras", "Patio", "Otro")

#: El «Uso del edificio» (RD 390/2021). Son DOS listas y dependen del PROGRAMA
#: (`Calculos.listadosWeb.listadoUsoEdificioResidencial` / `...Terciario`): el
#: residencial solo ofrece los dos primeros, y el terciario los once suyos — sin
#: «Residencial publico», aunque un hotel lo sea por el RD. Un valor fuera de la
#: lista de su programa es un desplegable que CE3X no sabe enseñar.
USOS_RESIDENCIAL = ("ResidencialPrivado", "ResidencialPublico")
USOS_TERCIARIO = ("Administrativo", "Sanitario", "Comercial", "Docente", "Cultural",
                  "Deportivo", "Restauracion", "Transporte", "ActividadesRecreativas",
                  "Religioso", "Otro")
USOS = USOS_RESIDENCIAL + USOS_TERCIARIO

#: La normativa vigente: (valor que se guarda, rotulo de la 3.1). Los valores
#: de la 2.3 siguen valiendo; la 3.1 añade tres y parte los tramos de otra forma.
NORMATIVAS = (
    ("Anterior", "Antes 1980"), ("NBE-CT-79", "1980 - 1998"),
    ("NBE-CT-79_aPartir1998", "1998 - 2007"), ("C.T.E.", "2007 - 2013"),
    ("CTE 2013", "2014 - 2020"), ("Apartir2020", "Después 2020"),
    ("Otros", "Otros (post 2020)"),
)

#: `listadosXML.listadoOpcionesBdC`: el entero que va en la cola del equipo.
TIPOS_BDC = ("Aire-Aire", "Aire-Agua", "Agua-Aire", "Agua-Agua")


def normativa_31(anio: Any, normativa_23: Any = None) -> str:
    """La normativa de la 3.1 para un año de construccion.

    Los rotulos de la 3.1 se solapan en los extremos («1980 - 1998»,
    «1998 - 2007»): 1998 va a la de a partir de 1998 (lo dice su nombre) y 2007
    al C.T.E., que es de 2006 y se exige desde 2007. Medido con el motor de la
    3.1: la normativa NO cambia el calculo, solo lo que declara el XML
    (`NormativaEdificacion`).
    """
    a = _num(anio)
    if a is None:
        n = str(normativa_23 or "").strip()
        return n if n in dict(NORMATIVAS) else "Anterior"
    if a < 1980:
        return "Anterior"
    if a < 1998:
        return "NBE-CT-79"
    if a < 2007:
        return "NBE-CT-79_aPartir1998"
    if a < 2014:
        return "C.T.E."
    if a <= 2020:
        return "CTE 2013"
    return "Apartir2020"


def normativa_23(normativa: Any) -> str:
    """Lo mismo al reves: la 2.3 no conoce los tres tramos nuevos."""
    n = str(normativa or "").strip()
    return {"NBE-CT-79_aPartir1998": "NBE-CT-79", "Apartir2020": "CTE 2013",
            "Otros": "CTE 2013"}.get(n, n)


def _plano(x: Any) -> str:
    s = unicodedata.normalize("NFD", str(x or "").upper())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


#: Que palabra de la titulacion dice que opcion es, dentro de cada rama.
_TIT_TECNICA = (
    ("INDUSTRIAL", "Ingeniería Técnica Industrial"),
    ("AGRICOL", "Ingeniería Técnica Agrícola"),
    ("FORESTAL", "Ingeniería Técnica Forestal"),
    ("MINAS", "Ingeniería Técnica de Minas"),
    ("NAVAL", "Ingeniería Técnica Naval"),
    ("OBRAS PUBLICAS", "Ingeniería Técnica de Obras Públicas"),
    ("TELECOMUNICACION", "Ingeniería Técnica Telecomunicación"),
    ("TOPOGRAF", "Ingeniería Técnica Topógrafía"),
    ("AERONAUT", "Ingeniería Técnica Aeronáutica"),
)
_TIT_SUPERIOR = (
    ("CAMINOS", "Ingeniería de Caminos, Canales y Puertos"),
    ("INDUSTRIAL", "Ingeniería Industrial"),
    ("AGRONOM", "Ingeniería Agrónoma"),
    ("MINAS", "Ingeniería de Minas"),
    ("MONTES", "Ingeniería de Montes"),
    ("NAVAL", "Ingeniería Naval y Oceánica"),
    ("TELECOMUNICACION", "Ingeniería de Telecomunicación"),
    ("AERONAUT", "Ingeniería Aeronáutica"),
    ("QUIMIC", "Ingeniería Química"),
)


def titulacion_ce3x(txt: Any) -> str | None:
    """La opcion del desplegable de la 3.1 para una titulacion escrita a mano.

    Las que hay hoy en la app: «ARQUITECTO» -> Arquitectura; «GRADUADO EN
    INGENIERÍA DE LA EDIFICACIÓN» (colegiados en el COAATM) -> Arquitectura
    técnica o aparejadores; «INGENIERO INDUSTRIAL» y «GRADUADO EN INGENIERÍA
    INDUSTRIAL» -> Ingeniería Industrial (la que eligio el propio tecnico al
    migrar su CEE en la 3.1). Si ya es una opcion, tal cual. Sin casar, None:
    mejor decirlo que escribir «Otra(.*)» en el XML de un certificado.
    """
    t = _plano(txt)
    if not t:
        return None
    for opcion in TITULACIONES[:-1]:
        if _plano(opcion) == t:
            return opcion
    if "EDIFICACION" in t or "APAREJADOR" in t or ("ARQUITECT" in t and "TECNIC" in t):
        return "Arquitectura técnica o aparejadores"
    if "ARQUITECT" in t:
        return "Arquitectura"
    if "INGENIER" in t:
        tabla = _TIT_TECNICA if "TECNIC" in t else _TIT_SUPERIOR
        for clave, opcion in tabla:
            if clave in t:
                return opcion
    return None


def uso_de_actividad(actividad: Any) -> str:
    """El uso del edificio (RD 390/2021) de un TERCIARIO, por su actividad.

    La actividad es la de la iluminacion (CTE HE-3), que ya se pregunta al
    elegir el tipo de edificio. Lo que no casa va a «Otro», que es una opcion
    de la 3.1 y no afirma nada que no se sepa.
    """
    a = _plano(actividad)
    # Un hotel o una residencia son «Residencial publico» por el RD 390/2021,
    # pero el desplegable del TERCIARIO de la 3.1 no lo ofrece: van a «Otro».
    for clave, uso in (("ADMINISTRATIV", "Administrativo"),
                       ("OFICINA", "Administrativo"), ("HOSPITAL", "Sanitario"),
                       ("SANITARI", "Sanitario"), ("DIAGNOSTICO", "Sanitario"),
                       ("COMERCI", "Comercial"), ("TIENDA", "Comercial"),
                       ("AULA", "Docente"), ("DOCENT", "Docente"), ("ENSENANZA", "Docente"),
                       ("BIBLIOTECA", "Cultural"), ("MUSEO", "Cultural"), ("CULTUR", "Cultural"),
                       ("DEPORT", "Deportivo"), ("GIMNASIO", "Deportivo"),
                       ("RESTAURA", "Restauracion"), ("CAFETER", "Restauracion"),
                       ("TRANSPORTE", "Transporte"), ("ESTACION", "Transporte"),
                       ("RELIGIOS", "Religioso"), ("CULTO", "Religioso"), ("IGLESIA", "Religioso"),
                       ("ESPECTACUL", "ActividadesRecreativas"), ("OCIO", "ActividadesRecreativas")):
        if clave in a:
            return uso
    return "Otro"


# --------------------------------------------------------------------------
# Lo que la 3.1 pide y la 2.3 no tenia: de donde sale cada cosa
# --------------------------------------------------------------------------

def _num(x: Any) -> float | None:
    if x is None or isinstance(x, bool):
        return None
    try:
        return float(str(x).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _txt_num(x: Any) -> str:
    """Un numero como lo guarda CE3X en un campo de texto: '15.5', '1.5', '221'."""
    v = _num(x)
    if v is None:
        return ""
    return str(int(v)) if v == int(v) and abs(v) < 1e9 else repr(round(v, 2))


def _val(e: Any) -> Any:
    return e.get("valor") if isinstance(e, dict) and "valor" in e else e


def extra_31(datos: dict | None) -> dict:
    """Los datos de la 3.1 de una FICHA de la app, con sus valores por defecto.

    `datos["ce3x31"]` manda (lo corregido en la pantalla); lo demas se deriva de
    lo que la ficha ya trae. Los defectos son los de los 6 `.cex` de la 3.1 que
    hay en el disco: superficie util = la habitable, plantas sobre rasante = las
    habitables, ninguna bajo rasante y una unidad de uso salvo en un bloque.
    """
    d = datos or {}
    c = d.get("ce3x31") or {}
    g = d.get("generales") or {}
    t = d.get("tecnico") or {}
    tipo_ed = str(_val(g.get("tipo_edificio")) or "")
    unidades = c.get("unidades_uso")
    if unidades in (None, "") and tipo_ed != "Bloque de Viviendas":
        unidades = 1
    tit = c.get("titulacion") or titulacion_ce3x(t.get("titulacion"))
    terciario = str(d.get("tipo_edificio_ce3x") or "residencial") != "residencial"
    uso = c.get("uso") or (uso_de_actividad(((d.get("iluminacion") or {}).get("defecto")
                                              or {}).get("actividad"))
                           if terciario else "ResidencialPrivado")
    bajo = c.get("plantas_bajo_rasante")
    usos = USOS_TERCIARIO if terciario else USOS_RESIDENCIAL
    return {
        # La que se ELIGIO en la app (los 7 tramos de la 3.1). Sin ella se
        # vuelve a decidir por el año (`generales_a_31`).
        "normativa": c.get("normativa") if c.get("normativa") in dict(NORMATIVAS) else None,
        "titulacion": tit if tit in TITULACIONES[:-1] else None,
        "grado_proteccion": c.get("grado_proteccion") if c.get("grado_proteccion")
        in GRADOS_PROTECCION else "Ninguna",
        "partes_protegidas": [str(x) for x in (c.get("partes_protegidas") or [])
                              if str(x) in PARTES_PROTEGIDAS],
        "uso": uso if uso in usos else ("Otro" if terciario else "ResidencialPrivado"),
        "superficie_util": _txt_num(c.get("superficie_util")
                                    or _val(g.get("superficie_util_habitable"))),
        "unidades_uso": _txt_num(unidades),
        "plantas_sobre_rasante": _txt_num(c.get("plantas_sobre_rasante")
                                          or _val(g.get("n_plantas_habitables"))),
        "plantas_bajo_rasante": _txt_num(bajo if bajo not in (None, "") else 0),
        "normativa_otros": str(c.get("normativa_otros") or ""),
        "recomendaciones": _recomendaciones(d),
        "justificaciones": _justificaciones(d),
    }


def _recomendaciones(datos: dict | None) -> str:
    """El texto de «Recomendaciones para un uso eficiente» que manda la app
    (`informe.recomendaciones`, en texto llano: los `<br>` los pone
    `informe_a_31`)."""
    return str(((datos or {}).get("informe") or {}).get("recomendaciones") or "").strip()


def extra_de_cex(p1: Any, p2: Any, datos: dict | None = None) -> dict:
    """Lo mismo, de un .cex que ya existe (para convertir uno de la 2.3).

    Sale de lo que el propio fichero dice —la superficie, las plantas habitables
    y la titulacion que tecleo el tecnico—, y lo que traiga `datos["ce3x31"]`
    (del expediente) manda.
    """
    p1 = list(p1) if isinstance(p1, list) else []
    p2 = list(p2) if isinstance(p2, list) else []
    tipo_ed = str(p2[1]) if len(p2) > 1 else ""
    residencial = tipo_ed in ("Unifamiliar", "Bloque de Viviendas", "Vivienda Individual", "")
    usos = USOS_RESIDENCIAL if residencial else USOS_TERCIARIO
    base = {
        "normativa": None,
        "titulacion": titulacion_ce3x(p1[25] if len(p1) > 25 else None),
        "grado_proteccion": "Ninguna",
        "partes_protegidas": [],
        "uso": "ResidencialPrivado" if residencial else "Otro",
        "superficie_util": _txt_num(p2[6]) if len(p2) > 6 else "",
        "unidades_uso": "" if tipo_ed == "Bloque de Viviendas" else "1",
        "plantas_sobre_rasante": _txt_num(p2[8]) if len(p2) > 8 else "",
        "plantas_bajo_rasante": "0",
        "normativa_otros": "",
    }
    c = (datos or {}).get("ce3x31") or {}
    for k, v in c.items():
        if v not in (None, "") and k in base:
            base[k] = _txt_num(v) if k in ("superficie_util", "unidades_uso",
                                            "plantas_sobre_rasante",
                                            "plantas_bajo_rasante") else v
    if base["normativa"] not in dict(NORMATIVAS):
        base["normativa"] = None
    if base["uso"] not in usos:
        base["uso"] = "ResidencialPrivado" if residencial else "Otro"
    if base["grado_proteccion"] not in GRADOS_PROTECCION:
        base["grado_proteccion"] = "Ninguna"
    base["partes_protegidas"] = [str(x) for x in (base["partes_protegidas"] or [])
                                 if str(x) in PARTES_PROTEGIDAS]
    base["recomendaciones"] = _recomendaciones(datos)
    base["justificaciones"] = _justificaciones(datos)
    return base


# --------------------------------------------------------------------------
# Pickles 1, 2 y 11
# --------------------------------------------------------------------------

def administrativos_a_31(p1: Any, ext: dict) -> tuple[list, list[str]]:
    """Los 29 campos del pickle 1. Lo que ya traiga una 3.1 se respeta."""
    out = list(p1) if isinstance(p1, list) else []
    out += [""] * (26 - len(out)) if len(out) < 26 else []
    avisos: list[str] = []
    era_31 = len(out) >= 29
    actual = str(out[25] or "")
    tit = titulacion_ce3x(actual) if era_31 and actual in TITULACIONES else (
        ext.get("titulacion") or titulacion_ce3x(actual))
    if tit:
        out[25] = tit
    elif actual and actual not in TITULACIONES:
        avisos.append(
            f"La titulación «{actual}» no casa con ninguna del desplegable de CE3X 3.1: "
            "en el XML saldría «Otra(.*)». Elígela en Datos administrativos antes de "
            "registrar el certificado.")
    if era_31:
        out = out[:29]
        out[26] = out[26] or ext.get("grado_proteccion") or "Ninguna"
        out[27] = out[27] if isinstance(out[27], list) else []
        out[28] = out[28] or ext.get("uso") or "ResidencialPrivado"
    else:
        out = out[:26] + [ext.get("grado_proteccion") or "Ninguna",
                          list(ext.get("partes_protegidas") or []),
                          ext.get("uso") or "ResidencialPrivado"]
    return out, avisos


def administrativos_a_23(p1: Any) -> list:
    return (list(p1) if isinstance(p1, list) else [])[:26]


def generales_a_31(p2: Any, ext: dict) -> tuple[list, list[str]]:
    """Los 26 campos del pickle 2. Lo que ya traiga una 3.1 se respeta."""
    out = list(p2) if isinstance(p2, list) else []
    era_31 = len(out) >= 26
    out += [""] * (21 - len(out)) if len(out) < 21 else []
    avisos: list[str] = []
    if ext.get("normativa") in dict(NORMATIVAS):
        # La que se eligio en la app manda: puede no ser la del año (una
        # rehabilitacion integral, «Otros (post 2020)»).
        out[0] = ext["normativa"]
    elif not era_31 or str(out[0] or "") not in dict(NORMATIVAS):
        # La normativa de la 2.3 no se traduce una a una (los tramos son otros):
        # se vuelve a decidir por el año, que es de donde salia.
        out[0] = normativa_31(out[19], out[0])
    nuevos = [ext.get("normativa_otros") or "",
              ext.get("superficie_util") or _txt_num(out[6]),
              ext.get("unidades_uso") or "",
              ext.get("plantas_bajo_rasante") or "0",
              ext.get("plantas_sobre_rasante") or _txt_num(out[8])]
    if era_31:
        out = out[:26]
        for i, v in zip(range(21, 26), nuevos):
            if str(out[i] or "").strip() == "":
                out[i] = v
    else:
        out = out[:21] + nuevos
    if not str(out[23] or "").strip():
        avisos.append("Falta el nº de viviendas o unidades de uso (Datos generales): la 3.1 "
                      "no califica sin él. Ponlo en CE3X antes de calcular.")
    return out, avisos


def generales_a_23(p2: Any) -> list:
    out = (list(p2) if isinstance(p2, list) else [])[:21]
    if out:
        out[0] = normativa_23(out[0])
    return out


#: Las dos casillas de TEXTO del informe: [3] pruebas, comprobaciones e
#: inspecciones (Anexo IV) y [7] recomendaciones para un uso eficiente (Anexo
#: III, 1), que solo existe en la 3.1.
INFORME_PRUEBAS, INFORME_RECOMENDACIONES = 3, 7

_BR = re.compile(r"<br\s*/?>", re.I)


def texto_html_31(texto: Any) -> Any:
    """Un texto del informe tal y como hay que escribirlo en la 3.1: `<br>` en
    cada salto de linea.

    CE3X 3.1 mete el texto TAL CUAL en el XML del certificado, como
    `data:text/html,<h1>…</h1>`, y en HTML un salto de linea es un espacio: el
    PDF oficial salia con todo el cuadro en un solo parrafo. Medido con
    xml2cert (02/10/2026): con `<br>` cada linea sale en la suya, y la primera
    en negrita (el <h1>). Se conserva el salto detras del `<br>` para que en el
    cuadro de CE3X se siga leyendo por lineas. Un texto que ya lleva `<br>` no
    se toca (lo escribio asi alguien, o ya paso por aqui).
    """
    if not isinstance(texto, str) or not texto or _BR.search(texto):
        return texto
    return re.sub(r"\r?\n", "<br>\n", texto)


def texto_llano_23(texto: Any) -> Any:
    """Lo contrario: en la 2.3 el PDF no es HTML y el `<br>` saldria impreso."""
    if not isinstance(texto, str) or not _BR.search(texto):
        return texto
    return _BR.sub("", texto)


def informe_a_31(inf: Any, recomendaciones: str | None = None) -> Any:
    """El informe con su 8.ª casilla (las recomendaciones de uso) y sus textos
    con `<br>` (`texto_html_31`).

    Las recomendaciones se ponen solo si la casilla esta VACIA: en un .cex de la
    3.1 que ya trae las suyas (las escribio el tecnico) mandan las suyas.
    """
    if not isinstance(inf, list) or len(inf) not in (7, 8):
        return inf
    out = list(inf) + ([""] if len(inf) == 7 else [])
    if recomendaciones and not str(out[INFORME_RECOMENDACIONES] or "").strip():
        out[INFORME_RECOMENDACIONES] = str(recomendaciones)
    for i in (INFORME_PRUEBAS, INFORME_RECOMENDACIONES):
        out[i] = texto_html_31(out[i])
    return out


def _justificaciones(datos: dict | None) -> dict:
    """{nombre del conjunto: (justificacion, secuencia)} de las medidas que manda
    la app (`medidas[]` y la `retirada` del CEE final). Texto llano."""
    d = datos or {}
    out: dict = {}
    for m in list(d.get("medidas") or []) + [d.get("retirada")]:
        if not isinstance(m, dict):
            continue
        nombre = str(m.get("nombre") or "").strip()
        texto = str(m.get("justificacion") or "").strip()
        if nombre and texto:
            try:
                sec = int(m.get("secuencia") or 2)
            except (TypeError, ValueError):
                sec = 2
            out[nombre] = (texto, sec)
    return out


def medidas_a_31(grupos: Any, justificaciones: dict | None = None) -> Any:
    """Los conjuntos de medidas con los dos campos que añade la 3.1: el ORDEN de
    ejecucion (`ordenPrioridad`) y la JUSTIFICACION (`justificacion`).

    Es el apartado 3 del Anexo III del certificado, «Propuesta de secuencia
    temporal de las medidas de mejora» (medido en un .cex guardado por la 3.1:
    `ordenPrioridad` es un texto, '1', '2'…, y `justificacion` el texto libre).
    El PDF une las justificaciones de todos los conjuntos en un solo cuadro
    HTML, asi que cada una va precedida del nombre de su medida y acaba en
    `<br>` (si no, la siguiente se pegaria a su ultima linea).

    El ORDEN sale de la `secuencia` que manda la app (envolvente 1, generador 2,
    renovables 3) y, a igualdad, del orden del fichero. Lo que ya trae el
    conjunto (un .cex de la 3.1 que el tecnico relleno) no se toca: solo se
    ponen los `<br>` a su justificacion.
    """
    if not isinstance(grupos, list):
        return grupos
    import pickle0 as P

    just = justificaciones or {}
    filas = []
    for i, g in enumerate(grupos):
        est = getattr(g, "estado", None)
        if not isinstance(est, dict):
            continue
        nombre = str(est.get(P.Cadena("nombre")) or "").strip()
        filas.append((just.get(nombre, (None, 9))[1], i, g, est, nombre))

    for orden, (_, _, g, est, nombre) in enumerate(sorted(filas, key=lambda f: (f[0], f[1])), 1):
        if not str(est.get(P.Cadena("ordenPrioridad")) or "").strip():
            est[P.Cadena("ordenPrioridad")] = str(orden)
        actual = str(est.get(P.Cadena("justificacion")) or "").strip()
        if actual:
            est[P.Cadena("justificacion")] = texto_html_31(actual)
            continue
        texto = just.get(nombre, ("", 9))[0]
        if texto:
            est[P.Cadena("justificacion")] = texto_html_31(f"{nombre}: {texto}") + "<br>"
        else:
            est[P.Cadena("justificacion")] = ""
    return grupos


def medidas_a_23(grupos: Any) -> Any:
    """Lo contrario: la 2.3 no tiene esos dos campos y no se le escriben."""
    if not isinstance(grupos, list):
        return grupos
    for g in grupos:
        est = getattr(g, "estado", None)
        if isinstance(est, dict):
            for k in [k for k in est if str(k) in ("ordenPrioridad", "justificacion")]:
                del est[k]
    return grupos


def informe_a_23(inf: Any) -> Any:
    if not isinstance(inf, list):
        return inf
    out = list(inf[:7]) if len(inf) > 7 else list(inf)
    if len(out) > INFORME_PRUEBAS:
        out[INFORME_PRUEBAS] = texto_llano_23(out[INFORME_PRUEBAS])
    return out


def informe_valido(inf: Any) -> bool:
    """Un informe con forma conocida: 7 casillas (2.3) u 8 (3.1)."""
    return isinstance(inf, list) and len(inf) in (7, 8)


# --------------------------------------------------------------------------
# Pickle 4: los equipos
# --------------------------------------------------------------------------

SLOTS = ["ACS", "calefaccion", "refrigeracion", "climatizacion", "mixto2",
         "mixto3", "renovable", "iluminacion", "ventilacion", "ventiladores",
         "bombas", ""]

#: Que servicios ([0] ACS, [1] calefaccion, [2] refrigeracion) da cada slot. Es
#: el orden del bloque de potencias y el del bloque [5] de superficies.
SERVICIOS_SLOT = {"ACS": (0,), "calefaccion": (1,), "refrigeracion": (2,),
                  "climatizacion": (1, 2), "mixto2": (0, 1), "mixto3": (0, 1, 2)}

#: Cuantos campos tiene cada uno en la 2.3 (en la 3.1, uno mas: las potencias).
LARGO_23 = {"ACS": 10, "calefaccion": 9, "refrigeracion": 9, "climatizacion": 9,
            "mixto2": 10, "mixto3": 10}

#: La cola de la refrigeracion YA llevaba un cuarto elemento en la 2.3 (el `0`
#: que la app escribe), y la 3.1 no le añade otro: en la 3.1 ese sitio es el tipo
#: de bomba de calor (1 en los fancoils de los ejemplos oficiales, 0 en un split).
_COLA_CON_CUARTO_23 = {"refrigeracion"}

#: Potencias por defecto cuando no se sabe la del aparato (kW). La potencia NO
#: mueve el calculo (es un dato del formulario y del XML), asi que basta una
#: cifra razonable DICHA, que el tecnico corrige si tiene la placa delante.
POTENCIA_ACS = {"Efecto Joule": 1.5}          # un termo electrico
POTENCIA_ACS_DEFECTO = 2.0
#: Calefaccion / refrigeracion: kW por m2 servido, con un minimo.
KW_M2 = 0.08
POTENCIA_MINIMA = {0: 1.5, 1: 3.0, 2: 2.5}
_ROTULO = ("ACS", "calefacción", "refrigeración")


def es_cola_caldera(cola: Any) -> bool:
    """La cola con la que CE3X ESTIMA una caldera: aislamiento, rendimiento de
    combustion, carga media, potencia, interruptores y parametros."""
    return (isinstance(cola, list) and len(cola) == 6 and isinstance(cola[0], str)
            and isinstance(cola[4], list))


def es_31(reg: Any) -> bool:
    """Si un equipo termico tiene ya la forma de la 3.1 (bloque de potencias)."""
    if not (isinstance(reg, list) and len(reg) > 1):
        return False
    tipo = str(reg[1])
    if tipo in LARGO_23:
        return len(reg) == LARGO_23[tipo] + 1
    if tipo == "renovable":
        return len(reg) > 3 and isinstance(reg[3], list) and len(reg[3]) >= 7
    return False


def equipo_a_23(reg: Any) -> tuple[Any, dict | None]:
    """Un equipo de la 3.1 en la forma de la 2.3, y lo que se le quita.

    Devuelve `(registro, meta)`; `meta` es None si ya era de la 2.3 o no es un
    equipo con forma propia de la 3.1.
    """
    if not es_31(reg):
        return reg, None
    tipo = str(reg[1])
    if tipo == "renovable":
        out = list(reg)
        out[3] = list(reg[3][:6])
        return out, {"kwp": reg[3][6]}
    out = list(reg[:-2]) + [reg[-1]]
    meta: dict = {"potencias": list(reg[-2]) if isinstance(reg[-2], list) else ["", "", ""],
                  "tipo_bdc": None}
    cola = out[7] if len(out) > 7 else None
    if (isinstance(cola, list) and not es_cola_caldera(cola)
            and tipo not in _COLA_CON_CUARTO_23 and len(cola) == 4
            and isinstance(cola[3], int) and not isinstance(cola[3], bool)):
        meta["tipo_bdc"] = cola[3]
        out[7] = list(cola[:3])
    return out, meta


def _potencia_defecto(reg: list, servicio: int) -> float | None:
    gen = str(reg[3]) if len(reg) > 3 else ""
    if servicio == 0:
        return POTENCIA_ACS.get(gen, POTENCIA_ACS_DEFECTO)
    rep = reg[5] if len(reg) > 5 and isinstance(reg[5], list) else None
    par = rep[servicio] if rep and len(rep) > servicio and isinstance(rep[servicio], list) else None
    sup = _num(par[0]) if par else None
    if sup:
        return max(POTENCIA_MINIMA[servicio], round(sup * KW_M2, 1))
    return POTENCIA_MINIMA[servicio]


def _tipo_bdc_defecto(reg: list) -> int:
    """El tipo de bomba de calor si no lo dice nadie.

    Una AEROTERMIA (que da ACS o lleva ese nombre) es AIRE-AGUA y asi la declara
    el XML (`ExpansionDirectaAireAgua`, medido en un .cex migrado); lo demas
    —un split, un termo electrico, unos radiadores— queda en 0, que es lo que
    pone la 3.1 al abrir un fichero de la 2.3. No mueve el calculo (medidos los
    cuatro tipos con el motor de la 3.1).
    """
    nombre = _plano(reg[0]) if reg else ""
    gen = str(reg[3]) if len(reg) > 3 else ""
    if "AEROTERM" in nombre:
        return 1
    if gen.startswith("Bomba de Calor") and str(reg[1]) in ("mixto2", "mixto3", "ACS"):
        return 1
    return 0


def equipo_a_31(reg: Any, pot: dict | None = None, meta: dict | None = None
                ) -> tuple[Any, list[str]]:
    """Un equipo de la 2.3 en la forma de la 3.1.

    `pot` son las potencias conocidas del aparato {acs, calefaccion,
    refrigeracion, tipo_bdc, kwp}, de la ficha (catalogo, placa); `meta` lo que
    traia el mismo equipo si venia de un fichero de la 3.1. Lo que no conste se
    pone por defecto y SE DICE.
    """
    if not (isinstance(reg, list) and len(reg) > 1):
        return reg, []
    tipo = str(reg[1])
    pot = pot or {}
    meta = meta or {}
    nombre = str(reg[0])
    if tipo == "renovable":
        return _renovable_a_31(reg, pot, meta)
    if tipo not in LARGO_23 or es_31(reg):
        return reg, []
    if len(reg) != LARGO_23[tipo]:
        raise GeneracionError(
            f"el equipo «{nombre}» ({tipo}) tiene {len(reg)} campos y la 2.3 escribe "
            f"{LARGO_23[tipo]}: no se sabe pasarlo a la 3.1 sin adivinar")
    cola = reg[7]
    if es_cola_caldera(cola):
        # Una caldera ESTIMADA declara su potencia en la cola, y es la que la 3.1
        # escribe en el XML: asi la dejan sus ejemplos oficiales (10 campos).
        return reg, []
    out = list(reg)
    if (isinstance(cola, list) and tipo not in _COLA_CON_CUARTO_23 and len(cola) == 3):
        t = pot.get("tipo_bdc")
        if t in (None, ""):
            t = meta.get("tipo_bdc")
        if t in (None, ""):
            t = _tipo_bdc_defecto(reg)
        out[7] = list(cola) + [int(t)]

    previas = list(meta.get("potencias") or ["", "", ""]) + ["", "", ""]
    claves = ("acs", "calefaccion", "refrigeracion")
    bloque = ["", "", ""]
    por_defecto = []
    for s in SERVICIOS_SLOT[tipo]:
        v = _num(pot.get(claves[s]))
        if v is None or v <= 0:
            v = _num(previas[s])
        if v is None or v <= 0:
            v = _potencia_defecto(reg, s)
            por_defecto.append(f"{_ROTULO[s]} {_txt_num(v).replace('.', ',')} kW")
        bloque[s] = _txt_num(v)
    avisos = []
    if por_defecto:
        avisos.append(
            f"«{nombre}»: no consta su potencia; va por defecto ({', '.join(por_defecto)}). "
            "No cambia el cálculo, pero CE3X 3.1 la exige para escribir el XML: corrígela "
            "en Instalaciones si tienes la placa.")
    return out[:-1] + [bloque, out[-1]], avisos


def _renovable_a_31(reg: list, pot: dict, meta: dict) -> tuple[list, list[str]]:
    """Una contribucion (placas) con su potencia pico, 7.º elemento del bloque [3]."""
    if not (len(reg) > 4 and isinstance(reg[3], list)) or es_31(reg):
        return reg, []
    bloque = (list(reg[3]) + [""] * 6)[:6]
    genera = _num(bloque[0])
    kwp = _num(pot.get("kwp")) or _num(meta.get("kwp"))
    avisos = []
    if genera and not kwp:
        # Sin potencia pico la 3.1 no escribe la tabla de renovables del XML. Se
        # estima de lo que generan: en la peninsula, unos 1.500 kWh por kWp.
        kwp = max(1.0, round(genera / 1500.0, 1))
        avisos.append(
            f"«{reg[0]}»: no consta la potencia pico de las placas; va "
            f"{_txt_num(kwp).replace('.', ',')} kWp, estimada de lo que generan "
            f"({_txt_num(genera)} kWh/año ÷ 1.500). No cambia el cálculo, pero la 3.1 la "
            "exige para el XML: corrígela si la conoces.")
    out = list(reg)
    out[3] = bloque + [_txt_num(kwp) if kwp else ""]
    return out, avisos


def instalaciones_a_23(p4: Any) -> tuple[list, dict]:
    """El pickle 4 de una 3.1 en la forma interna (12 slots de la 2.3).

    `meta` guarda, por (slot, nombre), lo que se le quita a cada equipo, y los
    dos slots nuevos tal cual: `instalaciones_a_31` lo devuelve intacto si el
    equipo sigue en el fichero. Un fichero de la 2.3 pasa sin cambios.
    """
    meta: dict = {"equipos": {}, "extra": [[], []], "era_31": False}
    if not isinstance(p4, list):
        return p4, meta
    if len(p4) >= 14:
        meta["era_31"] = True
        meta["extra"] = [p4[12] if isinstance(p4[12], list) else [],
                         p4[13] if isinstance(p4[13], list) else []]
    slots = []
    for i, lista in enumerate(p4[:12]):
        if not isinstance(lista, list):
            slots.append([])
            continue
        nueva = []
        for reg in lista:
            r23, m = equipo_a_23(reg)
            if m is not None:
                meta["era_31"] = True
                meta["equipos"][_clave(i, reg)] = m
            nueva.append(r23)
        slots.append(nueva)
    slots += [[] for _ in range(12 - len(slots))]
    return slots, meta


def _clave(i: int, reg: Any) -> tuple:
    return (i, str(reg[0]) if isinstance(reg, list) and reg else "")


def potencias_de_equipos(equipos: list | None) -> dict:
    """{nombre: {acs, calefaccion, refrigeracion, tipo_bdc, kwp}} de una ficha.

    Cada equipo de `datos["instalaciones"]` (o de una medida) puede traer
    `potencia_acs`, `potencia_calefaccion`, `potencia_refrigeracion` (kW),
    `tipo_bdc` y, unas placas, `potencia_pico_kwp`. De una caldera estimada vale
    su `potencia`, que es la misma maquina.
    """
    out: dict = {}
    for eq in equipos or []:
        if not isinstance(eq, dict) or not eq.get("nombre"):
            continue
        base = eq.get("potencia")
        out[str(eq["nombre"])] = {
            "acs": eq.get("potencia_acs") or base,
            "calefaccion": eq.get("potencia_calefaccion") or base,
            "refrigeracion": eq.get("potencia_refrigeracion"),
            "tipo_bdc": eq.get("tipo_bdc"),
            "kwp": eq.get("potencia_pico_kwp"),
        }
    return out


def instalaciones_a_31(p4: Any, potencias: dict | None = None, meta: dict | None = None,
                       reemitir: Callable[[Any], Any] | None = None
                       ) -> tuple[list, list[str]]:
    """El pickle 4 en la forma de la 3.1: equipos con potencias y 14 slots.

    `potencias`: la de `potencias_de_equipos`. `meta`: la que devolvio
    `instalaciones_a_23` del fichero del que se parte, para no perder lo que el
    tecnico ya habia puesto en la 3.1. `reemitir` convierte los objetos leidos de
    un fichero (los dos slots nuevos) para poder volver a escribirlos.
    """
    potencias = potencias or {}
    meta = meta or {}
    eq_meta = meta.get("equipos") or {}
    avisos: list[str] = []
    slots = list(p4)[:12] if isinstance(p4, list) else []
    slots += [[] for _ in range(12 - len(slots))]
    out = []
    for i, lista in enumerate(slots):
        nueva = []
        for reg in (lista or []):
            nombre = str(reg[0]) if isinstance(reg, list) and reg else ""
            r31, av = equipo_a_31(reg, potencias.get(nombre), eq_meta.get(_clave(i, reg)))
            nueva.append(r31)
            avisos.extend(av)
        out.append(nueva)
    extra = [list(x or []) for x in (meta.get("extra") or [[], []])]
    if reemitir is not None:
        extra = [reemitir(x) for x in extra]
    out += extra
    return out, list(dict.fromkeys(avisos))


def bajable(p4: Any, p5: Any = None) -> list[str]:
    """Lo que impide pasar un fichero de la 3.1 a la 2.3 sin perder nada.

    Los objetos que solo existen en la 3.1 —el generador electrico de las placas,
    un generador termosolar, los modelos de calculo de una medida calculada— la
    2.3 no los sabe abrir. Lista vacia = se puede.
    """
    motivos = []
    if isinstance(p4, list) and len(p4) >= 14 and any(p4[12:14]):
        motivos.append("el fichero declara generadores eléctricos o termosolares de la 3.1")
    if p5 is not None and _tiene_objetos_31(p5):
        motivos.append("sus medidas de mejora están calculadas con la 3.1")
    return motivos


def _tiene_objetos_31(dato: Any) -> bool:
    """Si hay un objeto escrito con REDUCE (las clases nuevas de la 3.1)."""
    vistos: set[int] = set()
    pila = [dato]
    while pila:
        x = pila.pop()
        if id(x) in vistos:
            continue
        vistos.add(id(x))
        clase = type(x).__name__
        if clase == "Opaco":
            if getattr(x, "origen", None) == "REDUCE":
                return True
            pila.extend(getattr(x, "args", ()) or ())
            pila.append(getattr(x, "estado", None))
        elif isinstance(x, dict):
            pila.extend(x.values())
        elif isinstance(x, (list, tuple)):
            pila.extend(x)
    return False


# --------------------------------------------------------------------------
# Pickle 5: los grupos de medidas, para LEERLOS
# --------------------------------------------------------------------------

#: Los `sistemas*MM` de un grupo, por slot (el orden de `SLOTS`).
SLOT_A_MM = {
    "ACS": "sistemasACSMM", "calefaccion": "sistemasCalefaccionMM",
    "refrigeracion": "sistemasRefrigeracionMM",
    "climatizacion": "sistemasClimatizacionMM",
    "mixto2": "sistemasMixto2MM", "mixto3": "sistemasMixto3MM",
    "renovable": "sistemasContribucionesMM", "iluminacion": "sistemasIluminacionMM",
    "ventilacion": "sistemasVentilacionMM", "ventiladores": "sistemasVentiladoresMM",
    "bombas": "sistemasBombasMM", "": "sistemasTorresRefrigeracionMM",
}

#: Los dos listados nuevos de una medida de la 3.1 (slots 12 y 13 del pickle 4).
MM_EXTRA = ("listadoGeneradoresTermosolarMM", "listadoGeneradoresElectricoMM")


def extra_de_grupo(st: dict) -> list:
    """Los generadores termosolares y electricos de una medida de la 3.1."""
    return [list(st.get(k) or []) if isinstance(st.get(k), list) else [] for k in MM_EXTRA]


def _de_estado(est: dict, nombre: str) -> Any:
    """Un atributo del estado de un grupo, sea cual sea el tipo de su clave
    (`Cadena` al escribirlo nosotros, literal leido si viene de un fichero)."""
    for k, v in est.items():
        if str(k) == nombre:
            return v
    return None


def medidas_equipos_a_31(grupos: Any, potencias: dict | None = None,
                         meta: dict | None = None) -> list[str]:
    """Los EQUIPOS de cada medida de mejora en la forma de la 3.1 (EN SITIO).

    Una medida lleva su instalacion en TRES sitios —los `sistemas*MM`,
    `datosInstalaciones` y la copia de `mejoras[1][1]`— y los escritores los
    componen en la forma de la 2.3. La 3.1 los abre y los calcula, pero el
    dialogo «Medida de mejora en la instalación» sale con la POTENCIA de cada
    servicio en blanco (visto el 05/10/2026 en 2026CEE_58: los siete aires de la
    medida de autoconsumo, sin potencia, con la del edificio base bien puesta),
    y CE3X 3.1 la exige para el XML. Se les pone con `equipo_a_31`, la MISMA
    funcion que a la instalacion del edificio: mismas potencias (de la ficha o
    por defecto, y dicho) para el mismo aparato.

    `potencias`: las de `potencias_de_equipos` (por nombre). `meta`: la de
    `instalaciones_a_23` del fichero de partida, para devolver intactas las que
    el tecnico ya habia puesto. Un equipo que ya tiene la forma de la 3.1 no se
    toca, asi que llamarla dos veces no cambia nada.
    """
    if not isinstance(grupos, list):
        return []
    potencias = potencias or {}
    eq_meta = (meta or {}).get("equipos") or {}
    avisos: list[str] = []
    hechas: set[int] = set()

    def slot(i: int, lista: Any) -> None:
        # La misma lista puede estar en dos sitios (el emisor la escribe una vez
        # y la segunda como GET): se convierte una sola vez.
        if not isinstance(lista, list) or id(lista) in hechas:
            return
        hechas.add(id(lista))
        for k, reg in enumerate(lista):
            nombre = str(reg[0]) if isinstance(reg, list) and reg else ""
            try:
                r31, av = equipo_a_31(reg, potencias.get(nombre), eq_meta.get(_clave(i, reg)))
            except GeneracionError as exc:
                avisos.append(f"Medida de mejora: {exc} (se deja como estaba).")
                continue
            if r31 is not reg:
                lista[k] = r31
            avisos.extend(av)

    _por_slots_de_medida(grupos, slot)
    return list(dict.fromkeys(avisos))


def medidas_equipos_a_23(grupos: Any) -> None:
    """Lo contrario (EN SITIO): los equipos de las medidas, sin las potencias de
    la 3.1. Se pierden, como las de la instalacion del edificio (`bajar` lo dice)."""
    if not isinstance(grupos, list):
        return
    hechas: set[int] = set()

    def slot(_i: int, lista: Any) -> None:
        if not isinstance(lista, list) or id(lista) in hechas:
            return
        hechas.add(id(lista))
        for k, reg in enumerate(lista):
            r23, m = equipo_a_23(reg)
            if m is not None:
                lista[k] = r23

    _por_slots_de_medida(grupos, slot)


def _por_slots_de_medida(grupos: list, hacer: Callable[[int, Any], None]) -> None:
    """Llama a `hacer(i, lista)` con cada lista de equipos de cada medida: sus
    `sistemas*MM`, `datosInstalaciones` y la copia de `mejoras[1][1]`."""
    for g in grupos:
        est = getattr(g, "estado", None)
        if not isinstance(est, dict):
            continue
        for i, s in enumerate(SLOTS):
            hacer(i, _de_estado(est, SLOT_A_MM[s]))
        datos = _de_estado(est, "datosInstalaciones")
        if isinstance(datos, list):
            for i, lista in enumerate(datos[:12]):
                hacer(i, lista)
        mejoras = _de_estado(est, "mejoras")
        copia = (mejoras[1][1] if isinstance(mejoras, list) and len(mejoras) > 1
                 and isinstance(mejoras[1], list) and len(mejoras[1]) > 1 else None)
        if isinstance(copia, list):
            for i, lista in enumerate(copia[:12]):
                hacer(i, lista)


# --------------------------------------------------------------------------
# Todo junto: pasar los pickles que se van a escribir a la version pedida
# --------------------------------------------------------------------------

def elevar(pickles: dict, ext: dict, potencias: dict | None = None,
           meta: dict | None = None,
           reemitir: Callable[[Any], Any] | None = None) -> list[str]:
    """Pasa a la forma de la 3.1 los pickles 1, 2, 4 y 11 de `pickles` (EN SITIO).

    Solo toca los que vengan: quien llama decide cuales escribe. Devuelve los
    avisos de lo que se ha puesto por defecto.
    """
    avisos: list[str] = []
    if ADMINISTRATIVOS in pickles:
        pickles[ADMINISTRATIVOS], av = administrativos_a_31(pickles[ADMINISTRATIVOS], ext)
        avisos += av
    if GENERALES in pickles:
        pickles[GENERALES], av = generales_a_31(pickles[GENERALES], ext)
        avisos += av
    if INSTALACIONES in pickles:
        pickles[INSTALACIONES], av = instalaciones_a_31(
            pickles[INSTALACIONES], potencias, meta, reemitir)
        avisos += av
    if INFORME in pickles:
        pickles[INFORME] = informe_a_31(pickles[INFORME], (ext or {}).get("recomendaciones"))
    if MEDIDAS in pickles:
        pickles[MEDIDAS] = medidas_a_31(pickles[MEDIDAS], (ext or {}).get("justificaciones"))
        # Y sus equipos, con la potencia de cada servicio: la misma maquina que
        # en la instalacion del edificio, o el dialogo de la medida sale vacio.
        avisos += medidas_equipos_a_31(pickles[MEDIDAS], potencias, meta)
    return list(dict.fromkeys(avisos))


def bajar(pickles: dict) -> list[str]:
    """Pasa a la forma de la 2.3 los pickles 1, 2, 4 y 11 de `pickles` (EN SITIO).

    Lo que solo existe en la 3.1 (los campos nuevos, las potencias, los dos
    slots nuevos) se pierde, y se dice.
    """
    avisos: list[str] = []
    if ADMINISTRATIVOS in pickles:
        pickles[ADMINISTRATIVOS] = administrativos_a_23(pickles[ADMINISTRATIVOS])
    if GENERALES in pickles:
        pickles[GENERALES] = generales_a_23(pickles[GENERALES])
    if INSTALACIONES in pickles:
        p4, meta = instalaciones_a_23(pickles[INSTALACIONES])
        pickles[INSTALACIONES] = p4
        if meta["era_31"]:
            avisos.append("Se escribe para CE3X 2.3: las potencias de los equipos y el tipo "
                          "de bomba de calor, que solo existen en la 3.1, no van en el fichero.")
    if INFORME in pickles:
        pickles[INFORME] = informe_a_23(pickles[INFORME])
    if MEDIDAS in pickles:
        pickles[MEDIDAS] = medidas_a_23(pickles[MEDIDAS])
        medidas_equipos_a_23(pickles[MEDIDAS])
    return avisos
