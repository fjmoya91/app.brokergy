<!-- conocimiento · área: firma · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La firma A MANO se hace CON EL MÓVIL (2026-09-06)

"Firma a mano" pedía impresora y escáner para devolver dos folios, y el cliente que no
tenía las dos cosas se quedaba parado sin decirlo. Ahora, en `/firmar-anexos`, esa opción
abre un ASISTENTE: lee los anexos, los firma con el dedo y manda la foto del DNI. Sin
papel. La vía de siempre sigue viva —hay quien ya lo tiene firmado— como tercera opción,
**"Ya lo tengo firmado en papel"**.

El recorrido es el que se haría con los papeles delante, y en ese orden:

```
preparar → [leer · firmar · revisar] × documento → DNI delante → DNI detrás → enviar
   (Convenio de Cesión primero, Anexo I después)
```

| Qué | Dónde |
|---|---|
| El asistente (pasos, visor, DNI, envío) | [AsistenteFirmaManuscrita.jsx](implementation/frontend/src/features/firma/AsistenteFirmaManuscrita.jsx) |
| La hoja donde se firma | [SignaturePad.jsx](implementation/frontend/src/features/firma/SignaturePad.jsx) |
| La tinta | [ink.js](implementation/frontend/src/features/firma/ink.js) — **port literal de ScannerApp** |
| Estampar + "aspecto escaneado" | [escaneado.js](implementation/frontend/src/features/firma/escaneado.js) |
| Dónde cae la firma | `SIGN_BOXES` — la MISMA fuente que usa Autofirma |
| Recepción (sin cambios de fondo) | `POST /api/public/anexos-upload/:id`, que ya anexa los dos DNI |

**REGLA — la tinta es un PORT de ScannerApp, no una reinterpretación.** `ink.js` es
`ScannerApp/src/renderer/lib/ink.ts` traducido a JS y nada más: la física del trazo
(adelgaza con la velocidad, grano del papel, empastado en las esquinas, plumín plano) está
depurada allí contra firmas reales. Si se corrige algo, se corrige **en ScannerApp y se
vuelve a portar**; parchear esta copia por su cuenta hace que la firma de la app y la de
ScannerApp dejen de parecer la misma mano. Aquí va fija en **PLUMA** y trazo **MEDIO**: al
cliente no se le pregunta con qué firma —elegir entre tres plumas no le aporta nada y es
una pantalla más antes de la única que importa.

**REGLA — se LEE antes de firmar, y hay que llegar a la última página.** El convenio dice
"habiendo leído por sí mismos y hallándose conformes": un botón de firmar activo desde el
primer instante convierte esa frase en mentira, y es lo único que separa esto de un clic de
aceptación.

**REGLA — el documento se lee A PANTALLA COMPLETA** ([LectorDocumento.jsx](implementation/frontend/src/features/firma/LectorDocumento.jsx),
portaleado). Encajado en la tarjeta era un A4 dentro de una caja de 520 px dentro de una
página con márgenes: en un móvil el cuerpo del texto quedaba a unos 6 px — se veía que había
un documento, pero no se leía, y leerlo es justo lo que se le está pidiendo. Lleva **zoom**
(100 / 160 / 220 %, con desplazamiento lateral), porque a ancho completo un A4 entra entero
en la pantalla pero con la letra ilegible. El lienzo se recorta a 4 MPx: un A4 al 220 % en
una pantalla densa pide 11 MPx (44 MB) y un móvil modesto cierra la pestaña.

⚠️ **pdf.js puede quedarse colgado SIN dar error, y hay que ponerle plazo.** Crea su worker
con `type: "module"`; si el navegador no lo arranca pero tampoco lanza un error, la promesa
no resuelve NUNCA — no hay plazo interno ni fallback. Se ve como una hoja en blanco eterna,
sin aviso, que es lo que peor se explica por teléfono (medido en un Android real, con el
mismo enlace funcionando en el ordenador). El lector espera `PLAZO_MS` (15 s) y, si no hay
documento, enseña la salida: **"Abrir el documento"** con el visor propio del teléfono, y
solo entonces un "Ya lo he leído" que desbloquea la firma. El motivo técnico se imprime en
pequeño: sin él, un fallo en el móvil de un cliente no se puede diagnosticar.

**REGLA — el documento sale RASTERIZADO, y eso es lo que se quiere.** Un PDF con texto
seleccionable y una firma pegada encima no se parece a lo que se venía recibiendo (un
escaneo) y delata que el papel nunca existió. Rasterizado a 150 DPI / JPEG 0,85 es
indistinguible de imprimir, firmar y escanear — que es exactamente lo que ha pasado, sin el
papel. Lo hace el NAVEGADOR (pdf.js, que ya está en el bundle para el visor de Autofirma, +
jsPDF): no hay Python delante del cliente, y de paso sale gratis lo que en ScannerApp son
dos operaciones — si la página se convierte en imagen, la firma se pinta sobre el píxel y
no hay que incrustar nada en el PDF.

**REGLA — el GROSOR del trazo lo fija el DOCUMENTO, no la pantalla.** La firma se
estampa al ancho de su recuadro, así que el trazo acababa midiendo lo que tocara según
lo grande que cada uno firmase: medido, **de 2,44 pt firmando grande a 5,92 firmando
compacto** — 2,4 veces, con la misma punta. Ninguna calibración fija aguanta eso. Al
aceptar, `SignaturePad` **repinta la firma** con el radio que deja `TRAZO_PT` = 2,0 pt
una vez aplicada la escala de estampado (`radioParaTrazo`), en dos pasadas porque
cambiar el radio mueve un poco la caja de la tinta. Resultado medido: las seis
combinaciones dentro del ±3 %.

Los 2 pt no son un gusto: la firma de **Brokergy impresa en la columna de al lado** del
Convenio mide 2,25 pt de trazo (medido sobre `firma_brokergy.png`), y dos firmas con
grosores distintos en la misma página es lo que se ve a un metro, antes que nada del
documento. Antes salía a 3,70 pt en el caso normal — casi el doble que la de al lado.

⚠️ Esto arregla también el fallo CONTRARIO: en el Anexo I **oficial**, cuyo recuadro es
más pequeño, el trazo salía a **0,53 pt**, un pelo casi invisible.

**REGLA — la calibración se COMPRUEBA, porque depende de la tinta.** `radioParaTrazo`
usa dos constantes medidas sobre la física de `ink.js` (`TRAZO_A`/`TRAZO_B`), y `ink.js`
es un port literal que se re-porta entero cuando ScannerApp cambia. Si se quedan atrás,
nada falla de forma visible: la firma sale de otro grosor y nadie se entera hasta ver un
documento. Tras tocar la tinta o el estampado:

```bash
node implementation/backend/scripts/check_trazo_firma.mjs
```

Vive en [trazoFirma.js](implementation/frontend/src/features/firma/trazoFirma.js) y no en
`escaneado.js` por dos motivos: lo necesita el LIENZO —y `escaneado.js` arrastra pdf.js y
jsPDF, 1,4 MB que el teléfono no abre— y sin dependencias se puede medir desde el script.

⚠️ **La caja del documento tiene que llegar hasta el lienzo**, también por el QR: el
teléfono no sabe qué se está firmando, así que el recuadro viaja en la sesión de firma
móvil (son cuatro coordenadas de una plantilla, geometría y no un dato de nadie; el
documento sigue sin salir del ordenador). Y en el Anexo I `SIGN_BOXES` entrega una
FUNCIÓN —la caja depende del formato del impreso (regla 41)—, así que el asistente la
resuelve al abrir el PDF (`resolverCaja`) y pasa la MISMA al lienzo y al estampado: con
dos criterios distintos se calibraría contra un recuadro y se estamparía en otro.

**REGLA — el tope que manda es el ALTO, no el ancho.** Una firma de verdad es una rúbrica
compacta —más cuadrada que apaisada— y los recuadros de firma son apaisados, así que el que
recorta casi siempre es el alto. Con el alto al 62 % una rúbrica cuadrada salía ocupando un
cuarto del ancho de su caja y en el Anexo I se veía perdida en el hueco; al **82 %** queda del
tamaño con el que se firma un papel. Referencia para no pasarse: la firma de Brokergy impresa
en la columna del Cesionario del Convenio ocupa el 97 % del alto de la suya. (Esto decide el
TAMAÑO de la firma; el grosor del trazo lo fija `TRAZO_PT`, arriba.)

**REGLA — la firma cae donde diga `signBoxes.js`, la misma fuente que Autofirma.** Con una
copia de las coordenadas aquí, la firma electrónica y la manuscrita acabarían en sitios
distintos del mismo documento el día que cambie la plantilla. Dentro del recuadro se
centra, conserva su proporción (nunca se estira: una firma deformada canta a montaje desde
el otro lado de la mesa) y se apoya sobre la línea. Verificado sobre las dos cajas: la del
Convenio (258×123 pt) y la del Anexo I (227×75 pt).

⚠️ **`page.render` NECESITA `intent: 'print'` para rasterizar.** Pintando para pantalla,
pdf.js reparte la página en trozos encadenados con `requestAnimationFrame`, y **rAF no corre
con la pestaña en segundo plano ni con el móvil bloqueado**: medido, el escaneo se quedaba
parado PARA SIEMPRE en cuanto la pantalla dejaba de estar a la vista, y que el cliente mire
un WhatsApp mientras se prepara su documento es el caso normal. Con intención de impresión
pinta del tirón (y de paso, 179 ms en vez de 1.859).

⚠️ **pdf.js VACÍA el array de bytes que se le pasa** (lo transfiere al worker). Por eso
`cargarPdf` copia SIEMPRE: sin la copia, el segundo uso del mismo PDF —escanearlo después
de haberlo leído en el visor, o "volver a firmar"— recibía cero bytes y el proceso se
colgaba en "preparando tu documento firmado", sin error.

**REGLA — cada documento se cierra ANTES de pasar al siguiente.** Al aceptar la firma se
estampa y se escanea ahí mismo, y lo que se enseña es el resultado de verdad, no una
simulación. Dejándolo todo para el final, un fallo al componer aparecería después de que el
cliente diera por hecho que había terminado.

**REGLA — la foto del DNI se ENCOGE en el navegador, al elegirla.** Un móvil de hoy hace
fotos de 3-5 MB y las dos caras iban tal cual dentro del Convenio: medido, el anexo firmado
pesaba **6,7 MB de los que 5,5 eran el DNI**. Eso lo sube el cliente por datos móviles —justo
donde la conexión falla— y no aporta nada: a 1800 px de lado mayor el documento ocupa unos
1200 px de ancho, más que un escaneo a 300 ppp, y el número se lee igual (comprobado
ampliando el recorte: 2,91 MB → 473 KB, el 84 % menos). Se comprime AL ELEGIRLA y no al
enviar, para que la vista previa sea exactamente lo que va a viajar; y ante cualquier fallo
se devuelve el original, porque una foto pesada se sube y una foto estropeada hay que
repetirla — y quien la hace ya ha firmado dos documentos.

⚠️ **Los ANEXOS escaneados no se tocan.** Medido sobre el Anexo I real: de 150 dpi/q0,85
(701 KB) solo se baja a 429 KB forzando 110 dpi, y ahí ya peligran las notas al pie que lee
el verificador. La ganancia estaba en el DNI, no en el documento.

**El DNI se pide DESPUÉS de firmar, cara a cara** (`capture="environment"` abre la cámara
trasera), con la foto a la vista para poder repetirla — y con la salida de **subir un PDF**,
que es lo que tiene quien ya lo lleva escaneado y suele traer las dos caras. Ese es el único
cambio de fondo en el backend: `dni_pdf` como ALTERNATIVA a las dos caras (no un añadido),
más `firma_origen: 'asistente'`, que se sella en `documentacion` y viaja en el aviso al
staff — que la firma se trazara sobre el borrador que servimos nosotros no se puede
reconstruir después mirando el PDF.

El montaje final NO cambia: el Convenio se archiva con el DNI del cliente y el del
representante de Brokergy anexados, por `buildCesionManuscrita` (regla 22.b), igual que un
escaneo de papel. Y la contrafirma tampoco hace falta: el borrador ya lleva impresa la firma
de Brokergy en la columna del Cesionario.
