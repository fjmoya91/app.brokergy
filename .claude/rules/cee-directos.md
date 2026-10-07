---
paths:
  - "implementation/frontend/src/features/cee-directo/**"
  - "implementation/backend/routes/ceeDirectos.js"
  - "implementation/backend/services/{ceeDirecto*,ceeOferta*,ceeFactura*,facturaSheetService}.js"
  - "implementation/backend/utils/ceeDirectoEstados.js"
  - "implementation/backend/scripts/*cee_directo*"
---
# CEE directos — el segundo negocio: alta, encargo, entrega, oferta y factura (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/cee-directos/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

_Esta área no tiene reglas numeradas: mandan las «REGLA —» de sus documentos, abajo._

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/00-cee-directos-el-segundo-negocio.md` — CEE directos — el segundo negocio (2026-08-24) · 1,3 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/alcance-unico-o-doble.md` — Alcance: ÚNICO o DOBLE · 0,8 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/asignar-y-reasignar-certificador.md` — Asignar y REASIGNAR certificador · 2,6 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/descuento-cuestionario-de-climatizacion-y-documentacion-del-cee.md` — Descuento, cuestionario de climatización y documentación del CEE (2026-09-23) · 2,3 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/drive.md` — Drive · 0,8 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-candado-de-cobro.md` — El candado de cobro · 0,6 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-cliente-es-el-de-siempre-y-desde-su-ficha-se-llega-al-cee.md` — El cliente es el de siempre, y desde su ficha se llega al CEE · 1,5 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-formulario-se-guarda-solo-y-eso-tiene-una-trampa.md` — El formulario se guarda solo, y eso tiene una trampa · 1,4 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-historico-importado.md` — El histórico importado · 1,1 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-tecnico-acusa-el-encargo-lo-cojo-no-puedo.md` — El técnico ACUSA el encargo: lo cojo / no puedo · 2,6 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/estados.md` — Estados · 0,7 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/fuentes-unicas.md` — Fuentes únicas · 1,0 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-direccion-se-elige-no-se-teclea.md` — La dirección se ELIGE, no se teclea · 1,3 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-direccion-se-trae-del-catastro-y-se-puede-corregir.md` — La dirección se trae del Catastro, y se puede corregir · 3,3 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-entrega-al-cliente-se-dispara-sola.md` — La entrega al cliente se dispara SOLA · 2,9 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-factura-se-emite-contra-el-libro-de-facturas-de-appsheet.md` — La FACTURA se emite contra el libro de facturas de AppSheet (2026-09-23) · 5,3 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-ficha-del-cee-es-una-linea-de-datos-no-un-formulario.md` — La ficha del CEE es UNA LÍNEA de datos, no un formulario · 2,0 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-oferta-el-paso-anterior-al-expediente.md` — La OFERTA — el paso anterior al expediente (2026-09-23) · 4,8 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/lo-que-se-comparte-importado-y-no-copiado.md` — Lo que se comparte, IMPORTADO y no copiado · 1,4 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/los-avisos-al-cliente-como-en-el-cae.md` — Los avisos al CLIENTE, como en el CAE (2026-09-23) · 1,5 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/los-ficheros-los-coloca-el-servidor-no-el-navegador.md` — Los FICHEROS los coloca el SERVIDOR, no el navegador · 2,3 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/numeracion-aaaa-cee-n.md` — Numeración — `{AAAA}CEE_{n}` · 0,9 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/que-ve-el-certificador-y-que-no.md` — Qué ve el certificador — y qué NO · 1,5 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/quien-es-el-cliente-y-quien-el-partner.md` — Quién es el CLIENTE y quién el PARTNER · 1,3 KB
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/seguimiento-del-encargo-que-paso-y-cuando.md` — Seguimiento del encargo — qué pasó y cuándo · 1,0 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/00-cee-directos-el-segundo-negocio.md`
  - **REGLA — NO va en `expedientes`.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/asignar-y-reasignar-certificador.md`
  - **REGLA — "Solo asignar" NO manda nada.**
  - **REGLA — el popup se abre SIEMPRE que se ELIGE un técnico**
  - **REGLA — al cambiar de técnico, la fase vuelve a "pendiente de encargar".**
  - **REGLA — los textos al técnico saben de qué negocio son**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-cliente-es-el-de-siempre-y-desde-su-ficha-se-llega-al-cee.md`
  - **REGLA — el cliente de un CEE directo se da de alta en `clientes`, como todos.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-formulario-se-guarda-solo-y-eso-tiene-una-trampa.md`
  - **REGLA — el guardián del autoguardado compara VALORES, no "¿es el primer
render?".**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-historico-importado.md`
  - **REGLA — de un histórico solo se afirma lo que tiene JUSTIFICANTE.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/el-tecnico-acusa-el-encargo-lo-cojo-no-puedo.md`
  - **REGLA — el gesto es el MISMO que en el CAE.**
  - **REGLA — aceptar es automático; RECHAZAR nunca.**
  - **REGLA — al rechazar se RETIRA el certificador**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-direccion-se-elige-no-se-teclea.md`
  - **REGLA — comunidad, provincia y municipio van por SELECTOR en cascada.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-direccion-se-trae-del-catastro-y-se-puede-corregir.md`
  - **REGLA — rellena y se aparta: todo queda EDITABLE.**
  - **REGLA — la ZONA se DERIVA, no se invalida a mano.**
  - **REGLA — si hay que CREAR el cliente, su ficha nace con la dirección del
inmueble**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-entrega-al-cliente-se-dispara-sola.md`
  - **REGLA — solo se le mandan DOS ficheros: el PDF firmado y el justificante de
registro.**
  - **REGLA — la idempotencia se comprueba ANTES que nada.**
  - **REGLA — los adjuntos se vuelven a comprobar al descargarlos.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-factura-se-emite-contra-el-libro-de-facturas-de-appsheet.md`
  - **REGLA — esta app NO tiene numeración propia.**
  - **REGLA — se escribe LO MISMO que escribe AppSheet**
  - **REGLA — el PDF es una RÉPLICA EXACTA de `facturaAppsheetHtml.js`**
  - **REGLA — un número emitido no se tira.**
  - **REGLA — "Marcar cobrado" marca PAGADAS sus facturas en la hoja**
  - **REGLA — se EMITE y se ENVÍA en el mismo gesto, con el mensaje a la vista.**
  - **REGLA — la FECHA de una factura emitida se CAMBIA, el número NO**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-ficha-del-cee-es-una-linea-de-datos-no-un-formulario.md`
  - **REGLA — lo que FALTA se ve sin desplegar nada.**
  - **REGLA — el estado del autoguardado SUBE al contenedor**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/la-oferta-el-paso-anterior-al-expediente.md`
  - **REGLA — en el LISTADO el presupuesto es una FILA más, no un bloque aparte.**
  - **REGLA — la oferta va en su PROPIA tabla, no como fila de `cee_directos`.**
  - **REGLA — el PDF es una RÉPLICA del presupuesto de AppSheet**
  - **REGLA — la aceptación pide LO MISMO que /firma/:id, SIN la cuenta bancaria**
  - **REGLA — aceptar es un claim ATÓMICO**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/lo-que-se-comparte-importado-y-no-copiado.md`
  - **REGLA — un endpoint nuevo del módulo CEE se declara en LAS DOS rutas**
  - **REGLA — el gemelo se ESCRIBE, no se bifurca.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/los-ficheros-los-coloca-el-servidor-no-el-navegador.md`
  - **REGLA — ninguna ruta de carpeta llega desde el cliente.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/que-ve-el-certificador-y-que-no.md`
  - **REGLA — al certificador NUNCA se le manda el enlace de la carpeta RAÍZ.**
  - **REGLA — un fichero que cae en presupuestos o facturas NO se hace público.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/quien-es-el-cliente-y-quien-el-partner.md`
  - **REGLA — el que va en el certificado es el CLIENTE, y punto.**
- `docs/conocimiento/cee-directos/cee-directos-el-segundo-negocio/seguimiento-del-encargo-que-paso-y-cuando.md`
  - **REGLA — sale de los sellos que YA se escriben**

<!-- generado:fin -->
