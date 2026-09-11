"""Genera un juego de respuestas SINTETICAS con la forma de las de Catastro.

PARA QUE SIRVE
--------------
Para poder ejercitar el recorrido completo (descarga -> GML -> geometria ->
clasificacion -> CSV/JSON/mapa/plano) sin red, y para que los tests comprueben
un resultado que se conoce de antemano.

AVISO — esto NO es un edificio real. La referencia catastral es inventada
(9999999XX9999X) precisamente para que su salida no pueda confundirse nunca con
la de un expediente. Los ficheros llevan el aviso dentro.

El caso sintetico es una casa entre medianeras con:
    * huella 12 x 10 m, con un patio interior de 3 x 2
    * vecino al Este pegado en 6 de los 10 m y de UNA planta
      -> en PB: medianera 6 m + fachada 4 m; en P1: fachada, no medianera
    * vecino al Oeste pegado en todo el lado -> medianera 10 m
    * PB de almacen (114 m2) y P1 de vivienda (74 m2) -> vivienda sobre espacio
      no habitable, y cubierta parcial de 40 m2 sobre el almacen
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

RC = "9999999XX9999X"
AVISO = ("GEOMETRIA SINTETICA DE PRUEBA - NO CORRESPONDE A NINGUN INMUEBLE REAL "
         "(generada por tools/make_fixture.py)")


def _poslist(pts):
    return " ".join(f"{x} {y}" for x, y in pts)


def _polygon(ext, huecos=()):
    interiores = "".join(
        f'<gml:interior><gml:LinearRing><gml:posList srsDimension="2">'
        f'{_poslist(h)}</gml:posList></gml:LinearRing></gml:interior>' for h in huecos)
    return (f'<gml:Polygon><gml:exterior><gml:LinearRing>'
            f'<gml:posList srsDimension="2">{_poslist(ext)}</gml:posList>'
            f'</gml:LinearRing></gml:exterior>{interiores}</gml:Polygon>')


def _fc(miembros):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- {AVISO} -->
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0"
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0"
    xmlns:bu="http://inspire.ec.europa.eu/schemas/bu-core2d/4.0"
    xmlns:bue="http://inspire.ec.europa.eu/schemas/bu-ext2d/2.0">
{''.join(miembros)}
</wfs:FeatureCollection>"""


def _parcela(rc, ext):
    return (f'<wfs:member><cp:CadastralParcel gml:id="ES.SDGC.CP.{rc}">'
            f'<cp:areaValue uom="m2">{int(abs(_area(ext)))}</cp:areaValue>'
            f'<cp:nationalCadastralReference>{rc}</cp:nationalCadastralReference>'
            f'<cp:geometry><gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::25830">'
            f'<gml:surfaceMember>{_polygon(ext)}</gml:surfaceMember>'
            f'</gml:MultiSurface></cp:geometry></cp:CadastralParcel></wfs:member>')


def _area(pts):
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2


def _edificio(rc, ext, huecos=(), uso="1_residential"):
    return (f'<wfs:member><bu:Building gml:id="ES.SDGC.BU.{rc}">'
            f'<bu:currentUse>{uso}</bu:currentUse>'
            f'<bu:numberOfBuildingUnits>2</bu:numberOfBuildingUnits>'
            f'<bu:geometry><gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::25830">'
            f'<gml:surfaceMember>{_polygon(ext, huecos)}</gml:surfaceMember>'
            f'</gml:MultiSurface></bu:geometry></bu:Building></wfs:member>')


def _parte(pid, ext, plantas, bajo=0, huecos=()):
    return (f'<wfs:member><bue:BuildingPart gml:id="ES.SDGC.BU.{pid}">'
            f'<bue:numberOfFloorsAboveGround>{plantas}</bue:numberOfFloorsAboveGround>'
            f'<bue:numberOfFloorsBelowGround>{bajo}</bue:numberOfFloorsBelowGround>'
            f'<bue:geometry><gml:MultiSurface srsName="urn:ogc:def:crs:EPSG::25830">'
            f'<gml:surfaceMember>{_polygon(ext, huecos)}</gml:surfaceMember>'
            f'</gml:MultiSurface></bue:geometry></bue:BuildingPart></wfs:member>')


# Coordenadas ETRS89 / UTM 30N cerca de Ciudad Real, desplazadas a un descampado
X0, Y0 = 470000.0, 4340000.0


def P(*pts):
    return [(X0 + x, Y0 + y) for x, y in pts]


HUELLA = P((0, 0), (12, 0), (12, 10), (0, 10))
PATIO = P((4, 4), (7, 4), (7, 6), (4, 6))   # 3 x 2, dentro de la parte alta
PARCELA = HUELLA
VECINO_E = P((12, 0), (18, 0), (18, 6), (12, 6))
VECINO_O = P((-7, 0), (0, 0), (0, 10), (-7, 10))
PARTE_ALTA = P((0, 0), (8, 0), (8, 10), (0, 10))
PARTE_BAJA = P((8, 0), (12, 0), (12, 10), (8, 10))
RC_VE, RC_VO = "9999999XX9998X", "9999999XX9997X"


def escribir(destino: Path) -> Path:
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "LEEME.txt").write_text(AVISO + "\n", encoding="utf-8")

    (destino / f"parcela_{RC}.gml").write_text(_fc([_parcela(RC, PARCELA)]), encoding="utf-8")
    (destino / f"edificio_{RC}.gml").write_text(
        _fc([_edificio(RC, HUELLA, [PATIO])]), encoding="utf-8")
    (destino / f"partes_{RC}.gml").write_text(
        _fc([_parte("A", PARTE_ALTA, 2, huecos=[PATIO]), _parte("B", PARTE_BAJA, 1)]),
        encoding="utf-8")
    (destino / f"vecinos_{RC}.gml").write_text(
        _fc([_parcela(RC_VE, VECINO_E), _parcela(RC_VO, VECINO_O)]), encoding="utf-8")
    (destino / f"edificio_vecino_{RC_VE}.gml").write_text(
        _fc([_edificio(RC_VE, VECINO_E)]), encoding="utf-8")
    (destino / f"edificio_vecino_{RC_VO}.gml").write_text(
        _fc([_edificio(RC_VO, VECINO_O)]), encoding="utf-8")
    # el vecino del Este solo tiene planta baja: en P1 ese muro NO es medianera
    (destino / f"partes_vecino_{RC_VE}.gml").write_text(
        _fc([_parte("VE", VECINO_E, 1)]), encoding="utf-8")
    (destino / f"partes_vecino_{RC_VO}.gml").write_text(
        _fc([_parte("VO", VECINO_O, 2)]), encoding="utf-8")

    dnprc = {"consulta_dnprcResult": {
        "control": {"cudnp": 1}, "_aviso": AVISO,
        "bico": {
            "bi": {"idbi": {"cn": "UR", "rc": {"pc1": "9999999", "pc2": "XX9999X",
                                               "car": "0001", "cc1": "Z", "cc2": "Z"}},
                   "dt": {"loine": {"cp": "13", "cm": "062"}, "cmc": "062",
                          "np": "CIUDAD REAL (SINTETICO)", "nm": "PRUEBA",
                          "locs": {"lous": {"lourb": {
                              "dir": {"cv": "9999", "tv": "CL", "nv": "PRUEBA",
                                      "pnp": "1"}}}}},
                   "debi": {"luso": "Residencial", "sfc": "188", "cpt": "100",
                            "ant": "1998"}},
            "lcons": [
                {"lcd": "VIVIENDA", "dt": {"lourb": {"loint": {"es": "1", "pt": "01",
                                                              "pu": "A"}}},
                 "dfcons": {"stl": "74"}},
                {"lcd": "ALMACEN", "dt": {"lourb": {"loint": {"es": "1", "pt": "00",
                                                             "pu": "01"}}},
                 "dfcons": {"stl": "114"}},
            ]}}}
    (destino / f"dnprc_{RC}.json").write_text(json.dumps(dnprc, indent=1), encoding="utf-8")
    return destino


if __name__ == "__main__":
    d = escribir(Path(sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures/sintetico"))
    print("fixture en", d)
