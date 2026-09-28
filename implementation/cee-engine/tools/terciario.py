"""El .cex de TERCIARIO: lo unico que lo separa del residencial.

CE3X tiene tres programas en uno —«Residencial», «Pequeño terciario» y «Gran
terciario»— y se elige al crear el fichero. Medido sobre los 43 `.cex` de
terciario que hay en el disco (29 pequeño, 14 gran, incluidos los tres ejemplos
oficiales que trae CE3X) contra el residencial, la diferencia es MUY acotada:

  pickle 0   la cabecera: 'CEXv2.3 PequeñoTerciario' / 'CEXv2.3 GranTerciario'
  pickle 2   [1] el PERFIL DE USO ('Intensidad Baja - 24h'…) donde el
             residencial pone 'Unifamiliar'; [20] 'Edificio completo' o
             'Local', que en el residencial va vacio (701 de 701)
  pickle 4   la ILUMINACION (slot 7), que en un terciario se declara por zona

Y NADA MAS. La envolvente tiene exactamente las mismas formas —1.100
cerramientos de terciario medidos, ni una forma que no exista en el
residencial—, los huecos, los puentes termicos y las zonas son iguales, los
equipos (calderas, bombas de calor, aire acondicionado, depositos) tambien, y
las medidas de mejora (pickles 5 y 6) tienen las mismas claves. Por eso esto es
un modulo pequeño y no otro generador: todo lo demas se escribe con lo de
siempre.

PEQUEÑO o GRAN terciario no cambia NADA de lo que escribe este motor: en el gran
terciario CE3X deja definir ademas ventiladores, bombas de circulacion y torres
de refrigeracion (slots 9, 10 y 11) y curvas de rendimiento, que pone el
certificador. La diferencia es la cabecera, que es la que hace que CE3X abra el
fichero con un programa o con el otro.
"""
from __future__ import annotations

import re
from typing import Any

from errores import GeneracionError
from pickle0 import Cadena
from puentes import _num

TIPOS = ("residencial", "pequeno_terciario", "gran_terciario")
TERCIARIOS = ("pequeno_terciario", "gran_terciario")

#: La version que escribe cada programa en el pickle 0. Es lo que lee
#: `leer_cex.VERSIONES_CONOCIDAS`, y la ñ es la de CE3X, no una transcripcion.
VERSION = {
    "residencial": "CEXv2.3 Residencial",
    "pequeno_terciario": "CEXv2.3 PequeñoTerciario",
    "gran_terciario": "CEXv2.3 GranTerciario",
}

#: El pickle 0 tal y como lo escribe CE3X, ya sin el CRLF (lo repone `montar`).
#: Es un STRING de Python 2, asi que la ñ va ESCAPADA (`\\xf1`, cuatro bytes),
#: no en latin-1: copiado byte a byte de los `.cex` reales. Se escribe literal
#: y no con el emisor porque `Cadena` solo admite ASCII —y es a proposito—.
CABECERA = {
    "residencial": b"S'CEXv2.3 Residencial'\np0\n.",
    "pequeno_terciario": b"S'CEXv2.3 Peque\\xf1oTerciario'\np0\n.",
    "gran_terciario": b"S'CEXv2.3 GranTerciario'\np0\n.",
}


def tipo_de(datos: dict) -> str:
    """El programa de CE3X con el que se escribe el fichero.

    Sin declarar es RESIDENCIAL: es lo que hacia el motor hasta ahora, y una
    ficha antigua no puede pasar a escribirse como otra cosa por no decirlo.
    """
    t = str((datos or {}).get("tipo_edificio_ce3x") or "residencial").strip()
    if t not in TIPOS:
        raise GeneracionError(
            f"tipo de edificio {t!r} no contemplado; CE3X tiene {', '.join(TIPOS)}")
    return t


def es_terciario(tipo: str) -> bool:
    return tipo in TERCIARIOS


# --------------------------------------------------------------------------
# Datos generales (pickle 2)
# --------------------------------------------------------------------------

#: El perfil de uso: las doce cadenas del desplegable de CE3X, tal cual. Van en
#: el campo [1], el mismo que en el residencial lleva 'Unifamiliar'. Todas
#: estan en el programa y en el corpus han salido siete de ellas.
PERFIL_USO = re.compile(r"^Intensidad (Baja|Media|Alta) - (8|12|16|24)h$")

#: El campo [20]: si se certifica el edificio entero o un local dentro de el.
#: 32 'Edificio completo' y 11 'Local' en el corpus; en el residencial va vacio.
AMBITOS = ("Edificio completo", "Local")


def generales_terciario(g: dict, v) -> tuple[str, str]:
    """Los dos campos del pickle 2 que cambian: el perfil y el ambito.

    `v` es el lector de la ficha (`_v` de generar_cex), que protesta si el dato
    viene a null: un terciario sin perfil de uso no se escribe.
    """
    perfil = str(v(g.get("perfil_uso"), "generales.perfil_uso")).strip()
    if not PERFIL_USO.match(perfil):
        raise GeneracionError(
            f"perfil de uso {perfil!r} no es de CE3X: son «Intensidad Baja|Media|Alta "
            f"- 8h|12h|16h|24h»")
    ambito = g.get("ambito")
    if isinstance(ambito, dict):
        ambito = ambito.get("valor")
    ambito = str(ambito or "Edificio completo").strip()
    if ambito not in AMBITOS:
        raise GeneracionError(f"ambito {ambito!r} no es de CE3X: {', '.join(AMBITOS)}")
    return perfil, ambito


# --------------------------------------------------------------------------
# La ILUMINACION (pickle 4, slot 7)
# --------------------------------------------------------------------------
#
# Un registro por zona, 12 campos. Forma medida sobre los 87 registros del
# corpus (82 con esta forma exacta de tipos; los otros 5 son el modo
# «Conocido», que lleva un float en el [4]):
#
#   ['Iluminación P2', 'iluminacion', 119.29824561403508, 1.7543859649122806,
#    '', '34.0', True, 'Habitaciones de hoteles,  hostales...', 'Estimado',
#    ['LED', '200'], [False, ''], 'P2']
#
#   [2]  potencia instalada, W        = VEEI · superficie · iluminancia / 100
#   [3]  VEEI, W/m²·100 lux           = el de la lampara (modo Estimado)
#   [5]  superficie iluminada, m²     = la de la zona
#   [6]  ZONA DE REPRESENTACION       = la casilla del dialogo; va con la actividad
#   [7]  actividad                    = del desplegable (CTE HE-3)
#   [9]  [lampara, iluminancia media horizontal en lux]
#   [11] la zona del arbol
#
# La potencia se COMPRUEBA: en los 80 registros «Estimado» del corpus,
# [2] == [3]·[5]·[9][1]/100 en los 80. No es una formula supuesta.

#: VEEI (W/m²·100 lux) que CE3X pone a cada tipo de lampara en modo Estimado.
#: Leidos del corpus, no calculados: son 100 / la eficacia de su tabla (57 lm/W
#: un LED, 80,75 un tubo LED…). Solo estan las lamparas que se han VISTO; las
#: demas del desplegable (sodio, mercurio, halogenuros, induccion, LED spot) no
#: se ofrecen porque no se sabe que VEEI les pone.
LAMPARAS = {
    "LED": 1.7543859649122806,
    "LED Tube (lineal)": 1.238390092879257,
    "Fluorescencia lineal de 16 mm": 1.2658227848101267,
    "Fluorescencia lineal de 26 mm": 1.5220700152207,
    "Fluorescencia compacta": 1.7857142857142858,
    "Incandescentes halógenas": 7.507507507507508,
    "Incandescente": 16.666666666666668,
}

#: Las actividades VISTAS en el corpus, con su casilla «Zona de representacion».
#: La casilla NO es libre: CE3X filtra el desplegable con ella (son los dos
#: grupos de la tabla de VEEI limite del CTE HE-3), y en el corpus va siempre
#: igual para cada actividad — 87 de 87.
#:
#: ⚠ La doble coma-espacio de «hoteles,  hostales» es de CE3X: asi esta en el
#: programa y en los 38 registros del corpus. Corregirla dejaria el desplegable
#: vacio al abrir el fichero.
ACTIVIDADES = {
    "Habitaciones de hoteles,  hostales...": True,
    "Hostelería y restauración": True,
    "Religioso en general": True,
    "Tiendas y pequeño comercio": True,
    "Administrativo en general": False,
    "Aulas y laboratorios": False,
    "Habitaciones de hospital": False,
    "Salas de diagnóstico": False,
    "Espacios deportivos": False,
}


def registro_iluminacion(nombre: str, zona: str, superficie: float,
                         actividad: str, lampara: str, iluminancia) -> list:
    """Un equipo de iluminacion ESTIMADO, como lo escribe CE3X."""
    if actividad not in ACTIVIDADES:
        raise GeneracionError(
            f"actividad de iluminacion {actividad!r} no contemplada; vistas en CE3X: "
            f"{', '.join(ACTIVIDADES)}")
    if lampara not in LAMPARAS:
        raise GeneracionError(
            f"lampara {lampara!r} no contemplada; vistas en CE3X: {', '.join(LAMPARAS)}")
    try:
        lux = float(str(iluminancia).replace(",", "."))
        sup = float(superficie)
    except (TypeError, ValueError):
        raise GeneracionError(
            f"iluminacion de {zona}: la iluminancia ({iluminancia!r}) y la superficie "
            f"({superficie!r}) tienen que ser numeros") from None
    if lux <= 0 or sup <= 0:
        raise GeneracionError(
            f"iluminacion de {zona}: iluminancia y superficie tienen que ser positivas")
    veei = LAMPARAS[lampara]
    return [
        str(nombre),
        Cadena("iluminacion"),
        veei * sup * lux / 100,
        veei,
        "",
        str(float(sup)),                 # CE3X la escribe con su '.0': '34.0'
        ACTIVIDADES[actividad],
        actividad,
        "Estimado",
        [lampara, _num(lux)],
        [False, ""],
        zona,
    ]


def _spec(x: Any) -> dict:
    return x if isinstance(x, dict) else {}


def construir_iluminacion(datos: dict, zonas: list[tuple[str, float]],
                          nombre_zona) -> tuple[list, list[str]]:
    """Una iluminacion por zona del arbol, con lo que declare la ficha.

    `zonas` son (nombre, superficie) de las zonas que YA estan en el fichero —
    la iluminacion cuelga de una zona como un cerramiento, y si apunta a una que
    no existe CE3X no la enseña—. Sin zonas declaradas va una sola, a la raiz,
    con la superficie util del edificio.

    `datos["iluminacion"]` trae lo que vale para todo el edificio (`defecto`) y,
    si alguna planta es otra cosa —la iglesia con aulas en el primero—, su
    propia actividad en `por_nivel`, por el NIVEL (0 la baja). El nombre de la
    zona lo pone `nombre_zona`, el mismo que usa la envolvente: no hay dos
    sitios que lo decidan.
    """
    il = _spec(datos.get("iluminacion"))
    defecto = _spec(il.get("defecto"))
    por_zona: dict[str, dict] = {}
    for nivel, x in _spec(il.get("por_nivel")).items():
        try:
            por_zona[nombre_zona(int(nivel))] = _spec(x)
        except (TypeError, ValueError):
            continue
    if not defecto and not por_zona:
        return [], ["Es un TERCIARIO y la ficha no declara la iluminación: CE3X no "
                    "calcula un terciario sin ella. Defínela en Instalaciones."]

    registros, avisos = [], []
    for zona, sup in zonas:
        spec = {**defecto, **por_zona.get(zona, {})}
        if not spec.get("actividad") or not spec.get("lampara") or not spec.get("iluminancia"):
            avisos.append(f"Iluminación de «{zona}» sin actividad, lámpara o iluminancia: "
                          "no se escribe. Defínela en CE3X.")
            continue
        nombre = "Iluminación" if zona == "Edificio Objeto" else f"Iluminación {zona}"
        registros.append(registro_iluminacion(nombre, zona, sup, spec["actividad"],
                                              spec["lampara"], spec["iluminancia"]))
    if registros:
        avisos.append(
            f"Iluminación ESTIMADA en {len(registros)} "
            f"{'zona' if len(registros) == 1 else 'zonas'} (actividad, tipo de lámpara e "
            "iluminancia media): la potencia la recalcula CE3X al abrir Instalaciones. "
            "Compruébalo en la visita.")
    return registros, avisos
