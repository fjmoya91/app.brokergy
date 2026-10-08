"""CE3X 2.3 y CE3X 3.1: el mismo motor escribe las dos versiones.

Lo que se vigila (ver `tools/version_ce3x.py`, de donde salen las formas: se
le preguntaron a la propia 3.1 ejecutando su codigo, y se contrastaron con sus
ejemplos oficiales):

  · la cabecera de cada version y programa, byte a byte;
  · los campos nuevos de datos administrativos (29) y generales (26);
  · los equipos: bloque de potencias antes de la zona y tipo de bomba en la
    cola — salvo la caldera ESTIMADA, que la 3.1 deja como en la 2.3;
  · las placas con su potencia pico;
  · el informe de 8 casillas;
  · que lo que viene de la 3.1 se baja a la forma interna y vuelve INTACTO;
  · que el CEE final de un inicial de la 2.3 sale en la 3.1, y la conversion;
  · que una medida CALCULADA (con referencias circulares) se puede volver a
    escribir, y un objeto que no es de CE3X no.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tools"))

import cee_final as CF          # noqa: E402
import convertir_cex as CX      # noqa: E402
import generar_cex as G         # noqa: E402
import leer_cex as L            # noqa: E402
import pickle0 as P             # noqa: E402
import radiografia_cex as RX    # noqa: E402
import version_ce3x as VC       # noqa: E402
from errores import GeneracionError  # noqa: E402
from tests.test_mejora import _geo, _datos   # noqa: E402

PLANTILLA = RAIZ / "assets" / "plantilla-virgen.cex"
ZONA = "Edificio Objeto"

CALDERA = {
    "slot": "mixto2", "nombre": "CALDERA GASOLEO", "generador": "Caldera Estándar",
    "combustible": "Gasóleo-C", "aislamiento": "Sin aislamiento",
    "rend_combustion": "79", "potencia": "27.8",
    "acumulacion": {"volumen": 100}, "superficie_acs": 120, "superficie_calefaccion": 120,
}
AEROTERMIA = {
    "slot": "mixto2", "nombre": "AEROTERMIA X", "generador": "Bomba de Calor - Caudal Ref. Variable",
    "combustible": "Electricidad", "rendimiento": "conocido", "rend_calefaccion": "434",
    "rend_acs": "300", "superficie_calefaccion": 120, "superficie_acs": 120,
    "potencia_calefaccion": 11, "potencia_acs": 11,
}
TERMO = {
    "slot": "ACS", "nombre": "TERMO ACS", "generador": "Efecto Joule",
    "combustible": "Electricidad", "superficie_acs": 120, "pct_acs": 50,
}
AIRE = {
    "slot": "refrigeracion", "nombre": "AIRE ACONDICIONADO", "generador": "Maquina frigorífica",
    "combustible": "Electricidad", "superficie_refrigeracion": 24, "pct_refrigeracion": 20,
}
PLACAS = {"slot": "renovable", "nombre": "PLACAS SOLARES", "generacion_electrica_kwh": 11000}


def _slots(equipos: list[dict]) -> list:
    slots, _ = G.construir_instalaciones(
        {"instalaciones": equipos, "envolvente": {"espacio": ZONA}},
        [[] for _ in G.SLOTS], {ZONA})
    return slots


def _uno(slots: list, slot: str) -> list:
    [rec] = slots[G.SLOTS.index(slot)]
    return rec


# ─── Cabecera ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("version,tipo,esperado", [
    ("2.3", "residencial", b"S'CEXv2.3 Residencial'\np0\n."),
    ("2.3", "pequeno_terciario", b"S'CEXv2.3 Peque\\xf1oTerciario'\np0\n."),
    ("3.1", "residencial", b"S'CE3Xv3.1 Residencial'\np0\n."),
    ("3.1", "pequeno_terciario", b"S'CE3Xv3.1 Peque\\xf1oTerciario'\np0\n."),
    ("3.1", "gran_terciario", b"S'CE3Xv3.1 GranTerciario'\np0\n."),
    ("3.2", "residencial", b"S'CE3Xv3.2 Residencial'\np0\n."),
    ("3.2", "pequeno_terciario", b"S'CE3Xv3.2 Peque\\xf1oTerciario'\np0\n."),
    ("3.2", "gran_terciario", b"S'CE3Xv3.2 GranTerciario'\np0\n."),
])
def test_la_cabecera_es_la_que_escribe_cada_version(version, tipo, esperado):
    assert VC.cabecera(version, tipo) == esperado
    # Y la reconoce el lector.
    assert VC.de_cabecera(L.reconstruir(esperado, 0)) == (version, tipo)


def test_la_2_3_es_la_misma_cabecera_que_escribia_el_motor():
    for tipo in G.TER.CABECERA:
        assert VC.cabecera("2.3", tipo) == G.TER.CABECERA[tipo]


def test_sin_decir_version_se_escribe_la_vigente_y_una_que_no_existe_se_rechaza():
    assert VC.version_pedida({}) == "3.2"
    assert VC.version_pedida({"version_ce3x": "2.3"}) == "2.3"
    assert VC.version_pedida({"version_ce3x": "3.1"}) == "3.1"
    with pytest.raises(GeneracionError):
        VC.version_pedida({"version_ce3x": "3.0"})


# ─── Listas cerradas ────────────────────────────────────────────────────────

@pytest.mark.parametrize("anio,norma", [
    (1978, "Anterior"), (1980, "NBE-CT-79"), (1997, "NBE-CT-79"),
    (1998, "NBE-CT-79_aPartir1998"), (2006, "NBE-CT-79_aPartir1998"),
    (2007, "C.T.E."), (2013, "C.T.E."), (2014, "CTE 2013"), (2020, "CTE 2013"),
    (2021, "Apartir2020"),
])
def test_la_normativa_de_la_3_1_sale_del_anio(anio, norma):
    assert VC.normativa_31(anio) == norma
    # Y de vuelta a la 2.3 cae en una que la 2.3 conoce.
    assert VC.normativa_23(norma) in ("Anterior", "NBE-CT-79", "C.T.E.", "CTE 2013")


@pytest.mark.parametrize("texto,opcion", [
    ("ARQUITECTO", "Arquitectura"),
    ("GRADUADO EN INGENIERÍA DE LA EDIFICACIÓN. COLEGIADO COAATM Nº 108180",
     "Arquitectura técnica o aparejadores"),
    ("INGENIERO INDUSTRIAL", "Ingeniería Industrial"),
    ("GRADUADO EN INGENIERÍA INDUSTRIAL. COLEGIADO COGITI ALBACETE Nº 1779",
     "Ingeniería Industrial"),
    ("INGENIERO TÉCNICO INDUSTRIAL", "Ingeniería Técnica Industrial"),
    ("Ingeniería Industrial", "Ingeniería Industrial"),
    ("LICENCIADO EN FÍSICA", None),
    ("", None),
])
def test_la_titulacion_se_lleva_al_desplegable_de_la_3_1(texto, opcion):
    assert VC.titulacion_ce3x(texto) == opcion


# ─── Datos administrativos y generales ──────────────────────────────────────

def test_los_administrativos_ganan_proteccion_partes_y_uso():
    p1 = [""] * 26
    p1[25] = "GRADUADO EN INGENIERÍA INDUSTRIAL. COLEGIADO COGITI ALBACETE Nº 1779"
    out, avisos = VC.administrativos_a_31(p1, VC.extra_31({}))
    assert len(out) == 29
    assert out[25] == "Ingeniería Industrial"
    assert out[26:] == ["Ninguna", [], "ResidencialPrivado"]
    assert avisos == []


def test_una_titulacion_que_no_casa_se_avisa_y_no_se_inventa():
    p1 = [""] * 26
    p1[25] = "LICENCIADO EN FÍSICA"
    out, avisos = VC.administrativos_a_31(p1, VC.extra_31({}))
    assert out[25] == "LICENCIADO EN FÍSICA"
    assert avisos and "Otra(.*)" in avisos[0]


def test_los_generales_ganan_los_cinco_campos_que_la_3_1_exige_para_calificar():
    p2 = [""] * 21
    p2[0], p2[6], p2[8], p2[19] = "NBE-CT-79", "221", "2", "2001"
    datos = {"generales": {"superficie_util_habitable": {"valor": 221},
                           "n_plantas_habitables": {"valor": 2},
                           "tipo_edificio": {"valor": "Unifamiliar"}}}
    out, avisos = VC.generales_a_31(p2, VC.extra_31(datos))
    assert len(out) == 26
    # [21] normativa otros · [22] superficie util · [23] unidades de uso ·
    # [24] plantas bajo rasante · [25] sobre rasante (como los ejemplos de la 3.1)
    assert out[21:] == ["", "221", "1", "0", "2"]
    assert out[0] == "NBE-CT-79_aPartir1998"        # por el año, no traducida
    assert avisos == []


def test_la_normativa_elegida_en_la_app_manda_sobre_la_del_anio():
    # Una rehabilitacion integral de 2021 en un edificio de 1965: el tecnico
    # elige «Otros (post 2020)» y no la del año.
    p2 = [""] * 21
    p2[0], p2[6], p2[8], p2[19] = "Anterior", "120", "1", "1965"
    out, _ = VC.generales_a_31(p2, VC.extra_31({"ce3x31": {"normativa": "Otros"}}))
    assert out[0] == "Otros"
    # Una que no es de la 3.1 no se cuela: se decide por el año.
    out, _ = VC.generales_a_31(p2, VC.extra_31({"ce3x31": {"normativa": "NBE-CT-2099"}}))
    assert out[0] == "Anterior"
    # Y al convertir un fichero, igual: lo que diga el expediente manda.
    ext = VC.extra_de_cex([""] * 26, p2, {"ce3x31": {"normativa": "Apartir2020"}})
    assert ext["normativa"] == "Apartir2020"
    assert VC.extra_de_cex([""] * 26, p2)["normativa"] is None


def test_un_bloque_sin_numero_de_viviendas_se_avisa():
    p2 = [""] * 21
    p2[1], p2[6], p2[8], p2[19] = "Bloque de Viviendas", "1293.44", "4", "1960"
    out, avisos = VC.generales_a_31(
        p2, VC.extra_31({"generales": {"tipo_edificio": {"valor": "Bloque de Viviendas"}}}))
    assert out[23] == ""
    assert avisos and "viviendas" in avisos[0]


def test_un_terciario_toma_el_uso_de_su_actividad():
    ext = VC.extra_31({"tipo_edificio_ce3x": "pequeno_terciario",
                       "iluminacion": {"defecto": {"actividad": "Administrativo en general"}}})
    assert ext["uso"] == "Administrativo"


def test_el_uso_sale_de_la_lista_de_SU_programa():
    # Las dos listas de la 3.1 (`listadosWeb`): el terciario NO ofrece
    # «Residencial publico», aunque un hotel lo sea por el RD 390/2021.
    hotel = VC.extra_31({"tipo_edificio_ce3x": "pequeno_terciario",
                         "iluminacion": {"defecto": {"actividad": "Habitaciones de hoteles"}}})
    assert hotel["uso"] == "Otro"
    forzado = VC.extra_31({"tipo_edificio_ce3x": "pequeno_terciario",
                           "ce3x31": {"uso": "ResidencialPublico"}})
    assert forzado["uso"] == "Otro"
    vivienda = VC.extra_31({"ce3x31": {"uso": "ResidencialPublico"}})
    assert vivienda["uso"] == "ResidencialPublico"
    assert VC.extra_31({"ce3x31": {"uso": "Docente"}})["uso"] == "ResidencialPrivado"


def test_las_partes_protegidas_son_las_del_desplegable():
    ext = VC.extra_31({"ce3x31": {"grado_proteccion": "Ambiental",
                                  "partes_protegidas": ["Fachada", "Tejado", "Patio"]}})
    assert ext["grado_proteccion"] == "Ambiental"
    assert ext["partes_protegidas"] == ["Fachada", "Patio"]
    out, _ = VC.administrativos_a_31([""] * 26, ext)
    assert out[26:28] == ["Ambiental", ["Fachada", "Patio"]]


# ─── Equipos ────────────────────────────────────────────────────────────────

def test_una_caldera_estimada_no_cambia_porque_la_3_1_toma_la_potencia_de_su_cola():
    rec = _uno(_slots([CALDERA]), "mixto2")
    out, avisos = VC.equipo_a_31(rec)
    assert out == rec and avisos == []
    assert len(out) == 10


def test_una_aerotermia_gana_su_potencia_y_el_tipo_de_bomba():
    rec = _uno(_slots([AEROTERMIA]), "mixto2")
    out, avisos = VC.equipo_a_31(rec, VC.potencias_de_equipos([AEROTERMIA])["AEROTERMIA X"])
    assert len(out) == 11
    assert out[7] == ["300", "434", "", 1]                # aire-agua
    assert out[9] == ["11", "11", ""] and out[10] == ZONA  # [ACS, cal, ref] antes de la zona
    assert avisos == []


def test_un_termo_sin_potencia_lleva_la_de_un_termo_y_se_dice():
    rec = _uno(_slots([TERMO]), "ACS")
    out, avisos = VC.equipo_a_31(rec)
    assert out[7][-1] == 0                                # no es aerotermia: 0
    assert out[9] == ["1.5", "", ""]
    assert avisos and "1,5 kW" in avisos[0]


def test_la_refrigeracion_no_gana_otro_elemento_en_la_cola():
    rec = _uno(_slots([AIRE]), "refrigeracion")
    out, _ = VC.equipo_a_31(rec)
    assert out[7] == rec[7]                               # ya tenia su cuarto elemento
    assert len(out) == 10 and out[8][2]                    # y si su potencia


def test_las_placas_ganan_su_potencia_pico_estimada_si_no_se_sabe():
    rec = _uno(_slots([PLACAS]), "renovable")
    out, avisos = VC.equipo_a_31(rec)
    assert len(out[3]) == 7 and out[3][6] == "7.3"        # 11.000 / 1.500
    assert avisos and "kWp" in avisos[0]
    out2, avisos2 = VC.equipo_a_31(rec, {"kwp": 7})
    assert out2[3][6] == "7" and avisos2 == []


def test_lo_que_viene_de_la_3_1_se_baja_y_vuelve_intacto():
    slots = _slots([CALDERA, AEROTERMIA, TERMO, AIRE, PLACAS])
    p4_31, _ = VC.instalaciones_a_31(slots, VC.potencias_de_equipos([AEROTERMIA, TERMO]))
    assert len(p4_31) == 14
    interna, meta = VC.instalaciones_a_23(p4_31)
    assert G._comparable(interna) == G._comparable(slots)
    vuelta, avisos = VC.instalaciones_a_31(interna, None, meta)
    assert G._comparable(vuelta) == G._comparable(p4_31)
    assert not any("TERMO" in a for a in avisos)          # su potencia ya estaba


def test_los_equipos_de_la_MEDIDA_tambien_llevan_su_potencia_en_la_3_1():
    """Visto en 2026CEE_58 (05/10/2026): los siete aires de la medida de
    autoconsumo salían en el diálogo de la medida SIN potencia —la del edificio
    base sí la tenía— y CE3X 3.1 no escribe el XML sin ella."""
    env, _ = G.construir_envolvente(_geo(), _datos())
    [g], _, _ = G.construir_medida({"nombre": "AEROTERMIA"}, env, _slots([AEROTERMIA, AIRE]))
    pot = VC.potencias_de_equipos([AEROTERMIA])
    avisos = VC.elevar({G.MEDIDAS: [g]}, {}, pot)
    est = g.estado
    i_mix, i_ref = G.SLOTS.index("mixto2"), G.SLOTS.index("refrigeracion")
    copia = est[P.Cadena("mejoras")][1][1]
    for lista in (est[P.Cadena("sistemasMixto2MM")], est[P.Cadena("datosInstalaciones")][i_mix],
                  copia[i_mix]):
        assert VC.es_31(lista[0]) and lista[0][9] == ["11", "11", ""]
    for lista in (est[P.Cadena("sistemasRefrigeracionMM")], est[P.Cadena("datosInstalaciones")][i_ref],
                  copia[i_ref]):
        assert VC.es_31(lista[0]) and lista[0][8][2]          # su potencia de frío, por defecto
    assert any("AIRE ACONDICIONADO" in a for a in avisos)      # y se dice
    # Dos veces no cambia nada, y a la 2.3 vuelven sin potencias.
    antes = G._comparable(est[P.Cadena("datosInstalaciones")])
    VC.medidas_equipos_a_31([g], pot)
    assert G._comparable(est[P.Cadena("datosInstalaciones")]) == antes
    VC.bajar({G.MEDIDAS: [g]})
    assert not VC.es_31(est[P.Cadena("sistemasMixto2MM")][0])
    assert not VC.es_31(est[P.Cadena("datosInstalaciones")][i_ref][0])


# ─── Ficheros enteros ───────────────────────────────────────────────────────

def _cex_23(con_medida: bool = False) -> bytes:
    env, _ = G.construir_envolvente(_geo(), _datos(huecos=[
        {"id": "V1", "cerramiento": "FBS1", "ancho": 1.2, "alto": 1.2, "tipo": "Hueco"}]))
    base = _slots([CALDERA, PLACAS])
    nuevos = {G.ENVOLVENTE: env, G.INSTALACIONES: base,
              G.INFORME: ["", "", "", "Visita", "", ["01", "09", "2026"], ["01", "09", "2026"]]}
    p1 = [""] * 26
    p1[25] = "ARQUITECTO"
    p2 = [""] * 21
    p2[0], p2[1], p2[6], p2[8], p2[19] = "Anterior", "Unifamiliar", "120", "1", "1975"
    nuevos[G.ADMINISTRATIVOS], nuevos[G.GENERALES] = p1, p2
    if con_medida:
        medida = _slots([AEROTERMIA, PLACAS])
        g, fila, _ = G.construir_medida({"nombre": "AEROTERMIA"}, env, medida)
        nuevos[G.MEDIDAS] = g
        nuevos[G.RESUMEN_MEDIDAS] = G.construir_resumen_medidas([fila], None)
        nuevos[G.INFORME][0] = "AEROTERMIA"
    return G.montar(PLANTILLA, nuevos, "residencial", "2.3")


def test_un_fichero_de_la_3_1_se_monta_y_se_relee():
    crudo = _cex_23()
    base = L.trocear_bytes(crudo)
    nuevos = {i: G._reemitible(L.leer(base, i)) for i in (1, 2, 3, 4, 11)}
    nuevos[G.INSTALACIONES], meta = VC.instalaciones_a_23(nuevos[G.INSTALACIONES])
    VC.elevar(nuevos, VC.extra_de_cex(L.leer(base, 1), L.leer(base, 2)), None, meta)
    salida = G.montar(PLANTILLA, nuevos, "residencial", "3.1")
    cex = L.trocear_bytes(salida)
    assert cex.version == "CE3Xv3.1 Residencial" and cex.version_conocida
    assert len(L.leer(cex, 1)) == 29 and len(L.leer(cex, 2)) == 26
    assert len(L.leer(cex, 4)) == 14 and len(L.leer(cex, 11)) == 8
    assert L.leer(cex, 1)[25] == "Arquitectura"


def test_la_conversion_solo_toca_cabecera_y_los_pickles_que_cambian_de_forma():
    import server
    crudo = _cex_23(con_medida=True)
    salida, avisos, destino = server.convertir(crudo, {})
    antes, despues = L.trocear_bytes(crudo), L.trocear_bytes(salida)
    assert destino == "3.2" and despues.version == "CE3Xv3.2 Residencial"
    for i in (3, 5, 6, 7, 8, 9, 10, 12, 13):
        assert repr(L.leer(antes, i)) == repr(L.leer(despues, i)), f"pickle {i} cambiado"
    p2 = L.leer(despues, 2)
    assert p2[21:] == ["", "120", "1", "0", "1"]
    placas = L.leer(despues, 4)[G.SLOTS.index("renovable")][0]
    assert placas[3][6] == "7.3"
    assert any("2.3" in a for a in avisos)
    # Convertir lo ya convertido no hace nada.
    otra, avisos2, _ = server.convertir(salida, {})
    assert otra == salida and "ya es de CE3X 3.2" in avisos2[0]


def test_de_la_3_1_a_la_3_2_solo_cambia_la_cabecera():
    """La 3.2 guarda la MISMA forma que la 3.1 (medido sobre los ejemplos
    oficiales de las dos, 08/10/2026): pasar de una a otra es la cabecera."""
    import server
    v31, _, _ = server.convertir(_cex_23(con_medida=True), {"version_ce3x": "3.1"})
    assert L.trocear_bytes(v31).version == "CE3Xv3.1 Residencial"
    v32, avisos, destino = server.convertir(v31, {})
    a, b = L.trocear_bytes(v31), L.trocear_bytes(v32)
    assert destino == "3.2" and b.version == "CE3Xv3.2 Residencial"
    for i in range(1, 15):
        assert repr(L.leer(a, i)) == repr(L.leer(b, i)), f"pickle {i} cambiado"
    assert any("solo cambia la cabecera" in x for x in avisos)
    # Y de vuelta, igual.
    otra, _, destino = server.convertir(v32, {"version_ce3x": "3.1"})
    assert destino == "3.1" and otra == v31


def test_las_plantas_sobre_y_bajo_rasante_son_las_del_edificio_entero():
    """Manual de la 3.2, 6.6: las plantas sobre y bajo rasante describen el
    EDIFICIO (de Catastro), aunque se certifique una vivienda de un bloque."""
    ext = VC.extra_31({"generales": {"n_plantas_habitables": {"valor": 1},
                                     "plantas_edificio": {"valor": {"sobre_rasante": 8,
                                                                    "bajo_rasante": 1}}}})
    assert ext["plantas_sobre_rasante"] == "8" and ext["plantas_bajo_rasante"] == "1"
    # Lo que puso el certificador manda; sin Catastro, las habitables y ninguna bajo.
    assert VC.extra_31({"ce3x31": {"plantas_sobre_rasante": 3},
                        "generales": {"plantas_edificio": {"valor": {"sobre_rasante": 8}}}}
                       )["plantas_sobre_rasante"] == "3"
    sin = VC.extra_31({"generales": {"n_plantas_habitables": {"valor": 2}}})
    assert sin["plantas_sobre_rasante"] == "2" and sin["plantas_bajo_rasante"] == "0"


def test_se_puede_volver_a_la_2_3_si_no_se_pierde_nada():
    import server
    salida, _, _ = server.convertir(_cex_23(con_medida=True), {})
    vuelta, _, destino = server.convertir(salida, {"version_ce3x": "2.3"})
    cex = L.trocear_bytes(vuelta)
    assert destino == "2.3" and cex.version == "CEXv2.3 Residencial"
    assert len(L.leer(cex, 1)) == 26 and len(L.leer(cex, 2)) == 21
    assert len(L.leer(cex, 4)) == 12 and len(L.leer(cex, 11)) == 7


def test_el_final_de_un_inicial_de_la_2_3_sale_en_la_3_1_con_la_potencia_del_expediente():
    crudo = _cex_23(con_medida=True)
    salida, analisis, avisos = CF.componer(crudo, {
        "equipos_expediente": [
            {"servicio": "calefaccion", "nombre": "AEROTERMIA X", "rend": 434, "potencia": 9},
            {"servicio": "acs", "nombre": "AEROTERMIA X", "rend": 300, "potencia": 9}],
        "informe": {"fecha_emision": "2026-10-02", "fecha_visita": "2026-10-02"}})
    assert analisis["version_inicial"] == "2.3" and analisis["version_final"] == "3.2"
    cex = L.trocear_bytes(salida)
    assert cex.version == "CE3Xv3.2 Residencial"
    p4 = L.leer(cex, 4)
    [aero] = p4[G.SLOTS.index("mixto2")]
    assert aero[9] == ["9", "9", ""] and aero[7][-1] == 1
    assert len(L.leer(cex, 11)) == 8 and L.leer(cex, 11)[5] == ["02", "10", "2026"]


def test_el_final_en_la_2_3_sigue_siendo_la_medida_tal_cual():
    crudo = _cex_23(con_medida=True)
    salida, _, _ = CF.componer(crudo, {"version_ce3x": "2.3"})
    assert L.trocear_bytes(salida).version == "CEXv2.3 Residencial"
    assert len(L.leer(L.trocear_bytes(salida), 4)) == 12


def test_la_radiografia_dice_la_version_y_lee_lo_nuevo_de_la_3_1():
    import server
    salida, _, _ = server.convertir(_cex_23(), {})
    rx = RX.radiografia_bytes(salida)
    assert rx["version_ce3x"] == "3.2"
    assert rx["generales"]["superficie_util"] == 120.0
    assert rx["generales"]["plantas_sobre_rasante"] == 1.0
    [caldera] = rx["equipos"]
    assert caldera["caldera"]["potencia_kw"] == 27.8    # la caldera, igual que en la 2.3
    assert caldera["potencia_kw"] is None                # no lleva bloque nuevo


def test_poner_la_medida_respeta_la_version_del_fichero():
    import server
    salida, _, _ = server.convertir(_cex_23(), {})
    con_medida, _ = server.poner_medida(salida, {"medidas": [
        {"nombre": "AEROTERMIA", "instalaciones": [AEROTERMIA]}]})
    cex = L.trocear_bytes(con_medida)
    assert cex.version == "CE3Xv3.2 Residencial"
    assert len(L.leer(cex, 4)) == 14              # la instalacion, intacta
    assert [m["nombre"] for m in RX.radiografia_bytes(con_medida)["medidas"]] == ["AEROTERMIA"]


# ─── Volver a escribir lo que ya habia ──────────────────────────────────────

def _grupo_calculado() -> P.Instancia:
    """Un grupo de medidas con la foto del edificio CALCULADA: dentro, una
    contribucion que apunta a la lista que la contiene (un ciclo, como en
    CE3X), y un objeto de la 3.1 escrito con REDUCE (el generador electrico)."""
    listado = P.Instancia("datosEdificio", "ListadoContribucionesEnergeticas", None, compartible=True)
    contrib = P.Instancia("datosEdificio", "ContribucionesEnergeticas",
                          P.Dicc({P.Cadena("objListado"): listado,
                                  P.Cadena("tipo"): P.CadenaLeida("Gasóleo-C")}),
                          compartible=True)
    listado.estado = P.Dicc({P.Cadena("listado"): P.Lista([contrib])})
    uuid = P.Reduccion("copy_reg", "_reconstructor",
                       (P.Global("uuid", "UUID"), P.Global("__builtin__", "object"), None),
                       P.Dicc({P.Cadena("int"): 68124685577076213805337067081419505125}))
    gen = P.Reduccion("copy_reg", "_reconstructor",
                      (P.Global("models", "GeneradorElectrico"), P.Global("__builtin__", "object"), None),
                      P.Dicc({P.Cadena("nombre"): "AUTOCONSUMO FV", P.Cadena("potencia"): 7.0,
                              P.Cadena("id"): uuid}))
    resultados = P.Instancia("datosEdificio", "datosEdificioIniciales",
                             P.Dicc({P.Cadena("contribuciones"): listado}), compartible=True)
    return P.Instancia("MedidasDeMejora.objetoGrupoMejoras", "grupoMedidasMejora", P.Dicc({
        P.Cadena("nombre"): "SU MEDIDA",
        P.Cadena("ahorro"): [9.7, 21.9, 9.7, 21.9, 0.0, 13.9],
        P.Cadena("datosNuevoEdificio"): resultados,
        P.Cadena("listadoGeneradoresElectricoMM"): P.Lista([gen]),
    }), compartible=True)


def test_un_grupo_con_ciclos_y_objetos_de_la_3_1_se_relee_y_se_reescribe_igual():
    texto = P.volcar([_grupo_calculado()])
    import re
    assert re.search(r"\ng\d+\n", texto), "la vuelta del ciclo tiene que ser un GET"
    assert "ccopy_reg\n_reconstructor\n" in texto
    assert "S'Gas\\xf3leo-C'" in texto                 # el literal, como Python 2
    leido = L.reconstruir(texto.encode("latin-1"), 0)
    [g] = leido
    contrib = g.estado["datosNuevoEdificio"].estado["contribuciones"].estado["listado"][0]
    assert contrib.estado["objListado"] is g.estado["datosNuevoEdificio"].estado["contribuciones"]
    assert isinstance(contrib.estado["tipo"], L.Literal)
    # Reescribir lo leido da EXACTAMENTE el mismo texto.
    assert P.volcar(G._reemitible(leido)) == texto


def test_poner_la_medida_conserva_una_medida_calculada_del_tecnico():
    """Antes moria con un RecursionError: la medida calculada tiene ciclos."""
    import server
    crudo = _cex_23()
    con_suya = G.montar(PLANTILLA, {
        **{i: G._reemitible(L.leer(L.trocear_bytes(crudo), i)) for i in (1, 2, 3, 4, 11)},
        G.MEDIDAS: [_grupo_calculado()]}, "residencial", "2.3")
    salida, avisos = server.poner_medida(con_suya, {"medidas": [
        {"nombre": "AEROTERMIA", "instalaciones": [AEROTERMIA]}]})
    nombres = [str(g.estado.get("nombre")) for g in L.leer(L.trocear_bytes(salida), 5)]
    assert nombres == ["AEROTERMIA", "SU MEDIDA"]
    assert any("SU MEDIDA" in a for a in avisos)


def test_un_objeto_que_no_es_de_CE3X_no_se_reescribe():
    malo = L.Opaco(clase="os.system", args=("calc",), origen="REDUCE")
    with pytest.raises(GeneracionError):
        G._reemitible([malo])
    with pytest.raises(P.Pickle0Error):
        P.volcar(P.Reduccion("os", "system", ("calc",)))


def test_no_se_baja_a_la_2_3_lo_que_la_2_3_no_sabe_abrir():
    import server
    salida, _, _ = server.convertir(_cex_23(), {})
    base = L.trocear_bytes(salida)
    p4 = G._reemitible(L.leer(base, 4))
    p4[13] = P.Lista([_grupo_calculado().estado[P.Cadena("listadoGeneradoresElectricoMM")][0]])
    con_gen = G.montar(PLANTILLA, {**{i: G._reemitible(L.leer(base, i)) for i in (1, 2, 3, 11)},
                                   G.INSTALACIONES: p4}, "residencial", "3.1")
    with pytest.raises(GeneracionError, match="2.3"):
        server.convertir(con_gen, {"version_ce3x": "2.3"})
    # En la 3.1 el generador viaja intacto al hacer el final.
    rx = RX.radiografia_bytes(con_gen)
    assert rx["generadores_electricos"][0]["nombre"] == "AUTOCONSUMO FV"
    cambios: dict = {}
    CX.a_version(L.trocear_bytes(con_gen), cambios, "3.1")
    assert cambios == {}              # misma version y nada que escribir: no se toca


# ── Los textos del informe en la 3.1 (2026-10-02) ───────────────────────────
# CE3X 3.1 mete el texto en el XML como `data:text/html,<h1>…</h1>` y el PDF
# junta todo en un parrafo si no lleva `<br>` (medido con xml2cert).

def test_en_la_3_1_cada_salto_de_linea_lleva_su_br():
    inf = VC.informe_a_31(["", "", "", "Visita:\n-Uno\r\n-Dos", "", [], []], "Reco:\n-A")
    assert len(inf) == 8
    assert inf[3] == "Visita:<br>\n-Uno<br>\n-Dos"
    assert inf[7] == "Reco:<br>\n-A"
    # Aplicarlo dos veces no duplica los <br>.
    assert VC.informe_a_31(inf, "otra") == inf


def test_las_recomendaciones_del_tecnico_mandan():
    inf = VC.informe_a_31(["", "", "", "x", "", [], [], "Las suyas"], "Las de la app")
    assert inf[7] == "Las suyas"


def test_en_la_2_3_no_hay_br_ni_recomendaciones():
    inf = VC.informe_a_23(["", "", "", "Visita:<br>\n-Uno", "", [], [], "Reco"])
    assert inf == ["", "", "", "Visita:\n-Uno", "", [], []]


def test_las_recomendaciones_llegan_de_la_ficha_al_fichero():
    datos = {"informe": {"recomendaciones": "Reco:\n-A"}}
    assert VC.extra_31(datos)["recomendaciones"] == "Reco:\n-A"
    cambios: dict = {}
    CX.a_version(L.trocear_bytes(_cex_23()), cambios, "3.1", datos)
    assert cambios[G.INFORME][7] == "Reco:<br>\n-A"
    assert cambios[G.INFORME][3] == "Visita"


# ── La «Propuesta de secuencia temporal» (Anexo III, 3) en la 3.1 ────────────

def _grupo(nombre: str):
    return P.Instancia("MedidasDeMejora.objetoGrupoMejoras", "grupoMedidasMejora",
                       {P.Cadena("nombre"): nombre})


def test_las_medidas_llevan_su_orden_y_su_justificacion_en_la_3_1():
    grupos = [_grupo("AUTOCONSUMO"), _grupo("AEROTERMIA"), _grupo("CUBIERTA")]
    datos = {"medidas": [
        {"nombre": "AUTOCONSUMO", "justificacion": "Ultima.", "secuencia": 3},
        {"nombre": "AEROTERMIA", "justificacion": "Linea 1\nLinea 2", "secuencia": 2},
        {"nombre": "CUBIERTA", "justificacion": "Primera.", "secuencia": 1},
    ]}
    VC.medidas_a_31(grupos, VC.extra_31(datos)["justificaciones"])
    orden = {str(g.estado[P.Cadena("nombre")]): g.estado[P.Cadena("ordenPrioridad")] for g in grupos}
    assert orden == {"CUBIERTA": "1", "AEROTERMIA": "2", "AUTOCONSUMO": "3"}
    just = grupos[1].estado[P.Cadena("justificacion")]
    assert just == "AEROTERMIA: Linea 1<br>\nLinea 2<br>"


def test_lo_que_ya_trae_el_conjunto_manda_y_en_la_2_3_no_se_escribe():
    g = _grupo("SUYA")
    g.estado[P.Cadena("ordenPrioridad")] = "4"
    g.estado[P.Cadena("justificacion")] = "La del tecnico"
    VC.medidas_a_31([g], {"SUYA": ("La de la app", 1)})
    assert g.estado[P.Cadena("ordenPrioridad")] == "4"
    assert g.estado[P.Cadena("justificacion")] == "La del tecnico"
    VC.medidas_a_23([g])
    assert {str(k) for k in g.estado} == {"nombre"}
