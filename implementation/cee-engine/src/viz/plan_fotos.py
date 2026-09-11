"""Plan de fotos: que le pedimos al cliente, muro por muro.

POR QUE EXISTE
--------------
Medir un hueco en una foto se sabe hacer: se rectifica la perspectiva contra la
longitud del muro, que la da Catastro medida. Lo que NO se sabe es **a que muro
pertenece cada foto**, y eso no lo arregla un modelo mejor.

Se arregla pidiendo la foto CONTRA EL PLANO. La app ya tiene un formulario
guiado de fotos; esto le da, para cada toma, el texto que enseñarle al cliente y
un plano con LA PARED SEÑALADA. Deja de ser un problema de vision y pasa a ser
un campo de formulario.

AL CLIENTE NO SE LE PIDE QUE MIDA NADA. Lo unico que se le pide es que la pared
salga ENTERA —las dos esquinas y del suelo al tejado—, porque entonces la foto
lleva los cuatro vertices de un rectangulo de ancho conocido y la rectificacion
sale sola. El encuadre hace el trabajo que si no habria que pedirle con cinta.

QUE SALE
--------
    plan_fotos.json     una entrada por toma: id, muros, textos y las anclas
    foto_<ID>.png       el plano de la planta con esa pared resaltada

COMO SE AGRUPA
--------------
Una toma es **UN PLANO**: dos muros perpendiculares no caben de frente en la
misma foto, asi que una tira de fachada se corta en cuanto cambia la
orientacion, aunque sea la misma calle.

En los patios va **una toma por PARED**, que es justo lo que hoy no se sabe: a
que pared pertenece cada foto. Como los muros vienen en orden de recorrido del
anillo, los contiguos de tipo PATIO son el mismo patio y se agrupan solos.

Las MEDIANERAS no se fotografian: no tienen huecos, dan contra el edificio de
al lado. Y las plantas que no entren en la envolvente tampoco: no se le piden
fotos al cliente de un almacen que luego no se va a modelar.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt                                    # noqa: E402
from shapely import wkt as shapely_wkt                             # noqa: E402

# Como se le llama a cada tipo de muro cuando se le habla al cliente. Esto es
# SOLO el vocabulario: NO decide que se fotografia.
COMO_SE_LLAMA = {
    "CALLE": "fachada exterior",
    "PATIO": "patio",
    "ESPACIO_LIBRE_PARCELA": "fachada al espacio libre de tu parcela",
    "SOBRE_CUBIERTA_INFERIOR": "fachada sobre la cubierta de abajo",
    "SOBRE_CUBIERTA_COLINDANTE": "fachada sobre la cubierta del vecino",
}

# Lo que NO se fotografia, y es una lista corta y cerrada: la medianera da
# contra el edificio de al lado y no tiene huecos.
#
# Ojo con el sentido de esta regla: se excluye por lista NEGRA a proposito. Con
# una lista blanca, un subtipo nuevo del clasificador desaparecia del plan SIN
# DECIR NADA — paso el 2026-09-11 con `ESPACIO_LIBRE_PARCELA`, que dejo fuera
# 9,87 m de fachada de Los Yebenes sin que saltara ningun aviso.
NO_SE_FOTOGRAFIAN = {"EDIFICIO_COLINDANTE"}
RUMBO = {"N": "al Norte", "S": "al Sur", "E": "al Este", "O": "al Oeste",
         "NE": "al Noreste", "NO": "al Noroeste",
         "SE": "al Sureste", "SO": "al Suroeste"}


def _medida(el: dict, campo: str):
    v = el.get(campo)
    return v.get("value") if isinstance(v, dict) else v


def _direccion(catastro: dict) -> str:
    """Solo la calle y el numero: 'CL MEJICO 4'.

    El `ldt` de Catastro trae ademas CP, municipio y provincia, y en el texto
    que lee el cliente eso sobra: ya sabe en que pueblo vive.

    Se admiten las dos formas en que llega esto: el JSON CRUDO de
    `Consulta_DNPRC` y el `modelo.catastro` ya parseado del pipeline.
    """
    if not isinstance(catastro, dict):
        return ""
    try:                                   # crudo de Catastro
        d = (catastro["consulta_dnprcResult"]["bico"]["bi"]
             ["dt"]["locs"]["lous"]["lourb"]["dir"])
        trozos = [d.get("tv", ""), d.get("nv", ""), d.get("pnp", "")]
        corto = " ".join(str(t).strip() for t in trozos if str(t).strip())
        if corto:
            return corto
    except (KeyError, TypeError):
        pass
    for camino in (("inmueble", "direccion"), ("direccion",)):
        v = catastro
        for paso in camino:
            v = v.get(paso) if isinstance(v, dict) else None
        if isinstance(v, str) and v.strip():
            # el parseado puede traer la direccion larga; nos quedamos con lo
            # de delante del codigo postal
            trozo = v.split(",")[0].strip()
            for i, ch in enumerate(trozo):
                if ch.isdigit() and trozo[i:i + 5].isdigit():
                    trozo = trozo[:i].strip()
                    break
            return trozo
    return ""


def agrupar(elementos: list[dict], espacios: set[str] | None = None) -> list[dict]:
    """Parte los muros en TOMAS.

    Dos reglas, y las dos salen de como se hace una foto:

    * **Una toma es UN PLANO.** Dos muros perpendiculares no caben de frente en
      la misma foto, asi que una tira de fachada se corta en cuanto cambia la
      orientacion — aunque sea la misma calle.
    * **En un patio, una toma por PARED.** Es justo lo que no se sabe hoy: a que
      pared pertenece cada foto. Cada una con su plano y su pared marcada.
    """
    tomas: list[dict] = []
    for i, el in enumerate(elementos):
        if el["tipo"] not in ("FACHADA", "MEDIANERA"):
            continue
        if espacios is not None and el.get("espacio_origen") not in espacios:
            continue
        sub = el["subtipo"]
        if el["tipo"] != "FACHADA" or sub in NO_SE_FOTOGRAFIAN:
            continue

        if sub == "PATIO":
            # una toma por pared, pero sabiendo de que patio es cada una
            patio = _patio_de(elementos, i)
            tomas.append({"subtipo": sub, "planta": el["planta"], "muros": [el],
                          "patio": patio})
            continue

        anterior = elementos[i - 1]["id"] if i > 0 else None
        ultima = tomas[-1] if tomas else None
        if (ultima and ultima["subtipo"] == sub and ultima["planta"] == el["planta"]
                and ultima.get("patio") is None
                and ultima["muros"][-1]["orientacion"] == el["orientacion"]
                and ultima["muros"][-1]["id"] == anterior):
            ultima["muros"].append(el)
        else:
            tomas.append({"subtipo": sub, "planta": el["planta"], "muros": [el],
                          "patio": None})
    return tomas


def _patio_de(elementos: list[dict], i: int) -> str:
    """Nombra el patio por el primer muro de su tira de muros contiguos."""
    j = i
    while (j > 0 and elementos[j - 1].get("subtipo") == "PATIO"
           and elementos[j - 1].get("planta") == elementos[i].get("planta")):
        j -= 1
    return elementos[j]["id"]


def _texto(toma: dict, direccion: str, principal: bool,
           sitio: str = "") -> tuple[str, str]:
    """Titulo y subtitulo, con la forma del formulario guiado de la app.

    El tono es el que ya usa la app con el cliente: de tu, corto y sin jerga.
    «Tu casa vista desde la calle / Apártate lo suficiente para que salga
    entera, con todas sus ventanas.»
    """
    muros = toma["muros"]
    largo = sum(float(_medida(m, "largo") or 0) for m in muros)
    entera = ("Que salga la pared ENTERA: las dos esquinas, y desde el suelo "
              "hasta el tejado.")

    if toma["subtipo"] == "CALLE":
        if principal:
            titulo = "Tu casa vista desde la calle"
            sub = (f"Ponte en la acera de enfrente y apártate hasta que quepa "
                   f"entera: las dos esquinas y desde el suelo hasta el tejado, "
                   f"con todas sus ventanas. Son unos {largo:.0f} m de ancho.")
            if direccion:
                sub = f"Es la fachada de {direccion}. " + sub
            return titulo, sub
        rumbo = RUMBO.get(muros[0]["orientacion"], "")
        return (f"La pared de fuera que da {rumbo}",
                f"Mide unos {largo:.0f} m. {entera} Ponte lo más de frente que puedas.")

    if toma["subtipo"] == "PATIO":
        return (f"{sitio or 'El patio'}: la pared marcada en rojo",
                f"Ponte enfrente de ella, dentro del patio, y apártate hasta el "
                f"fondo. Mide {largo:.2f} m de ancho. {entera}")

    nombre = COMO_SE_LLAMA.get(toma["subtipo"], "pared de fuera")
    return (f"La {nombre}", f"Mide unos {largo:.0f} m. {entera}")


# Para ser la puerta de entrada hacen falta tres cosas, y las tres se saben ya
# sin preguntarle a nadie: dar a la CALLE, estar en PLANTA BAJA y que quepa una
# puerta. Con eso, elegir la fachada de entrada deja de ser escoger entre quince
# paredes y pasa a ser entre dos o tres.
#
# NO se puede deducir cual es: comprobado el 2026-09-11 con el punto que da
# `Consulta_CPMRC`, que resulto estar a 1,67 m del CENTROIDE de la huella — es un
# punto interior representativo, no el portal. Hay que preguntarlo una vez.
ANCHO_MINIMO_ENTRADA = 1.2

PREGUNTA_ENTRADA = "¿Por dónde se entra a la casa?"


def candidata_a_entrada(toma: dict) -> bool:
    """Lo MAS PROBABLE, no lo unico posible. Es una sugerencia.

    **Nunca se usa para filtrar lo que se le ofrece a nadie.** El 2026-09-11, en
    Los Yebenes, la puerta estaba metida en un retranqueo: Catastro lo clasifica
    como PATIO, no como CALLE, asi que con este filtro la respuesta correcta NO
    SALIA — ni en la vista del certificador ni en el formulario del cliente. No
    es que la sugerencia fallara, es que impedia contestar bien.

    Se ofrecen TODAS las paredes de planta baja, con estas delante.
    """
    largo = sum(float(_medida(m, "largo") or 0) for m in toma["muros"])
    return (toma["subtipo"] == "CALLE" and toma["planta"] == "PB"
            and largo >= ANCHO_MINIMO_ENTRADA)


#: Lo que se le ofrece al cliente en vez de la foto. NO es saltarse el paso:
#: decir "esta pared no tiene ventanas" es un DATO, y de los buenos — significa
#: que esa pared va a la envolvente con cero huecos, no que no se sepa.
SIN_VENTANAS = "Esta pared no tiene ventanas ni puertas"


def _anclas(toma: dict) -> dict:  # noqa: D401
    """Lo que hace que esa foto se pueda MEDIR, y que no lo pone el cliente.

    El ancho de la pared lo da Catastro, medido. Y si la pared sale entera
    tambien de arriba abajo, la foto contiene los cuatro vertices de un
    rectangulo del que se conoce el ancho: con eso la rectificacion queda
    determinada en las dos direcciones, no solo en la horizontal.

    Por eso el encuadre NO es una recomendacion: es la condicion de la que
    depende poder medir. Es tambien lo que evita tener que pedirle al cliente
    que mida nada con cinta.
    """
    return {
        "largo_pared_m": round(sum(float(_medida(m, "largo") or 0)
                                   for m in toma["muros"]), 2),
        "fuente_largo": "CATASTRO_WFS_BU",
        "requiere_pared_completa": True,
        "por_que": ("Si la pared sale cortada, el largo de Catastro deja de "
                    "servir de ancla y la foto no se puede medir."),
    }


def ordenar(tomas: list[dict], principal: dict | None) -> list[dict]:
    """Deja la fachada de la puerta la PRIMERA y sigue el recorrido desde ahí.

    Los muros salen en orden de recorrido del anillo, que empieza donde le toca
    a la geometria. Al cliente hay que sacarlo de su puerta y llevarlo hacia
    delante, asi que la lista se ROTA hasta la fachada principal.
    """
    if principal is None or principal not in tomas:
        return tomas
    i = tomas.index(principal)
    return tomas[i:] + tomas[:i]


def _dibuja(destino: Path, elementos: list[dict], toma: dict, titulo: str,
            direccion: str = "") -> Path:
    """El plano de la planta con LA PARED de esta toma marcada.

    Esto lo mira un cliente en el movil, no un tecnico, asi que:

    * el rotulo va FUERA de la pared, que si no la tapa justo a ella;
    * se marca la fachada a la calle, para poder orientarse;
    * y una flecha dice **desde donde hacer la foto** — que es la direccion de
      la normal exterior, la misma que ya se calcula para la orientacion.
    """
    de_la_planta = [e for e in elementos
                    if e["planta"] == toma["planta"] and e.get("geometria_wkt")]
    marcados = {m["id"] for m in toma["muros"]}

    fig, ax = plt.subplots(figsize=(7, 7))
    for el in de_la_planta:
        g = shapely_wkt.loads(el["geometria_wkt"])
        if g.geom_type == "Polygon":           # suelos y cubiertas: el contorno
            g = g.exterior
        elif g.geom_type != "LineString":
            continue
        x, y = g.xy
        if el["id"] in marcados:
            continue                           # las marcadas, al final y encima
        calle = el["subtipo"] == "CALLE"
        ax.plot(x, y, color="#34495e" if calle else "#d5dbdb",
                linewidth=4.0 if calle else 2.5, zorder=2 if calle else 1)

    for el in de_la_planta:
        if el["id"] not in marcados:
            continue
        g = shapely_wkt.loads(el["geometria_wkt"])
        x, y = g.xy
        ax.plot(x, y, color="#e74c3c", linewidth=8, solid_capstyle="round", zorder=3)

        cx, cy = g.interpolate(0.5, normalized=True).coords[0]
        # la normal exterior: hacia donde MIRA el muro, o sea donde se pone quien
        # hace la foto
        az = math.radians(float(el.get("azimut") or 0.0))
        nx, ny = math.sin(az), math.cos(az)
        d = max(2.5, float(_medida(el, "largo") or 3) * 0.55)
        ax.annotate("", xy=(cx + nx * 0.8, cy + ny * 0.8),
                    xytext=(cx + nx * d, cy + ny * d),
                    arrowprops=dict(arrowstyle="-|>", lw=2.4, color="#e74c3c"),
                    zorder=4)
        ax.text(cx + nx * d * 1.12, cy + ny * d * 1.12,
                f"{el['id']}  ·  {_medida(el, 'largo'):.2f} m\nponte aquí",
                color="white", fontsize=10, fontweight="bold",
                ha="center", va="center", zorder=5,
                bbox=dict(boxstyle="round,pad=0.4", fc="#c0392b", ec="none"))

    x0, x1 = ax.get_xlim()
    y0, y1 = ax.get_ylim()
    ax.annotate("N", xy=(x1, y1), xytext=(x1, y1 - (y1 - y0) * 0.10),
                arrowprops=dict(arrowstyle="-|>", lw=2, color="#2c3e50"),
                fontsize=13, fontweight="bold", ha="center", color="#2c3e50")
    # el nombre de la calle sobre la fachada principal: es de lo que se agarra
    # el cliente para saber por donde esta mirando el plano
    if direccion:
        calles = [e for e in de_la_planta if e["subtipo"] == "CALLE"]
        if calles:
            principal = max(calles, key=lambda e: float(_medida(e, "largo") or 0))
            g = shapely_wkt.loads(principal["geometria_wkt"])
            cx, cy = g.interpolate(0.5, normalized=True).coords[0]
            az = math.radians(float(principal.get("azimut") or 0.0))
            ax.text(cx + math.sin(az) * 2.0, cy + math.cos(az) * 2.0, direccion,
                    fontsize=10, fontweight="bold", color="#34495e",
                    ha="center", va="center", zorder=2)
    ax.plot([], [], color="#34495e", lw=4, label="fachada a la calle")
    ax.legend(loc="lower left", frameon=False, fontsize=9)

    ax.set_aspect("equal")
    ax.set_axis_off()
    ax.set_title(titulo, fontsize=13, fontweight="bold", pad=14)
    fig.tight_layout()
    fig.savefig(destino, dpi=110, bbox_inches="tight")
    plt.close(fig)
    return destino


def generar(out: Path, elementos: list[dict], catastro: dict,
            espacios: set[str] | None = None) -> dict:
    """Escribe plan_fotos.json y un PNG por toma. Devuelve el plan.

    `espacios` limita las tomas a los espacios HABITABLES: no se le piden fotos
    al cliente de las paredes de un almacen que luego no se va a modelar, porque
    un espacio no habitable no aporta huecos a la envolvente.
    """
    out.mkdir(parents=True, exist_ok=True)
    direccion = _direccion(catastro)
    tomas = agrupar(elementos, espacios)

    # La fachada principal es la tira de calle mas larga: es la que lleva el
    # portal, y es la unica a la que se le puede poner nombre de calle.
    calles = [t for t in tomas if t["subtipo"] == "CALLE"]
    principal = max(calles, key=lambda t: sum(float(_medida(m, "largo") or 0)
                                              for m in t["muros"]), default=None)

    tomas = ordenar(tomas, principal)

    # Los patios se numeran y cada pared sabe cual es de cuantas: si no, seis
    # tomas seguidas se llaman igual y el cliente se pierde.
    sitios: dict[int, str] = {}
    patios = [p for p in dict.fromkeys(t.get("patio") for t in tomas) if p]
    for n_patio, patio in enumerate(patios, start=1):
        del_patio = [t for t in tomas if t.get("patio") == patio]
        nombre = f"Patio {n_patio}" if len(patios) > 1 else "El patio"
        for k, t in enumerate(del_patio, start=1):
            sitios[id(t)] = f"{nombre} · pared {k} de {len(del_patio)}"

    plan = {
        "direccion": direccion,
        "pregunta_entrada": PREGUNTA_ENTRADA,
        "boton_sin_ventanas": SIN_VENTANAS,
        "_como_responder": (
            "Por cada toma se devuelve o una foto, o sin_huecos=true si el "
            "cliente pulsó «" + SIN_VENTANAS + "». Las dos cosas son un dato: "
            "«no tiene ventanas» significa CERO huecos en esa pared, no que no "
            "se sepa. Lo que no vale es dejarla en blanco."),
        "tomas": [],
    }
    for n, toma in enumerate(tomas, start=1):
        ident = f"T{n:02d}"
        muros = [m["id"] for m in toma["muros"]]
        rotulo = f"{ident} — {'  '.join(muros)}"
        imagen = _dibuja(out / f"foto_{ident}.png", elementos, toma, rotulo,
                         direccion)
        titulo, subtitulo = _texto(toma, direccion, toma is principal,
                                   sitios.get(id(toma), ""))
        plan["tomas"].append({
            "id": ident,
            "orden": n,
            "planta": toma["planta"],
            "tipo": toma["subtipo"],
            "patio": toma.get("patio"),
            "muros": muros,
            "orientaciones": [m["orientacion"] for m in toma["muros"]],
            "largo_total_m": round(sum(float(_medida(m, "largo") or 0)
                                       for m in toma["muros"]), 2),
            "titulo": titulo,
            "subtitulo": subtitulo,
            "permite_sin_ventanas": True,
            "candidata_entrada": candidata_a_entrada(toma),
            "anclas": _anclas(toma),
            "plano": imagen.name,
        })

    destino = out / "plan_fotos.json"
    destino.write_text(json.dumps(plan, ensure_ascii=False, indent=2),
                       encoding="utf-8")
    return plan
