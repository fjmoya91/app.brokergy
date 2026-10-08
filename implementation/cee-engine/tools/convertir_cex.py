"""Que un .cex que YA existe salga en la version de CE3X que se pide.

El CEE final se hace copiando el inicial (`/cex/instalaciones`) o desde la
medida de mejora del inicial del tecnico (`cee_final.py`), y ese inicial puede
estar hecho con la 2.3 o la 3.1 aunque el final se emita con la 3.2 —es justo lo
que pasa con todo lo que estaba en marcha el 01/10/2026 y el 08/10/2026—. Este
modulo completa los `cambios` que ya se iban a escribir para que el fichero salga
en la version de destino:

  · de la 2.3 a la 3.1 o la 3.2: se reescriben tambien la cabecera, los datos
    administrativos y generales (con sus campos nuevos), las instalaciones (con
    su potencia) y el informe. Lo que el fichero ya dice —la superficie, las
    plantas, la titulacion que tecleo el tecnico— manda (`extra_de_cex`).
  · entre la 3.1 y la 3.2: SOLO la cabecera (la forma es la misma, medido sobre
    los ejemplos oficiales de las dos), y las recomendaciones de uso si faltan.
  · de la 3.1 o la 3.2 a la 2.3: solo si no se pierde nada que la 2.3 no sepa
    abrir (`version_ce3x.bajable`); si no, se dice y no se escribe.

La envolvente (pickle 3) es igual en las dos y no se toca nunca.

Y POR LINEA DE ORDENES, para un .cex suelto (el que un tecnico migro a mano, el
de un expediente antiguo):

    python tools/convertir_cex.py entrada.cex [--a 3.2|3.1|2.3] [--salida salida.cex]
                                  [--viviendas N] [--uso ResidencialPrivado]

Sin `--salida` escribe al lado `<nombre>_v32.cex` (o `_v31`, `_v23`). ⚠ Nunca con
PUNTOS en el nombre: el generador del PDF oficial (xml2cert) no encuentra el
XML de un fichero llamado «… CEE FINAL_3.1.cex».
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import editar_cex as E        # noqa: E402
import generar_cex as G       # noqa: E402
import leer_cex as L          # noqa: E402
import version_ce3x as VC     # noqa: E402
from errores import GeneracionError  # noqa: E402


def version_y_programa(base: Any) -> tuple[str, str]:
    """(version, programa) de un .cex, o error si su cabecera no es conocida."""
    vt = VC.de_cabecera(base.version)
    if not vt:
        raise GeneracionError(f"versión de .cex no probada: {base.version!r}")
    return vt


def instalaciones_internas(base: Any) -> tuple[list, dict]:
    """El pickle 4 del fichero en la forma interna (2.3) y lo que se le quita."""
    return VC.instalaciones_a_23(L.leer(base, G.INSTALACIONES))


def a_version(base: Any, cambios: dict, destino: str, ficha: dict | None = None,
              meta: dict | None = None, potencias: dict | None = None) -> list[str]:
    """Completa `cambios` (EN SITIO) para que el fichero salga en `destino`.

    `cambios` trae lo que ya se iba a escribir; su pickle 4, si viene, en la
    forma interna (la de la 2.3, como lo escriben los escritores del motor).
    `meta` es lo que devolvio `instalaciones_internas(base)`: con el se devuelven
    intactas las potencias que el tecnico ya habia puesto en la 3.1. Devuelve
    los avisos.
    """
    origen, tipo = version_y_programa(base)
    avisos: list[str] = []
    if destino not in VC.VERSIONES:
        raise GeneracionError(f"versión de CE3X {destino!r} no contemplada")

    if origen != destino and VC.es_moderna(origen) and VC.es_moderna(destino):
        # Entre la 3.1 y la 3.2 la forma es la MISMA: solo cambia la cabecera.
        cambios[0] = VC.cabecera(destino, tipo)
    elif origen != destino:
        # Al cambiar de version se reescriben TODOS los pickles que cambian de
        # forma, aunque el contenido sea el mismo.
        for i in (G.ADMINISTRATIVOS, G.GENERALES, G.INFORME):
            if i not in cambios:
                cambios[i] = G._reemitible(L.leer(base, i))
        if G.INSTALACIONES not in cambios:
            p4, meta_base = instalaciones_internas(base)
            cambios[G.INSTALACIONES] = G._reemitible(p4)
            meta = meta or meta_base
        cambios[0] = VC.cabecera(destino, tipo)

    if VC.es_moderna(destino):
        if not VC.es_moderna(origen):
            avisos.append(
                f"El fichero de partida estaba hecho con CE3X 2.3 y este sale para la {destino}: "
                f"se han rellenado los datos que la {destino} pide (superficie útil, nº de "
                "viviendas, plantas, uso, grado de protección y la potencia de cada "
                "equipo). Compruébalos en CE3X antes de calcular: las plantas sobre y bajo "
                "rasante son las del EDIFICIO ENTERO (manual de la 3.2, 6.6).")
        elif origen != destino:
            avisos.append(
                f"El fichero estaba hecho con CE3X {origen} y sale para la {destino}: tienen la "
                "misma forma y solo cambia la cabecera. Ábrelo y guárdalo con la "
                f"{destino}; ya no se puede abrir con la {origen} si se modifica en la "
                f"{destino}.")
        # Las RECOMENDACIONES DE USO van SIEMPRE en la 3.1 (decision del
        # usuario, 07/10/2026): un fichero que ya es de la 3.1 pero llega con la
        # casilla vacia (el del tecnico, o uno convertido antes) se completa
        # aunque no se fuera a reescribir su informe.
        if G.INFORME not in cambios:
            inf = L.leer(base, G.INFORME)
            if (isinstance(inf, list) and (len(inf) == 7 or (
                    len(inf) == 8 and not str(inf[VC.INFORME_RECOMENDACIONES] or "").strip()))):
                cambios[G.INFORME] = G._reemitible(inf)
                avisos.append("El informe no traía las recomendaciones de uso (Anexo III, 1): "
                              "se han puesto las de siempre. Revísalas en «Opciones del informe».")
        ext = VC.extra_de_cex(L.leer(base, G.ADMINISTRATIVOS), L.leer(base, G.GENERALES), ficha)
        avisos += VC.elevar(cambios, ext, potencias, meta, reemitir=G._reemitible, tipo=tipo)
        return avisos

    # destino 2.3
    motivos: list[str] = []
    if G.INSTALACIONES in cambios:
        # Lo que se va a escribir ya esta en la forma interna; lo que la 2.3 no
        # sabe abrir esta en `meta` (los dos slots nuevos).
        if meta and any(meta.get("extra") or []):
            motivos.append("las placas o un generador van como «generador eléctrico» "
                           "o termosolar de la 3.1")
    elif VC.es_moderna(origen):
        motivos += VC.bajable(L.leer(base, G.INSTALACIONES))
    if VC.es_moderna(origen) and G.MEDIDAS not in cambios:
        motivos += VC.bajable(None, L.leer(base, G.MEDIDAS))
    if motivos:
        raise GeneracionError(
            "No se puede escribir para CE3X 2.3 sin perder datos ("
            + "; ".join(motivos) + f"). Genéralo con la {VC.POR_DEFECTO}.")
    if VC.es_moderna(origen):
        avisos += VC.bajar(cambios)
    return avisos


def convertir_bytes(crudo: bytes, ficha: dict | None = None) -> tuple[bytes, list[str], str]:
    """El MISMO `.cex` en la version pedida (por defecto, la vigente: 3.2).

    Devuelve `(bytes, avisos, version de destino)`. Si ya es de esa version, el
    fichero vuelve tal cual y se dice. Es la logica de `/cex/convertir` y de la
    linea de ordenes: una sola.
    """
    ficha = ficha or {}
    base = L.trocear_bytes(crudo)
    if not base.version_conocida:
        raise GeneracionError(f"versión de .cex no probada: {base.version!r}")
    destino = VC.version_pedida(ficha)
    origen, _tipo = version_y_programa(base)
    if origen == destino:
        # Uno que YA es de la 3.x puede llegar sin las recomendaciones de uso:
        # se completan (es lo unico que `a_version` toca en ese caso).
        cambios: dict = {}
        avisos = a_version(base, cambios, destino, ficha) if VC.es_moderna(destino) else []
        if not cambios:
            return crudo, [f"El fichero ya es de CE3X {destino}: no hay nada que convertir."], destino
        return E.sustituir_pickles(crudo, cambios), avisos, destino
    cambios: dict = {}
    pot = VC.potencias_de_equipos(ficha.get("instalaciones"))
    avisos = a_version(base, cambios, destino, ficha, None, pot)
    return E.sustituir_pickles(crudo, cambios), avisos, destino


def nombre_de_salida(entrada: Path, destino: str) -> Path:
    """`<nombre>_v32.cex` al lado, sin puntos en el nombre (xml2cert no los soporta)."""
    tallo = entrada.stem.replace(".", "-")
    return entrada.with_name(f"{tallo}_v{destino.replace('.', '')}{entrada.suffix}")


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Pasa un .cex de una versión de CE3X a otra (2.3, 3.1, 3.2).")
    ap.add_argument("entrada", type=Path)
    ap.add_argument("--a", dest="version", default=VC.POR_DEFECTO, choices=VC.VERSIONES,
                    help=f"versión de destino (por defecto la vigente, {VC.POR_DEFECTO})")
    ap.add_argument("--salida", type=Path, default=None)
    ap.add_argument("--viviendas", default=None,
                    help="nº de viviendas o unidades de uso (un bloque no lo dice el fichero)")
    ap.add_argument("--uso", default=None, help="uso del edificio (RD 390/2021), p. ej. ResidencialPublico")
    a = ap.parse_args(argv)

    ce3x31 = {k: v for k, v in (("unidades_uso", a.viviendas), ("uso", a.uso)) if v}
    salida, avisos, destino = convertir_bytes(
        a.entrada.read_bytes(), {"version_ce3x": a.version, **({"ce3x31": ce3x31} if ce3x31 else {})})
    ruta = a.salida or nombre_de_salida(a.entrada, destino)
    if "." in ruta.stem:
        avisos.append(f"El nombre «{ruta.name}» lleva puntos: el PDF oficial (xml2cert) no se "
                      "generará. Quítaselos antes de exportar el XML.")
    ruta.write_bytes(salida)
    # La consola de Windows va en cp1252: lo que no quepa se sustituye en vez
    # de tumbar el programa con el fichero ya escrito.
    try:
        sys.stdout.reconfigure(errors="replace")
    except AttributeError:
        pass
    print(f"CE3X {destino}: {ruta}")
    for x in avisos:
        print(f"  ! {x}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
