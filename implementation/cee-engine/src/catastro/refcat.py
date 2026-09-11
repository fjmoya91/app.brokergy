"""Normalizacion de la referencia catastral (§3).

    4410205WJ0641S0001JH  ->  inmueble (20)
    4410205WJ0641S        ->  parcela  (14)

La RC de 20 se usa para localizar el inmueble/unidad en los servicios
alfanumericos; la de 14 para los servicios de parcela (WFS INSPIRE).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# Tabla de digitos de control publicada por la D.G. del Catastro.
_TABLA_DC = "MQWERTYUIOPASDFGHJKLBZX"
_PESOS = [13, 15, 12, 5, 4, 17, 9, 21, 3, 7, 1]
# Alfabeto con la N con virgulilla intercalada: A=1 ... N=14, N~=15, O=16 ... Z=27.
_ALFA = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ"

_LIMPIA = re.compile(r"[^0-9A-ZÑ]")


class RefCatError(ValueError):
    pass


def _valor(c: str) -> int:
    if c.isdigit():
        return int(c)
    try:
        return _ALFA.index(c) + 1
    except ValueError as exc:  # pragma: no cover
        raise RefCatError(f"caracter no valido en la referencia catastral: {c!r}") from exc


def digitos_control(rc14: str, cargo: str) -> str:
    """Los 2 caracteres de control de una RC de 20.

    Verificado contra 4410205WJ0641S0001JH. Es una comprobacion ADVISORY:
    una RC que no cuadre se avisa, nunca se rechaza (§19: no fallar por gusto).
    """
    def _uno(s: str) -> str:
        return _TABLA_DC[sum(_valor(ch) * _PESOS[i] for i, ch in enumerate(s)) % 23]

    return _uno(rc14[:7] + cargo) + _uno(rc14[7:14] + cargo)


@dataclass(frozen=True)
class ReferenciaCatastral:
    raw: str
    #: Siempre 14 caracteres. Es la que aceptan los servicios de parcela.
    parcela: str
    #: 20 caracteres, o None si solo se dio la parcela.
    inmueble: str | None
    #: numero de orden del inmueble dentro de la parcela ("0001"), o None.
    cargo: str | None
    #: True/False si se pudo comprobar, None si no habia digitos que comprobar.
    dc_ok: bool | None

    @property
    def es_inmueble(self) -> bool:
        return self.inmueble is not None

    def to_dict(self) -> dict:
        return {
            "entrada": self.raw,
            "refcat_parcela": self.parcela,
            "refcat_inmueble": self.inmueble,
            "cargo": self.cargo,
            "digitos_control_ok": self.dc_ok,
        }


def parse(texto: str) -> ReferenciaCatastral:
    """Acepta la RC con o sin espacios, puntos o barras, en cualquier caja."""
    if not texto or not texto.strip():
        raise RefCatError("referencia catastral vacia")
    limpia = _LIMPIA.sub("", texto.strip().upper())

    if len(limpia) == 14:
        return ReferenciaCatastral(texto, limpia, None, None, None)
    if len(limpia) == 20:
        parcela, cargo, dc = limpia[:14], limpia[14:18], limpia[18:20]
        return ReferenciaCatastral(texto, parcela, limpia, cargo,
                                   digitos_control(parcela, cargo) == dc)
    raise RefCatError(
        f"la referencia catastral debe tener 14 (parcela) o 20 (inmueble) caracteres; "
        f"'{texto}' tiene {len(limpia)}"
    )
