"""Lo que se REFORMA lleva «- CAMBIA» en el nombre, y la cubierta se parte.

El certificador marca en el plano que ventana se cambia, que pared se aisla y
que parte de la cubierta se rehace. Al .cex eso llega SOLO como un sufijo en el
nombre —«V1 - CAMBIA», «FBN1 FACHADA - CAMBIA»— que es lo que le dice en CE3X
sobre que elementos montar la medida de mejora (decision del 2026-09-19: solo
el nombre, ni una U se toca). La cubierta, ademas, puede partirse en dos con
un poligono dibujado sobre el plano, y la superficie de cada parte la mide el
MOTOR intersecando con el tejado real.
"""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import pytest              # noqa: E402
import generar_cex as G   # noqa: E402
from pickle0 import Cadena  # noqa: E402


ALTO = 2.80


def _medida(valor):
    return {"value": valor, "source": "CATASTRO_WFS_BU", "confidence": 1.0,
            "evidence_type": "MEASURED", "note": None}


def _pared(ident, largo, wkt, orientacion="N"):
    return {
        "id": ident, "planta": "PB", "nivel": 0, "tipo": "FACHADA",
        "subtipo": "FACHADA", "orientacion": orientacion, "azimut": 0.0,
        "largo": _medida(largo), "alto": _medida(ALTO),
        "superficie": _medida(round(largo * ALTO, 2)), "geometria_wkt": wkt,
    }


#: Un tejado de 10 x 6 = 60 m2 sobre la planta baja, con sus cuatro fachadas.
TECHO = "POLYGON ((0 0, 10 0, 10 6, 0 6, 0 0))"


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


TERM = {
    "fachada": {"u": 1.69, "masa": 200.0},
    "medianera": {"u": 0, "masa": "200"},
    "cubierta": {"u": 1.69, "masa": 100.0, "forma": "Cubierta plana"},
    "suelo_terreno": {"u": 1.0, "masa": 750},
    "particion_superior": {"u": 2.0, "masa": 500, "tipo_espacio": "Otro"},
    "particion_vertical": {"u": 2.0, "masa": 60.0, "tipo_espacio": ""},
}

#: El lienzo es el mundo trasladado y con la Y del reves. Con `dx = 0` y
#: `y0 = 6`, un punto (x, y) del lienzo es (x, 6 - y) del mundo: el mismo
#: rectangulo, pero contado desde arriba.
LIENZO = {"dx": 0, "y0": 6}


def _datos(mejora=None, huecos=None):
    return {
        "termicas": TERM,
        "envolvente": {
            "espacio": "Edificio Objeto", "zonas": [],
            "incluir_plantas": ["PB"], "excluir_ids": {"ids": []},
            "huecos": huecos or [],
            **({"mejora": mejora} if mejora else {}),
        },
    }


def _nombres(env):
    return [str(c[0]) for c in env[0]]


def _cubiertas(env):
    return {str(c[0]): float(c[2]) for c in env[0] if str(c[1]) == "Cubierta"}


def _puentes(env, tipo):
    return [p for p in env[2] if p[2] == tipo]


# ---------------------------------------------------------------------------
# El sufijo
# ---------------------------------------------------------------------------

def test_sin_marcar_nada_no_cambia_ni_un_nombre():
    env, _ = G.construir_envolvente(_geo(), _datos())
    assert not any("CAMBIA" in n for n in _nombres(env))


def test_una_pared_marcada_lleva_el_sufijo_DETRAS_de_lo_que_es():
    """«FBN1 FACHADA - CAMBIA», no «FBN1 - CAMBIA FACHADA»: el sufijo va al
    final para que el arbol de CE3X siga leyendose por el tipo de pared."""
    env, _ = G.construir_envolvente(_geo(), _datos({"cerramientos": ["FBN1"]}))
    nombres = _nombres(env)
    assert "FBN1 FACHADA - CAMBIA" in nombres
    assert "FBS1 FACHADA" in nombres          # las demas, como siempre


def test_el_hueco_llega_ya_con_su_sufijo_y_se_escribe_tal_cual():
    """El sufijo del hueco lo pone la vista en el `id`: el motor lo respeta y
    lo propaga al puente de contorno, que enlaza por ese nombre."""
    env, _ = G.construir_envolvente(_geo(), _datos(
        huecos=[{"id": "V1 - CAMBIA", "cerramiento": "FBN1", "ancho": 1.3, "alto": 1.3,
                 "tipo": "Hueco"}]))
    assert str(env[1][0].estado[Cadena("descripcion")]) == "V1 - CAMBIA"
    contorno = _puentes(env, "Contorno de hueco")
    assert contorno and contorno[0][0] == "PT Contorno de hueco-V1 - CAMBIA"


def test_el_hueco_de_una_pared_marcada_sigue_casando_con_ella():
    """La pared se renombra con el sufijo y el hueco la busca por su ident:
    tiene que seguir encontrandola."""
    env, _ = G.construir_envolvente(_geo(), _datos(
        {"cerramientos": ["FBN1"]},
        huecos=[{"id": "V1", "cerramiento": "FBN1", "ancho": 1.3, "alto": 1.3}]))
    assert str(env[1][0].estado[Cadena("cerramientoAsociado")]) == "FBN1 FACHADA - CAMBIA"


def test_el_sufijo_no_se_repite_si_ya_lo_lleva():
    assert G.con_cambia("V1 - CAMBIA") == "V1 - CAMBIA"
    assert G.con_cambia("V1") == "V1 - CAMBIA"


# ---------------------------------------------------------------------------
# La cubierta
# ---------------------------------------------------------------------------

def test_la_cubierta_entera_se_renombra_y_sigue_siendo_una():
    env, avisos = G.construir_envolvente(
        _geo(), _datos({"cubierta": {"PB": {"entera": True}}}))
    cubs = _cubiertas(env)
    assert cubs == {"CUB1 CUBIERTA - CAMBIA": 60.0}
    assert any("ENTERA" in a for a in avisos)
    # y su encuentro con la fachada cuelga de ella, una sola vez
    enc = _puentes(env, "Encuentro de fachada con cubierta")
    assert [p[-2] for p in enc] == ["CUB1 CUBIERTA - CAMBIA"]


def test_medio_tejado_se_parte_en_dos_y_lo_mide_el_motor():
    """Un poligono sobre la mitad oeste (x de 0 a 5): 30 m2 se reforman y 30
    se conservan. La medida sale de INTERSECAR con el tejado, no del navegador."""
    env, avisos = G.construir_envolvente(_geo(), _datos({
        "lienzo_a_mundo": LIENZO,
        "cubierta": {"PB": {"poligono": [[0, 0], [5, 0], [5, 6], [0, 6]]}},
    }))
    cubs = _cubiertas(env)
    assert cubs["CUB1 CUBIERTA"] == pytest.approx(30.0, abs=0.01)
    assert cubs["CUB1 CUBIERTA - CAMBIA"] == pytest.approx(30.0, abs=0.01)
    assert any("partida en dos" in a for a in avisos)


def test_lo_que_se_sale_del_tejado_no_cuenta():
    """Un poligono que se pasa de largo por el este (x de 5 a 20) solo cuenta
    lo que cae DENTRO: 30 m2, no 90."""
    env, _ = G.construir_envolvente(_geo(), _datos({
        "lienzo_a_mundo": LIENZO,
        "cubierta": {"PB": {"poligono": [[5, 0], [20, 0], [20, 6], [5, 6]]}},
    }))
    assert _cubiertas(env)["CUB1 CUBIERTA - CAMBIA"] == pytest.approx(30.0, abs=0.01)


def test_el_encuentro_con_la_cubierta_cuelga_de_la_parte_que_se_conserva():
    """Con dos filas del mismo tejado, el puente saldria dos veces. Va sobre la
    que se conserva, y una sola vez."""
    env, _ = G.construir_envolvente(_geo(), _datos({
        "lienzo_a_mundo": LIENZO,
        "cubierta": {"PB": {"poligono": [[0, 0], [5, 0], [5, 6], [0, 6]]}},
    }))
    enc = _puentes(env, "Encuentro de fachada con cubierta")
    assert [p[-2] for p in enc] == ["CUB1 CUBIERTA"]


def test_un_poligono_que_cubre_todo_es_la_cubierta_entera():
    env, avisos = G.construir_envolvente(_geo(), _datos({
        "lienzo_a_mundo": LIENZO,
        "cubierta": {"PB": {"poligono": [[-1, -1], [11, -1], [11, 7], [-1, 7]]}},
    }))
    assert _cubiertas(env) == {"CUB1 CUBIERTA - CAMBIA": 60.0}
    assert any("entera" in a for a in avisos)


def test_un_poligono_fuera_del_tejado_no_parte_nada_y_lo_dice():
    env, avisos = G.construir_envolvente(_geo(), _datos({
        "lienzo_a_mundo": LIENZO,
        "cubierta": {"PB": {"poligono": [[20, 20], [25, 20], [25, 25]]}},
    }))
    assert _cubiertas(env) == {"CUB1 CUBIERTA": 60.0}
    assert any("no toca la cubierta" in a for a in avisos)


def test_la_y_del_lienzo_va_del_reves():
    """El lienzo cuenta la Y desde ARRIBA. Un poligono en la franja de lienzo
    y 0..2 es la franja del mundo y 4..6: cae dentro del tejado (que va de 0 a
    6) y mide 10 x 2 = 20 m2. Si la Y no se invirtiera seguiria midiendo 20,
    asi que se comprueba con un tejado que NO empieza en el origen."""
    geo = _geo()
    geo["elementos"][-1]["geometria_wkt"] = "POLYGON ((0 4, 10 4, 10 6, 0 6, 0 4))"
    geo["elementos"][-1]["superficie"] = _medida(20.0)
    env, _ = G.construir_envolvente(geo, _datos({
        "lienzo_a_mundo": LIENZO,
        "cubierta": {"PB": {"poligono": [[0, 0], [10, 0], [10, 1], [0, 1]]}},
    }))
    # lienzo y 0..1 -> mundo y 5..6: la mitad del tejado de 20 m2
    cubs = _cubiertas(env)
    assert cubs["CUB1 CUBIERTA - CAMBIA"] == pytest.approx(10.0, abs=0.01)
    assert cubs["CUB1 CUBIERTA"] == pytest.approx(10.0, abs=0.01)


def test_sin_georreferencia_se_toma_el_area_dibujada_y_se_avisa():
    env, avisos = G.construir_envolvente(_geo(), _datos({
        "cubierta": {"PB": {"poligono": [[0, 0], [4, 0], [4, 5], [0, 5]]}},
    }))
    assert _cubiertas(env)["CUB1 CUBIERTA - CAMBIA"] == pytest.approx(20.0, abs=0.01)
    assert any("sin georreferencia" in a for a in avisos)


def test_una_superficie_declarada_distinta_se_reparte_en_proporcion():
    """La ficha puede declarar otra superficie para la cubierta (derivada de la
    vivienda). El total escrito sigue siendo el declarado, y la parte reformada
    la misma FRACCION del tejado: medio tejado de 90 son 45."""
    datos = _datos({
        "lienzo_a_mundo": LIENZO,
        "cubierta": {"PB": {"poligono": [[0, 0], [5, 0], [5, 6], [0, 6]]}},
    })
    datos["envolvente"]["cubierta"] = {"superficie": 90.0}
    env, _ = G.construir_envolvente(_geo(), datos)
    cubs = _cubiertas(env)
    assert cubs["CUB1 CUBIERTA - CAMBIA"] == pytest.approx(45.0, abs=0.01)
    assert cubs["CUB1 CUBIERTA"] == pytest.approx(45.0, abs=0.01)
