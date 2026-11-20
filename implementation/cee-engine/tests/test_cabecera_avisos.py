"""Los avisos van en una cabecera HTTP: no pueden pasar de MAX_CABECERA.

Un EDIFICIO COMPLETO (4270003XH6046N, 2026-11-20) daba un aviso por pared y el
cliente de Node cortaba la respuesta entera (UND_ERR_HEADERS_OVERFLOW).
"""
import json

import server


def test_repetidos_se_agrupan():
    out = json.loads(server._cabecera_json(["a", "b", "a", "a"]))
    assert out == ["a (x3)", "b"]


def test_lo_que_no_cabe_se_cuenta():
    avisos = [f"aviso numero {i} " + "x" * 200 for i in range(200)]
    texto = server._cabecera_json(avisos)
    assert len(texto) <= server.MAX_CABECERA
    out = json.loads(texto)
    assert out[-1].startswith("... y ") and "no caben" in out[-1]
    assert len(out) < 200


def test_un_objeto_conserva_su_forma():
    out = json.loads(server._cabecera_json([{"campo": "U", "valor": 1}]))
    assert out == [{"campo": "U", "valor": 1}]


def test_es_ascii():
    assert server._cabecera_json(["raya — y comillas «»"]).isascii()
