"""Lector SEGURO de ficheros .cex de CE3X. NUNCA deserializa.

POR QUE ESTE FICHERO EXISTE
---------------------------
Un .cex es una secuencia de pickles de Python (ver docs/11). Un pickle NO es un
formato de datos: es un programa para una maquina de pila, y `pickle.load()` lo
EJECUTA. Basta un opcode GLOBAL+REDUCE para llamar a cualquier cosa del sistema.

Y estos ficheros vienen de fuera: correo, Drive, otros certificadores. Asi que
aqui no se carga nada. Se recorre con `pickletools.genops()`, que lee los
opcodes y no ejecuta ninguno, y los datos se reconstruyen A MANO con una maquina
de pila propia que solo sabe fabricar dict, list, tuple, str, int, float y None.

Lo que en un pickle de verdad construiria un objeto (GLOBAL, INST, OBJ, REDUCE,
BUILD) aqui NO importa el modulo ni llama al constructor: se queda anotado como
un marcador `Opaco` con el nombre de la clase y sus argumentos, que es
justamente el dato que interesa. Los 9 INST de CE3X son
`Envolvente.objetosEnvolvente.HuecoEstimadas`, y se ven sin ejecutar nada.

QUE SACA
--------
    version de cabecera, cuantos pickles hay, offset y tamano de cada uno,
    y un volcado legible del pickle 2 (datos generales) y del 3 (LA ENVOLVENTE)

USO
---
    python tools/leer_cex.py FICHERO.cex                # resumen + volcado 2 y 3
    python tools/leer_cex.py FICHERO.cex --volcado 3    # solo la envolvente
    python tools/leer_cex.py FICHERO.cex --volcado todos
    python tools/leer_cex.py FICHERO.cex --opcodes 3    # opcodes crudos, para diffs
    python tools/leer_cex.py A.cex B.cex --tabla        # una linea por fichero
"""
from __future__ import annotations

import argparse
import io
import pickletools
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

# CE3X escribe en modo texto de Windows: el fichero lleva CRLF y los pickles,
# que son de protocolo 0 (basado en lineas), no se parsean hasta deshacerlo.
CRLF = b"\r\n"
LF = b"\n"

# Cabeceras que este lector reconoce. La version esta dentro del fichero a
# proposito (docs/11): si CE3X cambia el formato, se ve aqui y no mas adelante.
VERSIONES_CONOCIDAS = ("CEXv2.3 Residencial",)

# El pickle 2 lleva la imagen del plano embebida y ocupa ~100 KB. En el volcado
# los textos largos se cortan; para verlos enteros esta --largo.
CORTE_TEXTO = 120


class CexError(Exception):
    """El fichero no se puede recorrer como un .cex."""


# --------------------------------------------------------------------------
# Marcadores: lo que NO se construye
# --------------------------------------------------------------------------

@dataclass
class Opaco:
    """Un objeto que el pickle mandaba construir y que aqui NO se construye.

    Guarda el nombre de la clase tal y como venia escrito en el fichero, sus
    argumentos y el estado que BUILD le pusiera. Nada de esto se importa ni se
    llama: es texto leido del disco.
    """

    clase: str
    args: tuple = ()
    estado: Any = None
    origen: str = "INST"

    def __repr__(self) -> str:
        trozos = [f"<{self.origen} {self.clase}"]
        if self.args:
            trozos.append(f" args={self.args!r}")
        if self.estado is not None:
            trozos.append(f" estado={self.estado!r}")
        return "".join(trozos) + ">"


@dataclass
class Global:
    """Una referencia a `modulo.nombre`. NO se importa: es solo el nombre."""

    modulo: str
    nombre: str

    def __repr__(self) -> str:
        return f"<GLOBAL {self.modulo}.{self.nombre}>"


class _Marca:
    """La marca `(` de la pila del pickle."""

    def __repr__(self) -> str:
        return "<MARCA>"


MARCA = _Marca()


@dataclass
class Pickle:
    """Un pickle dentro del .cex."""

    indice: int
    offset: int
    tam: int
    n_opcodes: int = 0
    error: str | None = None
    _datos: Any = None
    _leido: bool = False


@dataclass
class Cex:
    """Un fichero .cex ya troceado en sus pickles."""

    ruta: Path
    bytes_crudos: int
    bytes_norm: int
    version: str | None
    version_conocida: bool
    pickles: list[Pickle] = field(default_factory=list)
    cola: int = 0  # bytes sobrantes tras el ultimo STOP


# --------------------------------------------------------------------------
# Recorrido de opcodes — aqui no se ejecuta nada
# --------------------------------------------------------------------------

def normalizar(crudo: bytes) -> bytes:
    """Deshace el CRLF de Windows. Sin esto el protocolo 0 no parsea."""
    return crudo.replace(CRLF, LF)


def opcodes(data: bytes, offset: int = 0) -> Iterator[tuple[str, Any, int]]:
    """Recorre los opcodes de UN pickle desde `offset`, hasta su STOP.

    Devuelve (nombre, argumento, posicion). `pickletools.genops` solo lee: no
    importa modulos, no llama a nada y no construye objetos.
    """
    f = io.BytesIO(data)
    f.seek(offset)
    for op, arg, pos in pickletools.genops(f):
        yield op.name, arg, pos
        if op.name == "STOP":
            return


def _fin_de_pickle(data: bytes, offset: int) -> tuple[int, int]:
    """Devuelve (offset_del_siguiente, n_opcodes) recorriendo hasta el STOP."""
    f = io.BytesIO(data)
    f.seek(offset)
    n = 0
    for op, _arg, _pos in pickletools.genops(f):
        n += 1
        if op.name == "STOP":
            return f.tell(), n
    raise CexError(f"el pickle que empieza en {offset} no termina en STOP")


def trocear(ruta: Path) -> Cex:
    """Parte el .cex en sus pickles sin reconstruir nada todavia."""
    crudo = ruta.read_bytes()
    data = normalizar(crudo)

    cex = Cex(ruta=ruta, bytes_crudos=len(crudo), bytes_norm=len(data),
              version=None, version_conocida=False)

    offset = 0
    indice = 0
    while offset < len(data):
        # Un .cex acaba a veces con un salto de linea suelto tras el ultimo
        # STOP. Eso no es un pickle: es cola.
        if data[offset:].strip() == b"":
            cex.cola = len(data) - offset
            break
        try:
            siguiente, n_ops = _fin_de_pickle(data, offset)
        except Exception as exc:  # noqa: BLE001 - fichero de terceros, se anota
            cex.pickles.append(Pickle(indice=indice, offset=offset,
                                      tam=len(data) - offset,
                                      error=f"{type(exc).__name__}: {exc}"))
            break
        cex.pickles.append(Pickle(indice=indice, offset=offset,
                                  tam=siguiente - offset, n_opcodes=n_ops))
        offset = siguiente
        indice += 1

    cex._data = data  # type: ignore[attr-defined]

    if cex.pickles and cex.pickles[0].error is None:
        cabecera = leer(cex, 0)
        if isinstance(cabecera, str):
            cex.version = cabecera
            cex.version_conocida = cabecera in VERSIONES_CONOCIDAS
    return cex


# --------------------------------------------------------------------------
# Reconstruccion a mano: una maquina de pila que solo fabrica datos
# --------------------------------------------------------------------------

def reconstruir(data: bytes, offset: int = 0, envoltorio=None) -> Any:
    """Ejecuta los opcodes de datos sobre una pila propia. Sin `pickle`.

    Solo sabe fabricar contenedores y escalares. Los opcodes que en un pickle
    de verdad construirian objetos o llamarian a funciones (GLOBAL, INST, OBJ,
    REDUCE, BUILD) se resuelven a marcadores `Global`/`Opaco`: se anota QUE se
    pedia, y no se hace.

    `envoltorio(valor, opcode, inicio, fin)`, si se pasa, se aplica a cada
    escalar y recibe DONDE vive en el fichero. Lo usa tools/editar_cex.py para
    poder sustituir un valor sin tocar el resto del fichero.
    """
    pila: list[Any] = []
    memo: dict[Any, Any] = {}

    def desde_marca() -> list[Any]:
        for i in range(len(pila) - 1, -1, -1):
            if pila[i] is MARCA:
                trozo = pila[i + 1:]
                del pila[i:]
                return trozo
        raise CexError("opcode que pide una marca y no hay marca en la pila")

    def a_dict(pares: list[Any]) -> dict:
        d: dict = {}
        for i in range(0, len(pares) - 1, 2):
            clave, valor = pares[i], pares[i + 1]
            try:
                d[clave] = valor
            except TypeError:  # clave no hasheable: no deberia pasar en prot. 0
                d[repr(clave)] = valor
        return d

    # Se materializan para saber donde ACABA cada opcode: acaba donde empieza
    # el siguiente. Sin eso no se puede decir en que bytes vive un valor.
    ops = list(opcodes(data, offset))

    for i, (nombre, arg, pos) in enumerate(ops):
        fin = ops[i + 1][2] if i + 1 < len(ops) else pos

        # --- escalares -----------------------------------------------------
        if nombre in ("INT", "LONG", "FLOAT", "STRING", "UNICODE",
                      "BININT", "BININT1", "BININT2", "BINFLOAT",
                      "BINSTRING", "SHORT_BINSTRING", "BINUNICODE",
                      "SHORT_BINUNICODE", "BINBYTES", "SHORT_BINBYTES"):
            pila.append(arg if envoltorio is None
                        else envoltorio(arg, nombre, pos, fin))
        elif nombre == "NONE":
            pila.append(None)
        elif nombre == "NEWTRUE":
            pila.append(True)
        elif nombre == "NEWFALSE":
            pila.append(False)
        elif nombre == "PERSID" or nombre == "BINPERSID":
            # Un id persistente se resuelve con codigo del que cargo. Aqui no.
            pila.append(Opaco(clase=str(arg), origen="PERSID"))

        # --- contenedores --------------------------------------------------
        elif nombre == "MARK":
            pila.append(MARCA)
        elif nombre == "EMPTY_LIST":
            pila.append([])
        elif nombre == "EMPTY_DICT":
            pila.append({})
        elif nombre == "EMPTY_TUPLE":
            pila.append(())
        elif nombre == "EMPTY_SET":
            pila.append(set())
        elif nombre == "LIST":
            pila.append(desde_marca())
        elif nombre == "TUPLE":
            pila.append(tuple(desde_marca()))
        elif nombre in ("TUPLE1", "TUPLE2", "TUPLE3"):
            n = int(nombre[-1])
            trozo = pila[-n:]
            del pila[-n:]
            pila.append(tuple(trozo))
        elif nombre == "DICT":
            pila.append(a_dict(desde_marca()))
        elif nombre == "APPEND":
            valor = pila.pop()
            pila[-1].append(valor)
        elif nombre == "APPENDS":
            valores = desde_marca()
            pila[-1].extend(valores)
        elif nombre == "SETITEM":
            valor = pila.pop()
            clave = pila.pop()
            pila[-1][clave] = valor
        elif nombre == "SETITEMS":
            pares = desde_marca()
            pila[-1].update(a_dict(pares))
        elif nombre == "ADDITEMS":
            valores = desde_marca()
            pila[-1].update(valores)

        # --- memo ----------------------------------------------------------
        elif nombre in ("PUT", "BINPUT", "LONG_BINPUT"):
            memo[arg] = pila[-1]
        elif nombre in ("GET", "BINGET", "LONG_BINGET"):
            pila.append(memo[arg])
        elif nombre == "MEMOIZE":
            memo[len(memo)] = pila[-1]

        # --- pila ----------------------------------------------------------
        elif nombre == "POP":
            pila.pop()
        elif nombre == "POP_MARK":
            desde_marca()
        elif nombre == "DUP":
            pila.append(pila[-1])

        # --- lo que NO se construye ----------------------------------------
        elif nombre in ("GLOBAL", "STACK_GLOBAL"):
            if nombre == "GLOBAL":
                modulo, _, atributo = str(arg).partition(" ")
            else:
                atributo = pila.pop()
                modulo = pila.pop()
            pila.append(Global(modulo=str(modulo), nombre=str(atributo)))
        elif nombre == "INST":
            args = tuple(desde_marca())
            pila.append(Opaco(clase=str(arg).replace(" ", "."), args=args,
                              origen="INST"))
        elif nombre == "OBJ":
            trozo = desde_marca()
            clase = trozo[0] if trozo else None
            pila.append(Opaco(clase=_nombre_de(clase), args=tuple(trozo[1:]),
                              origen="OBJ"))
        elif nombre in ("REDUCE", "NEWOBJ"):
            args = pila.pop()
            clase = pila.pop()
            pila.append(Opaco(clase=_nombre_de(clase),
                              args=tuple(args) if isinstance(args, tuple) else (args,),
                              origen=nombre))
        elif nombre == "BUILD":
            estado = pila.pop()
            objeto = pila[-1]
            if isinstance(objeto, Opaco):
                objeto.estado = estado
            else:
                # __setstate__ sobre algo que no es un objeto nuestro: se anota
                # para no perderlo, en vez de aplicarlo a ciegas.
                pila[-1] = Opaco(clase=_nombre_de(objeto), estado=estado,
                                 origen="BUILD")

        elif nombre in ("PROTO", "FRAME"):
            pass
        elif nombre == "STOP":
            return pila.pop() if pila else None
        else:
            raise CexError(f"opcode no contemplado: {nombre}")

    raise CexError("se acabaron los opcodes sin llegar a STOP")


def _nombre_de(cosa: Any) -> str:
    if isinstance(cosa, Global):
        return f"{cosa.modulo}.{cosa.nombre}"
    if isinstance(cosa, Opaco):
        return cosa.clase
    return repr(cosa)


def leer(cex: Cex, indice: int, envoltorio=None) -> Any:
    """Reconstruye el pickle `indice` (con cache).

    Con `envoltorio` no se cachea: quien pide posiciones las quiere frescas.
    """
    p = cex.pickles[indice]
    if envoltorio is not None:
        return reconstruir(cex._data, p.offset, envoltorio=envoltorio)  # type: ignore[attr-defined]
    if not p._leido:
        try:
            p._datos = reconstruir(cex._data, p.offset,  # type: ignore[attr-defined]
                                   envoltorio=envoltorio)
        except Exception as exc:  # noqa: BLE001 - fichero de terceros
            p.error = f"{type(exc).__name__}: {exc}"
            p._datos = None
        p._leido = True
    return p._datos


# --------------------------------------------------------------------------
# Volcado legible
# --------------------------------------------------------------------------

def volcar(dato: Any, corte: int = CORTE_TEXTO, nivel: int = 0,
           sangria: str = "  ") -> str:
    """Escribe la estructura de forma legible, cortando los textos largos."""
    pre = sangria * nivel
    pre2 = sangria * (nivel + 1)

    if isinstance(dato, str):
        return _texto(dato, corte)
    if isinstance(dato, bytes):
        return _texto(repr(dato), corte)
    if isinstance(dato, (int, float, bool)) or dato is None:
        return repr(dato)

    if isinstance(dato, dict):
        if not dato:
            return "{}"
        lineas = [f"{pre2}{_texto(str(k), 60)}: "
                  f"{volcar(v, corte, nivel + 1, sangria)}" for k, v in dato.items()]
        return "{\n" + "\n".join(lineas) + f"\n{pre}}}"

    if isinstance(dato, (list, tuple)):
        if not dato:
            return "[]" if isinstance(dato, list) else "()"
        # Una lista de escalares cabe en una linea y se lee mucho mejor asi.
        if all(isinstance(x, (int, float, bool, type(None))) or
               (isinstance(x, str) and len(x) <= 20) for x in dato):
            cuerpo = ", ".join(volcar(x, corte, 0, sangria) for x in dato)
            if len(cuerpo) <= 100:
                return ("[" + cuerpo + "]") if isinstance(dato, list) else ("(" + cuerpo + ")")
        lineas = [f"{pre2}[{i}] {volcar(x, corte, nivel + 1, sangria)}"
                  for i, x in enumerate(dato)]
        abre, cierra = ("[", "]") if isinstance(dato, list) else ("(", ")")
        return abre + "\n" + "\n".join(lineas) + f"\n{pre}{cierra}"

    if isinstance(dato, Opaco):
        partes = [f"<{dato.origen} {dato.clase}>"]
        if dato.args:
            partes.append(f"{pre2}args: {volcar(list(dato.args), corte, nivel + 1, sangria)}")
        if dato.estado is not None:
            partes.append(f"{pre2}estado: {volcar(dato.estado, corte, nivel + 1, sangria)}")
        return "\n".join(partes)

    return repr(dato)


def _texto(s: str, corte: int) -> str:
    limpio = s.replace("\n", "\\n").replace("\r", "\\r")
    if corte and len(limpio) > corte:
        return f"{limpio[:corte]!r}... [+{len(limpio) - corte} car.]"
    return repr(limpio)


# --------------------------------------------------------------------------
# Informes
# --------------------------------------------------------------------------

def informe(cex: Cex, volcados: list[int], corte: int) -> str:
    sal: list[str] = []
    sal.append(f"FICHERO   {cex.ruta}")
    sal.append(f"bytes     {cex.bytes_crudos} crudos -> {cex.bytes_norm} sin CRLF")
    marca = "conocida" if cex.version_conocida else "DESCONOCIDA - no escribir sobre este fichero"
    sal.append(f"version   {cex.version!r}  [{marca}]")
    sal.append(f"pickles   {len(cex.pickles)}" + (f"  (+{cex.cola} bytes de cola)" if cex.cola else ""))
    sal.append("")
    sal.append("  #        offset        tam   opcodes  contenido")
    for p in cex.pickles:
        pinta = _que_pinta(cex, p)
        sal.append(f"{p.indice:3d}  {p.offset:12d} {p.tam:10d} {p.n_opcodes:9d}  {pinta}")
        if p.error:
            sal.append(f"     ERROR: {p.error}")
    for i in volcados:
        if i >= len(cex.pickles):
            continue
        sal.append("")
        sal.append("=" * 78)
        sal.append(f"PICKLE {i}   offset {cex.pickles[i].offset}  tam {cex.pickles[i].tam}")
        sal.append("=" * 78)
        dato = leer(cex, i)
        if cex.pickles[i].error:
            sal.append(f"ERROR: {cex.pickles[i].error}")
        else:
            sal.append(volcar(dato, corte))
    return "\n".join(sal)


def _que_pinta(cex: Cex, p: Pickle) -> str:
    """Una pista de una linea de lo que lleva el pickle, sin volcarlo entero."""
    if p.error:
        return "(no se pudo recorrer)"
    dato = leer(cex, p.indice)
    if cex.pickles[p.indice].error:
        return "(no se pudo reconstruir)"
    if isinstance(dato, str):
        return f"str {_texto(dato, 50)}"
    if isinstance(dato, (int, float)) or dato is None:
        return repr(dato)
    if isinstance(dato, dict):
        return f"dict de {len(dato)}: {list(dato)[:6]}"
    if isinstance(dato, (list, tuple)):
        cabeza = ", ".join(_texto(str(x), 22) if not isinstance(x, (list, dict, tuple))
                           else f"<{type(x).__name__} {len(x)}>" for x in dato[:5])
        return f"{type(dato).__name__} de {len(dato)}: {cabeza}"
    return repr(dato)[:70]


def linea_tabla(cex: Cex) -> str:
    ver = cex.version or "?"
    fallos = sum(1 for p in cex.pickles if p.error)
    tam3 = cex.pickles[3].tam if len(cex.pickles) > 3 else -1
    return (f"{len(cex.pickles):3d} pickles  ver={ver:<22}  "
            f"tam3={tam3:<8d} fallos={fallos}  {cex.ruta.name}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Lector SEGURO de .cex de CE3X: recorre opcodes, no deserializa.")
    ap.add_argument("ficheros", nargs="+", type=Path)
    ap.add_argument("--volcado", nargs="*", default=None,
                    help="indices a volcar, o 'todos'. Por defecto: 2 y 3.")
    ap.add_argument("--opcodes", type=int, default=None,
                    help="vuelca los opcodes crudos de ese pickle (para diffs)")
    ap.add_argument("--tabla", action="store_true",
                    help="una linea por fichero, para comparar muchos")
    ap.add_argument("--largo", action="store_true",
                    help="no cortar los textos largos")
    args = ap.parse_args(argv)

    # Los nombres que pone el certificador llevan acentos y enyes. La consola de
    # Windows es cp1252 y reventaria al imprimirlos; se fuerza UTF-8.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    corte = 0 if args.largo else CORTE_TEXTO
    fallos = 0

    for ruta in args.ficheros:
        try:
            cex = trocear(ruta)
        except Exception as exc:  # noqa: BLE001
            print(f"{ruta}: NO SE PUDO LEER - {type(exc).__name__}: {exc}")
            fallos += 1
            continue

        if args.tabla:
            print(linea_tabla(cex))
            continue

        if args.opcodes is not None:
            p = cex.pickles[args.opcodes]
            print(f"# opcodes del pickle {args.opcodes} de {ruta.name} "
                  f"(offset {p.offset}, tam {p.tam})")
            for nombre, arg, pos in opcodes(cex._data, p.offset):  # type: ignore[attr-defined]
                texto = _texto(str(arg), corte) if arg is not None else ""
                print(f"{pos:8d} {nombre:18s} {texto}")
            continue

        if args.volcado is None:
            volcados = [2, 3]
        elif args.volcado and args.volcado[0] == "todos":
            volcados = list(range(len(cex.pickles)))
        else:
            volcados = [int(x) for x in args.volcado]

        print(informe(cex, volcados, corte))
        print()

    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
