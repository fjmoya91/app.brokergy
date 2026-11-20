---
paths:
  - "implementation/backend/services/rite*.js"
  - "implementation/backend/utils/{riteValidation,instaladorFirmante}.js"
  - "implementation/frontend/src/features/expedientes/logic/{instaladorPendientes,localesRite}.js"
  - "implementation/frontend/src/features/expedientes/components/{EnviarBorradorRite*,LocalesRite*,MemoriaRite*}.jsx"
  - "implementation/rite-generator/**"
  - "implementation/backend/utils/consejoFactura.js"
  - "implementation/frontend/src/features/public/views/ConsejoFacturaView.jsx"
---
# Instalador y RITE — envío conjunto, re-firma del CIFO, lectura del certificado RITE, memoria y estancias (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/instalador-rite/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

27.b **El Certificado RITE se LEE al subirlo**: de él salen la fecha de PRUEBAS y la de FIRMA —las que fijan el inicio y el fin de actuación del CIFO— y una comprobación del emplazamiento (dirección + referencia catastral) contra el expediente. Solo se mandan a leer las DOS PRIMERAS PÁGINAS (258 tokens/página, y estos PDF llegan con los acuses detrás): ~0,0005 € por lectura. Se rellenan HUECOS, nunca se pisa una fecha ya escrita, y el emplazamiento AVISA pero no bloquea. Fuentes únicas: [riteOcrService.js](implementation/backend/services/riteOcrService.js) (leer) y [riteCertificado.js](implementation/backend/services/riteCertificado.js) (juzgar y escribir). Ver "El Certificado RITE se LEE al subirlo".

27. **Al instalador se le pide TODO de una vez, y un CIFO firmado NO cierra la tarea para siempre**: al enviar el CIFO o la documentación RITE, la app comprueba si el otro también falta y ofrece mandarlo en el MISMO mensaje, con UN enlace (`/instalador/:id`). Reenviarle el CIFO teniendo ya uno firmado (requerimiento) **anula esa firma** (`cert_cifo_refirma_at`), o el enlace de ese mismo correo le dice "todo recibido" y no le deja firmar; la cierran la subida pública y `mergeDocumentacion`, que además sella `cert_cifo_signed_at` y **no deja retroceder ni `_drive_at` ni el propio sello de re-firma** — ese sello lo escribe un endpoint dedicado y el autoguardado siguiente lo borraba con el `null` que traía la copia hidratada (medido en 26RES060_179: el enlace de ese mismo email decía «¡TODO RECIBIDO!»). Fuente única de qué falta y de los textos: [logic/instaladorPendientes.js](implementation/frontend/src/features/expedientes/logic/instaladorPendientes.js); del envío, `POST /api/expedientes/:id/instalador/enviar`. `cert_rite_drive_link` significa CERTIFICADO RITE aportado — la Memoria que generamos nosotros vive en `memoria_rite_docx_link`. Ver "Al instalador se le pide TODO de una vez".

74. **La tabla de CARGAS TÉRMICAS de la Memoria RITE sale de las ESTANCIAS REALES, confirmadas en un popup antes de generar**: era la misma plantilla de doce estancias para todas las casas (una de 70 m² firmaba cuatro dormitorios y un vestidor). Ahora el ÚLTIMO eslabón de la cadena previa a generar (fecha de pruebas → frío → titular → **estancias**) es `LocalesRiteModal`: se abre SIEMPRE, relleno con lo guardado o con una propuesta por tamaño de vivienda y nº de plantas, y se añaden o quitan estancias POR PLANTA (y plantas); los m² se reparten solos por peso y el que se teclea se respeta. **La propuesta NO sale de `cee.num_rooms`** —la app lo rellena con 4 por defecto—. **Fuente única del nombre, la orientación y los m²**: [logic/localesRite.js](implementation/frontend/src/features/expedientes/logic/localesRite.js); se guarda ya resuelto en `documentacion.rite_locales` (`PUT /:id/memoria-rite/locales`, staffOnly, RPC de MERGE, clave en `CLAVES_PROTEGIDAS`) y el generador (`cargas_desde_locales` en `rite-generator/lib/cargas_termicas.py`) solo aplica el factor W/m² de la zona. **ELEMENTOS = ⌈potencia / 100 W⌉ solo con RADIADORES** (aluminio 600 mm a ΔT50 da 119-141 W; 100 W deja margen para la aerotermia); con suelo radiante, splits o conductos la columna va en blanco. Tope **25 estancias** (filas de la plantilla JCCM). Sin `rite_locales` (CLI, antiguos) se cae a la plantilla estimada. ⚠️ PENDIENTE: el botón «enviar al instalador para que lo complete» no está hecho. Tras tocarlo: `node implementation/backend/scripts/test_locales_rite.mjs`.

171. **Cuando presentamos NOSOTROS la Memoria RITE en eDICE-Térmicas, firma y diligencia el certificado de REPRESENTANTE de la empresa de la memoria, y el slot «Certificado RITE» lleva el PDF de la IMPRESORA de eDICE** (2026-10-25, 26RES080_90). AutoFirma desde el navegador abre el almacén de Firefox, donde solo está el certificado PERSONAL: se cambia a «Almacén de claves del sistema» y se elige el `(R: <CIF>)` con captura antes y después de cada clic, sin el vigilante de `presentar-cee` (aceptaría el personal). El certificado que se guarda es `GenerarPdf.pdf` de `diligimp.jsp`, nunca la página web impresa. Firmar: [firmar_memoria_rite.js](implementation/backend/scripts/firmar_memoria_rite.js) (rechaza un firmante que no sea `R: <CIF>`); guardar: [guardar_certificado_rite.js](implementation/backend/scripts/guardar_certificado_rite.js) (mismo camino que la fila de Documentación y lectura de la 27.b). Paso a paso: skill `presentar-rite`. Ver "Presentar nosotros la Memoria RITE en eDICE-Térmicas".

210. **Cuando se le pide la factura al INSTALADOR, va con el texto recomendado para el concepto; y si la que mandó tiene una GRAVE que tumba la auditoría, con qué corregir** (Fran, 11/11/2026, caso 26RES060_194). Fuente ÚNICA del texto, de la regla de cuándo y de lo que se envía: [utils/consejoFactura.js](implementation/backend/utils/consejoFactura.js). Se manda si FALTA la factura o hay una GRAVE ABIERTA de `TITULAR`, `EMISOR`, `ALCANCE`, `ALCANCE_SIN_EQUIPO`, `SERIE_DISTINTA`, `FECHA` o `DUPLICADA` (de las incidencias REGISTRADAS, no del OCR); si no, no. RES080 no lleva. Dos variantes, SUSTITUCIÓN e HIBRIDACIÓN («la caldera se queda»); lo que no se sabe, entre corchetes. WhatsApp: DOS mensajes independientes detrás del pedido (el consejo, sin emojis ni presentarse; y solo el concepto, para copiarlo). Email: el texto lo anuncia con «Al final de este correo tienes el texto que te recomendamos para el concepto de la factura, listo para copiar.» y el recuadro «Texto recomendado para la factura» con el botón «Copiar el concepto» a la página pública `/consejo-factura/:id?token=`, que se abre con el `upload_token` de la oportunidad (el del enlace de subida) porque lleva el NIF. `solicitar-faltantes` lo RECALCULA siempre. Enganchado al popup «Solicitar lo que falta», al «¿cómo va la obra?» del parte y al aviso de CEE inicial registrado; no a las esperas, al envío en bloque ni al MCP (el porqué, en el documento). Tras tocarlo: `node implementation/backend/scripts/test_consejo_factura.js` y `test_aviso_cee_registrado.js`. Ver "El consejo de factura al instalador".

219. **El instalador puede HACER la factura de la obra en la app, en SU plantilla, y se guarda como si la hubiera SUBIDO** (Fran, 16/11/2026, 26RES060_283, beta con RCA: «como si fuese su ERP»; sustituye a la factura en Word, que no dejaba escribir los precios). En `/factura-obra/:id?token=` ([FacturaObraView.jsx](implementation/frontend/src/features/public/views/FacturaObraView.jsx), `upload_token` de la oportunidad, rutas públicas [routes/facturaInstalador.js](implementation/backend/routes/facturaInstalador.js)) ve su factura ya escrita con el concepto del consejo (regla 210) y pone nº, fecha (posterior al registro del CEE inicial, no futura) y cantidad y precio por línea **o un PRECIO TOTAL** (18/11/2026: en la 1.ª línea con cantidad 1, las demás sin importe); **puede cambiar, quitar (no la 1.ª) y añadir conceptos**, y cada línea editada conserva la PARTIDA de la del consejo en su sitio; la vista previa es el PDF de verdad (y avisa si el texto no cabe). Al guardar, [facturaInstaladorService.js](implementation/backend/services/facturaInstaladorService.js) lo sube a `DOC_FACTURAS` con `subirFicherosASlot` (como el instalador), crea la fila con `addFacturaToExpediente` y la rellena con `update_expediente_factura_by_driveid` pasando lo tecleado por el MISMO `buildPatch` del OCR (nº, fecha, base, IVA, total, emisor, partidas, `desglose` de la regla 189), con `origen: 'generada'`, sin `ocr_pendiente_revision` y SIN `validada`; avisa con `uploadNotifier`. Subir la factura sigue igual (el OCR rellena los precios). **Rehacerla SUSTITUYE a la que hizo aquí aunque estuviera revisada, y la nueva vuelve a revisión**; con facturas SUBIDAS la página pregunta (obligatorio) si sustituye a una, identificada por una referencia opaca (`refFactura`), nunca por su enlace. Se sube la nueva PRIMERO y después las sustituidas van a la papelera de Drive y salen del apartado y de `facturas[]`. **La plantilla (fondo PDF en blanco, `plantilla.json` con las posiciones y SUS fuentes) nunca va en el repo**: `PLANTILLAS_FACTURA_DIR/<id_empresa>/` o Drive `DRIVE_FOLDER_PLANTILLAS_FACTURA/<id_empresa>/`; sin ella no se ofrece, y la página del consejo enseña «Hazla aquí, en tu plantilla» solo si existe. Importes en español («6.000» = miles) e IVA `round(base × pct) / 100` IGUAL en página y servidor. **Con el concepto va además SU FACTURA EN WORD** (Fran, 18/11/2026: la plantilla nueva de RCA trae la tabla de precios como tabla de Word, donde sí se escribe): si `plantilla.json` lleva `word`, el email del consejo (`solicitar-faltantes` y el aviso del CEE registrado, `cargarConsejoFactura({ conFactura: true })` + `opcionesEmail`) adjunta el .docx pre-relleno por `rellenarDocumentoTabla` (cliente en TODOS sus cuadros, una fila por actuación + la del inmueble, RC y observaciones; número, fecha, precios, importes y totales en blanco y tecleables) y lleva el recuadro «Tu factura, ya preparada» con «Rellenar los importes»; la página del consejo ofrece «Descargar mi factura en Word» (`GET …/factura-instalador/:id/word`). El fondo del PDF de la app sale de ese mismo Word, para que las dos se vean igual. Si la fila de cuerpo de la plantilla tiene alto MÍNIMO (la de RCA retocada, 8.800 twips), las filas de concepto van sin alto y la última se queda con lo que falta (`filasLineas`). La vista previa no se pierde: FIJA al lado en el PC y, en el móvil, una píldora con el total que la abre en una hoja; el nº de factura no se sale de su casilla (`numero.zona` en `plantilla.json`: se corre y se encoge, y si ni así cabe no se guarda). En local, `FACTURA_INSTALADOR_EN_SECO=true` no guarda. Tras tocarlo: `node implementation/backend/scripts/test_factura_instalador.js`, `test_consejo_factura.js`, `test_aviso_cee_registrado.js`, `auditar_rutas_sin_guardian.js` y el build. Ver "La factura hecha EN LA APP, en su plantilla", "Con el concepto va SU FACTURA EN WORD" "Editar la factura en la app" y "La vista previa a la vista y el nº de factura en su casilla".

228. **La Memoria RITE declara el ACS con `cambio_acs` VACÍO si hay un equipo de ACS declarado, y el backend y el generador lo deciden con la misma función y su espejo** (2026-11-20, 26RES080_41: salió sin ACS teniendo una bomba de calor de ACS de 185 L; había 23 expedientes así). `null`, sin la clave o `''` → con ACS si `aerotermia_acs` trae `modelo` o `aerotermia_db_id`; `true`/`'SI'` → con ACS; `false`/`'NO'` → sin ACS. Fuentes: `acsEnAlcanceRite` ([utils/riteValidation.js](implementation/backend/utils/riteValidation.js)) y `_acs_en_alcance` (`rite-generator/lib/supabase_client.py`). Los litros sacados del NOMBRE del modelo solo valen si parecen un volumen (con «L», o entre 80 y 1000 y sin empezar por 0): «ecoAIR+ 3-12 PRO» ya no da 12 L. Tras tocarlo: `PYTHONIOENCODING=utf-8 node implementation/backend/scripts/test_acs_alcance_rite.js`; en producción, desplegar backend y contenedor del rite-generator. Ver "La Memoria RITE declara el ACS aunque cambio_acs esté vacío".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/instalador-rite/al-instalador-se-le-pide-todo-de-una-vez.md` — Al instalador se le pide TODO de una vez (2026-08-27) · 11,1 KB
- `docs/conocimiento/instalador-rite/el-certificado-rite-se-lee-al-subirlo.md` — El Certificado RITE se LEE al subirlo (2026-09-03) · 5,5 KB
- `docs/conocimiento/instalador-rite/el-consejo-de-factura-al-instalador.md` — El consejo de factura al instalador (2026-11-11) · 27,6 KB
- `docs/conocimiento/instalador-rite/la-memoria-rite-de-una-cascada.md` — La Memoria RITE de una CASCADA: todo cabe en su casilla y los litros se suman (2026-11-13) · 2,8 KB
- `docs/conocimiento/instalador-rite/la-memoria-rite-declara-el-acs-con-cambio-acs-vacio.md` — La Memoria RITE declara el ACS aunque `cambio_acs` esté vacío, si hay equipo de ACS (2026-11-20) · 2,9 KB
- `docs/conocimiento/instalador-rite/presentar-la-memoria-rite-en-edice.md` — Presentar nosotros la Memoria RITE en eDICE-Térmicas (2026-10-25) · 5,3 KB
- `docs/conocimiento/instalador-rite/varios-tecnicos-pueden-firmar-la-memoria-rite.md` — VARIOS técnicos pueden firmar la Memoria RITE de una empresa (2026-11-06) · 2,9 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/instalador-rite/al-instalador-se-le-pide-todo-de-una-vez.md`
  - **REGLA — el `cert_rite_drive_link` es el CERTIFICADO RITE, no nuestra Memoria.**
  - **REGLA — nada se genera a espaldas de nadie.**
  - **REGLA — el adjunto del CIFO se DESCARGA DE DRIVE, no se vuelve a rasterizar.**
  - **REGLA — todo o nada.**
  - **REGLA — se sella la fecha de envío de CADA documento que ha viajado**
  - **REGLA — reenviarle el CIFO teniendo ya uno firmado ANULA esa firma.**
  - **REGLA — el SELLO DE RE-FIRMA tampoco retrocede, y esa es la parte que faltaba.**
  - **REGLA — el `_drive_at` NUNCA retrocede.**
  - **REGLA — "firmado" y "firmado de ESTA versión" no son lo mismo, y se dice.**
  - **REGLA — el radar cuenta la re-firma como firma pendiente.**
  - **REGLA — la superficie de cada tarea es la MISMA que la de su página suelta.**
  - **REGLA — lo que se revisa es LO QUE SALE, byte a byte.**
  - **REGLA — si en el visor se ve algo mal, se SALE a corregirlo.**
- `docs/conocimiento/instalador-rite/el-certificado-rite-se-lee-al-subirlo.md`
  - **REGLA — solo se envían a leer las DOS PRIMERAS PÁGINAS.**
  - **REGLA — el modelo solo LEE; el juicio es del código.**
  - **REGLA — las fechas se piden como TEXTO `dd/mm/aaaa` y las convierte `aISO()`.**
  - **REGLA — se anota la ÚLTIMA de las fechas de pruebas.**
  - **REGLA — se rellenan HUECOS, nunca se pisa lo escrito.**
  - **REGLA — la comprobación del emplazamiento AVISA, no bloquea.**
  - **REGLA — lo leído viaja en el aviso al staff y se queda en el expediente.**
  - **REGLA — un slot validable DECLARA su nombre en `DOCUMENTO_VALIDABLE_LABELS`.**
- `docs/conocimiento/instalador-rite/el-consejo-de-factura-al-instalador.md`
  - **REGLA — el texto, la regla de cuándo y el envío salen de UNA fuente:
[utils/consejoFactura.js](implementation/backend/utils/consejoFactura.js).**
  - **REGLA — se manda si FALTA la factura, o si la que hay tiene una incidencia GRAVE que tumba
la auditoría. Si no, no.**
  - **REGLA — la página lleva el NIF del titular: se abre con el `upload_token` de la oportunidad,
el MISMO del enlace de subida (`/subir-docs`) que ya tiene el instalador.**
  - **REGLA — la factura en Word se rellena sobre una factura REAL del instalador en .docx (su
plantilla), nunca se maqueta de nuevo.**
  - **REGLA — la factura generada se GUARDA como si el instalador la hubiera subido al apartado
«Facturas» (DOC_FACTURAS): mismo fichero en «5. FACTURAS», misma fila en
`documentacion.facturas[]`, mismo aviso al equipo. Lo único distinto es quién rellena la fila:
aquí no lee el OCR, va con los datos EXACTOS con los que se ha compuesto.**
  - **REGLA — la plantilla del instalador NO va en el repo**
  - **REGLA — si el instalador tiene su Word en la plantilla (`plantilla.json` → `word`), el email del
concepto lo lleva ADJUNTO, pre-relleno, y un recuadro «Tu factura, ya preparada» con el botón
«Rellenar los importes» (/factura-obra), por encima del texto para copiar.**
  - **REGLA — el Word se rellena SOBRE la plantilla, sin tocar nada más**
  - **REGLA — al copiar la fila de cuerpo, las de
  concepto van SIN alto y la última (inmueble y observaciones) se queda con lo que falta hasta ese
  mínimo**
  - **REGLA — PRECIO TOTAL (`modo: 'total'`): un solo precio sin IVA para toda la obra, que va en la
PRIMERA línea (la bomba de calor) con cantidad 1; las demás salen sin importe.**
  - **REGLA — los CONCEPTOS se pueden cambiar, quitar (menos el primero) y añadir (hasta 12, de 700
caracteres como mucho), pero cada línea editada conserva la PARTIDA de la del consejo en su sitio**
  - **REGLA — la factura nueva SUSTITUYE a la que hizo aquí, AUNQUE ESTUVIERA REVISADA, y la nueva vuelve
a revisión**
  - **REGLA — la vista previa no se pierde al rellenar: en el PC va al lado y FIJA (sticky, encogida a lo
alto de la pantalla, con los totales a la vista); en el móvil, una píldora abajo con el total («Ver la
factura · 14.666,41 €») la abre entera en una hoja que sube desde abajo («Seguir rellenando»).**
  - **REGLA — el nº de factura no se sale de su hueco: `numero.zona` (y `fecha.zona`) de `plantilla.json`
es `[xmin, xmax]`, el espacio libre del campo; un texto que se saldría se corre dentro y, si no cabe,
se encoge hasta 6,5 pt. Si ni así cabe, la vista previa lo dice (`X-Factura-Numero-Largo: 1`), la
página pide acortarlo y `generar` no lo guarda.**
- `docs/conocimiento/instalador-rite/la-memoria-rite-de-una-cascada.md`
  - **REGLA — en una casilla de alto fijo el texto largo se ENCOGE, nunca se corta.**
  - **REGLA — la acumulación es la de TODOS los depósitos de ACS.**
- `docs/conocimiento/instalador-rite/la-memoria-rite-declara-el-acs-con-cambio-acs-vacio.md`
  - **REGLA — con `cambio_acs` vacío (`null`, sin la clave o `''`), la Memoria RITE declara ACS si hay un
EQUIPO de ACS declarado**
  - **REGLA — el backend y el generador deciden con la MISMA función y su espejo**
  - **REGLA — los litros deducidos del NOMBRE del modelo solo valen si parecen un volumen.**
- `docs/conocimiento/instalador-rite/presentar-la-memoria-rite-en-edice.md`
  - **REGLA — firma y diligencia el certificado de REPRESENTANTE de la empresa de la memoria, nunca el
personal.**
  - **REGLA — el slot «Certificado RITE» lleva el PDF de la IMPRESORA de eDICE.**
  - **REGLA — lo declarado en eDICE sale de la memoria firmada.**
- `docs/conocimiento/instalador-rite/varios-tecnicos-pueden-firmar-la-memoria-rite.md`
  - **REGLA — cuál firma se ELIGE al enviar, y vale para ESE expediente.**
  - **REGLA — la sustitución la hace UNA función y su espejo**

<!-- generado:fin -->
