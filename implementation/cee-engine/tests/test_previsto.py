"""El CEE PREVISTO de un RES080 (tools/previsto.py).

Se COPIA el inicial y se le cambia solo lo de la obra: las ventanas que se
cambian pasan a «Conocidas», los cerramientos que se aislan llevan su U nueva
en «Conocidas», la ventilacion va a 0,53 y la masa de las particiones a
«Ligera» (decisiones del usuario, 2026-10-06). Lo demas, igual que el inicial.
"""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import pytest              # noqa: E402
import generar_cex as G   # noqa: E402
import leer_cex as L      # noqa: E402
import pickle0 as P       # noqa: E402
import previsto as PV     # noqa: E402
from errores import GeneracionError  # noqa: E402

ALTO = 2.80


def _medida(valor):
    return {"value": valor, "source": "CATASTRO_WFS_BU", "confidence": 1.0,
            "evidence_type": "MEASURED", "note": None}


def _pared(ident, largo, wkt, orientacion="N", tipo="FACHADA", subtipo="FACHADA"):
    return {
        "id": ident, "planta": "PB", "nivel": 0, "tipo": tipo, "subtipo": subtipo,
        "orientacion": orientacion, "azimut": 0.0, "largo": _medida(largo),
        "alto": _medida(ALTO), "superficie": _medida(round(largo * ALTO, 2)),
        "geometria_wkt": wkt,
    }


def _geo():
    return {"elementos": [
        _pared("FBS1", 10, "LINESTRING (0 0, 10 0)", "S"),
        _pared("FBE1", 6, "LINESTRING (10 0, 10 6)", "E"),
        _pared("FBN1", 10, "LINESTRING (10 6, 0 6)", "N"),
        _pared("MBO1", 6, "LINESTRING (0 6, 0 0)", "O", tipo="MEDIANERA", subtipo="MEDIANERA"),
        {"id": "CUB1", "planta": "PB", "nivel": 0, "tipo": "CUBIERTA",
         "subtipo": "AIRE_EXTERIOR", "superficie": _medida(60.0),
         "geometria_wkt": "POLYGON ((0 0, 10 0, 10 6, 0 6, 0 0))"},
        {"id": "SUB1", "planta": "PB", "nivel": 0, "tipo": "SUELO",
         "subtipo": "TERRENO", "superficie": _medida(60.0),
         "geometria_wkt": "POLYGON ((0 0, 10 0, 10 6, 0 6, 0 0))"},
    ]}


TERM = {
    "fachada": {"u": 1.69, "masa": 200.0},
    "medianera": {"u": 0, "masa": "200"},
    "cubierta": {"u": 1.69, "masa": 100.0, "forma": "Cubierta plana"},
    "suelo_terreno": {"u": 1.0, "masa": 750},
    "particion_superior": {"u": 2.0, "masa": 500, "tipo_espacio": "Otro"},
    "particion_vertical": {"u": 2.0, "masa": 60.0, "tipo_espacio": ""},
}


def _inicial():
    """El pickle 3 de un inicial, LEIDO como lo lee el motor de un fichero."""
    datos = {
        "termicas": TERM,
        "envolvente": {
            "espacio": "Edificio Objeto", "zonas": [], "incluir_plantas": ["PB"],
            "excluir_ids": {"ids": []},
            "mejora": {"cerramientos": ["FBN1"]},
            "huecos": [
                {"id": "V1 - CAMBIA", "cerramiento": "FBN1", "ancho": 1.2, "alto": 1.1},
                {"id": "V2", "cerramiento": "FBS1", "ancho": 1.0, "alto": 1.0},
                {"id": "P1 - CAMBIA", "cerramiento": "FBS1", "ancho": 0.9, "alto": 2.05,
                 "porc_marco": 90, "marco": "Madera"},
            ],
        },
    }
    env, _ = G.construir_envolvente(_geo(), datos)
    return L.reconstruir(P.volcar(env).encode("latin-1"))


def _por_nombre(env):
    return {str(c[0]): c for c in env[0]}


def _hueco(env, nombre):
    return next(h for h in env[1] if str(h.estado.get("descripcion")) == nombre)


def test_las_ventanas_marcadas_pasan_a_conocidas_con_los_valores_por_defecto():
    env, _, hechos = PV.aplicar_envolvente(_inicial(), {"huecos": [{"que": "cambia"}]})
    assert hechos["huecos"] == ["V1 - CAMBIA", "P1 - CAMBIA"]
    v1 = _hueco(env, "V1 - CAMBIA")
    st = v1.estado
    assert v1.clase == "HuecoConocidas" and str(st["__tipo__"]) == "HuecoConocidas"
    assert (st["Umarco"], st["Uvidrio"], st["Gvidrio"]) == (1.3, 1.3, 0.43)
    assert (st["UmarcoConocido"], st["UvidrioConocido"], st["GvidrioConocido"]) == ("1.3", "1.3", "0.43")
    assert st["permeabilidadChoice"] == "Valor conocido" and st["permeabilidadValor"] == "3"
    assert st["porcMarco"] == "20" and list(st["absortividadPosiciones"]) == [0, 0]
    assert "tipoMarco" not in st and "tipoVidrio" not in st
    # La que no se cambia, como estaba.
    assert _hueco(env, "V2").clase == "HuecoEstimadas"


def test_una_puerta_conserva_su_porcentaje_de_marco():
    env, _, _ = PV.aplicar_envolvente(_inicial(), {"huecos": [{"que": "cambia"}]})
    assert _hueco(env, "P1 - CAMBIA").estado["porcMarco"] == "90"


def test_los_valores_de_la_ficha_mandan_sobre_los_de_defecto():
    env, _, _ = PV.aplicar_envolvente(_inicial(), {"huecos": [
        {"que": ["V1"], "u_marco": 1.6, "u_vidrio": 1.1, "g": 0.5, "porc_marco": 25,
         "permeabilidad": 9}]})
    st = _hueco(env, "V1 - CAMBIA").estado
    assert (st["Umarco"], st["Uvidrio"], st["Gvidrio"], st["porcMarco"], st["permeabilidadValor"]) \
        == (1.6, 1.1, 0.5, "25", "9")


def test_el_aislamiento_cambia_solo_lo_marcado_y_lo_pasa_a_conocidas():
    env, _, hechos = PV.aplicar_envolvente(_inicial(), {"aislamiento": [
        {"que": "cambia", "elementos": ["fachada"], "u": 0.35}]})
    cer = _por_nombre(env)
    fbn = cer["FBN1 FACHADA - CAMBIA"]
    assert fbn[3] == 0.35 and fbn[8] == "Conocidas" and fbn[9] == [True, "0.35", "200.0"]
    assert cer["FBS1 FACHADA"][3] == 1.69
    assert [c["nombre"] for c in hechos["cerramientos"]] == ["FBN1 FACHADA - CAMBIA"]


def test_con_lambda_y_espesor_la_u_es_la_de_ce3x():
    env, _, _ = PV.aplicar_envolvente(_inicial(), {"aislamiento": [
        {"que": "todos", "elementos": ["cubierta"], "lambda": 0.035, "espesor": 0.10}]})
    cub = next(c for c in env[0] if str(c[1]) == "Cubierta")
    u = 1.0 / (1.0 / 1.69 + 0.10 / 0.035)
    assert cub[3] == pytest.approx(u, abs=1e-4)
    assert cub[9][0] == "Cubierta plana" and cub[9][1] is True


def test_la_medianera_no_se_aisla_y_nombrarla_es_un_error():
    env, _, _ = PV.aplicar_envolvente(_inicial(), {"aislamiento": [
        {"que": "todos", "elementos": ["fachada"], "u": 0.4}]})
    assert _por_nombre(env)["MBO1 MEDIANERA"][3] == 0
    with pytest.raises(GeneracionError, match="MEDIANERA"):
        PV.aplicar_envolvente(_inicial(), {"aislamiento": [
            {"que": ["MBO1 MEDIANERA"], "elementos": ["fachada"], "u": 0.4}]})


def test_el_suelo_contra_el_terreno_no_admite_u_conocida():
    with pytest.raises(GeneracionError, match="TERRENO"):
        PV.aplicar_envolvente(_inicial(), {"aislamiento": [
            {"que": "todos", "elementos": ["suelo"], "u": 0.4}]})


def test_un_nombre_que_no_existe_no_se_traga():
    with pytest.raises(GeneracionError, match="no existen"):
        PV.aplicar_envolvente(_inicial(), {"huecos": [{"que": ["V9"]}]})


def test_una_regla_de_aislamiento_que_no_toca_nada_es_un_error():
    with pytest.raises(GeneracionError, match="no toca"):
        PV.aplicar_envolvente(_inicial(), {"aislamiento": [
            {"que": "cambia", "elementos": ["cubierta"], "u": 0.3}]})


def test_la_ventilacion_y_la_masa_de_los_previstos():
    p2 = ["Anterior", "Unifamiliar"] + [""] * 8 + ["Pesada"] + [""] * 5 + ["0.83"] + [""] * 4
    nuevo, avisos = PV.aplicar_generales(p2, {})
    assert nuevo[16] == "0.53" and nuevo[10] == "Ligera"
    assert avisos


def test_el_previsto_se_vuelve_a_escribir():
    """Lo cambiado tiene que poder volcarse y releerse: es lo que va al fichero."""
    env, _, _ = PV.aplicar_envolvente(_inicial(), {
        "huecos": [{"que": "cambia"}],
        "aislamiento": [{"que": "cambia", "elementos": ["fachada"], "u": 0.35}]})
    otra = L.reconstruir(P.volcar(env).encode("latin-1"))
    assert _hueco(otra, "V1 - CAMBIA").clase.endswith("HuecoConocidas")
    assert _por_nombre(otra)["FBN1 FACHADA - CAMBIA"][3] == 0.35
