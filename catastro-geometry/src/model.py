"""Estructura interna del §5.

    { "parcel": {}, "buildings": [], "building_parts": [], "floors": [], "spaces": [] }

Cada objeto conserva source / original_id / geometry / area / use / floor /
confidence, que es lo que permite reconstruir de donde sale cada numero (§20).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from shapely.geometry.base import BaseGeometry

from .gis.floors import ParteEdificio, Planta
from .provenance import Diagnostics


@dataclass
class Objeto:
    source: str
    original_id: str | None
    geometry: BaseGeometry | None
    area: float | None
    use: str | None
    floor: int | None
    confidence: float
    attrs: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "source": self.source, "original_id": self.original_id,
            "area": self.area, "use": self.use, "floor": self.floor,
            "confidence": self.confidence,
            "geometry_wkt": self.geometry.wkt if self.geometry is not None else None,
            "attrs": self.attrs,
        }


@dataclass
class Modelo:
    refcat_parcela: str
    refcat_inmueble: str | None
    crs: str
    parcel: Objeto | None = None
    buildings: list[Objeto] = field(default_factory=list)
    building_parts: list[Objeto] = field(default_factory=list)
    neighbours: list[Objeto] = field(default_factory=list)
    floors: list[Planta] = field(default_factory=list)
    spaces: list[Objeto] = field(default_factory=list)
    partes: list[ParteEdificio] = field(default_factory=list)
    #: BuildingParts de las parcelas colindantes: dicen hasta que planta
    #: llega cada vecino, y por tanto hasta donde hay medianera de verdad.
    neighbour_partes: list[ParteEdificio] = field(default_factory=list)
    catastro: dict = field(default_factory=dict)
    diagnostics: Diagnostics = field(default_factory=Diagnostics)

    def huella(self) -> BaseGeometry | None:
        from .gis.adjacency import unir
        g = unir([b.geometry for b in self.buildings])
        if g is None:
            g = unir([p.geometry for p in self.building_parts])
        return g

    def vecinos_geom(self) -> BaseGeometry | None:
        from .gis.adjacency import unir
        return unir([n.geometry for n in self.neighbours])

    def to_dict(self) -> dict:
        return {
            "refcat_parcela": self.refcat_parcela,
            "refcat_inmueble": self.refcat_inmueble,
            "crs": self.crs,
            "parcel": self.parcel.to_dict() if self.parcel else None,
            "buildings": [b.to_dict() for b in self.buildings],
            "building_parts": [p.to_dict() for p in self.building_parts],
            "neighbours": [n.to_dict() for n in self.neighbours],
            "floors": [{"nivel": f.nivel, "planta": f.etiqueta, "area_m2": f.area_m2,
                        "usos": f.usos, "uso_dominante": f.uso_dominante,
                        "confidence": f.confianza_uso, "nota": f.nota_uso}
                       for f in self.floors],
            "spaces": [s.to_dict() for s in self.spaces],
            # las claves con "_" son objetos vivos (cliente HTTP, datos parseados):
            # no se serializan.
            "catastro": {k: v for k, v in self.catastro.items()
                         if not k.startswith("_")},
            "diagnostics": self.diagnostics.to_dict(),
        }
