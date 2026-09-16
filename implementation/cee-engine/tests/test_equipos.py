"""Los registros de EQUIPO del pickle 4, comparados con su forma medida.

Un registro con la forma equivocada no falla: **CE3X abre el fichero y la
instalacion no aparece**, sin decir nada. Por eso cada slot se escribe con la
forma que trae un `.cex` guardado desde CE3X, y esto la fija para que no se
mueva sin querer.

De donde sale cada forma:

  mixto2         de los 620 equipos mixtos del corpus (ver `generar_cex`).
  ACS            de un .cex con una caldera que da la calefaccion y la mitad
                 del agua, y un termo electrico que da la otra mitad.
  refrigeracion  del mismo fichero, su equipo de aire acondicionado.

Aqui NO se lee ningun .cex de verdad: llevan dentro el nombre y la direccion del
titular. Lo que se compara son las formas, copiadas a mano y con los nombres
cambiados por otros neutros.
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import generar_cex as G  # noqa: E402


ZONA = "Edificio Objeto"


def _plano(v):
    """Las `Cadena` del emisor se comparan por su texto."""
    if isinstance(v, list):
        return [_plano(x) for x in v]
    if isinstance(v, G.Cadena):
        return str(v)
    return v


def test_equipo_de_acs_tiene_la_forma_medida():
    """El TERMO: un equipo de solo ACS, por efecto Joule y al 50 %."""
    registro, avisos = G.equipo_acs({
        "nombre": "TERMO ACS",
        "generador": "Efecto Joule",
        "combustible": "Electricidad",
        "superficie_acs": 82.5,
        "pct_acs": "50",
        "rend_nominal": "100.0",
    }, ZONA)

    assert _plano(registro) == [
        "TERMO ACS",
        "ACS",
        [100.0, "", ""],
        "Efecto Joule",
        "Electricidad",
        [["82.5", "50"], ["", ""], ["", ""]],
        "Estimado según Instalación",
        [["100.0", "", ""], [False, False, True], [False, "1.0", "0.0"]],
        [False],
        ZONA,
    ]
    # El estacional lo recalcula CE3X: aqui va el nominal, y eso SE DICE.
    assert any("lo calcula" in a for a in avisos)


def test_equipo_de_acs_con_rendimiento_conocido():
    """La BOMBA DE CALOR DE ACS: su COP viene ensayado, y la cola DESAPARECE.

    Forma medida sobre el corpus: de los 544 equipos del slot ACS, 205 declaran
    el rendimiento como conocido —183 de ellos bombas de calor— y en 204 de esos
    205 el campo [7] es EXACTAMENTE el mismo trio que el [2]. Ejemplo literal,
    de «CEE PROYECTO JESUS RUIZ.cex».

    Sin esta rama se escribia la cola del estimado bajo la casilla «Conocido», y
    entonces CE3X se niega a calcular la medida: «La instalacion de ACS no esta
    bien definida. El porcentaje de demanda cubierta debe ser el 100 %».
    """
    registro, avisos = G.equipo_acs({
        "nombre": "BOMBA DE CALOR ACS THERMOR VM 150",
        "generador": "Bomba de Calor - Caudal Ref. Variable",
        "combustible": "Electricidad",
        "superficie_acs": 141.0,
        "pct_acs": "100",
        "rendimiento": "conocido",
        "rend_acs": "334",
    }, ZONA)

    assert _plano(registro) == [
        "BOMBA DE CALOR ACS THERMOR VM 150",
        "ACS",
        ["334", "", ""],
        "Bomba de Calor - Caudal Ref. Variable",
        "Electricidad",
        # El corpus escribe "141.0"; `_num` normaliza el .0 y CE3X lo admite
        # igual (el .cex de 26RES060_187 lleva "231" y abre sin queja).
        [["141", "100"], ["", ""], ["", ""]],
        "Conocido (Ensayado/justificado)",
        ["334", "", ""],
        [False],
        ZONA,
    ]
    # Un SCOP ensayado es un DATO: no hay nada que aproximar, asi que no se
    # avisa de un estacional que CE3X vaya a recalcular.
    assert not any("lo calcula" in a for a in avisos)


def test_equipo_de_acs_con_deposito():
    """Con acumulacion, el bloque [8] es el mismo que el del mixto."""
    registro, _ = G.equipo_acs({
        "nombre": "TERMO", "generador": "Efecto Joule", "combustible": "Electricidad",
        "superficie_acs": 82.5, "acumulacion": {"volumen": 100},
    }, ZONA)
    assert _plano(registro)[8] == [True, "100", "80", "60", "4.7", "Por defecto", "1"]


def test_equipo_de_refrigeracion_tiene_la_forma_medida():
    """El AIRE ACONDICIONADO: solo frio, al 10 % de la demanda.

    Su cola lleva un cuarto elemento que el mixto no tiene —la antiguedad del
    equipo, «Posterior a 2013» en el fichero medido— y sus interruptores son
    otros.
    """
    registro, _ = G.equipo_refrigeracion({
        "nombre": "AIRE ACONDICIONADO",
        "generador": "Maquina frigorífica",
        "combustible": "Electricidad",
        "superficie_refrigeracion": 16.5,
        "pct_refrigeracion": "10",
        "rend_nominal": "250.0",
    }, ZONA)

    plano = _plano(registro)
    assert len(plano) == 9, "el de frio tiene 9 campos, no 10: no lleva acumulacion"
    assert plano[1] == "refrigeracion"
    assert plano[3] == "Maquina frigorífica", "asi lo escribe el fichero, sin tilde"
    assert plano[5] == [["", ""], ["", ""], ["16.5", "10"]]
    assert plano[7] == [["", "", "250.0"], [True, False, False], [False, "1.0", "0.0"], 0]


def test_los_cuatro_slots_se_saben_escribir():
    """Lo que no este en ESCRITORES no se escribe, y se dice en vez de inventarlo."""
    assert set(G.ESCRITORES) == {"mixto2", "calefaccion", "ACS", "refrigeracion",
                                 "renovable"}


def test_el_reparto_avisa_cuando_pasa_del_cien():
    """Dos equipos que suman mas del 100 % declaran mas demanda de la que hay."""
    avisos = G._reparto([
        {"slot": "mixto2", "pct_acs": "80", "pct_calefaccion": "100"},
        {"slot": "ACS", "pct_acs": "50"},
    ])
    assert any("pasan del" in a and "acs" in a for a in avisos)
    # La calefaccion va al 100 %: de esa no se dice nada.
    assert not any("calefaccion" in a for a in avisos)


def test_el_reparto_avisa_cuando_falta_por_cubrir():
    """Quedarse corto es legitimo, pero casi siempre es que falta un equipo."""
    avisos = G._reparto([{"slot": "mixto2", "pct_acs": "50", "pct_calefaccion": "100"}])
    assert any("no lo da ninguno" in a for a in avisos)


def test_el_reparto_calla_cuando_cuadra():
    """La caldera al 50 % y el termo al otro 50: eso esta bien y no se dice nada."""
    assert G._reparto([
        {"slot": "mixto2", "pct_acs": "50", "pct_calefaccion": "100"},
        {"slot": "ACS", "pct_acs": "50"},
    ]) == []


# ---------------------------------------------------------------------------
# HIBRIDACION: la medida de mejora lleva los DOS generadores
#
# La caldera NO se retira, asi que el edificio mejorado tiene dos equipos
# repartiendose la demanda. Las cifras salen del `.cex` que el certificador
# monto a mano para 26RES093_8: caldera 21 % / 25,83 m2 y aerotermia 79 % /
# 97,17 m2, sobre los 123 m2 del edificio.
# ---------------------------------------------------------------------------

def _base_con_caldera(sup="123.0", litros="100"):
    """El pickle 4 del CEE inicial: una sola caldera con todo el edificio."""
    base = [[] for _ in G.SLOTS]
    base[G.SLOTS.index("mixto2")] = [[
        "CALDERA DOMUSA", "mixto2", [43.9, 43.9, ""], "Caldera Estándar", "Gasóleo-C",
        [[sup, "100"], [sup, "100"], ["", ""]], "Estimado según Instalación",
        ["Sin aislamiento", "79", "0.2", "27.8", list(G._INTERRUPTORES),
         list(G._COLA_PARAMETROS)],
        [True, litros, "80", "60", "4.7", "Por defecto", "1"], ZONA,
    ]]
    return base


def _equipos_hibridos():
    return [
        {"slot": "mixto2", "nombre": "AEROTERMIA PANASONIC", "generador":
         "Bomba de Calor - Caudal Ref. Variable", "combustible": "Electricidad",
         "rendimiento": "conocido", "rend_calefaccion": "434", "rend_acs": "359",
         "superficie_calefaccion": 97.17, "superficie_acs": 97.17,
         "pct_calefaccion": "79", "pct_acs": "79"},
        {"slot": "mixto2", "nombre": "CALDERA DOMUSA", "generador": "Caldera Estándar",
         "combustible": "Gasóleo-C", "aislamiento": "Sin aislamiento",
         "rend_combustion": "79", "potencia": "27.8",
         "superficie_calefaccion": 25.83, "superficie_acs": 25.83,
         "pct_calefaccion": "21", "pct_acs": "21"},
    ]


def test_la_medida_de_una_hibridacion_escribe_los_dos_generadores():
    equipos = _equipos_hibridos()
    base = _base_con_caldera()
    G.heredar_del_base(equipos, base)
    slots, _ = G.construir_instalaciones(
        {"instalaciones": equipos, "envolvente": {"espacio": ZONA}},
        base, {ZONA}, retirar=G.slots_a_retirar(equipos))

    mixtos = slots[G.SLOTS.index("mixto2")]
    assert [m[0] for m in mixtos] == ["AEROTERMIA PANASONIC", "CALDERA DOMUSA"]
    # [[sup_acs, pct_acs], [sup_cal, pct_cal], ["", ""]]
    assert _plano(mixtos[0][5]) == [["97.17", "79"], ["97.17", "79"], ["", ""]]
    assert _plano(mixtos[1][5]) == [["25.83", "21"], ["25.83", "21"], ["", ""]]
    # Los dos trozos suman el edificio entero: ni un m2 de mas ni de menos.
    assert float(mixtos[0][5][1][0]) + float(mixtos[1][5][1][0]) == 123.0


def test_el_reparto_NO_lo_deshace_la_superficie_heredada():
    """`_heredar_superficies` daba a cada equipo la superficie del fichero (123),
    o sea el edificio entero a los dos. Ahora hereda el TOTAL y le vuelve a
    aplicar su porcentaje: si el certificador la corrigio en CE3X, manda la
    suya — repartida."""
    equipos = _equipos_hibridos()
    avisos = G.heredar_del_base(equipos, _base_con_caldera(sup="110.0"))
    assert equipos[0]["superficie_calefaccion"] == 86.9    # 110 x 79 %
    assert equipos[1]["superficie_calefaccion"] == 23.1    # 110 x 21 %
    assert any("le tocan" in a for a in avisos)


def test_los_dos_heredan_el_deposito_del_edificio():
    """El deposito es del EDIFICIO, no de la caldera: en el .cex de referencia
    los dos equipos de la medida lo llevan."""
    equipos = _equipos_hibridos()
    G.heredar_del_base(equipos, _base_con_caldera(litros="100"))
    assert all(e["acumulacion_cruda"][1] == "100" for e in equipos)


def test_una_SUSTITUCION_sigue_heredando_la_superficie_entera():
    """Sin reparto (100 %), nada cambia: se reescribe TAL CUAL la del fichero."""
    solo = [{"slot": "mixto2", "nombre": "AEROTERMIA", "generador":
             "Bomba de Calor - Caudal Ref. Variable", "combustible": "Electricidad",
             "rendimiento": "conocido", "rend_calefaccion": "434", "rend_acs": "359",
             "superficie_calefaccion": 120, "superficie_acs": 120}]
    G.heredar_del_base(solo, _base_con_caldera())
    assert solo[0]["superficie_calefaccion"] == "123.0"
    assert solo[0]["superficie_calefaccion_cruda"] == "123.0"
