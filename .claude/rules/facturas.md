---
paths:
  - "implementation/backend/services/{facturaOcrService,facturaIncidencias,facturaAutoOcr,facturasCombineService,certificadorFacturacion,estudioPrecios}.js"
  - "implementation/frontend/src/features/facturacion/components/EstudioPrecios.jsx"
  - "implementation/backend/routes/facturaOcr.js"
  - "implementation/backend/utils/{agruparFacturas,facturasCae}.js"
  - "implementation/frontend/src/features/expedientes/logic/facturasCae.js"
  - "implementation/frontend/src/features/admin/**/*{Facturacion,facturaCertificador}*"
  - "implementation/frontend/src/features/expedientes/components/DocumentacionModule.jsx"
---
# Facturas — OCR e incidencias de las facturas de obra, PDF único, facturación del certificador (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/facturas/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

189. **Una factura de obra se registra ENTERA y al CAE solo cuenta lo SUBVENCIONABLE** (2026-11-03, Fran: requerimientos por facturas con aerotermia + placas). `importe_sin_iva` es la base del papel; la inversión que va al Anexo del MITECO, a la solicitud de verificación, al lote, al CE3X/previsto RES080 y a la sobrefinanciación es `importeCae` / `inversionCae` de [logic/facturasCae.js](implementation/frontend/src/features/expedientes/logic/facturasCae.js) (espejo CJS [utils/facturasCae.js](implementation/backend/utils/facturasCae.js)): la base menos las partidas del `desglose` con `computa: false`, o 0 si `computa_cae: false`. El OCR agrupa por partida y deja FUERA lo que la ficha no contempla (`desgloseFactura`: la fotovoltaica de un RES060), salvo los emisores de una sustitución (eso es `UNIDADES_TERMINALES`); en el modal se pulsa cada partida para sacarla o meterla, se añade a mano una «parte no subvencionable» o se deja la factura entera fuera. Una factura que no computa no va al PDF único ni fija las fechas del CIFO; una mixta sí. Nunca se suma `importe_sin_iva` a mano para la inversión del CAE. Lo que no computa SIGUE contando para el ESTUDIO DE PRECIOS (Facturación › «Precios de obra», solo ADMIN, [estudioPrecios.js](implementation/backend/services/estudioPrecios.js)): €/kWp de las placas por instalador y fecha, solo con las que traen kWp (leídos por el OCR o tecleados en «Potencia de las placas»), y una factura sin desglose solo si su única partida es esa. Tras tocarlo: `node implementation/backend/scripts/test_facturas_cae.mjs` y `test_facturas_incidencias.js`. Ver "Lo que computa para el CAE".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/facturas/facturacion-del-certificador-conciliacion-mensual.md` — Facturación del certificador — conciliación mensual (2026-08-03) · 8,5 KB
- `docs/conocimiento/facturas/facturas-de-la-obra-ocr-y-filtro-previo-de-incidencias.md` — Facturas de la obra — OCR y filtro previo de incidencias (2026-08-03) · 14,0 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/facturas/facturacion-del-certificador-conciliacion-mensual.md`
  - **REGLA**
  - **REGLA — parsear por la COLA de la línea, no por columnas.**
  - **REGLA — se trabaja sobre LÍNEAS VISUALES, nunca sobre los fragmentos sueltos de pdf.js.**
  - **REGLA — si la línea cita el nº de expediente, manda ése.**
  - **REGLA — el emparejamiento por dirección exige el número de portal**
  - **REGLA — verificar que la factura es DEL certificador cuya ficha está abierta.**
  - **REGLA — el sello va a la tabla de la que sea la fila.**
  - **REGLA — un CEE directo de alcance ÚNICO devenga UNA sola tasa.**
  - **REGLA — el `origen` viaja hasta el enlace.**
  - **REGLA — "consta REGISTRADO pero sin fecha" no es "no lo tiene".**
  - **REGLA — los avisos se agrupan por texto.**
- `docs/conocimiento/facturas/facturas-de-la-obra-ocr-y-filtro-previo-de-incidencias.md`
  - **REGLA — la IA solo LEE; el juicio es de las reglas.**
  - **REGLA — el CAE SOLO puede superar la inversión; con OTRA subvención, no (usuario, 19/10/2026).**
  - **REGLA — el combinado se construye desde `documentacion.facturas[]`, NUNCA listando la carpeta.**
  - **REGLA — `importe_sin_iva` sigue siendo la BASE de la factura; la inversión del CAE es
`importeCae(f)`.**
  - **REGLA — lo que la ficha no contempla nace FUERA, y se puede volver a meter.**
  - **REGLA — se estudia la partida, computara o no para el CAE.**
  - **REGLA — una factura SIN desglose solo cuenta si el OCR la dejó en UNA partida**
  - **REGLA — el €/kWp solo con las que traen kWp**
  - **REGLA — el instalador es el EMISOR de la factura**

<!-- generado:fin -->
