"""Un cuerpo no habitable se deja fuera POR PLANTA, no entero.

EL CASO QUE LO JUSTIFICA — 2370310VJ4027S (26RES060_195): un garaje adosado con
vivienda encima. Catastro lo dibuja como UN BuildingPart de DOS plantas y
declara APARCAMIENTO solo en la baja. Lo que pasaba:

  · dentro de la envolvente, sus paredes exteriores contaban como fachada de la
    vivienda y la pared casa<->garaje no existia (Catastro une los dos cuerpos
    por nivel y esa linea queda dentro);
  · al quitarlo, se iba de las DOS plantas: la primera perdia 19 m2 y sus dos
    fachadas reales a la calle, y aparecian cuatro fachadas fantasma donde la
    vivienda continua.

Y ademas, en CUALQUIER vivienda de dos plantas, el forjado entre ellas se
escribia en el .cex como particion con "Garaje/espacio enterrado".
"""
import pytest
from shapely.geometry import Polygon

from src.gis import cuerpos as cu
from src.gis.floors import (ParteEdificio, asignar_usos, elementos_horizontales,
                            plantas_desde_partes)


def rect(x0, y0, ancho, alto):
    return Polygon([(x0, y0), (x0 + ancho, y0),
                    (x0 + ancho, y0 + alto), (x0, y0 + alto)])


# La casa: 10 x 10, dos plantas. El garaje: 5 x 4 pegado a su lado este, DOS
# plantas tambien (encima hay vivienda), y Catastro lo declara APARCAMIENTO en
# la planta baja. Es la forma del 195.
CASA = ParteEdificio("p_casa", rect(0, 0, 10, 10), 2, 0)
GARAJE = ParteEdificio("p_garaje", rect(10, 0, 5, 4), 2, 0)
#: un almacen exento de UNA planta, para el caso de dos cuerpos a la vez
ALMACEN = ParteEdificio("p_almacen", rect(0, 10, 4, 3), 1, 0)


def _space(codigo, uso, area, planta, habitable):
    class S:
        pass
    s = S()
    s.area, s.use, s.floor = area, uso, planta
    s.attrs = {"codigo": codigo, "uso_literal": uso, "habitable": habitable}
    return s


def _modelo(partes, spaces):
    class M:
        pass
    m = M()
    m.partes, m.spaces = partes, spaces
    return m


def _inv(partes=(CASA, GARAJE), con_almacen=False):
    spaces = [_space("1/00/01", "VIVIENDA", 100.0, 0, True),
              _space("1/00/02", "APARCAMIENTO", 20.0, 0, False),
              _space("1/01/01", "VIVIENDA", 120.0, 1, True)]
    if con_almacen:
        spaces.append(_space("1/00/03", "ALMACEN", 12.0, 0, False))
    return {c["id"]: c for c in cu.inventario(_modelo(list(partes), spaces))}


# --------------------------------------------------------- en QUE plantas sale
def test_un_garaje_con_vivienda_encima_solo_sale_de_la_planta_baja():
    """Es la regla entera: el prisma tiene dos plantas y APARCAMIENTO es de la
    baja. En la primera ese mismo cuerpo es vivienda y tiene que seguir."""
    g = _inv()["p_garaje"]
    assert g["niveles"] == [0, 1]
    assert g["construccion"]["uso"] == "APARCAMIENTO"
    assert cu.niveles_fuera(g) == [0]


def test_un_cuerpo_que_catastro_llama_vivienda_sale_de_todas():
    """Quitar un cuerpo habitable es ir CONTRA lo que dice Catastro: no hay
    ninguna planta en la que el conste como no habitable, asi que no se puede
    adivinar en cual sobra."""
    assert cu.niveles_fuera(_inv()["p_casa"]) == [0, 1]


def test_un_cuerpo_que_no_casa_con_nada_sale_de_todas():
    suelto = ParteEdificio("p_x", rect(40, 40, 7, 7), 2, 0)
    c = _inv(partes=(CASA, suelto))["p_x"]
    assert c["construccion"] is None
    assert cu.niveles_fuera(c) == [0, 1]


def test_el_inventario_lo_publica_para_el_plano():
    """El plano lo necesita para pintar «NO CUENTA» solo donde no cuenta."""
    assert _inv()["p_garaje"]["niveles_fuera"] == [0]


# ------------------------------------------------- lo que se mide en cada planta
def _plantas(fuera_por_nivel=None, partes=(CASA, GARAJE), usos=None):
    pl = plantas_desde_partes(list(partes), fuera_por_nivel=fuera_por_nivel)
    asignar_usos(pl, usos or {0: {"VIVIENDA": 100.0}, 1: {"VIVIENDA": 120.0}})
    return pl


def test_la_planta_baja_pierde_el_garaje_y_la_primera_NO():
    pl = _plantas({0: [{"geom": GARAJE.geometry, "uso": "APARCAMIENTO"}]})
    pb, p1 = pl
    assert pb.area_m2 == pytest.approx(100.0)        # 120 - 20
    assert p1.area_m2 == pytest.approx(120.0)        # intacta: ahi es vivienda
    assert pb.no_habitable.area == pytest.approx(20.0)
    assert p1.no_habitable is None


def test_lo_que_se_quita_sigue_construido():
    """De aqui sale que la pared contra el no sea una fachada al aire y que el
    forjado de encima no sea un voladizo."""
    pb = _plantas({0: [{"geom": GARAJE.geometry, "uso": "APARCAMIENTO"}]})[0]
    assert pb.huella.area == pytest.approx(100.0)
    assert pb.huella_construida.area == pytest.approx(120.0)


def test_sin_nada_fuera_se_mide_igual_que_siempre():
    pb, p1 = _plantas()
    assert (pb.area_m2, p1.area_m2) == (pytest.approx(120.0), pytest.approx(120.0))
    assert pb.no_habitable is None
    assert pb.huella_construida is pb.huella


# ------------------------------------------------------ el forjado de encima
def _horizontales(fuera_por_nivel=None, **kw):
    return elementos_horizontales(_plantas(fuera_por_nivel, **kw))


def _buscar(elems, **kw):
    return [e for e in elems if all(getattr(e, k) == v for k, v in kw.items())]


def test_el_suelo_sobre_el_garaje_es_una_particion_con_espacio_no_habitable():
    elems = _horizontales({0: [{"geom": GARAJE.geometry, "uso": "APARCAMIENTO"}]})
    sobre = _buscar(elems, planta="P1", subtipo="ESPACIO_NO_HABITABLE_INFERIOR")
    assert len(sobre) == 1
    assert sobre[0].area_m2 == pytest.approx(20.0)
    assert sobre[0].espacio_destino == "APARCAMIENTO"
    assert sobre[0].relevante_ce3x is True


def test_lo_que_se_apoya_en_el_garaje_NO_es_un_voladizo():
    """El fallo que delataria haber recortado la huella sin mas: 20 m2 de la
    planta primera saldrian «volando» sobre nada."""
    elems = _horizontales({0: [{"geom": GARAJE.geometry, "uso": "APARCAMIENTO"}]})
    assert _buscar(elems, planta="P1", tipo="SUELO", subtipo="AIRE_EXTERIOR") == []


def test_el_forjado_entre_dos_plantas_de_vivienda_no_va_al_cex():
    entre = _buscar(_horizontales(), planta="P1", subtipo="ENTRE_PLANTAS")
    assert entre and all(e.relevante_ce3x is False for e in entre)


def test_un_garaje_y_un_almacen_debajo_son_DOS_particiones_distintas():
    """Con una sola geometria unida, las dos salian con el nombre del primero.
    Y el forjado tiene que decir sobre QUE da cada trozo."""
    alto = ParteEdificio("p_alto", rect(0, 0, 15, 13), 2, 0)   # cubre los tres
    pl = plantas_desde_partes(
        [alto],
        fuera_por_nivel={0: [{"geom": GARAJE.geometry, "uso": "APARCAMIENTO"},
                             {"geom": ALMACEN.geometry, "uso": "ALMACEN"}]})
    asignar_usos(pl, {0: {"VIVIENDA": 100.0}, 1: {"VIVIENDA": 195.0}})
    destinos = {e.espacio_destino: round(e.area_m2, 2)
                for e in _buscar(elementos_horizontales(pl),
                                 planta="P1", subtipo="ESPACIO_NO_HABITABLE_INFERIOR")}
    assert destinos == {"APARCAMIENTO": 20.0, "ALMACEN": 12.0}


def test_lo_que_tiene_un_trastero_encima_no_es_cubierta():
    """El caso simetrico: si arriba hay un cuerpo que no cuenta, el techo de
    abajo es una particion, no un tejado."""
    alto = ParteEdificio("p_alto", rect(0, 0, 10, 10), 2, 0)
    trastero = rect(0, 0, 4, 4)
    pl = plantas_desde_partes([alto],
                              fuera_por_nivel={1: [{"geom": trastero,
                                                    "uso": "ALMACEN"}]})
    asignar_usos(pl, {0: {"VIVIENDA": 100.0}, 1: {"VIVIENDA": 84.0}})
    elems = elementos_horizontales(pl)
    bajo = _buscar(elems, planta="PB", subtipo="ESPACIO_NO_HABITABLE_SUPERIOR")
    assert len(bajo) == 1 and bajo[0].area_m2 == pytest.approx(16.0)
    assert bajo[0].espacio_destino == "ALMACEN"
    # y lo de al lado sigue siendo forjado entre plantas, no cubierta
    assert not _buscar(elems, planta="PB", tipo="CUBIERTA")


# ------------------------------------------------------------- excluir_cuerpos
def _modelo_real():
    from src.model import Modelo, Objeto
    m = Modelo(refcat_parcela="X", refcat_inmueble=None, crs="EPSG:25830")
    m.partes = [CASA, GARAJE]
    m.buildings = [Objeto(source="T", original_id=None,
                          geometry=CASA.geometry.union(GARAJE.geometry),
                          area=120.0, use=None, floor=None, confidence=1.0)]
    m.spaces = [_space("1/00/01", "VIVIENDA", 100.0, 0, True),
                _space("1/00/02", "APARCAMIENTO", 20.0, 0, False),
                _space("1/01/01", "VIVIENDA", 120.0, 1, True)]
    return m


def test_excluir_un_cuerpo_recorta_su_planta_y_deja_la_otra():
    from src import pipeline
    m = _modelo_real()
    dichos = pipeline.excluir_cuerpos(m, ["p_garaje"])
    assert [(p.nivel, round(p.area_m2)) for p in m.floors] == [(0, 100), (1, 120)]
    assert m.floors[0].no_habitable.area == pytest.approx(20.0)
    # se dice en que planta sale y en cual sigue: es una decision de una persona
    assert "planta baja" in dichos[0] and "SIGUE contando" in dichos[0]


def test_el_cuerpo_excluido_NO_se_borra_del_modelo():
    """Sigue construido: hace falta para la particion vertical, para el forjado
    de encima y para que su hueco no se lea como un solar."""
    from src import pipeline
    m = _modelo_real()
    pipeline.excluir_cuerpos(m, ["p_garaje"])
    assert [p.original_id for p in m.partes] == ["p_casa", "p_garaje"]
    assert m.buildings[0].geometry.area == pytest.approx(120.0)


# ------------------------------------------------------- lo que se ESCRIBE
ALTO = 2.80


def _medida(v):
    return {"value": v, "source": "CATASTRO_WFS_BU", "confidence": 1.0,
            "evidence_type": "MEASURED", "note": None}


def _horizontal(ident, planta, nivel, subtipo, area, relevante):
    return {"id": ident, "planta": planta, "nivel": nivel,
            "tipo": "PARTICION_INTERIOR_HORIZONTAL", "subtipo": subtipo,
            "superficie": _medida(area), "largo": _medida(None),
            "alto": _medida(None),
            "geometria_wkt": "POLYGON ((0 0, 10 0, 10 6, 0 6, 0 0))",
            "extra": {"relevante_ce3x": relevante}}


TERM_CEX = {
    "fachada": {"u": 1.69, "masa": 200.0},
    "medianera": {"u": 0, "masa": 60},
    "cubierta": {"u": 1.69, "masa": 100.0, "forma": "Cubierta plana"},
    "suelo_terreno": {"u": 1.0, "masa": 750},
    # Lo que traia la ficha: hacia ARRIBA y "Otro". El subtipo del elemento
    # tiene que poder corregirlo, o un garaje debajo sale declarado encima.
    "particion_superior": {"u": 2.0, "masa": 500, "tipo_espacio": "Otro",
                           "sentido": "horizontal superior"},
    "particion_vertical": {"u": 2.0, "masa": 60.0, "tipo_espacio": ""},
}


def _escribir(elementos, plantas=("PB", "P1")):
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
    import generar_cex as G
    p3, avisos = G.construir_envolvente(
        {"elementos": elementos},
        {"termicas": TERM_CEX,
         "envolvente": {"espacio": "Edificio Objeto", "incluir_plantas": list(plantas),
                        "excluir_ids": {"ids": []}, "huecos": []}})
    return p3[0], avisos


def test_el_forjado_entre_viviendas_NO_se_escribe_en_el_cex():
    """Antes salia como «Particion Interior / Garaje-espacio enterrado» en
    TODA vivienda de dos plantas, tuviera garaje o no."""
    cerr, avisos = _escribir([
        _horizontal("PHB1", "PB", 0, "ENTRE_PLANTAS", 120.0, False),
        _horizontal("PH11", "P1", 1, "ENTRE_PLANTAS", 120.0, False)])
    assert [str(c[0]) for c in cerr] == []
    assert any("PHB1, PH11" in a and "forjados entre dos plantas" in a
               for a in avisos)


def test_la_particion_sobre_el_garaje_sale_hacia_ABAJO():
    """El sentido y el tipo de espacio van EMPAREJADOS en CE3X: escribir
    «Garaje/espacio enterrado» hacia arriba es un cerramiento que lee mal."""
    cerr, _ = _escribir([
        _horizontal("PH11", "P1", 1, "ESPACIO_NO_HABITABLE_INFERIOR", 20.0, True)])
    assert len(cerr) == 1
    fila = cerr[0]
    assert str(fila[0]) == "PH11 SUELO SOBRE ESPACIO NO HABITABLE"
    assert str(fila[1]) == "Partición Interior"
    assert str(fila[5]) == "Garaje/espacio enterrado"
    assert str(fila[-1]) == "horizontal inferior"


def test_la_particion_bajo_un_trastero_sale_hacia_ARRIBA():
    cerr, _ = _escribir([
        _horizontal("PHB1", "PB", 0, "ESPACIO_NO_HABITABLE_SUPERIOR", 16.0, True)])
    assert str(cerr[0][0]) == "PHB1 TECHO BAJO ESPACIO NO HABITABLE"
    assert str(cerr[0][5]) == "Otro"
    assert str(cerr[0][-1]) == "horizontal superior"


def test_la_pared_contra_el_garaje_SI_se_escribe():
    """Se quedaba en «tipo no contemplado, NO se escribe»: el .cex salia con la
    casa abierta justo por donde toca el garaje."""
    pared = {"id": "PVBE1", "planta": "PB", "nivel": 0,
             "tipo": "PARTICION_INTERIOR_VERTICAL", "subtipo": "ESPACIO_NO_HABITABLE",
             "orientacion": "E", "azimut": 90.0,
             "largo": _medida(5.26), "alto": _medida(ALTO),
             "superficie": _medida(14.72),
             "geometria_wkt": "LINESTRING (10 0, 10 5.26)"}
    cerr, avisos = _escribir([pared], plantas=("PB",))
    assert len(cerr) == 1
    assert str(cerr[0][0]) == "PVBE1 PARTICION CON ESPACIO NO HABITABLE"
    assert str(cerr[0][1]) == "Partición Interior"
    assert float(cerr[0][2]) == pytest.approx(14.72)
    assert str(cerr[0][-1]) == "vertical"
    # y no es adiabatica: por ahi se pierde calor
    assert cerr[0][3] == 2.0
    assert any("no es adiabatico" in a for a in avisos)
    assert not any("no contemplado" in a for a in avisos)
