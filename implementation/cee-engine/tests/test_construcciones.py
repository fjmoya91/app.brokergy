"""Que CUENTA de un edificio: lo que marco una persona, no el uso de Catastro.

Al abrir la oportunidad se marca en la ficha tecnica que construcciones entran,
y de ahi sale la superficie con la que se le presupuesto al cliente. Si el
`.cex` midiera otras plantas, el certificado no reproduciria el ahorro de su
propia propuesta.

Lo que se fija aqui:

  - el CODIGO con el que las dos aplicaciones se refieren a la misma
    construccion (`escalera/planta/puerta`), con los MISMOS valores por defecto
    que `catastroService.js`. Si uno de los dos cambia la receta, la seleccion
    deja de casar en silencio;
  - que sin seleccion NO se toca nada;
  - y que lo que cambia se DICE.
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from src import pipeline                                   # noqa: E402
from src.catastro.alphanumeric import UnidadConstructiva   # noqa: E402
from src.model import Modelo, Objeto                       # noqa: E402


def _unidad(uso, es=None, pt=None, pu=None):
    return UnidadConstructiva(
        uso=uso, uso_literal=uso, planta=0, planta_literal=pt,
        escalera=es, puerta=pu, superficie_m2=100.0, planta_bruta=pt)


def _modelo(unidades):
    m = Modelo(refcat_parcela="0000000XX0000X", refcat_inmueble=None,
               crs="EPSG:25830")
    for u in unidades:
        m.spaces.append(Objeto(
            source="CATASTRO_OVC_JSON", original_id=None, geometry=None,
            area=u.superficie_m2, use=u.uso, floor=u.planta, confidence=1.0,
            attrs={"uso_literal": u.uso_literal, "planta_literal": u.planta_literal,
                   "codigo": u.codigo, "habitable": u.habitable,
                   "habitable_catastro": u.habitable}))
    return m


def test_el_codigo_usa_los_mismos_valores_por_defecto_que_la_app():
    """`${es||'01'}/${pt||'00'}/${pu||'001'}` — copiado de `catastroService.js`."""
    assert _unidad("VIVIENDA", "1", "00", "01").codigo == "1/00/01"
    assert _unidad("ALMACEN", None, "02", None).codigo == "01/02/001"
    assert _unidad("VIVIENDA", None, None, None).codigo == "01/00/001"


def test_sin_seleccion_no_se_toca_nada():
    """Una oportunidad que nunca paso por la ficha tecnica mide como siempre."""
    m = _modelo([_unidad("VIVIENDA", "1", "00", "01"),
                 _unidad("ALMACEN", "1", "01", "01")])
    assert pipeline.aplicar_seleccion(m, None) == []
    assert pipeline.aplicar_seleccion(m, []) == []
    assert [s.attrs["habitable"] for s in m.spaces] == [True, False]


def test_un_almacen_marcado_pasa_a_contar_y_se_dice():
    """El caso real: una planta que consta como almacen y es vivienda."""
    m = _modelo([_unidad("VIVIENDA", "1", "00", "01"),
                 _unidad("ALMACEN", "1", "01", "01")])
    cambios = pipeline.aplicar_seleccion(m, ["1/00/01", "1/01/01"])

    assert [s.attrs["habitable"] for s in m.spaces] == [True, True]
    assert len(cambios) == 1 and "CUENTA" in cambios[0]
    # Lo que decia CATASTRO se conserva: el fichero no puede borrar el hecho de
    # que su uso registrado es ALMACEN.
    assert m.spaces[1].attrs["habitable_catastro"] is False
    assert any("CONSTRUCCIONES_SELECCIONADAS" in msg for msg in m.diagnostics.messages)


def test_una_vivienda_sin_marcar_deja_de_contar():
    """Al reves tambien: un porche cerrado que consta como vivienda y no calienta."""
    m = _modelo([_unidad("VIVIENDA", "1", "00", "01"),
                 _unidad("VIVIENDA", "1", "01", "01")])
    cambios = pipeline.aplicar_seleccion(m, ["1/00/01"])
    assert [s.attrs["habitable"] for s in m.spaces] == [True, False]
    assert len(cambios) == 1 and "NO cuenta" in cambios[0]


def test_un_codigo_que_ya_no_existe_se_AVISA():
    """Callarlo seria medir de menos sin que nadie se entere."""
    m = _modelo([_unidad("VIVIENDA", "1", "00", "01")])
    cambios = pipeline.aplicar_seleccion(m, ["1/00/01", "1/09/09"])
    assert any("1/09/09" in c for c in cambios)


def test_un_espacio_sin_codigo_no_se_toca():
    """Los del DXF no vienen de `lcons`: no hay nada con lo que casarlos."""
    m = _modelo([_unidad("VIVIENDA", "1", "00", "01")])
    m.spaces.append(Objeto(source="CATASTRO_DXF", original_id="A", geometry=None,
                           area=50.0, use="GARAJE", floor=0, confidence=1.0,
                           attrs={"habitable": False}))
    pipeline.aplicar_seleccion(m, ["1/00/01"])
    assert m.spaces[1].attrs["habitable"] is False
    assert "cuenta" not in m.spaces[1].attrs
