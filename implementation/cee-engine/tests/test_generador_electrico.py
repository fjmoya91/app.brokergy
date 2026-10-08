"""CE3X 3.1: las placas de autoconsumo como «Generacion renovable electrica».

En la 3.1 unas placas se declaran con su potencia pico y el autoconsumo MES A
MES (un `models.GeneradorElectrico`, slot 13), no como «Contribucion
energetica» anual. Lo que se vigila:

  · el objeto tiene la forma que escribe CE3X 3.1 (medida sobre «EJEMPLO
    MIGRADO.cex»: claves STRING, nombre y zona UNICODE, meses FLOAT, id uuid);
  · en la 2.3 —y en la 3.1 sin los doce meses— el autoconsumo sigue siendo
    una contribucion, y se dice;
  · una medida lleva el generador en TRES sitios (listado, `datosInstalaciones`
    y la copia de `mejoras`): sin el tercero CE3X 3.1 la calcula a CERO;
  · las placas que YA declara el fichero viajan tambien en sus medidas: sin
    ellas CE3X calcularia la medida sobre una vivienda sin placas.

Medido con el propio CE3X 3.1 (tools/oraculo_ce3x) sobre ese ejemplo: con los
mismos 11.803 kWh, generador y contribucion dan la MISMA calificacion (127,27 C
/ 34,03 D), y la medida de autoconsumo escrita asi calcula el mismo 34,2 % de
ahorro que la contribucion. Sin las placas existentes, una medida que no cambia
nada salia con un -51,9 %; con ellas, 0 %.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tools"))

import generar_cex as G         # noqa: E402
import leer_cex as L            # noqa: E402
import version_ce3x as VC       # noqa: E402
from errores import GeneracionError  # noqa: E402
from tests.test_mejora import _geo, _datos   # noqa: E402

PLANTILLA = RAIZ / "assets" / "plantilla-virgen.cex"
ZONA = "Edificio Objeto"
MESES = [788, 821, 997, 1065, 1170, 1116, 1198, 1181, 1058, 929, 740, 740]
FV = {"slot": "renovable", "nombre": "AUTOCONSUMO FV", "generacion_electrica_kwh": sum(MESES),
      "potencia_pico_kwp": 7.0, "generacion_mensual_kwh": MESES}
CALDERA = {
    "slot": "mixto2", "nombre": "CALDERA GASOLEO", "generador": "Caldera Estándar",
    "combustible": "Gasóleo-C", "aislamiento": "Sin aislamiento",
    "rend_combustion": "79", "potencia": "27.8",
    "superficie_acs": 120, "superficie_calefaccion": 120,
}


def _base() -> list:
    slots, _ = G.construir_instalaciones(
        {"instalaciones": [CALDERA], "envolvente": {"espacio": ZONA}},
        [[] for _ in G.SLOTS], {ZONA})
    return slots


def _cex_31(medidas: list, existentes: list | None = None) -> L.Cex:
    """Un .cex ENTERO de la 3.1 con esas medidas, releido del disco."""
    env, _ = G.construir_envolvente(_geo(), _datos())
    base = _base()
    grupos, filas = [], []
    for m in medidas:
        inst, gens, _ = G.instalaciones_de_medida(m["instalaciones"], base, {ZONA}, "auto", "3.1",
                                                  existentes=existentes)
        g, fila, _ = G.construir_medida(m, env, inst, gens)
        grupos += g
        filas.append(fila)
    nuevos = {G.ENVOLVENTE: env, G.INSTALACIONES: base, G.MEDIDAS: grupos,
              G.RESUMEN_MEDIDAS: G.construir_resumen_medidas(filas, None),
              G.INFORME: [medidas[0]["nombre"], "", "", "Visita", "",
                          ["01", "10", "2026"], ["01", "10", "2026"]]}
    p1 = [""] * 26
    p1[25] = "ARQUITECTO"
    p2 = [""] * 21
    p2[0], p2[1], p2[6], p2[8], p2[19] = "Anterior", "Unifamiliar", "120", "1", "1975"
    nuevos[G.ADMINISTRATIVOS], nuevos[G.GENERALES] = p1, p2
    VC.elevar(nuevos, {}, None)
    return L.trocear_bytes(G.montar(PLANTILLA, nuevos, "residencial", "3.1"))


# ─── El objeto ──────────────────────────────────────────────────────────────

def test_el_generador_tiene_la_forma_de_ce3x_31():
    cex = _cex_31([{"nombre": "AUTOCONSUMO FV", "instalaciones": [FV]}])
    [grupo] = L.leer(cex, G.MEDIDAS)
    [gen] = grupo.estado["listadoGeneradoresElectricoMM"]
    assert gen.origen == "REDUCE" and gen.clase == "copy_reg._reconstructor"
    assert "models.GeneradorElectrico" in repr(gen.args[0])
    st = gen.estado
    assert set(st) == set(G.MESES_GENERADOR) | {"nombre", "zona", "potencia", "tipo",
                                                "consumoMensual", "id"}
    # Las claves, STRING (literales del codigo de CE3X); lo tecleado, UNICODE.
    assert all(isinstance(k, L.Literal) for k in st)
    assert st["nombre"] == "AUTOCONSUMO FV" and not isinstance(st["nombre"], L.Literal)
    assert st["zona"] == ZONA and st["tipo"] is None
    assert st["potencia"] == 7.0
    assert st["consumoMensual"] == [float(m) for m in MESES]
    assert [st[m] for m in G.MESES_GENERADOR] == [float(m) for m in MESES]
    uid = st["id"]
    assert "uuid.UUID" in repr(uid.args[0]) and isinstance(uid.estado["int"], int)


def test_el_id_es_estable_para_los_mismos_datos():
    a = G.generador_electrico(FV, ZONA)
    b = G.generador_electrico(FV, ZONA)
    c = G.generador_electrico({**FV, "potencia_pico_kwp": 6.5}, ZONA)
    ida = lambda g: g.estado[G.Cadena("id")].estado[G.Cadena("int")]
    assert ida(a) == ida(b) and ida(a) != ida(c)


def test_sin_meses_o_sin_potencia_no_hay_generador():
    with pytest.raises(GeneracionError):
        G.generador_electrico({**FV, "generacion_mensual_kwh": MESES[:11]}, ZONA)
    with pytest.raises(GeneracionError):
        G.generador_electrico({**FV, "potencia_pico_kwp": None}, ZONA)


# ─── Que va como generador y que como contribucion ─────────────────────────

def test_en_la_23_el_autoconsumo_sigue_siendo_contribucion():
    resto, gens, avisos = G.separar_generadores([FV], "2.3")
    assert resto == [FV] and gens == [] and avisos == []


def test_en_la_31_con_meses_va_como_generador():
    resto, gens, avisos = G.separar_generadores([FV, CALDERA], "3.1")
    assert gens == [FV] and resto == [CALDERA]
    assert any("Generación renovable eléctrica" in a and "11.803" in a for a in avisos)


def test_en_la_31_sin_meses_se_queda_como_contribucion_y_se_dice():
    sin = {k: v for k, v in FV.items() if k != "generacion_mensual_kwh"}
    resto, gens, avisos = G.separar_generadores([sin], "3.1")
    assert resto == [sin] and gens == []
    assert any("Contribución energética" in a and "PVGIS" in a for a in avisos)


def test_en_la_32_con_meses_va_como_generador():
    resto, gens, avisos = G.separar_generadores([FV, CALDERA], "3.2")
    assert gens == [FV] and resto == [CALDERA]
    assert any("de la 3.2" in a for a in avisos)


def test_en_la_32_sin_meses_no_se_escribe_como_contribucion():
    """Manual de la 3.2, 7.1: la fotovoltaica va en «Generación renovable
    eléctrica», y la pestaña de contribuciones «no debe utilizarse» para ella."""
    for quita in ("generacion_mensual_kwh", "potencia_pico_kwp"):
        sin = {k: v for k, v in FV.items() if k != quita}
        with pytest.raises(G.GeneracionError, match="Generación renovable eléctrica"):
            G.separar_generadores([sin], "3.2")


def test_una_contribucion_de_renovables_no_es_un_generador():
    solar_termica = {"slot": "renovable", "nombre": "SOLAR ACS", "pct_acs": 60,
                     "generacion_electrica_kwh": 0}
    resto, gens, _ = G.separar_generadores([solar_termica], "3.1")
    assert resto == [solar_termica] and gens == []


# ─── La medida ──────────────────────────────────────────────────────────────

def test_la_medida_lleva_el_generador_en_sus_tres_sitios():
    cex = _cex_31([{"nombre": "AUTOCONSUMO FV", "instalaciones": [FV]}])
    [grupo] = L.leer(cex, G.MEDIDAS)
    st = grupo.estado
    [gen] = st["listadoGeneradoresElectricoMM"]
    assert st["listadoGeneradoresTermosolarMM"] == []
    assert len(st["datosInstalaciones"]) == 14 and st["datosInstalaciones"][13] == [gen]
    copia = st["mejoras"][1][1]
    assert len(copia) == 14 and copia[13] == [gen]
    # Es UN objeto: el emisor escribe sus otras apariciones como GET.
    assert st["datosInstalaciones"][13][0] is gen and copia[13][0] is gen
    # Y no se cuela tambien como contribucion.
    assert st["sistemasContribucionesMM"] == []
    assert st["datosInstalaciones"][G.SLOTS.index("renovable")] == []


def test_sin_generadores_la_medida_queda_como_siempre():
    env, _ = G.construir_envolvente(_geo(), _datos())
    inst, gens, _ = G.instalaciones_de_medida([CALDERA], _base(), {ZONA}, "auto", "2.3")
    [g], _, _ = G.construir_medida({"nombre": "X"}, env, inst, gens)
    st = g.estado
    assert gens == [] and len(st[G.Cadena("datosInstalaciones")]) == 12
    assert G.Cadena("listadoGeneradoresElectricoMM") not in st


def test_las_placas_existentes_viajan_en_la_medida():
    existente = G.generador_electrico({**FV, "nombre": "PLACAS EXISTENTES"}, ZONA)
    extra = [[], [existente]]
    assert G.generadores_de_base(extra, "2.3") == []
    exist = G.generadores_de_base(extra, "3.1")
    cex = _cex_31([{"nombre": "MISMA INSTALACION", "instalaciones": [CALDERA]}], existentes=exist)
    [grupo] = L.leer(cex, G.MEDIDAS)
    [gen] = grupo.estado["listadoGeneradoresElectricoMM"]
    assert gen.estado["nombre"] == "PLACAS EXISTENTES"
    assert grupo.estado["mejoras"][1][1][13] == [gen]
