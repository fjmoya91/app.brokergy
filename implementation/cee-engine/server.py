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
from src.model import Modelo                          # noqa: E402
from src.viz import plano_svg                         # noqa: E402

import generar_cex as G                               # noqa: E402
import leer_cex as L                                  # noqa: E402
import editar_cex as E                                # noqa: E402

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
        # Que construcciones CUENTAN lo marco una persona al abrir la
        # oportunidad, y de ahi salio la superficie que se le presupuesto al
        # cliente. Se aplica ANTES de clasificar: de `habitable` cuelgan que
        # plantas se miden, la superficie del .cex y el plan de fotos.
        pipeline.aplicar_seleccion(modelo, payload.get("construcciones"))
        res = pipeline.analizar(o, modelo)
        pipeline.escribir_salidas(o, res, rc)

        geometria = json.loads(
            (o.output / "ce3x_geometry.json").read_text(encoding="utf-8"))
        plan = _plan_de_fotos(o.output)
        # El plano ya colocado. Se calcula AQUI, donde esta la geometria: el
        # navegador recibe puntos y no calcula ni un metro.
        dibujo = plano_svg.plantas(geometria)

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
        envolvente_, avisos = G.construir_envolvente(geometria, datos)
        zonas = {str(z.estado[G.Cadena("nombre")]) for z in envolvente_[3]}
        base = L.trocear(PLANTILLA)
        instalaciones, av_ins = G.construir_instalaciones(
            datos, L.leer(base, G.INSTALACIONES), zonas)
        avisos.extend(av_ins)

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
            inst_m, av_i = G.construir_instalaciones(
                {"instalaciones": equipos_m, "envolvente": {"espacio": espacio}},
                instalaciones, zonas, retirar=G.slots_a_retirar(equipos_m))
            grupo, fila, av_g = G.construir_medida(m, envolvente_, inst_m)
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
        salida.write_bytes(G.montar(PLANTILLA, nuevos))

        # Releer SIEMPRE antes de devolver. Un .cex que no se relee igual que se
        # escribio es un .cex que CE3X puede abrir a medias, y eso no se ve.
        problemas = G.comprobar(salida, nuevos)
        if problemas:
            raise HTTPException(500, "el .cex no se relee igual que se escribió: "
                                     + " | ".join(problemas))

        avisos.extend(G.AVISOS_IMAGEN)
        util = G._numf(datos["generales"]["superficie_util_habitable"]["valor"])
        fuera = G.contrastar(envolvente_, util)

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

        # Las zonas declaradas salen del fichero que entra, no de la ficha: si el
        # equipo dijera estar en una zona que ese .cex no tiene, CE3X lo abriría
        # y la instalación NO aparecería, sin decir nada.
        zonas = _zonas_declaradas(base)
        equipos = ficha.get("instalaciones", [])
        if not equipos:
            raise HTTPException(422, "no hay ningún equipo nuevo que escribir")
        previas = L.leer(base, G.INSTALACIONES)
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
            inst_m, av_i = G.construir_instalaciones(
                {"instalaciones": equipos_m, "envolvente": {"espacio": espacio}},
                slots, zonas, retirar=G.slots_a_retirar(equipos_m))
            grupo, fila, av_g = G.construir_medida(m, L.leer(base, G.ENVOLVENTE), inst_m)
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
            if isinstance(informe, list) and len(informe) == 7:
                informe = list(informe)
                informe[0] = str((ficha["medidas"][0] or {}).get("nombre") or "")
                cambios[G.INFORME] = informe

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
        headers={"X-Cee-Avisos": json.dumps(avisos + G.AVISOS_IMAGEN)})


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
