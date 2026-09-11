"""Normalizacion y digitos de control de la referencia catastral (§3)."""
import pytest

from src.catastro import refcat

REAL = "4410205WJ0641S0001JH"


def test_parte_inmueble_y_parcela():
    rc = refcat.parse(REAL)
    assert rc.parcela == "4410205WJ0641S"
    assert rc.inmueble == REAL
    assert rc.cargo == "0001"


def test_digitos_de_control_de_una_rc_real():
    assert refcat.parse(REAL).dc_ok is True


def test_digitos_de_control_detectan_una_errata():
    # la ultima letra cambiada: es justo el fallo que hace que Catastro conteste
    # "no encontrado" y se lea como que la vivienda no esta dada de alta
    assert refcat.parse("4410205WJ0641S0001JX").dc_ok is False


@pytest.mark.parametrize("txt", ["4410205wj0641s0001jh", " 4410205WJ0641S 0001 JH ",
                                 "4410205WJ0641S/0001JH"])
def test_acepta_espacios_barras_y_minusculas(txt):
    assert refcat.parse(txt).inmueble == REAL


def test_solo_parcela():
    rc = refcat.parse("4410205WJ0641S")
    assert rc.parcela == "4410205WJ0641S" and rc.inmueble is None and rc.dc_ok is None


@pytest.mark.parametrize("txt", ["", "1234", "4410205WJ0641S0001JHX"])
def test_longitud_invalida(txt):
    with pytest.raises(refcat.RefCatError):
        refcat.parse(txt)
