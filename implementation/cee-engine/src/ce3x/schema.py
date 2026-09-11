"""Esquema de salida hacia CE3X (§14, §20).

Cada fila es UN cerramiento listo para teclear (o para que lo teclee Computer
Use) en CE3X, y lleva pegada su procedencia: de donde sale el largo, de donde
sale el alto, con que confianza y si necesita que lo mire una persona.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..provenance import EvidenceType, Source, Traced

#: Tipos de cerramiento tal y como los pide CE3X.
TIPO_MURO_FACHADA = "FACHADA"
TIPO_MEDIANERA = "MEDIANERA"
TIPO_PARTICION_VERTICAL = "PARTICION_INTERIOR_VERTICAL"
TIPO_SUELO = "SUELO"
TIPO_CUBIERTA = "CUBIERTA"
TIPO_PARTICION_HORIZONTAL = "PARTICION_INTERIOR_HORIZONTAL"

#: Orden EXACTO de las columnas del CSV pedido en §14 (mas las de traza).
COLUMNAS = [
    "ID", "planta", "tipo", "subtipo", "contacto",
    "espacio_origen", "espacio_destino",
    "largo_m", "alto_m", "largo_x_alto", "superficie_m2",
    "orientacion", "azimut",
    "fuente_largo", "fuente_alto", "confianza", "requiere_revision",
    # --- traza adicional (§20) ---
    "evidencia_largo", "evidencia_alto", "evidencia_superficie",
    "nivel", "ring", "segmento_origen", "nota",
]


@dataclass
class ElementoCE3X:
    id: str
    planta: str
    nivel: int | None
    tipo: str
    subtipo: str
    contacto: str
    espacio_origen: str
    espacio_destino: str
    largo: Traced                      # metros, o None para elementos horizontales
    alto: Traced                       # metros, o None
    superficie: Traced                 # m2
    orientacion: str | None
    azimut: float | None
    confianza: float
    requiere_revision: bool
    nota: str = ""
    ring: str | None = None
    segmento_origen: str | None = None
    geometria_wkt: str | None = None
    extra: dict = field(default_factory=dict)

    @property
    def largo_x_alto(self) -> str:
        """§13: se muestra la operacion, no solo el resultado."""
        if self.largo.available and self.alto.available:
            return f"{self.largo.value:.2f} x {self.alto.value:.2f}"
        return ""

    def fila_csv(self) -> dict:
        return {
            "ID": self.id,
            "planta": self.planta,
            "tipo": self.tipo,
            "subtipo": self.subtipo,
            "contacto": self.contacto,
            "espacio_origen": self.espacio_origen,
            "espacio_destino": self.espacio_destino,
            "largo_m": f"{self.largo.value:.2f}" if self.largo.available else "",
            "alto_m": f"{self.alto.value:.2f}" if self.alto.available else "",
            "largo_x_alto": self.largo_x_alto,
            "superficie_m2": f"{self.superficie.value:.2f}" if self.superficie.available else "",
            "orientacion": self.orientacion or "",
            "azimut": f"{self.azimut:.1f}" if self.azimut is not None else "",
            "fuente_largo": self.largo.source.value,
            "fuente_alto": self.alto.source.value,
            "confianza": f"{self.confianza:.2f}",
            "requiere_revision": "true" if self.requiere_revision else "false",
            "evidencia_largo": self.largo.evidence_type.value,
            "evidencia_alto": self.alto.evidence_type.value,
            "evidencia_superficie": self.superficie.evidence_type.value,
            "nivel": "" if self.nivel is None else self.nivel,
            "ring": self.ring or "",
            "segmento_origen": self.segmento_origen or "",
            "nota": self.nota,
        }

    def to_dict(self) -> dict:
        return {
            "id": self.id, "planta": self.planta, "nivel": self.nivel,
            "tipo": self.tipo, "subtipo": self.subtipo, "contacto": self.contacto,
            "espacio_origen": self.espacio_origen, "espacio_destino": self.espacio_destino,
            "orientacion": self.orientacion, "azimut": self.azimut,
            "largo": self.largo.to_dict(), "alto": self.alto.to_dict(),
            "largo_x_alto": self.largo_x_alto, "superficie": self.superficie.to_dict(),
            "confianza": self.confianza, "requiere_revision": self.requiere_revision,
            "nota": self.nota, "ring": self.ring,
            "segmento_origen": self.segmento_origen,
            "geometria_wkt": self.geometria_wkt,
            **({"extra": self.extra} if self.extra else {}),
        }
