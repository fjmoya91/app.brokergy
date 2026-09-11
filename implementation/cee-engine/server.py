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
import shutil
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "tools"))

from src import pipeline                              # noqa: E402
from src.catastro import refcat as refcat_mod         # noqa: E402
from src.catastro.client import CatastroError         # noqa: E402
from src.ce3x import export                           # noqa: E402
from src.model import Modelo                          # noqa: E402

import generar_cex as G                               # noqa: E402
import leer_cex as L                                  # noqa: E402

logging.basicConfig(level=logging.INFO,
                    format="%(levelname)-7s %(name)s | %(message)s")
log = logging.getLogger("cee-engine")

app = FastAPI(title="cee-engine", version="1.0.0")

#: La plantilla es un ACTIVO del servicio: sin ella no se genera nada. Es un
#: `.cex` en blanco guardado por el propio CE3X, y de ahí se copian byte a byte
#: los 11 pickles que no sabemos escribir (entre ellos un HMAC con clave
#: desconocida). Ver docs/11 del proyecto CEE.
PLANTILLA = RAIZ / "assets" / "plantilla-virgen.cex"

#: Dónde se deja el trabajo de cada petición. El contenedor es efímero: esto no
#: es almacenamiento, es un sitio donde el pipeline pueda escribir sus ficheros.
TRABAJO = Path(tempfile.gettempdir()) / "cee-engine"


# --------------------------------------------------------------------------
# Salud
# --------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    """Lo que comprueba el deploy. Si falta la plantilla, este servicio NO
    puede hacer su trabajo y más vale decirlo aquí que al generar."""
    return {
        "ok": PLANTILLA.is_file(),
        "servicio": "cee-engine",
        "plantilla": PLANTILLA.name if PLANTILLA.is_file() else None,
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
    cache = TRABAJO / "cache"                 # se reaprovecha entre peticiones
    try:
        o = pipeline.Opciones(
            refcat=rc.parcela,
            output=trabajo / "salida",
            data=trabajo / "datos",
            cache=cache,
            floor_height=float(payload.get("altura_planta") or 2.70),
            floor_height_dada=payload.get("altura_planta") is not None,
            skip_lidar=bool(payload.get("skip_lidar", True)),
            offline=bool(payload.get("offline", False)),
            refresh=bool(payload.get("refresh", False)),
        )
        modelo = Modelo(refcat_parcela=rc.parcela, refcat_inmueble=rc.inmueble,
                        crs=o.crs_metrico)
        feats = pipeline.descargar(o, rc, modelo)
        pipeline.construir_modelo(o, rc, feats, modelo)
        res = pipeline.analizar(o, modelo)
        pipeline.escribir_salidas(o, res, rc)

        geometria = json.loads(
            (o.output / "ce3x_geometry.json").read_text(encoding="utf-8"))
        plan = _plan_de_fotos(o.output)

        return JSONResponse({
            "referencia_catastral": rc.to_dict(),
            "geometria": geometria,
            "plan_fotos": plan,
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
    if not PLANTILLA.is_file():
        raise HTTPException(500, f"falta la plantilla {PLANTILLA.name}: sin ella "
                                 f"no se puede escribir un .cex")

    trabajo = Path(tempfile.mkdtemp(prefix="cex-", dir=_trabajo()))
    salida = trabajo / "expediente.cex"
    try:
        envolvente_, avisos = G.construir_envolvente(geometria, datos)
        zonas = {str(z.estado[G.Cadena("nombre")]) for z in envolvente_[3]}
        base = L.trocear(PLANTILLA)
        instalaciones, av_ins = G.construir_instalaciones(
            datos, L.leer(base, G.INSTALACIONES), zonas)
        avisos.extend(av_ins)

        nuevos = {
            G.ADMINISTRATIVOS: G.construir_administrativos(
                datos, L.leer(base, G.ADMINISTRATIVOS)),
            G.GENERALES: G.construir_generales(datos, L.leer(base, G.GENERALES)),
            G.ENVOLVENTE: envolvente_,
            G.INSTALACIONES: instalaciones,
        }
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
                "X-Cee-Avisos": json.dumps(avisos, ensure_ascii=False),
                "X-Cee-Contraste": json.dumps(fuera, ensure_ascii=False),
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
