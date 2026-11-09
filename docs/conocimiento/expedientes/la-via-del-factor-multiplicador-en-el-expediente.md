<!-- conocimiento · área: expedientes · las rutas de los enlaces son relativas a la raíz del repo -->

## La vía del FACTOR MULTIPLICADOR en el expediente (2026-11-07)

La Resolución de la DGPLACE publicada en el BOE del 7/11/2026 (BOE-A-2026-23367, en vigor el 8/11/2026)
crea las fichas con **factor multiplicador** (FM): RES060_FM y, en hibridación, RES090_FM…RES094_FM
(una por zona), con sus variantes **-S** para el consumidor vulnerable. El bono lo calcula el motor de
la calculadora (`calculateRes060FM`, ver «FACTOR MULTIPLICADOR: la Resolución publicada» en
`docs/conocimiento/calculo/`). Este documento trata lo que el EXPEDIENTE necesita para tramitarlo: el
número, la documentación de la ficha y los documentos que se firman.

Fran, 07/11/2026: «si se indica que se realiza con este, será un nuevo código de expediente. El
apartado documentación de la app debe contemplar todo lo que pide la ficha. Debes contemplar todas
las casuísticas». Sobre el IRPF: «eso puede ser una cláusula del Convenio CAE y también aparecer en la
propuesta que se le envía».

### Lo que decidió Fran (07/11/2026)

| Pregunta | Decisión |
|---|---|
| Número | **Serie propia**: `26RES060FM_N` y, en hibridación, `26RES093FM_N` (para las cinco zonas). |
| Cambiar de vía | **Renumera**: `26RES060_250` → `26RES060FM_{siguiente}`, y al volver, al revés. |
| CEE inicial | La ficha FM no lo pide, pero **se hace igual, como plan B** (por si hay que volver a la vigente). |
| Anexo I ya firmados | **Se quedan como están**. El Anexo A solo para los documentos nuevos desde el 8/11/2026. |
| Cláusula del IRPF | **Solo en los FM**: en el Convenio y en la propuesta. |

### El número

**REGLA — la vía la dice el NÚMERO.** `esNumeroFm` ([utils/fichas.js](implementation/backend/utils/fichas.js)
y su espejo [logic/viaFm.js](implementation/frontend/src/features/expedientes/logic/viaFm.js)):
`/^\d{2}(RES060|RES093)FM_\d+$/`. `fichaFromNumero` usa `includes`, así que un FM sigue siendo RES060 /
RES093 para todo lo demás: cálculo, documentos, carpetas, listado. Solo RES060 y RES093 (`FICHAS_CON_FM`):
la Resolución no trae fichas FM para el terciario. La RES080_FM (rehabilitación profunda, cuatro CEE) entra el 09/11/2026 con su serie **`26RES080FM_N`** (`FICHAS_CON_FM` = RES060, RES080, RES093; `fichaFromNumero` sigue dando RES080).

**REGLA — la serie es PROPIA, y el correlativo se busca DENTRO de ella.** `serieNumeracion('RES060', true)`
→ `RES060FM`; `correlativoEnSerie(numero, '26RES060')` devuelve null para un `26RES060FM_12`. Antes
el siguiente número salía de un `LIKE '26RES060_%'`, y en SQL `_` es un comodín: los FM habrían
contado en la serie vigente.

Los LECTORES del número se pusieron al día para que un FM no deje de reconocerse: el nombre del chat
de WhatsApp (`nombreContactoCliente.js`, `agendaWhatsapp.js` → `RES060FM_12`), la facturación del
certificador (`certificadorFacturacion.js`) y las inexactitudes del verificador (`inexactitudesLote.js`).

**REGLA — la marca de la vía en la OPORTUNIDAD es `inputs.ruta_fm`, nunca `via_fm`.** El alta del
expediente (`createExpediente`) saca el número de la serie FM si la oportunidad se aceptó por esa vía
(`oportunidadViaFm`). La clave `via_fm` ya existe: es el resumen de las dos vías en
`datos_calculo.via_fm` (solo ADMIN), y `financialScrub` borra TODA clave `via_fm` del árbol a quien no
es ADMIN, también dentro de `inputs`. Un TRABAJADOR que abriera la calculadora y la guardara se
habría llevado la marca por delante. La vía también se elige en la oportunidad, antes de aceptar (07/11/2026). En la calculadora está el
conmutador «Vía de tramitación» (`ConmutadorViaFm.jsx`):
- solo lo ve el equipo interno y no enseña importes;
- guarda por `POST /api/oportunidades/:id/ruta-fm` (`staffOnly`), que antes de escribir vuelve a
  comprobar que la simulación guardada es elegible, y responde 409 si ya hay expediente o no lo es;
- guardar la calculadora no cambia esa marca (`conservarRutaFm`);
- al aceptar, el popup enseña el número de la serie FM.

El detalle está en la regla 155 y en «FACTOR MULTIPLICADOR: la Resolución publicada».

### Cambiar de vía

Pestaña **«Vía FM»** del expediente (solo staff, solo RES060/RES093), [ViaFmPanel.jsx](implementation/frontend/src/features/expedientes/components/ViaFmPanel.jsx).
`POST /api/expedientes/:id/via-fm` `{ activar }` (staffOnly) → `cambiarViaFm` en
[expedienteService.js](implementation/backend/services/expedienteService.js):

1. **Bloquea** (409) si el número ya está fuera de casa: en un lote, en el verificador, en MITECO o
   después (`ESTADOS_NUMERO_FUERA`), o RECHAZADO. Un número nuevo dejaría los documentos ya presentados
   con otro distinto.
2. Pide el siguiente número de la otra serie y lo escribe **solo si nadie lo ha cambiado entretanto**
   (`.eq('numero_expediente', viejo)`).
3. Lo apunta en el historial, sella `documentacion.via_fm.activada_at`, refleja `inputs.ruta_fm` en la
   oportunidad (`oportunidad_merge_inputs`) y endereza la carpeta de Drive a `{nº} - {CLIENTE}`.

`documentacion.via_fm` NO se borra al volver a la vigente: si se vuelve a pasar, los datos siguen ahí.
Con el expediente aún en la vigente, la pestaña enseña cómo quedaría (vista previa).

### Decidir de un vistazo y proponérselo al cliente (08/11/2026, Fran)

Fran: «quiero que la usabilidad para el cambio, el cálculo con FM y todo sea sencillo para poder rápido
migrar a FM. Incluso obras que no están marcadas como DOC. COMPLETA, que le podamos enviar un mensaje al
cliente para que, si está de acuerdo, se espere a partir del 15/01 para presentarlo».

- **Las dos cifras, arriba del todo**, junto al botón de cambiar: vía vigente, vía FM y lo que gana el
  cliente (€ y %), con lo que el motor dice que la IMPIDE (avisos `bloquea`). Son las de la pestaña
  Económico: `cifrasViaFm` en [convenioFm.js](implementation/frontend/src/features/expedientes/logic/convenioFm.js),
  la misma fuente que el Convenio FM, pero para CUALQUIER RES060/RES093, vaya ya por la FM o no
  (`ExpedienteDetailView` pasa `calcResults` al panel).
- **«Proponer esperar al FM»** (solo con el expediente aún en la vigente) abre
  [AvisoEsperaFmModal.jsx](implementation/frontend/src/features/expedientes/components/AvisoEsperaFmModal.jsx):
  el WhatsApp ENTERO a la vista y editable (`mensajeEsperaFm`: las dos cifras, que se presenta desde el
  **15/01/2027**, que el cobro llega más tarde, que si el cupo se agota o no se justifica va por la ficha de
  siempre, y que hará falta firmar el convenio nuevo y alguna factura de la luz), a los contactos del
  cliente con teléfono (`clienteContacts`, como el envío de anexos; a la persona de contacto le habla de
  «tu cliente»), sin emojis, y sale solo con «Enviar», con el overlay de envío de la casa.
- Queda apuntado en `documentacion.via_fm.aviso_espera` (`{ at, a }`) y la respuesta se marca a mano
  en el panel: `espera_cliente` = `acepta` | `rechaza` | null (los dos, saneados en `sanearDatosFm`).
  **Proponerlo NO cambia la vía**: con «ACEPTA», el panel invita a pulsar «Pasar a la vía FM».
- **Sin CEE, la cifra de la simulación** (≈): la pestaña Económico no calcula sin demanda ni superficie
  del CEE, y 13 de las obras candidatas se quedaban sin cifras en el panel y con el WhatsApp sin importes.
  `cifrasViaFm` cae entonces a `datos_calculo.via_fm` de la oportunidad (la columna «Vía FM» de
  Oportunidades, solo ADMIN) y la marca `estimada`; el panel lo dice. **El Convenio FM nunca la usa**
  (`cifrasConvenioFm` pasa `estimar: false`): lo que se firma sale del CEE.
- La lista de qué obras ganan más con la FM la saca una sesión aparte (08/11/2026) con este mismo criterio:
  86 expedientes con CEE elegibles, todos ganan, +297.843 € para los clientes en total.

REGLA — **al cliente se le PROPONE esperar; la vía se cambia después, a mano, cuando dice que sí.** El
aviso no toca el número ni los documentos.

### Los datos de la vía

**REGLA — `documentacion.via_fm` solo lo escribe `PUT /:id/via-fm/datos`.** Con la RPC de merge
(`merge_expediente_doc_json`), después de `sanearDatosFm` (solo pasan las claves conocidas, los
enums estrictos). Está en la BLACKLIST de `normalizeData` (sus enums van en minúscula) y en
`CLAVES_PROTEGIDAS` de `mergeDocumentacion` (o el autoguardado del detalle lo borraría). Claves:
`tipologia`, `vulnerable`, `caldera_retirada`, `bt_aplica`, `caldera_nueva`, `vivienda_habitual`
(`facturas` | `curva`), `inquilino`, `centralizado_mixto`, `facturas_luz[]`, `activada_at` y, para
los documentos que genera la app, `mantenimiento` (`acepta` | `desiste` | null), `mantenimiento_importe`
(texto libre, ≤ 60), `anexo_b_casilla` (`renta` | `severo` | `no_fn` | null) y `vulnerable_persona`
(`{ nombre, nif, domicilio, telefono, email }`, solo si el vulnerable no es el titular).

### Qué documentos pide, por caso

**RES080_FM** (09/11/2026, `documentosFm080` en `utils/viaFm.js`, BOE págs. 20–22): 2 Anexo A (la ficha
dice «anexo I», errata) · 3 vivienda habitual (facturas 1/11–31/3; no en un centralizado) · 4 facturas
(cubre DOC_FACTURAS) · 5 informe fotográfico (Anexo Fotográfico) · 6 **certificado del director o
responsable de obra** (slot `FM_CERT_DIRECTOR_OBRA`: elementos, fin de obra y variables de la fórmula) ·
7 puesta en funcionamiento (DOC_RITE) · 8 CEE previo registrado (cee_inicial) · 9 CEE posterior registrado
con la misma herramienta (cee_final) · 10 CEE simulado TODO menos la bomba (`FM_CEE_SIM_REST`) · 11 CEE
simulado SOLO la bomba (`FM_CEE_SIM_BC`), los dos sin registrar · y la cláusula del IRPF en el Convenio.
Los tres slots nuevos no se le reclaman al cliente (`aportaInstalador`). No lleva declaración de
tipología, preinstalación, inercia, BT, mantenimiento, F/G ni la variante -S, y el panel esconde esas
preguntas; en su lugar, los kWh/año de los dos simulados (`ef_sim_bc`, `ef_sim_rest`), que usa la cifra
mientras no estén sus CEE. El Convenio FM declara como subsidiaria la RES080 (`fichaGeneralDeFm`) y la
RES080_FM va al precio RES080. Pruebas: `test_via_fm.mjs`.

Fuente única: `documentosFm` / `slotsFm` en [utils/viaFm.js](implementation/backend/utils/viaFm.js).
Lo que se SUBE entra en el gestor de documentación como apartado de la fase DESPUÉS (`alcance.fm` en
`docsAlcance.js` → `buildDocChecklist`), con su lenguaje de casa para el enlace del cliente
(`LABEL_CLIENTE_FM`). Lo que ya cubre otro documento del expediente no se pide dos veces: el panel
dice su estado.

| Punto | Documento | Cómo | Cuándo |
|---|---|---|---|
| 1 | Declaración del instalador de la tipología (unifamiliar ×2 · piso individual ×2,5 · centralizado ×3) | **genera** · firma el instalador en su página | siempre |
| 2 y 5 | Anexo A (ayudas) | **genera**: el «Anexo I» de Documentos sale como Anexo A | siempre |
| 3 | Certificado con las variables | lo cubre el CIFO | siempre |
| 3.b | Justificación de la preinstalación de la caldera | sube (instalador) | RES060_FM con la caldera que se queda |
| 3.c | Certificado de inercia | lo cubre el CIFO (hoja propia; los litros, en Instalación) | RES060_FM |
| 4 | Vivienda habitual: facturas del 1/11 al 31/3 o curva horaria | sube (cliente) + validación | no en un centralizado |
| 6 | Facturas con nº de serie | las de la obra | siempre |
| 7 | Informe fotográfico | lo cubre el Anexo Fotográfico | siempre |
| 8 | Oferta de mantenimiento de 2 años, aceptada o desistida | **genera** · firma el cliente en su enlace | siempre |
| 9 | Boletín de BT con el aumento de potencia | sube (instalador) | hibridación siempre; RES060_FM si se marca; sin marcar, opcional y dice cuándo |
| 10 | Puesta en servicio | lo cubre el certificado RITE | siempre |
| 11 | CEE posterior registrado | lo cubre el CEE final | siempre |
| 12 | Consentimiento del IRPF | lo cubre el Convenio de la vía FM | siempre |
| 13 | Documento informado (podría no rendir lo previsto) | **genera** · firma el cliente en su enlace | RES060_FM en D/E: obligatorio con el CEE en F o G |
| 13 | Fichas de la caldera nueva y de la bomba | sube (instalador) | hibridación con la caldera también nueva |
| S.3 | Anexo B (justificación de consumidor vulnerable) | **genera** · firma el vulnerable en el enlace del cliente | vulnerable (-S) |
| S.2, S.4–S.7 | Bono social, nota simple o contrato, empadronamiento, compromiso del inquilino, certificado del presidente | sube (cliente) | vulnerable (-S); los dos últimos según el caso |

**REGLA — lo que emite el INSTALADOR no se le reclama al CLIENTE.** Como el certificado RITE:
`aportaInstalador` + `optionalAlways`. Que la ficha lo pide lo dice el panel de la vía FM.

**REGLA — lo condicionado no pasa a obligatorio por sí solo.** El boletín de BT sin decir si aumenta
la potencia, o el documento F/G sin conocer la letra, salen como opcionales diciendo cuándo hacen
falta. La letra la da el CEE FINAL y, sin él, avisa ya la del inicial (la envolvente no cambia al
cambiar el generador).

### Los documentos que GENERA la app (07/11/2026)

Son cinco y hasta hoy solo se podían SUBIR:
- el **Anexo A** (puntos 2 y 5);
- la **declaración del instalador de la tipología** (1);
- la **oferta de mantenimiento** (8);
- el **documento informado F/G** (13);
- el **Anexo B** (S.3).

Ninguno tiene un impreso oficial rellenable, así que se maquetan en HTML con hojas A4 de alto fijo (`.fm-page`).

Las fuentes únicas son dos:
- **La maqueta**: [logic/documentosFm.js](implementation/frontend/src/features/expedientes/logic/documentosFm.js) (`buildAnexoAHtml`, `GENERADORES_FM`, `avisosDocumentoFm`).
- **Lo que necesita el servidor**: `GENERADOS_FM` en [utils/viaFm.js](implementation/backend/utils/viaFm.js), que dice el apartado del gestor donde acaba el firmado, el nombre del fichero y QUIÉN lo firma.

**REGLA — el Anexo A sustituye al Anexo I solo en los documentos NUEVOS.** Con un número FM
(`usaAnexoA`), el «Anexo I» de Documentos sale como Anexo A: en `AnexoIModal`, `EnviarAnexosModal` y
el envío de `AnexoCesionModal`, por `fuenteAnexoIoA`, que en la vigente sigue dando el impreso oficial.
Cambia el documento, pero no el sitio:
- mismo slot (`anexo_i`);
- mismo enlace de firma, junto al Convenio;
- mismos modos de firma.

Ocupa dos hojas por cedente, con la firma en la 2 (`anexoISignBox(2)`; con varios cedentes,
`anexoISignBoxCedente` decide por páginas). Un Anexo I firmado antes de pasar a la vía **sigue valiendo**
(Fran). La Séptima del Convenio FM cita el «Anexo A».

**REGLA — los otros cuatro se GENERAN desde el panel y NO se envían.** «Generar para firmar» hace cuatro cosas:
1. Guarda primero los datos del panel.
2. Llama a `POST /api/expedientes/:id/via-fm/documento/:genera` (staffOnly). La ruta solo acepta la maqueta (`class="fm-page"`) y da 409 si el expediente no es FM.
3. Deja el PDF en «6. ANEXOS CAE» como `{nº} - {fichero}.pdf`; el anterior va a OLD.
4. Sella `documentacion.fm_docs[genera]` (`drive_link`, `drive_id`, `drive_at`, `por`) por la RPC de merge.

«Ver» enseña la maqueta sin guardar nada. `fm_docs` está en la BLACKLIST de `normalizeData` y en
`CLAVES_PROTEGIDAS`. El panel no devuelve enlaces de Drive, solo fechas (regla 1).

**REGLA — cada uno firma donde ya firma.**
- **El cliente**, en `/firmar-anexos`, junto al Anexo A y al Convenio: Autofirma, a mano con el móvil o en papel. Le toca la oferta de mantenimiento, el F/G y el Anexo B.
- **El instalador**, en su página `/instalador/:id`, con la tarea «Firmar la declaración de la tipología» (`FirmarFmDeclaracionCard`): Autofirma o el PDF firmado. Una sociedad firma con el certificado de representante.

El recuadro es el mismo en las cuatro hojas: `cajaFirmaFmPt(1)`, abajo a la derecha. El firmado entra
en su apartado del gestor (`reforma_uploads[slot]`, por `subirFicherosASlot`), como si se hubiera
subido, y sella `fm_docs[genera].signed_at`.

En el asistente de firma a mano, cada documento FM lleva **un** firmante. Si ya se tiene su DNI y solo
quedan documentos FM, el asistente no lo vuelve a pedir.

**REGLA — volver a generar un documento firmado pide otra firma.** `firmadoVigente(subidas, drive_at)`:
cuenta como firmado solo si la última subida es POSTERIOR al borrador de ahora. El firmado anterior
no se borra. El panel pide confirmación antes de regenerar uno firmado.

Los datos que solo piden estos documentos se rellenan en la sección 2 del panel (`via_fm`, ver «Los
datos de la vía»):
- **oferta de mantenimiento**: la casilla acepta / desiste. Sin elegir, salen las dos en blanco y solo vale firmada en papel. El importe no es obligatorio: sin él queda una línea para escribirlo a mano.
- **Anexo B**: la casilla (`renta` | `severo` | `no_fn`) y, si el vulnerable no es el titular, sus datos.

Lo que falta no bloquea la generación: `avisosDocumentoFm` lo dice debajo de cada documento:
- sin instalador asignado;
- sin nº RITE;
- sin firmante o sin su DNI;
- sin tipología;
- sin la letra del CEE;
- sin casilla;
- sin importe.

Medido con `check_documentos_fm.mjs`. El Anexo A cabe en dos hojas por cedente (con tres cedentes, seis)
y los otros cuatro en una, con el «Fdo.» dentro de su casilla. El caso más justo es la tipología con el
texto más largo: le sobran 19 px.

### La inercia (punto 3.c) va DENTRO del CIFO (07/11/2026, Fran)

La RES060_FM pide en su documento 3.c un «Certificado de que la instalación dispone de la inercia
hidráulica necesaria para garantizar el correcto funcionamiento de la bomba de calor en todas las
condiciones de operación previstas, de acuerdo con las especificaciones del fabricante», con el
volumen de agua total (litros) y el volumen específico (l/kW). Ya no hay mínimo fijo: los 15 L/kW eran
del borrador. Las hibridaciones (RES09x_FM), la RES062_FM y la RES080_FM no lo piden.

Fran: «Que en el documento CIFO, cuando sea esta ficha, se añada un punto que certifique que eso se
cumple, así usamos un único documento que es el CIFO».

**REGLA — en un `26RES060FM_N` el CIFO lleva una hoja propia, «Certificado de inercia hidráulica de la
instalación», y el 3.c no se pide como papel aparte.** La ficha cuelga ese certificado de su documento
3, que es el certificado de la empresa habilitada, o sea nuestro CIFO. La hoja dice:
- de dónde sale (ficha, BOE y apartado);
- el párrafo con el que la empresa instaladora lo certifica;
- el volumen total, la potencia térmica nominal (en cascada, la suma, y lo dice), el volumen específico
  y, si se teclea, el mínimo que pide el fabricante;
- una nota que define qué se cuenta en el volumen.

Va **después** de la hoja de variables: el recuadro de firma está anclado a la hoja 2
(`SIGN_BOXES.cifo_res060`) y una hoja añadida detrás no lo mueve.

**REGLA — los litros los DECLARA el instalador y se teclean en Instalación; el específico se CALCULA.**
- `instalacion.inercia_litros`: el volumen total.
- `instalacion.inercia_min_fabricante_litros`: el mínimo del fabricante, opcional.

No van en `documentacion.via_fm`, porque el `PUT /:id/via-fm/datos` reescribe ese objeto entero. El
volumen específico es litros ÷ la potencia nominal total de la bomba (`potenciaTotal`, la misma suma de
la cascada que el resto del CIFO). Sin litros o sin potencia, «Generar CIFO» lo pide. Con el declarado
por debajo del mínimo del fabricante, Instalación lo avisa en ámbar: el certificado afirmaría algo que
no se cumple.

Fuente única: [logic/inerciaFm.js](implementation/frontend/src/features/expedientes/logic/inerciaFm.js)
(`aplicaInerciaFm`, `inerciaFm`), que usan `cifoDoc.js` (la hoja), `InstalacionModule.jsx` (los
campos) y `DocumentacionModule.jsx` (lo que falta antes de generar). Medido con
`check_cifo_paginas.mjs`: con 1 equipo y con 5 en cascada, con el mínimo y con dos empresas, sobran más
de 600 px.

### La vivienda habitual (punto 4)

`validarViviendaHabitual`: el periodo es del 1/11 al 31/3 del invierno ANTERIOR al inicio de la obra
(primera factura que la abre, sin `motivo_no_inicio`; un inicio en marzo no cuenta ese invierno como
«previo»). Comprueba que las facturas lo cubran **sin huecos** (los dice con fechas), **un solo CUPS**,
la dirección **igual que la catastral** y **más de 75 kWh/mes** de media, prorrateando los días de cada
factura que caen dentro. Lo que no se puede saber (una factura sin kWh) se DICE: no se da por bueno.

### Las facturas (punto 6)

Posteriores al 22/03/2026 y anteriores al 01/12/2027 (al 01/01/2028 una comunidad de propietarios).
El panel avisa de las que caen fuera (`facturasFueraDePlazo`).

### El consentimiento del IRPF (punto 12)

La ficha pide que el beneficiario acepte, por escrito, que **a)** el incentivo es un aumento
patrimonial que tributa en el IRPF y **b)** el ahorro depende de las condiciones de funcionamiento de
la bomba de calor. Los textos salen de
[logic/viaFm.js](implementation/frontend/src/features/expedientes/logic/viaFm.js) y van, **solo en los FM**,
a tres sitios:

- **Convenio de Cesión** (`buildAnexoCesionHtml`): como «Cuarto» del EXPONEN en la hoja 1, con uno o
  con varios cedentes. Hasta el 08/11, con un cedente iba dentro de la Octava; desde que el convenio FM
  va en tres hojas (ver «El Convenio FM vale para las dos fichas»), va siempre en el EXPONEN. En la hoja
  de firmas pisaba las casillas, que van en posición fija: 51 px con 5 cedentes. Medido con
  `check_anexo_cesion_2pag.mjs`, que comprueba también que el texto de la hoja de firmas no llegue a la
  primera casilla.
- **Propuesta**: una nota más en la portada (la que se ajusta sola, regla 31; no en la hoja 4, que es
  de alto fijo) cuando la oportunidad va por la vía FM (`inputs.ruta_fm`). Desde el 09/11/2026, si la
  propuesta lleva la hoja del FM, la nota sobra (lo dice «Sus firmas» de esa hoja) y no sale; y vale
  también en las de solo reforma. Ver [la hoja del factor multiplicador](../propuesta/la-hoja-del-factor-multiplicador.md).
- **Mensaje de envío**: una línea tras el aviso del factor multiplicador (`opts.fc`), o entera si la
  propuesta ya va por esa vía.

**REGLA — un Convenio firmado ANTES de pasar a la vía no lleva la cláusula.** El panel lo marca
«sin cláusula» (firmado antes de `activada_at`, o cualquiera mientras el expediente siga en la vigente)
y hay que volver a firmarlo.

### El Convenio FM vale para las DOS fichas (08/11/2026, Fran)

Fran: «que aparezca en el anexo de cesión que se solicitará por un ahorro con factor multiplicador, de
tanto, y que si por causas que no se pudiese justificar, porque se agotase o por otra causa, se
solicitaría por el ahorro de la ficha normal. De este modo, si luego se rechaza por lo que sea, no hay
que volver a firmar otro anexo de cesión».

El motivo es real: la vía FM tiene un **cupo** (1.287 GWh, el 15 % de la obligación de 2026) que se
reparte por orden de fecha de RESOLUCIÓN (aviso de `res060fc.js`). Un expediente que se presenta por la
FM puede quedarse sin cupo, o no poder justificar un requisito, y hasta hoy eso obligaba a firmar otro
convenio con la cifra de la ficha general.

**REGLA — el Convenio de un FM declara una ficha PRINCIPAL (la FM) y una SUBSIDIARIA (la general), y
autoriza desde la firma a pasar de una a otra sin novarlo.** Dónde lo dice:
- **EXPONEN Primero**: las dos cifras, la FM primero y la general entre paréntesis.
- **Tercera** («Ahorro anual de energía y ficha por la que se tramita»): se pide por la FM; si no
  puede acogerse o justificarse, el Cedente autoriza «desde ahora» a pedirlo por la general,
  comunicándoselo y sin novar el convenio ni firmar otro. Las causas, en `CAUSAS_SUBSIDIARIA_FM`:
  - un requisito que no se cumple;
  - el cupo agotado o el fin de la vigencia;
  - que no la admita el verificador o el órgano;
  - cualquier otra causa.

  Una tabla da, por cada ficha, el ahorro, el €/kWh y el importe orientativo. Después viene el párrafo
  de siempre: es una estimación y la contraprestación se ajusta al ahorro certificado «para la ficha por
  la que finalmente se tramite».
- **Cuarta**: el precio es el que la tabla da a la ficha por la que se certifique. Si coinciden, dice
  «en los dos casos».
- **Séptima**: el Anexo A sustituye al Anexo I en todas las fichas del Catálogo (Quinto de la
  resolución), así que vale para las dos.

**REGLA — las cifras son las de la pestaña Económico, no se recalculan.** Fuente única:
`cifrasConvenioFm` en
[logic/convenioFm.js](implementation/frontend/src/features/expedientes/logic/convenioFm.js).
- **FM**: `results.res060fc.cae` y `financialsRes060FC.caeBonus`, al precio `cae_client_rate_fm` si la
  oportunidad lo selló.
- **General**: `savingsKwh` y `caeBonus`.

Antes, un FM imprimía la cifra de la ficha general como si fuera la suya.

Con un **requerimiento** vivo, `resultsParaDocumento` y `EnviarAnexosModal` marcan `viaUnica`: el ahorro
ya es el VERIFICADO de la vía presentada y el convenio vuelve a una sola cifra.

**REGLA — el convenio FM va en TRES hojas, y en CUATRO con varios cedentes; la firma busca la casilla
por el nº de páginas.**

| Cedentes | Hojas | Hoja de firmas | Casillas |
|---|---|---|---|
| Uno | 3 | la 3, como la de varios | Cesionario (0) y Cedente (1) |
| Varios | 4 | la 4 | Cesionario (0) y un Cedente por casilla |

Con varios no cabe en tres: se cortaba 147 px con dos cedentes y 173 px con cinco. La hoja 3 lleva
la Séptima, la Octava y la Novena de pluralidad.

`paginaFirmasConvenio` ([signBoxes.js](implementation/frontend/src/features/expedientes/logic/signBoxes.js))
decide la hoja de firmas por el nº de páginas:
- **4 páginas** → la 4;
- **3, o 5 o más** → la 3. Cinco o más es un firmado a mano con los DNI montados detrás
  (`buildCesionManuscrita`, al menos dos hojas).

Autofirma, la firma a mano y la contrafirma de Brokergy ya decidían por páginas, así que no cambian.
⚠️ La contrafirma con certificado de un FM con varios cedentes **firmado a mano** caería en la hoja 3,
porque los DNI montados detrás no dejan saber cuántas hojas tenía el convenio. Es un caso que no se da:
en el papel, la rúbrica de Brokergy ya va impresa.

Medido con `check_anexo_cesion_2pag.mjs` en los casos FM: uno, dos, tres y cinco cedentes, precio FM
propio y requerimiento. El más justo es la hibridación -S de una empresa, con 12 px. El script comprueba
además que la hoja de firmas sea la que buscará la firma.

**El mensaje de envío** (`EnviarAnexosModal`) anuncia el importe FM. Después añade una línea
(`lineaMensajeConvenioFm`) con el importe de la ficha general, si no se pudiera justificar, y dice que
el convenio recoge los dos casos y no tendrá que volver a firmar.

El pie del convenio FM pasa a «V6 FM – 08/11/2026».

### El lote

- Listado del lote y solicitud de verificación: el código y el título de la ficha FM
  (`fichaOficialDeExpediente`), `SE_cod_ficha` / `SE_v_ficha` = `RES060_FM…` / `V1.0`. ⚠️ Que Marwen
  acepte esos códigos por API **no está comprobado**.
- Anexo del MITECO: el impreso oficial (`AnexoActuacionEstandarizada.pdf`) **no trae las fichas FM en
  su desplegable** (115 opciones). Un FM sale como incompleto diciéndolo, y con él la solicitud de
  emisión, que exige todos los anexos.
- El dictamen del verificador casa `RES060_FM(-S)` con `26RES060FM_N` y `RES09x_FM` con
  `26RES093FM_N` (`fichaDelDictamenCasa`).

### Pendiente

- El desplegable del anexo del MITECO, cuando el Ministerio lo publique con las fichas FM.
- Por decidir (Fran):
  - si la oferta de mantenimiento la firma también la empresa (hoy firma solo el propietario);
  - de dónde sale su precio (hoy se teclea).
- Siguen diciendo «Anexo I» en un FM:
  - los nombres de fichero de la validación, del lote y del paquete;
  - el pie del envío directo antiguo de `AnexoIModal`;
  - los rótulos del rechazo del backend.

  El documento ya es el Anexo A.

Tras tocarlo: `node implementation/backend/scripts/test_via_fm.mjs`, `check_documentos_fm.mjs`,
`check_anexo_cesion_2pag.mjs`, `test_docs_fotos.js` y `auditar_rutas_sin_guardian.js`.
