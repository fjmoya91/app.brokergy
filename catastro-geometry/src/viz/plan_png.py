"""Plano de depuracion output/geometry_debug.png (§16).

UN PANEL POR PLANTA, con el ID de CE3X y la longitud encima de cada segmento,
para poder compararlo de un vistazo contra la cartografia catastral.

REGLA — se rotula con el ID que sale en el CSV (F01, M01, PI01), no con el id
interno del segmento: el plano existe para cruzarlo con la tabla.

REGLA — las plantas NO se dibujan superpuestas. Encimadas, la medianera de la
planta baja queda debajo de la de la primera y su rotulo desaparece: se ve un
plano limpio que esconde justo lo que hay que revisar.
"""
from __future__ import annotations

import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                    # noqa: E402
from matplotlib.lines import Line2D                                # noqa: E402
from shapely.geometry.base import BaseGeometry                     # noqa: E402

from ..gis.adjacency import Contacto, Tramo                        # noqa: E402

COLORES = {
    Contacto.OTHER_BUILDING: "#c0392b",
    Contacto.PATIO_EDIFICIO: "#2980b9",
    Contacto.PATIO_PARCELA: "#5dade2",
    Contacto.EXTERIOR_CALLE: "#27ae60",
    Contacto.EXTERIOR_RETRANQUEO: "#16a085",
    Contacto.EXTERIOR_SOBRE_CUBIERTA: "#1abc9c",
    Contacto.EXTERIOR_SOBRE_VECINO: "#e67e22",
    Contacto.NO_HABITABLE: "#8e44ad",
    Contacto.DESCONOCIDO: "#f39c12",
}
ETIQUETA = {
    Contacto.OTHER_BUILDING: "Medianera (edificio colindante)",
    Contacto.PATIO_EDIFICIO: "Fachada a patio (hueco de la huella)",
    Contacto.PATIO_PARCELA: "Fachada a patio de parcela",
    Contacto.EXTERIOR_CALLE: "Fachada exterior / calle",
    Contacto.EXTERIOR_RETRANQUEO: "Fachada a espacio libre de parcela",
    Contacto.EXTERIOR_SOBRE_CUBIERTA: "Fachada sobre cubierta inferior",
    Contacto.EXTERIOR_SOBRE_VECINO: "Fachada sobre cubierta del colindante",
    Contacto.NO_HABITABLE: "Particion con espacio no habitable",
    Contacto.DESCONOCIDO: "PENDIENTE DE REVISION",
}


def _dibuja_poly(ax, g: BaseGeometry | None, **kw):
    if g is None or g.is_empty:
        return
    polis = g.geoms if g.geom_type in ("MultiPolygon", "GeometryCollection") else [g]
    for p in polis:
        if p.geom_type != "Polygon":
            continue
        x, y = p.exterior.xy
        ax.fill(x, y, **kw)
        for anillo in p.interiors:
            xi, yi = anillo.xy
            ax.fill(xi, yi, color="white", zorder=kw.get("zorder", 1) + 0.1)


def _panel(ax, capa: dict, extent: tuple[float, float, float, float]) -> list:
    _dibuja_poly(ax, capa.get("parcela"), color="#f7f3e3", ec="#b8860b", lw=1.8,
                 zorder=1, alpha=0.9)
    _dibuja_poly(ax, capa.get("vecinos"), color="#dcdcdc", ec="#8c8c8c", lw=1.0,
                 zorder=2, alpha=0.9)
    _dibuja_poly(ax, capa.get("huella"), color="#ffffff", ec="#2c2c2c", lw=1.4,
                 zorder=3, alpha=0.98)

    usados: list = []
    # Los rotulos se colocan con separacion garantizada: en un patio de 3 x 2 m
    # los cuatro caen unos encima de otros y el plano deja de servir para
    # comprobar nada, que es su unica razon de ser.
    colocados: list[tuple[float, float]] = []
    D_MIN = 2.6

    for t in capa["tramos"]:
        s = t.segment
        col = COLORES.get(t.contacto, "#000000")
        if t.contacto not in usados:
            usados.append(t.contacto)
        ax.plot([s.x1, s.x2], [s.y1, s.y2], color=col, lw=5.0, zorder=5,
                solid_capstyle="butt")

        mx, my = (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2
        nx, ny = s.normal()
        # en un hueco interior el rotulo se saca hacia la masa construida
        signo = -1.0 if s.ring == "interior" else 1.0
        off = 1.7 if s.ring == "interior" else max(1.2, min(2.8, s.length_m * 0.20))
        lx, ly = mx + nx * off * signo, my + ny * off * signo
        for _ in range(8):
            if all(math.hypot(lx - px, ly - py) >= D_MIN for px, py in colocados):
                break
            off += 1.15
            lx, ly = mx + nx * off * signo, my + ny * off * signo
        colocados.append((lx, ly))

        ax.plot([mx, lx], [my, ly], color=col, lw=0.7, ls=":", zorder=4.5, alpha=0.85)
        etiqueta = s.meta.get("ce3x_id", s.id)
        ax.annotate(f"{etiqueta}\n{s.length_m:.2f} m", (lx, ly),
                    ha="center", va="center", fontsize=7.6, zorder=6, color="#111111",
                    bbox=dict(boxstyle="round,pad=0.24", fc="white", ec=col, lw=1.0,
                              alpha=0.95))
        ax.annotate("", xy=(mx + nx * 0.95, my + ny * 0.95), xytext=(mx, my),
                    arrowprops=dict(arrowstyle="-|>", color=col, lw=1.1, alpha=0.85),
                    zorder=5.5)

    ax.set_xlim(extent[0], extent[1])
    ax.set_ylim(extent[2], extent[3])
    ax.set_aspect("equal", adjustable="box")
    ax.grid(True, ls=":", lw=0.5, alpha=0.5)
    ax.set_title(capa["titulo"], fontsize=10.5, fontweight="bold")
    return usados


def _extent(capas, margen: float = 4.0):
    xs, ys = [], []
    for c in capas:
        for g in (c.get("parcela"), c.get("huella"), c.get("vecinos")):
            if g is not None and not g.is_empty:
                x0, y0, x1, y1 = g.bounds
                xs += [x0, x1]
                ys += [y0, y1]
    if not xs:
        return (0, 1, 0, 1)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    # mismo lado en los dos ejes para que la escala sea comparable entre paneles
    lado = max(x1 - x0, y1 - y0) / 2 + margen
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (cx - lado, cx + lado, cy - lado, cy + lado)


def dibujar(destino: Path, capas: list[dict], *, titulo: str = "",
            subtitulo: str = "") -> Path:
    """`capas` = una entrada por planta: {titulo, huella, vecinos, parcela, tramos}."""
    capas = [c for c in capas if c.get("tramos")]
    if not capas:
        raise ValueError("no hay nada que dibujar")
    n = len(capas)
    cols = min(3, n)
    filas = math.ceil(n / cols)
    fig, axes = plt.subplots(filas, cols, figsize=(7.6 * cols, 7.8 * filas),
                             squeeze=False)
    ext = _extent(capas)

    usados: list = []
    for i, capa in enumerate(capas):
        ax = axes[i // cols][i % cols]
        for c in _panel(ax, capa, ext):
            if c not in usados:
                usados.append(c)
        if i // cols == filas - 1:
            ax.set_xlabel("X ETRS89 / UTM 30N (m)", fontsize=8)
        if i % cols == 0:
            ax.set_ylabel("Y ETRS89 / UTM 30N (m)", fontsize=8)
        ax.tick_params(labelsize=7)
        x0, x1, y0, y1 = ext
        ax.annotate("N", xy=(x1 - (x1 - x0) * 0.07, y1 - (y1 - y0) * 0.07),
                    xytext=(x1 - (x1 - x0) * 0.07, y1 - (y1 - y0) * 0.16),
                    arrowprops=dict(arrowstyle="-|>", color="#222", lw=2),
                    ha="center", fontsize=12, fontweight="bold")

    for j in range(n, filas * cols):
        axes[j // cols][j % cols].axis("off")

    handles = [Line2D([0], [0], color=COLORES[c], lw=5, label=ETIQUETA[c])
               for c in usados]
    handles += [Line2D([0], [0], color="#b8860b", lw=2, label="Parcela catastral"),
                Line2D([0], [0], color="#8c8c8c", lw=2,
                       label="Edificios colindantes (a esa altura)"),
                Line2D([0], [0], color="#111", lw=0, marker=r"$\rightarrow$",
                       markersize=10, label="Flecha = hacia donde MIRA el cerramiento")]
    fig.legend(handles=handles, loc="lower center", ncol=min(3, len(handles)),
               fontsize=9, framealpha=0.95,
               bbox_to_anchor=(0.5, -0.13))
    fig.suptitle(titulo + ("\n" + subtitulo if subtitulo else ""), fontsize=12.5)
    destino.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout(rect=(0, 0.02, 1, 0.94))
    fig.savefig(destino, dpi=140, bbox_inches="tight")
    plt.close(fig)
    return destino
