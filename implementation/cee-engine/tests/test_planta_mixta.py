"""Una planta baja que es vivienda, garaje y porche a la vez, en UN cuerpo.

EL CASO — 2119403VJ9321N (26RES060_OP246, CL Altillo 3, Argamasilla de Alba).
Un solo BuildingPart de dos plantas y 195,36 m2 de huella. Catastro declara en
la baja VIVIENDA 17 + 22, APARCAMIENTO 122 y PORCHE 100% 36; en la primera,
VIVIENDA 175 y PORCHE 21. No dice que poligono es cada uso.

Lo que salio en CE3X (y el certificador lo vio al abrirlo): la planta baja se
media como vivienda para sus paredes, pero para sus forjados mandaba el uso
DOMINANTE (garaje), y salian DOS particiones sobre los mismos 195 m2 —el techo
de la baja y el suelo de la primera—; la de la baja, en CE3X, «particion
horizontal con espacio NH inferior: garaje/espacio enterrado». No hay sotano.

Lo que tiene que salir, con el garaje y el porche DELIMITADOS:
  · la pared de la vivienda contra el garaje: particion VERTICAL (misma altura);
  · el suelo de la primera sobre el garaje: particion horizontal NH inferior;
  · el suelo de la primera sobre el porche abierto: SUELO en contacto con el aire;
  · el suelo de la baja: solo el de la vivienda, sobre el terreno.
"""
from shapely.geometry import Polygon, box

from src.gis.floors import (PORCHE, ParteEdificio, asignar_usos,
                            elementos_horizontales, marcar_usos_medidos,
                            plantas_desde_partes)

#: 14 x 14 m. Vivienda de la baja al norte (14 x 2,8 = 39,2), porche al oeste
#: del resto (3 x 11,2 = 33,6) y el garaje en lo demas (11 x 11,2 = 123,2).
CASA = ParteEdificio("part1", box(0, 0, 14, 14), 2, 0)
VIVIENDA_PB = box(0, 11.2, 14, 14)
PORCHE_PB = box(0, 0, 3, 11.2)
GARAJE_PB = box(3, 0, 14, 11.2)

USOS = {0: {"VIVIENDA": 39.0, "GARAJE": 122.0, "OTROS": 36.0},
        1: {"VIVIENDA": 175.0, "OTROS": 21.0}}
HABITABLES = {0: {"VIVIENDA": 39.0}, 1: {"VIVIENDA": 175.0}}


def _plantas(fuera=None, medir=True):
    pl = plantas_desde_partes([CASA], fuera_por_nivel=fuera)
    asignar_usos(pl, USOS)
    if medir:
        marcar_usos_medidos(pl, HABITABLES)
    return pl


def _escritos(hz):
    """Lo que acaba en el .cex: todo menos los forjados marcados como no relevantes."""
    return [h for h in hz if h.relevante_ce3x]


def test_la_planta_que_se_mide_es_vivienda_para_sus_forjados():
    pl = _plantas()
    assert pl[0].uso_dominante == "GARAJE"          # lo que dice Catastro, se conserva
    assert pl[0].uso_medido == "VIVIENDA"           # lo que mide la envolvente


def test_sin_delimitar_no_salen_particiones_fantasma():
    hz = _escritos(elementos_horizontales(_plantas()))
    tipos = sorted((h.planta, h.tipo, h.subtipo) for h in hz)
    # Ni «garaje enterrado» bajo la baja ni el mismo forjado dos veces.
    assert not [h for h in hz if h.tipo == "PARTICION_HORIZONTAL"], tipos
    assert ("PB", "SUELO", "TERRENO") in tipos
    assert ("P1", "CUBIERTA", "AIRE_EXTERIOR") in tipos


def test_con_garaje_y_porche_delimitados_sale_lo_que_haria_el_certificador():
    fuera = {0: [{"geom": GARAJE_PB, "uso": "GARAJE", "dibujada": True},
                 {"geom": PORCHE_PB, "uso": PORCHE, "dibujada": True}]}
    pl = _plantas(fuera)
    pb = pl[0]
    assert abs(pb.huella.area - VIVIENDA_PB.area) < 1.0
    # El porche NO es un espacio no habitable: es exterior.
    assert [p["uso"] for p in pb.no_habitable_partes] == ["GARAJE"]

    hz = _escritos(elementos_horizontales(pl))
    por = {(h.planta, h.tipo, h.subtipo): round(h.area_m2, 1) for h in hz}

    assert abs(por[("PB", "SUELO", "TERRENO")] - VIVIENDA_PB.area) < 1.0
    assert abs(por[("P1", "PARTICION_HORIZONTAL", "ESPACIO_NO_HABITABLE_INFERIOR")]
               - GARAJE_PB.area) < 1.0
    assert abs(por[("P1", "SUELO", "AIRE_EXTERIOR")] - PORCHE_PB.area) < 1.0
    # Y ningun forjado desde el lado del garaje.
    assert not [h for h in hz if h.planta == "PB" and h.tipo == "PARTICION_HORIZONTAL"]


def test_un_forjado_no_se_escribe_desde_el_lado_no_habitable():
    """Planta baja ENTERA de garaje (no se mide) bajo una vivienda: el forjado
    lo escribe la vivienda, una vez. Antes salia tambien como techo del garaje."""
    pl = plantas_desde_partes([CASA])
    asignar_usos(pl, {0: {"GARAJE": 190.0}, 1: {"VIVIENDA": 190.0}})
    marcar_usos_medidos(pl, {1: {"VIVIENDA": 190.0}})
    hz = _escritos(elementos_horizontales(pl))
    parts = [(h.planta, h.subtipo) for h in hz if h.tipo == "PARTICION_HORIZONTAL"]
    assert parts == [("P1", "ESPACIO_NO_HABITABLE_INFERIOR")]


def test_un_porche_que_no_toca_la_planta_no_rompe_nada():
    fuera = {0: [{"geom": Polygon([(20, 20), (21, 20), (21, 21)]), "uso": PORCHE}]}
    pl = _plantas(fuera)
    assert abs(pl[0].huella.area - 196.0) < 0.5


# ------------------------------------------------ y el .cex lo escribe como CE3X
import sys                                   # noqa: E402
from pathlib import Path                     # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import generar_cex as G                      # noqa: E402


def test_el_suelo_sobre_el_porche_es_suelo_al_aire_no_contra_el_terreno():
    """Salia como «SUELO EN TERRENO» en la planta 1. La forma es la de los 216
    suelos al aire del corpus: 15 campos, modo 'Conocidas' y 'aire' al final."""
    rec = G.suelo_aire("SU11 SUELO EN CONTACTO CON AIRE EXTERIOR", 36.02, "PLANTA 1",
                       {"u": 0.49, "masa": 500, "modo": "Conocidas"})
    assert len(rec) == 15
    assert str(rec[1]) == "Suelo" and str(rec[5]) == "Suelo" and str(rec[-1]) == "aire"
    assert rec[8] == "Conocidas" and rec[9] == [True, False, "0.49", "500"]
    assert rec[12] == "1" and rec[13] == "PLANTA 1"
    # Y el suelo contra el terreno sigue como estaba (17 campos, 'terreno').
    ter = G.suelo_terreno("SUB1", 39.04, "PLANTA BAJA", {"u": 0.49, "masa": 750})
    assert len(ter) == 17 and str(ter[-1]) == "terreno"
