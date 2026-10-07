<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «PRESENTAR el CEE en el Registro — el borrador (2026-09-15)»; la introducción y el resto, en esta misma carpeta.

### La calificación de EMISIONES no se guardaba

El apartado 06 pide las DOS letras del certificado y `parseCeeXml` solo leía la del
consumo de energía primaria (`epnrLetra`). Ahora lee también `emisionesLetra`
(`<Calificacion><EmisionesCO2><Global>`), con el mismo cuidado que aquella: **ese nombre
aparece también FUERA de `<Calificacion>`**, donde `<Global>462.85</Global>` son
kgCO2/año, así que se acota por el padre y se exige que el texto sea una letra A-G.

⚠️ Los certificados subidos ANTES de hoy no la tienen en su objeto parseado, pero su
`.xml` crudo sigue en `cee.xml_*`. `borradorCeeService` la relee de ahí con
**`leerCalificacionesDeTexto`**, un lector SIN DOM: `DOMParser` es del navegador y **en
Node no existe**, así que `parseEpnrFromXml` allí devuelve vacío en silencio (su
try/catch se lo come) y el apartado 06 habría salido en blanco en todos los expedientes
sin que nada lo delatara. Comprobado sobre el `.xml` real de 26RES060_186: las dos vías
dan lo mismo.

**Verificado campo a campo contra el acuse REAL** de 26RES060_186
(`plantillas/BORRADOR PRESENTAR CEE.pdf`): NIF, nombre, sexo, vía troceada, provincia,
población, CP, teléfono, e-mail, uso del edificio, referencia catastral, las dos fechas y
las dos calificaciones coinciden con lo que el técnico tecleó en la sede.
