"""Que puentes termicos se le escriben a un edificio.

Los numeros de aqui NO son inventados: salen de medir 50 .cex de
certificadores (1.733 puentes). Cada test dice de donde sale lo que comprueba,
porque de estas reglas cuelga un ahorro que se firma.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import puentes as PT  # noqa: E402
from errores import GeneracionError  # noqa: E402


# --------------------------------------------------------------------------
# Utilidades del fixture
# --------------------------------------------------------------------------

def fachada(nombre, largo, alto=2.8, nivel=0, wkt=None, destino="aire",
            espacio="PLANTA BAJA", ident=None):
    return {"nombre": nombre, "ident": ident or nombre.split(" ")[0],
            "clase": "FACHADA", "destino": destino, "largo": largo, "alto": alto,
            "espacio": espacio, "nivel": nivel, "wkt": wkt}


def horizontal(nombre, clase, destino, nivel=0, espacio="PLANTA BAJA"):
    return {"nombre": nombre, "ident": nombre.split(" ")[0], "clase": clase,
            "destino": destino, "largo": None, "alto": None,
            "espacio": espacio, "nivel": nivel, "wkt": None}


def hueco(nombre, muro, ancho=1.3, alto=1.3, persiana=False,
          espacio="PLANTA BAJA"):
    return {"id": nombre, "muro": muro, "espacio": espacio,
            "ancho": ancho, "alto": alto, "persiana": persiana}


def de_tipo(puentes, tipo):
    return [p for p in puentes if p[2] == tipo]


#: Un rectangulo de 10 x 6, con sus cuatro fachadas trazadas. Cuatro esquinas.
RECTANGULO = [
    fachada("FBS1 CALLE", 10, wkt="LINESTRING (0 0, 10 0)"),
    fachada("FBE1 CALLE", 6, wkt="LINESTRING (10 0, 10 6)"),
    fachada("FBN1 PATIO", 10, wkt="LINESTRING (10 6, 0 6)"),
    fachada("FBO1 PATIO", 6, wkt="LINESTRING (0 6, 0 0)"),
]


# --------------------------------------------------------------------------
# Lo que cuelga de un hueco
# --------------------------------------------------------------------------

def test_el_contorno_de_hueco_mide_su_perimetro_y_cuelga_del_MURO():
    """2*(ancho+alto), y `cerramientoAsociado` es el muro, no el hueco."""
    pts, _ = PT.construir(RECTANGULO, [hueco("V1", "FBS1 CALLE", 1.4, 1.1)])
    pt = de_tipo(pts, "Contorno de hueco")[0]
    assert pt[0] == "PT Contorno de hueco-V1"
    assert pt[4] == "5"                      # 2*(1.4+1.1)
    assert pt[7] == "FBS1 CALLE"


def test_la_caja_de_persiana_mide_el_ANCHO_y_solo_sale_si_hay_persiana():
    """Medido en el corpus: la longitud del cajon es el ancho del hueco."""
    con, _ = PT.construir(RECTANGULO, [hueco("V1", "FBS1 CALLE", 1.4, 1.1,
                                             persiana=True)])
    assert de_tipo(con, "Caja de Persiana")[0][4] == "1.4"

    sin, _ = PT.construir(RECTANGULO, [hueco("V1", "FBS1 CALLE", persiana=False)])
    assert de_tipo(sin, "Caja de Persiana") == []


def test_sin_huecos_no_hay_contornos():
    pts, _ = PT.construir(RECTANGULO, [])
    assert de_tipo(pts, "Contorno de hueco") == []


# --------------------------------------------------------------------------
# El forjado
# --------------------------------------------------------------------------

def test_el_forjado_va_en_TODA_fachada_y_mide_su_largo():
    """Uno por pano, con su largo. Lo llevan 46 de los 50 .cex del corpus."""
    pts, _ = PT.construir(RECTANGULO, [])
    forj = de_tipo(pts, "Encuentro de fachada con forjado")
    assert len(forj) == 4
    assert sorted(p[4] for p in forj) == ["10", "10", "6", "6"]


def test_una_vivienda_de_UNA_planta_tambien_lleva_forjado():
    """Ahi el forjado es el de la cubierta, apoyando en la fachada. En el
    corpus lo llevan CARBON, GAS_NATURAL, PELLETS, PEDRO MUNOZ... todos de un
    solo nivel."""
    pts, _ = PT.construir([fachada("FBS1 CALLE", 8)], [])
    assert len(de_tipo(pts, "Encuentro de fachada con forjado")) == 1


def test_una_MEDIANERA_no_tiene_forjado_al_exterior():
    """El encuentro con el forjado es un puente de la envolvente: al otro lado
    de una medianera hay otra vivienda a la misma temperatura."""
    pts, _ = PT.construir([fachada("MBN1 MEDIANERA", 8, destino="edificio")], [])
    assert de_tipo(pts, "Encuentro de fachada con forjado") == []


# --------------------------------------------------------------------------
# Los pilares en esquina
# --------------------------------------------------------------------------

def test_un_rectangulo_tiene_CUATRO_esquinas():
    """Cuatro esquinas: 4 x la altura de la planta, repartidas entre las
    fachadas que las forman."""
    pts, avisos = PT.construir(RECTANGULO, [])
    esq = de_tipo(pts, "Pilar en Esquina")
    assert sum(float(p[4]) for p in esq) == pytest.approx(4 * 2.8)
    # Y SIN aviso: esto sale del trazado, o sea que es una medida. El listado
    # de avisos es «lo que no es una medida».
    assert not any("esquina" in a.lower() for a in avisos)


def test_una_fachada_PARTIDA_en_tramos_no_inventa_esquinas():
    """Catastro parte una fachada cuando cambia el vecino de enfrente. Esos
    tramos siguen la misma linea: ahi no hay pilar.

    Es la diferencia con lo que se hacia antes (un pilar por pano): este
    edificio tiene 4 esquinas y 6 panos."""
    paredes = [
        fachada("FBS1 CALLE", 4, wkt="LINESTRING (0 0, 4 0)"),
        fachada("FBS2 CALLE", 6, wkt="LINESTRING (4 0, 10 0)"),
        fachada("FBE1 CALLE", 6, wkt="LINESTRING (10 0, 10 6)"),
        fachada("FBN1 PATIO", 5, wkt="LINESTRING (10 6, 5 6)"),
        fachada("FBN2 PATIO", 5, wkt="LINESTRING (5 6, 0 6)"),
        fachada("FBO1 PATIO", 6, wkt="LINESTRING (0 6, 0 0)"),
    ]
    pts, _ = PT.construir(paredes, [])
    esq = de_tipo(pts, "Pilar en Esquina")
    assert sum(float(p[4]) for p in esq) == pytest.approx(4 * 2.8)
    assert len(de_tipo(pts, "Encuentro de fachada con forjado")) == 6


def test_cada_esquina_se_cuenta_UNA_vez_aunque_la_formen_dos_fachadas():
    """El pilar es uno; apuntarlo a las dos lo contaria dos veces.

    Una misma fachada SI puede ser duena de dos esquinas —las de sus dos
    puntas—, que es lo que le pasa aqui a la del este."""
    esqs = PT.esquinas(RECTANGULO)
    assert len(esqs) == 4
    assert len({tuple(e["paredes"]) for e in esqs}) == 4   # cuatro pares distintos
    assert all(len(e["paredes"]) == 2 for e in esqs)


def test_una_fachada_con_DOS_esquinas_saca_UN_puente_que_las_suma():
    """Salian dos puentes con el MISMO nombre (`PT Pilar en Esquina-FBE1
    PATIO` repetido), que en el arbol de CE3X son dos entradas identicas sin
    forma de distinguirlas. Se suman, como ya se suman los integrados."""
    pts, _ = PT.construir(RECTANGULO, [])
    esq = de_tipo(pts, "Pilar en Esquina")
    nombres = [p[0] for p in esq]
    assert len(nombres) == len(set(nombres))
    assert sum(float(p[4]) for p in esq) == pytest.approx(4 * 2.8)


def test_ningun_puente_repite_NOMBRE():
    """Vale para los ocho: el nombre es lo que CE3X ensena en el arbol."""
    paredes = RECTANGULO + [
        horizontal("CUB1 CUBIERTA", "CUBIERTA", "aire"),
        horizontal("SUB1 SUELO EN TERRENO", "SUELO", "terreno"),
    ]
    pts, _ = PT.construir(paredes, [hueco("V1", "FBS1 CALLE"),
                                    hueco("V2", "FBS1 CALLE", persiana=True)])
    nombres = [p[0] for p in pts]
    repetidos = [n for n in nombres if nombres.count(n) > 1]
    assert not repetidos, repetidos


def test_contra_una_MEDIANERA_no_hay_pilar_en_esquina():
    """Un pilar en esquina lo es por tener DOS caras al exterior. Donde la
    fachada muere contra el vecino, el edificio dobla pero el pilar tiene una
    sola cara fuera — y esa ya la recoge el pilar integrado en fachada."""
    paredes = [
        fachada("FBS1 CALLE", 10, wkt="LINESTRING (0 0, 10 0)"),
        fachada("FBE1 CALLE", 6, wkt="LINESTRING (10 0, 10 6)"),
        fachada("MBO1 MEDIANERA", 6, destino="edificio",
                wkt="LINESTRING (0 6, 0 0)"),
    ]
    esqs = PT.esquinas(paredes)
    assert len(esqs) == 1
    assert esqs[0]["paredes"] == ["FBE1 CALLE", "FBS1 CALLE"]


def test_cada_PLANTA_tiene_sus_propias_esquinas():
    """Una pared de la planta 1 no hace esquina con una de la planta baja
    aunque sus coordenadas coincidan: son dos pilares distintos."""
    arriba = [dict(p, nombre=p["nombre"].replace("FB", "F1"), nivel=1,
                   espacio="PLANTA 1") for p in RECTANGULO]
    pts, _ = PT.construir(RECTANGULO + arriba, [])
    esq = de_tipo(pts, "Pilar en Esquina")
    assert sum(float(p[4]) for p in esq) == pytest.approx(8 * 2.8)


def test_sin_trazado_se_cae_a_uno_por_pano_y_SE_DICE():
    """No saber donde dobla el edificio no puede dejar el .cex sin pilares:
    se hace lo de siempre y se avisa de que es una aproximacion."""
    paredes = [fachada("FBS1 CALLE", 10), fachada("FBE1 CALLE", 6)]
    pts, avisos = PT.construir(paredes, [])
    assert len(de_tipo(pts, "Pilar en Esquina")) == 2
    assert any("no trae el trazado" in a for a in avisos)


def test_un_quiebro_de_dos_grados_no_es_una_esquina():
    """Tolerancia: los retranqueos de Catastro no son pilares."""
    casi = 10 * math.cos(math.radians(2)), 10 * math.sin(math.radians(2))
    paredes = [
        fachada("FBS1 CALLE", 10, wkt="LINESTRING (0 0, 10 0)"),
        fachada("FBS2 CALLE", 10,
                wkt=f"LINESTRING (10 0, {10 + casi[0]} {casi[1]})"),
    ]
    assert PT.esquinas(paredes) == []


# --------------------------------------------------------------------------
# Los pilares integrados
# --------------------------------------------------------------------------

def test_los_pilares_integrados_se_PROPONEN_uno_cada_tres_metros_y_medio():
    assert PT.pilares_de(3.5) == 2         # el minimo: uno en cada extremo
    assert PT.pilares_de(0.69) == 2
    assert PT.pilares_de(10.0) == 3
    assert PT.pilares_de(12.41) == 4
    assert PT.pilares_de(25.37) == 7


def test_unos_pilares_ESTIMADOS_se_dicen_con_su_procedencia():
    """Es un puente que va al certificado y que no ha contado nadie — y que
    nunca habia estado en el .cex de la app."""
    _, avisos = PT.construir([fachada("FBS1 CALLE", 10)], [])
    assert any("ESTIMADOS" in a and "FBS1 (3)" in a for a in avisos)

    _, contados = PT.construir([fachada("FBS1 CALLE", 10)], [],
                               {"pilares": {"FBS1": 3}})
    assert not any("ESTIMADOS" in a for a in contados)


def test_su_longitud_es_un_numero_ENTERO_de_pilares_por_la_altura():
    """Es lo que escriben los 32 .cex del corpus que los llevan, sin una
    excepcion: la longitud siempre es multiplo exacto de la altura."""
    pts, _ = PT.construir([fachada("FBS1 CALLE", 10, alto=2.8)], [])
    largo = float(de_tipo(pts, "Pilar integrado en fachada")[0][4])
    assert largo == pytest.approx(3 * 2.8)


def test_el_certificador_puede_CONTARLOS_y_manda_lo_que_cuente():
    pts, avisos = PT.construir([fachada("FBS1 CALLE", 10, alto=2.8)], [],
                               {"pilares": {"FBS1": 5}})
    assert float(de_tipo(pts, "Pilar integrado en fachada")[0][4]) == pytest.approx(14.0)
    assert any("contados por el certificador" in a for a in avisos)


def test_poner_CERO_pilares_los_quita():
    pts, _ = PT.construir([fachada("FBS1 CALLE", 10)], [], {"pilares": {"FBS1": 0}})
    assert de_tipo(pts, "Pilar integrado en fachada") == []


def test_un_numero_de_pilares_que_no_es_un_numero_no_tumba_la_generacion():
    pts, avisos = PT.construir([fachada("FBS1 CALLE", 10)], [],
                               {"pilares": {"FBS1": "dos o tres"}})
    assert len(de_tipo(pts, "Pilar integrado en fachada")) == 1
    assert any("no es un numero de pilares" in a for a in avisos)


# --------------------------------------------------------------------------
# Los encuentros con la cubierta y con el suelo
# --------------------------------------------------------------------------

def test_el_encuentro_con_la_CUBIERTA_cuelga_de_la_cubierta():
    """Medido en los 50 .cex: sin UNA sola excepcion. Colgarlo de una fachada
    lo escondería — CE3X lo ensena bajo el cerramiento que dice."""
    paredes = RECTANGULO + [horizontal("CUB1 CUBIERTA", "CUBIERTA", "aire")]
    pts, _ = PT.construir(paredes, [])
    pt = de_tipo(pts, "Encuentro de fachada con cubierta")[0]
    assert pt[7] == "CUB1 CUBIERTA"


def test_su_longitud_es_el_CONTORNO_de_esa_planta_medianeras_incluidas():
    """La cubierta se apoya igual sobre la medianera del vecino. Contra este
    perimetro la mediana del corpus es 1,00; contra el de solo las fachadas al
    aire, 1,19."""
    paredes = RECTANGULO + [
        fachada("MBN1 MEDIANERA", 7, destino="edificio"),
        horizontal("CUB1 CUBIERTA", "CUBIERTA", "aire"),
    ]
    pts, _ = PT.construir(paredes, [])
    assert de_tipo(pts, "Encuentro de fachada con cubierta")[0][4] == "39"   # 32 + 7


def test_la_SOLERA_cuelga_del_suelo_y_el_suelo_al_aire_es_OTRO_puente():
    paredes = RECTANGULO + [
        horizontal("SUB1 SUELO EN TERRENO", "SUELO", "terreno"),
        horizontal("SUB2 SUELO", "SUELO", "aire"),
    ]
    pts, _ = PT.construir(paredes, [])
    solera = de_tipo(pts, "Encuentro de fachada con solera")[0]
    aire = de_tipo(pts, "Encuentro de fachada con suelo en contacto con el aire")[0]
    assert solera[7] == "SUB1 SUELO EN TERRENO"
    assert aire[7] == "SUB2 SUELO"
    assert aire[3] == 0.97          # medido: 10 de 10 casos del corpus


def test_cada_cubierta_mide_el_contorno_de_SU_planta():
    arriba = [dict(p, nombre=p["nombre"].replace("FB", "F1"), nivel=1,
                   espacio="PLANTA 1", largo=3) for p in RECTANGULO]
    paredes = RECTANGULO + arriba + [
        horizontal("CUB1 CUBIERTA", "CUBIERTA", "aire", nivel=0),
        horizontal("CU11 CUBIERTA", "CUBIERTA", "aire", nivel=1, espacio="PLANTA 1"),
    ]
    pts, _ = PT.construir(paredes, [])
    largos = sorted(float(p[4]) for p in de_tipo(pts, "Encuentro de fachada con cubierta"))
    assert largos == [12.0, 32.0]


def test_una_cubierta_sobre_una_planta_SIN_paredes_medidas_no_se_inventa():
    paredes = [horizontal("CUB1 CUBIERTA", "CUBIERTA", "aire", nivel=9)]
    pts, avisos = PT.construir(paredes, [])
    assert de_tipo(pts, "Encuentro de fachada con cubierta") == []
    assert any("no se sabe cuanto mide el encuentro" in a for a in avisos)


# --------------------------------------------------------------------------
# El contrato con CE3X
# --------------------------------------------------------------------------

def test_los_OCHO_tipos_son_los_del_dialogo_de_CE3X():
    """«Definir puentes termicos por defecto» tiene ocho casillas, ni una mas.
    Un tipo que CE3X no reconozca sale mudo en el arbol."""
    assert len(PT.PSI) == 8
    assert set(PT.PSI) == set(PT.SOPORTE)


def test_un_puente_que_CE3X_no_tiene_se_rechaza():
    with pytest.raises(GeneracionError, match="no contemplado"):
        PT.puente("Encuentro inventado", 1.0, "F11", "Edificio Objeto")


def test_todo_lo_que_se_genera_cuelga_del_cerramiento_que_le_toca():
    """La comprobacion de arriba, pero sobre la salida de verdad."""
    paredes = RECTANGULO + [
        horizontal("CUB1 CUBIERTA", "CUBIERTA", "aire"),
        horizontal("SUB1 SUELO EN TERRENO", "SUELO", "terreno"),
    ]
    clase = {p["nombre"]: p["clase"] for p in paredes}
    pts, _ = PT.construir(paredes, [hueco("V1", "FBS1 CALLE")])
    for p in pts:
        assert clase[p[7]] == PT.SOPORTE[p[2]], p[0]


def test_el_puente_se_emite_con_los_literales_de_CE3X():
    """`PT`, `defecto_fi` y `defecto` van como STRING y no como UNICODE: es lo
    que hace que el fichero salga igual que el que guarda el programa."""
    from pickle0 import Cadena
    p = PT.puente("Contorno de hueco", 5.8, "F11 CALLE", "Edificio Objeto")
    assert isinstance(p[1], Cadena) and isinstance(p[5], Cadena)
    assert isinstance(p[6], Cadena)


# --------------------------------------------------------------------------
# El enganche con el generador: que el trazado y la planta LLEGUEN
# --------------------------------------------------------------------------

def _elemento(ident, tipo, subtipo, nivel, planta, largo=None, alto=2.8,
              sup=10.0, orient="S", wkt=None):
    return {"id": ident, "planta": planta, "nivel": nivel, "tipo": tipo,
            "subtipo": subtipo, "orientacion": orient,
            "largo": {"value": largo}, "alto": {"value": alto},
            "superficie": {"value": sup}, "geometria_wkt": wkt}


#: Una casa de dos plantas con su cubierta y su solera. La baja es un
#: rectangulo de 10 x 6 partido en dos tramos por el sur.
_CASA = {"elementos": [
    _elemento("FBS1", "FACHADA", "CALLE", 0, "PB", 4, wkt="LINESTRING (0 0, 4 0)"),
    _elemento("FBS2", "FACHADA", "CALLE", 0, "PB", 6, wkt="LINESTRING (4 0, 10 0)"),
    _elemento("FBE1", "FACHADA", "PATIO", 0, "PB", 6, wkt="LINESTRING (10 0, 10 6)"),
    _elemento("FBN1", "FACHADA", "PATIO", 0, "PB", 10, wkt="LINESTRING (10 6, 0 6)"),
    _elemento("MBO1", "MEDIANERA", "MEDIANERA", 0, "PB", 6, wkt="LINESTRING (0 6, 0 0)"),
    _elemento("SUB1", "SUELO", "SUELO", 0, "PB", sup=60.0, orient=None),
    _elemento("CUB1", "CUBIERTA", "CUBIERTA", 0, "PB", sup=60.0, orient=None),
]}


def _datos_casa(**envolvente):
    return {"termicas": {k: {"u": 1.69, "masa": "Media"} for k in (
                "fachada", "cubierta", "suelo_terreno", "medianera",
                "particion_vertical", "particion_superior")},
            "envolvente": {"espacio": "Edificio Objeto", "zonas": [],
                           "incluir_plantas": ["PB"], "excluir_ids": {"ids": []},
                           "suelo": {"superficie": 60.0},
                           "cubierta": {"superficie": 60.0},
                           **envolvente}}


def test_el_trazado_y_la_planta_llegan_desde_la_geometria_hasta_los_puentes():
    """Lo que comprueba el ENGANCHE: si `paredes_pt` no llevara el wkt, los
    pilares se caerian al respaldo de uno por pano sin que nada lo dijera."""
    import generar_cex as G
    env, avisos = G.construir_envolvente(_CASA, _datos_casa())
    tipos = [str(pt[2]) for pt in env[2]]

    # Cuatro panos verticales al aire -> cuatro forjados (la medianera no).
    assert tipos.count("Encuentro de fachada con forjado") == 4
    # Y DOS esquinas: la fachada sur va partida en dos tramos (ahi no dobla) y
    # el lado oeste es medianera (ahi el pilar no tiene dos caras al exterior).
    # Las dos son de la MISMA fachada, asi que salen en una sola fila sumadas.
    esq = [pt for pt in env[2] if str(pt[2]) == "Pilar en Esquina"]
    assert len(esq) == 1
    assert float(esq[0][4]) == pytest.approx(2 * 2.8)
    assert not any("esquina" in a.lower() for a in avisos)

    # Y los dos que la app no escribia nunca, cada uno sobre lo suyo.
    cubierta = next(pt for pt in env[2] if "con cubierta" in str(pt[2]))
    solera = next(pt for pt in env[2] if "con solera" in str(pt[2]))
    assert str(cubierta[7]) == "CUB1 CUBIERTA"
    assert str(solera[7]) == "SUB1 SUELO EN TERRENO"
    # 4 + 6 + 6 + 10 + 6 (la medianera cuenta: la cubierta se apoya en ella)
    assert float(cubierta[4]) == pytest.approx(32.0)


def test_el_marco_el_vidrio_y_la_persiana_de_la_VIVIENDA_llegan_a_cada_hueco():
    """`huecos_defecto` existia en el motor y no lo mandaba nadie: todos los
    huecos salian «Doble + Metalico sin RPT» y sin persiana."""
    import generar_cex as G
    from pickle0 import Cadena
    env, _ = G.construir_envolvente(_CASA, _datos_casa(
        huecos_defecto={"vidrio": "Doble bajo emisivo", "marco": "PVC",
                        "persiana": True},
        huecos=[{"id": "V1", "cerramiento": "FBS1 CALLE", "ancho": 1.4, "alto": 1.1}]))
    h = env[1][0].estado
    assert h[Cadena("tipoVidrio")] == "Doble bajo emisivo"
    assert h[Cadena("tipoMarco")] == "PVC"
    assert h[Cadena("Uvidrio")] == 2.7 and h[Cadena("Umarco")] == 2.2
    assert [str(pt[2]) for pt in env[2]].count("Caja de Persiana") == 1


def test_un_hueco_puede_llevar_la_CONTRARIA_al_defecto_de_la_vivienda():
    """La cocina ya cambiada de una vivienda con las ventanas viejas."""
    import generar_cex as G
    from pickle0 import Cadena
    env, _ = G.construir_envolvente(_CASA, _datos_casa(
        huecos_defecto={"vidrio": "Simple", "marco": "Metálico sin RPT",
                        "persiana": True},
        huecos=[{"id": "V1", "cerramiento": "FBS1 CALLE", "ancho": 1.4, "alto": 1.1},
                {"id": "V2", "cerramiento": "FBS2 CALLE", "ancho": 1.2, "alto": 1.2,
                 "vidrio": "Doble bajo emisivo", "marco": "PVC", "persiana": False}]))
    assert env[1][0].estado[Cadena("tipoVidrio")] == "Simple"
    assert env[1][1].estado[Cadena("tipoVidrio")] == "Doble bajo emisivo"
    cajas = [str(pt[0]) for pt in env[2] if str(pt[2]) == "Caja de Persiana"]
    assert cajas == ["PT Caja de Persiana-V1"]


# --------------------------------------------------------------------------
# El espejo del navegador
# --------------------------------------------------------------------------

_PILARES_JS = (RAIZ.parent / "frontend" / "src" / "features" / "cee-envolvente"
               / "logic" / "pilaresFachada.js")

# La imagen del motor solo lleva `cee-engine`: el fichero del navegador no viaja
# dentro, asi que ahi no hay nada que cotejar y el test se salta DICIENDOLO. La
# vigilancia sigue viva donde el espejo existe de verdad, que es el repo — y es
# donde se toca uno de los dos ficheros. Darlo por bueno en silencio seria peor:
# el build de la imagen diria que el espejo cuadra sin haberlo mirado.
sin_espejo = pytest.mark.skipif(
    not _PILARES_JS.exists(),
    reason="el fichero del navegador no esta en este arbol (imagen del motor)")


@sin_espejo
def test_la_pantalla_estima_los_pilares_con_los_MISMOS_numeros_que_el_motor():
    """El panel de la pared ensena la estimacion y el motor la escribe. Si los
    dos se separan, la pantalla dice 3 y el .cex lleva 4: no falla, miente.

    Se comprueba el FICHERO, no una copia: es el mismo patron con el que se
    vigila el codigo de una construccion."""
    js = _PILARES_JS.read_text(encoding="utf-8")
    assert f"SEPARACION_PILARES_M = {PT.SEPARACION_PILARES_M}" in js
    assert f"PILARES_MINIMO = {PT.PILARES_MINIMO}" in js


def test_el_redondeo_del_navegador_es_el_de_python():
    """Python redondea el 0,5 al PAR (`round(2.5) == 2`) y JavaScript hacia
    arriba. Sobre 8,75 m eso es un pilar de diferencia."""
    assert PT.pilares_de(8.75) == 2      # 2.5 -> 2, y el minimo lo sube a 2
    assert PT.pilares_de(12.25) == 4     # 3.5 -> 4
    assert PT.pilares_de(15.75) == 4     # 4.5 -> 4, no 5
    if _PILARES_JS.exists():
        assert "redondeoBancario" in _PILARES_JS.read_text(encoding="utf-8")
