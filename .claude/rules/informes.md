---
paths:
  - "implementation/frontend/src/features/informes/**"
  - "implementation/backend/routes/{informes,informesPublic}.js"
  - "implementation/backend/services/{informeService,informeFolders}.js"
  - "implementation/backend/utils/informeEstados.js"
  - "implementation/backend/scripts/{informes_schema.sql,test_informes.js}"
---
# Informes técnicos — `{AAAA}INF_{n}`: memorias, legalizaciones, todo lo que no es CAE ni CEE (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/informes/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

196. **Un INFORME técnico (memoria para el Ayuntamiento, legalización, informe, consultoría: «todo lo que no sea CAE ni CEE», Fran 05/11/2026) va en su tabla `informes`, con número `{AAAA}INF_{n}` y carpeta de primer nivel `54. INFORMES TECNICOS`, y su circuito es oferta → aceptación → redacción → firma → factura → pago → entrega, 100 % digital.** Nace al aceptar un presupuesto con un artículo `genera: 'INFORME'` (o a mano, «+ Nuevo informe» en CEE directos). **El ESTADO se DERIVA de los sellos y lo escribe SOLO el servidor** (`derivar` en [utils/informeEstados.js](implementation/backend/utils/informeEstados.js) → `refrescarEstado`); los ficheros los coloca el servidor por su CLASE, nunca por una ruta del navegador; un FINAL nuevo deja el informe SIN firmar, y el firmado se valida con `leerFirmasPdf`. **La factura es la de Facturación**, enlazada por `informe_id` (regla 166). **El justificante NO cobra: avisa, y Fran confirma con un clic**; cobrar la última F1 en Facturación también lo cobra. **Se entrega SOLO lo firmado, a quien paga, una vez** (idempotencia primero, firma recomprobada al descargar); sola solo con `INFORME_ENTREGA_AUTO=true` (en local, apagado). El cliente tiene UNA página, `/informe/:token` (estilo «carta de pago», regla 164; `/informe/demo`), y descarga el firmado solo con el informe cobrado; con la BD caída, 503. **El RITE suelto es la segunda LÍNEA, `{AAAA}CIT_{n}`** (Fran, 05/11/2026): misma tabla con `linea = 'CIT'` y su propio correlativo, artículo `genera: 'CIT'`, carpeta `39. LEGALIZACIONES RITE / 2. PRODUCCION`; la memoria la firma el representante de la empresa instaladora (AutoFirma o subida, siempre por `leerFirmasPdf`), y firmada queda **PTE. PRESENTACIÓN** hasta que se sube el impreso sellado de eDICE (`CERTIFICADO_OFICIAL` → `registrado_at`); solo entonces se factura, y **se entrega SOLO ese certificado**. El RITE de una obra CAE sigue en su expediente. Tras tocarlo: `node implementation/backend/scripts/test_informes.js` y `node implementation/backend/scripts/auditar_rutas_sin_guardian.js`. Ver "INFORMES técnicos".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/informes/informes-tecnicos-el-tercer-trabajo.md` — INFORMES técnicos — `{AAAA}INF_{n}`: todo lo que no es CAE ni CEE (2026-11-05) · 12,9 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/informes/informes-tecnicos-el-tercer-trabajo.md`
  - **REGLA — un informe NO va en `expedientes` ni en `cee_directos`: tiene su tabla, `informes`, y su
número `{AAAA}INF_{n}`**
  - **REGLA — la carpeta raíz es de PRIMER NIVEL: `54. INFORMES TECNICOS`**
  - **REGLA — el ESTADO se DERIVA de los sellos y lo escribe SOLO el servidor**
  - **REGLA — subir un PDF FINAL nuevo deja SIN firmar el informe**
  - **REGLA — la factura es la de la pestaña Facturación, enlazada por `informe_id`.**
  - **REGLA — subir el justificante NO cobra: avisa, y Fran CONFIRMA con un clic**
  - **REGLA — se ENTREGA SOLO lo firmado, a quien PAGA, y una vez.**
  - **REGLA — el cliente tiene UNA página, `/informe/:token`, con el estilo «carta de pago» (regla 164)**
  - **REGLA — un CIT es un informe de la LÍNEA `CIT`: la MISMA tabla, el MISMO circuito y las MISMAS
pantallas, con su propio correlativo `{AAAA}CIT_{n}`.**
  - **REGLA — la carpeta de un CIT es `39. LEGALIZACIONES RITE / 2. PRODUCCION / {nº} - {CLIENTE}`**
  - **REGLA — un CIT firmado PASA por la presentación antes de facturar.**
  - **REGLA — de un CIT se entrega SOLO el certificado oficial, y solo cobrado.**

<!-- generado:fin -->
