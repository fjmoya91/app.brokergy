# Integración en app.brokergy

Objetivo: que desde la ficha de un expediente, un botón **"Generar documentación RITE"**
produzca la memoria (.docx) y la guía JE6 (.pdf), los suba a la carpeta
**"7. LEGALIZACION RITE"** del expediente en Drive y guarde el link en
`expedientes.documentacion.cert_rite_drive_link`.

Hay dos rutas. Este kit Python ya funciona; elige según prefieras mantener un
servicio aparte o todo en el repo de Next.js.

---

## Ruta 1 (recomendada) — Microservicio Python

Reutiliza este kit tal cual. Mínimo esfuerzo, máxima fiabilidad.

1. Envolver el orquestador en una API con FastAPI:

```python
# server.py
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from lib import supabase_client as sc
from generar_documentacion_rite import generar

app = FastAPI()

@app.post("/generar-rite/{numero_expediente}")
def generar_rite(numero_expediente: str, fecha_firma: str | None = None):
    raw = sc.cargar_desde_supabase(numero_expediente)
    datos = sc.normalizar(raw, fecha_firma)
    docx, pdf = generar(datos, salida_dir=f"/tmp/{numero_expediente}")
    # TODO: subir docx y pdf a Drive (carpeta "7. LEGALIZACION RITE" del expediente)
    #       y devolver los enlaces; actualizar documentacion.cert_rite_drive_link
    return JSONResponse({"docx": docx, "pdf": pdf})
```

2. Desplegar en **Cloud Run** o **Railway** (escala a cero, coste ~0 € en reposo):
   - Variables de entorno: `DATABASE_URL`, credenciales de Drive.
   - `pip install -r requirements.txt fastapi uvicorn`.

3. Botón en la app (React):

```tsx
async function generarRITE(numeroExpediente: string) {
  const r = await fetch(`${RITE_SERVICE_URL}/generar-rite/${numeroExpediente}`, {
    method: "POST",
  });
  const { docx, pdf } = await r.json();
  // mostrar enlaces / refrescar la ficha
}
```

---

## Ruta 2 — API route en Next.js (todo en el repo)

Si prefieres no mantener un servicio aparte, porta la lógica a una API route.
La parte delicada es el relleno del .docx por posición; consérvala fiel a
`lib/mapeo.py` (posiciones) y `lib/generar_memoria.py` (edición XML).

- **PDF (Guía JE6):** trivial de portar con `pdf-lib` o `pdfkit`.
- **DOCX (Memoria):** dos opciones:
  - **2a.** Llamar al microservicio Python solo para el docx (híbrido).
  - **2b.** Reimplementar en JS: abrir el .docx como ZIP (`jszip`), editar
    `word/document.xml` aplicando los reemplazos por posición que define
    `lib/mapeo.py`, y reescribir el ZIP. La lógica de posiciones está documentada
    en `mapping/mapeo_supabase.md` (tabla de posiciones) y en `lib/mapeo.py`.

`lib/mapeo.py` es la **fuente de verdad** del mapeo posición→dato; cualquier
puerto a JS debe replicar ese diccionario y la detección de filas de la tabla
de cargas (inicio en cada `Texto147`, 9 columnas por fila).

---

## Subida a Drive (común a ambas rutas)

Localizar la carpeta del expediente y su subcarpeta "7. LEGALIZACION RITE"
(crearla si no existe), subir los dos ficheros y guardar el enlace:

```sql
UPDATE expedientes
SET documentacion = jsonb_set(documentacion, '{cert_rite_drive_link}', '"<url>"')
WHERE numero_expediente = %s;
```

---

## Pendientes / decisiones

- **Cargas térmicas (OPCIÓN B activa):** se estiman por superficie. Si en el futuro
  añades a la app un formulario de estancias que guarde `instalacion->cargas_termicas`
  (jsonb), basta con leerlo en `supabase_client.normalizar` en lugar de llamar a
  `estimar_cargas`, y la memoria pasa a ser 100% real.
- **Sexo del titular:** hoy se asume; si añades el campo a `clientes`, mapéalo en
  `normalizar()` para marcar Hombre/Mujer correctamente.
- **Potencia:** la fuente de verdad es siempre Supabase (`aerotermia_cal/acs.potencia`).
