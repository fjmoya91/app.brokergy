"""Lucernarios en la cubierta y el % de marco de cada hueco (2026-09-29).

Dos cosas que pidio un certificador usando la envolvente:

1. Una PUERTA no dejaba elegir marco, vidrio ni % de marco: salia siempre de
   madera al 90 %. Una puerta de patio de aluminio acristalada a medias (40 %
   de marco metalico) habia que meterla como ventana y corregir el porcentaje
   en CE3X. Y a una ventana tampoco se le podia cambiar el %.

2. La CUBIERTA no admitia huecos: un lucernario se metia despues a mano en
   CE3X.

Las formas estan MEDIDAS, no inventadas:

- Lucernario: 19 de 19 en los .cex de produccion (14 expedientes con
  lucernario en su certificado) cuelgan de una cubierta, con `tipo =
  'Lucernario'`, `orientacion = 'Techo'`, su «Contorno de hueco» sobre la
  cubierta y NINGUNO con caja de persiana.
- % de marco: 20 (312 huecos), 90 (45), 10, 30, 40, 100 (12)... Con el 100 %
  el vidrio va en blanco y su U y su g a cero (12 de 12).
"""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import pytest               # noqa: E402
import generar_cex as G     # noqa: E402
from pickle0 import Cadena  # noqa: E402

ALTO = 2.80
TECHO = "POLYGON ((0 0, 10 0, 10 6, 0 6, 0 0))"
LIENZO = {"dx": 0, "y0": 6}

TERM = {
    "fachada": {"u": 1.69, "masa": 200.0},
    "medianera": {"u": 0, "masa": "200"},
    "cubierta": {"u": 1.69, "masa": 100.0, "forma": "Cubierta plana"},
    "suelo_terreno": {"u": 1.0, "masa": 750},
    "particion_superior": {"u": 2.0, "masa": 500, "tipo_espacio": "Otro"},
    "particion_vertical": {"u": 2.0, "masa": 60.0, "tipo_espacio": ""},
}


def _medida(v):
    return {"value": v, "source": "CATASTRO_WFS_BU", "confidence": 1.0,
            "evidence_type": "MEASURED", "note": None}


def _pared(ident, largo, wkt, orientacion):
    return {"id": ident, "planta": "PB", "nivel": 0, "tipo": "FACHADA",
            "subtipo": "FACHADA", "orientacion": orientacion, "azimut": 0.0,
            "largo": _medida(largo), "alto": _medida(ALTO),
            "superficie": _medida(round(largo * ALTO, 2)), "geometria_wkt": wkt}


def _geo():
    return {"elementos": [
        _pared("FBS1", 10, "LINESTRING (0 0, 10 0)", "S"),
        _pared("FBE1", 6, "LINESTRING (10 0, 10 6)", "E"),
        _pared("FBN1", 10, "LINESTRING (10 6, 0 6)", "N"),
        _pared("FBO1", 6, "LINESTRING (0 6, 0 0)", "O"),
        {"id": "CUB1", "planta": "PB", "nivel": 0, "tipo": "CUBIERTA",
         "subtipo": "AIRE_EXTERIOR", "superficie": _medida(60.0),
         "geometria_wkt": TECHO},
    ]}


def _datos(huecos, mejora=None, defecto=None):
    return {"termicas": TERM, "envolvente": {
        "espacio": "Edificio Objeto", "zonas": [],
        "incluir_plantas": ["PB"], "excluir_ids": {"ids": []},
        "huecos": huecos,
        **({"huecos_defecto": defecto} if defecto else {}),
        **({"mejora": mejora} if mejora else {}),
    }}


def _hueco(env, nombre):
    return next(h for h in env[1] if str(h.estado[Cadena("descripcion")]) == nombre)


def _campo(h, k):
    return h.estado[Cadena(k)]


@pytest.fixture
def muro_sur():
    return G.muro("F11 CALLE", 39.56, "S", 14.13, 2.8, "Edificio Objeto",
                  {"u": 1.69, "masa": 200.0})


# ---------------------------------------------------------------------------
# El % de marco
# ---------------------------------------------------------------------------

def test_una_puerta_de_patio_metalica_al_40_por_ciento(muro_sur):
    """El caso que lo pidio: aluminio, acristalada a medias."""
    p = G.hueco({"id": "PE2", "ancho": 1.6, "alto": 2.1, "porc_marco": "40",
                 "marco": "Metálico sin RPT", "vidrio": "Doble"},
                muro_sur, "Edificio Objeto", {})
    assert _campo(p, "porcMarco") == "40"
    assert _campo(p, "tipoMarco") == "Metálico sin RPT"
    assert _campo(p, "Umarco") == 5.7
    assert (_campo(p, "Uvidrio"), _campo(p, "Gvidrio")) == (3.3, 0.75)
    assert str(_campo(p, "tipo")) == "Hueco"


def test_el_porcentaje_de_una_ventana_tambien_se_cambia(muro_sur):
    v = G.hueco({"id": "V1", "ancho": 1.2, "alto": 1.2, "porc_marco": 30},
                muro_sur, "Edificio Objeto", {})
    assert _campo(v, "porcMarco") == "30"


def test_sin_porcentaje_sigue_saliendo_el_20_de_siempre(muro_sur):
    """Lo que no se toca sale EXACTAMENTE igual que antes."""
    v = G.hueco({"id": "V1", "ancho": 1.2, "alto": 1.2}, muro_sur, "Edificio Objeto", {})
    assert _campo(v, "porcMarco") == "20"
    p = G.hueco({"id": "PE", "ancho": 0.9, "alto": 2.1, "porc_marco": "90",
                 "marco": "Madera"}, muro_sur, "Edificio Objeto", {})
    assert _campo(p, "porcMarco") == "90"


def test_el_porcentaje_admite_coma_y_decimales(muro_sur):
    v = G.hueco({"id": "V1", "ancho": 1, "alto": 1, "porc_marco": "41,5"},
                muro_sur, "Edificio Objeto", {})
    assert _campo(v, "porcMarco") == "41.5"


@pytest.mark.parametrize("malo", ["0", "-5", "120", "abc", ""])
def test_un_porcentaje_que_no_lo_es_se_rechaza(muro_sur, malo):
    with pytest.raises(G.GeneracionError, match="% de marco"):
        G.hueco({"id": "V1", "ancho": 1, "alto": 1, "porc_marco": malo},
                muro_sur, "Edificio Objeto", {})


def test_una_puerta_opaca_al_100_no_lleva_vidrio(muro_sur):
    """Como la escribe CE3X: vidrio en blanco, U y g del vidrio a cero."""
    p = G.hueco({"id": "PE", "ancho": 0.9, "alto": 2.1, "porc_marco": 100,
                 "marco": "Metálico sin RPT", "vidrio": "Doble"},
                muro_sur, "Edificio Objeto", {})
    assert _campo(p, "porcMarco") == "100"
    assert _campo(p, "tipoVidrio") == ""
    assert (_campo(p, "Uvidrio"), _campo(p, "Gvidrio")) == (0.0, 0.0)
    assert _campo(p, "Umarco") == 5.7


# ---------------------------------------------------------------------------
# Lucernarios
# ---------------------------------------------------------------------------

def test_un_hueco_en_la_cubierta_es_un_lucernario_orientado_al_techo():
    env, _ = G.construir_envolvente(_geo(), _datos([
        {"id": "L1", "cerramiento": "CUB1", "ancho": 1, "alto": 1, "tipo": "Lucernario"}]))
    l1 = _hueco(env, "L1")
    assert str(_campo(l1, "tipo")) == "Lucernario"
    assert str(_campo(l1, "orientacion")) == "Techo"
    assert str(_campo(l1, "cerramientoAsociado")) == "CUB1 CUBIERTA"


def test_lo_decide_el_cerramiento_no_quien_lo_manda():
    """Aunque llegue como 'Hueco', en una cubierta es un lucernario."""
    env, _ = G.construir_envolvente(_geo(), _datos([
        {"id": "L1", "cerramiento": "CUB1", "ancho": 1, "alto": 1, "tipo": "Hueco"}]))
    assert str(_campo(_hueco(env, "L1"), "tipo")) == "Lucernario"


def test_su_contorno_cuelga_de_la_cubierta_y_no_lleva_caja_de_persiana():
    """Con la vivienda CON persianas, el lucernario no hereda la suya."""
    env, _ = G.construir_envolvente(_geo(), _datos(
        [{"id": "L1", "cerramiento": "CUB1", "ancho": 1, "alto": 1, "tipo": "Lucernario"},
         {"id": "V1", "cerramiento": "FBS1", "ancho": 1.2, "alto": 1.2}],
        defecto={"vidrio": "Doble", "marco": "PVC", "persiana": True}))
    contornos = {p[0]: p for p in env[2] if p[2] == "Contorno de hueco"}
    assert contornos["PT Contorno de hueco-L1"][7] == "CUB1 CUBIERTA"
    assert float(contornos["PT Contorno de hueco-L1"][4]) == pytest.approx(4.0)
    cajas = [p[0] for p in env[2] if p[2] == "Caja de Persiana"]
    assert cajas == ["PT Caja de Persiana-V1"]          # la ventana sí, él no


def test_un_lucernario_hereda_la_carpinteria_de_la_vivienda():
    env, _ = G.construir_envolvente(_geo(), _datos(
        [{"id": "L1", "cerramiento": "CUB1", "ancho": 0.6, "alto": 0.6}],
        defecto={"vidrio": "Simple", "marco": "PVC", "persiana": False}))
    l1 = _hueco(env, "L1")
    assert (_campo(l1, "tipoVidrio"), _campo(l1, "tipoMarco")) == ("Simple", "PVC")


def test_con_la_cubierta_partida_va_a_la_parte_que_se_conserva():
    mejora = {"lienzo_a_mundo": LIENZO,
              "cubierta": {"PB": {"poligono": [[0, 0], [5, 0], [5, 6], [0, 6]]}}}
    env, _ = G.construir_envolvente(_geo(), _datos(
        [{"id": "L1", "cerramiento": "CUB1", "ancho": 1, "alto": 1}], mejora=mejora))
    assert str(_campo(_hueco(env, "L1"), "cerramientoAsociado")) == "CUB1 CUBIERTA"


def test_un_lucernario_que_se_cambia_va_a_la_parte_que_se_rehace():
    mejora = {"lienzo_a_mundo": LIENZO,
              "cubierta": {"PB": {"poligono": [[0, 0], [5, 0], [5, 6], [0, 6]]}}}
    env, _ = G.construir_envolvente(_geo(), _datos(
        [{"id": "L1 - CAMBIA", "cerramiento": "CUB1", "ancho": 1, "alto": 1}],
        mejora=mejora))
    asoc = str(_campo(_hueco(env, "L1 - CAMBIA"), "cerramientoAsociado"))
    assert asoc == "CUB1 CUBIERTA - CAMBIA"


def test_un_lucernario_en_una_fachada_no_lo_es_y_se_dice():
    env, avisos = G.construir_envolvente(_geo(), _datos([
        {"id": "L9", "cerramiento": "FBS1", "ancho": 1, "alto": 1, "tipo": "Lucernario"}]))
    l9 = _hueco(env, "L9")
    assert str(_campo(l9, "tipo")) == "Hueco"
    assert str(_campo(l9, "orientacion")) == "Sur"
    assert any("no es una cubierta" in a for a in avisos)


def test_el_porcentaje_de_hueco_de_fachada_no_cuenta_el_tejado():
    """Un lucernario grande no puede hacer creer que la fachada es de cristal."""
    env, _ = G.construir_envolvente(_geo(), _datos([
        {"id": "L1", "cerramiento": "CUB1", "ancho": 3, "alto": 3},
        {"id": "V1", "cerramiento": "FBS1", "ancho": 1, "alto": 1}]))
    avisos = G.contrastar(env, None)
    fachada = sum(float(c[2]) for c in env[0] if str(c[1]) == "Fachada")
    # Sin contar el lucernario, 1 m2 sobre ~90 m2 de fachada: por debajo del p10.
    assert any("hueco / fachada" in a and "POR DEBAJO" in a for a in avisos), (fachada, avisos)
