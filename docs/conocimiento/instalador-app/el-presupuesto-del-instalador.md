# El PRESUPUESTO del instalador: en su plantilla, desde la app o pidiéndolo por WhatsApp (2026-11-22)

## El PRESUPUESTO del instalador: en su plantilla, desde la app o pidiéndolo por WhatsApp (2026-11-22)

Fran, 22/11/2026 (beta RCA): «que al igual que la simulación y la factura, pueda hacer un presupuesto.
La plantilla es la misma que la de la factura, pero que ponga presupuesto y número de presupuesto. Lo
más fácil de realizar, que el texto salga predefinido y si es necesario se pueda editar… incluso por
WhatsApp: "haz un presupuesto cambio de caldera por aerotermia Panasonic, 9.200 + IVA" y nuestra app le
envíe todo… si no indica el cliente, el chat lo pedirá para darlo de alta antes de nada… cuando se vaya
a realizar la simulación, confirmar la vivienda».

Hasta hoy el presupuesto, en la app, era **subir un fichero**. Ahora el instalador lo HACE: elige el
cliente, dice qué obra es y el precio, y sale el PDF en SU plantilla. El emisor es **él**, no BROKERGY:
nada que ver con `cee_ofertas` (los presupuestos de BROKERGY, serie `P-26ING`, pestaña Facturación).

### Cómo presupuesta RCA (lo medido en sus PDF, 22/11/2026)

Tres presupuestos suyos subidos a obras (38/26, 29/26, 30/26): su cabecera, «Cliente: nombre / dirección
/ CP municipio / NIF», «PRESUPUESTO · Número · Fecha», una lista de conceptos EN MAYÚSCULAS **sin precio
por línea** (depósito de inercia de 100 litros, bomba de impulsión, vasos de expansión, conexiones
hidráulicas, limpieza, llenado, grúa, desfangador, termo…), la última línea el equipo con marca y modelo
y **el precio de todo**, la nota «EL PRESUPUESTO NO INCLUYE ALIMENTACIÓN ELÉCTRICA» e IMPORTE · IVA 21 %
· TOTAL PRESUPUESTO. Numera `N/AA` («39/26»).

### El texto predefinido y las cuentas: UN fichero, tres usos

**REGLA — el texto predefinido y las cuentas del presupuesto viven en UN módulo puro,
[logic/presupuesto.js](implementation/frontend/src/features/instalador/logic/presupuesto.js), que usan
la app, el servidor (`import()`) y el agente de WhatsApp: lo que se ve al teclear, lo que se guarda y lo
que sale en el PDF no pueden diferir.**

- `conceptosDe(obra)`: la 1.ª línea lleva la MISMA redacción que el consejo de factura
  (`utils/consejoFactura.js`) — «SUMINISTRO E INSTALACIÓN DE BOMBA DE CALOR AIRE-AGUA (AEROTERMIA) MARCA
  …, MODELO …, DE … KW, PARA CALEFACCIÓN [Y AGUA CALIENTE SANITARIA], EN SUSTITUCIÓN DE LA CALDERA DE
  GASÓLEO EXISTENTE, CONECTADA A LOS RADIADORES EXISTENTES DE LA VIVIENDA» — **sin nº de serie** (en un
  presupuesto aún no existe) y **sin corchetes**: lo que no se sabe se omite. Así la factura de después
  casa con lo presupuestado. Detrás, los `EXTRAS` marcados (los de los presupuestos de RCA, en el orden
  del catálogo) y el remate «MATERIAL AUXILIAR, CONEXIONADO HIDRÁULICO Y ELÉCTRICO, PUESTA EN MARCHA Y
  PRUEBAS». Todo se puede editar en la pantalla.
- `calcularPresupuesto`: por defecto **un precio para toda la obra** (va en la 1.ª línea con cantidad 1,
  como presupuesta RCA), o por partidas. `con_iva: true` = el importe dicho ya lleva el IVA: se saca la
  base y el TOTAL es exactamente el dicho (no baila un céntimo). IVA `round(base × pct) / 100`, igual
  que la factura.
- `siguienteNumero`: de los `N/AA` de este año, el mayor + 1.
- `mensajeParaCliente`: el texto que el instalador REENVÍA a su cliente con el PDF. Lo firma él con su
  nombre comercial (`firmaDe`: el acrónimo de la ficha, «RCA Instalaciones»), de tú, corto y sin emojis.

### La plantilla: la de su factura, con otro fondo

El título «FACTURA» no lo escribe el código: va dibujado en el fondo PDF del instalador (igual que
«Importe factura» y «TOTAL FACTURA»). Para RCA el fondo del presupuesto se sacó **de su mismo Word**
(`plantilla.docx`): se cambian los tres textos (`FACTURA` → `PRESUPUESTO`, `Importe factura` →
`Importe`, `TOTAL FACTURA` → `TOTAL PRESUPUESTO`), se vacía el cliente de muestra y se exporta con Word
a PDF. Sale idéntico, con su Georgia y su subrayado, y **las posiciones no cambian**.

`plantilla.json` gana una sección:

```json
"presupuesto": {
  "fondo": "fondo_presupuesto.pdf",
  "numero": { "ejemplo": "39/26" },
  "validez_dias": 30,
  "notas": "El presupuesto no incluye la alimentación eléctrica."
}
```

- `fondo`: el PDF en blanco del presupuesto (en la carpeta del instalador, con lo demás).
- `numero.ejemplo`: **el último presupuesto que se le conoce hecho fuera de la app**. El nº sugerido es
  el mayor de: los hechos en la app, los leídos de los presupuestos que subió a sus obras
  (`presupuestos_leidos.AEROTERMIA.numero`) y éste; más uno. Lo puede cambiar.
- Lo que la sección sobreescriba de `numero`, `fecha`, `tabla` o `totales` manda sobre lo de la factura.

`componerPdf(plantilla, datos, calculo, { tipo: 'presupuesto' })` ([facturaInstaladorService.js](implementation/backend/services/facturaInstaladorService.js))
usa ese fondo y, en vez de «INMUEBLE / REF. CATASTRAL / observaciones del IRPF», escribe la dirección de
la obra (solo si no es la del cliente), las notas y la validez. La rama de la factura no cambia.

**REGLA — un instalador SIN plantilla (o sin la sección `presupuesto`) también puede presupuestar: sale
la hoja GENÉRICA** (`hojaGenerica` en [presupuestoInstaladorService.js](implementation/backend/services/presupuestoInstaladorService.js):
sus datos de `prescriptores`, PRESUPUESTO, nº, fecha, cliente, tabla y totales). Nunca falla por no
tener plantilla.

**Instalador nuevo con plantilla**: su Word de factura → los tres textos cambiados → exportado en blanco
con Word → `fondo_presupuesto.pdf` a su carpeta + la sección `presupuesto` en su `plantilla.json`.

### Dónde se guarda

Tabla `instalador_presupuestos` ([instalador_presupuestos_schema.sql](implementation/backend/scripts/instalador_presupuestos_schema.sql),
regla 150; **va ANTES del deploy**): el emisor (`prescriptor_id`), nº, fecha, la FOTO del cliente tal
como salió impreso, la obra, las líneas, los totales, el `origen` (`app` · `whatsapp`), la oportunidad a
la que se liga y el estado de la simulación. **El PDF no se guarda** (regla 21): se compone cada vez con
los datos. Un nº por instalador; los anulados lo liberan.

**REGLA — el `prescriptor_id` lo pone SIEMPRE el servidor (la sesión, o el grupo configurado), un
instalador solo ve y toca SUS presupuestos (404 a lo ajeno) y el cliente tiene que ser SUYO**
(`resolverCliente`: por DNI, luego teléfono, luego nombre completo; uno → se reutiliza y se le rellenan
solo los huecos; varios → `CLIENTE_AMBIGUO` con candidatos; ninguno → se da de alta con su
`prescriptor_id`). Un DNI que ya es de otro cliente de la casa → 409 sin decir de quién.

### En la app

Sección «Presupuestos» (`seccion=presupuestos`, ficha `presupuesto=<uuid>|nuevo`; regla 236: en la
dirección nunca viaja un nombre). Una pantalla en PASOS (ver «Paso a paso» abajo): el cliente (buscar
entre los suyos o darlo de alta en línea) → la obra (tipo, caldera, agua caliente, emisor, dirección) →
el equipo → lo que incluye (los extras y las líneas, editables) → el precio → nº, fecha, validez y nota.
Vista previa REAL del PDF (`POST /presupuestos/vista-previa`, no guarda ni
gasta número), como la de la factura. Rutas en [routes/instaladorApp.js](implementation/backend/routes/instaladorApp.js)
(`enforceAuth` + beta): `GET /presupuestos`, `GET /presupuestos/nuevo`, `POST /presupuestos/vista-previa`,
`POST /presupuestos`, `GET|PUT /presupuestos/:id`, `POST …/anular`, `GET …/pdf`, `POST …/whatsapp`,
`POST …/vincular`.

Hecho el presupuesto: **Descargar**, **Envíamelo por WhatsApp** y **Calcular el bono CAE**.

**REGLA — «Envíamelo por WhatsApp» manda el PDF al teléfono DEL PROPIO instalador (el de su ficha), nunca
a un número que venga del navegador, con el mensaje para el cliente de pie: él lo reenvía tal cual.** La
app no escribe al cliente del instalador (regla 237: el instalador pasa las cosas con SU WhatsApp).

**REGLA — «Calcular el bono CAE» abre la «Nueva simulación» de SIEMPRE, ya rellena con el cliente, la
dirección, el equipo y el importe del presupuesto, y la vivienda se CONFIRMA en su paso de siempre
(`ConfirmationCard`: la foto de la fachada y los vecinos ±números).** Es justo el problema de Fran: «las
direcciones… en catastro suele bailar unos números». Al crearse la oportunidad, el presupuesto se liga
(`POST …/vincular`): su PDF sube al apartado `DOC_PRESUPUESTO` y el historial de la oportunidad lo dice
(«📄 Presupuesto 40/26 de … hecho en la app: 9.200,00 € + IVA = 11.132,00 €») para que BROKERGY lo
identifique. **Ligar un presupuesto a una oportunidad que ya existía NO cambia `inputs.presupuesto`**:
eso recalcula la propuesta y lo hace el equipo.

Al ligarlo, el PDF se guarda además como `PRESUPUESTO DE LA INSTALACIÓN.pdf` en «0. PRESUPUESTO», que es
donde lo buscan la acción «Tu presupuesto» de la obra y los anexos de la propuesta (sin eso la obra
seguía diciendo «Aún no tenemos tu presupuesto» con uno hecho en la app). **Solo si ahí no hay ninguno**:
el que subió él o leyó el equipo no se pisa ni pasa a `_old`.

### Paso a paso, y el equipo de su catálogo, de otra marca o genérico (22/11/2026)

Fran, tras probarlo: «que sea como por pasos y se vayan cerrando los pasos conforme se van haciendo… se
selecciona el cliente y se cierra, luego se puede volver en cualquier momento. La selección de los
modelos de aerotermia y marca, que filtre por marca y por modelo o si quiere poner uno genérico también,
pero que sean fáciles de elegir o quitar y cambiar… muchas de las cosas se harán con el teléfono». Antes
eran cinco tarjetas abiertas a la vez (en el móvil, cuatro pantallas de scroll) y el equipo eran dos
cajas de texto con un `datalist` de marcas y hasta cuatro sugerencias, que desaparecían en cuanto había
uno elegido: cambiarlo era borrar a mano.

**REGLA — el formulario va en PASOS, UNO abierto cada vez; cerrado, cada paso dice en una línea lo que
tiene y se reabre tocándolo.** Seis pasos (cinco en «otra obra», que no tiene equipo: lo que lleva se
escribe en la obra). «Seguir con …» cierra el paso y abre el siguiente que falte; elegir un cliente de la
lista sigue SOLO. Un paso visto y completo lleva ✓ verde; visto e incompleto, «!» en ámbar. Al entrar: en
uno nuevo se abre el primero que falta (desde la ficha de un cliente, ya la obra o el equipo); en «Hacer
otro igual», el cliente; **cambiando uno hecho, todos cerrados** (se ve el presupuesto entero en seis
filas y se toca lo que se quiere cambiar). Guardar con algo que falta abre ese paso; un 400/409 del
servidor abre el paso del campo (`pasoDeCampo`) y pone el error junto a él. El paso que se abre se trae a
la vista. Qué está listo, los resúmenes, el paso inicial, el siguiente y el de cada error son funciones
puras de [logic/presupuestoApp.js](implementation/frontend/src/features/instalador/logic/presupuestoApp.js)
(`pasosDe`, `pasosListos`, `resumenesDe`, `pasoInicial`, `siguientePaso`, `pasoDeCampo`).

**REGLA — el equipo se pone de TRES maneras, a un toque: «Mi catálogo», «Otro modelo» y «Genérico».**
[views/ElegirEquipo.jsx](implementation/frontend/src/features/instalador/views/ElegirEquipo.jsx):
- **Mi catálogo** (solo en aerotermia y si su catálogo tiene equipos: es el SUYO, `/catalogo`, solo sus
  marcas, reglas 234/240): las marcas en fichas con cuántos modelos tiene cada una, un buscador por
  modelo, referencia o kW («8 kw») sin tildes ni mayúsculas (`filtrarEquipos`) y la lista a un toque, con
  los kW delante. Elegido, se queda en una tarjeta con **Cambiar** (abre la lista en su marca, «Dejarlo»
  la cierra) y **Quitar**. La potencia es la del equipo elegido (`equipoDelCatalogo`), no la del anterior.
- **Otro modelo**: marca y modelo escritos (la marca sugiere las suyas). Lo elegido del catálogo queda
  escrito para retocarlo y su id solo se suelta AL TECLEAR: volver a «Mi catálogo» sin tocar nada lo
  encuentra elegido.
- **Genérico**: sin marca ni modelo; la línea dice «bomba de calor aire-agua (aerotermia), de X kW»
  (`conceptosDe` ya lo hacía con marca y modelo vacíos). Se pide al menos la potencia (los litros en
  agua caliente).
El modo es solo de pantalla (`equipoModo`, no viaja a la API): uno guardado con id es «catálogo», con
marca o modelo «otro modelo» y sin nada «genérico» (`modoEquipoDe`).

El CSS de los pasos y del selector va aparte, en [ui/estiloPresupuesto.js](implementation/frontend/src/features/instalador/ui/estiloPresupuesto.js),
montado solo por el formulario; mismos tokens que `estilo.js`. Comprobado en el banco a 360, 375 y
1280 px: sin scroll horizontal en ningún paso abierto, y en PC el PDF sigue al lado.

### Por WhatsApp, en el grupo del instalador

[services/presupuestoGrupoWhatsapp.js](implementation/backend/services/presupuestoGrupoWhatsapp.js). Desde la fase 6 (22/11/2026) las piezas sin canal (fusionar, qué falta, tipo y extras por defecto,
resolver el cliente, crear y cambiar) viven en [services/presupuestoMotor.js](implementation/backend/services/presupuestoMotor.js),
compartidas con el chat de la app: ver «La app del INSTALADOR, fase 6».
Grupo de la beta: «RCA - BROKERGY». El instalador escribe o manda un audio («hazme un presupuesto de
cambio de caldera de gasoil por aerotermia Panasonic, 9.200 más IVA, para Fulano, calle Tal 2 de
Tomelloso») y el grupo recibe el PDF con el mensaje para su cliente de pie y, aparte, una burbuja para
él («Presupuesto 40/26 para …: 9.200,00 € + IVA = 11.132,00 €. Reenvíaselo tal cual…»).

**REGLA — el modelo solo EXTRAE; la conversación la lleva el CÓDIGO.** [presupuestoPedidoCerebro.js](implementation/backend/services/presupuestoPedidoCerebro.js)
recibe lo que ha dicho el instalador (los audios, ya transcritos con Gemini) como DATO delimitado, **sin
herramientas**, y devuelve un JSON (qué quiere, cliente, obra, importe, si el IVA va dentro, la respuesta
sobre la vivienda) que el código valida y recorta. Por la suscripción (`oauth`: el contenedor del
asistente, `POST /extraer` del vigía, `claude -p --tools ""`) o por la API (`api`: `ANTHROPIC_API_KEY`,
salida estructurada); `auto` = la suscripción si hay `ASISTENTE_URL`. Lo que el instalador escribe nunca
se ejecuta ni se copia a un encargo: es texto de un tercero.

La conversación (tabla `instalador_wa_pedidos`, una ABIERTA por grupo y autor, caduca a las 24 h):

1. **Falta el cliente → se pide ANTES DE NADA** («¿Para qué cliente es? Dime nombre y apellidos,
   teléfono y la dirección de la obra…»). Con nombre, se busca entre los suyos; varios → se listan
   numerados; ninguno → se da de alta.
2. Falta la obra o el importe → se pide lo que falte, de una vez.
3. Con todo → presupuesto + PDF al grupo. «Ponle 9.500», «añade depósito de inercia» → se cambia el
   MISMO número y se reenvía. También **«la localidad es Argamasilla de Alba»**: un dato del cliente
   (dirección, localidad, CP, provincia, teléfono) distinto del que salió impreso es un cambio.

**REGLA — al cambiar un presupuesto, lo que el instalador CORRIGE de su cliente se escribe en SU ficha y
sale en el PDF; y si el PDF saldría igual, no se reenvía ni se dice «actualizado».** Medido el 22/11/2026
con el 40/26 de RCA: el audio entendió «La Macía de Alba», el agente dio de alta a la clienta con esa
localidad y Fran la corrigió tres veces («Es Argamasilla de Alba», «Está mal la localidad!!», «Pero lo
tienes que cambiar en el cliente»). Las tres veces volvió el MISMO PDF con «actualizado»: el PDF imprime
la FICHA del cliente y `resolverCliente` solo rellena huecos (nunca pisa un dato, y eso sigue valiendo al
CREAR). Ahora `cambiarDelPedido` ([presupuestoMotor.js](implementation/backend/services/presupuestoMotor.js))
cambia sobre el MISMO cliente de la fila (no lo busca otra vez por el nombre), compara lo que el pedido
sabe con lo IMPRESO y pasa la diferencia a `actualizar({ corregirCliente })`
([presupuestoInstaladorService.js](implementation/backend/services/presupuestoInstaladorService.js)), que
la escribe en la ficha **solo si es SUYA** (`prescriptor_id`) y **solo esos cinco campos**: nombre y DNI
cambian QUIÉN es y van por la app, en Clientes. `queCambia` dice qué ha cambiado en lo impreso: la
burbuja lo cuenta («He cambiado localidad: Argamasilla De Alba») y, vacío, el agente contesta «Con eso el
presupuesto 40/26 sale igual…» sin mandar el PDF. Pruebas en `test_presupuesto_grupo_whatsapp.js` y
`test_presupuesto_instalador.js`.
4. **Simulación → se confirma la VIVIENDA**: dirección → Google → Catastro, EN SERIE (reglas 15-17,
   [viviendaCandidata.js](implementation/backend/services/viviendaCandidata.js)) → al grupo, la FOTO de la
   fachada del Catastro con «Según el Catastro es CL MURCIA 2(A), Tomelloso · vivienda de 133 m², año
   1999. ¿Es esta la casa? Contesta SÍ, o dime el número correcto o pásame la referencia catastral».
   «No, es el 4» → se prueba ese. Una parcela con varias viviendas → se listan para elegir. Si esa casa
   ya tiene oportunidad, se dice y no se duplica.
5. Vivienda confirmada → se **encarga** la simulación a BROKERGY (`asistenteCanal.pedirTarea`, clave
   `sim-ppto:<id>`), con un texto COMPUESTO POR EL CÓDIGO (partner, cliente, RC confirmada, caldera,
   aerotermia, importe con IVA y la orden de ligarlo: `presupuesto_instalador_cli.js vincular`). El alta
   la hace el asistente con la skill `alta-oportunidad`, como las demás; **la propuesta no sale sin el
   «sí» de Fran**. Al grupo: «Vivienda confirmada. Ya lo tenemos en BROKERGY para calcular el bono…».

**REGLA — solo se atiende a los grupos de `PRESUPUESTO_WA_GRUPOS` y, dentro, a los teléfonos de la ficha
de ese instalador y a los de `PRESUPUESTO_WA_PROBADORES`; solo se escribe al `chatId` del grupo
configurado, jamás a un número sacado de un mensaje.** Antes de gastar un modelo: o hay un pedido abierto
de ese autor en la última hora, o el mensaje habla de presupuesto / simulación / bono. Lo demás del grupo
(dos personas hablando de otra cosa) no se toca.

**REGLA — nace APAGADO (`PRESUPUESTO_WA_ENABLED`) y, encendido, en modo COPIA
(`PRESUPUESTO_WA_MODO=copia`): no escribe en el grupo ni guarda nada; calcula sin guardar y le copia a
Fran lo que habría contestado.** `real` cuando las copias están bien. **Sin la franja de la casa**
(22/11/2026, Fran: «quítalo»; su primera prueba, a las 23:00, se quedó callada esperando a las 7:00 y el
deploy de después la perdió): es la herramienta del instalador en SU grupo, no un mensaje a un cliente, así
que contesta a cualquier hora; `PRESUPUESTO_WA_HORARIO=casa` vuelve a la de la regla 205. Tope diario por
grupo (`PRESUPUESTO_WA_TOPE_DIA`, 20), cada mensaje una vez, y con un fallo del modelo o de la BD un
único «ahora mismo no puedo hacerlo, te lo hacemos nosotros en un rato» y aviso al equipo: nunca un
presupuesto a medias. **En el `.env` local, apagado** (local = datos de producción). En copia, a Fran
le llegan también el PDF y la foto de la fachada (solo a su chat de copias), no solo su nombre.

**REGLA — el AUDIO se baja con `whatsappMedia._BAJAR`, nunca con `msg.downloadMedia()`** (22/11/2026):
el de la librería pasa por el `serialize()` que WhatsApp rompió (regla 68.b) y el primer audio de Fran en
el grupo murió ahí («audio sin transcribir: r», con la sesión sana). `_BAJAR` va en la fila de las
demás lecturas y con plazo; la transcripción, la de siempre (`transcribirBuffer`, Gemini). Un audio que
no se puede escuchar **no se calla**: se pide que lo repita o lo escriba (en copia, a Fran). Y el id del
mensaje lo arma `idDelMensaje` (`fromMe_remote_id_participant`, como WhatsApp Web): en un grupo con
`@lid` la clave llega sin `_serialized` y `String(msg.id)` daba «[object Object]» — `_BAJAR` no
encontraba el audio y todos los mensajes compartían la marca de «visto». Si aun así no casa, se busca
el mensaje por su id corto dentro de ese chat.

Encenderlo para probar (el `.env` del VPS, tras el deploy):

```
PRESUPUESTO_WA_ENABLED=true
PRESUPUESTO_WA_GRUPOS=<chatId del grupo>@g.us=<id_empresa del instalador>
PRESUPUESTO_WA_PROBADORES=<teléfono de quien prueba>
PRESUPUESTO_WA_SOLO_PROBADORES=true
PRESUPUESTO_WA_MODO=copia
```

### Para el equipo

- `node implementation/backend/scripts/presupuesto_instalador_cli.js listar [--instalador X] [--sin-simulacion]`
  · `ver` · `pdf <id> --out f.pdf` · `vincular <id> <id_oportunidad> [--escribir]`.
- Banco del agente (cerebro real, BD de pedidos en memoria, nada se envía ni se guarda):
  `node scripts/probar_presupuesto_wa.js "mensaje 1" "mensaje 2" … --env <.env> --instalador <id_empresa> [--out carpeta] [--catastro]`.

### Comprobado (22/11/2026)

- El presupuesto de ejemplo en la plantilla de RCA (40/26, 9.200 + 1.932 = 11.132 €): nada se pisa ni
  se sale; la hoja genérica, igual.
- El banco con el modelo real y el Catastro real, en tres turnos: pide el cliente → presupuesto 40/26 y
  foto de la fachada de «CL MURCIA 2(A), Tomelloso · 133 m², 1999» → con el «sí», el encargo compuesto.
  Unos 3 s por turno.
- **Sin probar todavía, porque necesita el servidor**: el listener real del grupo (el paso de `@lid` a
  teléfono, bajar y transcribir un audio, el envío con su ACK), la ruta `/extraer` de la suscripción
  dentro del contenedor y `pedirTarea` contra el asistente.

Tras tocarlo: `node implementation/backend/scripts/test_presupuesto_instalador.js`,
`test_presupuesto_grupo_whatsapp.js`, `test_factura_instalador.js`, `test_app_instalador.js`,
`test_navegacion_instalador.mjs`, `test_presupuesto_pasos.mjs`, `test_rutas_sin_sesion.js`,
`auditar_rutas_sin_guardian.js`, `npm run build` y el banco a 360 y 1280 px (`?seccion=presupuestos`,
`?presupuesto=nuevo`).
