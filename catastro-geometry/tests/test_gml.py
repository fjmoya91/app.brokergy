"""Lectura de GML de Catastro: orden de ejes, huecos y excepciones (§4)."""
import pytest

from src.gis.geometry import parse_gml, parse_srs_name

CABECERA = ('<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" '
            'xmlns:gml="http://www.opengis.net/gml/3.2" '
            'xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0">')


def _gml(srs, poslist, interior=""):
    return (CABECERA + '<wfs:member><cp:CadastralParcel gml:id="ES.SDGC.CP.X">'
            '<cp:nationalCadastralReference>4410205WJ0641S'
            '</cp:nationalCadastralReference><cp:geometry>'
            f'<gml:MultiSurface srsName="{srs}"><gml:surfaceMember><gml:Polygon>'
            f'<gml:exterior><gml:LinearRing><gml:posList srsDimension="2">{poslist}'
            '</gml:posList></gml:LinearRing></gml:exterior>' + interior +
            '</gml:Polygon></gml:surfaceMember></gml:MultiSurface></cp:geometry>'
            '</cp:CadastralParcel></wfs:member></wfs:FeatureCollection>').encode()


@pytest.mark.parametrize("srs,code,invertir", [
    ("urn:ogc:def:crs:EPSG::25830", "EPSG:25830", False),   # proyectado: E,N
    ("urn:ogc:def:crs:EPSG::4258", "EPSG:4258", True),      # geografico: lat,lon
    ("EPSG:4326", "EPSG:4326", False),                      # forma corta: x,y
    ("http://www.opengis.net/def/crs/EPSG/0/4258", "EPSG:4258", True),
])
def test_orden_de_ejes_segun_la_forma_del_srsname(srs, code, invertir):
    assert parse_srs_name(srs) == (code, invertir)


def test_geometria_y_atributos():
    f = parse_gml(_gml("urn:ogc:def:crs:EPSG::25830", "0 0 10 0 10 20 0 20 0 0"), "T")[0]
    assert f.srs == "EPSG:25830"
    assert f.geometry.area == pytest.approx(200.0)
    assert f.attrs["nationalCadastralReference"] == "4410205WJ0641S"
    assert f.original_id == "ES.SDGC.CP.X"


def test_un_srsname_geografico_urn_se_lee_lat_lon():
    """Sin esto la parcela aparece en el golfo de Guinea y nadie lo nota en el CSV."""
    f = parse_gml(_gml("urn:ogc:def:crs:EPSG::4258", "39.4 -2.96 39.4 -2.95 "
                       "39.41 -2.95 39.41 -2.96 39.4 -2.96"), "T")[0]
    x, y = f.geometry.exterior.coords[0]
    assert -3 < x < -2 and 39 < y < 40


def test_huecos_interiores():
    interior = ('<gml:interior><gml:LinearRing><gml:posList>'
                '4 4 6 4 6 6 4 6 4 4</gml:posList></gml:LinearRing></gml:interior>')
    f = parse_gml(_gml("urn:ogc:def:crs:EPSG::25830", "0 0 10 0 10 10 0 10 0 0",
                       interior), "T")[0]
    assert len(f.geometry.interiors) == 1
    assert f.geometry.area == pytest.approx(96.0)


def test_una_excepcion_wfs_no_se_traga_en_silencio():
    xml = (b'<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">'
           b'<ows:Exception exceptionCode="InvalidParameterValue">'
           b'<ows:ExceptionText>refcat no valido</ows:ExceptionText>'
           b'</ows:Exception></ows:ExceptionReport>')
    with pytest.raises(ValueError, match="excepcion WFS"):
        parse_gml(xml, "T")


def test_un_gml_vacio_devuelve_lista_vacia_sin_reventar():
    assert parse_gml(CABECERA.encode() + b"</wfs:FeatureCollection>", "T") == []
