"""Medianeras, tramos parcialmente compartidos y patios (§8, §9, §21)."""
import pytest
from shapely.geometry import Polygon

from src.gis.adjacency import (Contacto, Vecindad, clasificar,
                               fusionar_colineales, intervalos_contacto)
from src.gis.segments import segmentar

CASA = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])


def _clasificar(casa, vecinos, parcela=None, **kw):
    v = Vecindad(parcela=parcela if parcela is not None else casa,
                 edificio_propio=casa, edificios_vecinos=vecinos, **kw)
    return clasificar(segmentar(casa), v)


def _por_contacto(tramos):
    out: dict = {}
    for t in tramos:
        out.setdefault(t.contacto, 0.0)
        out[t.contacto] += t.segment.length_m
    return {k: round(v, 3) for k, v in out.items()}


def test_el_caso_del_enunciado_medianera_6_fachada_4():
    """vivienda 10x10 con el vecino pegado en 6 m -> 6 m medianera + 4 m fachada."""
    vecino = Polygon([(10, 0), (16, 0), (16, 6), (10, 6)])
    tramos = _clasificar(CASA, vecino)
    este = [t for t in tramos if t.segment.orientation == "E"]
    medianera = [t for t in este if t.contacto == Contacto.OTHER_BUILDING]
    fachada = [t for t in este if t.contacto != Contacto.OTHER_BUILDING]
    assert len(medianera) == 1 and medianera[0].segment.length_m == pytest.approx(6.0)
    assert len(fachada) == 1 and fachada[0].segment.length_m == pytest.approx(4.0)


def test_la_tolerancia_detecta_pero_no_mide():
    """El vecino separado 8 cm sigue siendo medianera, y sigue midiendo 6,00 m.

    Midiendo sobre el vecino dilatado salian 6,15 m: la tolerancia se colaba en
    la medida y de ahi pasa a la superficie del muro del certificado.
    """
    vecino = Polygon([(10.08, 0), (16, 0), (16, 6), (10.08, 6)])
    tramos = _clasificar(CASA, vecino, boundary_tolerance_m=0.15)
    m = [t for t in tramos if t.contacto == Contacto.OTHER_BUILDING]
    assert len(m) == 1 and m[0].segment.length_m == pytest.approx(6.0, abs=0.01)


def test_un_vecino_mas_lejos_que_la_tolerancia_no_es_medianera():
    vecino = Polygon([(10.5, 0), (16, 0), (16, 6), (10.5, 6)])
    tramos = _clasificar(CASA, vecino, boundary_tolerance_m=0.15)
    assert Contacto.OTHER_BUILDING not in _por_contacto(tramos)


def test_pared_entera_compartida():
    vecino = Polygon([(10, 0), (16, 0), (16, 10), (10, 10)])
    tramos = _clasificar(CASA, vecino)
    este = [t for t in tramos if t.segment.orientation == "E"]
    assert len(este) == 1
    assert este[0].contacto == Contacto.OTHER_BUILDING
    assert este[0].segment.length_m == pytest.approx(10.0)


def test_dos_vecinos_en_la_misma_pared_dejan_un_hueco_de_fachada():
    from shapely.ops import unary_union
    vecinos = unary_union([Polygon([(10, 0), (14, 0), (14, 3), (10, 3)]),
                           Polygon([(10, 7), (14, 7), (14, 10), (10, 10)])])
    tramos = _clasificar(CASA, vecinos)
    este = sorted([t for t in tramos if t.segment.orientation == "E"],
                  key=lambda t: min(t.segment.y1, t.segment.y2))
    assert [round(t.segment.length_m, 2) for t in este] == [3.0, 4.0, 3.0]
    assert [t.contacto for t in este] == [Contacto.OTHER_BUILDING,
                                          Contacto.EXTERIOR_CALLE,
                                          Contacto.OTHER_BUILDING]


def test_un_toque_en_esquina_no_es_medianera():
    vecino = Polygon([(10, 10), (16, 10), (16, 16), (10, 16)])
    tramos = _clasificar(CASA, vecino)
    assert Contacto.OTHER_BUILDING not in _por_contacto(tramos)


def test_contacto_por_debajo_del_minimo_se_descarta():
    vecino = Polygon([(10, 0), (16, 0), (16, 0.2), (10, 0.2)])
    tramos = _clasificar(CASA, vecino, min_contact_m=0.30)
    assert Contacto.OTHER_BUILDING not in _por_contacto(tramos)


def test_patio_interior_es_fachada_a_patio_no_medianera():
    con_patio = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)],
                        [[(4, 4), (6, 4), (6, 6), (4, 6)]])
    tramos = _clasificar(con_patio, None)
    patio = [t for t in tramos if t.contacto == Contacto.PATIO_EDIFICIO]
    assert len(patio) == 4
    assert sum(t.segment.length_m for t in patio) == pytest.approx(8.0)


def test_un_retranqueo_no_es_un_patio():
    """Un jardin delantero de 1 m es fachada exterior, no un patio cerrado."""
    casa = Polygon([(1, 1), (11, 1), (11, 11), (1, 11)])
    parcela = Polygon([(0, 0), (12, 0), (12, 12), (0, 12)])
    tramos = _clasificar(casa, None, parcela=parcela)
    assert all(t.contacto == Contacto.EXTERIOR_RETRANQUEO for t in tramos)


def test_un_patio_de_parcela_cerrado_si_es_patio():
    """Edificio en U: el hueco esta rodeado de edificacion en un 60% o mas."""
    casa = Polygon([(0, 0), (12, 0), (12, 12), (0, 12), (0, 9),
                    (9, 9), (9, 3), (0, 3)])
    parcela = Polygon([(0, 0), (12, 0), (12, 12), (0, 12)])
    tramos = _clasificar(casa, None, parcela=parcela)
    patio = [t for t in tramos if t.contacto == Contacto.PATIO_PARCELA]
    assert patio, "el hueco en U tenia que salir como patio de parcela"


def test_intervalos_vacios_si_no_hay_obstaculo():
    seg = segmentar(CASA)[0]
    assert intervalos_contacto(seg, None, 0.15, 0.3) == []


def test_se_fusionan_colineales_del_mismo_tipo_pero_no_de_distinto():
    from shapely.ops import unary_union
    u = unary_union([Polygon([(0, 0), (8, 0), (8, 10), (0, 10)]),
                     Polygon([(8, 0), (12, 0), (12, 10), (8, 10)])])
    v = Vecindad(parcela=u, edificio_propio=u, edificios_vecinos=None)
    fus = fusionar_colineales(clasificar(segmentar(u), v))
    assert sorted(round(t.segment.length_m, 2) for t in fus) == [10.0, 10.0, 12.0, 12.0]

    # con medio muro compartido, el vertice que separa los dos tipos se respeta
    vecino = Polygon([(12, 0), (18, 0), (18, 6), (12, 6)])
    v2 = Vecindad(parcela=u, edificio_propio=u, edificios_vecinos=vecino)
    fus2 = fusionar_colineales(clasificar(segmentar(u), v2))
    este = [t for t in fus2 if t.segment.orientation == "E"]
    assert sorted(round(t.segment.length_m, 2) for t in este) == [4.0, 6.0]
