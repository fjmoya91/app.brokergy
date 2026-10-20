"""Un cuerpo se nombra por DONDE esta, no por el numero que le pone Catastro.

Caso real, 26RES060_226 (9302601VJ7190S): el trabajo se guardo el 09/10/2026
con `cuerpos_fuera: ["…_part3"]`, que entonces era el aparcamiento de 7 m2. El
20/10/2026 el WFS de Catastro sirvio la MISMA parcela dos veces con la
numeracion cambiada (las dos respuestas estan en `fixtures/numeracion_partes`):

    10:54  part1 = 7,10 m2 (aparcamiento)  part2 = 65,50   part3 = 166,47 (casa)
    11:03  part1 = 65,50                   part2 = 166,47  part3 = 7,10

y `_part3` quito la CASA: la planta 1 entera salio como particion y la superficie
cayo de 185 a 59 m2. Aqui se prueba que la clave no depende de esa numeracion,
que lo guardado con la clave se encuentra en cualquier lectura, que un id
antiguo se sigue aceptando pero se DICE, y que las dos senales que delatan el
cambio saltan.
"""
from dataclasses import replace
from pathlib import Path

from shapely.affinity import translate
from shapely.geometry import Polygon

from src.gis import cuerpos as cu
from src.gis import floors as fl
from src.gis.geometry import parse_gml, reproject

FIX = Path(__file__).parent / "fixtures" / "numeracion_partes"


def _partes(fichero):
    out = []
    for f in parse_gml((FIX / fichero).read_bytes(), "BU"):
        if f.geometry is None:
            continue
        g = reproject(f.geometry, f.srs, "EPSG:25830") if f.srs else f.geometry
        out.append(fl.ParteEdificio(
            original_id=f.original_id, geometry=g,
            plantas_sobre_rasante=int(f.attrs.get("numberOfFloorsAboveGround") or 1),
            plantas_bajo_rasante=0, attrs=f.attrs))
    return out


A = "9302601VJ7190S_20261020_1054.gml"
B = "9302601VJ7190S_20261020_1103.gml"


def _por_area(partes):
    return {round(p.geometry.area, 1): p for p in partes}


def test_catastro_renumera_las_partes_entre_dos_lecturas():
    """El hecho que motiva todo: el mismo numero es OTRO cuerpo."""
    a, b = _por_area(_partes(A)), _por_area(_partes(B))
    assert a[166.5].original_id.endswith("_part3")      # la casa
    assert b[7.1].original_id.endswith("_part3")        # el aparcamiento


def test_la_clave_es_la_misma_lea_catastro_en_el_orden_que_lea():
    a, b = _por_area(_partes(A)), _por_area(_partes(B))
    for area in (7.1, 65.5, 166.5):
        assert a[area].clave == b[area].clave
        assert a[area].clave.startswith("ES.SDGC.BU.9302601VJ7190S@")
        assert "_part" not in a[area].clave


def test_lo_guardado_con_la_clave_quita_el_mismo_cuerpo_en_otra_lectura():
    aparcamiento = _por_area(_partes(A))[7.1].clave
    hoy, traduccion = cu.resolver(_partes(B), [aparcamiento])
    assert hoy == [_por_area(_partes(B))[7.1].clave]
    assert traduccion[0]["como"] == "igual"


def test_un_retoque_de_la_cartografia_se_sigue_casando():
    """Catastro corrige un vertice: el centro se mueve unos centimetros."""
    partes = _partes(B)
    guardada = _por_area(partes)[7.1].clave
    movidas = [fl.ParteEdificio(p.original_id, translate(p.geometry, 0.3, -0.2),
                                p.plantas_sobre_rasante, p.plantas_bajo_rasante)
               for p in partes]
    hoy, traduccion = cu.resolver(movidas, [guardada])
    assert traduccion[0]["como"] == "movido"
    assert hoy == [_por_area(movidas)[7.1].clave]


def test_otro_cuerpo_lejos_no_se_toma_por_el_guardado():
    partes = _partes(B)
    x = _por_area(partes)[7.1].clave
    base, coords = x.split("@")
    xx, yy = (float(v) for v in coords.split(","))
    lejos = f"{base}@{xx + 5:.1f},{yy:.1f}"
    hoy, traduccion = cu.resolver(partes, [lejos])
    assert hoy == [] and traduccion[0]["como"] == "no_esta"


def test_un_recorte_no_cambia_la_clave():
    """`recortar_vivienda` hace `replace(p, geometry=…)`: la clave es la de Catastro."""
    p = _por_area(_partes(A))[166.5]
    recortada = replace(p, geometry=p.geometry.buffer(-1.0))
    assert recortada.clave == p.clave


def test_el_id_antiguo_se_acepta_por_el_numero_de_hoy_y_se_dice():
    hoy, traduccion = cu.resolver(_partes(A), ["ES.SDGC.BU.9302601VJ7190S_part3"])
    assert traduccion[0]["como"] == "por_numero"
    assert hoy == [_por_area(_partes(A))[166.5].clave]


def test_los_volumenes_del_proyecto_conservan_su_id():
    p = fl.ParteEdificio("PROYECTO_1", Polygon([(0, 0), (1, 0), (1, 1)]), 1, 0)
    assert p.clave == "PROYECTO_1"


# ---------------------------------------------------------------- sospechas
def _inventario(partes, fuera, habitable):
    """Lo minimo de `cuerpos.inventario` que mira `sospechas`."""
    out = []
    for p in partes:
        out.append({"id": p.clave, "superficie": round(p.geometry.area, 2),
                    "habitable": habitable.get(round(p.geometry.area, 1)),
                    "construccion": {"uso": "VIVIENDA"} if habitable.get(
                        round(p.geometry.area, 1)) else {"uso": "APARCAMIENTO"},
                    "niveles_fuera": [0, 1] if p.clave in fuera else [],
                    "_geom": p.geometry})
    return out


def test_un_numero_que_hoy_es_la_casa_se_avisa():
    partes = _partes(A)
    hoy, traduccion = cu.resolver(partes, ["ES.SDGC.BU.9302601VJ7190S_part3"])
    inv = _inventario(partes, set(hoy), {166.5: True, 65.5: True, 7.1: False})
    avisos = cu.sospechas(inv, traduccion)
    assert any("VIVIENDA de 166.47 m2" in a for a in avisos)


def test_una_zona_dibujada_dentro_del_cuerpo_quitado_se_avisa():
    """El GARAJE guardado el 09/10 cae DENTRO de la casa de hoy."""
    partes = _partes(A)
    hoy, traduccion = cu.resolver(partes, ["ES.SDGC.BU.9302601VJ7190S_part3"])
    garaje = Polygon([(479251.48, 4309941.53), (479250.78, 4309940.55),
                      (479244.15, 4309943.57), (479245.47, 4309946.53),
                      (479251.0, 4309944.08), (479252.76, 4309943.29)])
    inv = _inventario(partes, set(hoy), {})
    avisos = cu.sospechas(inv, traduccion, [{"nivel": 0, "geom": garaje}])
    assert any("DENTRO" in a for a in avisos)


def test_con_la_clave_no_se_sospecha_nada():
    """La clave se eligio viendo el plano: no hay numero que haya podido cambiar."""
    partes = _partes(B)
    casa = _por_area(partes)[166.5].clave
    hoy, traduccion = cu.resolver(partes, [casa])
    inv = _inventario(partes, set(hoy), {166.5: True})
    assert cu.sospechas(inv, traduccion) == []
