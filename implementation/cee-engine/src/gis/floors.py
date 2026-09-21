"""Reconstruccion por plantas y particiones horizontales (§11).

Catastro no publica el poligono de cada planta en el WFS: publica BuildingParts
con `numberOfFloorsAboveGround` / `numberOfFloorsBelowGround`. La huella de la
planta k es la union de las partes que llegan a esa altura. Es una
reconstruccion COMPUTED sobre datos MEASURED, no una medicion.

De ahi salen, por interseccion vertical:

    planta k  n  planta k+1   -> particion horizontal entre las dos
    planta k  -  planta k+1   -> cubierta (no hay nada construido encima)
    planta k  -  planta k-1   -> suelo en contacto con aire (voladizo)
    planta mas baja           -> suelo en contacto con terreno
"""
from __future__ import annotations

from dataclasses import dataclass, field

from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

#: superficie por debajo de la cual un resultado de interseccion es ruido de
#: digitalizacion y no un elemento constructivo.
AREA_MINIMA_M2 = 1.0


@dataclass
class ParteEdificio:
    """Un BuildingPart de Catastro."""
    original_id: str | None
    geometry: BaseGeometry
    plantas_sobre_rasante: int | None
    plantas_bajo_rasante: int | None
    attrs: dict = field(default_factory=dict)


@dataclass
class Planta:
    nivel: int                     # 0 = planta baja, 1 = primera, -1 = sotano
    huella: BaseGeometry
    area_m2: float
    usos: dict[str, float] = field(default_factory=dict)
    uso_dominante: str | None = None
    confianza_uso: float = 0.0
    nota_uso: str = ""
    #: Lo que hay CONSTRUIDO en este nivel y NO es de la vivienda: el garaje
    #: adosado, el almacen. No esta en `huella` —sus paredes no se miden— pero
    #: sigue estando ahi, y eso decide dos cosas: que la pared de la casa
    #: contra el sea una PARTICION y no una fachada, y que el forjado de
    #: encima sea una particion con espacio no habitable y no un voladizo.
    #:
    #: Va una entrada POR CUERPO, con su uso: un garaje y un almacen debajo de
    #: la misma planta son DOS particiones, y el forjado de cada una tiene que
    #: decir sobre que da. Con una sola geometria unida, los dos salian con el
    #: nombre del primero.
    no_habitable_partes: list[dict] = field(default_factory=list)

    @property
    def no_habitable(self) -> BaseGeometry | None:
        """Todo lo no habitable de este nivel, junto. Es lo que ve el
        clasificador de paredes: le da igual de quien sea cada trozo."""
        gs = [p["geom"] for p in self.no_habitable_partes
              if p.get("geom") is not None and not p["geom"].is_empty]
        return unary_union(gs) if gs else None

    @property
    def huella_construida(self) -> BaseGeometry:
        """Todo lo levantado en este nivel: la vivienda MAS lo que no cuenta.

        Es la que decide si algo VUELA (no hay nada debajo) o se apoya. Con la
        huella habitable sola, la planta sobre un garaje salia como voladizo.
        """
        nh = self.no_habitable
        if nh is None:
            return self.huella
        return unary_union([self.huella, nh])

    @property
    def etiqueta(self) -> str:
        if self.nivel == 0:
            return "PB"
        if self.nivel < 0:
            return f"S{abs(self.nivel)}"
        return f"P{self.nivel}"


@dataclass
class ElementoHorizontal:
    id: str
    nivel: int
    planta: str
    tipo: str                      # SUELO | CUBIERTA | PARTICION_HORIZONTAL
    subtipo: str                   # TERRENO | AIRE_EXTERIOR | ESPACIO_NO_HABITABLE | ...
    poligono: Polygon
    area_m2: float
    espacio_origen: str
    espacio_destino: str
    confianza: float
    nota: str
    relevante_ce3x: bool = True

    def to_dict(self) -> dict:
        d = {k: v for k, v in self.__dict__.items() if k != "poligono"}
        return d


def _polis(g: BaseGeometry | None) -> list[Polygon]:
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    if hasattr(g, "geoms"):
        return [p for p in g.geoms if p.geom_type == "Polygon" and p.area >= AREA_MINIMA_M2]
    return []


def _limpia(g: BaseGeometry | None) -> BaseGeometry | None:
    """Quita esquirlas de las diferencias entre huellas casi iguales."""
    if g is None or g.is_empty:
        return None
    trozos = [p for p in _polis(g) if p.area >= AREA_MINIMA_M2]
    if not trozos:
        return None
    return unary_union(trozos)


def plantas_desde_partes(partes: list[ParteEdificio],
                         plantas_por_defecto: int = 1,
                         fuera_por_nivel: dict[int, list[dict]] | None = None,
                         ) -> list[Planta]:
    """Huella de cada planta a partir de los BuildingParts.

    Una parte con `numberOfFloorsAboveGround = 2` esta presente en los niveles
    0 y 1. Si Catastro no dice cuantas plantas tiene, se cuenta UNA y queda
    anotado: inventar plantas seria inventar cubiertas y suelos.

    `fuera_por_nivel` es lo que el certificador ha dejado FUERA de la
    envolvente EN ESE NIVEL. Se resta de la huella —sus paredes no se miden—
    pero se conserva en `Planta.no_habitable`, porque sigue estando construido:
    de ahi salen la particion vertical contra el y el forjado de encima.

    REGLA — se recorta POR NIVEL, nunca el cuerpo entero. Un garaje adosado con
    vivienda encima es UN BuildingPart de dos plantas: quitarlo de las dos
    borra las fachadas reales de la vivienda de arriba.
    """
    if not partes:
        return []
    fuera_por_nivel = fuera_por_nivel or {}
    max_sobre = max((p.plantas_sobre_rasante or plantas_por_defecto) for p in partes)
    max_bajo = max((p.plantas_bajo_rasante or 0) for p in partes)

    plantas: list[Planta] = []
    for nivel in range(-max_bajo, max_sobre):
        if nivel >= 0:
            trozos = [p.geometry for p in partes
                      if (p.plantas_sobre_rasante or plantas_por_defecto) >= nivel + 1]
        else:
            trozos = [p.geometry for p in partes
                      if (p.plantas_bajo_rasante or 0) >= abs(nivel)]
        g = _limpia(unary_union(trozos)) if trozos else None
        if g is None:
            continue
        partes_fuera = []
        for cuerpo in fuera_por_nivel.get(nivel) or []:
            fuera = cuerpo.get("geom")
            if fuera is None or fuera.is_empty:
                continue
            # Lo que de verdad se quita de ESTA huella, no el poligono entero
            # del cuerpo: puede sobresalir de lo construido en este nivel.
            trozo = _limpia(g.intersection(fuera))
            if trozo is None:
                continue
            partes_fuera.append({"geom": trozo, "uso": cuerpo.get("uso") or NO_HABITABLE})
            recortada = _limpia(g.difference(fuera))
            if recortada is not None:
                g = recortada
        plantas.append(Planta(nivel=nivel, huella=g, area_m2=round(g.area, 2),
                              no_habitable_partes=partes_fuera))
    return sorted(plantas, key=lambda p: p.nivel)


def asignar_usos(plantas: list[Planta], usos_por_planta: dict[int, dict[str, float]],
                 ) -> None:
    """Cuelga de cada planta los usos que Catastro declara para ese nivel (§6).

    Es INFERRED, no MEASURED: Catastro dice 'en la planta 01 hay 165 m2 de
    VIVIENDA', no dice QUE POLIGONO es. Cuando una planta tiene un solo uso la
    asignacion es fiable; con varios usos en la misma planta NO se reparte el
    poligono, se marca y se deja para revision.
    """
    for pl in plantas:
        usos = usos_por_planta.get(pl.nivel, {})
        pl.usos = dict(usos)
        if not usos:
            pl.uso_dominante = None
            pl.confianza_uso = 0.0
            pl.nota_uso = "Catastro no declara uso para esta planta"
            continue
        if len(usos) == 1:
            pl.uso_dominante = next(iter(usos))
            pl.confianza_uso = 0.85
            pl.nota_uso = "unico uso declarado en la planta"
        else:
            pl.uso_dominante = max(usos, key=usos.get)
            total = sum(usos.values()) or 1.0
            pl.confianza_uso = round(0.5 * usos[pl.uso_dominante] / total, 2)
            pl.nota_uso = ("varios usos en la misma planta ("
                           + ", ".join(f"{k} {v:g} m2" for k, v in usos.items())
                           + "): Catastro no dice que poligono es cada uno")


#: Como se llama un espacio no habitable del que Catastro no dice el uso.
NO_HABITABLE = "ESPACIO NO HABITABLE"


def _partir(g: BaseGeometry, fuera: BaseGeometry | None):
    """Separa de `g` lo que cae sobre `fuera` y lo que queda."""
    if g is None or g.is_empty or fuera is None or fuera.is_empty:
        return None, g
    return _limpia(g.intersection(fuera)), g.difference(fuera)


def _uso(pl: Planta | None) -> str:
    if pl is None:
        return "EXTERIOR"
    return pl.uso_dominante or "DESCONOCIDO"


NO_HABITABLES = {"GARAJE", "ALMACEN", "COMUN"}


def elementos_horizontales(plantas: list[Planta]) -> list[ElementoHorizontal]:
    """Suelos, cubiertas y particiones horizontales por interseccion vertical."""
    salida: list[ElementoHorizontal] = []
    por_nivel = {p.nivel: p for p in plantas}
    if not plantas:
        return salida
    nivel_min = min(por_nivel)
    n = 1

    def add(**kw):
        nonlocal n
        pref = {"SUELO": "SU", "CUBIERTA": "CU", "PARTICION_HORIZONTAL": "PH"}[kw["tipo"]]
        salida.append(ElementoHorizontal(id=f"{pref}{n:03d}", **kw))
        n += 1

    for pl in plantas:
        abajo = por_nivel.get(pl.nivel - 1)
        arriba = por_nivel.get(pl.nivel + 1)

        # ---- SUELO --------------------------------------------------------
        if pl.nivel == nivel_min or abajo is None:
            for poli in _polis(pl.huella):
                add(nivel=pl.nivel, planta=pl.etiqueta, tipo="SUELO", subtipo="TERRENO",
                    poligono=poli, area_m2=round(poli.area, 2),
                    espacio_origen=_uso(pl), espacio_destino="TERRENO",
                    confianza=0.85, nota="no hay planta construida debajo")
        else:
            # Lo que se apoya sobre el GARAJE de abajo es una particion con
            # espacio no habitable AUNQUE las dos plantas sean de VIVIENDA: lo
            # decide la geometria, no el uso dominante de la planta.
            resto = pl.huella
            for cuerpo in abajo.no_habitable_partes:
                sobre_nohab, resto = _partir(resto, cuerpo["geom"])
                for poli in _polis(sobre_nohab):
                    destino = cuerpo["uso"]
                    add(nivel=pl.nivel, planta=pl.etiqueta, tipo="PARTICION_HORIZONTAL",
                        subtipo="ESPACIO_NO_HABITABLE_INFERIOR",
                        poligono=poli, area_m2=round(poli.area, 2),
                        espacio_origen=_uso(pl), espacio_destino=destino,
                        confianza=0.85,
                        nota=f"suelo de {pl.etiqueta} sobre {destino} de {abajo.etiqueta}",
                        relevante_ce3x=True)
            comun = _limpia(resto.intersection(abajo.huella))
            # VUELA lo que no tiene NADA construido debajo: ni vivienda ni garaje.
            volado = _limpia(resto.difference(abajo.huella))
            for poli in _polis(comun):
                destino = _uso(abajo)
                no_hab = destino in NO_HABITABLES
                add(nivel=pl.nivel, planta=pl.etiqueta, tipo="PARTICION_HORIZONTAL",
                    subtipo="ESPACIO_NO_HABITABLE_INFERIOR" if no_hab else "ENTRE_PLANTAS",
                    poligono=poli, area_m2=round(poli.area, 2),
                    espacio_origen=_uso(pl), espacio_destino=destino,
                    confianza=round(min(pl.confianza_uso or 0.5, abajo.confianza_uso or 0.5), 2),
                    nota=f"suelo de {pl.etiqueta} sobre {abajo.etiqueta}",
                    relevante_ce3x=no_hab or _uso(pl) != destino)
            for poli in _polis(volado):
                add(nivel=pl.nivel, planta=pl.etiqueta, tipo="SUELO",
                    subtipo="AIRE_EXTERIOR", poligono=poli, area_m2=round(poli.area, 2),
                    espacio_origen=_uso(pl), espacio_destino="EXTERIOR",
                    confianza=0.8, nota=f"vuela sobre {abajo.etiqueta}")

        # ---- TECHO --------------------------------------------------------
        if arriba is None:
            for poli in _polis(pl.huella):
                add(nivel=pl.nivel, planta=pl.etiqueta, tipo="CUBIERTA",
                    subtipo="AIRE_EXTERIOR", poligono=poli, area_m2=round(poli.area, 2),
                    espacio_origen=_uso(pl), espacio_destino="EXTERIOR",
                    confianza=0.85, nota="no hay planta construida encima")
        else:
            resto = pl.huella
            for cuerpo in arriba.no_habitable_partes:
                bajo_nohab, resto = _partir(resto, cuerpo["geom"])
                for poli in _polis(bajo_nohab):
                    destino = cuerpo["uso"]
                    add(nivel=pl.nivel, planta=pl.etiqueta, tipo="PARTICION_HORIZONTAL",
                        subtipo="ESPACIO_NO_HABITABLE_SUPERIOR",
                        poligono=poli, area_m2=round(poli.area, 2),
                        espacio_origen=_uso(pl), espacio_destino=destino,
                        confianza=0.85,
                        nota=f"techo de {pl.etiqueta} bajo {destino} de {arriba.etiqueta}",
                        relevante_ce3x=True)
            # Es CUBIERTA solo lo que no tiene NADA encima: si arriba hay un
            # trastero que no cuenta, esto es una particion y no un tejado.
            cubierta = _limpia(resto.difference(arriba.huella))
            comun = _limpia(resto.intersection(arriba.huella))
            for poli in _polis(cubierta):
                add(nivel=pl.nivel, planta=pl.etiqueta, tipo="CUBIERTA",
                    subtipo="AIRE_EXTERIOR", poligono=poli, area_m2=round(poli.area, 2),
                    espacio_origen=_uso(pl), espacio_destino="EXTERIOR",
                    confianza=0.85,
                    nota=f"la planta {arriba.etiqueta} no cubre esta parte")
            for poli in _polis(comun):
                destino = _uso(arriba)
                no_hab = destino in NO_HABITABLES
                add(nivel=pl.nivel, planta=pl.etiqueta, tipo="PARTICION_HORIZONTAL",
                    subtipo="ESPACIO_NO_HABITABLE_SUPERIOR" if no_hab else "ENTRE_PLANTAS",
                    poligono=poli, area_m2=round(poli.area, 2),
                    espacio_origen=_uso(pl), espacio_destino=destino,
                    confianza=round(min(pl.confianza_uso or 0.5, arriba.confianza_uso or 0.5), 2),
                    nota=f"techo de {pl.etiqueta} bajo {arriba.etiqueta}",
                    relevante_ce3x=no_hab or _uso(pl) != destino)
    return salida
