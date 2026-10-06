"""Unidades de OTRA parcela y SEMISOTANO declarado.

EL CASO QUE LO JUSTIFICA — 5491808WJ2759S (26RES060_OP265, CL Elena Osorio 11,
Belmonte): el edificio esta en ladera y Catastro dibuja el semisotano (garaje)
como planta SOBRE rasante, con las unidades en la «planta 00»: todo salia una
altura desplazado. Y la propiedad incluye la planta baja de un edificio de la
parcela de al lado, con viviendas de otros propietarios encima.
"""
from shapely.geometry import Polygon

from src import pipeline
from src.gis.floors import (ParteEdificio, elementos_horizontales, niveles_propios,
                            plantas_desde_partes, plantas_sobre)


def rect(x0, y0, ancho, alto):
    return Polygon([(x0, y0), (x0 + ancho, y0),
                    (x0 + ancho, y0 + alto), (x0, y0 + alto)])


def test_un_cero_es_un_cero():
    assert plantas_sobre(ParteEdificio("a", rect(0, 0, 1, 1), 0, 1)) == 0
    assert plantas_sobre(ParteEdificio("a", rect(0, 0, 1, 1), None, 0)) == 1


def test_una_parte_anexa_solo_es_propia_hasta_su_planta():
    anexa = ParteEdificio("b", rect(0, 0, 5, 5), 3, 0, hasta_nivel=0)
    assert niveles_propios(anexa) == [0]
    assert niveles_propios(ParteEdificio("c", rect(0, 0, 5, 5), 3, 0)) == [0, 1, 2]


def _casa_y_anexo():
    casa = ParteEdificio("casa", rect(0, 0, 10, 10), 2, 0)
    # el bloque de al lado: tres plantas, de la vivienda solo la baja
    anexo = ParteEdificio("anexo", rect(10, 0, 5, 10), 3, 0, hasta_nivel=0)
    return plantas_desde_partes([casa, anexo])


def test_la_planta_baja_suma_lo_anexo_y_las_de_arriba_no():
    plantas = {p.nivel: p for p in _casa_y_anexo()}
    assert round(plantas[0].huella.area) == 150
    assert round(plantas[1].huella.area) == 100
    assert 2 not in plantas                     # la 2 del anexo es de otro
    assert plantas[0].ajeno_encima is not None
    assert round(plantas[0].ajeno_encima.area) == 50


def test_sobre_lo_anexo_no_hay_cubierta_sino_vecino():
    elems = elementos_horizontales(_casa_y_anexo())
    cub0 = sum(e.area_m2 for e in elems if e.tipo == "CUBIERTA" and e.nivel == 0)
    cub1 = sum(e.area_m2 for e in elems if e.tipo == "CUBIERTA" and e.nivel == 1)
    assert cub0 == 0                            # encima del anexo vive otro: adiabatico
    assert round(cub1) == 100


class _Diag:
    def __init__(self):
        self.items = []

    def add(self, codigo, msg, **kw):
        self.items.append(codigo)


class _Modelo:
    def __init__(self, partes):
        self.partes = partes
        self.catastro = {}
        self.diagnostics = _Diag()
        self.floors = []


def test_el_semisotano_baja_las_plantas_y_es_garaje():
    m = _Modelo([ParteEdificio("casa", rect(0, 0, 10, 10), 3, 0)])
    pipeline.aplicar_semisotano(m, 1)
    niveles = {p.nivel: p for p in m.floors}
    assert sorted(niveles) == [-1, 0, 1]
    assert niveles[-1].uso_dominante == "GARAJE"
    assert "SEMISOTANO" in m.diagnostics.items


def test_sin_semisotano_no_se_toca_nada():
    m = _Modelo([ParteEdificio("casa", rect(0, 0, 10, 10), 3, 0)])
    assert pipeline.aplicar_semisotano(m, 0) == []
    assert m.partes[0].plantas_sobre_rasante == 3
    assert not m.catastro
