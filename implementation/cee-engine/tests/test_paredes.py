"""Las paredes que MUEVE o DIBUJA el certificador.

Catastro dibuja el perimetro de lo construido y se equivoca: un tabique que se
ve perfectamente sobre la cartografia esta medio metro a un lado, o
directamente no esta. Con el plano delante el certificador lo ve y lo corrige,
y de ahi sale una SUPERFICIE que va a un certificado.

Lo que se vigila aqui es justo eso: que la mide el MOTOR (no el navegador), que
sale con la altura de planta de sus vecinas, que SIEMPRE se avisa de que la ha
puesto una persona, y que una pared a medias no se cuela en silencio.
"""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import pytest              # noqa: E402
import generar_cex as G   # noqa: E402


ALTO = 2.80


def _medida(valor, fuente="CATASTRO_WFS_BU", ev="MEASURED"):
    return {"value": valor, "source": fuente, "confidence": 1.0,
            "evidence_type": ev, "note": None}


def _pared(ident, largo, planta="PB", tipo="FACHADA"):
    return {
        "id": ident, "planta": planta, "nivel": 0, "tipo": tipo,
        "subtipo": "FACHADA", "orientacion": "N", "azimut": 0.0,
        "largo": _medida(largo), "alto": _medida(ALTO),
        "superficie": _medida(round(largo * ALTO, 2)),
        "geometria_wkt": "LINESTRING (0 0, 1 0)",
    }


def _geo():
    return {"elementos": [_pared("FBN1", 14.00), _pared("PBE1", 5.10,
                                                        tipo="PARTICION_VERTICAL")]}


def _por_id(elementos):
    return {e["id"]: e for e in elementos}


# ---------------------------------------------------------------------------
# Mover una pared
# ---------------------------------------------------------------------------

def test_una_pared_movida_se_vuelve_a_medir():
    # 3-4-5: la pared pasa a medir 5 m exactos, y su superficie con ella.
    els, avisos = G.aplicar_paredes(
        _geo(), {"paredes": {"movidas": {"PBE1": {"lienzo": [[1.0, 1.0], [4.0, 5.0]]}}}})
    pbe1 = _por_id(els)["PBE1"]
    assert pbe1["largo"]["value"] == 5.0
    assert pbe1["superficie"]["value"] == round(5.0 * ALTO, 2)
    assert avisos and "MOVIDO" in avisos[0]


def test_la_pared_movida_dice_que_la_movio_una_persona():
    els, avisos = G.aplicar_paredes(
        _geo(), {"paredes": {"movidas": {"PBE1": {"lienzo": [[0, 0], [0, 6.53]]}}}})
    pbe1 = _por_id(els)["PBE1"]
    # La procedencia es la de un dato que aporta alguien, no una medida de
    # Catastro: es lo que separa "lo he medido yo" de "lo dice el registro".
    assert pbe1["largo"]["source"] == "USER_INPUT"
    assert pbe1["largo"]["evidence_type"] == "MANUAL"
    # Y el aviso lleva las DOS cifras: sin la de Catastro al lado no hay forma
    # de saber cuanto se ha corregido.
    assert "6.53" in avisos[0] and "5.10" in avisos[0]


def test_mover_una_pared_no_toca_a_las_demas():
    els, _ = G.aplicar_paredes(
        _geo(), {"paredes": {"movidas": {"PBE1": {"lienzo": [[0, 0], [0, 9]]}}}})
    assert _por_id(els)["FBN1"]["largo"]["value"] == 14.00


def test_el_original_no_se_toca():
    """`aplicar_paredes` copia: el JSON de la geometria es de quien lo paso."""
    geo = _geo()
    G.aplicar_paredes(geo, {"paredes": {"movidas": {"PBE1": {"lienzo": [[0, 0], [0, 9]]}}}})
    assert geo["elementos"][1]["largo"]["value"] == 5.10


# ---------------------------------------------------------------------------
# Dibujar una pared nueva
# ---------------------------------------------------------------------------

def test_una_pared_dibujada_entra_medida_y_con_la_altura_de_sus_vecinas():
    els, avisos = G.aplicar_paredes(_geo(), {"paredes": {"nuevas": [
        {"id": "PBN9", "planta": "PB", "nivel": 0,
         "lienzo": [[2.0, 2.0], [2.0, 8.5]]},
    ]}})
    nueva = _por_id(els)["PBN9"]
    assert nueva["largo"]["value"] == 6.5
    assert nueva["alto"]["value"] == ALTO
    assert nueva["superficie"]["value"] == round(6.5 * ALTO, 2)
    assert nueva["tipo"] == "PARTICION_VERTICAL"      # el valor por defecto
    assert any("DIBUJADA" in a for a in avisos)


def test_una_pared_dibujada_no_lleva_orientacion():
    """La orientacion de una fachada es la de su NORMAL EXTERIOR, y aqui no hay
    poligono del que sacarla. Es lo mismo que hace el motor con las
    particiones que mide el."""
    els, _ = G.aplicar_paredes(_geo(), {"paredes": {"nuevas": [
        {"id": "PBN9", "planta": "PB", "lienzo": [[0, 0], [3, 4]]}]}})
    assert _por_id(els)["PBN9"]["orientacion"] is None


def test_una_pared_dibujada_pide_revision():
    els, _ = G.aplicar_paredes(_geo(), {"paredes": {"nuevas": [
        {"id": "PBN9", "planta": "PB", "lienzo": [[0, 0], [3, 4]]}]}})
    assert _por_id(els)["PBN9"]["requiere_revision"] is True


def test_un_nombre_que_ya_existe_no_pisa_a_la_pared_de_catastro():
    els, avisos = G.aplicar_paredes(_geo(), {"paredes": {"nuevas": [
        {"id": "FBN1", "planta": "PB", "lienzo": [[0, 0], [3, 4]]}]}})
    assert _por_id(els)["FBN1"]["largo"]["value"] == 14.00
    assert any("ya hay un cerramiento" in a for a in avisos)


# ---------------------------------------------------------------------------
# Lo que NO se traga en silencio
# ---------------------------------------------------------------------------

def test_un_resbalon_del_raton_no_es_una_pared():
    els, avisos = G.aplicar_paredes(_geo(), {"paredes": {"nuevas": [
        {"id": "PBN9", "planta": "PB", "lienzo": [[1, 1], [1.05, 1.05]]}]}})
    assert "PBN9" not in _por_id(els)
    assert any("no se ha podido medir" in a for a in avisos)


def test_mover_una_pared_que_ya_no_existe_se_dice():
    els, avisos = G.aplicar_paredes(
        _geo(), {"paredes": {"movidas": {"XXX": {"lienzo": [[0, 0], [0, 5]]}}}})
    assert len(els) == 2
    assert any("ya no esta en la geometria" in a for a in avisos)


def test_una_planta_sin_ninguna_pared_medida_no_da_altura():
    els, avisos = G.aplicar_paredes(_geo(), {"paredes": {"nuevas": [
        {"id": "P1N9", "planta": "P1", "lienzo": [[0, 0], [0, 5]]}]}})
    assert "P1N9" not in _por_id(els)
    assert any("altura de la planta" in a for a in avisos)


def test_sin_paredes_no_cambia_nada():
    geo = _geo()
    els, avisos = G.aplicar_paredes(geo, {})
    assert avisos == []
    assert [e["id"] for e in els] == ["FBN1", "PBE1"]
    assert _por_id(els)["PBE1"]["largo"]["value"] == 5.10


# ---------------------------------------------------------------------------
# De punta a punta: que la pared acaba ESCRITA en la envolvente del .cex
# ---------------------------------------------------------------------------

TERM = {
    "fachada": {"u": 1.69, "masa": 200.0},
    "medianera": {"u": 0, "masa": "200"},
    "cubierta": {"u": 1.69, "masa": 100.0, "forma": "Cubierta plana"},
    "suelo_terreno": {"u": 1.0, "masa": 750},
    "particion_superior": {"u": 2.0, "masa": 500, "tipo_espacio": "Otro"},
    "particion_vertical": {"u": 2.0, "masa": 60.0, "tipo_espacio": ""},
}


def _datos(paredes):
    return {
        "termicas": TERM,
        "envolvente": {
            "espacio": "Edificio Objeto", "zonas": [],
            "incluir_plantas": ["PB"], "excluir_ids": {"ids": []},
            "suelo": {"superficie": 165.0}, "cubierta": {"superficie": 90.0},
            "particion_superior": {"superficie": 74.18},
            "paredes": paredes,
        },
    }


def _opacos(env):
    """Los cerramientos, buscados por el nombre CON EL QUE SE ESCRIBEN.

    No es el id a secas: el .cex les pone detras lo que son ("PBX1 PARTICION CON
    EL VECINO", "FBN1 CALLE"), que es lo que ve el certificador en el arbol de
    CE3X. Se busca por prefijo.
    """
    return {c[0].split(" ")[0]: c for c in env[0]}


def test_la_pared_dibujada_sale_como_un_cerramiento_mas():
    """El payload TAL CUAL lo manda la vista, hasta el pickle."""
    env, avisos = G.construir_envolvente(_geo(), _datos({"nuevas": [{
        "id": "PBX1", "planta": "PB", "nivel": 0, "tipo": "PARTICION_VERTICAL",
        "lienzo": [[13.2796, 3], [6.2237, 13]],
    }]}))
    pbx1 = _opacos(env)["PBX1"]
    # 12,24 m x 2,80 m = 34,27 m2: lo mismo que ensena el panel al soltarla.
    assert float(pbx1[2]) == pytest.approx(34.27, abs=0.01)
    assert float(pbx1[-5]) == pytest.approx(12.24, abs=0.01)   # largo
    assert float(pbx1[-4]) == pytest.approx(2.80, abs=0.01)    # alto
    assert any("DIBUJADA" in a for a in avisos)


def test_la_pared_dibujada_se_escribe_como_PARTICION_CON_SU_U():
    """Sale por la rama de la particion, que es la que ya sabe emitirla con su
    U — asi las tres opciones que ve el certificador (fachada, medianera,
    particion) salen de un solo camino. Y NO es adiabatica: por una particion
    se pierde calor, que es justo la diferencia con una medianera."""
    env, _ = G.construir_envolvente(_geo(), _datos({"nuevas": [{
        "id": "PBX1", "planta": "PB", "tipo": "PARTICION_VERTICAL",
        "lienzo": [[0, 0], [0, 6]],
    }]}))
    pbx1 = _opacos(env)["PBX1"]
    assert pbx1[1] == "Partición Interior"
    assert pbx1[3] == TERM["particion_vertical"]["u"]
    assert float(pbx1[2]) == pytest.approx(6 * ALTO, abs=0.01)


def test_una_pared_movida_escribe_su_superficie_nueva():
    env, _ = G.construir_envolvente(_geo(), _datos({"movidas": {
        "FBN1": {"lienzo": [[0, 0], [9.05, 0]]}}}))
    fbn1 = _opacos(env)["FBN1"]
    assert float(fbn1[-5]) == pytest.approx(9.05, abs=0.01)
    assert float(fbn1[2]) == pytest.approx(9.05 * ALTO, abs=0.02)


def test_una_pared_APARTADA_no_se_escribe_aunque_se_haya_dibujado():
    """Apartar manda sobre todo lo demas: si no cuenta, no se escribe."""
    datos = _datos({"nuevas": [{"id": "PBX1", "planta": "PB",
                                "lienzo": [[0, 0], [0, 6]]}]})
    datos["envolvente"]["excluir_ids"]["ids"] = ["PBX1"]
    env, _ = G.construir_envolvente(_geo(), datos)
    assert "PBX1" not in _opacos(env)



def test_una_pared_que_solo_cambia_de_sitio_no_repite_la_cifra():
    """Deslizada en paralelo mide lo mismo, y decir "6,53 m donde Catastro la
    mide 6,53 m" se lee como un fallo. Lo que ha cambiado —contra que da— sigue
    contando, asi que se avisa igual, con otras palabras."""
    _, avisos = G.aplicar_paredes(_geo(), {"paredes": {"movidas": {
        "PBE1": {"lienzo": [[0, 0], [0, 5.10]]}}}})
    assert "solo cambia de sitio" in avisos[0]
    assert avisos[0].count("5.10") == 1
