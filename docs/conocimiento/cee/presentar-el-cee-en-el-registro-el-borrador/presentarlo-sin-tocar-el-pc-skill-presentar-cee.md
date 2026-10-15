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

**REGLA — tras escribir la referencia catastral se pulsa «Añadir Referencia».** La sede valida el XML
contra las referencias AÑADIDAS a la lista, no contra la casilla: sin el botón, el XML se rechaza
(«No ha pulsado el botón 'Añadir Referencia' o ninguna de las referencias… coincide con las del XML»).
Y se TECLEA y se pulsa con clics reales **justo antes de subir el XML**: en 2026CEE_64, escrita por
JavaScript y añadida antes de los dos PDF, salía en la lista pero la sede rechazó el XML dos veces; quitada
y vuelta a teclear justo antes, entró a la primera. Por eso `rellenar.js` ya no la escribe.

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

**Lo devuelto se sube por las MISMAS funciones** que la página de presentar
(`subidaCeePublica.subirCae|subirCeeDirecto` con el slot `registro`, y la tasa a OTROS como
`{nº} – TASA.pdf`), contado como «Fran (presentación automática)», y cierra el encargo
(`presentacion[fase].registrado_at`) si lo había. `devuelto` sin `--escribir` solo lee el justificante.
