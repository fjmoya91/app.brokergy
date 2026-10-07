---
paths:
  - "implementation/backend/services/{facturaOcrService,facturaIncidencias,facturaAutoOcr,facturasCombineService,certificadorFacturacion}.js"
  - "implementation/backend/routes/facturaOcr.js"
  - "implementation/backend/utils/agruparFacturas.js"
  - "implementation/frontend/src/features/admin/**/*{Facturacion,facturaCertificador}*"
  - "implementation/frontend/src/features/expedientes/components/DocumentacionModule.jsx"
---
# Facturas — OCR e incidencias de las facturas de obra, PDF único, facturación del certificador (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/facturas/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

_Esta área no tiene reglas numeradas: mandan las «REGLA —» de sus documentos, abajo._

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/facturas/facturacion-del-certificador-conciliacion-mensual.md` — Facturación del certificador — conciliación mensual (2026-08-03) · 8,5 KB
- `docs/conocimiento/facturas/facturas-de-la-obra-ocr-y-filtro-previo-de-incidencias.md` — Facturas de la obra — OCR y filtro previo de incidencias (2026-08-03) · 7,3 KB

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
  - **REGLA — el combinado se construye desde `documentacion.facturas[]`, NUNCA listando la carpeta.**

<!-- generado:fin -->
