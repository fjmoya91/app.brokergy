"""Reconocimiento de los WFS del Catastro: SEIS peticiones, ni una mas.

Antes de pedir un solo dato se pregunta al servicio como se llaman sus cosas.
Sale mas barato en peticiones que adivinar: sin esto, cada consulta se prueba a
ciegas con varias combinaciones de parametros y se gastan decenas de peticiones
contra un WAF que corta al primer exceso, y que es el mismo del que depende el
buscador de la app en produccion.

    GetCapabilities        CP y BU   -> version, feature types, CRS admitidos
    DescribeStoredQueries  CP y BU   -> ids Y NOMBRES DE PARAMETRO reales
    ListStoredQueries      CP y BU   -> respaldo por si Describe no responde

Se guardan las respuestas CRUDAS para poder leerlas con los ojos.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.catastro.client import CatastroBlocked, CatastroClient, CatastroError  # noqa: E402
from src.catastro.inspire import ACCEPT_XML, WFS_BU, WFS_CP, WfsService          # noqa: E402

PETICIONES = [
    ("CP", WFS_CP, "capabilities_CP", {"service": "WFS", "request": "GetCapabilities"}),
    ("BU", WFS_BU, "capabilities_BU", {"service": "WFS", "request": "GetCapabilities"}),
    ("CP", WFS_CP, "describestoredqueries_CP",
     {"service": "WFS", "version": "2.0.0", "request": "DescribeStoredQueries"}),
    ("BU", WFS_BU, "describestoredqueries_BU",
     {"service": "WFS", "version": "2.0.0", "request": "DescribeStoredQueries"}),
    ("CP", WFS_CP, "liststoredqueries_CP",
     {"service": "WFS", "version": "2.0.0", "request": "ListStoredQueries"}),
    ("BU", WFS_BU, "liststoredqueries_BU",
     {"service": "WFS", "version": "2.0.0", "request": "ListStoredQueries"}),
]


def main(destino: Path, pausa: float = 1.5) -> int:
    destino.mkdir(parents=True, exist_ok=True)
    client = CatastroClient(cache_dir=destino / ".cache", retries=1,
                            pause_between_calls=pausa, timeout=25)
    informe: dict = {"peticiones": [], "pausa_s": pausa}
    fallos = 0

    for etiqueta, url, nombre, params in PETICIONES:
        try:
            data = client.get(url, params, name=nombre, accept=ACCEPT_XML)
            (destino / f"{nombre}.xml").write_bytes(data)
            informe["peticiones"].append({"nombre": nombre, "bytes": len(data), "ok": True})
            print(f"OK   {nombre}: {len(data)} bytes")
        except CatastroBlocked as exc:
            # Al WAF NO se le insiste: se para el reconocimiento entero.
            informe["peticiones"].append({"nombre": nombre, "ok": False,
                                          "bloqueado": True, "error": str(exc)})
            informe["parado_por_waf"] = True
            print(f"WAF  {nombre}: {exc}\nSe para para no castigar al servicio.")
            break
        except CatastroError as exc:
            fallos += 1
            informe["peticiones"].append({"nombre": nombre, "ok": False, "error": str(exc)})
            print(f"FALLO {nombre}: {exc}")
            if fallos >= 3:
                informe["parado_por_fallos"] = True
                print("Tres fallos seguidos: se para.")
                break

    # Lo interesante: que stored queries declara de verdad cada servicio
    for etiqueta, url in (("CP", WFS_CP), ("BU", WFS_BU)):
        srv = WfsService(url, etiqueta, CatastroClient(cache_dir=destino / ".cache",
                                                       offline=True,
                                                       fixture_dir=destino))
        try:
            qs = srv.stored_queries()
            informe[f"stored_queries_{etiqueta}"] = {
                "descubrimiento": srv.descubrimiento,
                "consultas": {k: {"titulo": v.titulo, "parametros": v.parametros}
                              for k, v in qs.items()},
                "elegidas": {p: srv.elegir(p).id
                             for p in ("parcela", "vecinos", "edificio", "partes")},
            }
        except Exception as exc:                              # pragma: no cover
            informe[f"stored_queries_{etiqueta}"] = {"error": str(exc)}

    informe["traza_http"] = client.trace()
    (destino / "informe.json").write_text(
        json.dumps(informe, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n{len(client.calls)} peticiones a Catastro. Informe en {destino/'informe.json'}")
    return 0


if __name__ == "__main__":
    d = Path(sys.argv[1] if len(sys.argv) > 1 else "data/reconocimiento")
    raise SystemExit(main(d, float(sys.argv[2]) if len(sys.argv) > 2 else 1.5))
