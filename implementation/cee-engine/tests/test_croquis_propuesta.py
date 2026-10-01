"""La PROPUESTA de croquis (ver `gis/croquis_propuesta.py`).

EL CASO — una planta baja de 14 x 14 m con, segun Catastro, un garaje de 122 m2 y
un porche de 36 mezclados con la vivienda en el mismo cuerpo (es la forma de
26RES060_OP246). La fachada norte da a la CALLE (partida en dos tramos, como la
trocea Catastro), la oeste a un PATIO y las otras dos son medianeras. Lo que se
espera: el garaje contra la calle, el porche contra el patio, y los m2 de
Catastro una vez ajustado.
"""
from shapely.geometry import LineString, box

from src.gis import croquis as cq
from src.gis import croquis_propuesta as cp

CASA = box(0, 0, 14, 14)
OBJ = {"GARAJE": 122.0 * 196 / 197, "PORCHE": 36.0 * 196 / 197}

PAREDES = [
    {"id": "FBN1", "tipo": "FACHADA", "subtipo": "CALLE", "orientacion": "N",
     "linea": LineString([(0, 14), (5, 14)])},
    {"id": "FBN2", "tipo": "FACHADA", "subtipo": "CALLE", "orientacion": "N",
     "linea": LineString([(5, 14), (14, 14)])},
    {"id": "FBO1", "tipo": "FACHADA", "subtipo": "PATIO", "orientacion": "O",
     "linea": LineString([(0, 0), (0, 14)])},
    {"id": "MBS1", "tipo": "MEDIANERA", "subtipo": "", "orientacion": "S",
     "linea": LineString([(0, 0), (14, 0)])},
    {"id": "MBE1", "tipo": "MEDIANERA", "subtipo": "", "orientacion": "E",
     "linea": LineString([(14, 0), (14, 14)])},
    # Un trozo de centimetros que deja Catastro: no ancla nada.
    {"id": "FBE9", "tipo": "FACHADA", "subtipo": "CALLE", "orientacion": "E",
     "linea": LineString([(14, 13.9), (14, 14)])},
]


def _por_uso(semillas):
    return {s["uso"]: s for s in semillas}


def test_una_fachada_partida_en_tramos_es_UN_lado():
    lados = cp.lados(PAREDES)
    norte = [l for l in lados if l["orientacion"] == "N"][0]
    assert sorted(norte["ids"]) == ["FBN1", "FBN2"]
    assert abs(norte["largo"] - 14) < 1e-6
    # El trozo de 10 cm no forma lado.
    assert not any("FBE9" in l["ids"] for l in lados)


def test_garaje_contra_la_calle_y_porche_contra_el_patio():
    semillas, notas = cp.proponer(CASA, PAREDES, OBJ)
    s = _por_uso(semillas)
    assert set(s) == {"GARAJE", "PORCHE"}, notas
    assert sorted(s["GARAJE"]["ancla"]) == ["FBN1", "FBN2"]
    assert s["GARAJE"]["confianza"] == "media"
    assert "calle" in s["GARAJE"]["por_que"]
    assert s["PORCHE"]["ancla"] == ["FBO1"]
    assert "patio" in s["PORCHE"]["por_que"]


def test_ajustada_tiene_los_m2_de_catastro_y_cada_una_en_su_lado():
    semillas, _ = cp.proponer(CASA, PAREDES, OBJ)
    zonas, avisos = cq.ajustar_nivel(
        CASA, [{"indice": x["indice"], "uso": x["uso"], "poligono": x["poligono"]} for x in semillas], OBJ, True)
    z = {x["uso"]: x for x in zonas}
    assert abs(z["GARAJE"]["area_m2"] - OBJ["GARAJE"]) < 1.0, avisos
    assert abs(z["PORCHE"]["area_m2"] - OBJ["PORCHE"]) < 1.0, avisos
    assert z["GARAJE"]["poligono"].intersection(z["PORCHE"]["poligono"]).area < 0.1
    # El garaje se apoya en la calle (norte) y el porche en el patio (oeste).
    assert z["GARAJE"]["poligono"].bounds[3] > 13.9
    assert z["PORCHE"]["poligono"].bounds[0] < 0.1
    assert z["PORCHE"]["poligono"].centroid.x < 7


def test_la_FOTO_de_una_puerta_de_garaje_manda_sobre_la_calle():
    semillas, _ = cp.proponer(CASA, PAREDES, OBJ, pistas={"GARAJE": ["FBO1"]})
    s = _por_uso(semillas)
    assert s["GARAJE"]["ancla"] == ["FBO1"]
    assert s["GARAJE"]["confianza"] == "alta"
    assert "foto" in s["GARAJE"]["por_que"]
    # El patio ya lo ocupa el garaje: el porche va a la calle, y se dice.
    assert sorted(s["PORCHE"]["ancla"]) == ["FBN1", "FBN2"]
    assert s["PORCHE"]["confianza"] == "baja"


def test_lo_que_queda_va_al_FONDO_lejos_de_la_calle():
    semillas, _ = cp.proponer(CASA, PAREDES, {"GARAJE": 60.0, "ALMACEN": 20.0})
    s = _por_uso(semillas)
    assert s["ALMACEN"]["ancla"] == ["MBS1"]
    assert "fondo" in s["ALMACEN"]["por_que"]
    assert s["ALMACEN"]["confianza"] == "baja"


def test_sin_paredes_no_se_inventa_nada_y_se_dice():
    semillas, notas = cp.proponer(CASA, [], OBJ)
    assert semillas == []
    assert len(notas) == 2 and all("a mano" in n for n in notas)
