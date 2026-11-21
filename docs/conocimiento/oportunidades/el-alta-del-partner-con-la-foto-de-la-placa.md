<!-- conocimiento · área: oportunidades · las rutas de los enlaces son relativas a la raíz del repo -->

## El alta del PARTNER: la caldera desde la FOTO de su placa, y la oportunidad simplificada (2026-11-16)

**El caso** (Fran, 16/11/2026): los distribuidores e instaladores dan de alta desde su
perfil en «Nueva simulación» (`LandingFunnelView mode="internal"` → `ReformaSubFlow`).
Se les pedía la referencia catastral y las fotos de la caldera, pero:

- la caldera se contestaba **a mano** (combustible, «¿cuántos años tiene?», condensación),
  y las fotos solo se guardaban, sin leerse. La fila de rendimiento salía de «más de 20
  años», que en gasóleo cae en «anterior a 1985» aunque la placa diga 2003;
- **los lectores con IA les daban 403**: la foto de la referencia catastral (`ocr-rc`) y
  el presupuesto en `docs_obra` (`factura-ocr/extract`) eran `staffOnly`;
- **las fotos y el presupuesto que soltaban se PERDÍAN**: la subida a los apartados de
  la oportunidad recién creada (`/api/public/reforma-docs/:uuid/:slot`) exige sesión de
  staff o el `?token=` de la oportunidad, y el partner no tenía ninguno de los dos. El
  `catch` se lo tragaba en silencio;
- en la oportunidad veían «Envolvente térmica» (transmitancias que fija el CEE, no él) y
  «Sup. Calef.» sin explicar.

Fran: «con la foto de la caldera la propia app ya valide si es correcta y saque los datos
para los cálculos», «la de envolvente térmica la quitaría», «Superficie calefacción… que no
deje poner menos metros que la útil y si se pone que salte un aviso diciendo que bajará la
ayuda y que confirme», «sin que me falte información cuando me llegue a mí».

### El paso «Fotos de la caldera» (solo en el flujo INTERNO)

[StepPlacaCaldera.jsx](implementation/frontend/src/features/landing/steps/StepPlacaCaldera.jsx),
pantalla `placa_caldera` de `ReformaSubFlow`, antes de `combustible`. Dos tarjetas: **la
placa de características** (a resolución completa) y **la caldera en su sala** (regla 162),
hasta 8 fotos cada una: todas suben a su apartado, y al lector van las 4 primeras de placa y
las 2 primeras de sala (`LEE_PLACA`/`LEE_SALA`, lo que admite `placaOcrService`). Se pueden
añadir o quitar fotos MIENTRAS se lee; cada cambio de la placa relanza la lectura y una
respuesta vieja no pisa la nueva (`turno`). Al poner la de la placa se lee en el momento
(`POST /api/oportunidades/leer-placa-caldera`, `enforceAuth`, la MISMA lectura que el
expediente: `placaOcrService.leerPlacaCaldera`, regla 27.d) y se enseña:

- el **veredicto** de [utils/placaCalderaAlta.js](implementation/backend/utils/placaCalderaAlta.js):
  `ok` (marca o modelo Y potencia), `incompleta` (con su consejo: «acércate a la línea de
  la potencia») o `no_valida` («esto no es una placa»). **Lo decide el código, no el modelo.**
- marca, modelo, potencia (con la línea literal de la placa), año y nº de serie (dudoso,
  marcado);
- el **combustible**, marcado con el de la placa y **a confirmar** (el leído nunca se
  escribe como combustible, regla 27.d; va aparte en `combustible_leido`). En una placa
  POLICOMBUSTIBLE la potencia sale del combustible confirmado (`potencias_por_combustible`);
- la **condensación** (gas, GLP, gasóleo): Sí / No / No lo sé. «No lo sé» se resuelve por
  el modelo («CONDENS») o por el año: desde el ecodiseño (813/2013) una placa de 2016 en
  adelante se toma como de condensación;
- año y potencia tecleables si la placa no los trae, y «Se calcula como: …» con la fila.

Con «Continuar» la caldera queda contestada (`calderaDesdePlaca`,
[data/calderaDesdePlaca.js](implementation/frontend/src/features/landing/data/calderaDesdePlaca.js))
y se salta a los emisores. **La fila de rendimiento sale del AÑO DE LA PLACA** (regla 99:
con año, la de ese año; sin año, la más reciente de su tipo). Con el enlace «No tengo la foto
ahora, o no hay caldera» se contesta a mano como antes.

Mientras se lee la placa se puede ir haciendo la foto de la sala (no relanza la lectura).

⚠️ **«Leyendo la placa…» sin fin** (Fran, 16/11/2026, primera prueba con login): el backend
contestaba en 3–5 s, pero la pantalla tiraba la respuesta. El «¿sigo montado?» (`vivo`) se
ponía a `false` al desmontar y nunca volvía a `true`, y en StrictMode React monta, desmonta y
vuelve a montar. Ahora se pone a `true` DENTRO del efecto. Como el botón de añadir estaba
deshabilitado mientras leía, parecía que «solo deja 1 de la placa» (y la sala tenía tope 2).
El banco de pruebas monta ya con StrictMode, como `main.jsx`: sin él no salía.

**REGLA — la caldera de la placa MANDA sobre lo que dedujo el funnel, solo si el combustible
no ha cambiado después.** En `doSubmitInternal`, tras `funnelToCalculatorInputs`, se
sobrescriben `boilerId`/`boilerEff`, `potenciaCaldera`, `inputs.placa_caldera` y —como el
alta por WhatsApp— el propano (`fuelType 'glp'`, `boilerHeatingType 'Propano'` y el ACS en
propano si sale de la misma caldera) y los sólidos (`combustibleSolido`). Si el partner volvió
atrás y cambió el combustible a mano, manda lo que contestó.

**REGLA — `inputs.placa_caldera` lleva lo leído, lo confirmado y el veredicto**
(`placaCalderaParaInputs`): la misma forma que la skill `alta-oportunidad`, así
`expedienteService` la hereda al aceptar (solo huecos; un nº de serie con `serie_dudosa` no).
Además `veredicto`, `combustible_leido`, `condensacion`, `anio_tecleado` y
`origen: 'nueva_simulacion'`.

### Lo que te llega a ti

- En el **historial** de la oportunidad, una nota del sistema
  (`notaHistorialPlaca`, puesta por `createLead`): «Caldera dada de alta con la FOTO de su
  placa (placa leída | placa INCOMPLETA | la foto NO es una placa): FERROLI DOMIPROJECT F24 ·
  24 kW · 2005. Combustible confirmado: propano/butano — la placa decía gas natural ·
  condensación: no lo sabe.» y si el nº de serie es dudoso.
- En la calculadora, bajo «Sistema anterior»: «De la placa: marca modelo · kW · año», en
  ámbar si la foto no valía.
- Las fotos, en sus apartados `FOTO_PLACA_CALDERA_ANTES` y `FOTO_CALDERA_ANTES`.
- `funnel.caldera_desde_placa: true | false`.

### Las subidas del partner, con el token de la oportunidad

**REGLA — `internal-simulation` devuelve el `upload_token` de la oportunidad recién creada,
y el formulario sube con `?token=`.** Se genera al crear (`attachUploadToken`, idempotente):
pedirlo después desde dos sitios a la vez podía crear dos distintos. Con él suben las fotos de
la caldera, el presupuesto y las facturas de `docs_obra`, y cualquier documento puesto antes
del alta. Mientras suben, `docs_upload` dice «Guardando las fotos y documentos que ya habías
puesto…» y el `DocsManager` se recarga al terminar (antes enseñaba los apartados vacíos).

### Tras el alta, el partner va DIRECTO a la oportunidad (16/11/2026)

**REGLA — el partner no pasa por «Sube ahora las fotos del antes».** Fran: repetía la caldera
que acababa de fotografiar y pedía paredes y fachadas que aún no hacen falta. En
`ReformaSubFlow.doSubmitInternal`, con `esPartner` (sesión que no es del equipo interno), se
ESPERA a que suban sus ficheros («Guardando las fotos y el presupuesto…» bajo el botón) y se
llama a `onCreated`, que abre la oportunidad. Un fallo de subida no para el alta (se avisa en
consola, como siempre). Lo demás se pide **al aceptar**: el agente de la aceptación ya pide
solo lo que falta y el acuse no vuelve a pedir la placa si está. **El equipo interno sigue
viendo la pantalla de fotos** (la usa en la obra).

### Los lectores con IA, abiertos al partner con sesión

`POST /api/catastro/ocr-rc`, `POST /api/factura-ocr/extract` y
`POST /api/oportunidades/leer-placa-caldera` pasan de `staffOnly` a **`enforceAuth`**: el
anónimo de la landing sigue fuera (llamada de pago a un LLM), el partner con sesión entra.
No devuelven nada de nadie: solo lo que pone el fichero que se sube (su presupuesto, su placa,
su IBI). Lo vigila `test_rutas_sin_sesion.js` (anónimo 401, partner pasa el guardián).

### La oportunidad, simplificada para el partner

En [CalculatorForm.jsx](implementation/frontend/src/features/calculator/components/CalculatorForm.jsx),
con `esPartner = !getRoleFlags(user).isStaff`:

- **sin «Envolvente térmica»**: las transmitancias las decide el CEE; el equipo interno la
  sigue viendo;
- **«Sup. Calef.» con su (i) y su candado**
  ([SuperficieCalefaccion.jsx](implementation/frontend/src/features/calculator/components/SuperficieCalefaccion.jsx),
  [logic/superficieCalefaccion.js](implementation/frontend/src/features/calculator/logic/superficieCalefaccion.js)).

**REGLA — la superficie calefactada no baja de la útil sin confirmarlo.** La demanda se
calcula sobre la calefactada (`calculation.js`, `S = superficieCalefactable`): con menos
metros, menos ayuda. Lo normal es lo contrario —el Catastro llama «almacén» o «garaje» a una
planta que en la casa es vivienda y tiene radiadores, y esos metros se SUMAN—, y eso es lo que
explica la (i). Se comprueba **al salir del campo**, no al teclear («1», «12»… serían menos a
mitad de escribir):

- **partner**: popup «¿Se calientan menos metros que los útiles?» con la cifra; la acción
  principal es **«Dejar {útil} m²»** (vuelve a la útil) y la secundaria «Sí, solo {x} m²»;
- **equipo interno**: aviso ámbar bajo el campo, sin bloquear.

**REGLA — lo confirmado se guarda con quién y cuándo** (`inputs.supCalefMenor = { util,
calef, por, empresa, rol, at }`) y el equipo interno lo lee bajo el campo: «25 m² menos que la
útil: la ayuda baja. Lo confirmó Pepe (INSTALACIONES X) el 16/11/2026». Vale mientras los metros
sean los mismos; subirla a la útil o más la borra. Tolerancia de medio m² (redondeos).

### La oportunidad del partner, rediseñada: UNA página (16/11/2026)

Diseño propuesto en Claude Design (lienzo «Oportunidad del partner») y aceptado por Fran con
«las tres cosas». El mismo día, con la captura delante («tiene mucha capacidad de mejora,
optimizar todo»: el ID y el estado salían dos veces, el bono y el IRPF otra vez en Resultados,
seis botones compitiendo, dos estilos y el coste final enterrado), pasó a ser **la página entera**
y se revisó con un agente experto en diseño antes de enseñarla (sus cambios, abajo).

Para el partner la oportunidad es
[ResumenOportunidadPartner.jsx](implementation/frontend/src/features/calculator/components/partner/ResumenOportunidadPartner.jsx),
con la piel «carta de pago» (regla 164, CSS propio `.po-` en `estiloOportunidadPartner.js`).
**No ve la barra oscura del bono, ni Resultados, ni los chips de la cabecera**; el formulario va
**plegado** y se abre con «¿Algo no cuadra? Corregir datos» (sin resultado todavía, abierto). Lleva:

- la dirección con el municipio en lima, el cliente y el nº de oportunidad (el estado ya lo dicen
  los pasos);
- los **pasos con su nombre** (Simulación → Propuesta enviada → Aceptada → Expediente, por el
  estado y el expediente: `pasoOportunidad`) y la frase de lo que falta;
- si hay **cambios sin guardar**, una franja ámbar con «Guardar cambios» (`onSinGuardar` del
  `ResultsPanel`);
- UNA cifra grande: el **bono CAE** y debajo **las cuentas de su cliente** línea a línea
  (`cuentasCliente`): presupuesto (con la fotovoltaica), − bono, + IRPF del bono si se aplica,
  − deducción del IRPF «estimada, en su declaración», + gestión (`caeMaintenanceCost`) = **«La obra
  le queda en»**, «tras la deducción en su declaración de la renta». Son las cifras del «Coste
  final» de Resultados (`calculateFinancials`); **el total es la suma de lo impreso**, redondeado a
  euros (regla 156), así que puede diferir en un euro de los céntimos de la propuesta;
- con reforma, la opción que imprime la propuesta (solo reforma, o las dos: la segunda con su
  propio desglose);
- la **vía del FACTOR MULTIPLICADOR** aparte (abajo);
- «Con esto hemos calculado»: la vivienda (m², zona climática), la caldera de hoy (de la placa si
  la hay) y lo que se instala con el presupuesto (o «estimado»);
- la documentación que ya hay y «Subir fotos o documentos»;
- UNA acción naranja: **«Ver y enviar la propuesta»** (en el móvil, fija abajo y portaleada a
  `body`, regla 29.b) y, como enlaces, «Imagen resumen» e «Historial». Sin acción con expediente
  o ya ACEPTADA.

**REGLA — el `ResultsPanel` del partner sigue MONTADO, sin pintarse** (`vistaPartner`): es quien
obliga a guardar antes de la propuesta y de la imagen, y quien tiene los popups (propuesta,
guardar, fotos, historial). La página se los pide con `accionExterna` (`pdf`, `tabla`, `guardar`,
`fotos`, `historial`); guardar, fotos e historial no exigen guardar antes.

**Lo que cambió tras la revisión de diseño:** el «en lugar de X €, no además» del FM pegado a la
cifra y en negrita; el FM bloqueado sin caja dentro de caja; objetivos táctiles de 44 px (enlaces,
Sí/No/No lo sé, cerrar, guardar); en el popup, «lo que tiene que saber tu cliente» justo debajo
del resultado, los botones fijos abajo, con un «No» solo «Cerrar» (sin el naranja apagado), sin
«RES060_FM» en la cabecera, el foco atrapado dentro y devuelto al botón que lo abrió; y el motivo
de un «No» en la caldera ya no dice «combustible sólido» (puede ser eléctrica). Se dejó fuera:
precontestar el popup con la placa (que lo confirme el instalador) y quitar el código postal del
título.

**REGLA — la comisión del partner NO va en el resumen.** `totalPrescriptor` y
`caePricePrescriptor` son claves de margen (`MARGIN_KEYS_DEEP`) y no le llegan; el lienzo la
dibujaba, pero enseñarla obligaría a abrir el margen. Si Fran la quiere, es otra decisión.

**REGLA — la vía FM se enseña en €, «hasta X €», EN LUGAR DE la normal, nunca sumada**, con el
×N, «desde el 15/01/2027, con cupo limitado» y «estimado hasta tener el CEE» si la D_cal es de
la simulación; sin ACS, el aviso de añadir el depósito. Sale solo si la FM da más que la vía
normal. **Si algo lo impide (`elegible: false`), no hay cifra**: solo «Ahora mismo no se puede
pedir: {motivo}». La cifra es la de su navegador (`financialsRes060FC`) con el precio FM al
cliente, que **desde hoy no se le quita** (`financialScrub`, regla 155); `via_fm` (MWh) sí.

**El popup de requisitos** ([RequisitosFmModal.jsx](implementation/frontend/src/features/calculator/components/partner/RequisitosFmModal.jsx),
textos en [logic/requisitosFm.js](implementation/frontend/src/features/calculator/logic/requisitosFm.js)):
cinco preguntas con Sí / No / No lo sé (caldera de gas/GLP/gasóleo · vivienda habitual · aire-agua
con calefacción y ACS · fechas 22/03/2026–01/12/2027 · caldera retirada), el resultado (con
algún «No», por la vía normal y por qué; todo «Sí», puede ir; si no, cuántas faltan), lo que se
le pedirá si va por FM y lo que tiene que saber el cliente (15/01/2027, cupo, cifra estimada).

**REGLA — «Pedir que vaya por FM» deja una PETICIÓN, no cambia la vía.**
`POST /api/oportunidades/:id/peticion-fm` (`enforceAuth` + `suyaSiPartner`: la ajena, 404) guarda
`inputs.peticion_fm = { respuestas, veredicto, por, at }` con la RPC `oportunidad_merge_inputs`
(respuestas BOOLEANAS: true / false / null, así `normalizeData` no tiene nada que poner en
mayúsculas) y una línea «🧾 Se PIDE ir por la vía del FACTOR MULTIPLICADOR…» en el historial;
`{ cancelar: true }` la retira y con expediente da 409. Se pide con las cinco contestadas y
ningún «No». **El guardado de la calculadora no la toca** (`conservarRutaFm`: se queda la de la
BD, y el navegador no la puede poner). El equipo interno la ve en ámbar encima del conmutador
«Vía de tramitación», que es lo único que ELIGE la vía (`ruta-fm`, `staffOnly`).

### Dos tarjetas en paralelo, y «Solicitar revisión» (17/11/2026)

Fran, con la página ya en local: «se ve como una pantalla muy grande, mucho espacio en blanco al
lado del importe; quizás dos tarjetas paralelas», «tampoco veo el botón de pedir la revisión» y
«subir fotos y documentos, que tenga algún icono». Se revisó con la skill de crítica de diseño:
el bono de 80 px solo en una tarjeta de 760 px dejaba media tarjeta vacía, la acción principal
quedaba al final de la columna derecha (debajo de lo secundario) y el FM, con su cifra en 38 px,
parecía una nota y no la otra opción.

- **Arriba, DOS tarjetas en paralelo** (`.po-par`): el bono y, a su lado, la vía FM (cifra a 60 px,
  «HASTA» encima), la **opción 2** de la reforma o, si no hay ninguna, **las cuentas** del
  cliente. El bono nunca se queda solo en una fila. En el móvil, una debajo de otra.
- **Las cuentas a lo ancho son una fila de casillas** (presupuesto · − bono · − IRPF · + gestión
  → el total en negro con la cifra en lima), por `@container` de la columna (`.po-col`); en una
  tarjeta estrecha, la lista de siempre. En las casillas no va «estimada, en su declaración»: ya
  lo dice el total.
- **La acción ARRIBA a la derecha** («Siguiente paso»: la frase del paso, el botón naranja y los
  enlaces), y la columna derecha se queda fija al bajar (`sticky`). La frase del paso sale de la
  cabecera (estaba dos veces).
- **La documentación a la izquierda**, con iconos (✓ en verde, ! en ámbar) y «Subir fotos o
  documentos» como botón con icono de subida, para que las dos columnas acaben a la par.

**REGLA — «Solicitar revisión» se ofrece al partner con el bono por debajo de 3.000 € y sin el
CEE de la vivienda en la simulación** (el umbral de la regla 161; `ofrecerRevision` en
[logic/revisionPartner.js](implementation/frontend/src/features/calculator/logic/revisionPartner.js)):
guardada, en captación (ni aceptada ni expediente). Va al pie de la tarjeta del bono: «¿Puede
salir más? Este bono está estimado sin el certificado energético…». Con cambios sin guardar se
apaga («guarda antes»), porque el servidor mira lo GUARDADO.

### «Solicitar revisión» de punta a punta: popup, la IA por la API y el aviso (17/11/2026)

Fran, el mismo día: «debe saltarle un popup, para confirmar y dar información de que se nos va a
enviar y les notificaremos cuando esté; la app debe generar automáticamente a través del token el
CE3X como cuando lo hacemos con la app, cargarse como cuando te lo pido desde aquí y, una vez hecho,
que le llegue una notificación».

**REGLA — antes de pedirla, un POPUP que confirma y explica** (`SolicitarRevisionModal`, regla 29.b
y 183: portaleado, eventos aislados, foco atrapado y devuelto, Escape cierra salvo enviando). Dice
la cifra de ahora, los tres pasos (hacemos el CEE con lo que ya hay → recalculamos el bono → te
avisamos por WhatsApp), lo que tiene que saber en ámbar (puede subir, quedarse o BAJAR; mejor no
enviar la propuesta mientras) y, ARRIBA, lo único que puede hacer: «¿Tienes fotos de las fachadas y
las ventanas? Subir fotos antes». «Solicitar revisión» / «Ahora no».

**REGLA — la revisión ENCARGA el CEE inicial a la IA por la API (la cola del PC), y su XML pasa la
simulación a cálculo real.** `POST /api/oportunidades/:id/peticion-revision` (`enforceAuth` +
`suyaSiPartner`) vuelve a mirar con lo guardado el bono de la opción que imprime la propuesta
(`< 3.000 €`), que no haya CEE (`cee_previo`, `xmlDemandData`) ni petición previa (409 `YA_PEDIDA`,
`CON_CEE`, `POR_ENCIMA`, `SIN_CIFRA`), y llama a `ceeIa.pedir({ negocio: 'op', origen:
'revision_partner', porVia: 'api' })`: una fila `EN_COLA` en `cee_ia_trabajos` que coge el vigilante
del PC (`tools/banco-cee-api/banco.mjs atender`, con la llave de la API; **tiene que estar
corriendo**). El agente genera el `.cex`, lo califica y `cee_inicial.js aplicar --escribir` carga
su XML con `cargarCeeEnOportunidad`, igual que cuando se lo pide Fran. El encargo dice que lo pide
un partner y que no le escriba nadie: el aviso lo pone la app. Si la IA ya lo está haciendo o ya lo
hizo (`EN_MARCHA`, `YA_GENERADO`), queda pedida igual. Se apunta `inputs.peticion_revision = { por,
at, bono, trabajo_id }` (RPC de merge; el guardado no la toca, `conservarRutaFm`), «🔎 Se PIDE
REVISIÓN…» en el historial y un WhatsApp a administración con el estado del vigilante.

**REGLA — al cargarse el XML, la app cierra la revisión y avisa al partner por WhatsApp, UNA vez.**
`cerrarRevision` ([services/revisionPartner.js](implementation/backend/services/revisionPartner.js)),
llamado por `cargarCeeEnOportunidad` cuando ESCRIBE: marca `resuelta_at`, `bono_antes`,
`bono_despues` y `avisados` **antes** de enviar (cargar el CEE otra vez no repite el aviso) y manda
por la cola de la BD (`whatsappService.sendText`, la entrega el servidor) un WhatsApp sin emojis a
los contactos de rol comercial del partner (`partnerNotifyTargets`, como la propuesta), con la cifra
(sube / se queda / queda en) y el enlace `https://app.brokergy.es/?op=…` (producción aunque corra en
el PC). Si el trabajo acaba sin cargar el XML (la IA falló, faltaban fotos, no validó), `trasTrabajo`
—lo llama el vigilante al cerrar la fila— avisa a ADMINISTRACIÓN («REVISIÓN DEL PARTNER SIN
TERMINAR»); el partner sigue viendo «Revisión pedida» y, cuando una persona carga el XML, el aviso le
sale solo. ⚠️ Un **RES080** no se carga solo (necesita `cargarRes080EnOportunidad`, que también la
cierra). Pruebas: `node implementation/backend/scripts/test_revision_partner.js`.

**REGLA — mientras espera, la acción naranja NO es enviar la propuesta.** En «Siguiente paso»:
«Estamos revisando el bono con el certificado de la vivienda», y el botón naranja es «Subir fotos de
la vivienda»; la propuesta queda en secundario, «Ver la propuesta (cifra estimada)». Con la revisión
resuelta, bajo el bono: «Revisado con el certificado · antes, X € estimado». El equipo ve un aviso
ámbar en Resultados mientras está pedida. ⚠️ **En local, pulsarla escribe en PRODUCCIÓN** (la fila
`EN_COLA` que el PC generaría, con su coste, y el WhatsApp a administración): se prueba en el banco
(`/alta-partner-prueba.html?vista=oportunidad`, `&rev=1`, `&rev=hecha&bono=3120`), donde va simulada.

### «Corregir datos» del partner, en claro (17/11/2026)

Fran: «falta por mejorar la pantalla de si los datos no están bien» (el formulario oscuro «Cálculo
de Eficiencia»). **REGLA — el partner corrige con el formulario de SIEMPRE, dentro de su tarjeta
clara** (`CorregirDatosPartner`): `CalculatorForm` sin tocar sus campos ni su cálculo, envuelto en
`.theme-light` y con el CSS `.po-form` (cajas en crema y blanco alternos, la pestaña elegida en
tinta con lima, el cian del CRM al verde de la casa, campos a 16 px para que iOS no amplíe). Del
partner, el formulario no pinta su titular («Cálculo de Eficiencia»): lo pone la tarjeta, «¿Algo
no cuadra? Cámbialo aquí». Pie fijo abajo (`overflow: clip` en la tarjeta: con `hidden` el `sticky`
no pega): sin cambios, solo «Listo» (pliega y vuelve arriba); con cambios, «Hay cambios sin
guardar» y «Guardar cambios» en naranja (el guardar de siempre, `accionExterna`). Con el formulario
abierto se quita la barra naranja del móvil. Banco: `&corregir=1` (el formulario de verdad).

**REGLA — en «Datos económicos» el partner tiene lo justo** (Fran, 17/11/2026: «el formulario de
esta gente debe ser muy simple, para que no tenga muchos botones y no incurran en dudas»). No ve
**«Dto. certificados»** (asumir el coste de los certificados lo decide Brokergy) ni **«Tramitación
legalización»** (la presupuesta y tramita Brokergy), ni el interruptor **«IRPF del CAE»** (la
tributación del bono es cosa de la renta de su cliente). Lo que el equipo ya hubiera encendido se
sigue guardando: solo no se le enseña. El desplegable del titular se llama «¿A nombre de quién
está?» y debajo lleva **qué cambia según el titular** (`NotaTitular`): particular → hasta el 60 %
de la obra en la renta (ya va en las cifras) si el CEE final mejora lo suficiente (−30 % de energía
primaria no renovable, o letra A o B), y el bono como ganancia patrimonial (normalmente al 19 %,
DGT V2137-25) sin quitarle la deducción; autónomo o empresa → sin deducción (el cálculo solo la
aplica con `isParticular`) y el bono como ingreso de su actividad, con factura e IVA.

### La piel de la marca

El partner ve la «Nueva simulación» con el estilo «carta de pago» de la landing pública
(`carta = !isInternal || esPartner` en `LandingFunnelView`, regla 164): la misma piel
`.lf .theme-light` de [estiloCarta.js](implementation/frontend/src/features/landing/estiloCarta.js).
El equipo interno la sigue viendo oscura. Lo que va portaleado a `body` (visor de fotos)
queda fuera de la piel.

### La ficha del inmueble: la casa arriba, y las zonas solo VIVIENDA por defecto

En la «Ficha del inmueble» del alta interna
([LandingPropertyReview.jsx](implementation/frontend/src/features/landing/views/LandingPropertyReview.jsx)),
la fachada y el plano catastral van **arriba**, bajo la dirección (Fran, 16/11/2026: «no me
está mostrando la foto del catastro para confirmar que es la correcta»). Estaban debajo de
«Continuar al formulario» y no se llegaban a ver. En la landing del cliente siguen al final.

Bajo la dirección, en UNA fila: la RC, **Catastro** y **Maps** (`EnlacesInmueble`, en otra
pestaña) y **«¿No es este? Elegir en el mapa»**. Buscando por referencia (tecleada o leída
de la foto del IBI) no salía la tarjeta «Confirma el inmueble», que es donde vivía el mapa.
El botón abre el `MapPickerModal` centrado en la casa (su UTM de Catastro pasada a lat/lon
con `utmALatLon` de `ortofoto.js`) y lo elegido vuelve a esa tarjeta, con los vecinos y, en
una parcela de varias viviendas, la elección de la suya; al confirmar vuelve a la ficha.

**Más corta** (Fran: «hay que hacer demasiado scroll»): sin coordenadas UTM ni datos
climáticos («nos dan igual»; la zona climática ya va en su tarjeta y el resto de la app los
sigue enseñando), fotos de 160 px de alto, tarjetas de datos más bajas y cada zona en una
línea (tipo y planta juntos). A 1024×768, «Continuar al formulario» queda a 962 px.

Las zonas que vienen marcadas son **solo las de VIVIENDA** (si no hay ninguna, todas): un
almacén o un garaje solo cuenta si alguien lo marca a mano. Es el mismo criterio que la ficha
técnica de la calculadora (`PropertySheet`) y que el agente (`seleccionConstrucciones` de
[utils/altaOportunidad.js](implementation/backend/utils/altaOportunidad.js): el almacén solo
entra si se nombra). Comprobado el 16/11/2026 con 9352710VJ9395S0001WM: vivienda 54 + 85,
almacén 65 y aparcamiento 40, y sale marcado 139 m².

### Pendiente o a saber

- Los **modelos por marca** del partner ya existen: `prescriptores.marca_referencia` (lista de
  marcas separadas por comas, desde la ficha del partner) filtra el catálogo de aerotermia que
  ve (`routes/aerotermia.js`). Vale para el usuario que es el `representante_legal_id` de ESE
  partner, no para los instaladores de su red (cada uno tiene la suya). CALINDSA:
  `DAIKIN,LASIAN,THERMOR,PANASONIC,ARISTON` desde el 16/11/2026 (Fran: «sí, ponlas»; 300 modelos);
  sus 3 instaladores de la red, sin marcas (ven todo el catálogo). ⚠️ Una marca que no está en el
  catálogo deja el desplegable VACÍO: 13 partners guardan «17», «1», «105», un nombre de empresa o
  «HITACHI» (ninguno con usuario de acceso el 16/11/2026).
- `isAdminUser` de `ReformaSubFlow` trata al TRABAJADOR como no-admin (no puede validar en el
  `DocsManager` del alta).

### Cómo se prueba

- Sin BD: `node implementation/backend/scripts/test_caldera_desde_placa.mjs`,
  `test_placa_caldera_alta.js`, `test_superficie_calefaccion.mjs`.
- Guardianes: `node implementation/backend/scripts/test_rutas_sin_sesion.js` y
  `test_rutas_partner.js` (la petición FM: la suya 200, la ajena 404, anónimo 401, `ruta-fm` 403).
- La vía FM del partner: `node implementation/backend/scripts/test_via_fm_precio.mjs` (precio FM
  visible, `via_fm` no; la petición sobrevive al guardado; mismo veredicto en popup y servidor).
- El resumen y el popup: `?vista=oportunidad` en el banco (`&fm=no|bloquea`, `&acs=no`,
  `&estado=ENVIADA`), con «Pedir que vaya por FM» SIMULADO.
- Pantallas sin sesión y sin escribir: `http://localhost:5173/alta-partner-prueba.html`
  (`?vista=placa&placa=ok|incompleta|no_valida|error`, `?vista=docs`,
  `?vista=superficie[&rol=admin]`, `?vista=ficha[&rc=…]`, esta con un GET de verdad al Catastro, y `?vista=alta`, la «Nueva
  simulación» entera: busca de verdad, abre el mapa —`reverse-geocode` es un POST que solo
  lee y se deja pasar— y corta cualquier otro POST). Lee la placa SIMULADA y corta todo lo que no sea un GET:
  local escribe en PRODUCCIÓN. No entra en el build.
