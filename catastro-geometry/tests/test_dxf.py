"""Lectura del DXF de la parcela: es la unica via al uso por poligono (§6)."""
import pytest

from src.catastro.fxcc import (asignar_usos_por_superficie, leer_dxf,
                               numero_plantas, subparcelas)


def _dxf(tmp_path, entidades):
    lineas = ["0", "SECTION", "2", "ENTITIES"] + entidades + ["0", "ENDSEC", "0", "EOF"]
    p = tmp_path / "parcela.dxf"
    p.write_text("\n".join(lineas))
    return p


def _poly(capa, pts):
    out = ["0", "LWPOLYLINE", "8", capa, "90", str(len(pts)), "70", "1"]
    for x, y in pts:
        out += ["10", str(x), "20", str(y)]
    return out


def _txt(capa, t, x, y):
    return ["0", "TEXT", "8", capa, "10", str(x), "20", str(y), "1", t]


@pytest.mark.parametrize("rotulo,plantas", [
    ("I", 1), ("II", 2), ("III", 3), ("IV", 4), ("V", 5), ("IX", 9),
    ("-I", -1), ("III+TZA", 3), ("I+P", 1), ("", None), ("AB", None),
])
def test_rotulo_de_plantas_en_romanos(rotulo, plantas):
    assert numero_plantas(rotulo) == plantas


def test_se_leen_las_subparcelas_y_su_rotulo(tmp_path):
    p = _dxf(tmp_path,
             _poly("CONSTRU", [(0, 0), (8, 0), (8, 10), (0, 10)])
             + _txt("ROTULOS", "II", 4, 5)
             + _poly("CONSTRU", [(8, 0), (12, 0), (12, 10), (8, 10)])
             + _txt("ROTULOS", "I", 10, 5))
    subs = subparcelas(leer_dxf(p))
    assert len(subs) == 2
    assert {s.plantas for s in subs} == {1, 2}
    assert sum(s.area_m2 for s in subs) == pytest.approx(120.0)


def test_el_uso_se_asigna_solo_si_la_superficie_cuadra_sin_ambiguedad(tmp_path):
    p = _dxf(tmp_path,
             _poly("CONSTRU", [(0, 0), (8, 0), (8, 10), (0, 10)])
             + _txt("ROTULOS", "II", 4, 5)
             + _poly("CONSTRU", [(8, 0), (12, 0), (12, 10), (8, 10)])
             + _txt("ROTULOS", "I", 10, 5))
    subs = subparcelas(leer_dxf(p))
    asignar_usos_por_superficie(subs, {"VIVIENDA": 160.0, "GARAJE": 40.0})
    por_area = {s.area_m2: s.uso for s in subs}
    assert por_area[80.0] == "VIVIENDA"      # 80 m2 x 2 plantas = 160
    assert por_area[40.0] == "GARAJE"


def test_con_dos_usos_de_la_misma_superficie_no_se_adivina(tmp_path):
    """Adivinar cual es el garaje es como acabar pidiendole al cliente la foto
    de una maquina que no tiene: mejor dejarlo sin asignar."""
    p = _dxf(tmp_path, _poly("CONSTRU", [(0, 0), (8, 0), (8, 5), (0, 5)])
             + _txt("ROTULOS", "I", 4, 2))
    subs = subparcelas(leer_dxf(p))
    asignar_usos_por_superficie(subs, {"VIVIENDA": 40.0, "ALMACEN": 41.0})
    assert subs[0].uso is None and subs[0].confianza_uso == 0.0


def test_las_capas_que_no_son_de_construccion_se_ignoran(tmp_path):
    p = _dxf(tmp_path, _poly("MASA", [(0, 0), (20, 0), (20, 20), (0, 20)])
             + _poly("CONSTRU", [(1, 1), (5, 1), (5, 5), (1, 5)]))
    assert len(subparcelas(leer_dxf(p))) == 1
