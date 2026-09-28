"""Un almacen que Catastro no separa, y un garaje DENTRO de la casa.

EL CASO — 8919709VJ8681N (26RES080_85, CL Sol 20, Campo de Criptana). La
parcela tiene tres BuildingParts: la casa de DOS plantas (117 m2) y dos
almacenes de UNA al fondo (47 y 28 m2). Catastro declara en la baja VIVIENDA
119 y ALMACEN 106, y en la primera VIVIENDA 117. Y en la planta baja de la casa
hay un GARAJE con la vivienda encima, que Catastro no dibuja.

Lo que paso: el certificador estuvo una hora sin poder separarlo. Los almacenes
no salian propuestos (ninguno se parece a 106 por separado), una pared dibujada
no quita superficie, y delimitar la vivienda recortaba tambien la primera
planta. Acabo haciendo el CEE a mano: planta primera = la casa entera (117 m2),
planta baja = la casa menos el garaje, con una particion de 5,20 m.
"""
from shapely.geometry import Polygon

from src import pipeline
from src.gis import cuerpos as cu
from src.gis.floors import ParteEdificio, _abrir, plantas_desde_partes
from src.model import Modelo

# La geometria REAL de Catastro (EPSG:25830), tal cual la devuelve el WFS.
CASA = ParteEdificio("part3", Polygon([
    (488788.47, 4361692.92), (488788.68, 4361692.75), (488789.98, 4361691.74),
    (488793.08, 4361689.33), (488796.93, 4361686.32), (488785.93, 4361678.71),
    (488780.62, 4361680.70), (488784.13, 4361683.39), (488781.57, 4361687.01),
    (488784.56, 4361689.31), (488788.29, 4361692.75)]), 2, 0)
ALMACEN_1 = ParteEdificio("part1", Polygon([
    (488788.47, 4361692.92), (488788.29, 4361692.75), (488784.56, 4361689.31),
    (488782.22, 4361692.04), (488781.93, 4361692.38), (488781.38, 4361692.75),
    (488777.48, 4361695.39), (488778.48, 4361696.87), (488780.17, 4361699.38),
    (488784.69, 4361695.86)]), 1, 0)
ALMACEN_2 = ParteEdificio("part2", Polygon([
    (488775.27, 4361682.59), (488771.23, 4361683.73), (488770.72, 4361683.87),
    (488774.40, 4361690.16), (488777.57, 4361687.88)]), 1, 0)

#: El garaje, dibujado como lo dibujaria el certificador: la esquina sur de la
#: casa y un punto de la fachada que cae 3 mm fuera de ella (un clic nunca cae
#: exacto). Es la forma de su particion de 5,20 m.
GARAJE = [[488785.93, 4361678.71], [488780.62, 4361680.70],
          [488784.13, 4361683.39], [488788.31, 4361680.36]]


def _space(codigo, uso, area, planta, habitable):
    class S:
        pass
    s = S()
    s.area, s.use, s.floor = area, uso, planta
    s.attrs = {"codigo": codigo, "uso_literal": uso, "habitable": habitable}
    return s


def _lcons(vivienda_pb=119.0, almacen=106.0):
    return [_space("01/00/01", "VIVIENDA", vivienda_pb, 0, True),
            _space("01/01/01", "VIVIENDA", 117.0, 1, True),
            _space("01/00/02", "ALMACEN", almacen, 0, False)]


def _modelo(partes=(CASA, ALMACEN_1, ALMACEN_2), spaces=None):
    m = Modelo(refcat_parcela="8919709VJ8681N", refcat_inmueble=None, crs="EPSG:25830")
    m.partes = list(partes)
    m.spaces = spaces if spaces is not None else _lcons()
    return m


def _inv(**kw):
    return {c["id"]: c for c in cu.inventario(_modelo(**kw))}


# ------------------------------------------------ los almacenes, por eliminacion
def test_los_dos_almacenes_salen_como_almacen_aunque_ninguno_mida_106():
    """La casa ya cubre la vivienda de la baja (117 ~ 119), asi que lo que
    queda de UNA planta es lo que Catastro declara aparte: ALMACEN."""
    inv = _inv()
    for pid in ("part1", "part2"):
        c = inv[pid]
        assert c["construccion"]["uso"] == "ALMACEN"
        assert c["construccion"]["por_eliminacion"] is True
        assert c["habitable"] is False
        assert c["niveles_fuera"] == [0]
    assert inv["part3"]["construccion"]["uso"] == "VIVIENDA"
    assert inv["part3"]["habitable"] is True


def test_si_falta_vivienda_no_se_afirma_nada():
    """Con 200 m2 de vivienda declarados en la baja, la casa (117) no la cubre:
    uno de los anexos podria ser vivienda, y no se sabe cual."""
    inv = _inv(spaces=_lcons(vivienda_pb=200.0))
    assert inv["part1"]["construccion"] is None
    assert inv["part2"]["construccion"] is None


def test_si_sobra_construido_no_se_afirma_nada():
    """Si lo que queda sin casar pasa de lo que Catastro declara como almacen,
    parte de ello es otra cosa: no se reparte."""
    inv = _inv(spaces=_lcons(almacen=40.0))
    assert inv["part1"]["construccion"] is None
    assert inv["part2"]["construccion"] is None


def test_un_cuerpo_de_dos_plantas_sin_casar_no_se_da_por_almacen():
    """Arriba podria ser la casa: con varios niveles es ambiguo."""
    alto = ParteEdificio("part1", ALMACEN_1.geometry, 2, 0)
    inv = _inv(partes=(CASA, alto, ALMACEN_2))
    assert inv["part1"]["construccion"] is None
    assert inv["part2"]["construccion"]["por_eliminacion"] is True


def test_si_la_oportunidad_cuenta_el_almacen_no_se_propone_quitarlo():
    """Si una persona marco el almacen como vivienda, en esa planta no queda
    nada no habitable que atribuir."""
    spaces = _lcons()
    spaces[2].attrs["habitable"] = True
    inv = _inv(spaces=spaces)
    assert inv["part1"]["habitable"] is not False
    assert inv["part2"]["habitable"] is not False


# ------------------------------------------------------ el garaje, por planta
def _plantas_con(zonas, cuerpos_fuera=("part1", "part2")):
    m = _modelo()
    inv = cu.inventario(m)
    z = pipeline.leer_zonas(m, zonas)
    pipeline.excluir_cuerpos(m, list(cuerpos_fuera), inventario=inv, zonas=z)
    return m, {p.nivel: p for p in m.floors}, z


def test_el_garaje_se_resta_solo_de_la_planta_baja():
    m, pl, z = _plantas_con([{"nivel": 0, "uso": "GARAJE", "poligono": GARAJE}])
    assert len(z) == 1 and z[0]["uso"] == "GARAJE"
    assert abs(z[0]["area_m2"] - 17.69) < 0.05
    # La baja pierde el garaje; la primera sigue siendo la casa entera.
    assert abs(pl[0].area_m2 - (117.02 - 17.69)) < 0.1
    assert abs(pl[1].area_m2 - 117.02) < 0.05
    # Y el garaje sigue construido: de ahi sale la particion y el forjado.
    assert [p["uso"] for p in pl[0].no_habitable_partes].count("GARAJE") == 1


def test_el_garaje_no_deja_agujas():
    """El punto de la fachada cae 3 mm fuera: sin la apertura quedaba una aguja
    de 2,9 m que salia como dos paredes fantasma."""
    _, pl, _ = _plantas_con([{"nivel": 0, "uso": "GARAJE", "poligono": GARAJE}])
    h = pl[0].huella
    assert h.geom_type == "Polygon"
    coords = list(h.exterior.coords)
    # La esquina sur de la casa (la del garaje) ya no es un vertice de la huella.
    assert not any(abs(x - 488785.93) < 0.05 and abs(y - 4361678.71) < 0.05
                   for x, y in coords)
    # Y ningun lado es mas fino que la aguja: el mas corto es la pared de 0,25.
    lados = [((coords[i + 1][0] - coords[i][0]) ** 2
              + (coords[i + 1][1] - coords[i][1]) ** 2) ** 0.5
             for i in range(len(coords) - 1)]
    assert min(lados) > 0.2


def test_una_zona_que_no_toca_la_casa_no_hace_nada_y_se_dice():
    fuera = [[488700, 4361600], [488705, 4361600], [488705, 4361605]]
    m, pl, z = _plantas_con([{"nivel": 0, "poligono": fuera}])
    assert z == []
    assert any("no toca" in msg for msg in m.diagnostics.messages)


def test_una_zona_de_un_nivel_que_no_existe_se_salta():
    m, _, z = _plantas_con([{"nivel": 3, "poligono": GARAJE}])
    assert z == []
    assert any("no existe" in msg for msg in m.diagnostics.messages)


def test_una_zona_que_cubre_la_planta_entera_no_se_aplica():
    """No quedaria vivienda en esa planta: es un error, no un garaje."""
    todo = list(CASA.geometry.buffer(1).exterior.coords)
    m, pl, z = _plantas_con([{"nivel": 1, "poligono": todo}])
    assert z == []
    assert abs(pl[1].area_m2 - 117.02) < 0.05


def test_una_zona_ilegible_no_tumba_la_medicion():
    m, pl, z = _plantas_con([{"nivel": "x", "poligono": "basura"}, None,
                             {"nivel": 0, "poligono": [[1, 2]]}])
    assert z == []
    assert 0 in pl


def test_un_uso_desconocido_cae_en_espacio_no_habitable():
    _, _, z = _plantas_con([{"nivel": 0, "uso": "trastero", "poligono": GARAJE}])
    assert z[0]["uso"] == "ESPACIO NO HABITABLE"


def test_sin_zonas_la_apertura_no_se_aplica_a_la_huella_de_catastro():
    """Los cuerpos enteros comparten las coordenadas exactas de Catastro: no se
    les toca ni un milimetro."""
    a = plantas_desde_partes([CASA, ALMACEN_1, ALMACEN_2])
    b = plantas_desde_partes([CASA, ALMACEN_1, ALMACEN_2],
                             fuera_por_nivel={0: [{"geom": ALMACEN_2.geometry}]})
    assert abs(a[0].huella.area - b[0].huella.area - ALMACEN_2.geometry.area) < 1e-6


def test_la_apertura_no_se_come_vivienda():
    """Si encoger y crecer quitara algo mas que una aguja, se deja como estaba."""
    fino = Polygon([(0, 0), (10, 0), (10, 0.03), (0, 0.03)])     # 3 cm de ancho
    grande = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    assert _abrir(grande).area == grande.area
    # Una pieza entera de 3 cm no es una aguja pegada a nada: se conserva.
    assert _abrir(fino) is not None
