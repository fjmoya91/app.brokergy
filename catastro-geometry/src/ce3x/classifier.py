"""De la geometria clasificada a las filas de CE3X (§14).

No hay ninguna decision nueva aqui: `adjacency` ya dijo contra que da cada
muro y `floors` que hay encima y debajo de cada planta. Esto solo traduce ese
vocabulario al de CE3X y calcula largo x alto.
"""
from __future__ import annotations

from ..gis.adjacency import Contacto, Tramo
from ..gis.floors import ElementoHorizontal, Planta
from ..provenance import (EvidenceType, Source, Traced, computed, measured, missing)
from .schema import (ElementoCE3X, TIPO_CUBIERTA, TIPO_MEDIANERA,
                     TIPO_MURO_FACHADA, TIPO_PARTICION_HORIZONTAL,
                     TIPO_PARTICION_VERTICAL, TIPO_SUELO)

#: contacto geometrico -> (tipo CE3X, subtipo, espacio al otro lado)
_MAPA_VERTICAL = {
    Contacto.OTHER_BUILDING: (TIPO_MEDIANERA, "EDIFICIO_COLINDANTE", "EDIFICIO_VECINO"),
    Contacto.PATIO_EDIFICIO: (TIPO_MURO_FACHADA, "PATIO", "EXTERIOR"),
    Contacto.PATIO_PARCELA: (TIPO_MURO_FACHADA, "PATIO", "EXTERIOR"),
    Contacto.EXTERIOR_CALLE: (TIPO_MURO_FACHADA, "CALLE", "EXTERIOR"),
    Contacto.EXTERIOR_RETRANQUEO: (TIPO_MURO_FACHADA, "ESPACIO_LIBRE_PARCELA", "EXTERIOR"),
    Contacto.EXTERIOR_SOBRE_CUBIERTA: (TIPO_MURO_FACHADA, "SOBRE_CUBIERTA_INFERIOR", "EXTERIOR"),
    Contacto.EXTERIOR_SOBRE_VECINO: (TIPO_MURO_FACHADA, "SOBRE_CUBIERTA_COLINDANTE", "EXTERIOR"),
    Contacto.NO_HABITABLE: (TIPO_PARTICION_VERTICAL, "ESPACIO_NO_HABITABLE", "NO_HABITABLE"),
    Contacto.DESCONOCIDO: (TIPO_MURO_FACHADA, "SIN_DETERMINAR", "DESCONOCIDO"),
}

_PREFIJO = {TIPO_MURO_FACHADA: "F", TIPO_MEDIANERA: "M",
            TIPO_PARTICION_VERTICAL: "PI", TIPO_SUELO: "SU",
            TIPO_CUBIERTA: "CU", TIPO_PARTICION_HORIZONTAL: "PH"}

#: por debajo de esta confianza, una fila sale marcada para revision
UMBRAL_REVISION = 0.80


def _etiqueta_planta(nivel: int | None) -> str:
    if nivel is None:
        return "?"
    if nivel == 0:
        return "PB"
    return f"S{abs(nivel)}" if nivel < 0 else f"P{nivel}"


def verticales(tramos: list[Tramo], alto: Traced, planta: Planta | None,
               contador: dict[str, int] | None = None) -> list[ElementoCE3X]:
    """Un muro por tramo, con superficie BRUTA largo x alto (§13: sin descontar huecos)."""
    contador = contador if contador is not None else {}
    salida: list[ElementoCE3X] = []
    uso_origen = (planta.uso_dominante if planta and planta.uso_dominante else "DESCONOCIDO")

    for t in tramos:
        tipo, subtipo, destino = _MAPA_VERTICAL[t.contacto]
        pref = _PREFIJO[tipo]
        contador[pref] = contador.get(pref, 0) + 1
        eid = f"{pref}{contador[pref]:02d}"
        # el plano de depuracion rotula con ESTE id, no con el del segmento:
        # si no, no se puede cruzar el dibujo con el CSV (§16).
        t.segment.meta["ce3x_id"] = eid

        largo = measured(round(t.segment.length_m, 2), Source.CATASTRO_WFS_BU,
                         "longitud del segmento de la huella catastral")
        if alto.available:
            sup = Traced(round(t.segment.length_m * alto.value, 2), alto.source,
                         round(min(largo.confidence, alto.confidence), 2),
                         EvidenceType.COMPUTED, "largo x alto (bruta, sin descontar huecos)")
        else:
            sup = missing(Source.UNAVAILABLE, "sin altura no hay superficie de muro")

        conf = round(min(t.confianza, alto.confidence if alto.available else 0.4), 2)
        salida.append(ElementoCE3X(
            id=eid, planta=planta.etiqueta if planta else _etiqueta_planta(t.segment.floor),
            nivel=planta.nivel if planta else t.segment.floor,
            tipo=tipo, subtipo=subtipo, contacto=t.contacto.value,
            espacio_origen=uso_origen, espacio_destino=destino,
            largo=largo, alto=alto, superficie=sup,
            orientacion=None if tipo == TIPO_PARTICION_VERTICAL else t.segment.orientation,
            azimut=None if tipo == TIPO_PARTICION_VERTICAL else t.segment.azimuth,
            confianza=conf,
            requiere_revision=(conf < UMBRAL_REVISION or not alto.available
                               or t.contacto == Contacto.DESCONOCIDO),
            nota=(t.nota + ("" if alto.evidence_type.value in ("MEASURED", "COMPUTED")
                            else f" | ALTO NO MEDIDO ({alto.note}): la superficie es "
                                 f"provisional")),
            ring=t.segment.ring, segmento_origen=t.segment.id,
            geometria_wkt=t.segment.line.wkt))
    return salida


_MAPA_HORIZONTAL = {
    ("SUELO", "TERRENO"): (TIPO_SUELO, "TERRENO"),
    ("SUELO", "AIRE_EXTERIOR"): (TIPO_SUELO, "AIRE_EXTERIOR"),
    ("CUBIERTA", "AIRE_EXTERIOR"): (TIPO_CUBIERTA, "AIRE_EXTERIOR"),
    ("PARTICION_HORIZONTAL", "ESPACIO_NO_HABITABLE_INFERIOR"):
        (TIPO_PARTICION_HORIZONTAL, "ESPACIO_NO_HABITABLE_INFERIOR"),
    ("PARTICION_HORIZONTAL", "ESPACIO_NO_HABITABLE_SUPERIOR"):
        (TIPO_PARTICION_HORIZONTAL, "ESPACIO_NO_HABITABLE_SUPERIOR"),
    ("PARTICION_HORIZONTAL", "ENTRE_PLANTAS"):
        (TIPO_PARTICION_HORIZONTAL, "ENTRE_PLANTAS"),
}


def horizontales(elems: list[ElementoHorizontal],
                 contador: dict[str, int] | None = None) -> list[ElementoCE3X]:
    contador = contador if contador is not None else {}
    salida: list[ElementoCE3X] = []
    for e in elems:
        tipo, subtipo = _MAPA_HORIZONTAL.get((e.tipo, e.subtipo),
                                             (TIPO_PARTICION_HORIZONTAL, e.subtipo))
        pref = _PREFIJO[tipo]
        contador[pref] = contador.get(pref, 0) + 1
        salida.append(ElementoCE3X(
            id=f"{pref}{contador[pref]:02d}", planta=e.planta, nivel=e.nivel,
            tipo=tipo, subtipo=subtipo, contacto=e.subtipo,
            espacio_origen=e.espacio_origen, espacio_destino=e.espacio_destino,
            largo=missing(Source.UNAVAILABLE, "elemento horizontal: no aplica largo x alto"),
            alto=missing(Source.UNAVAILABLE, "elemento horizontal: no aplica largo x alto"),
            superficie=computed(round(e.area_m2, 2), e.confianza,
                                Source.CATASTRO_WFS_BU,
                                "area del poligono resultante de la interseccion vertical"),
            orientacion=None, azimut=None, confianza=round(e.confianza, 2),
            requiere_revision=(e.confianza < UMBRAL_REVISION or not e.relevante_ce3x),
            nota=e.nota + ("" if e.relevante_ce3x else
                           " | forjado entre plantas del mismo uso: en CE3X no se introduce"),
            geometria_wkt=e.poligono.wkt,
            extra={"relevante_ce3x": e.relevante_ce3x}))
    return salida
