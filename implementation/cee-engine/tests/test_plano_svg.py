"""El plano que se dibuja en pantalla sale del WKT, y sale bien encuadrado."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.viz import plano_svg  # noqa: E402


def _geo(*elementos, spaces=None):
    return {"elementos": list(elementos),
            "modelo": {"spaces": spaces if spaces is not None else [
                {"floor": 0, "area": 100.0, "attrs": {"habitable": True}}]}}


def _muro(id, planta="PB", nivel=0, wkt="LINESTRING (0 0, 10 0)", tipo="FACHADA"):
    return {"id": id, "planta": planta, "nivel": nivel, "tipo": tipo,
            "subtipo": "CALLE", "orientacion": "S", "geometria_wkt": wkt,
            "largo": {"value": 10.0}, "alto": {"value": 2.8},
            "superficie": {"value": 28.0}}


def test_la_Y_se_invierte_porque_en_un_svg_crece_hacia_abajo():
    """Sin invertirla el plano sale del reves y el norte acaba al sur."""
    d = plano_svg.plantas(_geo(_muro("F1", wkt="LINESTRING (0 0, 0 10)")))
    (_, y0), (_, y1) = d["plantas"][0]["muros"][0]["svg"]
    assert y0 > y1              # el punto de Y=0 (sur) queda ABAJO en pantalla


def test_todas_las_plantas_comparten_encuadre():
    """Si cada planta se escalara a su tamano, una encima de otra no
    coincidirian y el certificador no podria cruzarlas de un vistazo."""
    d = plano_svg.plantas(_geo(
        _muro("FB1", wkt="LINESTRING (0 0, 20 0)"),
        _muro("F11", "P1", 1, "LINESTRING (0 0, 5 0)"),
        spaces=[{"floor": 0, "area": 100.0, "attrs": {"habitable": True}},
                {"floor": 1, "area": 50.0, "attrs": {"habitable": True}}]))
    baja = {m["id"]: m["svg"] for m in d["plantas"][0]["muros"]}
    alta = {m["id"]: m["svg"] for m in d["plantas"][1]["muros"]}
    assert baja["FB1"][0] == alta["F11"][0]     # el mismo origen del mundo


def test_el_sotano_no_se_dibuja():
    """No es habitable, no va a la envolvente y en la herramienta estorba."""
    d = plano_svg.plantas(_geo(
        _muro("FB1"), _muro("FS11", "S1", -1),
        spaces=[{"floor": 0, "area": 100.0, "attrs": {"habitable": True}},
                {"floor": -1, "area": 90.0, "attrs": {"habitable": False}}]))
    assert [p["id"] for p in d["plantas"]] == ["PB"]


def test_las_plantas_van_de_abajo_arriba():
    d = plano_svg.plantas(_geo(
        _muro("F21", "P2", 2), _muro("FB1"), _muro("F11", "P1", 1),
        spaces=[{"floor": n, "area": 50.0, "attrs": {"habitable": True}}
                for n in (0, 1, 2)]))
    assert [p["nombre"] for p in d["plantas"]] == ["PLANTA BAJA", "PLANTA 1", "PLANTA 2"]


def test_un_suelo_o_una_cubierta_NO_se_dibujan():
    """Son superficies horizontales: en un plano de paredes no se ven."""
    d = plano_svg.plantas(_geo(_muro("FB1"), _muro("CUB1", tipo="CUBIERTA")))
    assert [m["id"] for m in d["plantas"][0]["muros"]] == ["FB1"]


def test_lo_excluido_se_dibuja_PERO_marcado():
    """Una pared que desaparece del plano sin avisar es un agujero que nadie
    encuentra: se ve, y se ve que esta fuera."""
    d = plano_svg.plantas(_geo(_muro("FB1"), _muro("FB2")), excluir={"FB2"})
    fuera = {m["id"]: m["fuera"] for m in d["plantas"][0]["muros"]}
    assert fuera == {"FB1": False, "FB2": True}


def test_la_superficie_de_la_zona_es_la_construida_de_catastro():
    d = plano_svg.plantas(_geo(_muro("FB1")))
    assert d["plantas"][0]["superficie"] == 100.0


def test_sin_geometria_no_se_inventa_un_lienzo():
    d = plano_svg.plantas({"elementos": []})
    assert d == {"ancho": 0, "alto": 0, "plantas": []}
