---
name: presentar-rite
description: 'FIRMA y PRESENTA la Memoria Técnica RITE de una instalación térmica en eDICE-Térmicas de CASTILLA-LA MANCHA (certificado de instalación térmica SIN proyecto, 5–70 kW) cuando la hace BROKERGY o la firma en nombre de un instalador del que tenemos el certificado de representante: (1) firma el PDF de la memoria con el certificado de REPRESENTANTE de la empresa instaladora, (2) lo comprime en ZIP, (3) rellena el formulario de eDICE y lo diligencia con AutoFirma eligiendo ese mismo certificado, (4) paga la tasa con la tarjeta guardada en Chrome y (5) guarda en la app el CERTIFICADO RITE oficial (slot «Certificado RITE», que además se lee) y el justificante de la tasa. Úsalo con "presenta la memoria RITE de 26RES080_90", "firma y registra el RITE de NNN", "diligencia el certificado de instalación térmica de X", "legaliza el RITE de los splits de X". Lo que hace el usuario: decir SÍ al pago al principio y autorizar el 3DS en la app de su banco. Necesita Claude en Chrome y AutoFirma. Solo CLM.'
---

# Firmar y presentar la Memoria RITE en eDICE-Térmicas

Lleva una Memoria Técnica RITE ya generada (la de la app, `MEMORIA_RITE_{nº}.pdf` en «7. LEGALIZACION
RITE») hasta el **certificado de instalación térmica diligenciado** por la JCCM, y lo deja en la app.
Lo normal es que lo haga el instalador; esta skill es para cuando lo hacemos **nosotros**: la memoria
la firma Brokergy (B19350222) o **otra empresa instaladora de la que tenemos su certificado de
representante** en el almacén de Windows.

- **Solo Castilla-La Mancha**, solo **sin proyecto** (5–70 kW). Por debajo de 5 kW no hay certificado
  (ver `docs/conocimiento/consultas/certificado-rite-de-los-aires-no-es-el-boletin-clm.md`); por encima
  de 70 kW hace falta proyecto: para y dilo.
- **Lo que se declara en eDICE sale de la MEMORIA FIRMADA**, no de memoria ni de la oportunidad:
  titular, emplazamiento, UTM, potencias, fechas de pruebas. Si algo no cuadra con el expediente, se
  corrige la memoria y se vuelve a firmar; nunca se declara en eDICE otra cosa que lo que va en el ZIP.
- **Firma y diligencia el MISMO certificado**: el de REPRESENTANTE de la empresa instaladora que
  figura en la memoria. Nunca el personal de Fran (es el que AutoFirma ofrece por defecto, ver §4).
- **Local = producción**: `--escribir` sube a Drive y escribe en el expediente de verdad.
- Las herramientas de escritorio son las de `presentar-cee`:
  `implementation/backend/scripts/presentar_cee/escritorio.ps1` (`captura`, `clic`, `frente`, `aviso`;
  coordenadas en píxeles de PANTALLA). Ver [comun/entorno.md](comun/entorno.md).

## 0. La confirmación (la ÚNICA pregunta, al principio)

Antes de abrir eDICE, un mensaje con el expediente, el titular, la empresa que firma, la tasa y la
tarjeta: *«Firmo con el representante de SOLUCIONES SOSTENIBLES la memoria RITE de 26RES080_90
(LAURA MILLÁN), la presento en eDICE y pago 11,97 € con la Mastercard ••XXXX. ¿Sí?»*. Con ese sí se
hace todo seguido; lo único del usuario es el **3DS** en la app del banco. Sin un sí con expediente +
importe no se pulsa «Pagar» (lo exigen las reglas de Claude, como en `presentar-cee`). Si en el
formulario sale otra empresa, otro importe u otra tarjeta, se para y se pregunta.

La tasa (2026): **Tarifa 6.1 · 11,97 €** por certificado. La tarjeta por defecto es la de la memoria del
proyecto; **nunca se escribe un número de tarjeta ni el CVV**: los pone Chrome.

## 1. Firmar la memoria y hacer el ZIP

```bash
cd implementation/backend
node scripts/firmar_memoria_rite.js 26RES080_90                      # en seco: firma en local y enseña la vista
node scripts/firmar_memoria_rite.js 26RES080_90 --escribir           # además sube _fdo.pdf y _fdo.zip a Drive
node scripts/firmar_memoria_rite.js 26RES080_90 --empresa B12345678  # firma OTRA empresa instaladora
```

- Por defecto firma Brokergy con el mismo certificado de representante que `firmar_cee.js`
  (`CEE_FIRMA_HUELLA`); con `--empresa <CIF>` busca en el almacén de Windows el certificado vigente
  cuyo sujeto lleve `R: <CIF>`. Si no lo hay, para: **no se firma con otro**.
- Firma en la **última página**, debajo de «Fecha y firma del/la Instalador/a…» y por encima de los
  «Ejemplar para…» (el hueco de al lado es el sello de la empresa). Rechaza un PDF ya firmado.
- Comprueba con `leerFirmasPdf` que la firma es íntegra y que el firmante es `R: <CIF>`.
- El **ZIP lleva SOLO la memoria firmada** (decisión de Fran, 25/10/2026). eDICE exige `.ZIP` de
  **1 MB como mucho**: si pesa más, para y dilo (la memoria con fotos pesadas se aligera antes).
- Mira `scratch/firmar-rite/<nº>/ultima_pagina.png` antes de seguir: la firma en su recuadro.
- La fecha escrita en la memoria («En …, a dd de mes de aaaa») es la de cuando se generó; si se firma
  otro día, dilo en el resumen final (no bloquea).

## 2. Abrir el formulario

Claude en Chrome, pestaña nueva:
`https://edice.castillalamancha.es/eDice-Termicas/etdformu.jsp` («Certificado de instalación térmica
sin proyecto»). No pide identificarse: la firma va al final. El enlace del menú a veces no hace nada:
navega directo a esa URL.

## 3. Rellenarlo — TODO en UN script, justo antes de diligenciar

Chrome **descarta la pestaña** si pasa un rato en segundo plano: cambia el `tabId` y se pierden la
dirección (campo deshabilitado que se compone con un popup) y la localidad (se carga por AJAX). Por
eso todo se rellena con **un solo** `javascript_tool`, se adjunta el ZIP y se diligencia sin pausas.

El mapa de campos, sus valores y el script: [referencia/edice-formulario.md](referencia/edice-formulario.md).
Las decisiones que no son obvias:

- **Tipo de instalación**: lo que hace el equipo. eDICE **no tiene «Calefacción y Refrigeración»**
  sola: para splits bomba de calor aire-aire (calor y frío, sin ACS) Fran eligió **«Calefacción,
  Refrigeración y ACS» (11)** con la potencia de ACS vacía (26RES080_90). Aerotermia aire-agua con ACS:
  11 si también da frío, 2 («Calefacción y ACS») si no.
- **Potencias de SPLITS: se SUMAN** las de todas las unidades (5 × 3,52 = 17,6 kW calor; 5 × 3,50 =
  17,5 kW frío) y el **total = calor + frío** (35,1 kW), como dijo Fran. La página comprueba que el
  total esté entre 5 y 70 y no sea menor que ninguna de las partes (`potenciaCorrecta`).
- **Pruebas**: las fechas de la memoria (DD/MM/AAAA). Con splits: equipos, **estanqueidad de circuitos
  frigoríficos**, UNE-EN 12599, distribución de aire y eficiencia energética; las de agua, chimeneas y
  dilatación vacías.
- **Observaciones**: máximo **250 caracteres** (la página corta sin avisar al validar). Una frase: qué se
  sustituye por qué, modelo, gas, potencia por unidad y si hay ACS.
- **Autor de la memoria** y **RII de la empresa instaladora** (formato `NN-L-D2N-XXXXXXXX`): los de la
  memoria firmada. El RII lo valida la propia JCCM contra el Registro Integrado Industrial.
- **Solar**: nº de paneles, superficie y potencia de apoyo son obligatorios; sin solar térmica, `0`.

Adjunta el ZIP en «Memoria» con `file_upload` sobre `txtMemor` y comprueba que `txtMemorB64` se ha
llenado (lo hace `readSingleFile` al cargar el fichero). Lee la salida del script: dirección
compuesta, localidad elegida, tipo, total de potencia válido y longitud de las observaciones.

## 4. Diligenciar con el certificado de REPRESENTANTE

**Aquí NO se lanza el vigilante de `presentar-cee`**: cancela cualquier ventana de certificado, y
aquí el certificado se elige en esa ventana.

1. Pulsa **«Diligenciar Certificado»** (`validar()` → AutoFirma). Si la validación saca un `alert`,
   léelo (`escritorio.ps1 aviso`), corrige y vuelve a rellenar con el script entero.
2. Captura la ventana de AutoFirma (`escritorio.ps1 captura -Salida …\af1.png`). Si es «Diálogo de
   seguridad del almacén **Windows**», sigue en el 4. Si es la del almacén **NSS** (un PC con el montaje
   viejo de Firefox: solo el personal), **no pulses Aceptar** y localiza los iconos de arriba a la
   derecha.
3. Solo con NSS: icono de **«cambiar almacén»** (el segundo, la bandeja con la flecha) → menú →
   **«Almacén de claves del sistema»**. El diálogo pasa a «… almacén **Windows**» con TODOS los
   certificados del PC (de clientes y representantes de otras empresas).
4. Busca en la lista el de **«(R: <CIF de la empresa que firma>)»**, vigente (mira «Válido desde …
   hasta …»); si no se ve, desplaza la lista. Clic en él → **captura y comprueba que es el resaltado**
   → «Aceptar». Cada clic real, con su captura antes y después: un clic desplazado firma con el
   certificado de otra persona. Nunca Intro a ciegas en este diálogo.
5. eDICE responde «Autenticidad de la firma digital y validez del instalador confirmadas» con el
   apartado **«Pago de la tasa»**. Si dice que el instalador no es válido, para: el RII o el firmante
   no casan.

> Alternativa sin clics (POR PROBAR en eDICE): lo que hace `presentar-cee` desde el 27/10/2026 —su
> `certificado.js` añade `filters=thumbprint:SHA1:<huella>` + `headless=true` a la llamada de MiniApplet
> y AutoFirma firma sin ventana— con la huella del `(R: <CIF>)`. Falta ver cómo llama eDICE a AutoFirma
> (`enviarYFirmar`). Hasta probarlo, el camino es el de arriba.

## 5. Pagar la tasa — con el sí del principio

1. Opción 1 **«Realizar pago de tasas»** (la 2 es para un pago ya hecho: código 046 o ETER/PATA). Apunta
   el **nº de documento 046** (13 dígitos): si algo falla después, con él se recupera el trámite.
2. Plataforma de pagos de la JCCM → **«Pago de documentos sin identificación»** → **«Pago con
   Tarjeta»** → Redsys.
3. La tarjeta guardada en Chrome **con el TECLADO** (el clic del ratón sobre el desplegable no funcionó):
   - `escritorio.ps1 frente -Ventana 'Pantalla de pago Redsys'`, captura y localiza «Número de tarjeta».
   - `escritorio.ps1 clic` en el campo; luego, en la MISMA llamada de PowerShell,
     `[System.Windows.Forms.SendKeys]::SendWait('{DOWN}')` las veces que haga falta hasta resaltar la
     tarjeta confirmada (captura entre pulsaciones) y `{ENTER}`. No uses `escritorio.ps1 teclas`: trae
     la ventana al frente y CIERRA el desplegable.
   - Chrome pone número y caducidad; el **CVV** lo pone al hacer clic en su campo. Si no aparece, el
     usuario lo escribe: Claude nunca. **No repitas esos datos en el chat.**
4. **«Pagar»** → *«autoriza el pago en la app de tu banco»* → «OPERACIÓN AUTORIZADA CON CÓDIGO …».
5. **«Continuar»** → «Estado: Pagado» → icono de descarga junto a «Obtener justificante de pago»
   (`Descargas\<nº 046>.pdf`) → **«Continuar»**: vuelve a eDICE ya diligenciado.

Si la vuelta falla, el certificado se activa desde «Consulta por instalador de certificados sin
proyecto (activación de certificados)», o repitiendo el diligenciado con la opción 2 y el 046.

## 6. Descargar lo que devuelve la JCCM

La página final («Datos del certificado diligenciado electrónicamente») trae el **nº de expediente**
(313…), el identificador digital, el registro de entrada y, arriba, tres iconos.

- **El CERTIFICADO RITE es el de la IMPRESORA** (el icono del medio): abre una ventana emergente
  (`diligimp.jsp`) con el visor de PDF de Chrome → botón de **descarga** → `Descargas\GenerarPdf.pdf`
  (~2 MB: el impreso oficial con el sello de la JCCM). Ese es el que va al slot. La ventana emergente
  queda fuera del grupo de pestañas de Claude en Chrome: tráela con `escritorio.ps1 frente` y pulsa la
  descarga con captura + clic; o pídeselo al usuario si no aparece. **La página web impresa a PDF NO
  vale** (`guardar_certificado_rite.js` rechaza lo que no sea PDF, pero no distingue una impresión).
- **«Descargar Ficheros»** abre otra emergente con los tres ZIP de acuse (`aft_…`, `amt_…`, `mtt_…`):
  firmas XML y la memoria tal como se registró. Se guardan en «7. LEGALIZACION RITE» si el usuario
  los quiere; la app no los usa. Se pueden bajar desde la pestaña con
  `fetch('descargas?token=<identificador digital>&tipoFichero=ACUSE_FORMULARIO|ACUSE_MEMORIA|MEMORIA_TECNICA')`.

## 7. Guardarlo en la app

```bash
node scripts/guardar_certificado_rite.js 26RES080_90 --certificado "C:\Users\<usuario>\Downloads\GenerarPdf.pdf" --tasa "C:\Users\<usuario>\Downloads\<nº 046>.pdf"
# en seco dice qué hay y qué se archivaría; si cuadra, lo mismo con --escribir
```

Hace lo mismo que soltar el PDF en la fila «Certificado RITE» de Documentación: lo archiva como
`{nº} - Certificado RITE.pdf`, lo enlaza en `cert_rite_drive_link` y lo **lee** (regla 27.b): rellena la
fecha de pruebas y la de firma si estaban vacías (nunca pisa una escrita) y compara emplazamiento y
referencia catastral. Además enlaza la memoria firmada en `cert_rite_signed_link`. Lee su salida:
«CONFLICTO» o «REVISAR» se dicen en el resumen.

## 8. Resumen al usuario

Nº de expediente de eDICE, registro de entrada, empresa que firmó, importe y código de autorización
del pago, qué se ha guardado y dónde, lo que la lectura escribió o avisó, y lo pendiente (p. ej. la
fecha de la memoria distinta de la de firma).

## Lo que ya pasó (para no repetirlo)

| Qué | Lección |
|---|---|
| Firma con el certificado personal | AutoFirma, en el navegador, abre el almacén de Firefox (solo el personal): hay que cambiar a «Almacén de claves del sistema» y elegir el de representante (26RES080_90, 25/10/2026). |
| Pestaña descartada | Se perdió la dirección y la localidad entre dos llamadas: todo en un script. |
| Observaciones de 279 caracteres | El máximo es 250: se recortó a 223. |
| El desplegable de la tarjeta | No responde al clic: teclado (`{DOWN}` + `{ENTER}`) con SendKeys. |
| El certificado subido era la página web | El bueno es el PDF de la impresora (`GenerarPdf.pdf`); el otro quedó en OLD. |
