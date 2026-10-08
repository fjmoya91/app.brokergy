"""El CEE FINAL desde la medida de mejora del CEE inicial del técnico.

`tools/cee_final.py` copia el inicial y le pone como instalación el «edificio
mejorado» de su medida. Lo que se vigila aquí:

  · el final lleva EXACTAMENTE los equipos de la medida, y nada más cambia
    (envolvente, datos generales y administrativos, byte a byte);
  · en una HIBRIDACIÓN la medida del final retira el generador en apoyo y la
    bomba asume el 100 % de lo que compartían; una caldera MIXTA que sigue con
    el ACS se queda, con la calefacción a 0;
  · en una SUSTITUCIÓN no hay nada que retirar;
  · una medida que toca la ENVOLVENTE (RES080) no se genera;
  · con varias medidas manda la del informe, y si no se sabe, se pregunta;
  · las fechas del inicial NO pasan al final.

Caso real de referencia: 26RES093_11 (2026-09-30), donde el resultado salió
idéntico byte a byte al montado a mano.
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tools"))

import cee_final as CF         # noqa: E402
import generar_cex as G        # noqa: E402
import leer_cex as L           # noqa: E402
import version_ce3x as VC      # noqa: E402
from tests.test_mejora import _geo, _datos   # noqa: E402

PLANTILLA = RAIZ / "assets" / "plantilla-virgen.cex"
ZONA = "Edificio Objeto"

CALDERA = {
    "slot": "calefaccion", "nombre": "CALDERA EXISTENTE GASOIL", "generador": "Caldera Estándar",
    "combustible": "Gasóleo-C", "aislamiento": "Antigua con mal aislamiento",
    "rend_combustion": "90", "potencia": "38.4", "superficie_calefaccion": 100,
}
CALDERA_MIXTA = {**CALDERA, "slot": "mixto2", "nombre": "CALDERA MIXTA GAS",
                 "combustible": "Gas Natural", "acumulacion": {"volumen": 100},
                 "superficie_acs": 100}
BOMBA = {
    "slot": "calefaccion", "nombre": "AEROTERMIA MARCA 12 (MOD 12)",
    "generador": "Bomba de Calor - Caudal Ref. Variable", "combustible": "Electricidad",
    "rendimiento": "conocido", "rend_calefaccion": "450", "superficie_calefaccion": 100,
}
PRUEBAS = "Se ha realizado la visita al inmueble."


def _slots(equipos: list[dict]) -> list:
    slots, _ = G.construir_instalaciones(
        {"instalaciones": equipos, "envolvente": {"espacio": ZONA}},
        [[] for _ in G.SLOTS], {ZONA})
    return slots


def _con(slots: list, slot: str, nombre: str, servicio: int, sup: str, pct: str) -> None:
    """Pone el reparto de un servicio de un equipo ya escrito."""
    for rec in slots[G.SLOTS.index(slot)]:
        if rec[0] == nombre:
            rec[5][servicio] = [sup, pct]
            return
    raise AssertionError(f"no está {nombre} en {slot}")


def _cex(base: list, medidas: list[tuple[str, list]], *, env_medida=None,
         en_informe: str | None = None) -> bytes:
    """Un .cex «del técnico»: su instalación y sus medidas (sin calcular)."""
    env, _ = G.construir_envolvente(_geo(), _datos(huecos=[
        {"id": "V1", "cerramiento": "FBS1", "ancho": 1.2, "alto": 1.2, "tipo": "Hueco"}]))
    grupos, filas = [], []
    for nombre, inst in medidas:
        g, fila, _ = G.construir_medida({"nombre": nombre, "caracteristicas": "x"},
                                        env_medida or env, inst)
        grupos += g
        filas.append(fila)
    informe = [en_informe if en_informe is not None else (medidas[0][0] if medidas else ""),
               "", "", PRUEBAS, "", ["01", "09", "2026"], ["01", "09", "2026"]]
    return G.montar(PLANTILLA, {
        G.ENVOLVENTE: env, G.INSTALACIONES: base, G.MEDIDAS: grupos,
        G.RESUMEN_MEDIDAS: G.construir_resumen_medidas(filas, None), G.INFORME: informe,
    })


def _hibrida() -> tuple[list, list]:
    """Inicial: caldera al 100 %. Medida: caldera 20 % + bomba 80 %."""
    base = _slots([CALDERA])
    medida = _slots([CALDERA, BOMBA])
    _con(medida, "calefaccion", CALDERA["nombre"], 1, "20.0", "20")
    _con(medida, "calefaccion", BOMBA["nombre"], 1, "80.0", "80")
    return base, medida


def _nombres(slots: list) -> list[tuple[str, str]]:
    return [(G.SLOTS[i], rec[0]) for i, lista in enumerate(slots) for rec in (lista or [])]


# ─── El final ES el edificio mejorado de la medida ──────────────────────────

def test_el_final_lleva_los_equipos_de_la_medida_y_nada_mas_cambia():
    """En la MISMA versión (2.3 → 2.3) el final es la medida tal cual. Con la 3.1
    (el valor por defecto) cambian de forma los pickles 1, 2, 4 y 11: eso lo
    vigila `test_version_ce3x.py`."""
    base, medida = _hibrida()
    crudo = _cex(base, [("HIBRIDACION AEROTERMIA", medida)])
    salida, _, _ = CF.componer(crudo, {"version_ce3x": "2.3",
                                       "informe": {"fecha_emision": "2026-09-30",
                                                   "fecha_visita": "2026-09-30"}})
    antes, despues = L.trocear_bytes(crudo), L.trocear_bytes(salida)
    assert G._comparable(L.leer(despues, G.INSTALACIONES)) == G._comparable(medida)
    for i in (G.ADMINISTRATIVOS, G.GENERALES, G.ENVOLVENTE):
        assert G._comparable(L.leer(antes, i)) == G._comparable(L.leer(despues, i)), f"pickle {i}"
    informe = L.leer(despues, G.INFORME)
    assert informe[3] == PRUEBAS                        # el texto del técnico se conserva
    assert informe[5] == ["30", "09", "2026"] and informe[6] == ["30", "09", "2026"]


def test_en_una_hibridacion_la_medida_del_final_retira_la_caldera():
    base, medida = _hibrida()
    crudo = _cex(base, [("HIBRIDACION AEROTERMIA", medida)])
    salida, analisis, _ = CF.componer(crudo, {})
    ret = analisis["retirada"]
    assert ret["posible"] and ret["servicios"] == ["calefacción"]
    assert ret["borrador"]["nombre"] == "RETIRADA CALDERA GASÓLEO: AEROTERMIA MARCA 12 AL 100 %"
    assert "SCOP de 4,50" in ret["borrador"]["caracteristicas"]

    [g] = L.leer(L.trocear_bytes(salida), G.MEDIDAS)
    st = g.estado
    cal = st["sistemasCalefaccionMM"]
    assert [r[0] for r in cal] == [BOMBA["nombre"]]      # la caldera SALE
    assert cal[0][5][1] == ["100.0", "100"]              # la bomba asume su parte
    assert str(st["nombre"]) == ret["borrador"]["nombre"]
    # Y el conjunto que imprime el informe es la medida nueva.
    assert L.leer(L.trocear_bytes(salida), G.INFORME)[0] == ret["borrador"]["nombre"]


def test_una_caldera_mixta_que_sigue_con_el_acs_se_queda_sin_calefaccion():
    base = _slots([CALDERA_MIXTA])
    medida = _slots([CALDERA_MIXTA, BOMBA])
    _con(medida, "mixto2", CALDERA_MIXTA["nombre"], 1, "30.0", "30")
    _con(medida, "calefaccion", BOMBA["nombre"], 1, "70.0", "70")
    slots, info = CF.retirada(medida, base)
    assert info["posible"], info["motivo"]
    [caldera] = slots[G.SLOTS.index("mixto2")]
    assert caldera[5][1] == ["0.0", "0"] and caldera[5][0][1] == "100"
    assert info["previos"][0]["se_queda_para"] == ["ACS"]
    [bomba] = slots[G.SLOTS.index("calefaccion")]
    assert bomba[5][1] == ["100.0", "100"]
    assert "GAS NATURAL" in CF.texto_retirada(info)["nombre"]


def test_una_hibridacion_de_calefaccion_y_acs_retira_la_caldera_de_los_dos():
    """Como 26RES093_8: caldera mixta y bomba mixta, 21/79 en los dos servicios."""
    bomba_mixta = {**BOMBA, "slot": "mixto2", "rend_acs": "359", "superficie_acs": 100}
    base = _slots([CALDERA_MIXTA])
    medida = _slots([CALDERA_MIXTA, bomba_mixta])
    for k in (0, 1):
        _con(medida, "mixto2", CALDERA_MIXTA["nombre"], k, "21.0", "21")
        _con(medida, "mixto2", bomba_mixta["nombre"], k, "79.0", "79")
    slots, info = CF.retirada(medida, base)
    assert info["posible"] and info["servicios"] == ["calefacción", "ACS"]
    [bomba] = slots[G.SLOTS.index("mixto2")]          # la caldera SALE entera
    assert bomba[0] == bomba_mixta["nombre"]
    assert bomba[5][0] == ["100.0", "100"] and bomba[5][1] == ["100.0", "100"]
    assert "calefacción y ACS, con SCOP de 4,50 y SCOPdhw de 3,59" in CF.texto_retirada(info)["caracteristicas"]


def test_en_una_sustitucion_no_hay_nada_que_retirar():
    base = _slots([CALDERA])
    medida = _slots([BOMBA])                  # la caldera ya salió en la medida
    crudo = _cex(base, [("AEROTERMIA MARCA 12", medida)])
    _, analisis, _ = CF.componer(crudo, {"solo_analizar": True})
    assert analisis["retirada"]["posible"] is False
    assert "sustitución" in analisis["retirada"]["motivo"]
    with pytest.raises(CF.FinalNoEscrito):
        CF.componer(crudo, {"retirar_previo": True})
    # Sin retirada ni otra medida, se escribe igual y se DICE.
    salida, _, avisos = CF.componer(crudo, {})
    assert _nombres(L.leer(L.trocear_bytes(salida), G.INSTALACIONES)) == [("calefaccion", BOMBA["nombre"])]
    assert any("SIN medida de mejora" in a for a in avisos)


def test_la_medida_que_manda_la_app_se_escribe_sobre_el_final():
    base = _slots([CALDERA])
    medida = _slots([BOMBA])
    crudo = _cex(base, [("AEROTERMIA MARCA 12", medida)])
    # En la 3.2 las placas van como «Generación renovable eléctrica», mes a mes
    # (manual de la 3.2, 7.1); en la 2.3, la contribución anual de siempre.
    meses = [100.0, 110, 125, 130, 140, 145, 150, 145, 130, 120, 105, 100]
    auto = {"nombre": "AUTOCONSUMO FOTOVOLTAICO", "caracteristicas": "placas",
            "instalaciones": [{"slot": "renovable", "nombre": "AUTOCONSUMO FOTOVOLTAICO",
                               "generacion_electrica_kwh": sum(meses),
                               "generacion_mensual_kwh": meses, "potencia_pico_kwp": 1.0}]}
    salida, analisis, _ = CF.componer(crudo, {"medidas": [auto]})
    assert analisis["medidas_final"] == ["AUTOCONSUMO FOTOVOLTAICO"]
    [g] = L.leer(L.trocear_bytes(salida), G.MEDIDAS)
    assert [r[0] for r in g.estado["sistemasCalefaccionMM"]] == [BOMBA["nombre"]]
    assert g.estado["sistemasContribucionesMM"] == []
    assert len(g.estado["listadoGeneradoresElectricoMM"]) == 1
    salida, _, _ = CF.componer(crudo, {"medidas": [auto], "version_ce3x": "2.3"})
    [g] = L.leer(L.trocear_bytes(salida), G.MEDIDAS)
    assert [r[0] for r in g.estado["sistemasContribucionesMM"]] == ["AUTOCONSUMO FOTOVOLTAICO"]


# ─── Lo que no se genera ────────────────────────────────────────────────────

def test_una_medida_que_toca_la_envolvente_no_se_genera():
    base, medida = _hibrida()
    env, _ = G.construir_envolvente(_geo(), _datos(huecos=[
        {"id": "V1", "cerramiento": "FBS1", "ancho": 1.2, "alto": 1.2, "tipo": "Hueco"}]))
    otra = copy.deepcopy(env)
    otra[0][0][3] = 0.25                          # la fachada se aísla
    crudo = _cex(base, [("REHABILITACION", medida)], env_medida=otra)
    with pytest.raises(CF.FinalNoEscrito, match="ENVOLVENTE"):
        CF.componer(crudo, {"solo_analizar": True})


def test_sin_medida_de_mejora_no_hay_final():
    crudo = _cex(_slots([CALDERA]), [])
    with pytest.raises(CF.FinalNoEscrito, match="no tiene medida de mejora"):
        CF.componer(crudo, {})


def test_con_varias_medidas_manda_la_del_informe_y_si_no_se_pregunta():
    base, medida = _hibrida()
    otra = _slots([BOMBA])
    crudo = _cex(base, [("OTRA COSA", otra), ("HIBRIDACION", medida)], en_informe="HIBRIDACION")
    _, analisis, avisos = CF.componer(crudo, {"solo_analizar": True})
    assert analisis["medida_inicial"]["nombre"] == "HIBRIDACION"
    assert any("imprime su informe" in a for a in avisos)

    crudo = _cex(base, [("OTRA COSA", otra), ("HIBRIDACION", medida)], en_informe="NINGUNA")
    with pytest.raises(CF.FinalNoEscrito, match="no dice cuál"):
        CF.componer(crudo, {"solo_analizar": True})


def test_las_fechas_del_inicial_no_pasan_al_final():
    base, medida = _hibrida()
    crudo = _cex(base, [("HIBRIDACION", medida)])
    salida, _, avisos = CF.componer(crudo, {})
    informe = L.leer(L.trocear_bytes(salida), G.INFORME)
    assert informe[5] == ["", "", ""] and informe[6] == ["", "", ""]
    assert sum("Sin fecha" in a for a in avisos) == 2


# ─── Medidas de ENVOLVENTE: «Adición de Aislamiento Térmico» ────────────────

def test_los_parametros_de_cubierta_son_los_que_guarda_ce3x():
    """Medidos en la medida que guardó CE3X para 26RES093_11 (cubierta, U 0,25)."""
    assert G.params_aislamiento({"elementos": ["cubierta"], "modo": "u", "u": 0.25}) == [
        False, True, False, True, False, False, "0.25", "", "", "", True,
        ["", "", "", "", "", "", ""], [False, False, False, False]]
    # En modo λ + espesor, el espesor va en METROS y la λ sin redondear a 2 cifras.
    p = G.params_aislamiento({"elementos": ["fachada"], "modo": "lambda",
                              "lambda": 0.032, "espesor": 0.08, "exterior": True})
    assert p[3:9] == [False, True, False, "", "0.032", "0.08"]
    assert p[11] == G.PSI_AISLAMIENTO_EXTERIOR           # los psi del corpus


def _env_con_medianera():
    fachada = ["F1", "Fachada", "10", 1.5, 200, "S", "", "Sin patrón", "Conocidas",
               [True, "1.5", "200"], "3", "2.8", "1", "PB", "aire"]
    medianera = ["M1", "Fachada", "8", 0.0, 200, "", "", "", "", "", "1", "PB", "edificio"]
    cubierta = ["C1", "Cubierta", "60", 0.45, 100, "Techo", "", "Sin patrón", "Conocidas",
                ["Cubierta plana", True, "0.45", "100"], "", "", "1", "PB", "aire"]
    return [[fachada, medianera, cubierta], [], [], []]


def test_el_aislamiento_cambia_solo_la_u_y_nunca_una_medianera():
    env = _env_con_medianera()
    m = {"nombre": "AISLAMIENTO TÉRMICO EN FACHADA", "aislamiento": [
        {"nombre": "AISLAMIENTO FACHADA", "elementos": ["fachada"], "modo": "lambda",
         "lambda": 0.032, "espesor": 0.08, "exterior": True}]}
    [g], filas, _ = G.construir_medida_aislamiento(m, env, [[] for _ in G.SLOTS])
    st = g.estado
    fachada, medianera, cubierta = st[G.Cadena("cerramientosMejorados")]
    assert abs(fachada[3] - 1 / (1 / 1.5 + 0.08 / 0.032)) < 1e-9     # la cuenta de CE3X
    assert fachada[9] == [True, "1.5", "200"]          # el bloque de «Conocidas» se queda
    assert medianera[3] == 0.0 and cubierta[3] == 0.45
    assert st[G.Cadena("mejoras")][1][2] is False      # la instalación no cambia
    assert filas == [["AISLAMIENTO FACHADA", "AISLAMIENTO TÉRMICO EN FACHADA",
                      G.TIPO_AISLAMIENTO, "", "", "0"]]


def test_sin_cerramientos_de_ese_tipo_no_se_escribe():
    env = _env_con_medianera()
    m = {"nombre": "SUELO", "aislamiento": [{"nombre": "S", "elementos": ["suelo"],
                                             "modo": "u", "u": 0.3}]}
    with pytest.raises(G.GeneracionError, match="ningún cerramiento"):
        G.construir_medida_aislamiento(m, env, [[] for _ in G.SLOTS])


def test_el_final_lleva_la_medida_de_cubierta_con_la_instalacion_del_final():
    base, medida = _hibrida()
    crudo = _cex(base, [("HIBRIDACION", medida)])
    cub = {"nombre": "AISLAMIENTO TÉRMICO EN CUBIERTA", "caracteristicas": "lana mineral",
           "aislamiento": [{"nombre": "AISLAMIENTO CUBIERTA", "elementos": ["cubierta"],
                            "modo": "lambda", "lambda": 0.035, "espesor": 0.12}]}
    salida, analisis, _ = CF.componer(crudo, {"medidas": [cub]})
    assert any(c["tipo"] == "Cubierta" for c in analisis["cerramientos"])
    grupos = L.leer(L.trocear_bytes(salida), G.MEDIDAS)
    assert [str(g.estado["nombre"]) for g in grupos] == [
        analisis["retirada"]["borrador"]["nombre"], "AISLAMIENTO TÉRMICO EN CUBIERTA"]
    st = grupos[1].estado
    # La instalación de la medida de cubierta es la DEL FINAL (con su caldera en apoyo),
    # y en la 3.1 cada equipo lleva su potencia (si no, el diálogo de la medida sale
    # en blanco): bajada a la forma interna, es la misma.
    interna, _ = VC.instalaciones_a_23(st["datosInstalaciones"])
    assert G._comparable(interna) == G._comparable(medida)
    aero = [r for lista in st["datosInstalaciones"] for r in lista if "AEROTERMIA" in str(r[0])]
    assert aero and all(VC.es_31(r) for r in aero)
    assert st["medidasMejoraEnvolvente"][0][1] == G.TIPO_AISLAMIENTO
    resumen = L.leer(L.trocear_bytes(salida), G.RESUMEN_MEDIDAS)[2]
    assert [f[2] for f in resumen] == ["Instalaciones", G.TIPO_AISLAMIENTO]


# ─── Los equipos del EXPEDIENTE mandan sobre los del técnico ────────────────

def _inst_sustitucion():
    """La medida de 26RES060_184 tal y como la tecleó el técnico."""
    inst = [[] for _ in G.SLOTS]
    inst[G.SLOTS.index("ACS")] = [[
        "BOMBA DE CALOR ACS JOHNSON MANANTIAL150RPLUSB", "ACS", ["402", "", ""],
        "Bomba de Calor - Caudal Ref. Variable", "Electricidad",
        [["260", "100"], ["", ""], ["", ""]], "Conocido (Ensayado/justificado)",
        ["402", "", ""], [False], "Edificio Objeto"]]
    inst[G.SLOTS.index("calefaccion")] = [[
        "AEROTERMIA SIME SHP M PRO 010", "calefaccion", ["", "491", ""],
        "Bomba de Calor - Caudal Ref. Variable", "Electricidad",
        [["", ""], ["260", "100"], ["", ""]], "Conocido (Ensayado/justificado)",
        ["", "491", ""], "Edificio Objeto"]]
    return inst


def test_la_maquina_del_expediente_sustituye_a_la_que_tecleo_el_tecnico():
    inst = _inst_sustitucion()
    cambios, avisos = CF.corregir_equipos(inst, [
        {"servicio": "calefaccion", "nombre": "AEROTERMIA SIME SHP M PRO 012",
         "clave": "AEROTERMIA SIME SHP M PRO 012", "rend": 455},
        {"servicio": "acs", "nombre": "BOMBA DE CALOR ACS JOHNSON MANANTIAL110RPLUSV",
         "clave": "BOMBA DE CALOR ACS JOHNSON MANANTIAL110RPLUSV", "rend": 374}])
    cal = inst[G.SLOTS.index("calefaccion")][0]
    acs = inst[G.SLOTS.index("ACS")][0]
    assert cal[0] == "AEROTERMIA SIME SHP M PRO 012"
    assert cal[2] == ["", "455", ""] and cal[7] == ["", "455", ""]
    assert acs[0] == "BOMBA DE CALOR ACS JOHNSON MANANTIAL110RPLUSV"
    assert acs[2] == ["374", "", ""] and acs[7] == ["374", "", ""]
    # Lo demás es del técnico: porcentajes, superficies, acumulación.
    assert acs[5] == [["260", "100"], ["", ""], ["", ""]] and acs[8] == [False]
    assert len(cambios) == 2 and all("EXPEDIENTE" in a for a in avisos)


def test_la_misma_maquina_con_el_mismo_rendimiento_no_se_toca():
    inst = _inst_sustitucion()
    antes = copy.deepcopy(inst)
    cambios, avisos = CF.corregir_equipos(inst, [
        {"servicio": "calefaccion", "nombre": "AEROTERMIA SIME SHP M PRO 010 (SHP M PRO 010)",
         "clave": "AEROTERMIA SIME SHP M PRO 010", "rend": 491}])
    assert cambios == [] and avisos == [] and inst == antes


def test_el_equipo_de_acs_del_final_hereda_el_deposito_del_inicial():
    """26RES060_185: la caldera mixta del inicial con 150 l; la bomba de ACS de
    la medida sin depósito. Sin él, CE3X calcula otra demanda de ACS."""
    base = [[] for _ in G.SLOTS]
    deposito = [True, "150", "80", "60", "4.7", "Por defecto", "1"]
    base[G.SLOTS.index("mixto2")] = [[
        "CALDERA EXISTENTE SH 30M", "mixto2", [61.6, 61.6, ""], "Caldera Estándar", "Gasóleo-C",
        [["206.0", "100"], ["206.0", "100"], ["", ""]], "Estimado según Instalación",
        ["Antigua con aislamiento medio", "85", "0.2", "27.8", [False] * 7, [1.0, 0.0]],
        list(deposito), "Edificio Objeto"]]
    inst = _inst_sustitucion()
    avisos = CF.heredar_deposito(inst, base)
    assert inst[G.SLOTS.index("ACS")][0][8] == deposito
    assert len(avisos) == 1
    # El de calefacción no tiene casilla de depósito y no se toca.
    assert len(inst[G.SLOTS.index("calefaccion")][0]) == 9


def test_si_el_final_ya_tiene_deposito_no_se_anade_otro():
    base = [[] for _ in G.SLOTS]
    base[G.SLOTS.index("mixto2")] = [["C", "mixto2", ["", "", ""], "", "",
        [["100", "100"], ["100", "100"], ["", ""]], "Estimado según Instalación", [],
        [True, "150", "80", "60", "4.7", "Por defecto", "1"], "Edificio Objeto"]]
    inst = _inst_sustitucion()
    inst[G.SLOTS.index("ACS")][0][8] = [True, "110", "80", "60", "4.7", "Por defecto", "1"]
    assert CF.heredar_deposito(inst, base) == []
    assert inst[G.SLOTS.index("ACS")][0][8][1] == "110"
