"""El plan de fotos (§ src/viz/plan_fotos.py).

Lo que se comprueba aqui no es que el PNG quede bonito, sino las tres reglas de
las que depende que la foto sirva para medir:

    una toma = un plano   ·   en patio, una toma por pared   ·   solo habitables
"""
import json

import pytest

from src.viz import plan_fotos


def _muro(ident, subtipo, orientacion, largo, *, planta="PB",
          espacio="VIVIENDA", tipo="FACHADA", x=0.0):
    """Un muro horizontal de `largo` metros, colocado en fila."""
    return {
        "id": ident, "planta": planta, "tipo": tipo, "subtipo": subtipo,
        "espacio_origen": espacio, "orientacion": orientacion, "azimut": 180.0,
        "largo": {"value": largo}, "alto": {"value": 2.8},
        "superficie": {"value": largo * 2.8},
        "geometria_wkt": f"LINESTRING ({x} 0, {x + largo} 0)",
    }


CRUDO = {"consulta_dnprcResult": {"bico": {"bi": {"dt": {"locs": {"lous": {"lourb": {
    "dir": {"tv": "CL", "nv": "MEJICO", "pnp": "4"}}}}}}}}}


# --------------------------------------------------------------------------
# Agrupar
# --------------------------------------------------------------------------

def test_una_tira_de_fachada_se_corta_cuando_cambia_la_orientacion():
    """Dos muros perpendiculares no caben de frente en la misma foto."""
    muros = [_muro("F10", "CALLE", "O", 8.34, x=0),
             _muro("F11", "CALLE", "S", 14.13, x=9)]
    tomas = plan_fotos.agrupar(muros)
    assert len(tomas) == 2
    assert [t["muros"][0]["id"] for t in tomas] == ["F10", "F11"]


def test_dos_muros_seguidos_con_la_misma_orientacion_van_en_una_foto():
    muros = [_muro("F10", "CALLE", "S", 4.0, x=0),
             _muro("F11", "CALLE", "S", 5.0, x=4)]
    tomas = plan_fotos.agrupar(muros)
    assert len(tomas) == 1
    assert [m["id"] for m in tomas[0]["muros"]] == ["F10", "F11"]


def test_en_un_patio_va_una_toma_por_pared():
    """Es justo lo que no se sabe hoy: a que pared pertenece cada foto."""
    muros = [_muro("F02", "PATIO", "N", 4.36, x=0),
             _muro("F03", "PATIO", "E", 3.82, x=5),
             _muro("F04", "PATIO", "S", 5.17, x=10)]
    tomas = plan_fotos.agrupar(muros)
    assert len(tomas) == 3
    assert all(len(t["muros"]) == 1 for t in tomas)


def test_los_muros_de_un_mismo_patio_se_reconocen_por_contiguidad():
    muros = [_muro("F02", "PATIO", "N", 4.0, x=0),
             _muro("F03", "PATIO", "E", 3.0, x=5),
             _muro("F05", "CALLE", "E", 4.3, x=9),
             _muro("F07", "PATIO", "S", 4.3, x=14),
             _muro("F08", "PATIO", "O", 2.06, x=19)]
    tomas = plan_fotos.agrupar(muros)
    patios = [t["patio"] for t in tomas if t["subtipo"] == "PATIO"]
    assert patios == ["F02", "F02", "F07", "F07"]


def test_las_medianeras_no_se_fotografian():
    """No tienen huecos: dan contra el edificio de al lado."""
    muros = [_muro("M01", "EDIFICIO_COLINDANTE", "N", 9.05, tipo="MEDIANERA"),
             _muro("F11", "CALLE", "S", 14.13, x=10)]
    tomas = plan_fotos.agrupar(muros)
    assert [t["muros"][0]["id"] for t in tomas] == ["F11"]


def test_no_se_piden_fotos_de_un_espacio_no_habitable():
    """Las paredes de un almacen no aportan huecos a la envolvente."""
    muros = [_muro("F11", "CALLE", "S", 14.13, espacio="VIVIENDA"),
             _muro("F21", "CALLE", "O", 3.20, planta="P1", espacio="ALMACEN", x=20)]
    tomas = plan_fotos.agrupar(muros, espacios={"VIVIENDA"})
    assert [t["muros"][0]["id"] for t in tomas] == ["F11"]


# --------------------------------------------------------------------------
# El texto y la direccion
# --------------------------------------------------------------------------

def test_la_direccion_sale_corta_no_con_el_municipio_entero():
    """El cliente ya sabe en que pueblo vive."""
    assert plan_fotos._direccion(CRUDO) == "CL MEJICO 4"


def test_la_direccion_tambien_sale_del_modelo_ya_parseado():
    assert plan_fotos._direccion(
        {"inmueble": {"direccion": "CL MEJICO 4 13620 PEDRO MUÑOZ"}}) == "CL MEJICO 4"


def test_sin_datos_de_catastro_no_se_inventa_una_direccion():
    assert plan_fotos._direccion({}) == ""
    assert plan_fotos._direccion(None) == ""


# --------------------------------------------------------------------------
# La salida entera
# --------------------------------------------------------------------------

@pytest.fixture
def plan(tmp_path):
    muros = [_muro("F11", "CALLE", "S", 14.13, x=0),
             _muro("F02", "PATIO", "N", 4.36, x=16),
             _muro("F03", "PATIO", "E", 3.82, x=21)]
    return plan_fotos.generar(tmp_path, muros, CRUDO), tmp_path


def test_cada_toma_sale_con_su_plano_escrito(plan):
    datos, carpeta = plan
    assert len(datos["tomas"]) == 3
    for t in datos["tomas"]:
        assert (carpeta / t["plano"]).is_file()
    assert (carpeta / "plan_fotos.json").is_file()


def test_la_fachada_mas_larga_es_la_que_lleva_el_nombre_de_la_calle(plan):
    datos, _ = plan
    principal = datos["tomas"][0]
    assert "CL MEJICO 4" in principal["subtitulo"]
    assert "CL MEJICO 4" not in datos["tomas"][1]["subtitulo"]


def test_se_empieza_por_la_puerta_de_entrada_y_se_sigue_desde_ahi():
    """Al cliente se le saca de su puerta y se le lleva hacia delante, no se le
    hace empezar por donde le toque a la geometria."""
    muros = [_muro("F01", "PATIO", "N", 3.0, x=0),
             _muro("F02", "CALLE", "E", 4.0, x=4),
             _muro("F03", "CALLE", "S", 14.0, x=9)]     # la principal, la ultima
    tomas = plan_fotos.agrupar(muros)
    principal = max((t for t in tomas if t["subtipo"] == "CALLE"),
                    key=lambda t: t["muros"][0]["largo"]["value"])
    assert [t["muros"][0]["id"] for t in plan_fotos.ordenar(tomas, principal)] ==         ["F03", "F01", "F02"]


def test_cada_toma_ofrece_decir_que_esa_pared_no_tiene_ventanas(plan):
    """No es saltarse el paso: 'no tiene ventanas' es un dato, y de los buenos."""
    datos, _ = plan
    assert datos["boton_sin_ventanas"]
    assert all(t["permite_sin_ventanas"] for t in datos["tomas"])


def test_las_paredes_de_un_patio_van_numeradas(plan):
    """Seis tomas seguidas llamadas igual y el cliente se pierde."""
    datos, _ = plan
    patio = [t for t in datos["tomas"] if t["tipo"] == "PATIO"]
    assert "pared 1 de 2" in patio[0]["titulo"]
    assert "pared 2 de 2" in patio[1]["titulo"]


def test_todas_las_tomas_piden_la_pared_entera_en_LAS_DOS_direcciones(plan):
    """Las dos esquinas dan el ancho; del suelo al tejado da el alto. Con los
    cuatro vertices de un rectangulo de ancho conocido, la rectificacion sale
    en las dos direcciones y no hay que pedir ninguna medida."""
    datos, _ = plan
    for t in datos["tomas"]:
        texto = t["subtitulo"].lower()
        assert "entera" in texto
        assert "tejado" in texto and ("esquina" in texto or "esquinas" in texto)


def test_ninguna_toma_le_pide_al_cliente_medir_con_cinta(plan):
    datos, _ = plan
    for t in datos["tomas"]:
        assert "cinta" not in json.dumps(t, ensure_ascii=False).lower()


def test_cada_toma_lleva_su_ancla_medida_de_catastro(plan):
    """Lo que hace medible la foto: el largo de la pared, MEDIDO por Catastro."""
    datos, _ = plan
    for t in datos["tomas"]:
        assert t["anclas"]["largo_pared_m"] > 0
        assert t["anclas"]["fuente_largo"] == "CATASTRO_WFS_BU"
        assert t["anclas"]["requiere_pared_completa"] is True


def test_el_plan_es_json_valido_para_la_app(plan):
    datos, carpeta = plan
    leido = json.loads((carpeta / "plan_fotos.json").read_text(encoding="utf-8"))
    assert leido["direccion"] == "CL MEJICO 4"
    assert ({"id", "orden", "tipo", "muros", "titulo", "subtitulo",
             "permite_sin_ventanas", "anclas", "plano"}
            <= set(leido["tomas"][0]))


def test_un_subtipo_nuevo_del_clasificador_NO_desaparece_del_plan():
    """El fallo de Los Yebenes (2026-09-11): la lista era BLANCA, asi que
    'ESPACIO_LIBRE_PARCELA' se caia sin decir nada y dejaba 9,87 m de fachada
    fuera. Se excluye por lista NEGRA para que lo nuevo entre por defecto."""
    muros = [_muro("F13", "ESPACIO_LIBRE_PARCELA", "O", 9.87),
             _muro("F99", "UN_SUBTIPO_QUE_AUN_NO_EXISTE", "N", 4.0, x=12)]
    tomas = plan_fotos.agrupar(muros)
    assert [t["muros"][0]["id"] for t in tomas] == ["F13", "F99"]


def test_una_fachada_al_espacio_libre_se_llama_por_su_nombre(tmp_path):
    muros = [_muro("F13", "ESPACIO_LIBRE_PARCELA", "O", 9.87)]
    plan = plan_fotos.generar(tmp_path, muros, CRUDO)
    assert "espacio libre" in plan["tomas"][0]["titulo"]


def test_un_subtipo_desconocido_se_describe_sin_reventar(tmp_path):
    muros = [_muro("F99", "LO_QUE_SEA", "N", 4.0)]
    plan = plan_fotos.generar(tmp_path, muros, CRUDO)
    assert plan["tomas"][0]["titulo"]
    assert "entera" in plan["tomas"][0]["subtitulo"].lower()
