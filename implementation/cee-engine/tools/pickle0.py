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

No se emiten `GET`: CE3X reusa valores del memo y aqui se escriben enteros cada
vez. Es equivalente al cargarlo, y evita tener que reproducir su numeracion.
"""
from __future__ import annotations

from typing import Any


class Cadena(str):
    """Un texto que se emite con `STRING` en vez de `UNICODE`.

    Para los literales del codigo de CE3X. Se comporta como un `str` normal.
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

    __slots__ = ("modulo", "clase", "estado")

    def __init__(self, modulo: str, clase: str, estado: dict):
        self.modulo = modulo
        self.clase = clase
        self.estado = estado

    def __repr__(self) -> str:
        return f"<Instancia {self.modulo}.{self.clase} {self.estado!r}>"


class Pickle0Error(Exception):
    """Hay algo que no se sabe escribir en protocolo 0."""


class Emisor:
    """Va escribiendo un pickle de protocolo 0."""

    def __init__(self) -> None:
        self.trozos: list[str] = []
        self.memo = 0

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
        self.trozos.append(f"I{int(i)}\n")

    def booleano(self, b: bool) -> None:
        # Python 2 escribia True/False en protocolo 0 como I01 / I00.
        self.trozos.append("I01\n" if b else "I00\n")

    def nulo(self) -> None:
        self.trozos.append("N")

    # -- contenedores -------------------------------------------------------
    def valor(self, v: Any) -> None:
        """Emite cualquier dato: contenedores incluidos, recursivamente."""
        if isinstance(v, Cadena):
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
            self._put()
            for x in v:
                self.valor(x)
                self.trozos.append("a")
        elif isinstance(v, dict):
            self.trozos.append("(d")
            self._put()
            for k, x in v.items():
                self.valor(k)
                self.valor(x)
                self.trozos.append("s")
        elif isinstance(v, Instancia):
            # MARK + INST(modulo, clase) + PUT, y luego el estado + BUILD.
            if "\n" in v.modulo or "\n" in v.clase:
                raise Pickle0Error("el nombre de la clase no puede llevar saltos de linea")
            self.trozos.append(f"(i{v.modulo}\n{v.clase}\n")
            self._put()
            self.valor(v.estado)
            self.trozos.append("b")
        else:
            raise Pickle0Error(f"no se sabe escribir un {type(v).__name__}")

    def texto(self) -> str:
        return "".join(self.trozos) + "."


def volcar(v: Any) -> str:
    """Un dato -> un pickle de protocolo 0 completo, con su STOP."""
    e = Emisor()
    e.valor(v)
    return e.texto()
