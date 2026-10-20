"""Que cuerpo es cada «_partN» en una lectura de Catastro, y con que CLAVE estable.

Lo usa el barrido de `cuerpos_fuera` (backend/scripts/barrido_cuerpos_fuera.mjs)
para ver si el numero que se guardo sigue siendo el mismo cuerpo: Catastro
reparte de nuevo los numeros de las partes en cada lectura (26RES060_226).

    python -m tools.numeracion_partes leer <fichero.gml> [...]
        → {fichero: [{id, clave, superficie, plantas_sobre, plantas_bajo, centro}]}

    python -m tools.numeracion_partes bajar <RC14> <carpeta>
        → baja AHORA las partes de la parcela (UNA peticion, con la pausa y los
          reintentos del cliente de siempre) y escribe <carpeta>/<RC14>.gml

    python -m tools.numeracion_partes zonas <fichero.gml> <zonas.json>
        → por cada parte, la fraccion de cada zona dibujada (EPSG:25830) que
          cae dentro: {id: [fraccion por zona]}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from shapely.geometry import Polygon

from src.catastro.client import CatastroClient
from src.catastro.inspire import WFS_BU
from src.gis.floors import clave_de
from src.gis.geometry import parse_gml, reproject

CRS = "EPSG:25830"


def partes(fichero: str | Path) -> list[dict]:
    out = []
    for f in parse_gml(Path(fichero).read_bytes(), "BU"):
        if f.geometry is None or not str(f.tipo or "").lower().endswith("part"):
            continue
        g = reproject(f.geometry, f.srs, CRS) if f.srs else f.geometry
        c = g.centroid
        out.append({
            "id": f.original_id, "clave": clave_de(f.original_id, g),
            "superficie": round(g.area, 2),
            "plantas_sobre": f.attrs.get("numberOfFloorsAboveGround"),
            "plantas_bajo": f.attrs.get("numberOfFloorsBelowGround"),
            "centro": [round(c.x, 2), round(c.y, 2)],
            "_geom": g,
        })
    return out


def _sin_geom(ps):
    return [{k: v for k, v in p.items() if k != "_geom"} for p in ps]


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "leer":
        print(json.dumps({f: _sin_geom(partes(f)) for f in argv[1:]}, ensure_ascii=False))
        return 0
    if len(argv) == 3 and argv[0] == "bajar":
        rc, carpeta = argv[1].upper(), Path(argv[2])
        carpeta.mkdir(parents=True, exist_ok=True)
        client = CatastroClient(cache_dir=carpeta / "_cache", refresh=True,
                                pause_between_calls=2.0)
        data = client.get(WFS_BU, {
            "service": "WFS", "version": "2.0.0", "request": "GetFeature",
            "STOREDQUERY_ID": "GetBuildingPartByParcel", "REFCAT": rc,
            "srsname": "EPSG::25830"}, name=f"partes_{rc}")
        destino = carpeta / f"{rc}.gml"
        destino.write_bytes(data)
        print(str(destino))
        return 0
    if len(argv) == 3 and argv[0] == "zonas":
        zonas = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
        polis = []
        for z in zonas:
            try:
                p = Polygon([(float(x), float(y)) for x, y in z.get("poligono") or []])
                polis.append(p if p.is_valid else p.buffer(0))
            except Exception:                                # noqa: BLE001
                polis.append(None)
        out = {}
        for p in partes(argv[1]):
            out[p["clave"]] = [round(z.intersection(p["_geom"]).area / z.area, 3)
                               if z is not None and z.area > 0 else 0.0 for z in polis]
        print(json.dumps(out))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
