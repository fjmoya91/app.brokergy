"""Comparacion entre plantas: suelos, cubiertas y particiones (§11, §21)."""
import pytest
from shapely.geometry import Polygon

from src.gis.floors import (ParteEdificio, asignar_usos, elementos_horizontales,
                            plantas_desde_partes)

PARTE_ALTA = Polygon([(0, 0), (8, 0), (8, 10), (0, 10)])     # 80 m2, 2 plantas
PARTE_BAJA = Polygon([(8, 0), (12, 0), (12, 10), (8, 10)])   # 40 m2, 1 planta


def _modelo(usos=None, plantas_alta=2):
    partes = [ParteEdificio("A", PARTE_ALTA, plantas_alta, 0),
              ParteEdificio("B", PARTE_BAJA, 1, 0)]
    pl = plantas_desde_partes(partes)
    asignar_usos(pl, usos or {})
    return pl


def _buscar(elems, **kw):
    return [e for e in elems
            if all(getattr(e, k) == v for k, v in kw.items())]


def test_las_huellas_de_cada_planta():
    pl = _modelo()
    assert [p.etiqueta for p in pl] == ["PB", "P1"]
    assert pl[0].area_m2 == pytest.approx(120.0)
    assert pl[1].area_m2 == pytest.approx(80.0)


def test_vivienda_encima_de_garaje():
    pl = _modelo({0: {"GARAJE": 120.0}, 1: {"VIVIENDA": 80.0}})
    elems = elementos_horizontales(pl)
    suelo_p1 = _buscar(elems, planta="P1", tipo="PARTICION_HORIZONTAL",
                       subtipo="ESPACIO_NO_HABITABLE_INFERIOR")
    assert len(suelo_p1) == 1
    assert suelo_p1[0].area_m2 == pytest.approx(80.0)
    assert suelo_p1[0].espacio_origen == "VIVIENDA"
    assert suelo_p1[0].espacio_destino == "GARAJE"


def test_vivienda_debajo_de_almacen():
    pl = _modelo({0: {"VIVIENDA": 120.0}, 1: {"ALMACEN": 80.0}})
    techo = _buscar(elementos_horizontales(pl), planta="PB",
                    subtipo="ESPACIO_NO_HABITABLE_SUPERIOR")
    assert len(techo) == 1
    assert techo[0].area_m2 == pytest.approx(80.0)
    assert techo[0].espacio_destino == "ALMACEN"


def test_cubierta_parcial_donde_no_llega_la_planta_de_arriba():
    elems = elementos_horizontales(_modelo())
    cub_pb = _buscar(elems, planta="PB", tipo="CUBIERTA")
    assert len(cub_pb) == 1
    assert cub_pb[0].area_m2 == pytest.approx(40.0)      # justo la parte de 1 planta
    cub_p1 = _buscar(elems, planta="P1", tipo="CUBIERTA")
    assert cub_p1[0].area_m2 == pytest.approx(80.0)


def test_suelo_en_contacto_con_terreno_en_la_planta_mas_baja():
    suelo = _buscar(elementos_horizontales(_modelo()), tipo="SUELO", subtipo="TERRENO")
    assert len(suelo) == 1
    assert suelo[0].planta == "PB"
    assert suelo[0].area_m2 == pytest.approx(120.0)


def test_los_buildingparts_nunca_pueden_producir_un_voladizo():
    """Hallazgo: el modelo de Catastro NO puede representar un vuelo.

    Una parte con `numberOfFloorsAboveGround = 2` esta en el nivel 0 Y en el 1,
    asi que la huella de una planta siempre esta contenida en la de la de abajo.
    Un vuelo sobre la calle solo puede venir del DXF o de una medicion en obra:
    si el CE3X lleva un suelo en contacto con aire, NO ha salido de aqui.
    """
    partes = [ParteEdificio("A", PARTE_ALTA, 1, 0),
              ParteEdificio("B", Polygon([(0, 0), (12, 0), (12, 10), (0, 10)]), 2, 0)]
    pl = plantas_desde_partes(partes)
    assert pl[1].huella.difference(pl[0].huella).area == pytest.approx(0.0, abs=1e-6)
    assert not _buscar(elementos_horizontales(pl), planta="P1", tipo="SUELO",
                       subtipo="AIRE_EXTERIOR")


def test_el_suelo_en_voladizo_se_detecta_si_la_geometria_lo_trae():
    """La rama existe para geometria que SI describa el vuelo (DXF, medicion)."""
    from src.gis.floors import Planta
    pb = Planta(0, PARTE_ALTA, 80.0)
    p1 = Planta(1, Polygon([(0, 0), (12, 0), (12, 10), (0, 10)]), 120.0)
    volado = _buscar(elementos_horizontales([pb, p1]), planta="P1", tipo="SUELO",
                     subtipo="AIRE_EXTERIOR")
    assert len(volado) == 1 and volado[0].area_m2 == pytest.approx(40.0)


def test_sotano_da_suelo_en_terreno_y_no_la_planta_baja():
    partes = [ParteEdificio("A", PARTE_ALTA, 1, 1)]
    pl = plantas_desde_partes(partes)
    assert [p.etiqueta for p in pl] == ["S1", "PB"]
    terreno = _buscar(elementos_horizontales(pl), tipo="SUELO", subtipo="TERRENO")
    assert len(terreno) == 1 and terreno[0].planta == "S1"


def test_una_planta_con_dos_usos_no_se_reparte_y_lo_dice():
    """Catastro dice 'aqui hay 80 de vivienda y 40 de garaje', no QUE poligono es."""
    pl = _modelo({0: {"VIVIENDA": 80.0, "GARAJE": 40.0}})
    pb = pl[0]
    assert pb.uso_dominante == "VIVIENDA"
    assert pb.confianza_uso < 0.5
    assert "no dice que poligono" in pb.nota_uso


def test_sin_uso_declarado_no_se_inventa():
    pb = _modelo()[0]
    assert pb.uso_dominante is None and pb.confianza_uso == 0.0
