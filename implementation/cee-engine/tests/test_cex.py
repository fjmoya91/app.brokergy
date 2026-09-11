"""El lector y el editor de .cex (docs/11).

Aqui no se usa ningun .cex de verdad: llevan dentro nombre y direccion del
titular. Se arma uno SINTETICO con la misma forma que escribe CE3X — protocolo
0, CRLF de Windows, `STRING` para los literales del codigo y `UNICODE` para lo
que se teclea, y un `INST` de una clase propia.
"""
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "tools"))

import editar_cex as E  # noqa: E402
import leer_cex as L  # noqa: E402


# --------------------------------------------------------------------------
# Un .cex sintetico, escrito a mano tal y como lo emite CE3X
# --------------------------------------------------------------------------

class Emisor:
    """Escribe protocolo 0 como lo escribe CE3X.

    La regla del protocolo 0: SOLO llevan `\\n` los opcodes que traen argumento
    (`V` unicode, `S` str, `F` float, `I` int, `p` put, `g` get). Los demas
    —`(` marca, `l` lista, `a` append, `d` dict, `s` setitem, `b` build, `.`
    stop— son un byte suelto. Y el memo empieza de cero en cada pickle.
    """

    def __init__(self):
        self.trozos: list[str] = []
        self.memo = 0

    def _put(self) -> int:
        i = self.memo
        self.trozos.append(f"p{i}\n")
        self.memo += 1
        return i

    def lista(self) -> int:
        self.trozos.append("(l")
        return self._put()

    def uni(self, s) -> int:
        self.trozos.append(f"V{s}\n")
        return self._put()

    def cad(self, s) -> int:
        self.trozos.append(f"S{s!r}\n")
        return self._put()

    def flo(self, f) -> None:
        self.trozos.append(f"F{f}\n")      # CE3X no memoiza los FLOAT

    def ent(self, i) -> None:
        self.trozos.append(f"I{i}\n")

    def get(self, i) -> None:
        self.trozos.append(f"g{i}\n")

    def mete(self) -> None:
        self.trozos.append("a")            # APPEND del ultimo valor

    def texto(self) -> str:
        self.trozos.append(".")
        return "".join(self.trozos)


def _cabecera() -> str:
    e = Emisor()
    e.cad("CEXv2.3 Residencial")
    return e.texto()


def _lista_de_textos(*valores) -> str:
    e = Emisor()
    e.lista()
    for v in valores:
        e.uni(v)
        e.mete()
    return e.texto()


def _envolvente() -> str:
    """Un muro de fachada de 9.05 x 2.70 y una medianera de 6.00 x 2.70."""
    e = Emisor()
    e.lista()                                  # la envolvente entera

    e.lista()                                  # bloque 0: cerramientos opacos

    e.lista()                                  # -- cerramiento 0: fachada
    e.uni("Fachada Sur"); e.mete()
    m_fachada = e.cad("Fachada"); e.mete()
    e.uni("24.44"); e.mete()                   # 2 superficie
    e.flo(0.66); e.mete()                      # 3 transmitancia
    e.flo(165.7); e.mete()                     # 4 masa
    e.uni("Sur"); e.mete()                     # 5 orientacion
    e.uni(""); e.mete()                        # 6 composicion
    m_patron = e.uni("Sin patron"); e.mete()   # 7 patron de sombra
    e.uni("Conocidas"); e.mete()               # 8 propiedades termicas
    e.lista(); e.mete()                        # 9 bloque constructivo, vacio
    e.uni("9.05"); e.mete()                    # -5 largo
    e.uni("2.70"); e.mete()                    # -4 alto
    e.uni("1"); e.mete()                       # -3 multiplicador
    m_pb = e.uni("PB"); e.mete()               # -2 espacio
    e.uni("aire"); e.mete()                    # -1 da a
    e.mete()                                   # el cerramiento entra al bloque

    e.lista()                                  # -- cerramiento 1: medianera
    e.uni("Medianeria Este"); e.mete()
    e.get(m_fachada); e.mete()                 # 'Fachada' reusado del memo
    e.uni("16.20"); e.mete()
    e.ent(0); e.mete()                         # sin transmitancia
    e.uni("200"); e.mete()
    e.uni(""); e.mete()
    e.uni(""); e.mete()
    e.get(m_patron); e.mete()
    e.uni("6.00"); e.mete()                    # -5 largo
    e.uni("2.70"); e.mete()                    # -4 alto
    e.uni("1"); e.mete()                       # -3 multiplicador
    e.get(m_pb); e.mete()                      # -2 espacio, COMPARTIDO con el otro
    e.uni("edificio"); e.mete()                # -1 da a
    e.mete()

    e.mete()                                   # cierra el bloque 0

    # bloque 1: los huecos, que en CE3X son objetos de verdad (INST + BUILD)
    e.lista()
    e.trozos.append("(iEnvolvente.objetosEnvolvente\nHuecoEstimadas\n")
    e._put()
    e.trozos.append("(d")
    e._put()
    e.cad("ancho")
    e.flo(1.2)
    e.trozos.append("sb")
    e.mete()
    e.mete()

    e.lista(); e.mete()                        # bloque 2: puentes termicos
    e.lista(); e.mete()                        # bloque 3
    return e.texto()


def _pickle_vacio() -> str:
    e = Emisor()
    e.lista()
    return e.texto()


SINTETICO = (
    _cabecera()                                                    # 0
    + _lista_de_textos("Casa de prueba", "Calle Falsa 1")          # 1
    + _lista_de_textos("NBE-CT-79", "Unifamiliar", "Ciudad Real",  # 2
                       "D3", "186", "2.7", "2")
    + _envolvente()                                                # 3
    + "".join(_pickle_vacio() for _ in range(10))                  # 4..13
    + _cabecera().replace("CEXv2.3 Residencial", "aGVoZQ==")       # 14, el hash
).replace("\n", "\r\n")


@pytest.fixture
def cex(tmp_path) -> Path:
    ruta = tmp_path / "sintetico.cex"
    ruta.write_bytes(SINTETICO.encode("latin-1"))
    return ruta


# --------------------------------------------------------------------------
# Lo primero: que no ejecuta nada
# --------------------------------------------------------------------------

def test_un_INST_no_construye_nada_solo_se_anota(cex):
    """La regla de docs/11: el INST se lee, no se ejecuta."""
    hueco = L.leer(L.trocear(cex), 3)[1][0]
    assert isinstance(hueco, L.Opaco)
    assert hueco.clase == "Envolvente.objetosEnvolvente.HuecoEstimadas"
    assert hueco.estado == {"ancho": 1.2}


def test_un_pickle_que_llamaria_a_os_system_no_llama_a_nadie(tmp_path):
    """El caso que justifica todo el fichero: un .cex hostil.

    Con `pickle.load()` esto ejecutaria `os.system`. Aqui tiene que salir un
    marcador y punto, sin que se ejecute ni se importe nada.
    """
    malo = tmp_path / "malo.cex"
    malo.write_bytes(
        (_cabecera() +
         "cos\nsystem\np0\n(S'echo te he pillado'\np1\ntp2\nRp3\n."
         ).replace("\n", "\r\n").encode("latin-1"))

    cex = L.trocear(malo)
    dato = L.leer(cex, 1)
    assert isinstance(dato, L.Opaco)
    assert dato.clase == "os.system"
    assert dato.origen == "REDUCE"


# --------------------------------------------------------------------------
# Trocear
# --------------------------------------------------------------------------

def test_reconoce_la_version_y_cuenta_los_pickles(cex):
    c = L.trocear(cex)
    assert c.version == "CEXv2.3 Residencial"
    assert c.version_conocida
    assert len(c.pickles) == 15


def test_los_offsets_y_tamanos_encajan_unos_con_otros(cex):
    c = L.trocear(cex)
    for a, b in zip(c.pickles, c.pickles[1:]):
        assert a.offset + a.tam == b.offset
    ultimo = c.pickles[-1]
    assert ultimo.offset + ultimo.tam + c.cola == c.bytes_norm


def test_sin_normalizar_el_CRLF_no_se_parsea(cex):
    """CE3X escribe en modo texto de Windows; el protocolo 0 va por lineas."""
    crudo = cex.read_bytes()
    assert b"\r\n" in crudo
    assert L.normalizar(crudo).count(b"\r") == 0
    # y la vuelta es exacta, que es de lo que vive el editor
    assert L.normalizar(crudo).replace(b"\n", b"\r\n") == crudo


def test_una_version_desconocida_se_marca(tmp_path):
    otro = tmp_path / "otro.cex"
    otro.write_bytes(_cabecera().replace("CEXv2.3 Residencial", "CEXv9.9 Marciano")
                     .replace("\n", "\r\n").encode("latin-1"))
    c = L.trocear(otro)
    assert c.version == "CEXv9.9 Marciano"
    assert not c.version_conocida


def test_un_fichero_que_no_es_un_pickle_se_anota_y_no_revienta(tmp_path):
    basura = tmp_path / "basura.cex"
    basura.write_bytes(b"<?xml version='1.0'?><nada/>")
    c = L.trocear(basura)
    assert c.pickles[0].error is not None
    assert c.version is None


# --------------------------------------------------------------------------
# La envolvente
# --------------------------------------------------------------------------

def test_la_envolvente_tiene_cuatro_bloques(cex):
    env = L.leer(L.trocear(cex), 3)
    assert len(env) == 4
    assert len(env[0]) == 2          # dos cerramientos opacos


def test_el_muro_de_fachada_sale_con_sus_quince_campos(cex):
    muro = L.leer(L.trocear(cex), 3)[0][0]
    assert len(muro) == 15
    assert muro[0] == "Fachada Sur"
    assert muro[1] == "Fachada"
    assert muro[5] == "Sur"
    assert muro[-5:] == ["9.05", "2.70", "1", "PB", "aire"]


def test_la_medianera_es_un_registro_de_trece_campos_que_da_a_edificio(cex):
    """Lo que distingue una medianera: no lleva orientacion y da a 'edificio'."""
    med = L.leer(L.trocear(cex), 3)[0][1]
    assert len(med) == 13
    assert med[1] == "Fachada"
    assert med[-1] == "edificio"


@pytest.mark.parametrize("i", [0, 1])
def test_superficie_es_largo_por_alto_por_multiplicador(cex, i):
    """La regla que se comprobo contra 12.337 cerramientos del disco.

    Vale para los dos formatos porque se cuenta desde el FINAL, no desde el
    principio: lo que cambia de largo es el bloque constructivo del medio.
    """
    el = L.leer(L.trocear(cex), 3)[0][i]
    largo, alto, mult = float(el[-5]), float(el[-4]), float(el[-3])
    assert largo * alto * mult == pytest.approx(float(el[2]), abs=0.02)


# --------------------------------------------------------------------------
# Editar
# --------------------------------------------------------------------------

def test_cambiar_la_superficie_solo_toca_esos_bytes(cex, tmp_path):
    salida = tmp_path / "salida.cex"
    nuevo = E.aplicar(cex, [(3, [0, 0, 2], "30.00")], verboso=False)
    salida.write_bytes(nuevo)

    antes, despues = cex.read_bytes(), salida.read_bytes()
    distintos = [i for i in range(min(len(antes), len(despues)))
                 if antes[i] != despues[i]]
    assert len(antes) == len(despues)   # '24.44' -> '30.00', mismo largo
    assert 0 < len(distintos) <= 5
    assert L.leer(L.trocear(salida), 3)[0][0][2] == "30.00"


def test_el_valor_nuevo_puede_ser_mas_largo_que_el_viejo(cex, tmp_path):
    """El protocolo 0 no guarda offsets: se puede alargar sin descuadrar nada."""
    salida = tmp_path / "salida.cex"
    salida.write_bytes(E.aplicar(cex, [(3, [0, 0, 2], "1234.5678")], verboso=False))
    c = L.trocear(salida)
    assert len(c.pickles) == 15
    assert L.leer(c, 3)[0][0][2] == "1234.5678"
    assert L.leer(c, 2)[3] == "D3"      # lo de detras sigue en su sitio


def test_los_otros_catorce_pickles_quedan_igual(cex, tmp_path):
    salida = tmp_path / "salida.cex"
    salida.write_bytes(E.aplicar(cex, [(3, [0, 0, 2], "30.00")], verboso=False))
    E.comprobar(cex, salida, [(3, [0, 0, 2], "30.00")])   # revienta si no


def test_no_se_escribe_sobre_una_version_no_probada(tmp_path):
    otro = tmp_path / "otro.cex"
    otro.write_bytes(SINTETICO.replace("CEXv2.3 Residencial", "CEXv9.9 Marciano")
                     .encode("latin-1"))
    with pytest.raises(E.EdicionError, match="no probada"):
        E.aplicar(otro, [(3, [0, 0, 2], "30.00")], verboso=False)


def test_no_se_toca_un_valor_que_CE3X_comparte_con_GET(cex):
    """'PB' lo reusan los dos cerramientos: cambiarlo cambiaria los dos."""
    with pytest.raises(E.EdicionError, match="COMPARTIDO"):
        E.aplicar(cex, [(3, [0, 0, 13], "P1")], verboso=False)


def test_una_ruta_que_no_existe_se_dice_y_no_se_escribe(cex):
    with pytest.raises(E.EdicionError, match="se sale"):
        E.aplicar(cex, [(3, [0, 0, 99], "x")], verboso=False)


def test_un_valor_con_salto_de_linea_se_rechaza(cex):
    with pytest.raises(E.EdicionError, match="salto de linea"):
        E.aplicar(cex, [(3, [0, 0, 2], "30\n00")], verboso=False)


# --------------------------------------------------------------------------
# Escribir protocolo 0 (tools/pickle0.py)
# --------------------------------------------------------------------------

import generar_cex as G  # noqa: E402
import pickle0 as P  # noqa: E402


def _ida_y_vuelta(dato):
    return L.reconstruir(P.volcar(dato).encode("raw_unicode_escape"), 0)


@pytest.mark.parametrize("dato", [
    "",
    "texto con acentos: ñ á Ü",
    ["a", 1, 2.5, True, False, None],
    [[], [[]], {"a": 1}],
    [{"clave": [1.0, "dos"]}, "tres"],
])
def test_lo_que_se_escribe_es_lo_que_se_relee(dato):
    assert _ida_y_vuelta(dato) == dato


def test_una_Cadena_sale_como_STRING_y_un_str_como_UNICODE():
    """CE3X usa STRING para sus literales y UNICODE para lo tecleado."""
    txt = P.volcar([P.Cadena("Fachada"), "Partición Interior"])
    assert "S'Fachada'" in txt
    assert "VPartición Interior" in txt


def test_un_STRING_con_acentos_se_rechaza_en_vez_de_romperlo():
    with pytest.raises(P.Pickle0Error, match="ASCII"):
        P.volcar(P.Cadena("Medianería"))


def test_no_se_escribe_lo_que_no_se_sabe_escribir():
    with pytest.raises(P.Pickle0Error, match="no se sabe escribir"):
        P.volcar({1, 2, 3})


# --------------------------------------------------------------------------
# Generar un .cex (tools/generar_cex.py)
# --------------------------------------------------------------------------

TERM = {
    "fachada": {"u": 1.69, "masa": 200.0},
    "medianera": {"u": 0, "masa": "200"},
    "cubierta": {"u": 1.69, "masa": 100.0, "forma": "Cubierta plana"},
    "suelo_terreno": {"u": 1.0, "masa": 750},
    "particion_superior": {"u": 2.0, "masa": 500, "tipo_espacio": "Otro"},
    "particion_vertical": {"u": 2.0, "masa": 60.0, "tipo_espacio": ""},
}


def test_el_muro_de_fachada_sale_con_la_forma_que_escribe_CE3X():
    m = G.muro("F01 CALLE", 24.44, "S", 9.05, 2.7, "PB", TERM["fachada"])
    assert len(m) == 15
    assert m[1] == "Fachada" and m[5] == "Sur" and m[-1] == "aire"
    assert m[-5:] == ["9.05", "2.7", "1", "PB", "aire"]


def test_la_medianera_sale_de_trece_campos_y_contra_edificio():
    m = G.medianera("M01", 24.44, 9.05, 2.7, "PB", TERM["medianera"])
    assert len(m) == 13
    assert m[1] == "Fachada" and m[3] == 0 and m[-1] == "edificio"


def test_el_suelo_contra_terreno_sale_de_diecisiete_campos():
    """Y en 'Por defecto': 'Conocidas' no existe para suelos contra terreno."""
    s = G.suelo_terreno("SU01", 165, "PB", TERM["suelo_terreno"])
    assert len(s) == 17
    assert s[8] == "Por defecto" and s[-1] == "terreno"


def test_la_superficie_escrita_es_largo_por_alto():
    m = G.muro("F01", 24.44, "S", 9.05, 2.7, "PB", TERM["fachada"])
    assert float(m[-5]) * float(m[-4]) == pytest.approx(float(m[2]), abs=0.02)


def test_montar_deja_intactos_los_pickles_que_no_se_tocan(cex, tmp_path):
    salida = tmp_path / "generado.cex"
    salida.write_bytes(G.montar(cex, {3: [[], [], [], []]}))

    antes, despues = L.trocear(cex), L.trocear(salida)
    assert len(despues.pickles) == len(antes.pickles)
    for i in range(len(antes.pickles)):
        if i == 3:
            continue
        a = antes._data[antes.pickles[i].offset:][:antes.pickles[i].tam]
        b = despues._data[despues.pickles[i].offset:][:despues.pickles[i].tam]
        assert a == b, f"el pickle {i} no tenia que cambiar"
    assert L.leer(despues, 3) == [[], [], [], []]


def test_no_se_monta_sobre_una_plantilla_de_version_desconocida(tmp_path):
    otra = tmp_path / "otra.cex"
    otra.write_bytes(SINTETICO.replace("CEXv2.3 Residencial", "CEXv9.9 Marciano")
                     .encode("latin-1"))
    with pytest.raises(G.GeneracionError, match="no es una version probada"):
        G.montar(otra, {3: [[], [], [], []]})


def test_un_dato_obligatorio_a_null_para_la_generacion_en_vez_de_inventarlo():
    """La regla del proyecto: lo que no se sabe, se dice; no se rellena."""
    with pytest.raises(G.GeneracionError, match="falta un dato obligatorio"):
        G._v({"valor": None, "de": "PENDIENTE"}, "generales.ventilacion")


def test_un_dato_opcional_a_null_se_queda_vacio():
    assert G._opcional({"valor": None, "de": "PENDIENTE"}) == ""


# --------------------------------------------------------------------------
# Las zonas: el arbol de CE3X es raiz -> zona -> cerramientos
# --------------------------------------------------------------------------

def test_una_Instancia_se_escribe_como_INST_y_se_relee_igual():
    z = P.Instancia("ventanaSubgrupo", "claseZona",
                    {P.Cadena("nombre"): "PB", P.Cadena("superficie"): "165"})
    txt = P.volcar([z])
    assert "(iventanaSubgrupo\nclaseZona\n" in txt      # como lo escribe CE3X
    leido = L.reconstruir(txt.encode("raw_unicode_escape"), 0)[0]
    assert leido.clase == "ventanaSubgrupo.claseZona"
    assert leido.estado == {"nombre": "PB", "superficie": "165"}


def _datos_minimos(espacio, zonas):
    return {
        "termicas": TERM,
        "envolvente": {
            "espacio": espacio, "zonas": zonas,
            "incluir_plantas": ["PB"], "excluir_ids": {"ids": []},
            "suelo": {"superficie": 165.0}, "cubierta": {"superficie": 90.0},
            "particion_superior": {"superficie": 74.18},
        },
    }


_GEO = {"elementos": [{
    "id": "F01", "planta": "PB", "tipo": "FACHADA", "subtipo": "CALLE",
    "orientacion": "S", "largo": {"value": 9.05}, "alto": {"value": 2.8},
    "superficie": {"value": 25.34},
}]}


def test_un_cerramiento_en_una_zona_no_declarada_NO_se_escribe():
    """El fallo del 2026-09-10: CE3X abre el fichero y la envolvente sale vacia.

    El arbol va raiz -> zona -> cerramientos, asi que un cerramiento que apunte
    a una zona inexistente no se ve. Mejor no escribirlo que escribirlo invisible.
    """
    with pytest.raises(G.GeneracionError, match="zonas que no existen"):
        G.construir_envolvente(_GEO, _datos_minimos("PB", []))


def test_la_zona_raiz_vale_siempre_y_no_hay_que_declararla():
    env, _ = G.construir_envolvente(_GEO, _datos_minimos("Edificio Objeto", []))
    assert env[3] == []                       # sin zonas declaradas
    assert env[0][0][-2] == "Edificio Objeto"


def test_una_zona_declarada_sale_en_el_cuarto_bloque():
    env, _ = G.construir_envolvente(
        _GEO, _datos_minimos("PB", [{"nombre": "PB", "superficie": 165}]))
    assert len(env[3]) == 1
    assert env[3][0].estado["nombre"] == "PB"
    assert env[3][0].estado["raiz"] == "Edificio Objeto"


# --------------------------------------------------------------------------
# Las dos imagenes del pickle 2
# --------------------------------------------------------------------------

def test_una_imagen_se_guarda_como_PNG_de_134_de_alto(tmp_path):
    """CE3X escala siempre a 134 px de alto: 1.186 de 1.188 ficheros, sin una
    sola excepcion. El ancho sale de la proporcion."""
    from PIL import Image
    origen = tmp_path / "fachada.jpg"
    Image.new("RGB", (800, 300), (10, 20, 30)).save(origen)

    import base64
    import io as _io
    dentro = Image.open(_io.BytesIO(base64.b64decode(G.imagen(origen))))
    assert dentro.format == "PNG"
    assert dentro.size == (357, 134)


def test_sin_imagen_el_campo_se_queda_vacio_y_no_revienta():
    assert G.imagen(None) == ""
    assert G.imagen({"valor": None}) == ""


def test_una_imagen_que_no_esta_se_dice_en_vez_de_seguir(tmp_path):
    with pytest.raises(G.GeneracionError, match="no existe la imagen"):
        G.imagen(tmp_path / "no-existe.png")


# --------------------------------------------------------------------------
# Huecos y puentes termicos
# --------------------------------------------------------------------------

MURO_SUR = None  # se rellena en el fixture de abajo


@pytest.fixture
def muro_sur():
    return G.muro("F11 CALLE", 39.56, "S", 14.13, 2.8, "Edificio Objeto",
                  {"u": 1.69, "masa": 200.0})


def test_el_hueco_hereda_la_orientacion_de_su_muro(muro_sur):
    """No se pide aparte: seria una ocasion de contradecir al muro."""
    h = G.hueco({"id": "V1", "ancho": 1.5, "alto": 1.4}, muro_sur, "Edificio Objeto", {})
    assert h.estado["orientacion"] == "Sur"
    assert h.estado["cerramientoAsociado"] == "F11 CALLE"


def test_la_superficie_del_hueco_es_ancho_por_alto(muro_sur):
    h = G.hueco({"id": "V1", "ancho": 1.5, "alto": 1.4}, muro_sur, "Edificio Objeto", {})
    assert float(h.estado["superficie"]) == pytest.approx(1.5 * 1.4, abs=0.01)


@pytest.mark.parametrize("vidrio,u,g", [("Simple", 5.7, 0.82), ("Doble", 3.3, 0.75),
                                        ("Doble bajo emisivo", 2.7, 0.65)])
def test_el_vidrio_trae_su_U_y_su_g(muro_sur, vidrio, u, g):
    """Correspondencia MEDIDA en los 14.494 huecos del corpus, no inventada."""
    h = G.hueco({"id": "V", "ancho": 1, "alto": 1, "vidrio": vidrio},
                muro_sur, "Edificio Objeto", {})
    assert (h.estado["Uvidrio"], h.estado["Gvidrio"]) == (u, g)


def test_un_vidrio_que_CE3X_no_conoce_se_rechaza(muro_sur):
    with pytest.raises(G.GeneracionError, match="vidrio no valido"):
        G.hueco({"id": "V", "ancho": 1, "alto": 1, "vidrio": "Triple"},
                muro_sur, "Edificio Objeto", {})


def test_el_puente_de_un_hueco_se_asocia_al_MURO_no_al_hueco():
    """El nombre lleva el hueco pero cerramientoAsociado es el muro. Los dos
    nombres no son el mismo y confundirlos deja el puente huerfano."""
    pt = G.puente("Contorno de hueco", 5.8, "F11 CALLE", "Edificio Objeto",
                  etiqueta="V1")
    assert pt[0] == "PT Contorno de hueco-V1"
    assert pt[7] == "F11 CALLE"
    assert pt[3] == 0.55


def test_un_puente_termico_que_CE3X_no_tiene_se_rechaza():
    with pytest.raises(G.GeneracionError, match="no contemplado"):
        G.puente("Encuentro inventado", 1.0, "F11", "Edificio Objeto")


_GEO_CON_HUECO = {"elementos": [{
    "id": "F11", "planta": "PB", "tipo": "FACHADA", "subtipo": "CALLE",
    "orientacion": "S", "largo": {"value": 14.13}, "alto": {"value": 2.8},
    "superficie": {"value": 39.56},
}]}


def _datos_con_huecos(huecos):
    d = _datos_minimos("Edificio Objeto", [])
    d["envolvente"]["huecos"] = huecos
    return d


def test_se_generan_los_puentes_de_cada_hueco_y_de_cada_fachada():
    env, _ = G.construir_envolvente(_GEO_CON_HUECO, _datos_con_huecos([
        {"id": "V1", "cerramiento": "F11 CALLE", "ancho": 1.5, "alto": 1.4,
         "persiana": True}]))
    tipos = [str(pt[2]) for pt in env[2]]
    assert tipos.count("Contorno de hueco") == 1
    assert tipos.count("Caja de Persiana") == 1
    assert tipos.count("Encuentro de fachada con forjado") == 1
    assert tipos.count("Pilar en Esquina") == 1
    contorno = next(pt for pt in env[2] if str(pt[2]) == "Contorno de hueco")
    assert float(contorno[4]) == pytest.approx(2 * (1.5 + 1.4), abs=0.01)
    persiana = next(pt for pt in env[2] if str(pt[2]) == "Caja de Persiana")
    assert float(persiana[4]) == pytest.approx(1.5, abs=0.01)


def test_sin_persiana_no_hay_puente_de_caja_de_persiana():
    env, _ = G.construir_envolvente(_GEO_CON_HUECO, _datos_con_huecos([
        {"id": "PE", "cerramiento": "F11 CALLE", "ancho": 1.1, "alto": 2.1,
         "persiana": False}]))
    assert "Caja de Persiana" not in [str(pt[2]) for pt in env[2]]


def test_un_hueco_en_un_cerramiento_que_no_existe_se_dice():
    with pytest.raises(G.GeneracionError, match="no es ninguno de los cerramientos"):
        G.construir_envolvente(_GEO_CON_HUECO, _datos_con_huecos([
            {"id": "V1", "cerramiento": "F99 INVENTADA", "ancho": 1.5, "alto": 1.4}]))


def test_no_se_pone_un_hueco_en_una_medianera_ni_en_una_particion():
    """Un hueco solo va en un cerramiento al exterior. La puerta del garaje
    NO es hueco de la vivienda: el garaje es espacio no habitable."""
    geo = {"elementos": [{
        "id": "M01", "planta": "PB", "tipo": "MEDIANERA", "subtipo": "",
        "orientacion": "N", "largo": {"value": 9.05}, "alto": {"value": 2.8},
        "superficie": {"value": 25.34}}]}
    with pytest.raises(G.GeneracionError, match="solo va en un cerramiento al exterior"):
        G.construir_envolvente(geo, _datos_con_huecos([
            {"id": "V1", "cerramiento": "M01 MEDIANERA", "ancho": 1.5, "alto": 1.4}]))


# --------------------------------------------------------------------------
# Instalaciones (pickle 4)
# --------------------------------------------------------------------------

CALDERA = {
    "slot": "mixto2", "nombre": "CALDERA X", "generador": "Caldera Estándar",
    "combustible": "Gasóleo-C", "aislamiento": "Sin aislamiento",
    "rend_combustion": "84", "potencia": "23.3", "acumulacion": False,
    "superficie_acs": 165, "superficie_calefaccion": 165,
}


def _datos_instalacion(eq):
    d = _datos_minimos("Edificio Objeto", [])
    d["instalaciones"] = [eq]
    return d


def test_la_caldera_va_al_slot_de_mixto_y_los_demas_quedan_vacios():
    slots, _ = G.construir_instalaciones(_datos_instalacion(CALDERA), [])
    assert len(slots) == 12
    assert [i for i, s in enumerate(slots) if s] == [4]      # 4 = 'mixto2'
    assert slots[4][0][1] == "mixto2"


def test_el_rendimiento_estacional_es_el_de_combustion_menos_su_constante():
    """CE3X no guarda ese numero: lo calcula. La cuenta esta MEDIDA sobre el
    corpus, y por eso se puede reproducir en vez de inventarla."""
    slots, avisos = G.construir_instalaciones(_datos_instalacion(CALDERA), [])
    assert slots[4][0][2] == [48.9, 48.9, ""]                # 84 - 35.1
    assert any("CALCULA CE3X" in a for a in avisos)          # y se dice


def test_una_caldera_mejor_aislada_rinde_mas():
    eq = dict(CALDERA, aislamiento="Bien aislada y mantenida")
    slots, _ = G.construir_instalaciones(_datos_instalacion(eq), [])
    assert slots[4][0][2][0] == pytest.approx(84 - 12.8, abs=0.05)


def test_sin_acumulacion_el_bloque_es_un_False_a_secas():
    slots, _ = G.construir_instalaciones(_datos_instalacion(CALDERA), [])
    assert slots[4][0][8] == [False]


def test_con_acumulacion_se_escriben_los_siete_campos():
    eq = dict(CALDERA, acumulacion={"volumen": 150})
    slots, _ = G.construir_instalaciones(_datos_instalacion(eq), [])
    assert slots[4][0][8] == [True, "150", "80", "60", "4.7", "Por defecto", "1"]


def test_un_aislamiento_que_CE3X_no_tiene_se_rechaza():
    eq = dict(CALDERA, aislamiento="Regularcilla")
    with pytest.raises(G.GeneracionError, match="aislamiento de caldera no valido"):
        G.construir_instalaciones(_datos_instalacion(eq), [])


def test_sin_instalaciones_los_doce_slots_quedan_vacios():
    slots, avisos = G.construir_instalaciones(_datos_minimos("Edificio Objeto", []), [])
    assert slots == [[] for _ in range(12)]
    assert avisos == []


def test_una_puerta_lleva_su_porcentaje_de_marco_no_el_de_una_ventana(muro_sur):
    """Una puerta de entrada es casi toda opaca: 80-90% de marco, no el 20%
    de una ventana. Con el 20% CE3X le cuenta vidrio que no tiene."""
    p = G.hueco({"id": "PE", "ancho": 1.1, "alto": 2.1, "porc_marco": "90",
                 "marco": "Madera"}, muro_sur, "Edificio Objeto", {})
    assert p.estado["porcMarco"] == "90"
    assert p.estado["Umarco"] == 2.2          # madera


def test_el_porcentaje_de_marco_por_defecto_es_el_de_una_ventana(muro_sur):
    v = G.hueco({"id": "V1", "ancho": 1.5, "alto": 1.4}, muro_sur, "Edificio Objeto", {})
    assert v.estado["porcMarco"] == "20"


# --------------------------------------------------------------------------
# Contraste contra las 327 unifamiliares reales del corpus
# --------------------------------------------------------------------------

def _envolvente_de(n_huecos, ancho, alto, fachada_m2=170.0, opaca_extra=300.0):
    muro = G.muro("F11 CALLE", fachada_m2, "S", fachada_m2 / 2.8, 2.8,
                  "Edificio Objeto", {"u": 1.69, "masa": 200.0})
    techo = G.cubierta("CU01", opaca_extra, "Edificio Objeto",
                       {"u": 1.69, "masa": 100.0})
    huecos = [G.hueco({"id": f"V{i}", "ancho": ancho, "alto": alto},
                      muro, "Edificio Objeto", {}) for i in range(n_huecos)]
    return [[muro, techo], huecos, [], []]


def test_una_envolvente_normal_no_da_ningun_aviso():
    """10 huecos de 1,5 x 1,7 sobre 170 m2 de fachada: justo la mediana."""
    env = _envolvente_de(11, 1.5, 1.7)
    assert G.contrastar(env, 190.0) == []


def test_avisa_cuando_hay_menos_hueco_del_que_pone_nadie():
    """El fichero puede estar perfecto y describir una casa sin ventanas."""
    avisos = G.contrastar(_envolvente_de(2, 0.6, 0.6), 190.0)
    assert any("hueco / fachada" in a and "POR DEBAJO" in a for a in avisos)
    assert any("numero de huecos" in a for a in avisos)


def test_avisa_cuando_hay_mas_hueco_del_que_pone_nadie():
    avisos = G.contrastar(_envolvente_de(30, 2.5, 2.2), 190.0)
    assert any("POR ENCIMA" in a for a in avisos)


def test_el_aviso_dice_contra_que_se_compara():
    """Un aviso sin el numero de al lado no sirve para decidir."""
    avisos = G.contrastar(_envolvente_de(2, 0.6, 0.6), 190.0)
    assert all("327 unifamiliares reales" in a and "mediana" in a for a in avisos)


def test_sin_superficie_util_solo_se_contrasta_lo_que_se_puede():
    """No se inventa una superficie para poder comparar."""
    avisos = G.contrastar(_envolvente_de(11, 1.5, 1.7), None)
    assert not any("superficie util" in a for a in avisos)


def test_un_equipo_en_una_zona_que_no_existe_NO_se_escribe():
    """El fallo del 2026-09-11: a la caldera se le escribio la zona 'auto' tal
    cual. CE3X abre el fichero y la instalacion NO aparece, sin decir nada.
    Es el mismo campo traicionero que el de los cerramientos."""
    d = _datos_instalacion(dict(CALDERA, zona="PLANTA QUINTA"))
    with pytest.raises(G.GeneracionError, match="no existe"):
        G.construir_instalaciones(d, [], {"PLANTA BAJA"})


def test_con_zonas_automaticas_el_equipo_va_a_la_raiz():
    """604 de los 620 equipos mixtos del corpus estan en 'Edificio Objeto'."""
    d = _datos_instalacion(CALDERA)
    d["envolvente"]["espacio"] = "auto"
    slots, _ = G.construir_instalaciones(d, [], {"PLANTA BAJA", "PLANTA 1"})
    assert slots[4][0][9] == "Edificio Objeto"


def test_un_equipo_puede_ir_a_una_zona_declarada():
    d = _datos_instalacion(dict(CALDERA, zona="PLANTA BAJA"))
    slots, _ = G.construir_instalaciones(d, [], {"PLANTA BAJA"})
    assert slots[4][0][9] == "PLANTA BAJA"


# --------------------------------------------------------------------------
# Medianera contra particion vertical
# --------------------------------------------------------------------------

_GEO_MEDIANERA = {"elementos": [{
    "id": "MBNE1", "planta": "PB", "nivel": 0, "tipo": "MEDIANERA",
    "subtipo": "EDIFICIO_COLINDANTE", "orientacion": "NE",
    "largo": {"value": 7.75}, "alto": {"value": 2.8},
    "superficie": {"value": 21.70},
}]}


def _datos_medianera(marcadas):
    d = _datos_minimos("Edificio Objeto", [])
    d["envolvente"]["medianeras_como_particion"] = marcadas
    return d


def test_por_defecto_un_muro_contra_el_vecino_es_medianera_adiabatica():
    env, _ = G.construir_envolvente(_GEO_MEDIANERA, _datos_medianera([]))
    m = env[0][0]
    assert len(m) == 13                      # el registro corto de medianera
    assert m[3] == 0                         # adiabatica: U = 0
    assert m[-1] == "edificio"


def test_si_al_otro_lado_hay_garaje_deja_de_ser_adiabatica():
    """Una medianera es adiabatica porque a los dos lados hace la misma
    temperatura. Con un garaje al otro lado, por ahi SE PIERDE CALOR."""
    env, avisos = G.construir_envolvente(_GEO_MEDIANERA, _datos_medianera(["MBNE1"]))
    m = env[0][0]
    assert len(m) == 15                      # ya es una particion interior
    assert m[1] == "Partición Interior"
    assert m[3] == 2.0                       # y tiene transmitancia de verdad
    assert m[-1] == "vertical"
    assert any("adiabatico" in a for a in avisos)


def test_la_superficie_es_la_misma_se_escriba_como_se_escriba():
    """Cambia el tipo de cerramiento, no la geometria."""
    a = G.construir_envolvente(_GEO_MEDIANERA, _datos_medianera([]))[0][0][0]
    b = G.construir_envolvente(_GEO_MEDIANERA, _datos_medianera(["MBNE1"]))[0][0][0]
    assert a[2] == b[2] == "21.7"


# --------------------------------------------------------------------------
# El nombre del hueco: es el que sale en CE3X y el que enlaza sus puentes
# --------------------------------------------------------------------------

_GEO_FACHADA = {"elementos": [{
    "id": "FBSO1", "planta": "PB", "nivel": 0, "tipo": "FACHADA",
    "subtipo": "CALLE", "orientacion": "SO",
    "largo": {"value": 7.0}, "alto": {"value": 2.8},
    "superficie": {"value": 19.60},
}]}


def _datos_con_huecos(huecos):
    d = _datos_minimos("Edificio Objeto", [])
    d["envolvente"]["huecos"] = huecos
    return d


def _un_hueco(nombre, **extra):
    return dict({"cerramiento": "FBSO1 CALLE", "ancho": 1.3, "alto": 1.3}, **extra,
                **({"id": nombre} if nombre is not None else {}))


def test_el_nombre_que_pone_el_certificador_es_el_que_ve_en_ce3x():
    """El campo del prototipo acaba en `descripcion`, sin pasar por un id
    interno: el certificador busca 'Salon' y encuentra 'Salon'."""
    env, _ = G.construir_envolvente(_GEO_FACHADA,
                                    _datos_con_huecos([_un_hueco("Salón sur")]))
    assert env[1][0].estado["descripcion"] == "Salón sur"


def test_el_puente_termico_dice_de_que_hueco_es_por_su_nombre():
    env, _ = G.construir_envolvente(_GEO_FACHADA,
                                    _datos_con_huecos([_un_hueco("Salón sur")]))
    assert any("Salón sur" in str(p[0]) for p in env[2])


def test_dos_huecos_con_el_mismo_nombre_NO_se_escriben():
    """CE3X enlaza el puente termico por el nombre del hueco. Repetido, el
    certificador no puede saber cual es cual ni cual tiene que corregir."""
    with pytest.raises(G.GeneracionError, match="repetido"):
        G.construir_envolvente(_GEO_FACHADA, _datos_con_huecos(
            [_un_hueco("V1"), _un_hueco("V1")]))


def test_un_hueco_sin_nombre_NO_se_escribe():
    with pytest.raises(G.GeneracionError, match="sin nombre"):
        G.construir_envolvente(_GEO_FACHADA, _datos_con_huecos([_un_hueco(None)]))


def test_un_hueco_va_a_la_ZONA_DE_SU_MURO_no_a_una_aparte():
    """Con el arbol partido por plantas, un hueco de la planta 1 tiene que
    colgar de PLANTA 1. Colgando de 'Edificio Objeto' —que con zonas ya no
    existe— CE3X abre el fichero y sencillamente no lo ensena."""
    geo = {"elementos": [
        dict(_GEO_FACHADA["elementos"][0]),
        {"id": "F1SO1", "planta": "P1", "nivel": 1, "tipo": "FACHADA",
         "subtipo": "CALLE", "orientacion": "SO",
         "largo": {"value": 7.0}, "alto": {"value": 2.8},
         "superficie": {"value": 19.60}},
    ], "modelo": {"spaces": [
        {"floor": 0, "area": 147.0, "attrs": {"habitable": True}},
        {"floor": 1, "area": 84.0, "attrs": {"habitable": True}},
    ]}}
    d = _datos_minimos("auto", [])
    d["envolvente"]["huecos"] = [
        {"id": "V1", "cerramiento": "FBSO1", "ancho": 1.3, "alto": 1.3},
        {"id": "V2", "cerramiento": "F1SO1", "ancho": 1.3, "alto": 1.3}]
    d["envolvente"]["incluir_plantas"] = ["PB", "P1"]
    env, _ = G.construir_envolvente(geo, d)
    zonas = {str(z.estado["nombre"]) for z in env[3]}
    assert zonas == {"PLANTA BAJA", "PLANTA 1"}
    assert str(env[1][0].estado["subgrupo"]) == "PLANTA BAJA"
    assert str(env[1][1].estado["subgrupo"]) == "PLANTA 1"
    # y sus puentes termicos van con ellos
    assert {str(p[-1]) for p in env[2]} <= zonas


# --------------------------------------------------------------------------
# Las imagenes: el motor corre en un contenedor, la foto vive en Drive
# --------------------------------------------------------------------------

def _png_de_prueba(ancho=40, alto=30):
    from PIL import Image
    import io as _io
    buf = _io.BytesIO()
    Image.new("RGB", (ancho, alto), (200, 120, 40)).save(buf, "PNG")
    return buf.getvalue()


def test_una_imagen_puede_llegar_en_base64_y_no_solo_como_ruta():
    """El servicio no ve el disco de quien le llama: la foto viaja dentro."""
    import base64
    b64 = base64.b64encode(_png_de_prueba()).decode()
    assert G.imagen(b64)
    assert G.imagen("data:image/png;base64," + b64)


def test_la_imagen_en_base64_sale_con_los_134_px_de_CE3X():
    """CE3X SIEMPRE guarda 134 px de alto. Medido sobre 1.186 ficheros."""
    import base64, io as _io
    from PIL import Image
    b64 = base64.b64encode(_png_de_prueba(400, 300)).decode()
    salida = Image.open(_io.BytesIO(base64.b64decode(G.imagen(b64))))
    assert salida.height == G.ALTO_IMAGEN


def test_una_ruta_que_no_existe_sigue_siendo_un_error():
    """Aceptar base64 no puede volver silencioso el fallo de una ruta mala."""
    with pytest.raises(G.GeneracionError, match="no existe la imagen"):
        G.imagen("ejemplos/no-existe/fachada.jpg")


# --------------------------------------------------------------------------
# El tecnico que firma: sale de su ficha, NUNCA de una plantilla en el repo
# --------------------------------------------------------------------------

#: Lo minimo que exige `construir_administrativos`: solo lo del edificio.
_ADMIN_MINIMOS = {
    "nombre_edificio": {"valor": "VIVIENDA"}, "direccion": {"valor": "CL X 1"},
    "localidad_lista": {"valor": "Otro"}, "provincia": {"valor": "Toledo"},
    "localidad_texto": {"valor": "LOS YEBENES"},
    "codigo_postal": {"valor": "45470"},
    "referencia_catastral": {"valor": "5313707VJ2851S0001XK"},
    "cliente_nombre": {"valor": None}, "cliente_direccion": {"valor": None},
    "cliente_telefono": {"valor": None}, "cliente_email": {"valor": None},
    "cliente_localidad": {"valor": None}, "cliente_provincia": {"valor": None},
    "cliente_cp": {"valor": None},
}

def test_el_tecnico_sale_de_la_ficha_y_no_de_la_plantilla():
    """Cada certificador firma lo suyo con el mismo motor."""
    d = _datos_minimos("Edificio Objeto", [])
    d["administrativos"] = _ADMIN_MINIMOS
    d["tecnico"] = {"nombre": "Nombre Apellido", "telefono": "600000000",
                    "email": "tecnico@ejemplo.es", "nif": "00000000T"}
    out = G.construir_administrativos(d, [""] * 26)
    assert out[G.CAMPOS_TECNICO["nombre"]] == "Nombre Apellido"
    assert out[G.CAMPOS_TECNICO["nif"]] == "00000000T"


def test_sin_ficha_de_tecnico_se_respeta_lo_que_traiga_la_plantilla():
    """No se borra lo que hay: quien no mande tecnico, sigue como estaba."""
    plantilla = [""] * 26
    plantilla[G.CAMPOS_TECNICO["nombre"]] = "El De Siempre"
    d = _datos_minimos("Edificio Objeto", [])
    d["administrativos"] = _ADMIN_MINIMOS
    out = G.construir_administrativos(d, plantilla)
    assert out[G.CAMPOS_TECNICO["nombre"]] == "El De Siempre"


def test_la_plantilla_del_servicio_NO_lleva_datos_de_nadie():
    """Una plantilla con el DNI de una persona no puede vivir en un repo.

    Se comprueba la que se sirve de verdad, no una copia: si alguien la
    sustituye por un .cex suyo, este test lo caza.
    """
    from pathlib import Path
    plantilla = Path(__file__).resolve().parent.parent / "assets" / "plantilla-virgen.cex"
    if not plantilla.is_file():
        pytest.skip("solo aplica dentro del servicio cee-engine")
    admin = L.leer(L.trocear(plantilla), G.ADMINISTRATIVOS)
    con_algo = {i: v for i, v in enumerate(admin) if str(v) not in ("", "[]", "['']")}
    assert not con_algo, f"la plantilla lleva datos dentro: {con_algo}"
