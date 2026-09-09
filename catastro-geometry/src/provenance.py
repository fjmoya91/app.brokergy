"""Trazabilidad (§20).

Todo dato que acabe en un certificado energetico tiene que saber de donde sale.
Nunca se mezcla lo MEDIDO con lo CALCULADO, lo INFERIDO o lo SUPUESTO.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, field
from enum import Enum
from typing import Any, Optional


class EvidenceType(str, Enum):
    #: Viene tal cual de una fuente oficial (geometria de Catastro, superficie catastral).
    MEASURED = "MEASURED"
    #: Se obtiene por operacion determinista sobre datos MEASURED (longitud de un segmento).
    COMPUTED = "COMPUTED"
    #: Se deduce con una regla explicita que puede fallar (uso de un poligono a partir del uso de su planta).
    INFERRED = "INFERRED"
    #: Lo aporta una persona o un valor por defecto del CLI (--floor-height).
    MANUAL = "MANUAL"


class Source(str, Enum):
    CATASTRO_WFS_CP = "CATASTRO_WFS_CP"
    CATASTRO_WFS_BU = "CATASTRO_WFS_BU"
    CATASTRO_OVC_JSON = "CATASTRO_OVC_JSON"
    CATASTRO_FXCC = "CATASTRO_FXCC"
    CATASTRO_DXF = "CATASTRO_DXF"
    PNOA_LIDAR = "PNOA_LIDAR"
    IGN_WCS_MDT = "IGN_WCS_MDT"
    GEOMETRY = "GEOMETRY"          # calculado por nosotros sobre geometria de Catastro
    USER_INPUT = "USER_INPUT"
    DEFAULT = "DEFAULT"
    UNAVAILABLE = "UNAVAILABLE"
    SYNTHETIC_FIXTURE = "SYNTHETIC_FIXTURE"   # SOLO para tests / autoprueba. Nunca en un expediente.


@dataclass(frozen=True)
class Traced:
    """Un valor con su procedencia. `value is None` significa NO DISPONIBLE."""
    value: Any
    source: Source
    confidence: float
    evidence_type: EvidenceType
    note: Optional[str] = None

    @property
    def available(self) -> bool:
        return self.value is not None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["source"] = self.source.value
        d["evidence_type"] = self.evidence_type.value
        return d

    def __str__(self) -> str:  # pragma: no cover - solo para logs
        if self.value is None:
            return f"NO DISPONIBLE ({self.source.value})"
        return f"{self.value} [{self.source.value}/{self.evidence_type.value} c={self.confidence:.2f}]"


def missing(source: Source = Source.UNAVAILABLE, note: str | None = None) -> Traced:
    return Traced(None, source, 0.0, EvidenceType.INFERRED, note)


def measured(value: Any, source: Source, note: str | None = None, confidence: float = 1.0) -> Traced:
    return Traced(value, source, confidence, EvidenceType.MEASURED, note)


def computed(value: Any, confidence: float = 1.0, source: Source = Source.GEOMETRY,
             note: str | None = None) -> Traced:
    return Traced(value, source, confidence, EvidenceType.COMPUTED, note)


def inferred(value: Any, confidence: float, source: Source, note: str | None = None) -> Traced:
    return Traced(value, source, confidence, EvidenceType.INFERRED, note)


def manual(value: Any, note: str | None = None, source: Source = Source.USER_INPUT,
           confidence: float = 0.5) -> Traced:
    return Traced(value, source, confidence, EvidenceType.MANUAL, note)


@dataclass
class Diagnostics:
    """Lo que NO se pudo conseguir. Se vuelca al JSON y al README de la ejecucion."""
    codes: list[str] = field(default_factory=list)
    messages: list[str] = field(default_factory=list)

    def add(self, code: str, message: str) -> None:
        self.codes.append(code)
        self.messages.append(f"{code}: {message}")

    def to_dict(self) -> dict:
        return {"codes": self.codes, "messages": self.messages}
