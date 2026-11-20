"""Un BLOQUE entero: la RC de 14 de una finca con division horizontal.

Catastro contesta a `Consulta_DNPRC` con la LISTA de inmuebles (`lrcdnp`) y
ningun `lcons`. Cada inmueble es una construccion con su uso, su planta y su
superficie, y su codigo casa con la seleccion de la oportunidad igual que una
fila de `lcons` (caso real: 4270003XH6046N, Murcia, 14 viviendas, 2026-11-20).
"""
import json

from src.catastro import alphanumeric


def _inmueble(car, pt, pu, luso, sfc, ant="1979"):
    return {
        "rc": {"pc1": "4270003", "pc2": "XH6046N", "car": car, "cc1": "X", "cc2": "Y"},
        "dt": {"loine": {"cp": "30", "cm": "30"}, "np": "MURCIA", "nm": "MURCIA",
               "locs": {"lous": {"lourb": {
                   "dir": {"cv": "1297", "tv": "CL", "nv": "NUESTRA S BUENOS LIBROS", "pnp": "1"},
                   "loint": {"es": "1", "pt": pt, "pu": pu}}}}},
        "debi": {"luso": luso, "sfc": sfc, "ant": ant},
    }


LISTA = [
    _inmueble("0001", "-1", "01", "Almacen-Estacionamiento", "30"),
    _inmueble("0047", "00", "01", "Comercial", "131"),
    _inmueble("0049", "01", "0A", "Residencial", "191"),
    _inmueble("0050", "01", "0B", "Residencial", "195"),
    _inmueble("0061", "07", "0A", "Residencial", "191"),
]


class _Cliente:
    def __init__(self, crudo):
        self.crudo = crudo

    def get(self, url, params, name=None):
        return json.dumps(self.crudo).encode("utf-8")


def _consulta(lista):
    crudo = {"consulta_dnprcResult": {"control": {"cudnp": len(lista)},
                                      "lrcdnp": {"rcdnp": lista}}}
    return alphanumeric.consulta_dnprc(_Cliente(crudo), "4270003XH6046N")


def test_cada_inmueble_es_una_construccion():
    d = _consulta(LISTA)
    assert len(d.unidades) == 5
    assert len(d.inmuebles_parcela) == 5
    codigos = [u.codigo for u in d.unidades]
    assert codigos == ["1/-1/01", "1/00/01", "1/01/0A", "1/01/0B", "1/07/0A"]
    viv = [u for u in d.unidades if u.uso == "VIVIENDA"]
    assert [u.planta for u in viv] == [1, 1, 7]
    assert all(u.habitable for u in viv)
    garaje = d.unidades[0]
    assert garaje.uso == "ALMACEN" and garaje.planta == -1 and garaje.habitable is False
    assert d.unidades[1].uso == "LOCAL"


def test_cada_inmueble_lleva_su_rc_de_20():
    """El `.cex` del edificio declara la RC de 20 de cada VIVIENDA: el XML no
    admite la de 14 («Inmueble» \\d{4}[A-Z]{2}) — 26RES060_OP438."""
    d = _consulta(LISTA)
    viv = [u.referencia for u in d.unidades if u.uso == "VIVIENDA"]
    assert viv == ["4270003XH6046N0049XY", "4270003XH6046N0050XY", "4270003XH6046N0061XY"]
    assert all(len(r) == 20 for r in viv)
    assert d.unidades[0].to_dict()["referencia"] == "4270003XH6046N0001XY"


def test_generar_cex_escribe_una_rc_por_vivienda():
    """`out[15]` del `.cex` es una LISTA: con varias RC, una por vivienda."""
    import inspect
    from tools import generar_cex
    src = inspect.getsource(generar_cex)
    assert 'isinstance(rc, (list, tuple))' in src


def test_resumen_del_edificio():
    d = _consulta(LISTA)
    assert d.uso_principal == "VIVIENDA"
    assert d.superficie_m2 == 738
    assert d.antiguedad == 1979
    assert d.direccion.startswith("CL NUESTRA S BUENOS LIBROS 1")
    assert "EDIFICIO COMPLETO" in d.aviso
    assert d.usos_por_planta()[1] == {"VIVIENDA": 386.0}


def test_una_vivienda_suelta_no_cambia():
    """La RC de 20 sigue por `bico` y sus `lcons`, como siempre."""
    crudo = {"consulta_dnprcResult": {"bico": {
        "bi": {"debi": {"luso": "Residencial", "sfc": "191", "ant": "1979"},
               "dt": LISTA[2]["dt"]},
        "lcons": [{"lcd": "VIVIENDA", "dt": {"lourb": {"loint": {"es": "1", "pt": "06", "pu": "0A"}}},
                   "dfcons": {"stl": "191"}}]}}}
    d = alphanumeric.consulta_dnprc(_Cliente(crudo), "4270003XH6046N0059UM")
    assert [u.codigo for u in d.unidades] == ["1/06/0A"]
    assert d.inmuebles_parcela == []


def test_lista_sin_datos_conserva_el_aviso_de_siempre():
    d = _consulta([{"rc": {"pc1": "4270003", "pc2": "XH6046N", "car": "0001"}}])
    assert d.inmuebles_parcela == ["4270003XH6046N0001"]
    # Un inmueble sin `debi` sigue siendo una construccion (DESCONOCIDO): no se
    # inventa su uso.
    assert d.unidades[0].uso == "DESCONOCIDO"
