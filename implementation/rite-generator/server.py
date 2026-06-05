#!/usr/bin/env python3
"""
API del Generador de documentación RITE.

Endpoints:
  GET  /health                         -> estado del servicio
  POST /generar-rite/{numero}          -> genera memoria + guía JE6

Comportamiento de /generar-rite:
  - Lee el expediente de Supabase (DATABASE_URL).
  - Genera Memoria (.docx) y Guía JE6 (.pdf).
  - Si hay credenciales de Drive (GOOGLE_SA_JSON): los sube a la subcarpeta
    "7. LEGALIZACION RITE" del expediente y actualiza
    documentacion.cert_rite_drive_link en Supabase. Devuelve los enlaces.
  - Si NO hay Drive: devuelve los ficheros como descarga (ZIP).

Arranque local:
  uvicorn server:app --host 0.0.0.0 --port 8080
"""
import os
import io
import base64
import zipfile
import tempfile
import json

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.responses import JSONResponse, StreamingResponse

from lib import supabase_client as sc
from lib import drive_uploader
from generar_documentacion_rite import generar

app = FastAPI(title="RITE Generator", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok",
            "supabase": bool(os.environ.get("DATABASE_URL")),
            "drive": bool(os.environ.get("GOOGLE_SA_JSON"))}


_MIME_BY_EXT = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pdf": "application/pdf",
}


@app.post("/generar-rite-json")
def generar_rite_json(payload: dict = Body(...)):
    """Genera Memoria (.docx) + Guía JE6 (.pdf) a partir de datos YA extraídos
    por el backend de la app (no toca BD ni Drive: es un generador puro).

    Es el endpoint que usa app.brokergy: el backend Express lee el expediente,
    el cliente, la oportunidad y el prescriptor, los pasa aquí, y se encarga él
    mismo de subir los ficheros a Drive con su OAuth.

    Body: { exp: {...}, instalador: {...}|null, fecha_firma?: "YYYY-MM-DD" }
      - `exp` debe traer las mismas claves que devuelve sc.cargar_desde_supabase()
        (numero_expediente, instalacion, cee, documentacion, datos_calculo,
         ref_catastral, is_reforma, nombre_razon_social, apellidos, dni, tlf,
         cli_prov, cli_muni, cli_dir, cli_cp).
      - `instalador` con las claves de SQL_INSTALADOR (razon_social, cif,
        numero_carnet_rite, nombre_responsable, apellidos_responsable,
        nif_responsable, tecnico_firmante_dni, cargo, municipio).

    Devuelve: { expediente, files: [{ name, mimetype, base64 }, ...] }
    """
    exp = payload.get("exp")
    if not isinstance(exp, dict) or not exp.get("numero_expediente"):
        raise HTTPException(status_code=400,
                            detail="Body inválido: falta 'exp' con 'numero_expediente'")
    instalador = payload.get("instalador")
    fecha_firma = payload.get("fecha_firma")

    # 1) Normalizar (misma ruta que el modo --from-json, ya probado)
    try:
        raw = {"exp": exp, "instalador": instalador}
        datos = sc.normalizar(raw, fecha_firma)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Normalización: {e}")

    # 2) Generar los 2 documentos en un dir temporal
    workdir = tempfile.mkdtemp(prefix="rite_json_")
    try:
        docx, pdf = generar(datos, workdir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generación: {e}")

    # 3) Devolver los ficheros en base64 (el backend los sube a Drive)
    files = []
    for path in (docx, pdf):
        with open(path, "rb") as fh:
            content = fh.read()
        ext = os.path.splitext(path)[1].lower()
        files.append({
            "name": os.path.basename(path),
            "mimetype": _MIME_BY_EXT.get(ext, "application/octet-stream"),
            "base64": base64.b64encode(content).decode("ascii"),
        })
    return JSONResponse({"expediente": datos.get("expediente"), "files": files})


@app.post("/generar-rite/{numero_expediente}")
def generar_rite(numero_expediente: str,
                 fecha_firma: str | None = Query(None, description="YYYY-MM-DD"),
                 subir_drive: bool = Query(True)):
    # 1) Datos desde Supabase
    try:
        raw = sc.cargar_desde_supabase(numero_expediente)
        datos = sc.normalizar(raw, fecha_firma)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Expediente: {e}")

    # 2) Generar documentos en directorio temporal
    workdir = tempfile.mkdtemp(prefix=f"rite_{numero_expediente}_")
    try:
        docx, pdf = generar(datos, workdir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generación: {e}")

    # 3a) Subir a Drive (si está configurado y se solicita)
    if subir_drive and os.environ.get("GOOGLE_SA_JSON"):
        try:
            subidos = drive_uploader.subir(numero_expediente, [docx, pdf])
            link_pdf = next((f["link"] for f in subidos if f["name"].endswith(".pdf")), None)
            link_docx = next((f["link"] for f in subidos if f["name"].endswith(".docx")), None)
            _guardar_link_supabase(numero_expediente, link_docx or link_pdf)
            return JSONResponse({
                "expediente": numero_expediente,
                "subido_a_drive": True,
                "archivos": subidos,
            })
        except Exception as e:
            # Si falla Drive, no perdemos el trabajo: devolvemos el ZIP
            return _zip_response(numero_expediente, docx, pdf,
                                 aviso=f"Drive falló: {e}")

    # 3b) Sin Drive: devolver ZIP descargable
    return _zip_response(numero_expediente, docx, pdf)


def _zip_response(numero, docx, pdf, aviso=None):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(docx, os.path.basename(docx))
        z.write(pdf, os.path.basename(pdf))
        if aviso:
            z.writestr("AVISO.txt", aviso)
    buf.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="RITE_{numero}.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


def _guardar_link_supabase(numero_expediente, link):
    """Guarda el enlace de Drive en documentacion.cert_rite_drive_link."""
    if not link or not os.environ.get("DATABASE_URL"):
        return
    try:
        import psycopg
        sql = ("UPDATE expedientes "
               "SET documentacion = jsonb_set(coalesce(documentacion,'{}'::jsonb), "
               "'{cert_rite_drive_link}', %s::jsonb, true) "
               "WHERE numero_expediente = %s")
        with sc._conn() as c, c.cursor() as cur:
            cur.execute(sql, (json.dumps(link), numero_expediente))
            c.commit()
    except Exception:
        pass  # no bloquear la respuesta por esto
