"""cee-engine — el motor de envolvente térmica, como microservicio.

Mismo patrón que `rite-generator`: FastAPI en su propio contenedor, al que el
backend Node llama por HTTP. El motor NO tiene estado ni sesión: entra un JSON,
sale geometría o un `.cex`. Quién puede pedirlo lo decide el backend.

De una referencia catastral saca la huella del edificio, la parte en
cerramientos por planta, dice de cada uno si es fachada, medianera o partición
y contra qué da, con qué orientación y cuánto mide; y escribe un `.cex` que
CE3X abre con la envolvente ya puesta.

Lo que NO hace: no calcula transmitancias ni nada térmico (eso es CE3X), y no
inventa medidas — lo que no se sabe sale `null` con el motivo escrito.

⚠ Un `.cex` NUNCA se deserializa. Son pickles de Python que vienen de fuera y
`pickle.load()` ejecuta código arbitrario. Se leen recorriendo los opcodes con
`pickletools.genops()`, que no ejecuta nada. Ver `tools/leer_cex.py`.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, Form, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tools"))

from src import pipeline                              # noqa: E402
from src.catastro import refcat as refcat_mod         # noqa: E402
from src.catastro.client import CatastroError         # noqa: E402
from src.ce3x import export                           # noqa: E402
from src.gis import cuerpos as cuerpos_mod            # noqa: E402
from src.model import Modelo                          # noqa: E402
from src.viz import plano_svg                         # noqa: E402

import generar_cex as G                               # noqa: E402
import leer_cex as L                                  # noqa: E402
import editar_cex as E                                # noqa: E402
import radiografia_cex as RX                          # noqa: E402
import cee_final as CF                                # noqa: E402
import version_ce3x as VC                             # noqa: E402
import convertir_cex as CX                            # noqa: E402

logging.basicConfig(level=logging.INFO,
                    format="%(levelname)-7s %(name)s | %(message)s")
log = logging.getLogger("cee-engine")

app = FastAPI(title="cee-engine", version="1.0.0")

#: La plantilla es un ACTIVO del servicio: sin ella no se genera nada. Es un
#: `.cex` en blanco guardado por el propio CE3X, y de ahí se copian byte a byte
#: los 11 pickles que no sabemos escribir (entre ellos un HMAC con clave
#: desconocida). Ver docs/11 del proyecto CEE.
PLANTILLA = RAIZ / "assets" / "plantilla-virgen.cex"

#: Los bloques que la ficha del certificador TIENE que traer para escribir un
#: `.cex`. Son los que `generar_cex` lee con `datos["…"]`, sin respaldo.
#: `tecnico` e `instalaciones` NO están: los lee con `.get` y, si no vienen, se
#: quedan los de la plantilla —así se generó el .cex real de Los Yébenes, cuya
#: ficha no trae `tecnico`—. Se comprueban ANTES de tocar nada para poder decir
#: qué falta en vez de morir en el primer KeyError.
FICHA_OBLIGATORIA = {
    "administrativos": "los datos administrativos (titular, dirección, RC)",
    "generales": "los datos generales (zona climática, superficie, nº de plantas)",
    "termicas": "las transmitancias de los cerramientos",
    "envolvente": "la envolvente (paredes y huecos)",
}

#: Dónde se deja el trabajo de cada petición. El contenedor es efímero: esto no
#: es almacenamiento, es un sitio donde el pipeline pueda escribir sus ficheros.
TRABAJO = Path(tempfile.gettempdir()) / "cee-engine"

#: La caché de Catastro, SEPARADA del trabajo de cada petición y configurable.
#: No es una optimización: cada consulta pasa por el mismo WAF del que depende
#: el buscador de la app en producción, así que lo que ya se preguntó una vez
#: no se vuelve a preguntar. En el VPS conviene montarla en un volumen para que
#: sobreviva a los despliegues; en local se apunta a `ejemplos/`.
CACHE = Path(os.environ.get("CEE_CACHE_DIR") or (TRABAJO / "cache"))


# --------------------------------------------------------------------------
# Salud
# --------------------------------------------------------------------------

def _codigo_at() -> float:
    """Lo más nuevo que hay en el código QUE SE CARGÓ al arrancar.

    Python importa una vez por proceso: tras tocar el motor hay que
    reiniciarlo, y olvidarlo significa probar el código de antes y no
    enterarse — pasó tres veces seguidas. Con esto, quien llama puede comparar
    con el disco y avisar en vez de dar por bueno un resultado viejo.
    """
    ultimo = 0.0
    for carpeta in (RAIZ / "src", RAIZ / "tools"):
        for f in carpeta.rglob("*.py"):
            try:
                ultimo = max(ultimo, f.stat().st_mtime)
            except OSError:
                pass
    return round(max(ultimo, Path(__file__).stat().st_mtime), 3)


#: Se calcula UNA vez, al importar: es la foto del código que de verdad corre.
CODIGO_AT = _codigo_at()


@app.get("/health")
def health() -> dict:
    """Lo que comprueba el deploy. Si falta la plantilla, este servicio NO
    puede hacer su trabajo y más vale decirlo aquí que al generar."""
    return {
        "ok": PLANTILLA.is_file(),
        "servicio": "cee-engine",
        # Cuándo se escribió el código cargado, y cuándo el que hay en disco.
        # Si no coinciden, este proceso está sirviendo una versión vieja.
        "codigo_at": CODIGO_AT,
        "codigo_en_disco_at": _codigo_at(),
        "plantilla": PLANTILLA.name if PLANTILLA.is_file() else None,
        "cache": str(CACHE),
        "cacheados": sorted(p.name for p in CACHE.glob("*") if p.is_dir())[:20]
                     if CACHE.is_dir() else [],
    }


# --------------------------------------------------------------------------
# De una referencia catastral a la envolvente medida
# --------------------------------------------------------------------------

@app.post("/envolvente")
def envolvente(payload: dict = Body(...)) -> JSONResponse:
    """Entra `{referencia_catastral}`, sale la geometría clasificada.

    `altura_planta` es una DECISIÓN del certificador, no una medida: por eso
    viaja aparte y el resultado dice que viene de fuera.

    OJO con Catastro: al otro lado está el mismo WAF del que depende el buscador
    de la app en producción. Una petición por expediente y nunca en ráfaga; si
    el caso ya está en caché, `offline=true` no toca la red.
    """
    crudo = str(payload.get("referencia_catastral") or "").strip()
    if not crudo:
        raise HTTPException(400, "falta la referencia catastral")

    try:
        rc = refcat_mod.parse(crudo)
    except refcat_mod.RefCatError as exc:
        raise HTTPException(400, f"referencia catastral no válida: {exc}")

    trabajo = TRABAJO / f"{rc.parcela}-{uuid.uuid4().hex[:8]}"
    try:
        o = pipeline.Opciones(
            refcat=rc.parcela,
            output=trabajo / "salida",
            data=trabajo / "datos",
            cache=CACHE,
            floor_height=float(payload.get("altura_planta") or 2.80),
            floor_height_dada=payload.get("altura_planta") is not None,
            skip_lidar=bool(payload.get("skip_lidar", True)),
            offline=bool(payload.get("offline", False)),
            refresh=bool(payload.get("refresh", False)),
        )
        modelo = Modelo(refcat_parcela=rc.parcela, refcat_inmueble=rc.inmueble,
                        crs=o.crs_metrico)
        feats = pipeline.descargar(o, rc, modelo)
        pipeline.construir_modelo(o, rc, feats, modelo)
        # El CROQUIS CATASTRAL POR PLANTAS de la Sede (`catastro/sede.py`): dice
        # DONDE esta cada uso de cada planta (el garaje, el almacen, el porche),
        # que los servicios de siempre no dicen. Solo si se pide: son otras dos
        # peticiones a Catastro (cacheadas 30 dias), y un fallo no tumba nada.
        if payload.get("sede_catastro"):
            pipeline.traer_de_la_sede(o, rc, modelo)
        # Lo que la propiedad tiene en OTRA parcela (la planta baja de un
        # edificio colindante con viviendas de otros encima) y el SEMISOTANO
        # que Catastro dibuja sobre rasante. Los dos los declara el
        # certificador, y van ANTES de todo: cambian que planta es cada una.
        try:
            pipeline.anexar(o, modelo, payload.get("anexos"))
        except pipeline.AnexoInvalido as exc:
            raise HTTPException(422, f"Unidades de otra parcela: {exc}")
        pipeline.aplicar_semisotano(modelo, payload.get("semisotano"))
        # Lo que el PROYECTO construye y Catastro aun no dibuja (la planta alta
        # de una reforma): lo declara el certificador y se mide como vivienda.
        try:
            pipeline.anadir_volumenes(modelo, payload.get("volumenes"))
        except pipeline.VolumenInvalido as exc:
            raise HTTPException(422, f"Volumen del proyecto: {exc}")
        # Que construcciones CUENTAN lo marco una persona al abrir la
        # oportunidad, y de ahi salio la superficie que se le presupuesto al
        # cliente. Se aplica ANTES de clasificar: de `habitable` cuelgan que
        # plantas se miden, la superficie del .cex y el plan de fotos.
        # En un TERCIARIO cuentan también los usos del terciario (hotelero,
        # religioso, enseñanza, sanidad…), que Catastro no da por habitables.
        # Va ANTES de la selección: lo que marcó una persona sigue mandando.
        pipeline.aplicar_tipo_edificio(modelo, payload.get("tipo_edificio_ce3x"))
        pipeline.aplicar_seleccion(modelo, payload.get("construcciones"))
        # Una finca en la que Catastro no declara ninguna vivienda (todo
        # «ALMACEN») se queda sin plano: se mide entera y se dice.
        pipeline.sin_vivienda_mide_todo(modelo)
        # En una comunidad de adosados la parcela es el conjunto entero y
        # Catastro no dibuja donde acaba cada casa: el certificador DIBUJA el
        # contorno de la vivienda y lo de fuera pasa a ser la casa de al lado
        # (medianera). Va ANTES de los cuerpos: sus BuildingParts se recortan.
        recorte = payload.get("recorte_vivienda") or {}
        try:
            pipeline.recortar_vivienda(
                modelo, recorte.get("poligono") if isinstance(recorte, dict) else None)
        except pipeline.RecorteInvalido as exc:
            raise HTTPException(422, f"Contorno de la vivienda: {exc}")
        # Los CUERPOS del edificio, ANTES de quitar ninguno: la lista tiene que
        # seguir enseñando el que se ha dejado fuera, o no habria forma de
        # volver a meterlo — desapareceria del plano y del popup a la vez.
        inventario = cuerpos_mod.inventario(
            modelo, excluidos=payload.get("cuerpos_excluidos"))
        # Un aparcamiento adosado no es la envolvente de la vivienda. Se quita
        # el CUERPO y se vuelve a medir: la pared que lo separaba de la casa
        # aparece entonces como lo que es, en vez de quedarse la casa abierta
        # por ahi (que es lo que pasa tachando paredes una a una).
        # Las ZONAS que no cuentan en UNA planta (el garaje dentro de la casa,
        # con la vivienda encima). Se leen ANTES de quitar nada: se miden
        # contra lo construido en su nivel.
        # El CROQUIS: manchas a mano alzada de lo que no es vivienda, que aqui
        # se enderezan y se ajustan a los m2 que Catastro declara en su planta.
        # Salen como zonas mas (las mismas de «Quitar una zona») y vuelven en la
        # respuesta para que se guarden: el croquis se ajusta UNA vez.
        croquis_zonas, croquis_detalle = pipeline.ajustar_croquis(
            modelo, payload.get("croquis"),
            ajustar=payload.get("croquis_ajustar", True) is not False)
        zonas = pipeline.leer_zonas(
            modelo, list(payload.get("zonas_fuera") or []) + croquis_zonas)
        pipeline.excluir_cuerpos(modelo, payload.get("cuerpos_excluidos"),
                                 inventario=inventario, zonas=zonas)
        res = pipeline.analizar(o, modelo)
        pipeline.escribir_salidas(o, res, rc)
        # La PROPUESTA de croquis (ver `gis/croquis_propuesta.py`): donde está,
        # probablemente, lo que Catastro declara que no es vivienda DENTRO del
        # mismo cuerpo. Solo en las plantas que aún no tienen zonas ni croquis
        # (esas ya las ha decidido una persona). Nunca se aplica: la ve el
        # técnico y la ajusta como un croquis más. Un fallo aquí no puede
        # tumbar la medición.
        try:
            hechos = {z["nivel"] for z in zonas} | {
                t.get("nivel") for t in (payload.get("croquis") or []) if isinstance(t, dict)}
            pistas = payload.get("pistas_croquis") if isinstance(payload.get("pistas_croquis"), dict) else None
            propuesta = pipeline.proponer_croquis(modelo, res.elementos, inventario, hechos, pistas)
        except Exception:                          # noqa: BLE001
            log.exception("fallo proponiendo el croquis de %s", rc.parcela)
            propuesta = []

        geometria = json.loads(
            (o.output / "ce3x_geometry.json").read_text(encoding="utf-8"))
        plan = _plan_de_fotos(o.output)
        # El plano ya colocado. Se calcula AQUI, donde esta la geometria: el
        # navegador recibe puntos y no calcula ni un metro.
        dibujo = plano_svg.plantas(
            geometria, cuerpos=inventario,
            # De que cuerpo es cada pared. Se calcula sobre las partes que
            # QUEDAN: las del cuerpo excluido ya no estan en el plano.
            muro_cuerpo=cuerpos_mod.de_cada_muro(geometria["elementos"], modelo.partes))
        # Sin una sola pared que dibujar no hay plano que devolver: se dice por
        # que, en vez de morir mas abajo con un `KeyError('contexto')`, que es
        # lo unico que llegaba a la pantalla (26RES060_184).
        if not dibujo.get("plantas"):
            raise HTTPException(
                422, "Catastro no devuelve ninguna pared de vivienda para esta "
                     "referencia: no hay plano que medir. Comprueba la referencia "
                     "catastral del expediente.")

        return JSONResponse({
            "referencia_catastral": rc.to_dict(),
            "geometria": geometria,
            "ancho": dibujo["ancho"],
            "alto": dibujo["alto"],
            "plantas": dibujo["plantas"],
            # Los colindantes y la linde de la parcela, en el mismo lienzo. Sin
            # ellos el certificador no puede comprobar si una pared es
            # medianera: tiene que fiarse de como la clasifico Catastro.
            "contexto": dibujo["contexto"],
            # El encuadre amplio, para el boton "ver el entorno".
            "entorno": dibujo["entorno"],
            # Donde cae el lienzo en el mundo: con esto se le puede pedir al WMS
            # del Catastro su cartografia con el MISMO rectangulo y encaja sin
            # ajustar nada a ojo.
            "georef": dibujo["georef"],
            "plan_fotos": plan,
            # El desglose de construcciones TAL CUAL lo devuelve Catastro, con
            # la marca de cual cuenta. Es la misma tabla de la ficha tecnica de
            # la oportunidad, y va en la respuesta para poder ENSEÑARLA: de ella
            # salen la superficie y las plantas del .cex, y un desglose que solo
            # vive en otra pantalla no se comprueba nunca.
            "construcciones": _construcciones(modelo),
            # Los CUERPOS del edificio (los BuildingPart de Catastro) con la
            # construccion que les corresponde. Es lo que permite decir «esta
            # edificacion no cuenta» de una vez, en vez de pared por pared.
            "cuerpos": dibujo["cuerpos"],
            # Las zonas dibujadas que se han APLICADO, con lo que de verdad
            # restan de su planta (`indice` es su posicion en lo pedido). Las
            # que no sirven no vienen y el diagnostico dice por que.
            "zonas_fuera": [{"indice": z["indice"], "nivel": z["nivel"], "uso": z["uso"],
                             "area_m2": z["area_m2"]} for z in zonas],
            # El croquis ya ajustado: los poligonos (EPSG:25830) que hay que
            # GUARDAR como zonas, con su area, la de Catastro y la dibujada.
            "croquis_ajustado": croquis_detalle,
            # La PROPUESTA de croquis por planta: [{nivel, trazos: [{uso,
            # poligono (EPSG:25830), area_m2, catastro_m2, ancla, lado, por_que,
            # confianza}], avisos}]. Se ofrece, no se aplica.
            "croquis_propuesto": propuesta,
            # El croquis catastral por plantas, si se ha traido (o aportado):
            # sus recintos con su uso y su poligono (EPSG:25830), si encaja con
            # la parcela (`alineado`) y de cuando es. Y lo que paso en la Sede.
            "catastro_fxcc": modelo.catastro.get("fxcc_plantas"),
            "catastro_sede": modelo.catastro.get("sede"),
            "resumen": export.resumen(res.elementos),
            # Lo que NO se ha podido saber. Va al primer plano a propósito: es
            # lo que el certificador tiene que mirar.
            "diagnostico": list(modelo.diagnostics.messages),
        })
    except CatastroError as exc:
        # 502 y no 500: el que ha fallado es Catastro, no nosotros. Que el
        # backend pueda distinguirlo y no reintentar contra el WAF.
        raise HTTPException(502, f"Catastro: {exc}")
    except HTTPException:
        raise
    except Exception as exc:                      # noqa: BLE001
        log.exception("fallo construyendo la envolvente de %s", rc.parcela)
        raise HTTPException(500, str(exc))
    finally:
        shutil.rmtree(trabajo, ignore_errors=True)


@app.post("/catastro/documentos")
def catastro_documentos(payload: dict = Body(...)) -> JSONResponse:
    """Los documentos de la Sede del Catastro de una parcela, para ARCHIVARLOS.

    Entra `{referencia_catastral, productos?: [...], refresh?}` y salen los
    ficheros en base64: el FXCC por plantas, el croquis por plantas en PDF, los
    dos KML (3D) y el FXCC con colindantes (`sede.PRODUCTOS`). Van a la carpeta
    del CEE para el certificador, y la skill los mira antes de medir.

    Cacheados 30 dias por parcela; un fallo reciente no se reintenta en 6 h.
    """
    from src.catastro import sede as sede_mod
    import base64

    crudo = str(payload.get("referencia_catastral") or "").strip()
    try:
        rc = refcat_mod.parse(crudo)
    except refcat_mod.RefCatError as exc:
        raise HTTPException(400, f"referencia catastral no válida: {exc}")
    pedidos = [p for p in (payload.get("productos") or list(sede_mod.PRODUCTOS))
               if p in sede_mod.PRODUCTOS]
    o = pipeline.Opciones(refcat=rc.parcela, cache=CACHE,
                          offline=bool(payload.get("offline", False)),
                          refresh=bool(payload.get("refresh", False)))
    modelo = Modelo(refcat_parcela=rc.parcela, refcat_inmueble=rc.inmueble, crs=o.crs_metrico)
    try:
        pipeline.solo_parcela(o, rc, modelo)
    except CatastroError as exc:
        raise HTTPException(502, f"Catastro: {exc}")
    res = pipeline.traer_de_la_sede(o, rc, modelo, pedidos)
    if res is None:
        raise HTTPException(422, "Catastro no devuelve la geometría de la parcela: "
                                 "no se puede abrir su ficha en la Sede.")
    return JSONResponse({
        "referencia_catastral": rc.to_dict(),
        "sede": res.resumen(),
        "ficheros": {k: f.meta() | {"de_cache": f.de_cache,
                                    "titulo": sede_mod.PRODUCTOS[k].titulo,
                                    "datos_b64": base64.b64encode(f.datos).decode()}
                     for k, f in res.ficheros.items()},
        "fallos": res.fallos,
        "fxcc": modelo.catastro.get("fxcc_plantas"),
        "diagnostico": list(modelo.diagnostics.messages),
    })


def _construcciones(modelo: Modelo) -> list[dict]:
    """Las filas de `lcons`, con su codigo y si cuentan.

    `cuenta` es lo que manda hoy y `catastro` lo que decia el uso: las dos, para
    que se vea cuando una persona ha contado un almacen como vivienda.
    """
    out = []
    for s in modelo.spaces:
        a = s.attrs or {}
        if not a.get("codigo"):
            continue
        out.append({
            "codigo": a["codigo"],
            "uso": a.get("uso_literal") or s.use,
            "uso_normalizado": s.use,
            "planta": a.get("planta_literal"),
            "nivel": s.floor,
            "superficie": s.area,
            "cuenta": bool(a.get("habitable")),
            "catastro": a.get("habitable_catastro"),
            # Cuenta porque Catastro no declara NINGUNA vivienda y se mide todo
            # (`sin_vivienda_mide_todo`), no porque la haya marcado nadie.
            "por_defecto": bool(a.get("habitable_por_defecto")),
            # Cuenta porque el edificio es TERCIARIO y este es uno de sus usos
            # (`aplicar_tipo_edificio`): un hotel, un aula, una capilla.
            "por_tipo": bool(a.get("habitable_por_tipo")),
        })
    return sorted(out, key=lambda c: (c["nivel"] if c["nivel"] is not None else 99,
                                      c["codigo"]))


def _plan_de_fotos(salida: Path) -> list[dict]:
    """Las tomas, con su plano en PNG embebido.

    Cada toma es UN plano de pared y se convierte en un slot de DocsManager:
    el PNG es la ilustración de referencia que ve el cliente.
    """
    import base64

    fichero = salida / "fotos" / "plan_fotos.json"
    if not fichero.is_file():
        return []
    plan = json.loads(fichero.read_text(encoding="utf-8"))
    tomas = plan.get("tomas", plan) if isinstance(plan, dict) else plan
    for toma in tomas:
        png = salida / "fotos" / str(toma.get("plano") or "")
        if png.is_file():
            toma["plano_datos"] = ("data:image/png;base64," +
                                   base64.b64encode(png.read_bytes()).decode())
    return plan


# --------------------------------------------------------------------------
# El .cex
# --------------------------------------------------------------------------

@app.post("/cex")
def cex(payload: dict = Body(...)) -> Response:
    """Entra `{geometria, datos}`, sale el `.cex` como binario.

    `datos` es la ficha del certificador (`ce3x_datos.json`): lo que no sale de
    la geometría — cliente, zona climática, transmitancias, huecos, caldera.
    Cada valor lleva escrito de dónde viene, y eso vuelve en `avisos` para que
    el certificador vea qué NO es una medida antes de firmar.
    """
    geometria = payload.get("geometria")
    datos = payload.get("datos")
    if not isinstance(geometria, dict) or not isinstance(datos, dict):
        raise HTTPException(400, "hacen falta `geometria` y `datos`, los dos objetos")

    faltan = [nombre for clave, nombre in FICHA_OBLIGATORIA.items()
              if not isinstance(datos.get(clave), dict) or not datos[clave]]
    if faltan:
        # 422 y con NOMBRES. Sin esto, la primera clave que falta sale como un
        # KeyError pelado —`'termicas'`— convertido en un 500: el certificador
        # ve "no se pudo generar el .cex" y no hay forma de saber que lo que
        # falta es la ficha, no el fichero.
        raise HTTPException(422, "La ficha del certificador está incompleta: falta "
                                 + ", ".join(faltan) + ". La envolvente medida está "
                                 "bien; lo que no llega son los datos que el .cex "
                                 "necesita alrededor.")
    if not PLANTILLA.is_file():
        raise HTTPException(500, f"falta la plantilla {PLANTILLA.name}: sin ella "
                                 f"no se puede escribir un .cex")

    trabajo = Path(tempfile.mkdtemp(prefix="cex-", dir=_trabajo()))
    salida = trabajo / "expediente.cex"
    try:
        # `AVISOS_IMAGEN` es una lista GLOBAL del módulo y el CLI la usa una vez
        # por proceso. Aquí el proceso vive semanas: sin vaciarla, el .cex de un
        # expediente saldría con los avisos de todos los anteriores — con fotos
        # de OTROS clientes nombradas dentro.
        G.AVISOS_IMAGEN.clear()
        # El PROGRAMA de CE3X (residencial, pequeño o gran terciario). Se valida
        # lo primero: un tipo que no existe no puede acabar a medias en un
        # fichero.
        tipo = G.TER.tipo_de(datos)
        # La VERSION de CE3X (2.3 o 3.1, por defecto la vigente). Tambien se
        # valida lo primero, por lo mismo.
        version = VC.version_pedida(datos)
        envolvente_, avisos = G.construir_envolvente(geometria, datos)
        zonas = {str(z.estado[G.Cadena("nombre")]) for z in envolvente_[3]}
        base = L.trocear(PLANTILLA)
        instalaciones, av_ins = G.construir_instalaciones(
            datos, L.leer(base, G.INSTALACIONES), zonas)
        avisos.extend(av_ins)
        # En un TERCIARIO la iluminación es una instalación más, por zona. Va
        # ANTES de las medidas: cada medida es este mismo edificio con su
        # cambio, y sin esto saldrían sin iluminación.
        instalaciones, av_il = G.con_iluminacion(instalaciones, datos, envolvente_[3])
        avisos.extend(av_il)

        # Cada MEDIDA DE MEJORA es el mismo edificio con el cambio que ella
        # propone, así que su instalación se construye con los mismos escritores
        # que el CEE final: la aerotermia RETIRA la caldera (es una sustitución)
        # y el autoconsumo se AÑADE a lo que ya hay (`slots_a_retirar` lo deduce
        # del servicio que asume cada equipo, y una contribución no asume
        # ninguno).
        grupos, filas = [], []
        espacio = (datos.get("envolvente") or {}).get("espacio", "auto")
        for m in (datos.get("medidas") or []):
            equipos_m = m.get("instalaciones") or []
            if not equipos_m:
                avisos.append(f"La medida «{m.get('nombre')}» no declara ningún equipo:"
                              " no se escribe.")
                continue
            # Lo que ya dice el fichero MANDA, igual que en el CEE final: el
            # DEPÓSITO de ACS y la superficie servida se heredan del generador
            # que se sustituye. El depósito es del edificio, no de la caldera, y
            # nadie lo tira al cambiar el equipo — sin esto la medida declararía
            # que la vivienda pierde su acumulación.
            avisos.extend(G.heredar_del_base(equipos_m, instalaciones))
            # En la 3.1 el autoconsumo va como «Generación renovable eléctrica».
            inst_m, gens_m, av_i = G.instalaciones_de_medida(
                equipos_m, instalaciones, zonas, espacio, version)
            grupo, fila, av_g = G.construir_medida(m, envolvente_, inst_m, gens_m)
            avisos.extend(av_i + av_g)
            grupos.extend(grupo)
            if fila:
                filas.append(fila)

        informe, av_inf = G.construir_informe(datos, L.leer(base, G.INFORME))
        # La casilla 0 del diálogo es el conjunto que se imprime en el informe:
        # se pone SOLO si ese conjunto existe de verdad en el fichero, o el
        # informe apuntaría a una medida que no está.
        if grupos:
            # El conjunto que se imprime en el informe es el PRIMERO de los
            # elegidos: es el orden en que la app los ofrece y el que describe la
            # actuación de este expediente.
            informe[0] = str((datos["medidas"][0] or {}).get("nombre") or "")
        avisos.extend(av_inf)

        nuevos = {
            G.ADMINISTRATIVOS: G.construir_administrativos(
                datos, L.leer(base, G.ADMINISTRATIVOS)),
            G.GENERALES: G.construir_generales(datos, L.leer(base, G.GENERALES)),
            G.ENVOLVENTE: envolvente_,
            G.INSTALACIONES: instalaciones,
            G.INFORME: informe,
        }
        # Los PRECIOS de la energía se escriben haya medidas o no: sin ellos, el
        # análisis económico de CE3X sale vacío y hay que teclear diez casillas
        # a mano — también cuando la medida se define allí.
        nuevos[G.RESUMEN_MEDIDAS] = G.construir_resumen_medidas(
            filas, L.leer(base, G.RESUMEN_MEDIDAS))
        if grupos:
            nuevos[G.MEDIDAS] = grupos
        # Los escritores producen la forma de la 2.3 (medida sobre 1.600 .cex
        # reales); para la 3.1 se le añade lo que esa version pide —datos
        # generales y administrativos nuevos, la potencia de cada equipo—. Las
        # medidas, su orden de ejecucion y su justificacion (Anexo III, 3).
        if version == "3.1":
            # Las de la instalacion del edificio Y las de los equipos que solo
            # estan en una medida (la aerotermia que se propone): la 3.1 pide la
            # potencia tambien dentro de cada medida.
            pot = VC.potencias_de_equipos(
                list(datos.get("instalaciones") or [])
                + [eq for m in (datos.get("medidas") or []) for eq in (m.get("instalaciones") or [])])
            avisos.extend(VC.elevar(nuevos, VC.extra_31(datos), pot))
        salida.write_bytes(G.montar(PLANTILLA, nuevos, tipo, version))

        # Releer SIEMPRE antes de devolver. Un .cex que no se relee igual que se
        # escribio es un .cex que CE3X puede abrir a medias, y eso no se ve.
        problemas = G.comprobar(salida, nuevos, tipo, version)
        if problemas:
            raise HTTPException(500, "el .cex no se relee igual que se escribió: "
                                     + " | ".join(problemas))

        avisos.extend(G.AVISOS_IMAGEN)
        util = G._numf(datos["generales"]["superficie_util_habitable"]["valor"])
        # Las bandas de contraste son de 327 UNIFAMILIARES reales: contra un
        # hotel o una iglesia no dicen nada, y un aviso que sale siempre sin
        # motivo es el que enseña a no leer los demás.
        fuera = [] if G.TER.es_terciario(tipo) else G.contrastar(envolvente_, util)

        return Response(
            content=salida.read_bytes(),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": 'attachment; filename="expediente.cex"',
                # Los avisos no caben en el cuerpo (es binario) y son justo lo
                # que hay que enseñar. Van en cabeceras, en JSON.
                #
                # ⚠ El escapado a ASCII (el `ensure_ascii` por defecto) NO es un
                # detalle: una cabecera HTTP se codifica en LATIN-1, y basta una
                # raya larga o unas comillas tipográficas —que en castellano
                # salen solas— para que la respuesta entera reviente con el
                # `.cex` YA ESCRITO. Se perdía un fichero hecho, por un guion.
                # Escapado, el JSON sigue siendo válido y el navegador recupera
                # el texto al parsearlo.
                "X-Cee-Avisos": json.dumps(avisos),
                "X-Cee-Contraste": json.dumps(fuera),
                "X-Cee-Version": version,
            })
    except G.GeneracionError as exc:
        # 422 y no 500: el fichero no se ha escrito A PROPOSITO porque los datos
        # no daban para escribirlo bien. Es una respuesta, no una caída.
        raise HTTPException(422, str(exc))
    except HTTPException:
        raise
    except Exception as exc:                      # noqa: BLE001
        log.exception("fallo generando el .cex")
        raise HTTPException(500, str(exc))
    finally:
        shutil.rmtree(trabajo, ignore_errors=True)


# --------------------------------------------------------------------------
# Leer un .cex que sube alguien
# --------------------------------------------------------------------------

@app.post("/leer-cex")
async def leer_cex(fichero: UploadFile = File(...)) -> dict:
    """Qué hay dentro de un `.cex`, SIN deserializarlo.

    Este fichero viene de fuera. `pickle.load()` sobre él ejecutaría el código
    que traiga dentro, así que no se hace nunca: se recorren los opcodes y se
    reconstruyen los datos a mano.
    """
    crudo = await fichero.read()
    trabajo = Path(tempfile.mkdtemp(prefix="leer-", dir=_trabajo()))
    try:
        ruta = trabajo / "subido.cex"
        ruta.write_bytes(crudo)
        cex = L.trocear(ruta)
        return {
            "version": cex.version,
            "version_conocida": cex.version_conocida,
            "pickles": len(cex.pickles),
            "administrativos": L.leer(cex, G.ADMINISTRATIVOS),
            "resumen_envolvente": _resumen_envolvente(cex),
            "errores": [f"pickle {p.indice}: {p.error}"
                        for p in cex.pickles if p.error],
        }
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(400, f"no parece un .cex legible: {exc}")
    finally:
        shutil.rmtree(trabajo, ignore_errors=True)


# --------------------------------------------------------------------------
# Cambiarle la INSTALACIÓN a un .cex que ya existe
# --------------------------------------------------------------------------

@app.post("/cex/instalaciones")
async def cex_instalaciones(fichero: UploadFile = File(...),
                            datos: str = Form(...)) -> Response:
    """Devuelve el MISMO `.cex` con otro generador, y nada más cambiado.

    Es como se hace el CEE final a mano: se abre el inicial, se quita la caldera,
    se pone la aerotermia y se guarda. La envolvente, las transmitancias, el
    técnico y las dos imágenes del Catastro ya son las buenas — levantarlo de
    cero sería volver a pedirlas y arriesgarse a que algo salga distinto.

    Solo se toca el pickle 4. Que los otros catorce quedan intactos no es una
    intención: lo comprueba `sustituir_pickle` releyendo el fichero antes de
    devolverlo, y si alguno hubiera cambiado, falla.
    """
    crudo = await fichero.read()
    try:
        ficha = json.loads(datos)
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(400, f"`datos` no es JSON: {exc}")

    G.AVISOS_IMAGEN.clear()
    try:
        base = L.trocear_bytes(crudo)
        if not base.version_conocida:
            raise HTTPException(422, f"versión de .cex no probada: {base.version!r}")
        # El FINAL es el inicial con otro generador, y el PROGRAMA de CE3X
        # (residencial / pequeño / gran terciario) viaja en su cabecera. Si el
        # expediente dice ahora otro tipo del que se usó para el inicial,
        # copiarlo daría un final escrito con el programa equivocado: se dice, y
        # se regenera el inicial. La VERSIÓN, en cambio, sí puede cambiar: un
        # inicial de la 2.3 da un final de la 3.1 (`convertir_cex`).
        tipo = G.TER.tipo_de(ficha)
        version_base, tipo_base = CX.version_y_programa(base)
        if tipo_base != tipo:
            raise HTTPException(
                422, f"El CEE inicial está hecho como «{base.version}» y el expediente "
                     f"dice ahora «{VC.texto(version_base, tipo)}». El final se hace "
                     f"COPIANDO el inicial: vuelve a generar primero el inicial con el "
                     f"tipo bueno.")
        version = VC.version_pedida(ficha)

        # Las zonas declaradas salen del fichero que entra, no de la ficha: si el
        # equipo dijera estar en una zona que ese .cex no tiene, CE3X lo abriría
        # y la instalación NO aparecería, sin decir nada.
        zonas = _zonas_declaradas(base)
        equipos = ficha.get("instalaciones", [])
        if not equipos:
            raise HTTPException(422, "no hay ningún equipo nuevo que escribir")
        # En la forma interna (la de la 2.3): lo que el técnico puso en la 3.1
        # —la potencia de cada equipo— se guarda en `meta` y se le devuelve.
        previas, meta = CX.instalaciones_internas(base)
        av_sup = G.heredar_del_base(equipos, previas)
        # En una HIBRIDACIÓN la caldera NO sale: se queda dando servicio junto a
        # la bomba con `100 - C_b` de la demanda. Lo declara la ficha, que es la
        # única que sabe cuánto; cuál es la caldera lo sabe el fichero.
        hib = ficha.get("hibridacion") or {}
        conservar = hib.get("pct_generador_previo")
        conservar = float(conservar) if conservar not in (None, "") else None
        slots, avisos = G.construir_instalaciones(
            {"instalaciones": equipos,
             "envolvente": {"espacio": (ficha.get("envolvente") or {}).get("espacio", "auto")}},
            previas, zonas,
            # El generador viejo SALE: es la actuación, no un añadido.
            retirar=G.slots_a_retirar(equipos),
            conservar=conservar)
        avisos = av_sup + avisos

        cambios = {G.INSTALACIONES: slots}

        # Las MEDIDAS DE MEJORA del final. Un certificado las lleva siempre, y en
        # el posterior a la obra la que queda por proponer ya no es la aerotermia
        # —está puesta— sino el autoconsumo. Se escriben sobre el `.cex` copiado
        # igual que el generador: cada medida es este mismo edificio con lo que
        # ella propone, partiendo de los slots que acaban de quedar escritos.
        grupos, filas = [], []
        espacio = (ficha.get("envolvente") or {}).get("espacio", "auto")
        for m in (ficha.get("medidas") or []):
            equipos_m = m.get("instalaciones") or []
            if not equipos_m:
                avisos.append(f"La medida «{m.get('nombre')}» no declara ningún equipo:"
                              " no se escribe.")
                continue
            avisos.extend(G.heredar_del_base(equipos_m, slots))
            inst_m, gens_m, av_i = G.instalaciones_de_medida(
                equipos_m, slots, zonas, espacio, version,
                existentes=G.generadores_de_base(meta.get("extra"), version))
            grupo, fila, av_g = G.construir_medida(m, L.leer(base, G.ENVOLVENTE),
                                                   inst_m, gens_m)
            avisos.extend(av_i + av_g)
            grupos.extend(grupo)
            if fila:
                filas.append(fila)
        resumen = G.construir_resumen_medidas(filas, L.leer(base, G.RESUMEN_MEDIDAS))
        if repr(resumen) != repr(L.leer(base, G.RESUMEN_MEDIDAS)):
            cambios[G.RESUMEN_MEDIDAS] = resumen
        if grupos:
            cambios[G.MEDIDAS] = grupos
            # El conjunto que se imprime en el informe: el del fichero copiado
            # describe la medida del INICIAL, que aquí ya no existe.
            informe = L.leer(base, G.INFORME)
            if VC.informe_valido(informe):
                informe = G._reemitible(informe)
                informe[0] = str((ficha["medidas"][0] or {}).get("nombre") or "")
                cambios[G.INFORME] = informe

        # La versión de destino (por defecto la 3.1): las potencias de los
        # equipos nuevos salen de la ficha; las de los que se quedan, del fichero.
        pot = VC.potencias_de_equipos(
            list(equipos) + [eq for m in (ficha.get("medidas") or [])
                             for eq in (m.get("instalaciones") or [])])
        avisos += CX.a_version(base, cambios, version, ficha, meta, pot)
        salida = E.sustituir_pickles(crudo, cambios)
    except HTTPException:
        raise
    except (G.GeneracionError, E.EdicionError) as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:                      # noqa: BLE001
        log.exception("cex/instalaciones")
        raise HTTPException(500, f"no se ha podido cambiar la instalación: {exc}")

    return Response(
        content=salida, media_type="application/octet-stream",
        headers={"X-Cee-Avisos": json.dumps(avisos + G.AVISOS_IMAGEN),
                 "X-Cee-Version": version})


@app.post("/cex/previsto")
async def cex_previsto(fichero: UploadFile = File(...),
                       datos: str = Form(...)) -> Response:
    """El CEE PREVISTO de un RES080, COPIANDO el inicial (`tools/previsto.py`).

    `datos` es la ficha de siempre más `previsto`:
      instalaciones: los equipos de la MEDIDA (aerotermia, aires...), los mismos
                     que lleva la medida del inicial; vacío = no cambian.
      previsto: {ventilacion, masa_particiones, huecos: [...], aislamiento: [...]}

    Los equipos se escriben con `instalaciones_de_medida`, la MISMA función que
    escribe la medida de mejora: el previsto y la medida no pueden declarar dos
    instalaciones distintas para la misma obra. Sin medidas dentro: el previsto
    ES la medida (se la pone luego el oráculo de CE3X al inicial).
    """
    import previsto as PV                         # noqa: E402

    crudo = await fichero.read()
    try:
        ficha = json.loads(datos)
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(400, f"`datos` no es JSON: {exc}")
    spec = ficha.get("previsto") or {}

    try:
        base = L.trocear_bytes(crudo)
        if not base.version_conocida:
            raise HTTPException(422, f"versión de .cex no probada: {base.version!r}")
        tipo = G.TER.tipo_de(ficha)
        version_base, tipo_base = CX.version_y_programa(base)
        if tipo_base != tipo:
            raise HTTPException(
                422, f"El CEE inicial está hecho como «{base.version}» y el expediente "
                     f"dice ahora «{VC.texto(version_base, tipo)}»: genera primero el "
                     f"inicial con el tipo bueno.")
        version = VC.version_pedida(ficha)
        avisos: list[str] = []
        cambios: dict[int, Any] = {}

        env, av, hechos = PV.aplicar_envolvente(L.leer(base, G.ENVOLVENTE), spec)
        avisos += av
        cambios[G.ENVOLVENTE] = env
        p2, av = PV.aplicar_generales(L.leer(base, G.GENERALES), spec)
        avisos += av
        cambios[G.GENERALES] = p2

        previas, meta = CX.instalaciones_internas(base)
        equipos = ficha.get("instalaciones") or []
        if equipos:
            zonas = _zonas_declaradas(base)
            espacio = (ficha.get("envolvente") or {}).get("espacio", "auto")
            avisos += G.heredar_del_base(equipos, previas)
            inst, gens, av = G.instalaciones_de_medida(
                equipos, previas, zonas, espacio, version,
                existentes=G.generadores_de_base(meta.get("extra"), version))
            avisos += av
            cambios[G.INSTALACIONES] = inst
            if version == "3.1" and gens:
                extra = list(meta.get("extra") or [[], []])
                meta = dict(meta, extra=[extra[0] if extra else [], gens])
        elif not hechos["huecos"] and not hechos["cerramientos"]:
            raise HTTPException(422, "El previsto no cambia nada: ni equipos, ni ventanas, "
                                     "ni aislamiento.")

        cambios.update(PV.sin_medidas(base))
        pot = VC.potencias_de_equipos(list(equipos))
        avisos += CX.a_version(base, cambios, version, ficha, meta, pot)
        salida = E.sustituir_pickles(crudo, cambios)
    except HTTPException:
        raise
    except (G.GeneracionError, E.EdicionError) as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:                      # noqa: BLE001
        log.exception("cex/previsto")
        raise HTTPException(500, f"no se ha podido escribir el previsto: {exc}")

    return Response(
        content=salida, media_type="application/octet-stream",
        headers={"X-Cee-Avisos": json.dumps(avisos),
                 "X-Cee-Previsto": json.dumps(hechos),
                 "X-Cee-Version": version})


# --------------------------------------------------------------------------
# REVISAR el .cex que entrega un certificador
# --------------------------------------------------------------------------

@app.post("/cex/radiografia")
async def cex_radiografia(fichero: UploadFile = File(...)) -> dict:
    """LOS HECHOS de un `.cex`: envolvente, equipos, medidas y si la medida
    está calculada sobre ESTE edificio. No juzga: eso lo hace el backend, que
    tiene el expediente delante (`services/cee/revisionCee.js`).

    Solo lee, y sin deserializar: el fichero viene de fuera.
    """
    crudo = await fichero.read()
    try:
        return RX.radiografia_bytes(crudo)
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(400, f"no parece un .cex legible: {exc}")


# --------------------------------------------------------------------------
# El CEE FINAL desde la MEDIDA DE MEJORA del inicial del técnico
# --------------------------------------------------------------------------

@app.post("/cex/final-desde-medida")
async def cex_final_desde_medida(fichero: UploadFile = File(...),
                                 datos: str = Form("{}")) -> Response:
    """El `.cex` del CEE FINAL: el inicial del técnico con su «edificio mejorado».

    La instalación del final son los equipos de la medida de mejora del inicial,
    tal cual; la medida del final es retirar el generador que se quedó en apoyo
    (hibridación) y/o las que mande la app. Solo se tocan los pickles 4, 5, 6 y
    11 (ver `tools/cee_final.py`).

    Con `solo_analizar` devuelve JSON —qué medida del inicial se usa, qué
    equipos lleva el final, qué debe dar al calificarlo y qué medida se le
    propone— sin escribir nada. Sin él, el fichero.
    """
    crudo = await fichero.read()
    try:
        ficha = json.loads(datos or "{}")
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(400, f"`datos` no es JSON: {exc}")
    try:
        salida, analisis, avisos = CF.componer(crudo, ficha)
    except CF.FinalNoEscrito as exc:
        raise HTTPException(422, str(exc))
    except (G.GeneracionError, E.EdicionError) as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:                      # noqa: BLE001
        log.exception("cex/final-desde-medida")
        raise HTTPException(500, f"no se ha podido montar el CEE final: {exc}")
    if salida is None:
        return JSONResponse({"analisis": analisis, "avisos": avisos})
    return Response(
        content=salida, media_type="application/octet-stream",
        headers={"X-Cee-Avisos": json.dumps(avisos)})


class MedidaNoEscrita(Exception):
    """El fichero o la ficha no dan para poner la medida: es una respuesta."""


def poner_medida(crudo: bytes, ficha: dict) -> tuple[bytes, list[str]]:
    """La lógica de `/cex/medida`, sin HTTP (se prueba sin levantar el servidor)."""
    base = L.trocear_bytes(crudo)
    if not base.version_conocida:
        raise MedidaNoEscrita(f"versión de .cex no probada: {base.version!r}")
    medidas = ficha.get("medidas") or []
    if not medidas:
        raise MedidaNoEscrita("el expediente no propone ninguna medida de mejora")
    zonas = _zonas_declaradas(base)
    # La medida se compone en la forma interna (la de la 2.3), sea cual sea la
    # versión del fichero: la 3.1 abre y calcula así las medidas (sus propios
    # ejemplos oficiales las traen así). El fichero NO cambia de versión.
    previas, meta = CX.instalaciones_internas(base)
    envolvente_ = L.leer(base, G.ENVOLVENTE)
    espacio = (ficha.get("envolvente") or {}).get("espacio", "auto")

    avisos: list[str] = []
    grupos, filas = [], []
    for m in medidas:
        equipos_m = m.get("instalaciones") or []
        if not equipos_m:
            avisos.append(f"La medida «{m.get('nombre')}» no declara ningún equipo: no se escribe.")
            continue
        avisos.extend(G.heredar_del_base(equipos_m, previas))
        # La versión del fichero del técnico, que NO cambia: en uno de la 3.1 el
        # autoconsumo va como «Generación renovable eléctrica».
        version_base = VC.version_de(base)
        inst_m, gens_m, av_i = G.instalaciones_de_medida(
            equipos_m, previas, zonas, espacio, version_base,
            existentes=G.generadores_de_base(meta.get("extra"), version_base))
        grupo, fila, av_g = G.construir_medida(m, envolvente_, inst_m, gens_m)
        avisos.extend(av_i + av_g)
        grupos.extend(grupo)
        if fila:
            filas.append(fila)
    if not grupos:
        raise MedidaNoEscrita("ninguna medida se ha podido escribir: " + " · ".join(avisos))
    # En un fichero de la 3.1 los equipos de la medida llevan la POTENCIA de cada
    # servicio, o el diálogo de la medida sale en blanco y CE3X no escribe el
    # XML: la del equipo nuevo, de la ficha; la de los que se quedan, la que ya
    # les puso el técnico (`meta`), o por defecto y dicho.
    if VC.version_de(base) == "3.1":
        avisos.extend(VC.medidas_equipos_a_31(
            grupos, VC.potencias_de_equipos([eq for m in medidas for eq in (m.get("instalaciones") or [])]),
            meta))

    #: Lo del certificador que NO se llama como lo nuestro, se queda.
    nuestros = {str(g.estado[G.Cadena("nombre")]) for g in grupos}
    suyos_g = [g for g in (L.leer(base, G.MEDIDAS) or [])
               if str((getattr(g, "estado", {}) or {}).get("nombre")) not in nuestros]
    res_base = L.leer(base, G.RESUMEN_MEDIDAS)
    suyas_f = [f for f in (res_base[2] if isinstance(res_base, list) and len(res_base) > 2
                           and isinstance(res_base[2], list) else [])
               if not (isinstance(f, list) and len(f) > 1 and str(f[1]) in nuestros)]
    if suyos_g:
        avisos.append("Se conservan las medidas que ya traía el fichero: "
                      + ", ".join(str(g.estado.get("nombre")) for g in suyos_g) + ".")

    cambios = {
        G.MEDIDAS: grupos + [G._reemitible(g) for g in suyos_g],
        G.RESUMEN_MEDIDAS: G.construir_resumen_medidas(filas + suyas_f, res_base),
    }
    informe = L.leer(base, G.INFORME)
    if VC.informe_valido(informe):
        informe = G._reemitible(informe)
        informe[0] = str((medidas[0] or {}).get("nombre") or "")
        cambios[G.INFORME] = informe
    return E.sustituir_pickles(crudo, cambios), avisos


@app.post("/cex/medida")
async def cex_medida(fichero: UploadFile = File(...),
                     datos: str = Form(...)) -> Response:
    """Devuelve el MISMO `.cex` con la medida de mejora del expediente puesta.

    Es lo que se hacía a mano al revisar un CEE inicial: cargarle como medida
    de mejora lo que va a ser el certificado final. Se compone con los MISMOS
    escritores que la medida del `.cex` que genera la app (`/cex`): la
    aerotermia retira la caldera, en una hibridación la caldera se queda con su
    parte, y lo que ya dice el fichero —el depósito, la superficie servida—
    manda sobre lo derivado.

    REGLA — solo se tocan las MEDIDAS (pickles 5 y 6) y la casilla del conjunto
    del informe. La envolvente, la instalación y los datos del certificador
    quedan byte a byte (lo comprueba `sustituir_pickles`).

    REGLA — no se pisa lo del certificador: una medida suya con OTRO nombre se
    conserva; la que se llame igual que la nuestra se sustituye.

    ⚠️ La medida sale SIN CALCULAR: el ahorro y la calificación los calcula el
    motor de CE3X al pulsar «Actualizar», y ese motor no está aquí.
    """
    crudo = await fichero.read()
    try:
        ficha = json.loads(datos)
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(400, f"`datos` no es JSON: {exc}")
    try:
        salida, avisos = poner_medida(crudo, ficha)
    except MedidaNoEscrita as exc:
        raise HTTPException(422, str(exc))
    except (G.GeneracionError, E.EdicionError) as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:                      # noqa: BLE001
        log.exception("cex/medida")
        raise HTTPException(500, f"no se ha podido poner la medida: {exc}")

    return Response(
        content=salida, media_type="application/octet-stream",
        headers={"X-Cee-Avisos": json.dumps(avisos)})


def convertir(crudo: bytes, ficha: dict) -> tuple[bytes, list[str], str]:
    """La lógica de `/cex/convertir`, sin HTTP: es la de `convertir_cex.py`, que
    también la usa la línea de órdenes (una sola conversión)."""
    return CX.convertir_bytes(crudo, ficha)


@app.post("/cex/convertir")
async def cex_convertir(fichero: UploadFile = File(...),
                        datos: str = Form("{}")) -> Response:
    """Devuelve el MISMO `.cex` en la otra versión de CE3X (por defecto, a la 3.1).

    Es lo que hace la 3.1 al abrir un fichero de la 2.3, pero sin los huecos que
    deja ella: rellena lo que pide para calificar y para escribir el XML del
    certificado (superficie útil, nº de viviendas, plantas, uso, grado de
    protección, la potencia de cada equipo y la de las placas) y lo DICE.

    REGLA — solo cambian la cabecera y los pickles 1, 2, 4 y 11. La envolvente,
    las medidas y las imágenes quedan byte a byte (lo comprueba
    `sustituir_pickles`). Nada de lo que cambia mueve el cálculo (medido con el
    motor de la 3.1).

    `datos` (opcional): `version_ce3x` de destino, `ce3x31` con lo que el
    expediente sepa (uso, nº de viviendas…) y `instalaciones` con la potencia
    de los equipos por su nombre.
    """
    crudo = await fichero.read()
    try:
        ficha = json.loads(datos or "{}")
    except Exception as exc:                      # noqa: BLE001
        raise HTTPException(400, f"`datos` no es JSON: {exc}")
    try:
        salida, avisos, destino = convertir(crudo, ficha)
    except (G.GeneracionError, E.EdicionError) as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:                      # noqa: BLE001
        log.exception("cex/convertir")
        raise HTTPException(500, f"no se ha podido convertir el .cex: {exc}")
    return Response(
        content=salida, media_type="application/octet-stream",
        headers={"X-Cee-Avisos": json.dumps(avisos), "X-Cee-Version": destino})


def _zonas_declaradas(cex: Any) -> set[str]:
    """Los nombres de zona que el .cex YA tiene.

    Es el mismo campo traicionero de siempre: si el equipo dijera estar en una
    zona que no existe, CE3X abre el fichero y la instalación no aparece, sin
    decir nada. Aquí las zonas no se derivan de la geometría —no la tenemos— se
    leen del propio fichero, que es la única verdad que hay.
    """
    zonas = {"Edificio Objeto"}
    try:
        for z in L.leer(cex, G.ENVOLVENTE)[3]:
            nombre = getattr(z, "estado", {}).get("nombre")
            if nombre:
                zonas.add(str(nombre))
    except Exception:                             # noqa: BLE001
        pass
    return zonas


def _resumen_envolvente(cex: Any) -> dict:
    try:
        env = L.leer(cex, G.ENVOLVENTE)
        return {"cerramientos": len(env[0]), "huecos": len(env[1]),
                "puentes_termicos": len(env[2]), "zonas": len(env[3])}
    except Exception:                             # noqa: BLE001
        return {}


def _trabajo() -> Path:
    TRABAJO.mkdir(parents=True, exist_ok=True)
    return TRABAJO
