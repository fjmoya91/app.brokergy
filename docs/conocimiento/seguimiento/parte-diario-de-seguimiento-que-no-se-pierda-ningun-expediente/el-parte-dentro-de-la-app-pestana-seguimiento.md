<!-- conocimiento · área: seguimiento · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)»; la introducción y el resto, en esta misma carpeta.

### El parte DENTRO de la app — pestaña "Seguimiento"

`features/seguimiento/views/SeguimientoView.jsx` + `components/EnvioLoteModal.jsx`,
sobre [routes/seguimiento.js](implementation/backend/routes/seguimiento.js)
(`staffOnly`). Es el gemelo INTERNO de `/api/acciones`: comparten servicios, no rutas.

**NO va dentro del cuadro de mando**, aunque fuera lo primero que se pensó:
- El cuadro de mando responde *"cómo va el negocio"* (GWh, margen, embudo); esto
  responde *"qué hago yo ahora"*. Dos modos mentales y dos frecuencias.
- El cuadro de mando es **ADMIN-only** porque agrega importes. El parte no lleva ni un
  euro, así que lo ve también el **TRABAJADOR** — que es quien más lo necesita.
- El cuadro de mando ya carga expedientes + oportunidades + partners + lotes.

Tiene **dos lecturas** de los mismos datos, y el orden importa: **DESPACHAR** (por
destinatario, por defecto — se entra a trabajar) y **REVISAR** (por bloque, el
diagnóstico).
