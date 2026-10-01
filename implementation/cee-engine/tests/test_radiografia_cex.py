"""Leer el .cex que entrega un certificador, y ponerle la medida de mejora.

Dos piezas de la revision del CEE (backend `services/cee/revisionCeeCex.js`):

  · `radiografia_cex` saca los HECHOS del fichero —envolvente, equipos, la cola
    con la que CE3X estima la caldera, el deposito y las medidas— sin
    deserializar nada;
  · `/cex/medida` pone la medida del expediente en el fichero del tecnico y NO
    toca nada mas: se comprueba releyendo el resto de pickles.
"""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tools"))

import generar_cex as G        # noqa: E402
import leer_cex as L           # noqa: E402
import radiografia_cex as RX   # noqa: E402
from tests.test_mejora import _geo, _datos   # noqa: E402

PLANTILLA = RAIZ / "assets" / "plantilla-virgen.cex"
ZONA = "Edificio Objeto"

CALDERA = {
    "slot": "mixto2", "nombre": "CALDERA GASOLEO", "generador": "Caldera Estándar",
    "combustible": "Gasóleo-C", "aislamiento": "Antigua con mal aislamiento",
    "rend_combustion": "85", "potencia": "24.0",
    "acumulacion": {"volumen": 100},
    "superficie_acs": 60, "superficie_calefaccion": 60,
}

BOMBA = {
    "slot": "mixto2", "nombre": "AEROTERMIA GENÉRICA 12 kW",
    "generador": "Bomba de Calor - Caudal Ref. Variable", "combustible": "Electricidad",
    "rendimiento": "conocido", "rend_calefaccion": "400", "rend_acs": "300",
    "superficie_calefaccion": 60, "superficie_acs": 60,
}


def _cex_de_certificador() -> bytes:
    """Un .cex «entregado»: envolvente y caldera, SIN medida de mejora."""
    env, _ = G.construir_envolvente(_geo(), _datos(huecos=[
        {"id": "V1", "cerramiento": "FBS1", "ancho": 1.2, "alto": 1.2, "tipo": "Hueco"}]))
    slots, _ = G.construir_instalaciones(
        {"instalaciones": [CALDERA], "envolvente": {"espacio": ZONA}},
        [[] for _ in G.SLOTS], {ZONA})
    return G.montar(PLANTILLA, {G.ENVOLVENTE: env, G.INSTALACIONES: slots})


def test_la_radiografia_lee_la_envolvente_y_la_caldera():
    rx = RX.radiografia_bytes(_cex_de_certificador())
    tipos = {c["tipo"] for c in rx["envolvente"]["cerramientos"]}
    assert {"Fachada", "Cubierta"} <= tipos
    fachada = next(c for c in rx["envolvente"]["cerramientos"] if c["tipo"] == "Fachada")
    assert fachada["u"] == 1.69 and fachada["modo"] == "Conocidas" and fachada["frontera"] == "aire"
    assert rx["envolvente"]["huecos"][0]["nombre"] == "V1"
    assert rx["envolvente"]["puentes"], "los puentes termicos tambien se leen"
    [caldera] = rx["equipos"]
    # La COLA con la que CE3X estima la caldera: solo esta en el .cex.
    assert caldera["caldera"]["rend_combustion"] == 85.0
    assert caldera["caldera"]["aislamiento"] == "Antigua con mal aislamiento"
    # El DEPOSITO de ACS: el .xml no lo declara (medido en 462 certificados).
    assert caldera["acumulacion"]["volumen_l"] == 100.0
    assert caldera["servicios"]["acs"]["pct"] == 100.0
    assert rx["medidas"] == []


def test_la_medida_se_pone_y_no_toca_nada_mas():
    import server
    crudo = _cex_de_certificador()
    ficha = {"medidas": [{"nombre": "AEROTERMIA GENÉRICA 12 kW", "caracteristicas": "Sustitución",
                          "inversion": 12000, "vida_util": 15, "instalaciones": [BOMBA]}]}
    salida, _ = server.poner_medida(crudo, ficha)

    antes, despues = L.trocear_bytes(crudo), L.trocear_bytes(salida)
    for i in (G.ADMINISTRATIVOS, G.GENERALES, G.ENVOLVENTE, G.INSTALACIONES):
        assert G._comparable(L.leer(antes, i)) == G._comparable(L.leer(despues, i)), f"pickle {i} cambiado"

    rx = RX.radiografia_bytes(salida)
    [m] = rx["medidas"]
    assert m["nombre"] == "AEROTERMIA GENÉRICA 12 kW"
    assert m["calculada"] is False          # lo calcula CE3X al pulsar Actualizar
    assert [e["nombre"] for e in m["equipos"]] == ["AEROTERMIA GENÉRICA 12 kW"]
    assert m["equipos"][0]["rend_estacional"]["calefaccion"] == 400.0
    # La caldera se RETIRA en la medida: es una sustitucion.
    assert not any("CALDERA" in e["nombre"] for e in m["equipos"])


def test_una_medida_del_certificador_con_otro_nombre_se_conserva():
    import server
    uno, _ = server.poner_medida(_cex_de_certificador(),
                                 {"medidas": [{"nombre": "MEDIDA A", "instalaciones": [BOMBA]}]})
    dos, avisos = server.poner_medida(uno, {"medidas": [{"nombre": "MEDIDA B", "instalaciones": [BOMBA]}]})
    assert any("MEDIDA A" in a for a in avisos)
    nombres = [m["nombre"] for m in RX.radiografia_bytes(dos)["medidas"]]
    assert nombres == ["MEDIDA B", "MEDIDA A"]


def test_sin_medidas_en_la_ficha_no_se_escribe():
    import pytest
    import server
    with pytest.raises(server.MedidaNoEscrita):
        server.poner_medida(_cex_de_certificador(), {"medidas": []})


def test_el_desfase_se_detecta_si_el_edificio_cambia_despues_de_calcular():
    """Una medida calculada guarda la foto del edificio original. Si no coincide
    con el fichero de hoy, se tocó el edificio DESPUÉS de calcularla."""
    import radiografia_cex as R
    env, _ = G.construir_envolvente(_geo(), _datos())
    gen = ["NBE-CT-79", "Unifamiliar", "Cuenca", "Otro", "D3", "IV", "132", "2.8", "1", "140",
           "Pesada", False, "X", [False, "", ""], False, "Y", "0.83", "", "", "1986", ""]
    actual = {"_generales": gen, "_envolvente": env, "_instalaciones": [[] for _ in G.SLOTS]}
    gen_viejo = list(gen); gen_viejo[6] = "213.93"
    assert R._diferencias_generales(gen_viejo, gen) == ["superficie: 213.93 → 132.0"]
    assert R._diferencias_generales(gen, gen) == []
    assert R._diferencias_envolvente(env, env) == []
    assert actual   # la forma que espera `medida()`
