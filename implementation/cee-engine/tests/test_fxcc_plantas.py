"""El CROQUIS CATASTRAL POR PLANTAS (FXCC de la Sede) y lo que se hace con el.

Fixture: el FXCC por plantas REAL de 8480109VH9888S (CL Romeras 8, Villanueva
de los Infantes), descargado de la Sede el 2026-10-05. Cartografia publica del
Catastro: no lleva titulares. Planta baja: vivienda 78, comercio 15 + 33,
porches 11 y 45, patios 182 y 49; planta 1: vivienda 100, almacenes 15 + 33.

Lo que se vigila:
  · que el .ASC y el .DXF se lean segun la norma y los recintos se
    reconstruyan con la superficie que rotula Catastro;
  · que cada local case con su fila de `lcons` (planta, escalera, puerta) y
    que mande lo que haya marcado una persona;
  · que la PROPUESTA de croquis salga de los recintos, no de una conjetura;
  · que un cuerpo se reconozca por lo que el croquis dibuja DENTRO de el
    (el de 47,7 m2 es comercio + almacen, no el porche de 45 m2);
  · que un DXF en otro huso se reproyecte, y uno que no cae en la parcela no
    se use;
  · y lo puro del cliente de la Sede.
"""
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from shapely.geometry import Polygon
from shapely.ops import unary_union

from src.catastro import fxcc, sede
from src.gis import cuerpos as cu

FIXTURE = Path(__file__).parent / "fixtures" / "fxcc" / "8480109VH9888S_plantas.zip"


@pytest.fixture(scope="module")
def fx():
    return fxcc.leer_fxcc(FIXTURE)


# ------------------------------------------------------------------ lectura
def test_lee_el_asc_segun_la_norma(fx):
    assert fx.refcat == "8480109VH9888S"
    assert fx.asc["fecha"] == "30/12/15"
    assert fx.asc["sup_construida"] == 330
    assert [(p.nombre, p.niveles) for p in fx.plantas] == [("BAJA 00", [0]), ("PISO 01", [1])]
    baja = fx.plantas[0].declarados
    assert {"codigo": "V.04.1", "superficie": 78} in baja
    assert not fx.avisos


def test_cada_recinto_sale_con_la_superficie_que_rotula_catastro(fx):
    recintos = [r for p in fx.plantas for r in p.recintos] + fx.general
    assert len(recintos) == 17
    for r in recintos:
        assert r.poligono is not None, r.codigo
        assert abs(r.area - r.superficie) <= max(1.0, 0.02 * r.superficie), (r.codigo, r.area)


def test_los_usos_del_croquis(fx):
    baja = {r.codigo: r for r in fx.plantas[0].recintos}
    assert (baja["V.04.1"].uso, baja["V.04.1"].puerta, baja["V.04.1"].escalera) == ("VIVIENDA", "04", "1")
    assert baja["C.02.1"].uso == "TERCIARIO" and baja["C.02.1"].literal == "COMERCIO"
    assert baja["YPO.05.1"].uso == "EXTERIOR"
    piso = {r.codigo: r for r in fx.plantas[1].recintos}
    assert piso["AAL.01.1"].uso == "ALMACEN"


@pytest.mark.parametrize("codigo,esperado", [
    ("V.04.1", ("V", "04", "1")),
    ("AAP.123.12.AAAA.1234", ("AAP", "123", "12")),
    ("TZA.A", ("TZA", "A", None)),
    ("PTO.YTD", ("PTO", None, None)),
    ("V", ("V", None, None)),
])
def test_partir_codigo(codigo, esperado):
    assert fxcc.partir_codigo(codigo) == esperado


@pytest.mark.parametrize("destino,uso", [
    ("V", "VIVIENDA"), ("AAL", "ALMACEN"), ("AAP", "GARAJE"), ("A", "ALMACEN"),
    ("C", "TERCIARIO"), ("O", "LOCAL"), ("YPO", "EXTERIOR"), ("PTO", "EXTERIOR"),
    ("TZA", "EXTERIOR"), ("COMUN", "COMUN"), ("GH3", "TERCIARIO"), ("RPR", "TERCIARIO"),
])
def test_clasificar_destino(destino, uso):
    assert fxcc.clasificar_destino(destino)[0] == uso


@pytest.mark.parametrize("nombre,niveles", [
    ("BAJA 00", [0]), ("PISO 01", [1]), ("Plantas 01,02,03", [1, 2, 3]),
    ("Plantas 01 A 03", [1, 2, 3]), ("SOTANO -1", [-1]), ("Planta sotano -2", [-2]),
    ("PLANTA ATICO AT", []),
])
def test_niveles_de_planta(nombre, niveles):
    assert fxcc.niveles_de_planta(nombre) == niveles


# ------------------------------------------------- casar con lcons y cuenta
LCONS = [  # tal cual los devuelve Consulta_DNPRC para esta parcela
    ("1/00/01", "PORCHE 100%", 0, "1", "01", 11, None),
    ("1/00/02", "COMERCIO", 0, "1", "02", 15, None),
    ("1/00/03", "COMERCIO", 0, "1", "03", 33, None),
    ("1/00/04", "VIVIENDA", 0, "1", "04", 78, True),
    ("1/00/05", "PORCHE 100%", 0, "1", "05", 45, None),
    ("1/01/01", "ALMACEN", 1, "1", "01", 15, False),
    ("1/01/02", "ALMACEN", 1, "1", "02", 33, False),
    ("1/01/03", "VIVIENDA", 1, "1", "03", 100, True),
]


def construcciones(**cambios):
    out = []
    for codigo, uso, nivel, esc, pu, sup, hab in LCONS:
        out.append({"codigo": codigo, "uso": uso, "nivel": nivel, "escalera": esc,
                    "puerta": pu, "superficie": sup, "habitable": cambios.get(codigo, hab)})
    return out


def test_cada_local_casa_con_su_fila_de_lcons(fx):
    cons = construcciones()
    for p in fx.plantas:
        for r in p.recintos:
            if r.destino == "PTO":
                continue
            c = fxcc.construccion_de(r, p.niveles[0], cons)
            assert c is not None, r.codigo
            assert c["superficie"] == r.superficie


def test_manda_lo_que_marco_una_persona(fx):
    alm = next(r for r in fx.plantas[1].recintos if r.codigo == "AAL.01.1")
    assert fxcc.cuenta(alm, fxcc.construccion_de(alm, 1, construcciones()), False) is False
    # Alguien marco el almacen como que cuenta (es un dormitorio sin declarar).
    marcado = construcciones(**{"1/01/01": True})
    assert fxcc.cuenta(alm, fxcc.construccion_de(alm, 1, marcado), False) is True
    porche = next(r for r in fx.plantas[0].recintos if r.codigo == "YPO.05.1")
    assert fxcc.cuenta(porche, {"habitable": True}, False) is False   # exterior: nunca


def test_sin_fila_de_lcons_decide_el_destino(fx):
    com = next(r for r in fx.plantas[0].recintos if r.codigo == "C.02.1")
    assert fxcc.cuenta(com, None, terciario=False) is False
    assert fxcc.cuenta(com, None, terciario=True) is True


# ------------------------------------------------------------------ cuerpos
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
    catastro: dict = field(default_factory=dict)


def spaces():
    return [SpaceFalso(sup, uso, nivel, {"codigo": cod, "uso_literal": uso, "habitable": hab,
                                         "escalera": esc, "puerta": pu})
            for cod, uso, nivel, esc, pu, sup, hab in LCONS]


def poligono(fx, nivel, codigo):
    return next(r.poligono for r in fx.planta_de_nivel(nivel).recintos if r.codigo == codigo)


def test_el_cuerpo_se_reconoce_por_lo_que_dibuja_el_croquis_dentro(fx):
    # El cuerpo de dos plantas sobre el comercio: comercio abajo, almacen arriba.
    # Por superficie (47,7 m2) se casaba con el PORCHE de 45 m2.
    bloque = unary_union([poligono(fx, 0, "C.02.1"), poligono(fx, 0, "C.03.1")])
    casa = poligono(fx, 1, "V.03.1")
    m = ModeloFalso([ParteFalsa("p_bloque", bloque, 2), ParteFalsa("p_casa", casa, 2)],
                    spaces(), {"_fxcc": fx})
    inv = {c["id"]: c for c in cu.inventario(m)}
    b = inv["p_bloque"]
    assert b["construccion"]["por_croquis"] is True
    assert b["construccion"]["uso"] == "COMERCIO / ALMACEN"
    assert b["habitable"] is False
    assert b["niveles_fuera"] == [0, 1]
    assert inv["p_casa"]["habitable"] is True


def test_sin_croquis_sigue_casando_por_superficie(fx):
    bloque = unary_union([poligono(fx, 0, "C.02.1"), poligono(fx, 0, "C.03.1")])
    m = ModeloFalso([ParteFalsa("p_bloque", bloque, 2)], spaces())
    inv = {c["id"]: c for c in cu.inventario(m)}
    assert not (inv["p_bloque"]["construccion"] or {}).get("por_croquis")


# ---------------------------------------------------------------- propuesta
def test_la_propuesta_son_los_recintos_del_croquis(fx):
    from src import pipeline
    huella = unary_union([r.poligono for r in fx.plantas[0].recintos if r.destino != "PTO"])
    m = ModeloFalso([], spaces(), {"_fxcc": fx})
    pr = pipeline._propuesta_fxcc(m, 0, huella, [])
    assert pr["origen"] == "fxcc"
    por_uso = {}
    for t in pr["trazos"]:
        por_uso.setdefault(t["uso"], []).append(t)
    assert sorted(round(t["area_m2"]) for t in por_uso["PORCHE"]) == [11, 45]
    # Los dos locales de comercio son contiguos: una sola zona de 48 m2.
    [com] = por_uso["ESPACIO NO HABITABLE"]
    assert round(com["area_m2"]) == 48 and com["catastro_m2"] == 48
    assert set(com["codigos"]) == {"C.02.1", "C.03.1"}
    assert all(t["confianza"] == "alta" for t in pr["trazos"])
    assert "VIVIENDA" not in {t["uso"] for t in pr["trazos"]}


def test_lo_que_marco_una_persona_no_se_propone_quitar(fx):
    from src import pipeline
    huella = unary_union([r.poligono for r in fx.plantas[1].recintos])
    s = spaces()
    for x in s:
        if x.attrs["codigo"] in ("1/01/01", "1/01/02"):
            x.attrs["habitable"] = True
    m = ModeloFalso([], s, {"_fxcc": fx})
    assert pipeline._propuesta_fxcc(m, 1, huella, []) is None


# ------------------------------------------------------------ encaje y huso
def test_un_dxf_en_otro_huso_se_reproyecta(fx):
    from src import pipeline
    from src.gis.geometry import reproject
    from src.model import Modelo, Objeto
    copia = fxcc.leer_fxcc(FIXTURE)
    parcela = copia.huella_general()
    copia.transformar(lambda g: reproject(g, "EPSG:25830", "EPSG:25829"))
    m = Modelo(refcat_parcela="8480109VH9888S", refcat_inmueble=None, crs="EPSG:25830",
               parcel=Objeto("t", None, parcela, parcela.area, None, None, 1.0))
    assert pipeline.adjuntar_fxcc(m, copia, "prueba") is True
    assert copia.srs_origen == "EPSG:25829"
    assert copia.huella_general().intersection(parcela).area / parcela.area > 0.99


def test_un_dxf_que_no_cae_en_la_parcela_no_se_usa(fx):
    from shapely import affinity
    from src import pipeline
    from src.model import Modelo, Objeto
    copia = fxcc.leer_fxcc(FIXTURE)
    parcela = copia.huella_general()
    copia.transformar(lambda g: affinity.translate(g, 500, 0))
    m = Modelo(refcat_parcela="8480109VH9888S", refcat_inmueble=None, crs="EPSG:25830",
               parcel=Objeto("t", None, parcela, parcela.area, None, None, 1.0))
    assert pipeline.adjuntar_fxcc(m, copia, "prueba") is False
    assert "_fxcc" not in m.catastro


# ------------------------------------------------------------- la Sede, puro
FICHA = """
<form method="post" action="./OVCListaBienes.aspx?origen=Carto" id="aspnetForm">
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="abc&amp;def" />
<input type="hidden" name="__EVENTVALIDATION" value="xyz" />
<input name="ctl00$Contenido$hdDelegacion" type="hidden" id="ctl00_Contenido_hdDelegacion" />
<input type="submit" name="ctl00$Contenido$btn" value="Enviar" />
<a onclick="javascript:CargarBien(&#39;13&#39;,&#39;93&#39;,&#39;U&#39;,&#39;8480109VH9888S0004RX&#39;,&#39;N&#39;)">x</a>
<a href="../Cartografia/FXCC/Visor3D.aspx?del=13&mun=93&refcat=8480109VH9888S0004RX&final=">3D</a>
</form>"""


def test_campos_del_formulario():
    c = sede.campos_del_formulario(FICHA)
    assert c["__VIEWSTATE"] == "abc&def"          # se manda sin escapar
    assert c["ctl00$Contenido$hdDelegacion"] == ""
    assert "ctl00$Contenido$btn" not in c          # los botones no viajan


def test_la_ficha_tiene_que_ser_de_la_parcela_pedida():
    assert sede.ref_de_la_ficha(FICHA, "8480109VH9888S") == ("13", "93", "8480109VH9888S0004RX")
    assert sede.ref_de_la_ficha(FICHA, "8480108VH9888S") is None


def test_es_fichero_por_su_firma():
    zip_ = sede.PRODUCTOS["fxcc_plantas"]
    pdf = sede.PRODUCTOS["croquis_pdf"]
    kml = sede.PRODUCTOS["kml_plantas"]
    assert sede.es_fichero(zip_, {}, FIXTURE.read_bytes())
    assert not sede.es_fichero(zip_, {"content-type": "text/html"}, b"<!DOCTYPE html>")
    assert sede.es_fichero(pdf, {"content-type": "application/x-unknown"}, b"%PDF-1.4 ...")
    assert sede.es_fichero(kml, {}, b'<?xml version="1.0"?><kml xmlns="x">')
