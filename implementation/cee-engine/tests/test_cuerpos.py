"""Los CUERPOS del edificio (§ cuerpos.py): casar con `lcons` y quitar uno.

Lo que se prueba aqui es lo DETERMINISTA: que un aparcamiento se reconoce por su
superficie, que no se casa lo que no se parece, y que cada pared sabe de que
cuerpo es. De esa decision cuelga que las paredes del garaje entren o no en la
envolvente de un certificado.
"""
from dataclasses import dataclass, field

import pytest
from shapely.geometry import Polygon

from src.gis import cuerpos as cu


@dataclass
class ParteFalsa:
    original_id: str
    geometry: object
    plantas_sobre_rasante: int | None = 1
    plantas_bajo_rasante: int | None = 0
    attrs: dict = field(default_factory=dict)


@dataclass
class SpaceFalso:
    area: float
    use: str
    floor: int
    attrs: dict


@dataclass
class ModeloFalso:
    partes: list
    spaces: list


def rect(x0, y0, ancho, alto):
    return Polygon([(x0, y0), (x0 + ancho, y0), (x0 + ancho, y0 + alto), (x0, y0 + alto)])


def lcons(codigo, uso, area, planta=0, habitable=True):
    return SpaceFalso(area=area, use=uso, floor=planta,
                      attrs={"codigo": codigo, "uso_literal": uso,
                             "habitable": habitable, "habitable_catastro": habitable})


CASA = ParteFalsa("p_casa", rect(0, 0, 10, 10))            # 100 m2
GARAJE = ParteFalsa("p_garaje", rect(20, 0, 5, 6))         # 30 m2, separado


def test_el_aparcamiento_se_reconoce_por_su_superficie():
    m = ModeloFalso([CASA, GARAJE],
                    [lcons("1/00/01", "VIVIENDA", 103.0),
                     lcons("1/00/02", "APARCAMIENTO", 30.0, habitable=False)])
    inv = {c["id"]: c for c in cu.inventario(m)}
    assert inv["p_garaje"]["construccion"]["uso"] == "APARCAMIENTO"
    # Es lo unico que decide: que Catastro diga que ahi no se vive.
    assert inv["p_garaje"]["habitable"] is False
    assert inv["p_casa"]["habitable"] is True


def test_lo_que_no_se_parece_NO_se_casa():
    """Antes que afirmar de que es un cuerpo, se dice que no se sabe: de esto
    sale una propuesta de quitarlo de la envolvente."""
    m = ModeloFalso([GARAJE], [lcons("1/00/01", "VIVIENDA", 103.0)])
    c = cu.inventario(m)[0]
    assert c["construccion"] is None
    # `None` es "no consta", que NO es lo mismo que "no es vivienda".
    assert c["habitable"] is None


def test_dos_cuerpos_no_pueden_ser_la_misma_construccion():
    gemelo = ParteFalsa("p_gemelo", rect(40, 0, 5, 6))     # otros 30 m2
    m = ModeloFalso([GARAJE, gemelo],
                    [lcons("1/00/02", "APARCAMIENTO", 30.0, habitable=False)])
    casadas = [c for c in cu.inventario(m) if c["construccion"]]
    assert len(casadas) == 1


def test_una_construccion_de_otra_planta_no_describe_este_cuerpo():
    """La vivienda de la primera no explica el garaje de la baja aunque midan
    lo mismo."""
    m = ModeloFalso([GARAJE], [lcons("1/01/01", "VIVIENDA", 30.0, planta=1)])
    assert cu.inventario(m)[0]["construccion"] is None


def test_un_cuerpo_de_dos_plantas_esta_en_los_dos_niveles():
    alta = ParteFalsa("p_alta", rect(0, 0, 4, 4), plantas_sobre_rasante=2)
    assert cu.niveles_de(alta) == [0, 1]


def test_cada_pared_sabe_de_que_cuerpo_es():
    m = ModeloFalso([CASA, GARAJE], [])
    elementos = [
        # Una pared del borde sur de la casa.
        {"id": "FBS1", "geometria_wkt": "LINESTRING (0 0, 10 0)"},
        # Una del borde oeste del garaje.
        {"id": "FBO9", "geometria_wkt": "LINESTRING (20 0, 20 6)"},
        # Un suelo: no es de ningun borde, asi que se queda sin cuerpo en vez de
        # colgarse del primero que pase.
        {"id": "SUB1", "geometria_wkt": "LINESTRING (4 4, 6 4)"},
    ]
    de = cu.de_cada_muro(elementos, m.partes)
    assert de["FBS1"] == "p_casa"
    assert de["FBO9"] == "p_garaje"
    assert "SUB1" not in de


def test_quitar_un_cuerpo_lo_saca_del_edificio_y_lo_dice():
    """No es solo dejar de dibujarlo: el edificio se vuelve a medir sin el."""
    from src import pipeline
    from src.model import Modelo, Objeto

    modelo = Modelo(refcat_parcela="X", refcat_inmueble=None, crs="EPSG:25830")
    modelo.partes = [CASA, GARAJE]
    modelo.buildings = [Objeto(source="T", original_id=None,
                               geometry=CASA.geometry.union(GARAJE.geometry),
                               area=130.0, use=None, floor=None, confidence=1.0)]

    dichos = pipeline.excluir_cuerpos(modelo, ["p_garaje"])
    assert dichos and "p_garaje" in dichos[0]
    assert [p.original_id for p in modelo.partes] == ["p_casa"]
    # La huella GLOBAL tambien se recorta: con ella sin tocar, la pared que daba
    # al garaje saldria clasificada contra "edificio propio al otro lado".
    assert modelo.buildings[0].geometry.area == pytest.approx(100.0)
    assert [(p.nivel, round(p.area_m2)) for p in modelo.floors] == [(0, 100)]
    assert any("CUERPOS_EXCLUIDOS" in d for d in modelo.diagnostics.messages)


def test_un_id_que_ya_no_existe_se_dice_en_vez_de_medir_de_mas():
    from src import pipeline
    from src.model import Modelo

    modelo = Modelo(refcat_parcela="X", refcat_inmueble=None, crs="EPSG:25830")
    modelo.partes = [CASA]
    assert pipeline.excluir_cuerpos(modelo, ["p_de_otra_parcela"]) == []
    assert [p.original_id for p in modelo.partes] == ["p_casa"]
    assert any("CUERPOS_EXCLUIDOS" in d for d in modelo.diagnostics.messages)


def test_sin_nada_que_excluir_no_se_toca_nada():
    from src import pipeline
    from src.model import Modelo

    modelo = Modelo(refcat_parcela="X", refcat_inmueble=None, crs="EPSG:25830")
    modelo.partes = [CASA, GARAJE]
    assert pipeline.excluir_cuerpos(modelo, None) == []
    assert len(modelo.partes) == 2
    assert not modelo.diagnostics.messages
