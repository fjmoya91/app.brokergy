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


def _unidad(uso, es=None, pt=None, pu=None, m2=100.0):
    return UnidadConstructiva(
        uso=uso, uso_literal=uso, planta=0, planta_literal=pt,
        escalera=es, puerta=pu, superficie_m2=m2, planta_bruta=pt)


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


# ---------------------------------------------------------------------------
# Dos construcciones con el MISMO codigo (26RES080_OP85, RC 9053305VJ9395S0001BM:
# la vivienda de 28 m2 y la piscina DEPORTIVO de 22 m2 son las dos `1/00/01`)
# ---------------------------------------------------------------------------

def _op85():
    return _modelo([_unidad("VIVIENDA", "1", "00", "01", 28.0),
                    _unidad("APARCAMIENTO", "1", "00", "02", 81.0),
                    _unidad("ALMACEN", "1", "00", "03", 45.0),
                    _unidad("DEPORTIVO", "1", "00", "01", 22.0)])


def _m2_que_cuentan(m):
    return sum(s.area for s in m.spaces if s.attrs["habitable"])


def test_mismo_codigo_con_el_uso_en_la_clave_solo_cuenta_la_marcada():
    """Marcar la vivienda no puede arrastrar la piscina: 154 m2, no 176."""
    m = _op85()
    cambios = pipeline.aplicar_seleccion(
        m, ["1/00/01#VIVIENDA", "1/00/02", "1/00/03"])
    assert _m2_que_cuentan(m) == 154.0
    assert m.spaces[3].attrs["habitable"] is False          # la piscina, fuera
    assert not any("no esta en lo que devuelve Catastro" in c for c in cambios)


def test_mismo_codigo_suelto_sigue_contando_todas_y_se_DICE():
    """Lo guardado antes de la clave con uso mide igual que antes, pero lo avisa."""
    m = _op85()
    cambios = pipeline.aplicar_seleccion(m, ["1/00/01", "1/00/02", "1/00/03"])
    assert _m2_que_cuentan(m) == 176.0
    assert any("lo comparten" in c and "DEPORTIVO" in c for c in cambios)


def test_la_clave_con_uso_ignora_tildes_y_mayusculas():
    m = _modelo([_unidad("Almacén", "1", "00", "01"), _unidad("VIVIENDA", "1", "00", "01")])
    pipeline.aplicar_seleccion(m, ["1/00/01#ALMACEN"])
    assert [s.attrs["habitable"] for s in m.spaces] == [True, False]


def test_una_clave_con_uso_que_no_existe_se_AVISA():
    m = _modelo([_unidad("VIVIENDA", "1", "00", "01")])
    cambios = pipeline.aplicar_seleccion(m, ["1/00/01#PISCINA"])
    assert any("1/00/01#PISCINA" in c for c in cambios)


# ---------------------------------------------------------------------------
# Una finca sin NINGUNA vivienda en Catastro (26RES060_184: todo «ALMACEN»)
# ---------------------------------------------------------------------------

def test_sin_ninguna_vivienda_se_mide_el_edificio_entero():
    m = _modelo([_unidad("ALMACEN", "1", "00", "01"), _unidad("ALMACEN", "1", "01", "01")])
    assert not any(s.attrs["habitable"] for s in m.spaces)
    cambios = pipeline.sin_vivienda_mide_todo(m)
    assert cambios and all(s.attrs["habitable"] for s in m.spaces)
    assert all(s.attrs["habitable_por_defecto"] for s in m.spaces)
    assert any("SIN_VIVIENDA_EN_CATASTRO" in str(x) for x in m.diagnostics.messages)


def test_con_alguna_vivienda_no_se_toca_nada():
    m = _modelo([_unidad("VIVIENDA", "1", "01", "01"), _unidad("ALMACEN", "1", "00", "01")])
    antes = [s.attrs.get("habitable") for s in m.spaces]
    assert any(antes)
    assert pipeline.sin_vivienda_mide_todo(m) == []
    assert [s.attrs.get("habitable") for s in m.spaces] == antes
