<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «DESHACER en la envolvente, y quién puede leer la placa (2026-09-16)», en el CLAUDE.md antiguo.

### La PLACA la lee también el CERTIFICADOR

`placa-caldera/ocr` y `placas/ocr` iban `staffOnly`, y en la ventana de la
envolvente —que es SUYA (`internalOnly`)— el botón «Leer la placa» le devolvía un
403 sobre algo que sí veía. En el expediente el botón estaba directamente oculto
*porque* la ruta era staffOnly.

**REGLA — abrirlo no es abrirlo a TODOS los expedientes.** `suyoSiCertificador`
aplica el mismo criterio que ya usa el detalle (`cee.certificador_id ===
prescriptor_id`): la lectura cuesta una llamada de pago a Gemini y **escribe en la
instalación**, así que no puede hacerse sobre el expediente de otro. Se comprueba
en el guard y no dentro de cada handler, que son dos.
