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
| Firmar sin pulsar | `certificado.js` (identificarse) y `enviar.js` (enviar), los deja `preparar`; `presentar_cee.js certificado` para probar · [vigilante_autofirma.ps1](implementation/backend/scripts/presentar_cee/vigilante_autofirma.ps1) de red · [referencia/montaje.md](skills/presentar-cee/referencia/montaje.md) |
| Avisos `alert()` (por accesibilidad), pestaña activa, tarjeta guardada | [escritorio.ps1](implementation/backend/scripts/presentar_cee/escritorio.ps1) (`aviso` · `leer` · `pestana` · `frente` · `captura` · `clic`) |
| ¿Está bien montado? | [comprobar_montaje.ps1](implementation/backend/scripts/presentar_cee/comprobar_montaje.ps1) |

**REGLA — la firma se automatiza FIJANDO el certificado por HUELLA, nunca pulsando a ciegas**
(2026-10-27, Fran: «por evitar complicar con Firefox, para poder usarlo en otro PC»). AutoFirma enseña
su ventana de elección salvo que la llamada lleve `headless`, y la JCCM no lo pone. En el almacén de
Windows de este PC hay certificados de varias personas (y de Fran, el personal y el de representante):
un Intro a ciegas podría firmar con el de otro. Ahora, antes de cada firma, se pega en la página
`certificado.js` (`presentar_cee.js preparar`), que añade a la llamada de MiniApplet
`filters=thumbprint:SHA1:<huella del certificado PERSONAL de quien presenta>` + `headless=true`: son los
parámetros que usa la propia librería de la sede para su «firmante fijo», y la AutoFirma 1.9 los
entiende (`CertFilterManager`: `headless` → `mandatoryCertificate`). Con un certificado que pase el
filtro firma sin ventana; con ninguno, error. El vigilante ya no acepta nada: si sale la ventana es que
la llamada iba sin filtro, y la cancela. El montaje anterior —el certificado aislado en el almacén de
**Firefox** y un Intro si el título decía NSS (15/10/2026)— queda descrito en `montaje.md`: funcionaba
solo en un PC montado así.

**REGLA — la solicitud se ENVÍA con `enviar.js`, nunca con el botón «Enviar»** (2026-10-27,
2026CEE_59, registro 4314318/2026, primer CEE presentado en el PC nuevo). `certificado.js` bastaba para
identificarse, pero no para enviar: al pulsar «Enviar» la sede manda el formulario y la página que
DEVUELVE —la que trae el XML a firmar en `#xml`— llama nada más cargarse a `firmarDatosMA()` (aviso «Se
van a firmar los datos…» + `MiniApplet.sign`). El filtro pegado antes se pierde con esa recarga, AutoFirma
abre su ventana, el vigilante la cancela y la sede dice «No se han podido firmar los datos del
formulario» (tres veces seguidas ese día). Llamar a `firmarDatos()` a mano tampoco vale (es el camino
viejo del applet: avisa y reenvía sin firmar). `enviar.js` hace el mismo envío —`requestSubmit` del botón
ENVIAR, con la codificación windows-1252 de la página: un `fetch` habría mandado las tildes en UTF-8— pero
con `target` a un marco de la misma página, y un `setInterval` de 1 ms en la página fija el certificado en
la `MiniApplet` del marco en cuanto existe: entre la carga de `miniapplet.js` y la llamada de la página
hay otros tres scripts, tiempo de sobra. El resultado (nº de registro, enlace `creaPDF_Tramita_idSol.php`
del justificante) queda en el marco: `__resultadoEnvio()` y `__bajarJustificante()`. Probado también
contra una imitación local de la sede (tildes bien, la firma lleva `filters=thumbprint…` y `headless`).

**REGLA — los avisos `alert()` se aceptan por la ACCESIBILIDAD de Windows, sin foco ni teclas**
(2026-10-27). En el PC nuevo, con la app de Claude delante, `SetForegroundWindow` no traía Chrome y el
Intro de `escritorio.ps1 aviso` caía en la app. Ahora `aviso` activa la pestaña por su título
(SelectionItem de la barra de pestañas: Chrome solo enseña el aviso de la pestaña ACTIVA), busca el
botón «Aceptar» del cuadro por UI Automation, lo pulsa (Invoke) y dice el texto; `leer` lo dice sin
pulsar. Para los clics reales (la tarjeta de Redsys), `frente` pulsa Alt antes de `SetForegroundWindow`
—sin ella Windows no cede el primer plano— y comprueba qué ventana quedó delante (`NO_DELANTE` = no se
manda nada). Medido: con Alt, Chrome pasa delante; sin él, no.

**Primera presentación SIN tocar el PC: 26RES080_96** (27/10/2026, registro 4315701/2026, tasa 046
0466080819145): identificación, avisos, tarjeta y envío los hizo Claude; Fran solo autorizó el pago
en la app del banco. Tres cosas medidas ese día: (a) `escritorio.ps1` tiene que ser DPI-aware —con
Windows al 125 %, la captura salía en píxeles reales recortados y el clic en escalados, y caía fuera
del campo de la tarjeta—; (b) la pulsación de Alt de `frente` CIERRA el desplegable de tarjetas, así
que entre abrirlo y elegir no va ningún `frente`, y la tarjeta se elige por sus 4 últimos dígitos (en
este PC hay dos y la de Fran salía segunda); (c) «Continuar» de la plataforma de pagos no volvió a la
sede porque la pestaña del pago no tenía `window.opener`: se quitó el velo `SPINNER` de la sede y se
puso la 046 en «Indique la referencia 046 del pago ya realizado», sin volver a pagar.

**REGLA — la fecha de VISITA también es la del XML** (2026-10-27, 2026CEE_59). La sede compara la del
formulario con la `<Fecha>` de `<Visita>` del XML («La Fecha visita del xml no coincide con la fecha
visita técnico certificador introducida en el formulario»): la app decía 25/10 y el certificado 27/10.
`preparar` declara la del XML y avisa, como con la de emisión.

**REGLA — «Es representante» se marca ANTES de rellenar.** Identificado con certificado, la sede pone
de SOLICITANTE a quien se identifica, con su NIF fijo. La casilla «Es representante» (bajo el apartado
01) recarga la página: el solicitante pasa a ser editable —el titular, como dice el borrador— y quien
presenta queda en el 02. La recarga la hace la propia casilla (`RecargarPagina_PFISICA`): recargar a
mano con `location.href` devuelve a la identificación (27/10/2026).

**REGLA — un titular con CIF va como «Persona jurídica», con su razón social.** Con «Es representante»
marcado, el 01 ofrece dos bloques: persona física (`TIPODOC=NIF`, `NIFCIF`, `NOMBRE`, `APELL1`,
`APELL2`, `SEXO`) y persona jurídica (`TIPODOC=CIF`, que habilita `CIF` y `ZENTIDAD` = razón social; sin
apellidos ni sexo). `preparar` lo decide por la forma del NIF (letra de sociedad + 7 dígitos + control) y
pone `TIPODOC` el primero en `rellenar.js`, porque su clic habilita las otras dos casillas. Antes la
razón social se partía en nombre y «apellidos» inventados y el plan daba NO LISTO por falta de APELL1
(26RES060_215, 28/10/2026: la ficha decía «EDIFICIO ELENA OSORIO 11 BELMONTE»; la sociedad real,
JCRSPORT GOALKEEPER S.L., estaba en el proyecto, pág. 7, «Agentes promotores»). La razón social sale de
la ficha del cliente (nombre + apellidos juntos): si no es la de la escritura, se corrige la ficha.

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
(desde el 27/10/2026, `enviar.js`) → `alert` «Se van a firmar los datos» → firma 2 → «número de registro
NNNNNNN/AAAA» → icono PDF → `NNNNNNN.pdf`. Mientras hay un `alert()` abierto la página no responde a la
extensión (ni capturas ni JavaScript): se acepta con `escritorio.ps1 aviso`.

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

**El mismo camino vale cuando la FIRMA del envío falla una y otra vez** (24/10/2026, 26RES060_216,
registro 4285110/2026). Con la tasa ya pagada (046 0466080779071), «Enviar» acabó tres veces en «No se
han podido firmar los datos del formulario», aunque el vigilante aceptaba el diálogo NSS. El registro
de AutoFirma (`%USERPROFILE%\.afirma\AUTOFIRMA.afirma.log.xml`) decía `NullPointerException … "page" is
null`: el documento que la sede le daba a firmar venía vacío. No era nuestro PDF firmado —sus campos
de firma y sus páginas eran iguales a los del 238 y el 2026CEE_61, presentados esa misma mañana— y
poner el nombre en mayúsculas tampoco lo cambió. Una solicitud NUEVA (sesión limpia, todo otra vez y la
referencia 046 del pago ya hecho) registró a la primera. Ese día la sede había pasado horas en
mantenimiento (la ENTRADA misma redirigía a `MttoJCCM`); puede que tuviera que ver.

**REGLA — si «Pagar y enviar» lleva a `mantenimiento.castillalamancha.es/MttoJCCM`, la pasarela está en
MANTENIMIENTO: no se envía nada y se reintenta más tarde** (23/10/2026, 26RES060_245). En vez de
`plataformapagos.jccm.es` se abrió una pestaña con el aviso de Chrome «El formulario no es seguro»
(http) hacia esa dirección, y la sede se quedó en «Procesando pago de tasas en otra pestaña». La página
de destino dice «WEB TEMPORALMENTE en MANTENIMIENTO»; diez minutos antes se había pagado y registrado
26RES060_224 sin problema. **«Enviar de todos modos» no se pulsa** (no hay pasarela detrás y es saltarse
un aviso de seguridad): se cierra esa pestaña, se borra la sesión de la sede (`PHPSESSID`), se cierra la
pestaña de la sede y se para el vigilante. No se ha llegado a Redsys, así que no hay nada cobrado ni 046:
el reintento empieza de cero (identificarse, rellenar, adjuntar).

**REGLA — la ETIQUETA y las resoluciones se recogen en notifica.jccm.es, y se COMPRUEBAN antes de
subirlas** (2026-10-15, primer caso 2026CEE_64). Tres notificaciones por certificado (Resolución de
Inscripción · EtiquetaCEE · Oficio FEE), todas con la MISMA descripción; cada PDF es un envoltorio
con el documento ADJUNTO dentro. `presentar_cee.js notificaciones` los extrae y no sube nada si no
aparece la referencia catastral del expediente o si son de expedientes distintos de la sede (medido:
la etiqueta de 26RES060_221 se rechaza para 2026CEE_64). Etiqueta → casilla `etiqueta`; las otras dos
→ OTROS. Lo sube el servidor por la misma ruta interna, con los tipos `etiqueta` y `otros`
(`presentacionCeeService.devolver`). ⚠️ En la bandeja el «Detalle» enseña el de la fila pulsada ANTES:
para saber de qué es una notificación, manda la pantalla de acceso, no el Detalle.

**REGLA — los documentos de notifica se bajan del «Histórico de notificaciones», no tras el
«Acceso»** (2026-10-25, 2026CEE_66). La descarga que sale tras Acceso → `firma.jsp` → Continuar
también puede ir UN PASO POR DETRÁS: se abrió el Acceso de una notificación de otro expediente sin
consentir, se volvió y se abrió la nuestra (`firma.jsp` decía 2919850) y «Descargar» bajó la
resolución del anterior (2919715, expediente 2026/351120); el script la rechazó por la referencia
catastral. Además, en «Mis notificaciones» las ya leídas DESAPARECEN y las filas se corren, así que el
`form1:data:N` de hace un momento ya no es la misma fila. La fuente fiable es el **Histórico**
(`UsuarioNotificaciones.jsp`): cada fila tiene Detalle (`_idJsp32`), acuse en PDF (`_idJsp34`) y
«Descargar documento asociado a la notificación» (`_idJsp36`, con el clic de la extensión), que baja
el documento de ESA fila. Lo práctico: dar el Acceso a las tres (deja el acuse con fecha y hora) y bajar
los tres documentos desde el Histórico; `notificaciones` en seco sigue siendo la comprobación final.

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
