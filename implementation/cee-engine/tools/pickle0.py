"""Escribe pickles de PROTOCOLO 0 con el mismo estilo que CE3X.

Esto NO usa el modulo `pickle`: emite los opcodes a mano. Asi el fichero que
sale contiene exactamente lo que se ha querido poner y nada mas — ni un GLOBAL,
ni un REDUCE, ni nada que al abrirlo pudiera ejecutar algo.

LA REGLA DEL PROTOCOLO 0
------------------------
Solo llevan `\\n` los opcodes que traen argumento (`V` unicode, `S` str,
`F` float, `I` int, `p` put, `g` get). Los demas —`(` marca, `l` lista,
`a` append, `d` dict, `s` setitem, `.` stop— son UN BYTE suelto. Y el memo
empieza de cero en cada pickle.

STRING O UNICODE
----------------
CE3X (Python 2.7) usa los dos, y no al azar: los literales de su propio codigo
van como `STRING` ('Fachada', 'Techo', 'aire', 'terreno', 'edificio',
'vertical', 'horizontal superior'...) y lo que sale de un desplegable o de un
campo de texto va como `UNICODE` ('Partición Interior', 'Local en superficie',
'NE', los nombres, los numeros tecleados).

En Python 2 `u'x' == 'x'` es cierto, asi que la distincion probablemente daria
igual — pero el objetivo es escribir lo que CE3X escribiria, no lo que le
valdria. Por eso existe `Cadena`: marca un texto para que salga como `STRING`.

No se emiten `GET` para lo que construye la app: CE3X reusa valores del memo y
aqui se escriben enteros cada vez. Es equivalente al cargarlo, y evita tener que
reproducir su numeracion.

LO QUE SE VUELVE A ESCRIBIR DE UN FICHERO SI COMPARTE
-----------------------------------------------------
Una medida de mejora CALCULADA guarda dos fotos del edificio, y dentro hay
REFERENCIAS CIRCULARES: cada contribucion energetica apunta a la lista que la
contiene (`objListado`). Medido: 18 ciclos en un .cex de la 2.3 y hasta 40 en
uno de la 3.1. Escribirlas "enteras cada vez" no termina nunca (RecursionError),
y por eso lo que viene de un fichero (`Lista`, `Dicc`, una `Instancia` marcada
`compartible` y toda `Reduccion`) se escribe como lo escribio CE3X: la primera
vez con su PUT y las siguientes con un GET al mismo sitio.

GLOBAL Y REDUCE, SOLO PARA REESCRIBIR LO QUE YA HABIA
-----------------------------------------------------
CE3X 3.1 guarda sus clases nuevas (el generador electrico de las placas, los
modelos de calculo que caben dentro de una medida) con
`copy_reg._reconstructor(clase, object, None)` + BUILD. Este emisor sabe
escribirlo, pero SOLO para volver a escribir lo que ya traia un fichero de CE3X
y solo con una LISTA BLANCA de clases (`GLOBALES_PERMITIDOS`): un fichero de
fuera que trajera un REDUCE a otra cosa no se "blanquea" a traves de la app.
Leer sigue sin ejecutar nada (ver tools/leer_cex.py).
"""
from __future__ import annotations

import re
from typing import Any


#: Las unicas referencias GLOBAL que se aceptan al reescribir un fichero: las
#: que escribe CE3X 3.1 para sus clases nuevas. Medido sobre los 6 `.cex` de la
#: 3.1 que hay en el disco: `copy_reg._reconstructor`, `__builtin__.object`,
#: `uuid.UUID` y clases del modulo `models` (GeneradorElectrico, Espacio,
#: Material, Marco, Vidrio, SistemaConstructivo, Sombra, Bomba, Ventilador,
#: Iluminacion…).
GLOBALES_PERMITIDOS = {
    ("copy_reg", "_reconstructor"), ("__builtin__", "object"), ("uuid", "UUID"),
}
_CLASE_MODELS = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def global_permitido(modulo: str, nombre: str) -> bool:
    return ((modulo, nombre) in GLOBALES_PERMITIDOS
            or (modulo == "models" and bool(_CLASE_MODELS.match(nombre or ""))))


class Cadena(str):
    """Un texto que se emite con `STRING` en vez de `UNICODE`.

    Para los literales del codigo de CE3X. Se comporta como un `str` normal.
    """

    __slots__ = ()


class CadenaLeida(Cadena):
    """Un STRING que venia en un fichero de CE3X y se vuelve a escribir igual.

    A diferencia de `Cadena` —los literales que escribe la app, que tienen que
    ser ASCII—, este puede llevar acentos: es como Python 2 escribio un `str` de
    bytes en latin-1 (`S'Gas\\xf3leo-C'`), y asi se reescribe.
    """

    __slots__ = ()


class Instancia:
    """Un objeto de una clase de CE3X, escrito con `INST` + `BUILD`.

    CE3X guarda asi las zonas (`ventanaSubgrupo.claseZona`) y los huecos
    (`Envolvente.objetosEnvolvente.HuecoEstimadas`): la clase por su nombre y el
    estado en un diccionario. Al abrir el fichero, CE3X construye el objeto.

    Esto NO es lo mismo que leer un pickle ajeno: aqui se escribe un fichero
    para CE3X, con una clase suya, y el nombre lo pone este proyecto — no viene
    de fuera. Leer sigue sin construir nada (ver tools/leer_cex.py).
    """

    __slots__ = ("modulo", "clase", "estado", "compartible")

    def __init__(self, modulo: str, clase: str, estado: dict, compartible: bool = False):
        self.modulo = modulo
        self.clase = clase
        self.estado = estado
        #: Viene de un fichero: si aparece dos veces es EL MISMO objeto (GET).
        self.compartible = compartible

    def __repr__(self) -> str:
        return f"<Instancia {self.modulo}.{self.clase} {self.estado!r}>"


class Global:
    """Una referencia `modulo.nombre` (opcode GLOBAL), de la lista blanca."""

    __slots__ = ("modulo", "nombre")

    def __init__(self, modulo: str, nombre: str):
        self.modulo = modulo
        self.nombre = nombre

    def __repr__(self) -> str:
        return f"<Global {self.modulo}.{self.nombre}>"


class Reduccion:
    """Un objeto que CE3X escribio con REDUCE (y su BUILD, si lo tenia).

    Solo existe para volver a escribir lo que ya traia un fichero: `funcion`
    es la que se llama al cargar (`copy_reg._reconstructor`) y `args` sus
    argumentos (la clase, `object`, None). Siempre se comparte: si aparece dos
    veces es el mismo objeto.
    """

    __slots__ = ("modulo", "nombre", "args", "estado")

    def __init__(self, modulo: str, nombre: str, args: tuple = (), estado: Any = None):
        self.modulo = modulo
        self.nombre = nombre
        self.args = args
        self.estado = estado

    def __repr__(self) -> str:
        return f"<Reduccion {self.modulo}.{self.nombre}>"


class Lista(list):
    """Una lista leida de un fichero: si aparece dos veces es la MISMA (GET)."""

    __slots__ = ()


class Dicc(dict):
    """Un diccionario leido de un fichero: si aparece dos veces es el MISMO (GET)."""

    __slots__ = ()


class Pickle0Error(Exception):
    """Hay algo que no se sabe escribir en protocolo 0."""


class Emisor:
    """Va escribiendo un pickle de protocolo 0."""

    def __init__(self) -> None:
        self.trozos: list[str] = []
        self.memo = 0
        #: id() de lo ya escrito que se COMPARTE -> su indice de memo.
        self._compartidos: dict[int, int] = {}
        #: Mantiene vivos esos objetos mientras se escribe: un id() solo es
        #: unico mientras el objeto exista.
        self._vivos: list[Any] = []

    def _ya_escrito(self, v: Any) -> bool:
        """Si `v` es compartible y ya salio, escribe un GET y devuelve True."""
        i = self._compartidos.get(id(v))
        if i is None:
            return False
        self.trozos.append(f"g{i}\n")
        return True

    def _recordar(self, v: Any, indice: int) -> None:
        self._compartidos[id(v)] = indice
        self._vivos.append(v)

    @staticmethod
    def _es_compartible(v: Any) -> bool:
        return (isinstance(v, (Lista, Dicc, Reduccion))
                or (isinstance(v, Instancia) and v.compartible))

    # -- opcodes con memo ---------------------------------------------------
    def _put(self) -> int:
        i = self.memo
        self.trozos.append(f"p{i}\n")
        self.memo += 1
        return i

    # -- escalares ----------------------------------------------------------
    def cadena(self, s: str) -> None:
        """STRING. Python 2 lo escribia con `repr()`, que escapa a ASCII."""
        if not s.isascii():
            raise Pickle0Error(
                f"{s!r} lleva caracteres no ASCII y no puede ir como STRING; "
                f"usa un str normal para que salga como UNICODE")
        self.trozos.append("S" + repr(str(s)) + "\n")
        self._put()

    def cadena_leida(self, s: str) -> None:
        """STRING de bytes latin-1, escapado como lo escribia Python 2.

        `repr()` de unos bytes en Python 3 sigue las mismas reglas que el
        `repr()` de un `str` de Python 2 (comillas, \\t \\n \\r \\\\ y \\xNN
        para lo no imprimible y lo que no es ASCII).
        """
        self.trozos.append("S" + repr(str(s).encode("latin-1"))[1:] + "\n")
        self._put()

    #: Lo que la tipografia moderna escribe y latin-1 no tiene. Un `.cex` es un
    #: pickle de PROTOCOLO 0 y acaba guardandose en latin-1: una raya larga o
    #: unas comillas tipograficas revientan la escritura ENTERA con un "codec
    #: can't encode character" que solo da una posicion en bytes. Y en
    #: castellano se cuelan solas: cualquier texto copiado las lleva.
    TIPOGRAFICOS = {
        "—": "-", "–": "-", "‒": "-", "−": "-",
        "“": '"', "”": '"', "„": '"',
        "‘": "'", "’": "'", "‚": "'",
        "…": "...", " ": " ", " ": " ", " ": " ",
        "•": "-", "→": "->",
    }

    def unicode(self, s: str) -> None:
        r"""UNICODE. Python 2 lo escribia con raw-unicode-escape.

        El opcode V termina en un salto de linea, asi que un salto DENTRO del
        texto partiria el opcode en dos. Python 2 lo resolvia escapandolo
        (`pickle.save_unicode`) y CE3X escribe exactamente eso: medido en el
        cuadro de «Pruebas, comprobaciones e inspecciones» de un .cex real, los
        parrafos van como \u000a. El orden importa: la barra invertida
        PRIMERO, o se escaparia la que acaba de ponerse.

        Se escapa tambien el retorno de carro, que Python 2 no escapaba: el
        fichero se guarda con CRLF y se relee normalizandolo, asi que un CRLF
        dentro del texto volveria como un solo salto y el dato cambiaria por el
        camino.
        """
        s = self._latin1(s)
        s = (s.replace(chr(92), chr(92) + "u005c")
              .replace(chr(10), chr(92) + "u000a")
              .replace(chr(13), chr(92) + "u000d"))
        self.trozos.append("V" + s + chr(10))
        self._put()

    @classmethod
    def _latin1(cls, s: str) -> str:
        """El texto como puede guardarlo un `.cex`.

        Los tipograficos se cambian por su equivalente de toda la vida; lo que
        aun asi no quepa se dice CON EL CARACTER Y EL TEXTO delante, que es lo
        que hace falta para arreglarlo.
        """
        for malo, bueno in cls.TIPOGRAFICOS.items():
            if malo in s:
                s = s.replace(malo, bueno)
        try:
            s.encode("latin-1")
        except UnicodeEncodeError as exc:
            malo = s[exc.start:exc.end]
            raise Pickle0Error(
                f"{malo!r} (U+{ord(malo[0]):04X}) no cabe en un .cex, que se "
                f"guarda en latin-1. Esta en: {s[:80]!r}") from exc
        return s

    def flotante(self, f: float) -> None:
        self.trozos.append(f"F{f!r}\n")     # los FLOAT no se memoizan

    def entero(self, i: int) -> None:
        # Python 2 escribia como LONG lo que no cabia en un int de 32 bits (el
        # `id` de un UUID de la 3.1, p. ej.). Se escribe igual.
        if -2 ** 31 <= int(i) < 2 ** 31:
            self.trozos.append(f"I{int(i)}\n")
        else:
            self.trozos.append(f"L{int(i)}L\n")

    def booleano(self, b: bool) -> None:
        # Python 2 escribia True/False en protocolo 0 como I01 / I00.
        self.trozos.append("I01\n" if b else "I00\n")

    def nulo(self) -> None:
        self.trozos.append("N")

    # -- contenedores -------------------------------------------------------
    def valor(self, v: Any) -> None:
        """Emite cualquier dato: contenedores incluidos, recursivamente."""
        if self._es_compartible(v) and self._ya_escrito(v):
            return
        if isinstance(v, CadenaLeida):
            self.cadena_leida(v)
        elif isinstance(v, Cadena):
            self.cadena(v)
        elif isinstance(v, str):
            self.unicode(v)
        elif isinstance(v, bool):
            self.booleano(v)
        elif isinstance(v, int):
            self.entero(v)
        elif isinstance(v, float):
            self.flotante(v)
        elif v is None:
            self.nulo()
        elif isinstance(v, (list, tuple)):
            self.trozos.append("(l")
            i = self._put()
            if isinstance(v, Lista):
                # Se recuerda ANTES de escribir lo de dentro: si dentro hay una
                # referencia a esta misma lista (un ciclo), sale como GET.
                self._recordar(v, i)
            for x in v:
                self.valor(x)
                self.trozos.append("a")
        elif isinstance(v, dict):
            self.trozos.append("(d")
            i = self._put()
            if isinstance(v, Dicc):
                self._recordar(v, i)
            for k, x in v.items():
                self.valor(k)
                self.valor(x)
                self.trozos.append("s")
        elif isinstance(v, Instancia):
            # MARK + INST(modulo, clase) + PUT, y luego el estado + BUILD.
            if "\n" in v.modulo or "\n" in v.clase:
                raise Pickle0Error("el nombre de la clase no puede llevar saltos de linea")
            self.trozos.append(f"(i{v.modulo}\n{v.clase}\n")
            i = self._put()
            if v.compartible:
                self._recordar(v, i)
            self.valor(v.estado)
            self.trozos.append("b")
        elif isinstance(v, Global):
            self._global(v.modulo, v.nombre)
        elif isinstance(v, Reduccion):
            # GLOBAL funcion + MARK args TUPLE + REDUCE + PUT, y su BUILD. Es
            # exactamente lo que escribe CE3X 3.1 (`ccopy_reg\n_reconstructor`).
            self._global(v.modulo, v.nombre)
            self.trozos.append("(")
            for a in v.args:
                self.valor(a)
            self.trozos.append("t")
            self._put()
            self.trozos.append("R")
            i = self._put()
            self._recordar(v, i)
            if v.estado is not None:
                self.valor(v.estado)
                self.trozos.append("b")
        else:
            raise Pickle0Error(f"no se sabe escribir un {type(v).__name__}")

    def _global(self, modulo: str, nombre: str) -> None:
        if not global_permitido(modulo, nombre):
            raise Pickle0Error(
                f"{modulo}.{nombre} no esta en la lista blanca de clases de CE3X: "
                f"no se reescribe un objeto que no sabemos que es")
        if "\n" in modulo or "\n" in nombre:
            raise Pickle0Error("el nombre de la clase no puede llevar saltos de linea")
        self.trozos.append(f"c{modulo}\n{nombre}\n")
        self._put()

    def texto(self) -> str:
        return "".join(self.trozos) + "."


def volcar(v: Any) -> str:
    """Un dato -> un pickle de protocolo 0 completo, con su STOP."""
    e = Emisor()
    e.valor(v)
    return e.texto()
