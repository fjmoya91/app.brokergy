"""El croquis a mano alzada, ajustado a los m2 de Catastro (ver `gis/croquis.py`).

EL CASO — 26RES060_OP246: planta baja de 14 x 14 m (196 m2) con, segun Catastro,
VIVIENDA 39, APARCAMIENTO 122 y PORCHE 36. El usuario dibuja a mano alzada una
linea «el garaje es por el norte» (unos 5 m de fondo: 70 m2) y el porche atras;
lo que tiene que salir es un garaje de 122 que ENVUELVE el porche y una vivienda
de 39 en la franja sur. Es lo que se hizo a mano la primera vez.
"""
import math

from shapely.geometry import Polygon, box

from src.gis import croquis as cq

CASA = box(0, 0, 14, 14)
OBJ = {"GARAJE": 122.0 * 196 / 197, "PORCHE": 36.0 * 196 / 197}

#: Lo que dibuja una persona: una linea torcida a unos 5 m del norte, y por
#: fuera de las paredes (se puede pasar).
GARAJE_A_MANO = Polygon([(-1, 15), (15, 15), (15, 9.3), (10, 8.8), (5, 9.2), (-1, 8.7)])
#: El porche, una mancha atras (oeste) en medio.
PORCHE_A_MANO = Polygon([(-1, 3.2), (4.8, 3.0), (5.1, 8.4), (-1, 8.6)])


def _trazos():
    return [{"indice": 0, "uso": "GARAJE", "poligono": GARAJE_A_MANO},
            {"indice": 1, "uso": "PORCHE", "poligono": PORCHE_A_MANO}]


def test_las_superficies_son_las_de_catastro_y_el_garaje_envuelve_al_porche():
    zonas, avisos = cq.ajustar_nivel(CASA, _trazos(), OBJ)
    por = {z["uso"]: z for z in zonas}
    assert abs(por["GARAJE"]["area_m2"] - OBJ["GARAJE"]) < 1.0, avisos
    assert abs(por["PORCHE"]["area_m2"] - OBJ["PORCHE"]) < 1.0, avisos
    # No se pisan, y lo que queda es la vivienda (~39).
    assert por["GARAJE"]["poligono"].intersection(por["PORCHE"]["poligono"]).area < 0.1
    resto = CASA.area - por["GARAJE"]["area_m2"] - por["PORCHE"]["area_m2"]
    assert abs(resto - 39 * 196 / 197) < 1.5
    # El garaje crecio hacia el sur mucho mas alla de la linea dibujada: en L.
    assert por["GARAJE"]["poligono"].bounds[1] < 8.0


def test_lo_dibujado_fuera_de_las_paredes_no_cuenta():
    zonas, _ = cq.ajustar_nivel(CASA, _trazos(), OBJ)
    for z in zonas:
        assert CASA.buffer(0.01).contains(z["poligono"])


def test_sin_area_de_catastro_se_usa_el_dibujo_y_se_dice():
    zonas, avisos = cq.ajustar_nivel(
        CASA, [{"indice": 0, "uso": "ALMACEN", "poligono": box(0, 0, 3, 3)}], OBJ)
    assert abs(zonas[0]["area_m2"] - 9.0) < 0.3
    assert zonas[0]["de"] == "dibujado tal cual"
    assert any("no declara" in a for a in avisos)


def test_tal_cual_no_ajusta():
    zonas, _ = cq.ajustar_nivel(CASA, _trazos(), OBJ, ajustar_area=False)
    g = [z for z in zonas if z["uso"] == "GARAJE"][0]
    assert 60 < g["area_m2"] < 80                      # lo dibujado, ~70 m2


def test_enderezar_pone_los_bordes_paralelos_a_las_paredes():
    torcido = Polygon([(0, 0), (10, 0.6), (10.4, 5), (0.3, 4.6)])
    r = cq.regularizar(torcido, cq.direcciones_de(CASA))
    cs = list(r.exterior.coords)
    for (x0, y0), (x1, y1) in zip(cs, cs[1:]):
        ang = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 90
        assert min(ang, 90 - ang) < 0.5


def test_el_croquis_en_fracciones_de_la_huella():
    """Lo que escribe la skill: «el garaje es la mitad norte» sin coordenadas."""
    a_xy = cq.marco(CASA)
    x, y = a_xy(0, 0)
    assert abs(x) < 0.01 and abs(y) < 0.01            # suroeste
    x, y = a_xy(1, 1)
    assert abs(x - 14) < 0.01 and abs(y - 14) < 0.01  # noreste
    x, y = a_xy(0.5, 1)
    assert abs(x - 7) < 0.01 and abs(y - 14) < 0.01   # centro del lado norte


def test_la_vivienda_queda_sin_escalones():
    """El garaje y el porche crecen cada uno por su cuenta y dejaban la vivienda
    con un escalon de 37 cm: un trozo de muro que no existe. Se alinean."""
    from shapely.ops import unary_union
    zonas, _ = cq.ajustar_nivel(CASA, _trazos(), OBJ)
    viv = CASA.difference(unary_union([z["poligono"] for z in zonas]))
    # Las juntas entre zonas dejan astillas de coma flotante (el motor las
    # limpia al restar con `_abrir`): la vivienda es la pieza grande.
    piezas = sorted(getattr(viv, "geoms", [viv]), key=lambda g: g.area, reverse=True)
    assert sum(g.area for g in piezas[1:]) < 0.05
    assert len(piezas[0].simplify(0.02).exterior.coords) == 5   # rectangulo: 4 esquinas + cierre
    for z in zonas:                                # y las superficies siguen siendo las de Catastro
        assert abs(z["area_m2"] - OBJ[z["uso"]]) < 0.5
