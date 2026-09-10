"""El recorrido completo sobre geometria sintetica conocida (§21, §23).

Se ejercita RC -> "Catastro" (fixture) -> GML -> geometria -> clasificacion ->
CSV/JSON/plano/mapa, y se comprueba el resultado que se conoce de antemano.
"""
import csv
import json
from pathlib import Path

import pytest

from src.catastro import refcat
from src.catastro.client import CatastroClient, CatastroUnreachable
from src.model import Modelo
from src.pipeline import Opciones, analizar, construir_modelo, descargar, escribir_salidas

FIXTURE = Path(__file__).parent / "fixtures" / "sintetico"
RC = "9999999XX9999X"


@pytest.fixture(scope="module")
def corrida(tmp_path_factory):
    base = tmp_path_factory.mktemp("run")
    o = Opciones(refcat=RC, output=base / "output", data=base / "data",
                 cache=base / "cache", skip_lidar=True, fixture_dir=FIXTURE)
    rc = refcat.parse(RC)
    modelo = Modelo(rc.parcela, rc.inmueble, o.crs_metrico)
    feats = descargar(o, rc, modelo)
    construir_modelo(o, rc, feats, modelo)
    res = analizar(o, modelo)
    ficheros = escribir_salidas(o, res, rc)
    return res, ficheros, base


def _por_id(res):
    return {e.id: e for e in res.elementos}


def test_se_generan_los_cuatro_entregables(corrida):
    _, ficheros, _ = corrida
    for k in ("ce3x_geometry.csv", "ce3x_geometry.json", "geometry_debug.png",
              "debug_map.html"):
        assert Path(ficheros[k]).exists() and Path(ficheros[k]).stat().st_size > 0


def test_la_medianera_parcial_de_la_planta_baja(corrida):
    """El vecino del Este ocupa 6 de los 10 m -> 6 medianera + 4 fachada."""
    res, _, _ = corrida
    pb_este = [e for e in res.elementos
               if e.planta == "PB" and e.orientacion == "E" and e.ring == "exterior"]
    med = [e for e in pb_este if e.tipo == "MEDIANERA"]
    fac = [e for e in pb_este if e.tipo == "FACHADA"]
    assert [e.largo.value for e in med] == [pytest.approx(6.0)]
    assert [e.largo.value for e in fac] == [pytest.approx(4.0)]


def test_en_la_primera_planta_ese_muro_ya_no_es_medianera(corrida):
    """El vecino del Este solo tiene planta baja: arriba da al aire."""
    res, _, _ = corrida
    p1_este = [e for e in res.elementos
               if e.planta == "P1" and e.orientacion == "E" and e.ring == "exterior"]
    assert all(e.tipo != "MEDIANERA" for e in p1_este)
    assert any(e.subtipo == "SOBRE_CUBIERTA_INFERIOR" for e in p1_este)


def test_la_medianera_del_oeste_si_llega_a_la_primera(corrida):
    res, _, _ = corrida
    oeste = [e for e in res.elementos if e.orientacion == "O" and e.tipo == "MEDIANERA"]
    assert {e.planta for e in oeste} == {"PB", "P1"}
    assert all(e.largo.value == pytest.approx(10.0) for e in oeste)


def test_el_patio_sale_como_fachada_a_patio_y_no_como_medianera(corrida):
    res, _, _ = corrida
    patio = [e for e in res.elementos if e.subtipo == "PATIO"]
    assert len(patio) == 8                                    # 4 lados x 2 plantas
    assert sum(e.largo.value for e in patio) == pytest.approx(20.0)
    assert all(e.tipo == "FACHADA" for e in patio)


def test_vivienda_sobre_espacio_no_habitable(corrida):
    res, _, _ = corrida
    ph = [e for e in res.elementos
          if e.subtipo == "ESPACIO_NO_HABITABLE_INFERIOR" and e.planta == "P1"]
    assert len(ph) == 1
    assert ph[0].espacio_origen == "VIVIENDA" and ph[0].espacio_destino == "ALMACEN"
    assert ph[0].superficie.value == pytest.approx(74.0)


def test_cubierta_parcial_sobre_la_parte_de_una_planta(corrida):
    res, _, _ = corrida
    cub_pb = [e for e in res.elementos if e.tipo == "CUBIERTA" and e.planta == "PB"]
    assert len(cub_pb) == 1 and cub_pb[0].superficie.value == pytest.approx(40.0)


def test_suelo_en_contacto_con_terreno(corrida):
    res, _, _ = corrida
    su = [e for e in res.elementos if e.tipo == "SUELO"]
    assert len(su) == 1 and su[0].subtipo == "TERRENO"
    assert su[0].superficie.value == pytest.approx(114.0)


def test_el_csv_lleva_las_columnas_pedidas_y_el_largo_por_alto(corrida):
    _, ficheros, _ = corrida
    with open(ficheros["ce3x_geometry.csv"], encoding="utf-8") as fh:
        filas = list(csv.DictReader(fh, delimiter=";"))
    for col in ("ID", "planta", "tipo", "subtipo", "contacto", "espacio_origen",
                "espacio_destino", "largo_m", "alto_m", "largo_x_alto",
                "superficie_m2", "orientacion", "azimut", "fuente_largo",
                "fuente_alto", "confianza", "requiere_revision"):
        assert col in filas[0]
    f01 = next(f for f in filas if f["ID"] == "F01")
    assert f01["largo_x_alto"] == "12.00 x 2.70"
    assert float(f01["superficie_m2"]) == pytest.approx(12.0 * 2.70)


def test_la_altura_por_defecto_va_marcada_como_no_medida(corrida):
    """Sin LiDAR la superficie de muro es provisional, y tiene que decirlo."""
    res, ficheros, _ = corrida
    f01 = _por_id(res)["F01"]
    assert f01.alto.evidence_type.value == "MANUAL"
    assert f01.alto.source.value == "DEFAULT"
    assert f01.requiere_revision is True
    assert "ALTO NO MEDIDO" in f01.nota
    assert f01.largo.evidence_type.value == "MEASURED"


def test_el_json_conserva_la_procedencia_de_cada_medida(corrida):
    _, ficheros, _ = corrida
    doc = json.loads(Path(ficheros["ce3x_geometry.json"]).read_text(encoding="utf-8"))
    e = doc["elementos"][0]
    for campo in ("largo", "alto", "superficie"):
        assert set(e[campo]) >= {"value", "source", "confidence", "evidence_type"}
    assert doc["referencia_catastral"]["refcat_parcela"] == RC


def test_se_dice_que_catastro_no_da_el_poligono_de_cada_uso(corrida):
    """§6/§22: lo que no se puede obtener se documenta, no se aproxima."""
    res, _, _ = corrida
    assert "SPACE_GEOMETRY_UNAVAILABLE" in res.modelo.diagnostics.codes
    sin_geom = [s for s in res.modelo.spaces if s.geometry is None]
    assert sin_geom and all(s.use for s in sin_geom)


def test_sin_fixture_y_sin_red_falla_claro_y_no_inventa(tmp_path):
    c = CatastroClient(cache_dir=tmp_path, offline=True)
    with pytest.raises(CatastroUnreachable):
        c.get("https://ovc.catastro.meh.es/x", {"a": 1}, name="lo_que_sea")


def test_la_cache_evita_volver_a_pedir(tmp_path):
    c = CatastroClient(cache_dir=tmp_path, fixture_dir=FIXTURE)
    a = c.get("https://x/", name=f"parcela_{RC}")
    b = c.get("https://x/", name=f"parcela_{RC}")
    assert a == b and len(c.calls) == 2 and all(x["from_cache"] for x in c.trace())


def test_el_mapa_reproyecta_bien(corrida):
    """El mapa va en WGS84 y el CSV en UTM: si el orden de ejes se cuela, el
    edificio aparece en el golfo de Guinea y el CSV no se entera de nada."""
    import re
    from pyproj import Transformer

    res, ficheros, _ = corrida
    html = Path(ficheros["debug_map.html"]).read_text(encoding="utf-8")
    polis = re.findall(r"L\.polyline\(\s*(\[\[[^\]]*\][^;]*?\]),", html)
    assert len(polis) == len([e for e in res.elementos if e.largo.available])

    t = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
    largos = []
    for p in polis:
        pts = json.loads(p)
        (y1, x1), (y2, x2) = pts[0], pts[-1]
        X1, Y1 = t.transform(x1, y1)
        X2, Y2 = t.transform(x2, y2)
        largos.append(round(((X2 - X1) ** 2 + (Y2 - Y1) ** 2) ** 0.5, 2))
    esperados = sorted(round(e.largo.value, 2) for e in res.elementos if e.largo.available)
    for a, b in zip(sorted(largos), esperados):
        assert a == pytest.approx(b, abs=0.02)


def test_el_mapa_y_el_plano_rotulan_con_el_id_del_csv(corrida):
    """Si el mapa dice PB-S003_1 y el CSV dice M01, no se pueden cruzar."""
    res, ficheros, _ = corrida
    html = Path(ficheros["debug_map.html"]).read_text(encoding="utf-8")
    ids = {e.id for e in res.elementos if e.largo.available}
    for eid in sorted(ids):
        assert f"\\u003e{eid}\\u003cbr\\u003e" in html or f">{eid}<br>" in html


def test_hay_una_capa_conmutable_por_planta(corrida):
    res, ficheros, _ = corrida
    html = Path(ficheros["debug_map.html"]).read_text(encoding="utf-8")
    for planta in {e.planta for e in res.elementos if e.largo.available}:
        assert f"Cerramientos - Planta {planta}" in html
