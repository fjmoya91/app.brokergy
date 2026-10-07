<!-- conocimiento · área: expedientes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Carpetas de Drive por estado (2026-07-24)

La carpeta de Drive de cada expediente **refleja su estado**. La decisión está centralizada en
[driveFolders.js](implementation/backend/services/driveFolders.js) (mapas + funciones puras) y el
movimiento en [expedienteFolderSync.js](implementation/backend/services/expedienteFolderSync.js).
Nunca volver a poner un `FOLDER_MAP` suelto en una ruta.

| Situación | Carpeta |
|---|---|
| Oportunidad no enviada (`PTE ENVIAR`, `EN CURSO`, `LEAD`) | 01. OPORTUNIDADES |
| Oportunidad `ENVIADA` | 02. SIMULACION ENVIADA |
| Expediente creado, `PTE. CEE INICIAL` **sin certificador** | 03. ACEPTADO |
| Certificador asignado, o cualquier estado anterior a `DOC. COMPLETA` (incluidos `PENDIENTE REVISAR EXPTE` y `REQUERIMIENTO BROKERGY`) | 04. EN CURSO |
| `DOC. COMPLETA` | 05. DOC. COMPLETA |
| `DOC. COMPLETA APPSHEET` (migrados) | 13. DOC. COMPLETA APPSHEET |
| Lote `BORRADOR` / `SOLICITADO PRESUPUESTO` | 06. REVISADO LISTO PARA VERIFICAR |
| Lote `ENVIADO A VERIFICADOR` / `PTE. SUBIDA MITECO` | 07. ENVIADOS A VERIFICAR |
| Lote con `REQUERIMIENTO VERIFICADOR` / `G.A.` | 10. REQUERIMIENTO |
| Lote `CAE EMITIDO – PTE PAGO BROKERGY` → 08 · `PTE. PAGO BROKERGY A CLIENTE` → 09 · `FINALIZADO` → 11 | 08 / 09 / 11 |
| Oportunidad `RECHAZADA` | 12. RECHAZADOS |

**Reglas que no se rompen:**
- **El estado nunca hace retroceder la carpeta por asignar certificador**: si el expediente ya está
  en `DOC. COMPLETA` (típico de un migrado) y se le asigna un certificador, sigue en 05/13.
- **Un expediente LOTEADO no se mueve solo**: su carpeta vive DENTRO de la del lote y manda el
  **estado del LOTE**, que mueve la carpeta del lote entera con todo dentro. Al sacarlo del lote
  (quitarlo o borrar el lote) vuelve a la carpeta de su estado.
- El sincronizador se llama en `setImmediate` y **nunca** bloquea la respuesta; `moveFolder` no
  escribe si la carpeta ya está en el destino (idempotente).
- **Al mover también se endereza el NOMBRE** (`asegurarNombreCarpeta`, 2026-09-13): un expediente
  migrado (o uno al que se le cambió el cliente después) puede arrastrar un nombre de carpeta que
  no dice de quién es — medido en 25RES060_79, que seguía llamándose "... C. CHILE N. 1 (DIMAS)
  PEDRO MUÑOZ" en vez del nombre de su cliente. En cada `syncExpedienteFolder` se recalcula
  `{nº expediente} - {CLIENTE}` desde `clientes` (mismo patrón que `createExpediente` /
  `migrateExpedienteProgram`) y solo se renombra si difiere. Sin `cliente_id` vinculado no se toca
  nada — nunca se inventa un nombre.
- Recolocación masiva: `node scripts/recolocar_carpetas_drive.js` (dry-run) / `--execute`.
