"""Delimitar a mano la VIVIENDA dentro de una hilera de adosados.

EL CASO QUE LO JUSTIFICA — 3677802WJ3437F (26RES060_205): la parcela es la
comunidad entera, dos hileras de adosados con su calle privada, y Catastro no
dibuja donde acaba cada casa. El motor medía el bloque entero (188 paredes) y
no habia forma de cerrar la vivienda: la linea que la separa de la de al lado no
existe en el modelo.

Aqui: una hilera de TRES casas de 10 x 10 como UN BuildingPart de dos plantas,
con la de la derecha de UNA sola planta en la primera (el diente de la hilera).
Se delimita la del medio.
"""
import pytest
from shapely.geometry import Polygon

from src import pipeline
from src.gis.floors import ParteEdificio
from src.model import Modelo, Objeto
from src.pipeline import Opciones, RecorteInvalido, analizar, recortar_vivienda


def rect(x0, y0, ancho, alto):
    return Polygon([(x0, y0), (x0 + ancho, y0),
                    (x0 + ancho, y0 + alto), (x0, y0 + alto)])


# Planta baja: las tres casas (0..30). Primera: solo las dos primeras (0..20).
BAJA = ParteEdificio("p_baja", rect(0, 0, 30, 10), 1, 0)
ALTA = ParteEdificio("p_alta", rect(0, 0, 20, 10), 2, 0)
#: el contorno que dibuja el certificador: la casa del medio, SOBRESALIENDO por
#: la calle y por el jardin (se dibuja a ojo, y lo que sobra no cuenta).
CONTORNO = [(10, -3), (20, -3), (20, 13), (10, 13)]


def _modelo():
    m = Modelo(refcat_parcela="X", refcat_inmueble=None, crs="EPSG:25830")
    m.partes = [BAJA, ALTA]
    m.buildings = [Objeto(source="T", original_id=None, geometry=rect(0, 0, 30, 10),
                          area=300.0, use=None, floor=None, confidence=1.0)]
    return m


def _elementos(tmp_path, recorte=CONTORNO):
    m = _modelo()
    recortar_vivienda(m, recorte)
    o = Opciones(refcat="X", output=tmp_path / "o", data=tmp_path / "d",
                 cache=tmp_path / "c", skip_lidar=True)
    return m, analizar(o, m).elementos


def _vertical(els, nivel, x):
    """El cerramiento vertical de `nivel` que cae sobre la linea x = `x`."""
    from shapely import wkt
    for e in els:
        if e.nivel != nivel or e.largo is None or not e.geometria_wkt:
            continue
        g = wkt.loads(e.geometria_wkt)
        xs = [c[0] for c in g.coords] if hasattr(g, "coords") else []
        if xs and all(abs(v - x) < 0.01 for v in xs):
            return e
    return None


def test_la_huella_es_la_de_la_casa_y_no_la_del_bloque(tmp_path):
    m, _ = _elementos(tmp_path)
    assert [(p.nivel, round(p.area_m2)) for p in m.floors] == [(0, 100), (1, 100)]
    assert m.huella().area == pytest.approx(100.0)
    assert any("RECORTE_VIVIENDA" in d for d in m.diagnostics.messages)


def test_contra_la_casa_de_al_lado_es_medianera(tmp_path):
    _, els = _elementos(tmp_path)
    oeste = _vertical(els, 0, 10)
    este = _vertical(els, 0, 20)
    assert oeste is not None and oeste.tipo == "MEDIANERA"
    assert este is not None and este.tipo == "MEDIANERA"


def test_la_calle_y_el_jardin_siguen_siendo_fachada(tmp_path):
    _, els = _elementos(tmp_path)
    fachadas = [e for e in els if e.nivel == 0 and e.tipo == "FACHADA"]
    assert len(fachadas) == 2
    assert sum(e.largo.value for e in fachadas) == pytest.approx(20.0)


def test_en_la_primera_la_casa_de_al_lado_no_llega_y_esa_pared_da_al_aire(tmp_path):
    """Por NIVEL: la casa de la derecha solo tiene planta baja, asi que la pared
    este de la primera planta de esta no es medianera."""
    _, els = _elementos(tmp_path)
    assert _vertical(els, 1, 10).tipo == "MEDIANERA"
    assert _vertical(els, 1, 20).tipo == "FACHADA"


def test_sin_contorno_no_se_toca_nada():
    m = _modelo()
    assert recortar_vivienda(m, None) is None
    assert m.recorte is None and len(m.partes) == 2


@pytest.mark.parametrize("malo", [
    [(0, 0), (1, 0)],                          # dos puntos
    [(0, 0), (1, 0), (1, 1), (0, 1)],          # 1 m2: un clic de mas
    [(100, 100), (120, 100), (120, 120)],      # no toca el edificio
    [("a", 0), (1, 0), (1, 1)],                # no son numeros
])
def test_un_contorno_que_no_sirve_se_rechaza_con_su_motivo(malo):
    with pytest.raises(RecorteInvalido):
        recortar_vivienda(_modelo(), malo)


def test_los_cuerpos_se_recortan_con_ella():
    """Quitar el garaje de una casa delimitada tiene que seguir funcionando: los
    BuildingParts quedan recortados al contorno."""
    m = _modelo()
    recortar_vivienda(m, CONTORNO)
    assert sorted(round(p.geometry.area) for p in m.partes) == [100, 100]
    assert pipeline.excluir_cuerpos(m, None) == []
