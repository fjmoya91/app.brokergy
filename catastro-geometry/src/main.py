"""CLI (§18).

    python -m src.main 4410205WJ0641S0001JH
    brokergy-geometry 4410205WJ0641S0001JH --output ./output --floor-height 2.70
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .catastro import refcat as refcat_mod
from .catastro.client import CatastroError
from .ce3x import export
from .pipeline import Opciones, analizar, construir_modelo, descargar, escribir_salidas
from .model import Modelo

log = logging.getLogger("brokergy-geometry")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="brokergy-geometry",
        description="Referencia catastral -> geometria de la envolvente lista para CE3X.",
        epilog="Los datos que Catastro no da salen como NO DISPONIBLE. Nunca se rellenan.")
    p.add_argument("refcat", help="referencia catastral de 14 (parcela) o 20 (inmueble)")
    p.add_argument("--output", type=Path, default=Path("output"))
    p.add_argument("--data", type=Path, default=Path("data"))
    p.add_argument("--cache", type=Path, default=Path("cache"))
    p.add_argument("--floor-height", type=float, default=None, metavar="M",
                   help="altura libre de planta en metros. Se marca como MANUAL.")
    p.add_argument("--tolerance", type=float, default=0.15, metavar="M",
                   help="boundary_tolerance_m para detectar medianeras (0.05-0.30)")
    p.add_argument("--min-contact", type=float, default=0.30, metavar="M")
    p.add_argument("--max-vecinos", type=int, default=12)
    p.add_argument("--dxf", type=Path, help="DXF de la parcela (uso <-> poligono, §6)")
    p.add_argument("--fxcc", type=Path, help="fichero FXCC (solo inventario, ver README)")
    p.add_argument("--debug", action="store_true")
    p.add_argument("--skip-lidar", action="store_true")
    p.add_argument("--offline", action="store_true",
                   help="solo cache: no toca la red. Falla si falta algo en cache.")
    p.add_argument("--refresh", action="store_true", help="ignora la cache")
    p.add_argument("--retries", type=int, default=4,
                   help="reintentos por peticion, con backoff exponencial")
    p.add_argument("--timeout", type=float, default=30.0)
    p.add_argument("--fixture", type=Path,
                   help="PRUEBAS: sirve las respuestas desde ficheros de este "
                        "directorio en vez de la red")
    p.add_argument("--only-fetch", action="store_true",
                   help="solo descarga a cache/ y data/raw/ y termina")
    return p


def _corta(txt: str, n: int = 200) -> str:
    return txt if len(txt) <= n else txt[:n].rstrip() + " ... (completo en diagnostico.json)"


def _causa_raiz(modelo: Modelo) -> str | None:
    """Si TODAS las llamadas murieron en la conexion, el problema no es Catastro."""
    traza = modelo.catastro.get("traza_http", [])
    fallos = [c for c in traza if c.get("error")]
    if not traza or len(fallos) != len(traza):
        return None
    conexion = [c for c in fallos
                if any(m in (c.get("error") or "").lower()
                       for m in ("tunnel", "forbidden", "refused", "resolve",
                                 "timed out", "unreachable", "name or service"))]
    if len(conexion) == len(fallos):
        return ("CATASTRO_UNREACHABLE_FROM_THIS_HOST: ninguna peticion llego a salir de "
                "esta maquina (proxy, cortafuegos o DNS). No es que Catastro no tenga el "
                "dato: es que no se ha podido preguntar. Ejecuta `brokergy-geometry "
                "<RC> --only-fetch` desde una maquina con salida a ovc.catastro.meh.es y "
                "copia la carpeta cache/ aqui.")
    return None


def _diagnostico(out: Path, rc, modelo: Modelo, error: str | None) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    doc = {"referencia_catastral": rc.to_dict(),
           "estado": "INCOMPLETO",
           "error": error,
           "causa_raiz": _causa_raiz(modelo),
           "diagnostics": modelo.diagnostics.to_dict(),
           "traza_http": modelo.catastro.get("traza_http", [])}
    p = out / "diagnostico.json"
    p.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(levelname)-7s %(message)s")

    try:
        rc = refcat_mod.parse(args.refcat)
    except refcat_mod.RefCatError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(f"\nReferencia catastral   {rc.inmueble or rc.parcela}")
    print(f"  parcela              {rc.parcela}")
    if rc.es_inmueble:
        estado = "OK" if rc.dc_ok else "NO CUADRA (revisa la referencia)"
        print(f"  inmueble             {rc.inmueble}  (digitos de control: {estado})")
    print()

    o = Opciones(refcat=rc.parcela, output=args.output, data=args.data,
                 cache=args.cache,
                 floor_height=args.floor_height if args.floor_height else 2.70,
                 floor_height_dada=args.floor_height is not None,
                 skip_lidar=args.skip_lidar, offline=args.offline,
                 refresh=args.refresh, tolerancia=args.tolerance,
                 min_contacto=args.min_contact, max_vecinos=args.max_vecinos,
                 dxf=args.dxf, fxcc=args.fxcc, solo_descargar=args.only_fetch,
                 fixture_dir=args.fixture, retries=args.retries,
                 timeout=args.timeout)

    modelo = Modelo(refcat_parcela=rc.parcela, refcat_inmueble=rc.inmueble,
                    crs=o.crs_metrico)
    feats = descargar(o, rc, modelo)

    if o.solo_descargar:
        print(f"Descarga terminada. Respuestas crudas en {o.data / 'raw'} "
              f"y cache en {o.cache / rc.parcela}")
        return 0

    construir_modelo(o, rc, feats, modelo)

    try:
        res = analizar(o, modelo)
    except CatastroError as exc:
        p = _diagnostico(args.output, rc, modelo, str(exc))
        print(f"\nNO SE HA PODIDO CONSTRUIR LA GEOMETRIA\n  {exc}\n")
        raiz = _causa_raiz(modelo)
        if raiz:
            print(f"  CAUSA RAIZ\n  {raiz}\n")
        for m in modelo.diagnostics.messages:
            print(f"  - {_corta(m)}")
        print(f"\nDiagnostico completo en {p}")
        return 1

    ficheros = escribir_salidas(o, res, rc)

    print(export.tabla_consola(res.elementos))
    r = export.resumen(res.elementos)
    print(f"\n{r['total']} cerramientos | {r['revision']} requieren revision")
    for tipo, n in sorted(r["por_tipo"].items()):
        m2 = r["superficie_por_tipo_m2"].get(tipo)
        print(f"  {tipo:<32} {n:>3}  {('%.2f m2' % m2) if m2 else ''}")

    if modelo.diagnostics.messages:
        print("\nLO QUE NO SE HA PODIDO OBTENER:")
        for m in modelo.diagnostics.messages:
            print(f"  - {_corta(m)}")

    print("\nFicheros generados:")
    for k, v in ficheros.items():
        print(f"  {k:<24} {v}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
