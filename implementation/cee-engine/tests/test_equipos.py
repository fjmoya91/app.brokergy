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


def test_los_slots_que_se_saben_escribir():
    """Lo que no este en ESCRITORES no se escribe, y se dice en vez de inventarlo."""
    assert set(G.ESCRITORES) == {"mixto2", "calefaccion", "ACS", "refrigeracion",
                                 "climatizacion", "mixto3", "renovable"}


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


# ---------------------------------------------------------------------------
# HIBRIDACION en el CEE FINAL: la caldera NO se retira
#
# El final se hace COPIANDO el inicial, asi que la caldera que se queda es la
# del propio fichero: se conserva su registro TAL CUAL —sus rendimientos, su
# aislamiento, su potencia y su deposito, como los dejo CE3X— y solo se le
# cambia su parte de la demanda. Recomponerla desde el expediente desharia lo
# que el certificador haya corregido dentro de CE3X.
# ---------------------------------------------------------------------------

def _bomba_sola():
    return [{"slot": "mixto2", "nombre": "AEROTERMIA PANASONIC", "generador":
             "Bomba de Calor - Caudal Ref. Variable", "combustible": "Electricidad",
             "rendimiento": "conocido", "rend_calefaccion": "434", "rend_acs": "359",
             "superficie_calefaccion": 97.17, "superficie_acs": 97.17,
             "pct_calefaccion": "79", "pct_acs": "79"}]


def _final(equipos, base, conservar=None):
    G.heredar_del_base(equipos, base)
    slots, avisos = G.construir_instalaciones(
        {"instalaciones": equipos, "envolvente": {"espacio": ZONA}},
        base, {ZONA}, retirar=G.slots_a_retirar(equipos), conservar=conservar)
    return slots[G.SLOTS.index("mixto2")], avisos


def test_el_cee_final_de_una_hibridacion_lleva_los_dos():
    mixtos, avisos = _final(_bomba_sola(), _base_con_caldera(), conservar=21)
    assert [m[0] for m in mixtos] == ["CALDERA DOMUSA", "AEROTERMIA PANASONIC"]
    assert _plano(mixtos[0][5]) == [["25.83", "21"], ["25.83", "21"], ["", ""]]
    assert _plano(mixtos[1][5]) == [["97.17", "79"], ["97.17", "79"], ["", ""]]
    assert any("NO se retira" in a for a in avisos)
    assert not any("se RETIRA" in a for a in avisos)


def test_la_caldera_conservada_se_reescribe_TAL_CUAL():
    """Solo cambia el bloque [5]. Lo demas —rendimientos, generador,
    combustible, la cola de estimacion y el deposito— es byte a byte el del
    fichero que se copia."""
    antes = _base_con_caldera()[G.SLOTS.index("mixto2")][0]
    mixtos, _ = _final(_bomba_sola(), _base_con_caldera(), conservar=21)
    despues = mixtos[0]
    assert len(antes) == len(despues)
    for i, (a, d) in enumerate(zip(antes, despues)):
        if i == 5:
            continue
        assert _plano(a) == _plano(d), f"el campo {i} no deberia haber cambiado"


def test_SIN_conservar_la_caldera_sale_del_fichero():
    """Una sustitucion normal no cambia: la caldera se retira y se dice."""
    mixtos, avisos = _final(_bomba_sola(), _base_con_caldera())
    assert [m[0] for m in mixtos] == ["AEROTERMIA PANASONIC"]
    assert any("se RETIRA" in a for a in avisos)


def test_un_generador_que_YA_compartia_servicio_se_reparte_proporcional():
    """Una caldera que solo daba el 50 % del ACS (el resto, un termo) no puede
    salir con el 21 % del ACS: eso le daria MAS de lo que tenia. Se le escala
    lo suyo, y la suma sigue cuadrando."""
    base = _base_con_caldera()
    base[G.SLOTS.index("mixto2")][0][5] = [["123.0", "50"], ["123.0", "100"], ["", ""]]
    mixtos, _ = _final(_bomba_sola(), base, conservar=21)
    assert _plano(mixtos[0][5])[0] == ["25.83", "10.5"]    # ACS: 50 % x 21 %
    assert _plano(mixtos[0][5])[1] == ["25.83", "21"]      # calefaccion: 100 % x 21 %


# ---------------------------------------------------------------------------
# La AEROTERMIA QUE DA FRIO (suelo radiante): mixto3 y climatizacion
#
# Forma medida en el corpus (153 'mixto3' y 237 'climatizacion' con el
# rendimiento conocido) y en el `.cex` que el certificador guardo a mano para
# 26RES060_198: suelo radiante + ACS, un solo equipo con ['310','623','416'].
# ---------------------------------------------------------------------------

def _aerotermia(slot, **extra):
    eq = {"slot": slot, "nombre": "AEROTERMIA DAIKIN", "generador":
          "Bomba de Calor - Caudal Ref. Variable", "combustible": "Electricidad",
          "rendimiento": "conocido", "rend_calefaccion": "623",
          "superficie_calefaccion": 120, "pct_calefaccion": "100"}
    if slot in ("mixto2", "mixto3"):
        eq.update(rend_acs="310", superficie_acs=120, pct_acs="100")
    if slot in ("climatizacion", "mixto3"):
        eq.update(rend_refrigeracion="416", superficie_refrigeracion=120,
                  pct_refrigeracion="100")
    eq.update(extra)
    return eq


def test_mixto3_tiene_la_forma_del_cex_de_26RES060_198():
    base = _base_con_caldera(sup="343.0", litros="230")
    base[G.SLOTS.index("mixto2")][0][8] = [True, "230", "80", "60", "5.4", "Por defecto", "1"]
    equipos = [_aerotermia("mixto3", acumulacion={"volumen": 230})]
    G.heredar_del_base(equipos, base)
    slots, avisos = G.construir_instalaciones(
        {"instalaciones": equipos, "envolvente": {"espacio": ZONA}},
        base, {ZONA}, retirar=G.slots_a_retirar(equipos))
    assert slots[G.SLOTS.index("mixto2")] == []            # la caldera sale entera
    assert _plano(slots[G.SLOTS.index("mixto3")]) == [[
        "AEROTERMIA DAIKIN", "mixto3", ["310", "623", "416"],
        "Bomba de Calor - Caudal Ref. Variable", "Electricidad",
        [["343.0", "100"], ["343.0", "100"], ["343.0", "100"]],
        "Conocido (Ensayado/justificado)", ["310", "623", "416"],
        # El MISMO deposito (230 l): se conserva el del fichero, con su UA.
        [True, "230", "80", "60", "5.4", "Por defecto", "1"], ZONA,
    ]]
    assert any("se RETIRA" in a for a in avisos)


def test_climatizacion_tiene_la_forma_medida():
    registro, _ = G.equipo_climatizacion(_aerotermia("climatizacion"), ZONA)
    assert _plano(registro) == [
        "AEROTERMIA DAIKIN", "climatizacion", ["", "623", "416"],
        "Bomba de Calor - Caudal Ref. Variable", "Electricidad",
        [["", ""], ["120", "100"], ["120", "100"]],
        "Conocido (Ensayado/justificado)", ["", "623", "416"], ZONA,
    ]


def test_con_otro_deposito_manda_el_declarado():
    """Litros distintos de los del fichero: es un acumulador nuevo de verdad."""
    equipos = [_aerotermia("mixto3", acumulacion={"volumen": 150})]
    G.heredar_del_base(equipos, _base_con_caldera(litros="100"))
    assert "acumulacion_cruda" not in equipos[0]


def test_mixto3_estimado_no_se_escribe():
    import pytest
    with pytest.raises(G.GeneracionError):
        G.equipo_mixto3(_aerotermia("mixto3", rendimiento="estimado"), ZONA)


# ---------------------------------------------------------------------------
# Se cambia la CALDERA pero NO el ACS: la caldera se queda para el ACS
#
# Retirarla entera dejaba la demanda de ACS sin cubrir y CE3X no calcula
# («la instalacion de ACS no esta bien definida»). Se conserva con la
# calefaccion a ['0.0','0'], que es como lo dejan los certificadores a mano
# (8 casos medidos en el corpus).
# ---------------------------------------------------------------------------

def _sustituye(equipos, base):
    G.heredar_del_base(equipos, base)
    return G.construir_instalaciones(
        {"instalaciones": equipos, "envolvente": {"espacio": ZONA}},
        base, {ZONA}, retirar=G.slots_a_retirar(equipos))


def test_solo_calefaccion_conserva_la_caldera_para_el_acs():
    antes = _base_con_caldera()[G.SLOTS.index("mixto2")][0]
    slots, avisos = _sustituye([_aerotermia("calefaccion")], _base_con_caldera())
    [caldera] = slots[G.SLOTS.index("mixto2")]
    assert _plano(caldera[5]) == [["123.0", "100"], ["0.0", "0"], ["", ""]]
    for i, (a, d) in enumerate(zip(antes, caldera)):     # lo demas, TAL CUAL
        if i != 5:
            assert _plano(a) == _plano(d), f"el campo {i} no deberia haber cambiado"
    assert slots[G.SLOTS.index("calefaccion")][0][0] == "AEROTERMIA DAIKIN"
    assert any("se CONSERVA" in a and "ACS" in a for a in avisos)


def test_suelo_radiante_sin_acs_conserva_la_caldera_para_el_acs():
    slots, _ = _sustituye([_aerotermia("climatizacion")], _base_con_caldera())
    [caldera] = slots[G.SLOTS.index("mixto2")]
    assert _plano(caldera[5])[0] == ["123.0", "100"]
    assert _plano(caldera[5])[1] == ["0.0", "0"]
    assert slots[G.SLOTS.index("climatizacion")][0][1] == "climatizacion"


def test_un_termo_que_ya_daba_el_acs_se_queda_con_una_bomba_de_solo_calefaccion():
    base = [[] for _ in G.SLOTS]
    base[G.SLOTS.index("calefaccion")] = [["CALDERA", "calefaccion", ["", 50.0, ""],
        "Caldera Estándar", "Gasóleo-C", [["", ""], ["123.0", "100"], ["", ""]],
        "Estimado según Instalación", ["Sin aislamiento", "79", "0.2", "24",
        list(G._INTERRUPTORES), list(G._COLA_PARAMETROS)], ZONA]]
    base[G.SLOTS.index("ACS")] = [["TERMO", "ACS", [100.0, "", ""], "Efecto Joule",
        "Electricidad", [["123.0", "100"], ["", ""], ["", ""]],
        "Estimado según Instalación", [["100.0", "", ""], [False, False, True],
        [False, "1.0", "0.0"]], [False], ZONA]]
    slots, _ = _sustituye([_aerotermia("calefaccion")], base)
    assert [e[0] for e in slots[G.SLOTS.index("ACS")]] == ["TERMO"]
    assert [e[0] for e in slots[G.SLOTS.index("calefaccion")]] == ["AEROTERMIA DAIKIN"]
