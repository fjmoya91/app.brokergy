<!-- conocimiento · área: cee · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «PRESENTAR el CEE en el Registro — el borrador (2026-09-15)»; la introducción y el resto, en esta misma carpeta.

### PRESENTARLO sin tocar el PC — skill `presentar-cee` (2026-10-15)

El borrador decía qué teclear; quedaba teclearlo, adjuntar, pagar la tasa, firmar dos veces con
AutoFirma y subir el justificante. Ahora lo hace Claude con «presenta el CEE de NNN»: el usuario solo
dice **sí al pago** en el chat y lo **autoriza en la app del banco**. Primer caso real: **2026CEE_63**,
registro 4169682/2026 del 15/10/2026, tasa de 16,39 €.

| Qué | Dónde |
|---|---|
| Procedimiento | [skills/presentar-cee/SKILL.md](skills/presentar-cee/SKILL.md) |
| Pendientes · plan de relleno · subir lo devuelto | [scripts/presentar_cee.js](implementation/backend/scripts/presentar_cee.js) (`pendientes` · `preparar` · `devuelto [--escribir]`) |
| Firmar sin pulsar | [vigilante_autofirma.ps1](implementation/backend/scripts/presentar_cee/vigilante_autofirma.ps1) + el montaje de [referencia/montaje.md](skills/presentar-cee/referencia/montaje.md) |
| Avisos `alert()`, tarjeta guardada | [escritorio.ps1](implementation/backend/scripts/presentar_cee/escritorio.ps1) |
| ¿Está bien montado? | [comprobar_montaje.ps1](implementation/backend/scripts/presentar_cee/comprobar_montaje.ps1) |

**REGLA — la firma se automatiza AISLANDO el certificado, no pulsando a ciegas.** AutoFirma 1.9
enseña SIEMPRE su ventana de elección (solo la salta el `headless` que pone la web, y la JCCM no lo
pone). En el almacén de Windows de este PC hay seis certificados de varias personas; un Intro a ciegas
podría firmar con el de otro. Por eso AutoFirma usa en las llamadas del navegador el almacén de
**Firefox** (`defaultKeystore` + `useDefaultStoreInBrowserCalls`), donde solo está el de quien
presenta: con UN certificado el foco está en «Aceptar» y basta un Intro. El vigilante solo lo pulsa si
el título dice **NSS** —así titula AutoFirma el almacén de Firefox; medido: el primer vigilante buscaba
«Mozilla» y se negó, que era lo que tenía que hacer— y nunca si dice Windows. Un perfil de Chrome
aparte no sirve: todos leen el almacén de Windows.

**REGLA — «Es representante» se marca ANTES de rellenar.** Identificado con certificado, la sede pone
de SOLICITANTE a quien se identifica, con su NIF fijo. La casilla «Es representante» (bajo el apartado
01) recarga la página: el solicitante pasa a ser editable —el titular, como dice el borrador— y quien
presenta queda en el 02.

**REGLA — en el 02 va quien FIRMA, nunca el AGENTE IA** (2026-10-19). Los CEE iniciales que hace el
Agente IA lo dejan de certificador asignado, pero él no firma ni presenta: los firma Fran con el
certificado de representante de Brokergy. El borrador tomaba el 02 del asignado, la ficha del agente no
tiene NIF, dirección, teléfono ni correo, y la sede rechazó «Pagar y enviar» con «En 02 Representante:
Cumplimente los campos obligatorios» (26RES060_189, registro 4212311/2026: se rellenó a mano). Ahora
`borradorCeeService.representanteDe` pone, si el asignado es el agente (`es_agente_ia`), al certificador
de la casa —el MISMO técnico por defecto de `cee_inicial.js`, `CEE_TECNICO_POR_DEFECTO`— y el borrador
lo DICE (nota del 02 y un aviso), en el popup de la app y en `preparar`. Decisión del usuario: «aunque
ponga agente IA, siempre debe haber un certificador real; si no digo nada, seré yo, Fran Moya, y si no,
preguntarme por otro» → `preparar <nº> --certificador <id_empresa | NIF | nombre>`. Un técnico de
VERDAD sin NIF o sin dirección **no** se cambia por Fran (presentar como suyo un CEE que firma otro
sería falso): se queda con su aviso y se completa su ficha. `preparar` cuenta los datos del 02 (tipo
de vía, vía, nº, CP, municipio, móvil, correo) entre los obligatorios —sin ellos, NO LISTO— y
`rellenar.js` dice `NO TOMA`/`VACÍO` si una casilla no se queda con su valor, en vez de descubrirlo
al pagar. Prueba: `test_borrador_cee.mjs` («Agente IA asignado»).

**REGLA — tras escribir la referencia catastral se pulsa «Añadir Referencia».** La sede valida el XML
contra las referencias AÑADIDAS a la lista, no contra la casilla: sin el botón, el XML se rechaza
(«No ha pulsado el botón 'Añadir Referencia' o ninguna de las referencias… coincide con las del XML»).
Y se TECLEA y se pulsa con clics reales **justo antes de subir el XML**: en 2026CEE_64, escrita por
JavaScript y añadida antes de los dos PDF, salía en la lista pero la sede rechazó el XML dos veces; quitada
y vuelta a teclear justo antes, entró a la primera. Por eso `rellenar.js` ya no la escribe.

**REGLA — la «Fecha de emisión» es la de GENERACIÓN del XML, no la de firma de la app.** La sede la
compara con `<FechaGeneracion>` del XML (la que el PDF imprime como «Fecha (de generación del
documento)»). En 26RES060_221 el CEE se calificó el 08/10 y se regeneró el 15/10: con el 08/10 que
pone el borrador (`fecha_firma_cee_inicial`), la sede rechazó el XML («La Fecha de emisión del
certificado no coincide con la del xml»). `preparar` ya declara la del XML y lo avisa. Si la sede aún
lo rechaza, el usuario regenera el CEE en CE3X con una sola fecha y firma de nuevo el PDF (decisión
del usuario). ⚠️ El borrador del popup sigue tomando la fecha de firma: pendiente de cambiar.

**REGLA — cada solicitud empieza y acaba BORRANDO la sesión de la sede.** Sin cerrar Chrome, la sede
reutiliza `PHPSESSID` y al volver enseña la solicitud anterior ya registrada (26RES060_221 abrió con
el resultado de 2026CEE_64). La cookie no es HttpOnly: se borra desde la página antes de entrar y al
terminar.

**REGLA — los ficheros se suben con su nombre ORIGINAL: el NIF lo pone la sede.** Medido en
2026CEE_63: el PDF subido como `NIF_2026CEE_63 – …` quedó `NIF_NIF_2026CEE_63 – …`. ⚠️ Contradice lo
que hacen el borrador (`nombreRegistro`, descarga «ya renombrada con el NIF delante») y el correo de
Eva («los adjuntos van con el NIF del titular delante, como se suben al Registro»): quien los sube tal
cual los duplica. `preparar` ya los deja sin NIF; el borrador y el correo están pendientes de cambiar.

**REGLA — las recomendaciones de mejora son el MISMO PDF firmado.** La sede exige la categoría
«Recomendaciones de medidas de mejora» y el PDF de CE3X las lleva en su Anexo III (en 2026CEE_63,
páginas 11–14). Sin informe aparte en Drive, se adjunta el PDF firmado otra vez; extraer esas páginas
rompería la firma.

**REGLA — el pago pide el SÍ del usuario y lo autoriza su banco.** Nunca se escribe una tarjeta: se
usa la guardada en Chrome, la que diga el usuario. Su desplegable es del NAVEGADOR y no se abre con un
clic simulado de la extensión (con teclas de la extensión se veía la vista previa y no se quedaba):
se elige con el ratón real (`escritorio.ps1 clic`). Chrome rellena hasta el CVV. Después, 3DS en la
app del banco: eso no lo puede hacer nadie más.

**El recorrido medido** (2026CEE_63): identificación (firma 1) → «Realizar Solicitud» → `alert` →
«Es representante» → rellenar → «Añadir Referencia» → 4 adjuntos (categorías 3926 PDF · 3927
recomendaciones · 3928 XML · 3929 .cex) → «Acceso a la pasarela» → «Pagar y enviar» → `alert` →
pestaña `plataformapagos.jccm.es` → «sin identificación» → «Pago con Tarjeta» → Redsys → 3DS →
«Continuar» → justificante de la tasa (icono de descarga, `<nº 046>.pdf`) → «Continuar» → la sede
vuelve con «referencia 046» marcada y VACÍA: se escribe el nº de documento 046 (13 dígitos) → «Enviar»
→ `alert` «Se van a firmar los datos» → firma 2 → «número de registro NNNNNNN/AAAA» → icono PDF →
`NNNNNNN.pdf`. Mientras hay un `alert()` abierto la página no responde a la extensión (ni capturas ni
JavaScript): se acepta con `escritorio.ps1 aviso`.

⚠️ En 2026CEE_63 y en 2026CEE_64 (registro 4171225/2026) la página de resultado mostró además
«SOAP:Server: Server Error» y los «Id. de firma» de los adjuntos vacíos, con el registro y la firma del
formulario bien: parece lo normal de la sede. Pendiente de ver que la copia por correo trae los cuatro
documentos.

**REGLA — una solicitud perdida tras pagar se rehace con la referencia 046, sin volver a pagar**
(19/10/2026, 26RES060_217, registro 4217566/2026). Mientras el usuario autorizaba el 3DS, Chrome
descartó la pestaña de la sede (estaba detrás) y al volver salió «Confirmar reenvío del formulario»
(ERR_CACHE_MISS): la solicitud ya no existía. Reenviar repetiría «Pagar y enviar». Se bajó el
justificante de la tasa, se empezó de cero y en el 08 se marcó «Indique la referencia 046 del pago ya
realizado» con el nº de documento (13 dígitos) del pago hecho: registró a la primera. Y con el usuario
usando el PC a la vez, un Intro o un clic real se comprueban contra la ventana que está DELANTE antes
de mandarlos (sus clics le devuelven el foco a Word).

**REGLA — la ETIQUETA y las resoluciones se recogen en notifica.jccm.es, y se COMPRUEBAN antes de
subirlas** (2026-10-15, primer caso 2026CEE_64). Tres notificaciones por certificado (Resolución de
Inscripción · EtiquetaCEE · Oficio FEE), todas con la MISMA descripción; cada PDF es un envoltorio
con el documento ADJUNTO dentro. `presentar_cee.js notificaciones` los extrae y no sube nada si no
aparece la referencia catastral del expediente o si son de expedientes distintos de la sede (medido:
la etiqueta de 26RES060_221 se rechaza para 2026CEE_64). Etiqueta → casilla `etiqueta`; las otras dos
→ OTROS. Lo sube el servidor por la misma ruta interna, con los tipos `etiqueta` y `otros`
(`presentacionCeeService.devolver`). ⚠️ En la bandeja el «Detalle» enseña el de la fila pulsada ANTES:
para saber de qué es una notificación, manda la pantalla de acceso, no el Detalle.

**Lo devuelto se sube por las MISMAS funciones** que la página de presentar
(`subidaCeePublica.subirCae|subirCeeDirecto` con el slot `registro`, y la tasa a OTROS como
`{nº} – TASA.pdf`), contado como «Fran (presentación automática)», y cierra el encargo
(`presentacion[fase].registrado_at`) si lo había. `devuelto` sin `--escribir` solo lee el justificante.

**REGLA — lo devuelto lo sube el SERVIDOR, no el PC** (15/10/2026). Subido desde el PC (2026CEE_63 y
_64) no llegó ningún aviso: el «✅ … REGISTRADO» de un CEE directo sale por el WhatsApp del servidor y
por `WHATSAPP_ADMIN_CHAT`/`ADMIN_EMAIL`, que en local no están, y un script no tiene sesión de WhatsApp.
Ahora `devuelto --escribir` llama a `POST /api/{expedientes|cee-directos}/:id/presentacion-cee/devuelto`
([presentacionCeeRutas.js](implementation/backend/routes/presentacionCeeRutas.js), `staffOClaveInterna`,
y en `PUBLIC_EXPEDIENTE_ROUTES` porque el módulo de expedientes es `internalOnly` y lo llama un script)
→ `presentacionCeeService.subirDevueltoInterno`, que comparte con `subirDevuelto` todo menos el token.
Así llegan los mismos avisos que cuando sube el certificador. `--local` hace lo de antes, sin avisos.
Y desde el 25/10/2026, con el CEE INICIAL de un expediente el aviso al cliente y al instalador sale
SOLO, pidiendo solo las fotos que faltan: ver "El aviso de «CEE inicial presentado» pide SOLO lo que falta".
