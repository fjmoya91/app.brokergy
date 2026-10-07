<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La PLACA de la unidad exterior, dentro del certificado (2026-09-17)

El verificador abrió una inexactitud el 16/09/2026: *«El valor de SCOPdhw utilizado
en el cálculo no coincide con el indicado en la documentación técnica aportada»*. Y
el valor estaba bien: cuando el SCOP_dhw se justifica por el **ANEXO VI** (bomba de
calor aerotérmica con depósito de ACS no suministrado como conjunto), el certificado
declara `SCOP_dhw = COP · F_c`, y **el COP a A7/W55 no lo publican todas las fichas
técnicas** — está en la PLACA DE CARACTERÍSTICAS del equipo. Se aportaba aparte, por
correo, y quien revisaba el certificado no la tenía delante.

Ahora el certificado la lleva dentro: **al lado del cálculo** y otra vez **ampliada
como anexo**.

| Qué | Dónde |
|---|---|
| Encontrar la foto en Drive, elegirla y servirla | [placaScopAcs.js](implementation/backend/services/placaScopAcs.js) |
| El recuadro y la página del anexo (fuente única de las 3 superficies) | `scopAcsAnexoViHtml` / `placaAnexoContenido` en [cifoDoc.js](implementation/frontend/src/features/expedientes/logic/cifoDoc.js) |
| Rutas | `GET|PUT /api/expedientes/:id/placa-scop-acs`, **staffOnly** |
| Carga, elección y subida (hook) | [usePlacaScopAcs.js](implementation/frontend/src/features/expedientes/logic/usePlacaScopAcs.js) |
| Superficie (compartida por los DOS popups) | [PlacaScopAcsBanda.jsx](implementation/frontend/src/features/expedientes/components/PlacaScopAcsBanda.jsx) |
| Prueba de lo determinista | `node implementation/backend/scripts/test_placa_scop_acs.mjs` |
| Qué placa saldría HOY (expedientes reales, solo lee) | `node implementation/backend/scripts/probar_placa_scop_acs.js [nº expte\|--todos]` |
| Que ninguna hoja desborde | `check_cifo_paginas.mjs` **y** `check_res080_paginas.mjs` |

**REGLA — la foto NO se sube otra vez: ya está en Drive.** La sube el instalador a
«la pegatina de la máquina de fuera» (`FOTO_UNIDAD_EXTERIOR_PLACA`), que está en
`FULL_RES_SLOTS` precisamente para que esos caracteres se lean, y es la MISMA de la
que el lector de placas saca el nº de serie (regla 27.e). Drive es la fuente de verdad
de qué ficheros hay (regla 20): no se mira `reforma_uploads`. Medido el 17/09/2026:
de los **25** expedientes que justifican su SCOP_dhw por el Anexo VI, **12 ya tienen la
placa** en su carpeta y **3 de ellos tienen varias**.

**REGLA — con VARIAS se elige, y un cambio de foto nunca es silencioso.** Una unidad
exterior puede llevar dos etiquetas (la de datos y la del refrigerante) y cuál trae el
COP lo sabe quien las mira. La elegida se guarda en `instalacion.placa_scop_acs` — solo
el driveId y su nombre (regla 21) — y si ese fichero ya no está en Drive se cae a la
primera **diciéndolo**: dejar el certificado sin justificante sería peor, pero cambiar
lo que el verificador va a ver sin avisar es otra cosa.

**REGLA — se imprime DOS veces, y no es redundancia.** En el recuadro del cálculo mide
208 px: ahí sirve para decir, en el sitio del número, de dónde ha salido — **no para
leerlo**. Leerlo es justo lo que hace el verificador, así que va otra vez a página
completa como anexo, y aparece en la lista «Anexos · Documentación adjunta». Verificado
sobre la foto real de 25RES060_76: en el anexo se lee su fila *«Air 7/6°C inlet/Outlet
water 47/55°C · COP · 2.79-3.09»*, que es exactamente el 3,00 que el CIFO declara.

**REGLA — el bloque del Anexo VI es FUENTE ÚNICA de las tres superficies.** Estaba
copiado en `cifoDoc.js`, en `res080Doc.js` y en `CertificadoRes080Modal.jsx`: la foto
habría sido una cuarta copia. Ahora las tres llaman a `scopAcsAnexoViHtml`, con el
`anexoRef` de su ficha (Anexo VI de la RES060 · Anexo VII de la TER100 · Anexo II de la
TER173) — es el mismo cálculo y el mismo justificante, y tres copias divergirían justo
donde el verificador compara. `FC_ZONA_ACS` también estaba triplicada.

**REGLA — el Certificado RES080 la lleva igual.** Justifica su SCOP_dhw con el MISMO
Anexo VI (4 de los 25 son RES080) y es el mismo slot documental que el CIFO (regla 24).

**REGLA — la imagen va como DATA URI dentro del HTML.** El PDF lo rasteriza Puppeteer
con `setContent` sobre `about:blank`: una URL relativa no tiene base que resolver y una
autenticada no lleva sesión (mismo motivo que las tipografías, regla 25.b). Se pide a
Drive **ya reducida a 1600 px** por el mismo camino que el proxy de miniaturas, y solo
si eso falla se bajan los bytes originales. Medido sobre expedientes reales: **242-268
KB** y 1,5-3,4 s.

**REGLA — se pulsa la foto y se RECORTA, y lo que se guarda es el RECUADRO.** El
mismo `ReactCrop` del Anexo Fotográfico, pero aquí **no se tocan los píxeles**: se
guardan `{x,y,w,h}` en % más `ar` (la relación de aspecto de la foto), y el documento
encuadra con una caja `overflow:hidden`. Así el original sigue entero en Drive, el
recorte **se deshace**, el anexo conserva toda la resolución del trozo que interesa —y
en una placa ese trozo ES el número que se va a leer— y el certificado sale igual
generándolo desde la app o desde el backend, porque el encuadre vive en el expediente y
no en el popup. En BD siguen siendo metadatos (regla 21): una imagen recortada en base64
dentro de un JSONB es justo lo que tumbó la BD en julio.

**REGLA — el recorte es de ESA foto.** Se guarda dentro de `placa_scop_acs` y al cambiar
de foto no se arrastra: un encuadre no vale para otra imagen. `sanearRecorte` rechaza lo
que se sale de la foto, lo que no son números y los recortes de menos del 5 % (un
arrastre sin querer, que ampliado sería un borrón).

⚠️ El encuadre se calcula en **PÍXELES** (`placaImgHtml`), nunca en porcentajes: un
`top` en % se resuelve contra la ALTURA DE LA CAJA y no contra la de la imagen, y ahí se
descoloca. Y si el recorte no cabe de alto se reduce ENTERO — la hoja del PDF es fija.

⚠️ **El `select` de la ruta vive en el SERVICIO** (`placaDeExpediente`), no en
`routes/expedientes.js`. Pedir una columna que no existe hace fallar la consulta
ENTERA y el expediente llega `null`, o sea un **404 sobre un expediente que sí
existe** — y en pantalla eso no se ve como un error, se ve como que la función **no
hace nada**. Pasó el 17/09/2026 con `drive_folder_id`, que NO es columna de
`expedientes` (mismo gotcha que `prescriptores.telefono` y `oportunidades.historial`).
Con el select ahí, `probar_placa_scop_acs.js` ejerce exactamente lo que corre.

**REGLA — un fallo al resolver la placa NUNCA tumba la generación.** Sale como aviso
(`warnings`) y el certificado se genera sin ella, que es el comportamiento de siempre.

**REGLA — se puede SOLTAR la foto en el propio popup, y sube por la RUTA DE SIEMPRE.**
Es la excepción, no el camino: en 12 de los 25 la foto ya está, y el botón existe para
los otros 13 sin tener que salir a pedirle al instalador algo que se tiene delante. Va
a `POST /api/public/reforma-docs/:oportunidad/FOTO_UNIDAD_EXTERIOR_PLACA` — la MISMA que
usa el enlace del instalador, que ya admite sesión de staff sin token —, así que la foto
entra en el slot de siempre y la ven también el checklist, el Anexo Fotográfico y el
lector de placas. **No hay una segunda vía de subida que mantener.** Lo subido queda
**elegido**: quien lo sube aquí lo hace para que se imprima, no para dejarlo en la
carpeta. Solo imágenes — un PDF entraría en el slot y no se podría pintar.

⚠️ La banda es **una sola pieza para los dos popups** (`PlacaScopAcsBanda` + el hook
`usePlacaScopAcs`): es el mismo gesto sobre el mismo dato, y dos copias divergirían
justo en el aviso de que la foto falta — que es lo único accionable de esa banda.

⚠️ Las hojas del certificado son FIJAS y el recuadro pasa a dos columnas: tras tocarlo,
los DOS medidores. Holguras actuales en el peor caso: **+37 px** en el CIFO (TER100 con
piscina y Anexo VI) y **+198 px** en el RES080.
