#!/usr/bin/env python3
"""
Subida de la documentación generada a Google Drive, en la subcarpeta
"7. LEGALIZACION RITE" de la carpeta del expediente.

Autenticación por Service Account (recomendado para backend):
  - Variable de entorno GOOGLE_SA_JSON con el JSON de la cuenta de servicio.
  - La carpeta raíz de expedientes en Drive debe estar COMPARTIDA (editor) con
    el email del service account (xxx@xxx.iam.gserviceaccount.com).

Si no hay credenciales, las funciones lanzan RuntimeError y el server cae al
modo "devolver ficheros en la respuesta" (sin subir a Drive).
"""
import os
import json

CARPETA_RITE = "7. LEGALIZACION RITE"
_FOLDER_MIME = "application/vnd.google-apps.folder"


def _service():
    sa = os.environ.get("GOOGLE_SA_JSON")
    if not sa:
        raise RuntimeError("Falta GOOGLE_SA_JSON (credenciales de Service Account)")
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    info = json.loads(sa)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/drive"])
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _buscar(svc, query):
    res = svc.files().list(q=query, fields="files(id,name,parents)",
                           includeItemsFromAllDrives=True,
                           supportsAllDrives=True, pageSize=10).execute()
    return res.get("files", [])


def _carpeta_expediente(svc, numero_expediente):
    """Localiza la carpeta del expediente por nombre (contiene el número)."""
    q = (f"mimeType='{_FOLDER_MIME}' and name contains '{numero_expediente}' "
         f"and trashed=false")
    files = _buscar(svc, q)
    if not files:
        raise RuntimeError(f"No se encontró carpeta del expediente {numero_expediente} en Drive")
    return files[0]["id"]


def _subcarpeta_rite(svc, parent_id):
    """Devuelve el id de '7. LEGALIZACION RITE' dentro del expediente; la crea si falta."""
    q = (f"mimeType='{_FOLDER_MIME}' and name='{CARPETA_RITE}' "
         f"and '{parent_id}' in parents and trashed=false")
    files = _buscar(svc, q)
    if files:
        return files[0]["id"]
    meta = {"name": CARPETA_RITE, "mimeType": _FOLDER_MIME, "parents": [parent_id]}
    created = svc.files().create(body=meta, fields="id",
                                 supportsAllDrives=True).execute()
    return created["id"]


def subir(numero_expediente, ficheros: list) -> list:
    """Sube `ficheros` (lista de rutas locales) a la subcarpeta RITE del expediente.
    Devuelve lista de dicts {name, id, link}."""
    from googleapiclient.http import MediaFileUpload
    svc = _service()
    exp_id = _carpeta_expediente(svc, numero_expediente)
    rite_id = _subcarpeta_rite(svc, exp_id)

    out = []
    for path in ficheros:
        name = os.path.basename(path)
        media = MediaFileUpload(path, resumable=False)
        meta = {"name": name, "parents": [rite_id]}
        f = svc.files().create(body=meta, media_body=media,
                               fields="id,webViewLink",
                               supportsAllDrives=True).execute()
        out.append({"name": name, "id": f["id"], "link": f.get("webViewLink")})
    return out
