# RITE Generator — Generación automática de documentación RITE

Genera, a partir del **número de expediente** y los datos en **Supabase**, los dos
entregables del trámite de legalización térmica en Castilla-La Mancha:

1. **Memoria Técnica RITE** (`.docx`) — modelo RD 1027/2007, plantilla JCCM.
2. **Guía de alta JE6** (`.pdf`) — chuleta "copiar y pegar" para la plataforma `www.jccm.es → JE6`.

Sustituye al proceso manual por chat: aquí es **código determinista**, sin IA en el bucle.

---

## Estructura

```
rite-generator/
├── generar_documentacion_rite.py   # ▶ ENTRY POINT (orquestador, modo CLI)
├── server.py                       # ▶ API FastAPI (despliegue)
├── Dockerfile  ·  railway.toml  ·  Procfile   # despliegue
├── requirements.txt
├── .env.example                    # DATABASE_URL, GOOGLE_SA_JSON
├── lib/
│   ├── supabase_client.py          # Extrae expediente de Supabase y normaliza
│   ├── mapeo.py                    # Datos → posiciones de campo de la plantilla
│   ├── generar_memoria.py          # Rellena el .docx (autónomo, solo zipfile+re)
│   ├── generar_guia_je6.py         # Genera el PDF guiaburros (reportlab)
│   ├── cargas_termicas.py          # Estimación de cargas por estancia (OPCIÓN B)
│   └── drive_uploader.py           # Sube a Drive "7. LEGALIZACION RITE"
├── assets/
│   └── plantilla_rite_jccm.docx    # Plantilla base (NO modificar)
├── mapping/
│   ├── mapeo_supabase.md           # Origen en BD de cada dato + posiciones
│   └── ejemplos_reales_aprendidos.md
├── examples/
│   └── expediente_26RES060_120_supabase.json   # Ejemplo real para tests
├── ejemplo_salida/                 # Los 2 documentos ya generados de muestra
└── docs/
    └── INTEGRACION.md              # Cómo integrarlo en app.brokergy
```

---

## Uso rápido

```bash
pip install -r requirements.txt

# A) Producción: lee de Supabase (requiere DATABASE_URL)
export DATABASE_URL="postgresql://postgres:...@db.okfeopwetlxdffrsbfqw.supabase.co:5432/postgres"
python generar_documentacion_rite.py --expediente 26RES060_120 --salida ./out

# B) Test sin conexión: usa un JSON ya extraído
python generar_documentacion_rite.py \
    --from-json examples/expediente_26RES060_120_supabase.json --salida ./out
```

Salida:
```
out/MEMORIA_RITE_26RES060_120.docx
out/GUIA_JE6_26RES060_120.pdf
```

---

## De dónde sale cada dato (resumen)

| Bloque | Tabla / campo Supabase |
|--------|------------------------|
| Titular | `clientes` (nombre_razon_social, apellidos, dni, tlf, dirección) |
| Ubicación | `expedientes.instalacion` (jsonb) + `oportunidades.ref_catastral` |
| Equipo calor/ACS | `instalacion->aerotermia_cal` / `aerotermia_acs` |
| Emisor | `instalacion->>tipo_emisor` |
| Demandas/superficie | `oportunidades.datos_calculo->inputs` |
| **Fecha de pruebas** | `documentacion.facturas[0].fecha_factura` |
| Instalador / firma | `prescriptores` (ver nota ⚠ abajo) |

⚠ **Notas importantes** (detalle completo en `mapping/mapeo_supabase.md`):
- El firmante sale de `prescriptores.nombre_responsable + apellidos_responsable`, **no** de `usuarios`.
- `prescriptores.numero_carnet_rite` guarda el **Nº de Empresa RITE** (reg. integrado industrial), no el carné personal.
- **Cargas térmicas por local NO están en BD** → se estiman (OPCIÓN B, `lib/cargas_termicas.py`). Revisar antes de firmar.

---

## Cómo funciona el relleno del .docx

La plantilla usa campos de formulario legacy (FORMTEXT / FORMCHECKBOX) con **nombres
duplicados** (`Texto33` ×3, `Casilla31` ×N). Por eso el relleno es **por POSICIÓN**
(índice de aparición del campo), no por nombre. El módulo `lib/mapeo.py` contiene el
diccionario posición→dato. La tabla de cargas son 9 campos por fila que empiezan en
cada aparición de `Texto147` (25 filas disponibles).

Para integrarlo en la app, ver `docs/INTEGRACION.md`.

---

## Despliegue como microservicio (API)

El kit incluye un servidor FastAPI (`server.py`) listo para desplegar.

### Endpoints
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Estado del servicio (y si tiene Supabase/Drive configurados) |
| POST | `/generar-rite/{numero}` | Genera memoria + guía JE6 del expediente |

Parámetros de `/generar-rite`: `?fecha_firma=YYYY-MM-DD` (opcional), `?subir_drive=true|false`.

Comportamiento:
- Lee el expediente de Supabase, genera los 2 documentos.
- Si hay `GOOGLE_SA_JSON`: los sube a la subcarpeta **"7. LEGALIZACION RITE"** del
  expediente en Drive y guarda el enlace en `documentacion.cert_rite_drive_link`.
- Si no: devuelve un **ZIP** descargable con ambos ficheros.

### Variables de entorno
| Variable | Obligatoria | Uso |
|----------|-------------|-----|
| `DATABASE_URL` | Sí | Conexión a Supabase (Postgres) |
| `GOOGLE_SA_JSON` | No | JSON de Service Account para subir a Drive |
| `PORT` | No | Puerto (por defecto 8080; lo inyecta Cloud Run/Railway) |

### Opción 1 — Railway (la más rápida)
1. Sube el repo a GitHub.
2. En Railway: *New Project → Deploy from GitHub repo* → selecciona la carpeta.
3. Detecta el `Dockerfile` automáticamente (o usa `railway.toml`).
4. Añade las variables `DATABASE_URL` y `GOOGLE_SA_JSON` en *Variables*.
5. Deploy. El healthcheck `/health` valida el arranque.

### Opción 2 — Google Cloud Run
```bash
# Desde la carpeta rite-generator/
gcloud run deploy rite-generator \
  --source . \
  --region europe-southwest1 \
  --allow-unauthenticated \
  --set-env-vars "DATABASE_URL=postgresql://..." \
  --set-env-vars "GOOGLE_SA_JSON=$(cat service-account.json | tr -d '\n')"
```
Escala a cero: pagas solo por uso.

### Local con Docker
```bash
docker build -t rite-generator .
docker run -p 8080:8080 --env-file .env rite-generator
# Probar:  curl -X POST http://localhost:8080/generar-rite/26RES060_120 -o RITE.zip
```

### Configurar el acceso a Drive (Service Account)
1. En Google Cloud, crea una **Service Account** y una clave JSON.
2. Activa la **Google Drive API** en el proyecto.
3. **Comparte** la carpeta raíz de expedientes en Drive (permiso *Editor*) con el
   email del service account (`...@...iam.gserviceaccount.com`).
4. Pega el JSON (en una línea) en la variable `GOOGLE_SA_JSON`.

### Llamada desde la app (React)
```tsx
async function generarRITE(numero: string) {
  const r = await fetch(`${RITE_SERVICE_URL}/generar-rite/${numero}`, { method: "POST" });
  if (r.headers.get("content-type")?.includes("application/json")) {
    const { archivos } = await r.json();   // subido a Drive
    return archivos;
  }
  return await r.blob();                    // ZIP descargable
}
```

