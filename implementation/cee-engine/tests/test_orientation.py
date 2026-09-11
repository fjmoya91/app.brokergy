"""Orientacion y normal exterior (§7)."""
import pytest
from shapely.geometry import Polygon

from src.gis.orientation import azimut_desde_normal, orientacion
from src.gis.segments import segmentar

# En EPSG:25830 +x es el Este y +y el Norte.
CUADRADO = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])


@pytest.mark.parametrize("az,esperado", [
    (0, "N"), (22.4, "N"), (22.6, "NE"), (45, "NE"), (90, "E"), (135, "SE"),
    (180, "S"), (225, "SO"), (270, "O"), (315, "NO"), (337.6, "N"), (359.9, "N"),
])
def test_sectores(az, esperado):
    assert orientacion(az) == esperado


def test_normal_hacia_el_sur_da_azimut_180():
    assert azimut_desde_normal(0, -1) == pytest.approx(180.0)


def test_la_fachada_sur_es_la_de_abajo_no_la_de_arriba():
    """El error clasico: confundir la direccion de la linea con la de la fachada."""
    segs = {s.orientation: s for s in segmentar(CUADRADO)}
    assert segs["S"].y1 == 0 and segs["S"].y2 == 0          # borde inferior
    assert segs["N"].y1 == 10 and segs["N"].y2 == 10        # borde superior
    assert segs["E"].x1 == 10 and segs["O"].x1 == 0


def test_el_sondeo_de_la_fachada_sur_cae_fuera_del_edificio():
    sur = next(s for s in segmentar(CUADRADO) if s.orientation == "S")
    p = sur.probe(0.5)
    assert p.y < 0 and not CUADRADO.contains(p)


def test_en_un_patio_la_normal_mira_hacia_el_patio():
    con_patio = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)],
                        [[(4, 4), (6, 4), (6, 6), (4, 6)]])
    interiores = [s for s in segmentar(con_patio) if s.ring == "interior"]
    assert len(interiores) == 4
    for s in interiores:
        p = s.probe(0.3)
        assert not con_patio.contains(p)       # cae en el hueco
        assert 3.9 < p.x < 6.1 and 3.9 < p.y < 6.1
    # el muro del lado OESTE del patio mira al Este
    oeste = next(s for s in interiores if abs(s.x1 - 4) < 1e-6 and abs(s.x2 - 4) < 1e-6)
    assert oeste.orientation == "E"
