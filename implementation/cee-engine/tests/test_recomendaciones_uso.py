"""Las RECOMENDACIONES DE USO (Anexo III, 1) van SIEMPRE en un .cex de la 3.1.

Decision del usuario (07/10/2026): el inicial de 26RES080_87, convertido de la
2.3 a la 3.1, salio con el apartado 1 del Anexo III en blanco. Solo las ponia la
app al GENERAR el .cex; al convertir uno ya hecho, al hacer el previsto o al
poner una medida en el del tecnico, la casilla se quedaba vacia.

    python -m pytest tests/test_recomendaciones_uso.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tools"))

import convertir_cex as CX      # noqa: E402
import editar_cex as E          # noqa: E402
import generar_cex as G         # noqa: E402
import leer_cex as L            # noqa: E402
import version_ce3x as VC       # noqa: E402
from tests.test_version_ce3x import _cex_23   # noqa: E402

JS = (RAIZ.parent / "frontend" / "src" / "features" / "expedientes" / "logic" / "ce3xTextos.js")
REC = VC.INFORME_RECOMENDACIONES


def _texto_js(const: str) -> str:
    m = re.search(const + r" = `(.*?)`;", JS.read_text(encoding="utf-8"), re.S)
    assert m, f"no encuentro {const} en ce3xTextos.js"
    return m.group(1)


#: La imagen del motor se construye SOLO con implementation/cee-engine (y corre
#: estos tests): ahí el fichero del navegador no existe, y sin esto el build —y
#: con él deploy.sh entero— moriría con FileNotFoundError. La vigilancia sigue
#: viva en el repo, que es donde se toca uno de los dos ficheros.
@pytest.mark.skipif(not JS.exists(),
                    reason="el fichero del navegador no esta en este arbol (imagen del motor)")
def test_el_texto_del_motor_es_el_de_la_app():
    # Si cambias recomendacionesUso() en ce3xTextos.js, regenera
    # tools/recomendaciones_uso.json (ver su «_nota»).
    assert VC.recomendaciones_por_defecto("residencial") == _texto_js("RECOMENDACIONES_RESIDENCIAL")
    assert VC.recomendaciones_por_defecto("pequeno_terciario") == _texto_js("RECOMENDACIONES_TERCIARIO")
    assert json.loads((RAIZ / "tools" / "recomendaciones_uso.json").read_text(encoding="utf-8"))


def test_al_convertir_de_la_2_3_salen_las_recomendaciones():
    salida, avisos, destino = CX.convertir_bytes(_cex_23(con_medida=True), {})
    inf = L.leer(L.trocear_bytes(salida), G.INFORME)
    assert destino == "3.2" and len(inf) == 8
    assert inf[REC].startswith("Recomendaciones para un uso eficiente de la energía en la vivienda:<br>")


def test_uno_de_la_3_1_con_la_casilla_vacia_se_completa():
    salida, _, _ = CX.convertir_bytes(_cex_23(con_medida=True), {})
    base = L.trocear_bytes(salida)
    inf = list(L.leer(base, G.INFORME))
    inf[REC] = ""
    vacio = E.sustituir_pickles(salida, {G.INFORME: inf})
    otra, avisos, _ = CX.convertir_bytes(vacio, {})
    assert L.leer(L.trocear_bytes(otra), G.INFORME)[REC].startswith("Recomendaciones para un uso")
    assert any("recomendaciones de uso" in a for a in avisos)


def test_las_que_escribio_el_tecnico_no_se_tocan():
    salida, _, _ = CX.convertir_bytes(_cex_23(con_medida=True), {})
    inf = list(L.leer(L.trocear_bytes(salida), G.INFORME))
    inf[REC] = "Las del tecnico."
    suyo = E.sustituir_pickles(salida, {G.INFORME: inf})
    otra, avisos, _ = CX.convertir_bytes(suyo, {})
    assert otra == suyo and "ya es de CE3X 3.2" in avisos[0]
