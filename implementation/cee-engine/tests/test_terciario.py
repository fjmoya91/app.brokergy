"""El .cex de TERCIARIO: cabecera, datos generales e iluminacion.

Lo que se compara son formas copiadas de los `.cex` de terciario del corpus
(29 pequeño, 14 gran), con los nombres cambiados por otros neutros: aqui no se
lee ningun fichero de un cliente.
"""
import re
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import generar_cex as G   # noqa: E402
import leer_cex as L      # noqa: E402
import pickle0 as P       # noqa: E402
import terciario as T     # noqa: E402

PLANTILLA = RAIZ / "assets" / "plantilla-virgen.cex"
FICHA_JS = (RAIZ.parent / "frontend" / "src" / "features" / "cee-envolvente"
            / "logic" / "fichaCe3x.js")


def _plano(v):
    if isinstance(v, list):
        return [_plano(x) for x in v]
    if isinstance(v, G.Cadena):
        return str(v)
    return v


# ---------------------------------------------------------------------------
# La cabecera: el programa con el que CE3X abre el fichero
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("tipo, version", [
    ("residencial", "CEXv2.3 Residencial"),
    ("pequeno_terciario", "CEXv2.3 PequeñoTerciario"),
    ("gran_terciario", "CEXv2.3 GranTerciario"),
])
def test_la_cabecera_se_relee_como_la_version_de_ce3x(tmp_path, tipo, version):
    salida = tmp_path / "x.cex"
    salida.write_bytes(G.montar(PLANTILLA, {3: [[], [], [], []]}, tipo))
    cex = L.trocear(salida)
    assert cex.version == version
    assert cex.version_conocida
    assert len(cex.pickles) == 15
    assert G.comprobar(salida, {3: [[], [], [], []]}, tipo) == []


def test_la_cabecera_del_pequeno_lleva_la_enye_escapada_como_ce3x(tmp_path):
    """Es un STRING de Python 2: la ñ va como `\\xf1`, cuatro bytes, igual que
    en los 29 `.cex` de pequeño terciario del disco."""
    salida = tmp_path / "x.cex"
    salida.write_bytes(G.montar(PLANTILLA, {}, "pequeno_terciario"))
    assert salida.read_bytes().startswith(b"S'CEXv2.3 Peque\\xf1oTerciario'\r\np0\r\n.")


def test_sin_tipo_la_plantilla_sale_byte_a_byte_como_antes(tmp_path):
    """Una ficha antigua, sin tipo, no puede cambiar de programa."""
    a, b = tmp_path / "a.cex", tmp_path / "b.cex"
    a.write_bytes(G.montar(PLANTILLA, {3: [[], [], [], []]}))
    b.write_bytes(G.montar(PLANTILLA, {3: [[], [], [], []]}, "residencial"))
    assert a.read_bytes() == b.read_bytes()


def test_un_tipo_inventado_no_se_escribe():
    with pytest.raises(G.GeneracionError):
        T.tipo_de({"tipo_edificio_ce3x": "hospital"})


def test_un_terciario_se_puede_releer_y_editar():
    """El CEE final copia el inicial con `editar_cex`, que se niega a escribir
    sobre una version que no conoce."""
    assert "CEXv2.3 PequeñoTerciario" in L.VERSIONES_CONOCIDAS
    assert "CEXv2.3 GranTerciario" in L.VERSIONES_CONOCIDAS


# ---------------------------------------------------------------------------
# Datos generales
# ---------------------------------------------------------------------------

def _generales(**extra):
    base = {
        "normativa": {"valor": "NBE-CT-79"}, "tipo_edificio": {"valor": "Unifamiliar"},
        "zona_climatica_he1": {"valor": "D3"}, "zona_climatica_he4": {"valor": "V"},
        "superficie_util_habitable": {"valor": 179}, "altura_libre_planta": {"valor": 3},
        "n_plantas_habitables": {"valor": 3}, "demanda_acs": {"valor": 224},
        "masa_particiones": {"valor": "Media"}, "ventilacion": {"valor": 0.8},
        "ano_construccion": {"valor": 1985},
    }
    base.update(extra)
    return base


def _datos(tipo=None, **generales):
    d = {"generales": _generales(**generales),
         "administrativos": {"provincia": {"valor": "Ciudad Real"},
                             "localidad_lista": {"valor": "Otro"},
                             "localidad_texto": {"valor": "ABENÓJAR"}}}
    if tipo:
        d["tipo_edificio_ce3x"] = tipo
    return d


def test_residencial_no_cambia():
    out = G.construir_generales(_datos(), [""] * 21)
    assert out[1] == "Unifamiliar"
    assert out[20] == ""


def test_terciario_escribe_el_perfil_de_uso_y_el_ambito():
    """La forma de la casa rural de Abenójar (pequeño terciario)."""
    out = G.construir_generales(_datos(
        "pequeno_terciario",
        perfil_uso={"valor": "Intensidad Baja - 24h"},
        ambito={"valor": "Edificio completo"}), [""] * 21)
    assert out[1] == "Intensidad Baja - 24h"
    assert out[20] == "Edificio completo"
    assert out[9] == "224"


def test_un_terciario_puede_ser_un_local():
    out = G.construir_generales(_datos(
        "pequeno_terciario", perfil_uso={"valor": "Intensidad Media - 8h"},
        ambito={"valor": "Local"}), [""] * 21)
    assert out[20] == "Local"


def test_un_terciario_sin_perfil_de_uso_no_se_escribe():
    with pytest.raises(G.GeneracionError, match="perfil_uso"):
        G.construir_generales(_datos("gran_terciario"), [""] * 21)


def test_un_perfil_que_ce3x_no_tiene_no_se_escribe():
    with pytest.raises(G.GeneracionError, match="no es de CE3X"):
        G.construir_generales(_datos(
            "gran_terciario", perfil_uso={"valor": "Intensidad Baja - 10h"}), [""] * 21)


# ---------------------------------------------------------------------------
# La iluminacion
# ---------------------------------------------------------------------------

def test_el_registro_de_iluminacion_tiene_la_forma_medida():
    """Literal del corpus (casa rural, zona P2): 34 m², LED a 200 lux."""
    r = T.registro_iluminacion("Iluminación P2", "P2", 34,
                               "Habitaciones de hoteles,  hostales...", "LED", 200)
    assert _plano(r) == [
        "Iluminación P2", "iluminacion", pytest.approx(119.29824561403508),
        1.7543859649122806, "", "34.0", True,
        "Habitaciones de hoteles,  hostales...", "Estimado", ["LED", "200"],
        [False, ""], "P2",
    ]
    assert isinstance(r[1], G.Cadena)          # literal del codigo: STRING


def test_la_potencia_es_veei_por_superficie_por_iluminancia():
    """Comprobado en los 80 registros «Estimado» del corpus: P = VEEI·S·E/100."""
    r = T.registro_iluminacion("I", "PB", 350, "Aulas y laboratorios",
                               "LED Tube (lineal)", 500)
    assert r[2] == pytest.approx(1.238390092879257 * 350 * 500 / 100)
    assert r[6] is False                       # un aula NO es zona de representación


def test_una_actividad_o_una_lampara_desconocidas_no_se_escriben():
    with pytest.raises(G.GeneracionError, match="actividad"):
        T.registro_iluminacion("I", "PB", 10, "Discoteca", "LED", 200)
    with pytest.raises(G.GeneracionError, match="lampara"):
        T.registro_iluminacion("I", "PB", 10, "Religioso en general", "Vela", 200)


def _zona(nombre, sup):
    return P.Instancia("ventanaSubgrupo", "claseZona", {
        G.Cadena("nombre"): nombre, G.Cadena("raiz"): "Edificio Objeto",
        G.Cadena("tipo"): "Subgrupo", G.Cadena("superficie"): str(sup)})


ILUM = {"defecto": {"actividad": "Habitaciones de hoteles,  hostales...",
                    "lampara": "LED", "iluminancia": 200}}


def test_en_un_residencial_la_iluminacion_no_se_toca():
    slots = [[] for _ in G.SLOTS]
    out, avisos = G.con_iluminacion(slots, {**_datos(), "iluminacion": ILUM},
                                    [_zona("PLANTA BAJA", 100)])
    assert out == slots and avisos == []


def test_una_iluminacion_por_zona_con_su_superficie():
    datos = {**_datos("pequeno_terciario"), "iluminacion": {
        **ILUM, "por_nivel": {"1": {"actividad": "Aulas y laboratorios",
                                    "lampara": "LED", "iluminancia": 500}}}}
    out, avisos = G.con_iluminacion([[] for _ in G.SLOTS], datos,
                                    [_zona("PLANTA BAJA", 120.5), _zona("PLANTA 1", 80)])
    ilum = out[G.SLOTS.index("iluminacion")]
    assert [r[-1] for r in ilum] == ["PLANTA BAJA", "PLANTA 1"]
    assert [r[0] for r in ilum] == ["Iluminación PLANTA BAJA", "Iluminación PLANTA 1"]
    assert ilum[0][5] == "120.5" and ilum[0][7].startswith("Habitaciones")
    # La planta 1 es otra cosa, y lo dice por su NIVEL.
    assert ilum[1][7] == "Aulas y laboratorios" and ilum[1][9] == ["LED", "500"]
    assert any("ESTIMADA" in a for a in avisos)


def test_sin_zonas_va_una_sola_a_la_raiz_con_la_superficie_util():
    out, _ = G.con_iluminacion([[] for _ in G.SLOTS],
                               {**_datos("gran_terciario"), "iluminacion": ILUM}, [])
    ilum = out[G.SLOTS.index("iluminacion")]
    assert len(ilum) == 1
    assert ilum[0][0] == "Iluminación" and ilum[0][-1] == "Edificio Objeto"
    assert ilum[0][5] == "179.0"


def test_la_iluminacion_que_ya_hay_no_se_pisa():
    """El CEE final copia el inicial: su iluminación ya viene, con lo que el
    certificador corrigiera en CE3X."""
    slots = [[] for _ in G.SLOTS]
    slots[G.SLOTS.index("iluminacion")] = [["LA SUYA"]]
    out, _ = G.con_iluminacion(slots, {**_datos("pequeno_terciario"), "iluminacion": ILUM},
                               [_zona("PLANTA BAJA", 50)])
    assert out[G.SLOTS.index("iluminacion")] == [["LA SUYA"]]


def test_un_terciario_sin_iluminacion_lo_dice():
    out, avisos = G.con_iluminacion([[] for _ in G.SLOTS], _datos("pequeno_terciario"),
                                    [_zona("PLANTA BAJA", 50)])
    assert out[G.SLOTS.index("iluminacion")] == []
    assert any("no calcula un terciario" in a for a in avisos)


def test_el_fichero_entero_se_relee_con_su_iluminacion(tmp_path):
    datos = {**_datos("pequeno_terciario"), "iluminacion": ILUM}
    inst, _ = G.con_iluminacion([[] for _ in G.SLOTS], datos, [_zona("PLANTA BAJA", 34)])
    salida = tmp_path / "t.cex"
    salida.write_bytes(G.montar(PLANTILLA, {G.INSTALACIONES: inst}, "pequeno_terciario"))
    releido = L.leer(L.trocear(salida), G.INSTALACIONES)
    assert releido[G.SLOTS.index("iluminacion")][0][7] == "Habitaciones de hoteles,  hostales..."
    assert G.comprobar(salida, {G.INSTALACIONES: inst}, "pequeno_terciario") == []


# ---------------------------------------------------------------------------
# Las listas de la pantalla son las del motor
# ---------------------------------------------------------------------------

def _bloque_js(nombre):
    texto = FICHA_JS.read_text(encoding="utf-8")
    m = re.search(rf"export const {nombre} = \[(.*?)\n\];", texto, re.S)
    assert m, f"no encuentro {nombre} en fichaCe3x.js"
    return m.group(1)


#: El Dockerfile del motor corre estos tests con el contexto de build SOLO de
#: `cee-engine`: ahí no existe `frontend/`, y un FileNotFoundError abortaría el
#: deploy entero. Se saltan diciéndolo; en el repo, que es donde se edita la
#: lista, la vigilancia sigue viva.
_SIN_FRONTEND = pytest.mark.skipif(
    not FICHA_JS.exists(), reason="sin frontend/ (build del contenedor): no hay espejo JS que cotejar")


@_SIN_FRONTEND
def test_las_lamparas_de_la_pantalla_son_las_del_motor():
    """La pantalla enseña la potencia con el VEEI de su lista; si no fuera el
    del motor, diría una potencia y el .cex llevaría otra."""
    bloque = _bloque_js("LAMPARAS_CE3X")
    js = {m.group(1): float(m.group(2))
          for m in re.finditer(r"valor: '([^']+)',\s*veei: ([0-9.]+)", bloque)}
    assert js == T.LAMPARAS


@_SIN_FRONTEND
def test_las_actividades_de_la_pantalla_son_las_del_motor():
    bloque = _bloque_js("ACTIVIDADES_ILUMINACION_CE3X")
    js = {m.group(1): m.group(2) == "true"
          for m in re.finditer(r"valor: '([^']+)',\s*representacion: (true|false)", bloque)}
    assert js == T.ACTIVIDADES


# ---------------------------------------------------------------------------
# Qué se MIDE de un terciario
# ---------------------------------------------------------------------------

from shapely.geometry import Polygon                       # noqa: E402

from src import pipeline                                   # noqa: E402
from src.catastro.alphanumeric import normaliza_uso         # noqa: E402
from src.gis.floors import (ParteEdificio, asignar_usos,    # noqa: E402
                            elementos_horizontales, plantas_desde_partes)
from src.model import Modelo, Objeto                        # noqa: E402


@pytest.mark.parametrize("literal", ["HOTELERO", "RELIGIOSO", "ENSEÑANZA", "SANIDAD",
                                     "COMERCIO", "OCIO Y HOSTELERIA", "DEPORTIVO"])
def test_los_usos_del_terciario_se_reconocen(literal):
    """Los literales de Catastro de los ejemplos del 2026-09-28: antes eran
    'OTROS', como un porche, y el terciario se medía mal."""
    assert normaliza_uso(literal) == "TERCIARIO"


def test_un_porche_sigue_sin_reconocerse():
    assert normaliza_uso("PORCHE 100%") == "OTROS"


def _espacio(uso, literal, planta, area, codigo):
    from src.catastro.alphanumeric import HABITABLES, NO_HABITABLES
    hab = True if uso in HABITABLES else (False if uso in NO_HABITABLES else None)
    return Objeto(source="CATASTRO_OVC_JSON", original_id=None, geometry=None, area=area,
                  use=uso, floor=planta, confidence=1.0,
                  attrs={"codigo": codigo, "uso_literal": literal, "habitable": hab,
                         "habitable_catastro": hab})


def _iglesia():
    """La parroquia de 25TER100_1, tal y como la da Catastro (usos reales)."""
    m = Modelo(refcat_parcela="9649021VJ1194N", refcat_inmueble=None, crs="EPSG:25830")
    m.spaces = [
        _espacio("ALMACEN", "ALMACEN", -1, 86, "1/-1/01"),
        _espacio("TERCIARIO", "RELIGIOSO", 0, 270, "1/00/01"),
        _espacio("GARAJE", "APARCAMIENTO", 0, 94, "1/00/02"),
        _espacio("TERCIARIO", "ENSEÑANZA", 0, 193, "1/00/03"),
        _espacio("OTROS", "PORCHE 100%", 0, 18, "1/00/04"),
        _espacio("TERCIARIO", "ENSEÑANZA", 1, 335, "1/01/01"),
        _espacio("VIVIENDA", "VIVIENDA", 2, 302, "1/02/01"),
    ]
    return m


def _cuentan(m):
    return sorted(s.attrs["codigo"] for s in m.spaces if s.attrs.get("habitable"))


def test_en_residencial_la_iglesia_solo_cuenta_la_vivienda():
    """Lo de siempre: el residencial no cambia."""
    m = _iglesia()
    assert pipeline.aplicar_tipo_edificio(m, "residencial") == []
    assert _cuentan(m) == ["1/02/01"]


def test_en_terciario_cuentan_la_capilla_las_aulas_y_la_vivienda():
    m = _iglesia()
    cambios = pipeline.aplicar_tipo_edificio(m, "gran_terciario")
    assert _cuentan(m) == ["1/00/01", "1/00/03", "1/01/01", "1/02/01"]
    assert len(cambios) == 3
    # almacén, garaje y porche siguen fuera
    fuera = {s.attrs["uso_literal"] for s in m.spaces if not s.attrs.get("habitable")}
    assert fuera == {"ALMACEN", "APARCAMIENTO", "PORCHE 100%"}
    assert m.catastro["tipo_edificio_ce3x"] == "gran_terciario"
    assert "USOS_TERCIARIOS" in m.diagnostics.to_dict()["codes"]


def test_lo_marcado_en_la_oportunidad_sigue_mandando():
    m = _iglesia()
    pipeline.aplicar_tipo_edificio(m, "pequeno_terciario")
    pipeline.aplicar_seleccion(m, ["1/00/01"])
    assert _cuentan(m) == ["1/00/01"]


def _dos_plantas(usos):
    parte = Polygon([(0, 0), (10, 0), (10, 8), (0, 8)])
    pl = plantas_desde_partes([ParteEdificio("A", parte, 2, 0)])
    asignar_usos(pl, usos)
    return pl


def _forjado(elems):
    return [e for e in elems if e.tipo == "PARTICION_HORIZONTAL"
            and e.subtipo == "ENTRE_PLANTAS"]


def test_el_forjado_entre_aulas_y_vivienda_no_se_escribe_en_un_terciario():
    """A los dos lados hay la misma temperatura: no es envolvente."""
    from src.catastro.alphanumeric import ACONDICIONADOS_TERCIARIO
    pl = _dos_plantas({0: {"TERCIARIO": 80.0}, 1: {"VIVIENDA": 80.0}})
    elems = elementos_horizontales(pl, acondicionados=ACONDICIONADOS_TERCIARIO)
    assert _forjado(elems) and not any(e.relevante_ce3x for e in _forjado(elems))


def test_en_residencial_el_forjado_con_otro_uso_sigue_contando():
    pl = _dos_plantas({0: {"TERCIARIO": 80.0}, 1: {"VIVIENDA": 80.0}})
    assert all(e.relevante_ce3x for e in _forjado(elementos_horizontales(pl)))
