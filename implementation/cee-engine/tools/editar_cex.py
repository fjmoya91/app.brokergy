"""Cambia valores sueltos de un .cex dejando TODO lo demas byte a byte igual.

POR QUE ASI Y NO REESCRIBIENDO EL FICHERO
------------------------------------------
Un .cex lleva 15 pickles y solo uno interesa. Reescribirlo entero obligaria a
reproducir como emite CE3X: su numeracion de memo, cuando usa `STRING` (los
literales del codigo) y cuando `UNICODE` (lo que se teclea), como formatea los
`FLOAT`... Cada una de esas decisiones es una ocasion de escribir un fichero que
CE3X abra a medias. Aqui no se reescribe nada: se sustituyen LOS BYTES de un
valor y el resto del fichero sale igual que entro.

Dos cosas que lo hacen seguro, comprobadas sobre 1.196 .cex del disco:

* el protocolo 0 no guarda ni un solo offset absoluto — los `PUT`/`GET` son
  indices de memo, no posiciones — asi que un valor se puede sustituir por otro
  de LONGITUD DISTINTA sin descuadrar nada;
* el CRLF de Windows va y vuelve exacto (`\\r\\n` -> `\\n` -> `\\r\\n`) en los
  1.196 ficheros, asi que se puede editar sobre el texto normalizado y devolver
  el fichero con sus finales de linea de siempre.

Lo que este fichero NO hace: recalcular el pickle 14, que son 32 bytes en base64
con pinta de hash y cuya receta NO se conoce (no es un hash directo de ningun
trozo evidente del fichero). Si CE3X lo valida al abrir, esta via se cae — y eso
solo lo dice CE3X. Es justo la prueba para la que sirve esta herramienta.

USO
---
    # ver la envolvente con sus indices, para saber que tocar
    python tools/editar_cex.py ENTRADA.cex --listar

    # cambiar el campo 2 (superficie) del cerramiento 4 del bloque 0
    python tools/editar_cex.py ENTRADA.cex SALIDA.cex --cambio 3:0.4.2=33.6
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import leer_cex as L  # noqa: E402


class EdicionError(Exception):
    """No se puede hacer el cambio pedido sin arriesgarse a romper el fichero."""


class Marcado:
    """Un escalar del fichero, con los bytes donde vive.

    Se compara y se imprime como su valor, para que navegar la estructura sea
    igual que con el lector normal.
    """

    __slots__ = ("valor", "opcode", "ini", "fin")

    def __init__(self, valor, opcode: str, ini: int, fin: int):
        self.valor = valor
        self.opcode = opcode
        self.ini = ini
        self.fin = fin

    def __repr__(self) -> str:
        return repr(self.valor)

    def __eq__(self, otro) -> bool:
        return self.valor == (otro.valor if isinstance(otro, Marcado) else otro)

    def __hash__(self) -> int:
        return hash(self.valor)


def localizar(cex: L.Cex, indice: int):
    """Reconstruye un pickle con cada escalar sabiendo en que bytes vive."""
    return L.leer(cex, indice, envoltorio=Marcado)


def _navegar(dato, ruta: list[int]):
    for paso in ruta:
        if isinstance(dato, L.Opaco):
            dato = dato.estado
        if not isinstance(dato, (list, tuple)):
            raise EdicionError(f"la ruta se sale: {paso} sobre un {type(dato).__name__}")
        if paso >= len(dato):
            raise EdicionError(f"la ruta se sale: no hay indice {paso} en una lista de {len(dato)}")
        dato = dato[paso]
    return dato


def _cuenta_apariciones(dato, objetivo, vistos=None) -> int:
    """Cuantas veces aparece EL MISMO objeto en la estructura.

    Si CE3X memoizo el valor y lo reusa con `GET`, cambiar sus bytes cambiaria
    todos los sitios a la vez. Eso hay que verlo antes, no despues.
    """
    if vistos is None:
        vistos = set()
    if id(dato) in vistos:
        return 0
    n = 0
    if dato is objetivo:
        n += 1
    if isinstance(dato, (list, tuple)):
        vistos.add(id(dato))
        for x in dato:
            n += _cuenta_apariciones(x, objetivo, vistos)
    elif isinstance(dato, dict):
        vistos.add(id(dato))
        for x in dato.values():
            n += _cuenta_apariciones(x, objetivo, vistos)
    elif isinstance(dato, L.Opaco):
        vistos.add(id(dato))
        n += _cuenta_apariciones(dato.estado, objetivo, vistos)
        n += _cuenta_apariciones(list(dato.args), objetivo, vistos)
    return n


def bytes_de(valor: str, opcode: str) -> bytes:
    """Escribe un valor con el MISMO opcode que tenia, como lo haria CE3X."""
    if "\n" in valor or "\r" in valor:
        raise EdicionError("un valor con salto de linea rompe el protocolo 0")
    if opcode == "UNICODE":
        # Python 2 escribia `unicode` en protocolo 0 con raw-unicode-escape.
        return b"V" + valor.encode("raw_unicode_escape") + b"\n"
    if opcode == "STRING":
        if not valor.isascii():
            raise EdicionError("STRING no admite acentos; ese campo va en UNICODE")
        return b"S" + repr(valor).encode("ascii") + b"\n"
    if opcode == "FLOAT":
        return b"F" + repr(float(valor)).encode("ascii") + b"\n"
    if opcode == "INT":
        return b"I" + str(int(valor)).encode("ascii") + b"\n"
    raise EdicionError(f"no se sabe escribir un {opcode}")


def aplicar(ruta_entrada: Path, cambios: list[tuple[int, list[int], str]],
            verboso: bool = True) -> bytes:
    """Devuelve el .cex con los cambios hechos, listo para escribir en disco."""
    cex = L.trocear(ruta_entrada)
    if not cex.version_conocida:
        raise EdicionError(
            f"version {cex.version!r} no probada: no se escribe sobre ella. "
            f"Conocidas: {L.VERSIONES_CONOCIDAS}")

    data: bytes = cex._data  # type: ignore[attr-defined]

    # Se resuelven TODOS los cambios antes de tocar un byte, y se aplican de
    # atras hacia delante para que un cambio no mueva los siguientes.
    parches: list[tuple[int, int, bytes, str]] = []
    for indice, ruta, nuevo in cambios:
        arbol = localizar(cex, indice)
        destino = _navegar(arbol, ruta)
        if not isinstance(destino, Marcado):
            raise EdicionError(
                f"{indice}:{'.'.join(map(str, ruta))} no es un valor suelto, "
                f"es un {type(destino).__name__}")
        veces = _cuenta_apariciones(arbol, destino)
        if veces != 1:
            raise EdicionError(
                f"{indice}:{'.'.join(map(str, ruta))} = {destino.valor!r} esta "
                f"COMPARTIDO ({veces} sitios en el pickle {indice} apuntan a los "
                f"mismos bytes). Cambiarlo cambiaria todos a la vez.")
        crudo_nuevo = bytes_de(nuevo, destino.opcode)
        viejo = data[destino.ini:destino.fin]
        parches.append((destino.ini, destino.fin, crudo_nuevo,
                        f"pickle {indice} [{'.'.join(map(str, ruta))}] "
                        f"{destino.valor!r} -> {nuevo!r}  ({destino.opcode}, "
                        f"bytes {destino.ini}..{destino.fin}: {viejo!r} -> {crudo_nuevo!r})"))

    for ini, fin, nuevo_b, texto in sorted(parches, reverse=True):
        data = data[:ini] + nuevo_b + data[fin:]
        if verboso:
            print("  " + texto)

    # Se devuelve el CRLF. La ida y vuelta es exacta (ver docstring).
    return data.replace(L.LF, L.CRLF)


def comprobar(entrada: Path, salida: Path, cambios) -> None:
    """Relee el fichero escrito y comprueba que solo cambio lo que se pidio."""
    a = L.trocear(entrada)
    b = L.trocear(salida)
    if len(a.pickles) != len(b.pickles):
        raise EdicionError(f"el fichero escrito tiene {len(b.pickles)} pickles "
                           f"y el original {len(a.pickles)}")
    esperados = {c[0] for c in cambios}
    for i in range(len(a.pickles)):
        da, db = L.leer(a, i), L.leer(b, i)
        igual = repr(da) == repr(db)
        if i in esperados and igual:
            raise EdicionError(f"el pickle {i} tenia que cambiar y salio igual")
        if i not in esperados and not igual:
            raise EdicionError(f"el pickle {i} NO tenia que cambiar y ha cambiado")
    print(f"  comprobado: cambian solo los pickles {sorted(esperados)}, "
          f"los otros {len(a.pickles) - len(esperados)} quedan igual")


def listar(cex: L.Cex) -> None:
    """Ensena la envolvente con los indices que hay que dar en --cambio."""
    env = L.leer(cex, 3)
    if not isinstance(env, list):
        print("el pickle 3 no tiene la forma esperada")
        return
    print(f"{cex.ruta.name}: envolvente con {len(env)} bloques "
          f"{[len(b) if isinstance(b, list) else '?' for b in env]}")
    print("\nbloque 0 - cerramientos opacos")
    print("  ruta        campos  tipo                  nombre                        "
          "sup      largo x alto x n   espacio      da a")
    for i, el in enumerate(env[0] if isinstance(env[0], list) else []):
        if not isinstance(el, list) or len(el) < 13:
            print(f"  3:0.{i:<9} {el!r:.60}")
            continue
        largo, alto, mult = el[-5], el[-4], el[-3]
        print(f"  3:0.{i:<9} {len(el):>4}   {str(el[1]):<20}  {str(el[0])[:28]:<28}  "
              f"{str(el[2]):<8} {str(largo):>6} x {str(alto):<5} x {str(mult):<3} "
              f"{str(el[-2])[:12]:<12} {el[-1]}")
    print("\n  campos: 0 nombre · 1 tipo · 2 superficie · 3 transmitancia · 4 masa ·")
    print("          5 subtipo · 6 composicion · 7 patron de sombra · ... ·")
    print("          -5 largo · -4 alto · -3 multiplicador · -2 espacio · -1 da a")
    for j, bloque in enumerate(env[1:], start=1):
        if isinstance(bloque, list) and bloque:
            print(f"\nbloque {j}: {len(bloque)} elementos "
                  f"({type(bloque[0]).__name__})")


def _parsear_cambio(texto: str) -> tuple[int, list[int], str]:
    izq, sep, valor = texto.partition("=")
    if not sep:
        raise argparse.ArgumentTypeError(f"falta el '=' en --cambio {texto!r}")
    pick, sep2, ruta = izq.partition(":")
    if not sep2:
        raise argparse.ArgumentTypeError(f"falta el ':' en --cambio {texto!r}")
    try:
        return int(pick), [int(x) for x in ruta.split(".")], valor
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"--cambio {texto!r}: {exc}") from exc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Cambia valores de un .cex dejando el resto byte a byte igual.")
    ap.add_argument("entrada", type=Path)
    ap.add_argument("salida", type=Path, nargs="?")
    ap.add_argument("--listar", action="store_true",
                    help="ensena la envolvente con sus indices y no escribe nada")
    ap.add_argument("--cambio", action="append", default=[], type=_parsear_cambio,
                    metavar="PICKLE:i.j.k=VALOR",
                    help="p.ej. 3:0.4.2=33.6 (pickle 3, bloque 0, cerramiento 4, campo 2)")
    args = ap.parse_args(argv)

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    if args.listar:
        listar(L.trocear(args.entrada))
        return 0

    if not args.salida or not args.cambio:
        ap.error("hacen falta SALIDA y al menos un --cambio (o usa --listar)")

    if args.salida.resolve() == args.entrada.resolve():
        ap.error("la salida no puede ser la entrada: el original no se toca")

    print(f"{args.entrada.name} -> {args.salida.name}")
    try:
        nuevo = aplicar(args.entrada, args.cambio)
    except EdicionError as exc:
        print(f"NO SE ESCRIBE: {exc}")
        return 1
    args.salida.write_bytes(nuevo)
    print(f"  escrito: {len(nuevo)} bytes")
    try:
        comprobar(args.entrada, args.salida, args.cambio)
    except EdicionError as exc:
        print(f"AVISO, la comprobacion falla: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
