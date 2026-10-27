---
name: presentar-cee
description: 'PRESENTA un CEE (certificado de eficiencia energética) en el Registro de CASTILLA-LA MANCHA (sede de la JCCM, procedimiento 020264 · SIACI SJM3) sin que el usuario toque el PC: se identifica con su certificado electrónico, rellena el formulario con el borrador de la app, adjunta el PDF firmado, el XML y el .cex, paga la tasa con la tarjeta guardada en Chrome, firma y envía con AutoFirma, y sube a la app el justificante de registro (marca la fase REGISTRADA con la fecha leída) y el recibo de la tasa; después recoge en notifica.jccm.es la ETIQUETA y las resoluciones y las guarda en su sitio. Úsalo con "presenta el CEE de 2026CEE_64", "registra el certificado de 26RES060_221", "presenta los CEE pendientes", "¿qué CEE hay sin registrar?", "descarga la etiqueta de NNN". Lo único que hace el usuario es decir SÍ al pago en el chat y autorizarlo en la app de su banco. Necesita Claude en Chrome, AutoFirma y el certificado en Windows. Solo CLM; nunca presenta lo encargado a otra persona sin preguntar.'
---

# Presentar un CEE en el Registro de la JCCM

Lleva un CEE con el visto bueno dado hasta el **número de registro**, y lo deja guardado en la app. Es
lo que hacía una persona con el popup «📄 Presentar el CEE» delante: aquí lo hace Claude en el Chrome
del usuario, con su certificado.

- **Solo Castilla-La Mancha** (procedimiento 020264 · SIACI SJM3). Fuera de CLM `preparar` lo dice y para.
- **El pago se confirma UNA vez y AL PRINCIPIO, no a mitad** (decisión del usuario, 15/10/2026: «no
  quiero que se pare»). En cuanto pide presentar, y antes de abrir la sede, un mensaje con cada
  expediente, su titular, la tasa y la tarjeta: *«Presento 2026CEE_65 (titular) y pago 16,39 € con la
  Mastercard ••XXXX. ¿Sí?»* (varios: uno por línea, y un sí para la lista). Con ese sí se hace TODO
  seguido, pago incluido, sin volver a preguntar; lo único que queda en manos del usuario es el **3DS
  en la app del banco**: si no lo autoriza, es que no quiere pagar, y se para ahí. Sin ese sí explícito
  (expediente + importe) no se pulsa «Pagar y enviar»: lo exigen las reglas de Claude y el clasificador
  de Claude Code, que bloqueó el pago de 2026CEE_64 con un «sí, presenta» genérico. Nunca se escribe un
  número de tarjeta: se usa la tarjeta **guardada en Chrome**, la que diga el usuario.
- **Solo se presentan los CEE de la CASA** (Fran o el Agente IA): los de un técnico de fuera los
  presenta él; `pendientes` los lista aparte («LOS PRESENTA SU TÉCNICO») y `preparar` da NO LISTO.
- **Lo encargado a otra persona no se presenta sin preguntar**: si lo presentan los dos, se paga
  la tasa dos veces. `pendientes` dice si queda un encargo antiguo sin cerrar.
- **Local = producción**: `devuelto --escribir` sube a Drive y marca REGISTRADO de verdad.
- Todo corre en el PC del usuario: los scripts por la shell (en Cowork, por Desktop Commander, ver
  [comun/entorno.md](comun/entorno.md)) y el navegador por **Claude en Chrome**.

## 0. Antes de nada: el montaje (una vez por PC)

La sede llama a AutoFirma sin decirle con qué certificado firmar, y AutoFirma abre su ventana para
elegirlo, que el navegador no puede pulsar; en el almacén de Windows hay certificados de varias
personas. Se resuelve **fijando el certificado por HUELLA**: antes de cada firma se pega en la página
`certificado.js` (lo deja `preparar`), que añade a la llamada `filters=thumbprint:SHA1:<huella>` +
`headless=true` —los mismos parámetros que usa la librería de la sede— y AutoFirma firma **sin
ventana** con ese certificado y ningún otro. Vale en cualquier PC con AutoFirma y el certificado
personal en Windows: **ya no hace falta Firefox**. Detalle: [referencia/montaje.md](referencia/montaje.md).

```powershell
powershell -ExecutionPolicy Bypass -File implementation\backend\scripts\presentar_cee\comprobar_montaje.ps1 -Titular <APELLIDO1_APELLIDO2>
```

Tiene que acabar en **MONTAJE LISTO**. Si no, para y di qué falta: sin él, la firma no sale sola.

Si el CEE aún no está firmado (no hay `{nº} – CEE INICIAL_fdo.pdf`) y el usuario lo ha dado por válido,
primero `node scripts/firmar_cee.js <nº> --escribir` (ver la skill `generar-cee-inicial`): firma con el
certificado de representante de Brokergy, sin ventanas, en la última página.

## 1. Qué hay que presentar

```bash
cd implementation/backend
node scripts/presentar_cee.js pendientes
```

Mismo criterio que el radar del parte («con tu visto bueno y sin registrar»): fase REVISADO, sin fecha
de registro. Ordenado por **plazo** (un mes desde la firma; pasado el mes hay que volver a emitir el
certificado). Si el usuario pide uno concreto que no sale aquí, dilo antes de seguir.

## 1b. La confirmación (la ÚNICA pregunta)

Con la lista de lo que se va a presentar delante (y después de `preparar`, que dice si está LISTO),
pide el sí del pago tal y como se describe arriba: expediente, titular, 16,39 € (la Tarifa 18.1; si
la sede dice otro importe, se para) y la tarjeta. La tarjeta por defecto es la que el usuario dijo la
última vez (está en la memoria del proyecto, no en esta skill). A partir del sí, no se pregunta nada.

## 2. Prepararlo (solo lee)

```bash
node scripts/presentar_cee.js preparar 2026CEE_64            # --fase final para el CEE final
```

Compone el MISMO borrador del popup y deja en `scratch/presentar-cee/<nº>_<fase>/`:

- `plan.json`: lo que se teclea (por `name` del formulario), los adjuntos con su categoría y los avisos.
- `rellenar.js`: el código que rellena el formulario en la pestaña de la sede.
- `certificado.js`: el que fija el certificado de la firma (se pega antes de CADA firma). La línea
  **«Firma en la sede:»** dice cuál es (nombre, emisor, caducidad). Si no lo encuentra, `⛔` y NO LISTO.
- Los ficheros bajados de Drive **con su nombre ORIGINAL**: la sede pone ella sola el NIF delante
  (con el NIF ya puesto quedan `NIF_NIF_…`).

Lee los **AVISOS**. «Sexo supuesto por el nombre» es normal (decisión del usuario: si la ficha no lo
dice, se supone; fallar no es grave). «Falta en Drive» o «NO LISTO» → para y dilo.

**El REPRESENTANTE (apartado 02) es quien FIRMA el CEE, nunca el AGENTE IA** (26RES060_189,
19/10/2026). Los CEE que hace el Agente IA lo dejan asignado en la barra, pero él no firma: siempre
hay un certificador real detrás. **Si el usuario no dice nada, es Fran** (su ficha de certificador,
la del técnico por defecto de `cee_inicial.js`) y `preparar` lo avisa: «El certificado lo tiene
asignado AGENTE IA, que no firma: en el 02 va FRANCISCO JAVIER MOYA LÓPEZ». Si lo firma otro, se le
pregunta al usuario y se repite con `--certificador <id_empresa | NIF | trozo del nombre>`. Comprueba
la línea **«Representante:»** de la salida: nombre, NIF y la dirección TROCEADA (tipo de vía, nombre,
nº, planta, puerta, CP y municipio), que la sede exige casilla a casilla. Si falta alguna, `preparar`
dice «Faltan datos obligatorios: …REPR…» y NO LISTO: sin ellas la sede no deja «Pagar y enviar» («En
02 Representante: Cumplimente los campos obligatorios»). Un técnico de verdad sin NIF o sin dirección
NO se sustituye por Fran: se completa su ficha en Prescriptores.

**«⛔ CERTIFICADO INCOMPLETO» → NO se presenta, nunca** (26RES060_195, 19/10/2026): `preparar`
valida el XML con `xml2cert` y, si no valida, el PDF lleva la marca de agua «certificado incompleto»
y el Registro lo rechazaría con la tasa ya pagada. Para y díselo al usuario con el motivo. Si avisa
de que no lo ha podido validar en este equipo, **abre el PDF** y mira que no lleve la marca antes de
seguir. Ver [comun/cee-incompleto.md](comun/cee-incompleto.md).

## 3. El vigilante, en segundo plano

```powershell
powershell -ExecutionPolicy Bypass -File implementation\backend\scripts\presentar_cee\vigilante_autofirma.ps1 -Segundos 1800 -Veces 5
```

Lánzalo en segundo plano ANTES de abrir la sede. Es la red de seguridad: **nunca acepta nada**. Con
`certificado.js` puesto, AutoFirma no enseña ninguna ventana; si aun así sale «Diálogo de seguridad del
almacén …», esa llamada iba SIN el filtro (la página se había recargado), y el vigilante la **cancela**
con Escape y escribe `CANCELADO_SIN_FILTRO`. Entonces: vuelve a pegar `certificado.js` y repite esa
firma. Lo normal es que no diga nada.

## 4. Abrir la sede e identificarse

0. **Sesión limpia.** La sede guarda la solicitud en la cookie `PHPSESSID` y, sin cerrar Chrome, al
   volver enseña la ANTERIOR ya registrada (pasó con 26RES060_221: salió el resultado de 2026CEE_64).
   Si al abrir aparece «Este es el número de registro…» de otra, NO toques nada: borra la cookie desde
   la página y vuelve a entrar:
   `for (const p of ['/','/administracion_electronica','/administracion_electronica/formularios','/administracion_electronica/formularios/']) { document.cookie='PHPSESSID=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path='+p; document.cookie='PHPSESSID=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path='+p+'; domain=.jccm.es'; }`
   Y lo mismo al TERMINAR cada solicitud, antes de cerrar la pestaña.
1. En UN `browser_batch` de Claude en Chrome: `navigate` a
   `http://www.jccm.es/administracion_electronica/formularios/SJM3.phtml?SER_ID=JM3&PROC=JM3&FIRMA=S` y,
   a continuación, `javascript_tool` con el contenido de `certificado.js` (tiene que devolver `OK:
   certificado fijado…`). Va en el mismo lote porque la página «Validando componentes» lanza la **firma
   de identificación** a los 3 s de cargar (`setTimeout(firmarTextoB64, 3000)`): con el filtro puesto,
   AutoFirma firma sola y la sede entra. Si el vigilante dice `CANCELADO_SIN_FILTRO` (el filtro llegó
   tarde), la página enseña «No se ha podido iniciar la sesión»: pega otra vez `certificado.js` y
   ejecuta `firmarTextoB64()` en la página.
2. Si sale **«Realizar Solicitud»**, púlsalo (en 2026CEE_64 el formulario se abrió directamente, sin él). Si salta un `alert` («Si va a presentar más de una solicitud…»): la
   página se queda congelada (ni capturas ni JavaScript) hasta aceptarlo, y la extensión no llega:
   ```powershell
   powershell -ExecutionPolicy Bypass -File implementation\backend\scripts\presentar_cee\escritorio.ps1 aviso
   ```
3. Marca **«Es representante»** (debajo del apartado 01). **Recarga la página.** Sin ella, la sede pone
   de SOLICITANTE a quien se ha identificado; con ella, el solicitante es el titular (editable) y quien
   presenta queda de REPRESENTANTE, que es como lo plantea el borrador.

## 5. Rellenar

1. Pega el contenido de `rellenar.js` en `javascript_tool` de la pestaña. Devuelve `OK: rellenado` o
   `REVISAR: …` (un campo que no existe, una opción que no encuentra, `NO TOMA` un valor que la casilla
   no ha aceptado o `VACÍO` la provincia/municipio del representante): resuélvelo antes de seguir.
   Escribe también el 02 por casillas: `REP_TIPVIA_VIVIENDA`, `DOMICILIOREPR`, `NUMCALLEREP`,
   `PLANTAREP`, `PUERTAREP`, `CODPOSREPR`, `BLANDREPR`/`ORT01REPR`, `TMOVILREPR`, `EMAILREPR`, `SEXOREPR`.
2. Comprueba por JavaScript que tras las recargas sigue todo (nombre del solicitante, «Es
   representante» marcado, municipios, fechas, Unifamiliar…). Las recargas de la sede conservan lo
   escrito, pero se comprueba.

Valores fijos que pone `rellenar.js`: trámite **edificio existente**, ámbito **Inscripción**, declaración
**marcada**, «Me opongo a la consulta de datos» **sin marcar**, documentos 1–4 **marcados** y el
**Anexo V NO** (decisión del usuario: ni se marca ni se sube).

## 6. Adjuntar (cuatro veces)

Para cada entrada de `plan.adjuntos`, en este orden:
1. `jQuery('[name=CATEGORIA_DOCUMENTO]').val('<categoria>').trigger('change')`.
2. `find` del input de fichero («Documento») → `file_upload` con la ruta del plan.
3. `document.getElementsByName('ADJUNTAR')[0].click()` (recarga) y comprueba que aparece en «ANEXAR
   DOCUMENTOS». El clic de la extensión sobre ese botón a veces no lo envía (el fichero sigue elegido
   y no se adjunta): el `click()` desde la página es lo fiable.

**Justo ANTES del XML, la referencia catastral**, a mano: clic real en el campo «Referencia catastral»,
**teclea** la referencia (`computer type`) y clic real en **«Añadir Referencia»** (recarga). La sede valida
el XML contra las referencias AÑADIDAS; sin esto rechaza el XML («No ha pulsado el botón 'Añadir
Referencia' o ninguna… coincide con las del XML»). Por eso `rellenar.js` no la escribe: puesta por
JavaScript, o añadida antes de otros adjuntos, sale en la lista pero la sede no la cuenta (2026CEE_64:
hubo que quitarla con «Eliminar» + «Quitar marcado/s» y volver a teclearla). Si aun así rechaza el XML,
repite: quitar, teclear, añadir y subir el XML enseguida.

| Categoría | Qué |
|---|---|
| 3926 | PDF del certificado firmado |
| 3927 | Recomendaciones de mejora → el MISMO PDF firmado si no hay informe aparte (van en su Anexo III) |
| 3928 | XML |
| 3929 | .cex |

Para quitar uno: marca su casilla y «Quitar documento».

## 7. Pagar — con el sí que se pidió al principio

No se vuelve a preguntar. Solo se para si el importe del apartado 08 NO es el que se confirmó (entonces
sí: dilo y pregunta), o si la tarjeta confirmada no está en el desplegable de Chrome.

1. Marca **«Acceso a la pasarela de pago de tasas»** y pulsa **«Pagar y enviar»** → `alert` («Vas a ser
   redirigido…») → `escritorio.ps1 aviso`. Se abre otra pestaña, `plataformapagos.jccm.es`.
2. **«Pago de documentos sin identificación»** → **«Pago con Tarjeta»** → pasarela de Redsys. Apunta el
   **número de documento 046** (13 dígitos, empieza por `046`): es la referencia que pide la sede.
3. La tarjeta: el desplegable de Chrome NO se abre con el clic de la extensión. Con el ratón real:
   - `escritorio.ps1 frente -Ventana 'Pantalla de pago Redsys'` y `escritorio.ps1 captura -Salida …\pago.png -Zona "500,100,1000,650"` (la zona, entre comillas) y localiza «Número de tarjeta»
     en píxeles de pantalla (la franja «Claude empezó a depurar…» mueve la página ~55 px: mide sobre
     una captura recién hecha).
   - `escritorio.ps1 clic -X … -Y …` en el campo → captura → `clic` sobre la tarjeta elegida en el
     desplegable. Chrome rellena número, caducidad y CVV. **No repitas esos datos en el chat.**
4. **«Pagar»** → 3DS del banco: dile al usuario *«autoriza el pago en la app de tu banco»* y espera
   (la página cambia sola a «Ticket de pago» con «OPERACIÓN AUTORIZADA CON CÓDIGO …»).
5. **«Continuar»** → plataforma: «El proceso de pago se ha realizado con éxito. Estado: Pagado». Pulsa el
   **icono de descarga** junto a «Obtener justificante de pago» (baja `Descargas\<nº 046>.pdf`) y luego
   **«Continuar»**: la pestaña se cierra y se vuelve al formulario. Si tras la descarga «Continuar» no hace
   nada (pasó en 2026CEE_64), `scroll_to` al botón y púlsalo otra vez.

## 8. Enviar

1. De vuelta, la sede marca «Indique la referencia 046 del pago ya realizado» con la casilla VACÍA:
   escribe ahí el nº de documento 046 (`REFERENCIA_PAGO`, máx. 13).
2. Pega `certificado.js` (después de la última recarga: ya escrita la 046) y comprueba el `OK`.
   **«Enviar»** → `alert` «Se van a firmar los datos del formulario» → `escritorio.ps1 aviso` →
   AutoFirma firma sola, sin ventana. Si el vigilante dice `CANCELADO_SIN_FILTRO`, acepta el aviso de
   error, pega `certificado.js` y pulsa «Enviar» otra vez (la 046 ya está pagada: no se vuelve a pagar).
3. Página de resultado: **«Este es el número de registro NNNNNNN/AAAA solicitado el … a las …»**.
   Pulsa el **icono PDF** de «Descargar PDF solicitud» → `Descargas\NNNNNNN.pdf`: es el justificante.
   Debajo sale «SOAP:Server: Server Error» y los «Id. de firma» de los adjuntos vacíos: pasó en los dos
   primeros (2026CEE_63 y _64) con el registro y la firma bien. Dilo, y que el usuario compruebe en el
   correo de la JCCM que la copia trae los cuatro documentos.
4. Cierra la pestaña (la sede pide cerrar el navegador entre solicitudes; para la siguiente, pestaña nueva).

## 9. Guardarlo en la app

```bash
node scripts/presentar_cee.js devuelto 2026CEE_64 --registro "C:\Users\Usuario\Downloads\NNNNNNN.pdf" --tasa "C:\Users\Usuario\Downloads\<nº 046>.pdf"
# en seco: dice la fecha y el nº que lee del justificante. Si cuadran:
node scripts/presentar_cee.js devuelto 2026CEE_64 --registro … --tasa … --escribir
```

Lo sube el **servidor de producción** (ruta interna `POST /:id/presentacion-cee/devuelto` de expedientes o
cee-directos, con la clave interna del `.env`), por las mismas funciones que la página de presentar: el
justificante va a la casilla **registro** (lee la fecha, marca REGISTRADO, avanza el estado, en un CEE
directo dispara la entrega si está cobrado) y la tasa a OTROS como `{nº} – TASA.pdf`. Cierra el encargo de
presentación si lo había. En el historial figura «Fran (presentación automática)». Como corre en el
servidor que tiene el WhatsApp, **llegan los mismos avisos que cuando sube el justificante el
certificador**. `--local` lo hace desde el PC, sin avisos (solo si el servidor no responde).

**El CEE INICIAL de un expediente avisa SOLO al cliente y al instalador** (desde el 25/10/2026): con
`--escribir`, el servidor les manda el «CEE inicial presentado» pidiendo SOLO las fotos que faltan de la
obra (la salida dice `AVISO (servidor): …` a quién ha llegado). **No lo mandes tú otra vez** ni ofrezcas
mandarlo; si dice que no ha salido, se reenvía desde el módulo CEE de la app. El CEE final y los CEE
directos siguen como siempre.

## 10. Después: la etiqueta y las resoluciones (notifica.jccm.es)

Horas después del registro llega a Gmail el aviso de que se ha emitido. La JCCM lo deja en
`https://notifica.jccm.es/notifica/` («Mis notificaciones»): **tres notificaciones por certificado**,
todas «SJM3 · Resolución de Concesión Favorable», y las del último presentado son **las 3 más
recientes**. Por orden: Resolución de Inscripción · **EtiquetaCEE** · Oficio FEE.

1. Entrar: si ya hay sesión, va directo a la bandeja; si no, Cl@ve → «DNIe / Certificado electrónico»
   (si sale el selector de certificados de Chrome, elegir el de quien presenta y comprobarlo en la
   captura ANTES de aceptar).
2. Los botones de cada fila (`form1:data:N:_idJsp29` = Detalle, `_idJsp31` = **Acceso**) se pulsan con
   `document.getElementsByName(...)[0].click()` desde la página; el clic de la extensión no los envía.
   ⚠️ El «Detalle» va UN PASO POR DETRÁS (enseña el de la fila pulsada antes): para saber de qué
   expediente es una notificación, fíate de la pantalla de ACCESO, no del Detalle.
3. **Acceso** → `firma.jsp` («Va a ser objeto de una notificación…») → **Continuar** (consentir: deja
   constancia del acceso con fecha y hora; no pidió AutoFirma) → «Detalle del Acuse de Recibo» →
   **Descargar**, con el clic de la EXTENSIÓN (el de la página no siempre dispara la descarga y a
   veces baja dos copias). Si la ventana de Chrome está detrás de otras, la página no avanza: tráela
   con `escritorio.ps1 frente -Ventana 'Plataforma de Notificaciones'`.
   ⚠️ **La descarga tras «Acceso» también puede ir UN PASO POR DETRÁS** (2026CEE_66, 25/10/2026): se
   abrió el Acceso de una fila de OTRO expediente sin consentir, se volvió y se abrió el nuestro
   (2919850 en `firma.jsp`), y «Descargar» bajó la resolución del anterior (2919715). Además, en «Mis
   notificaciones» las ya leídas DESAPARECEN y las filas se corren: el `data:N` de antes ya no es el
   mismo. **La fuente fiable es el «Histórico de notificaciones»**: cada fila (las leídas, la más
   reciente arriba) tiene «Descargar documento asociado a la notificación» (`form1:data:N:_idJsp36`,
   con el clic de la EXTENSIÓN) y baja el documento de ESA fila. Lo práctico: dar el Acceso a las tres
   (eso deja el acuse) y bajar los tres documentos desde el Histórico; el script del paso 4 dice de
   qué expediente es cada uno.
4. Cada PDF descargado (`T2024_Resolucion_de_Inscripcion (n).pdf`, `EtiquetaCEE (n).pdf`,
   `T2024_Oficio_FEE (n).pdf`) es un ENVOLTORIO con el documento de verdad ADJUNTO dentro. Lo resuelve
   el script:
   ```bash
   node scripts/presentar_cee.js notificaciones 2026CEE_64 --resolucion "…\T2024_Resolucion_de_Inscripcion (32).pdf" --etiqueta "…\EtiquetaCEE (35).pdf" --oficio "…\T2024_Oficio_FEE (34).pdf"
   # en seco: extrae, y comprueba que los tres son de ESE certificado (su referencia catastral) y del
   # mismo expediente de la sede. Si no, no sube nada. Después, con --escribir:
   ```
   La etiqueta va a su casilla (`_etq.pdf`) y las dos resoluciones a OTROS como
   `{nº} – RESOLUCIÓN DE INSCRIPCIÓN.pdf` y `{nº} – OFICIO FEE.pdf`. Lo sube el servidor (como el
   registro); `--local` desde el PC.

## Informe final

Una tabla corta: nº de registro y fecha, tasa (importe, nº 046, código de autorización), adjuntos, qué
se ha guardado en la app y el estado en que queda. Y lo que hay que mirar (un SOAP Error, el sexo
supuesto, un aviso de `preparar`). Nunca datos de la tarjeta.

## Lo que se aprendió presentando 2026CEE_63, _64 y 26RES060_221 (15/10/2026)

| Pasa esto | Por eso |
|---|---|
| La página no responde a capturas ni a JS | Hay un `alert()` abierto → `escritorio.ps1 aviso` |
| El solicitante sale con el nombre de quien presenta | Falta «Es representante» |
| La sede no lista el XML adjuntado | Falta «Añadir Referencia», o se hizo por JavaScript o antes de otros adjuntos: quítala, tecléala y añádela con clics reales justo antes del XML |
| «Adjuntar documento» no adjunta (el fichero sigue elegido) | Clic de la extensión perdido: `getElementsByName('ADJUNTAR')[0].click()` |
| No sale «Realizar Solicitud» | A veces el formulario se abre directo tras la identificación |
| Adjuntos `NIF_NIF_…` | Se subieron con el NIF ya puesto: súbelos con el nombre original |
| Sale la ventana de AutoFirma con varios certificados | La llamada iba sin `certificado.js` (recarga, o la identificación se disparó antes): el vigilante la cancela; pégalo y repite. Nunca se elige a ojo ni con Intro (27/10/2026: el montaje de Firefox se sustituyó por la huella) |
| AutoFirma: «no hay certificados» / error al firmar con el filtro puesto | La huella no está en el almacén que usa AutoFirma: `comprobar_montaje.ps1`. Con el montaje viejo (preferencia «usar también desde el navegador» con Firefox) el certificado tiene que estar también en Firefox, o se desmarca la preferencia |
| La tarjeta no se queda en el campo | Se eligió con teclas de la extensión: usa el ratón real |
| Tras pagar, «referencia 046» vacía | Normal: se escribe a mano el nº de documento 046 |
| Al abrir la sede sale el registro de OTRA solicitud | Sesión vieja: borrar `PHPSESSID` (paso 4.0) y volver a entrar |
| `escritorio.ps1 aviso` dice `SIN_VENTANA` y la página no responde | El `alert` está en una pestaña de FONDO (el usuario usa Chrome): captura la pantalla, clic real en la pestaña de la sede y entonces `aviso`. Nunca Intro a ciegas: iría a la pestaña que esté delante |
| «La Fecha de emisión del certificado no coincide con la del xml» | La sede compara con `<FechaGeneracion>` del XML; `preparar` ya declara esa y lo avisa. Si aun así falla (la calificación y la generación son de días distintos), **se para**: el usuario regenera el CEE en CE3X con la fecha buena, firma de nuevo el PDF y sube XML/PDF/.cex (decisión del usuario, 15/10/2026); después `preparar` otra vez y se adjunta lo nuevo |
| «SIN OPCION ORT01=LA SOLANA» | La sede escribe «Solana (La)»: `rellenar.js` ya prueba las dos formas |
| Al volver del pago, la sede dice «Confirmar reenvío del formulario» (ERR_CACHE_MISS) | Chrome DESCARTÓ la pestaña de la sede mientras estaba detrás (26RES060_217, 19/10/2026: cambió de `tabId` durante el 3DS) y la solicitud se pierde. **No se reenvía** (repetiría «Pagar y enviar» y otra 046). Se baja el justificante de la tasa, se empieza de cero (sesión limpia, identificarse, rellenar, adjuntar) y en el 08 se marca **«Indique la referencia 046 del pago ya realizado»** con el nº de documento 046 ya pagado, sin volver a la pasarela (idea del usuario) |
| Al pulsar «Enviar» (ya pagado), «No se han podido firmar los datos del formulario» aunque el vigilante dice `ACEPTADO` | El registro de AutoFirma (`%USERPROFILE%\.afirma\AUTOFIRMA.afirma.log.xml`) dice `"page" is null`: la sede le pasa un documento vacío y la solicitud ya no se arregla reintentando (26RES060_216, 24/10/2026: tres intentos iguales). **No es nuestro PDF** (era igual que el del 238, que registró). Se acepta el aviso, se borra `PHPSESSID`, se cierra la pestaña y se empieza una solicitud NUEVA (identificarse, «Es representante», rellenar, adjuntar, referencia catastral, XML) con «Indique la referencia 046 del pago ya realizado» y el nº 046 ya pagado: registró a la primera (4285110/2026). Si quedó un `javaw` de AutoFirma vivo, se cierra antes |
| Al entrar, la sede entera lleva a `mantenimiento.castillalamancha.es/MttoJCCM` (24/10/2026, varias horas) | No se toca nada: no hay solicitud ni pago. Un bucle con `curl -L` cada 5 min a la URL del paso 4.1 avisa cuando deja de redirigir allí (vuelve a `ventanillaelectronica.jccm.es/…/identificacion.phtml`) |
| El `alert` o la tarjeta, con el usuario usando el PC | Sus clics devuelven el foco a su ventana: un Intro o un clic «real» caería en ella. Antes de cada tecla o clic real, traer Chrome delante (pulsación de Alt + `SetForegroundWindow`) y COMPROBAR que la ventana de delante es la de la sede/Redsys; esperar a que lleve unos segundos sin tocar el teclado (`GetLastInputInfo`). Si sigue trabajando, pedirle que suelte el PC un minuto |
| «En 02 Representante: Cumplimente los campos obligatorios» al pagar | El 02 iba vacío porque el asignado era el AGENTE IA (26RES060_189). `preparar` ya pone a Fran (o `--certificador`): vuelve a prepararlo y pega el `rellenar.js` nuevo |

Detalle y porqué: `docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/presentarlo-sin-tocar-el-pc-skill-presentar-cee.md`.
