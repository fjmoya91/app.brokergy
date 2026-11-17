---
name: contestar-inexactitudes-marwen
description: 'SUBE al portal del verificador MARWEN (beCAE, cae.marwen.es) la contestación a un informe de INEXACTITUDES de un lote CAE de BROKERGY: baja de Drive la carpeta plana «N. REQUERIMIENTO» del lote (el escrito de contestación firmado _fdo y los documentos corregidos E{n}-…_v1), comprueba que está lista, abre el expediente CAE-XXXX en el portal, adjunta todo en una sola subida con su nota y, con el «sí», pulsa Continuar y comprueba que ha quedado en «Documentos subidos». Marwen NO admite contestar inexactitudes por API: esto va por el navegador. Úsalo con "sube el requerimiento del LOTE-2026-016 a Marwen", "presenta la contestación de la CAE-2041", "sube las inexactitudes al verificador", "contesta el requerimiento en beCAE", "sube la ronda 2". Vale para cualquier ronda. La sesión del portal la inicia el usuario (no se escriben contraseñas). Necesita Claude en Chrome. No prepara el escrito ni corrige documentos (va antes; para el Anexo I del lote, ver «Antes de subir»).'
---

# Subir la contestación a las inexactitudes en el portal de Marwen

Marwen (Grupo Marwen / beCAE) es el verificador de los lotes. Con su API se **crea** la solicitud de
verificación (`marwenService.js`), pero **no** se puede contestar un informe de inexactitudes. Esa
contestación se sube a mano en `https://cae.marwen.es`. Esta skill hace esa subida desde Claude en
Chrome. La primera vez se hizo el 11/11/2026, con CAE-2041 / LOTE-2026-016: 15 PDF y 41 MB. La
segunda ronda del mismo lote, el 17/11/2026: 2 PDF (el escrito y el Anexo I del lote re-firmado).

Detalle y porqué: `docs/conocimiento/lotes/contestar-inexactitudes-en-el-portal-de-marwen.md`.

## Lo que NO hace

- **No** prepara la contestación. El escrito, los re-firmados, las fotos nuevas y la carpeta van
  antes; los prepara la sesión del lote (`docs/conocimiento/lotes/las-inexactitudes-del-verificador-se-registran-y-la-respuesta-se-arma-sola.md`).
- **No** escribe la contraseña del portal: la sesión la inicia el usuario.
- **No** pulsa «Continuar» sin el «sí» del usuario para ESA subida. Subir al verificador es enviar
  a un tercero. Si el usuario ya lo pidió en firme («súbelo», «súbelo todo a beCAE»), ese es el
  «sí»: se sube y después se le enseña lo subido (ficheros y nota).

## Antes de subir: el Anexo I del LOTE, si el verificador lo pide

Cuando una inexactitud cambia un dato del listado del lote (coordenadas, fechas, ahorro…), el
verificador pide el «convenio CAE actualizado», es decir, el **Anexo I del lote** (Listado de
cesión de ahorros) firmado de nuevo por el S.O. y por Brokergy. Así fue en la ronda 2 del
LOTE-2026-016: la nº 7 siguió abierta solo por eso. El camino es:

1. **Reenviarlo al S.O.** desde la app, con el «sí» del usuario: lote → fase 2 «Firma del Sujeto
   Obligado» → «Requerimiento · volver a pedir la firma» → marcar solo «Incluir también el Anexo
   I» → Continuar. Antes de «Enviar», se comprueba la vista previa del documento: la fila
   corregida y que las demás no cambian.
2. **El S.O. lo devuelve firmado solo por él.** El buzón (regla 141) lo deja SIN registrar
   («el Anexo I debe llevar DOS firmas») y manda el aviso «Firmados del S.O. por correo … hay que
   revisar 1». El PDF se baja del correo y se contrafirma como proveedor con el script de abajo.
   Lo firma Claude sin preguntar (decisión de Fran del 11/11/2026).

   ```bash
   node implementation/backend/scripts/contrafirmar_anexo_i_lote.js LOTE-AAAA-NNN --pdf "<PDF del S.O.>"            # en seco
   node implementation/backend/scripts/contrafirmar_anexo_i_lote.js LOTE-AAAA-NNN --pdf "<PDF del S.O.>" --escribir
   ```

   El script hace esto:
   - comprueba que el PDF lleva una sola firma, íntegra, y que «EL PROVEEDOR» está sobre la caja;
   - lo firma con AutoFirma y lo registra;
   - lo coloca en todas las E{n} y en «N. REQUERIMIENTO», y lo anterior va a OLD;
   - renombra esas copias de `_revN_fdo` a `_vN`.
3. Se genera y se firma el **escrito de la ronda** (solo las inexactitudes que siguen abiertas) y
   se sube a «N. REQUERIMIENTO». Con eso, la carpeta está lista para el paso 1 de aquí abajo.

## Pasos

### 1. Localizar el lote y bajar la carpeta

El usuario puede decir el lote (`LOTE-2026-016`) o el expediente de Marwen (`CAE-2041`). El
`CAE-XXXX` sale en el propio portal (columna «Nº Expediente», con el lote en «Nº Pedido»). Desde
la raíz del repo:

```bash
node implementation/backend/scripts/bajar_requerimiento_lote.js LOTE-AAAA-NNN [--ronda N] --destino "<scratchpad>/req-LOTE"
```

El script solo **lee** de Drive. Devuelve en JSON:
- `ficheros`: los PDF con su peso, el escrito el primero;
- `tandas`: las rutas agrupadas en bloques de menos de 9,5 MB, para `file_upload`;
- `avisos`.

**Si hay avisos, se para y se le dicen al usuario** antes de abrir el portal:
- subcarpetas (la carpeta va PLANA);
- `.txt` de borrador;
- escrito sin firmar (`_fdo`);
- piezas sin `_v1` (vale también `_v1_fdo`, la pieza re-firmada).

La ronda es el número de la carpeta: «1. REQUERIMIENTO», «2. REQUERIMIENTO»…

### 2. Abrir el portal

Con Claude en Chrome se abre `https://cae.marwen.es/control/CAE-XXXX`. Si sale el login
(«Usuario / Contraseña»), se le pide al usuario que inicie sesión y avise («dentro»). Después se
vuelve a abrir esa misma URL, que lleva directa al expediente.

### 3. Ir a las inexactitudes del expediente

1. Menú **«Expedientes»**. En la fila del `CAE-XXXX`, «Estado inexactitudes» dice algo como
   «8 Pte. Doc.». Se pulsa **«Abrir»** de esa fila, y se llega a `…/control/CAE-XXXX`.
   - Ojo: pulsar la fila fuera de «Abrir» abre «Detalles de la Solicitud». Se cierra con la X.
2. Pestaña **«Inexactitudes»**. Se lee la tabla con `get_page_text`. Las que siguen «Abierto»
   tienen que ser justo las que contesta el escrito; en la columna OBSERVACIONES el verificador
   dice por qué siguen abiertas. En la ronda 2 y siguientes, «Documentos subidos» ya tiene las
   subidas anteriores, y es normal. Si no es la ronda que se espera, se le dice al usuario.

### 4. Preparar la subida (sin enviar)

1. Botón **«Subir documentos»** (naranja, arriba a la derecha). Abre «Nota para la subida».
2. **Archivos.** Con `find` se busca el `file-input` oculto. Se llama a `file_upload` con cada
   tanda del paso 1; cada llamada debe ir por debajo de 10 MB. Cada tanda **se añade** a la lista
   (no la sustituye), así que se suben todas seguidas. Al final, `get_page_text` debe listar
   exactamente los ficheros bajados, ni uno más.
3. **Nota** (obligatoria, hasta 2000 caracteres), en el campo «Escribe la nota aquí…»:

   > Contestación al informe de inexactitudes de {fecha del informe} ({LOTE}). Se aporta el
   > escrito de contestación firmado, que responde a las inexactitudes nº 1 a {N}, junto con los
   > documentos corregidos de las actuaciones {E…}, identificados con su código y el sufijo _v1.

   Las actuaciones E{n} salen de los prefijos de los ficheros. La fecha del informe es la de la
   última fila de «Versiones Generadas».

   Si queda abierta una sola inexactitud (ronda 2 o siguientes), la nota se adapta. Esta es la
   del 17/11/2026:

   > Contestación al informe de inexactitudes de 16/11/2026 (LOTE-2026-016). Se aporta el escrito
   > de contestación firmado, que responde a la inexactitud nº 7, la única abierta, junto con el
   > Anexo I del Convenio CAE (listado de cesión de ahorros del lote) actualizado y firmado de
   > nuevo por el Sujeto Obligado y por BROKERGY, con las coordenadas UTM corregidas de la
   > actuación E8, identificado con su código y el sufijo _v1.

### 5. Enseñar y pedir el «sí»

Antes de «Continuar» se le enseña al usuario, como último texto del turno:
- el expediente;
- la lista completa de ficheros;
- la nota tal cual;
- la pregunta.

Cada inexactitud tiene también su campo de «Acciones correctivas» (el ojo de la columna ACC.).
No se rellena si el escrito ya las contesta todas, y se dice así.

### 6. Enviar y comprobar

1. Con el «sí», se pulsa **«Continuar»**. Sale «Subiendo...»: 41 MB tardan unos 30 s y 0,6 MB
   un par de segundos. Se espera con `wait` y se vuelve a leer.
2. Se comprueba:
   - «Documentos subidos» tiene una fila nueva con la fecha, el «N SUBIDA» y la nota;
   - su botón **«Documentos»** lista **todos** los ficheros;
   - el estado del expediente (al lado del verificador jefe) pasa de «En resolución» a
     **«Reestudio documental»**.
3. Se le dice al usuario lo que se ha visto: nº de subida, nº de ficheros y estado nuevo. Las
   inexactitudes siguen en «Abierto» hasta que las revise el verificador; eso es normal.
4. Se cierra la pestaña que se abrió, salvo que el usuario quiera verla.

## Si algo no cuadra

- **«Subir documentos» no aparece** o el expediente no está «En resolución»: no se fuerza nada.
  Se le dice al usuario lo que se ve.
- **Un fichero de más de 10 MB**: `file_upload` no lo admite. Se comprime antes (con la skill
  `pdf`), sin perder legibilidad, y se avisa al usuario.
- **La subida no aparece** tras «Subiendo...» y un rato de espera: se recarga la página y se mira
  «Documentos subidos» antes de reintentar. Una subida duplicada la ve el verificador.
