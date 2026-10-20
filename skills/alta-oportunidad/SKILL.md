---
name: alta-oportunidad
description: 'Lleva a la app de BROKERGY lo que un instalador o un cliente manda por WHATSAPP o por EMAIL (Gmail). (1) DA DE ALTA la oportunidad sin rellenar el formulario: lee el chat o el correo (texto, fotos, PDF, notas de voz), saca la referencia catastral, la caldera y su PLACA, el croquis, el presupuesto y el titular, y la crea por las MISMAS funciones que «Nueva simulación». (2) Si la oportunidad o el expediente YA EXISTE, la DOCUMENTA: fotos, vídeos y CEE a sus apartados de «12. DOCUMENTOS PARA CEE», ventana por ventana. Pone el nº de obra en el título de la sesión y, si vino por WhatsApp, en el nombre del chat (RES080_OP52 …). Úsalo con "da de alta lo que ha mandado ISM", "crea la oportunidad con lo del WhatsApp de X", "da de alta lo que ha mandado Instalaciones Plaza por email", "revisa el email de X y guárdalo para la simulación", "26RES080_OP52: guarda lo que ha mandado". Sin emisor declarado, RADIADORES. Primero en seco; lo dudoso se pregunta o se marca para revisar. La propuesta se envía desde la app.'
---

# Alta de oportunidad desde WhatsApp o email

El instalador pide una simulación por WhatsApp (o por email) y manda, en una ráfaga de mensajes o en
un correo con adjuntos, casi siempre lo mismo:
la **referencia catastral** (escrita, en captura o en el PDF del Catastro), la **foto de la caldera**,
la **foto de su placa**, a veces si son **radiadores** o no, y de vez en cuando un **croquis** o el
**presupuesto**. Con eso esta skill hace lo que antes era rellenar «Nueva simulación» a mano:
deja la oportunidad en **PTE ENVIAR**, con su simulación calculada, el cliente dado de alta y los
documentos en sus apartados de Drive.

- **Todo sale por las MISMAS funciones que el formulario** (`funnelToCalculatorInputs`,
  `computeFullCalculatorResult`, `createLead`, `subirFicherosASlot`): la oportunidad de la skill y la del
  formulario no pueden diferir.
- **El chat se LEE en el servidor** (la sesión de WhatsApp vive en el VPS): solo lectura — no se envía
  nada, no se marca nada como leído, no se crea ningún chat. **El correo, igual**: se baja y se lee,
  nunca se contesta ni se marca (ver «Si llega por EMAIL»).
- **El modelo solo LEE; el plan lo escribe quien ha mirado cada foto.** Las lecturas con IA (placa,
  presupuesto, RC, notas de voz) son una ayuda: se contrastan con el fichero antes de entrar en el plan.
- **No se inventa**: lo que no se puede afirmar se PREGUNTA (una frase concreta) o se escribe en
  `decisiones` para que se revise en la app.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`.
- **Dónde se ejecuta — Claude Code o Cowork:** los comandos van SIEMPRE en el PC (repo + `.env`). En
  Code, por la shell; en **Cowork, por Desktop Commander, nunca en el sandbox**. Ver
  [comun/entorno.md](comun/entorno.md). Esta skill **no necesita el motor** (`cee-engine`).

## La herramienta

Todo pasa por `implementation/backend/scripts/alta_oportunidad.js` (desde `implementation/backend`):

| Orden | Qué hace | Escribe |
|---|---|---|
| `chats "<nombre>"` | Busca el chat por su nombre en el WhatsApp de la empresa («ism alejandro») | nada |
| `chat <tel\|chatId> [--dias 14] [--desde "AAAA-MM-DD HH:MM"] [--bajar bloque\|todo\|no]` | Lee la conversación, marca con ▶ la ráfaga de la PETICIÓN y baja sus adjuntos (fotos, PDF, notas de voz) a `scratch/alta-oportunidad/<tel>-<fecha>/` | nada (solo ficheros locales) |
| `escuchar <audio.ogg> […]` | Transcribe notas de voz | nada |
| `catastro <RC> [--dni X]` | El inmueble (construcciones con su código, año, zona), si ya hay oportunidad de esa vivienda y si el DNI ya es cliente | nada |
| `leer --placa a.jpg[,b.jpg] [--combustible gasoleo]` | Lee la placa de la caldera (potencia útil, nº de serie, combustible) | nada |
| `leer --presupuesto p.pdf` | Lee el presupuesto (base, IVA, total) y casa la aerotermia y el equipo de ACS con el catálogo | nada |
| `leer --rc f.pdf\|foto.jpg` | Saca la referencia catastral de un PDF o una captura | nada |
| `aerotermia "<marca> <modelo>"` | Busca un equipo en el catálogo por su código | nada |
| `crear --plan plan.json [--escribir]` | Da de alta la oportunidad, el cliente, la carpeta de Drive y sube los documentos | con `--escribir` |
| `obra <26RES080_OP52\|26RES080_87>` | Una oportunidad o expediente que YA existe: cliente, Drive, nº para el chat y sus apartados (con lo ya subido) | nada |
| `documentar --op <nº> --plan docs.json [--escribir]` | Coloca fotos, vídeos y documentos del chat en los apartados de ESA obra («12. DOCUMENTOS PARA CEE»), ventana por ventana, y lo anota en su historial | con `--escribir` |
| `renombrar --op <nº> --tel <tel> [--anteponer] [--escribir]` | Pone el nº de obra en el nombre del chat («RES080 Maria José…» → «RES080_OP52 Maria José…») y dice el título de la sesión | con `--escribir` |
| `correo-raw <fichero> [--out DIR]` | Abre el correo que bajó el conector de Gmail (`get_message` RAW, guardado en `tool-results/…`) o un `.eml`: cuerpo, adjuntos numerados (sin duplicados ni logos) y el partner del remitente, en `scratch/alta-oportunidad/<remitente>-<fecha>/` | nada (solo ficheros locales) |
| `correo "<remitente o asunto>" [--dias 14] [--uid N]` | Lo mismo leyendo el buzón de Hostinger (franciscojavier.moya@brokergy.es) por IMAP, en SOLO LECTURA: lista y, con uno (o `--uid`), lo baja | nada (solo ficheros locales) |

**Sin `--escribir` no se toca nada**: siempre primero en seco.

## El recorrido

1. **Encontrar el material.**
   - **WhatsApp**: el usuario nombra el chat como lo ve en el móvil («el WhatsApp de ISM Alejandro
     Administración»): `chats "ism alejandro"`. Si sale más de uno, pregunta cuál.
   - **Email** («lo que ha mandado X por email», «revisa el correo de X»): conector de Gmail →
     `get_message` RAW → `correo-raw`, o `correo` por IMAP. Ver **«Si llega por EMAIL»**; deja la
     carpeta con el cuerpo y los adjuntos, y se sigue en el **paso 3** (el cuerpo se lee como el chat).
2. **`chat <tel>`** (solo WhatsApp). Lee el listado entero, no solo el bloque ▶: la petición puede venir en dos días
   (la RC el lunes, las fotos el martes) → `--desde`. Y hay chats con varias obras mezcladas (un
   instalador manda cosas de varios clientes): quédate con lo que es de ESTE cliente.
   - Las **notas de voz** se transcriben (`escuchar`): el instalador dice de viva voz lo que no escribe
     («son radiadores», «la casa es solo de ella»). Las nuestras (NOSOTROS) también se leen: a veces
     ya se le contestó algo que cambia el alta.
   - Las **tarjetas de contacto** traen el teléfono. Mira de QUIÉN es: «ese es el teléfono de su
     marido» no es el teléfono del titular.
3. **Mira cada fichero** (las fotos con la vista; los PDF, leyéndolos). Clasifica:
   - la PLACA de la caldera → `leer --placa <placa>,<caldera entera> --combustible <x>`. Contrasta
     marca, modelo, potencia y combustible con la foto.
   - la caldera entera, el croquis, el presupuesto, la captura/PDF del Catastro.
   - El presupuesto → `leer --presupuesto` (importe CON IVA, la aerotermia y el ACS en el catálogo).
     Si trae **placas fotovoltaicas** de esta obra, su importe CON IVA (sácalo de las líneas del
     PDF: el lector deja la obra civil en la aerotermia) va a `presupuesto.fotovoltaica_con_iva`, y
     su presupuesto aparte, si lo hay, a `presupuesto.fichero_fv`: P. Fotovoltaica, que sube la
     deducción del IRPF (26RES060_OP310: de 5.927 € a 9.000 €). Ver `referencia/plan.md`.
   - Un **CEE** (PDF): mira su fecha, la demanda de calefacción, la superficie y los equipos
     (`pdftotext -layout` basta para leerlo). Va a `cee` del plan (ver la regla del CEE).
4. **`catastro <RC> --dni <DNI>`**.
   - Si **ya hay una oportunidad** de esa vivienda: **PARA y pregunta**. Puede ser una actualización
     («ha cambiado el presupuesto») y no una alta nueva. Esta skill solo da de alta: `crear` se niega,
     y solo sigue con `"permitir_duplicado": true` si de verdad es otra alta (otro titular, la anterior
     rechazada).
   - Una RC de 14 es la PARCELA: hace falta la de la vivienda (20).
5. **Escribe el plan** (`referencia/plan.md`) en la carpeta del chat, con las **decisiones** explicadas
   una a una — van al historial de la oportunidad y son lo que se revisa.
6. **`crear --plan plan.json`** en seco. Revisa la ficha que imprime (superficie, caldera y η, emisor,
   ACS, aerotermia y SCOP, presupuesto, ahorro y bono) y que cada documento tiene ✓. Luego `--escribir`.
7. **Nombre del chat y de la sesión** (ver «Al terminar, SIEMPRE»). Por email no hay chat: se dice.
8. **Informe final** (abajo).

## Si llega por EMAIL

El correo llega a Gmail (`franciscojavier.moya.s2e2@gmail.com`, que recibe también lo de
`franciscojavier.moya@brokergy.es`). Detalle, alternativa en Python y el caso completo en
[referencia/correo.md](referencia/correo.md).

1. **Encontrarlo y bajarlo** — dos caminos; los dos dejan `cuerpo.txt`, `correo.json` y los adjuntos
   numerados en `scratch/alta-oportunidad/<remitente>-<fecha>/`, como `chat`:
   - **a) Gmail, el principal** (ahí está todo). El conector de claude.ai **no baja adjuntos**:
     `search_threads` (`from:… has:attachment newer_than:7d`) → `get_message` con
     `messageFormat: "RAW"`. Como pasa del límite, Claude Code guarda la salida en
     `~/.claude/projects/<proyecto>/<sesión>/tool-results/…get_message-….txt` (JSON con `raw` = el
     MIME en base64url) → `correo-raw "<ese fichero>"`. Probado el 19/10/2026 con correos de 72 KB a
     8,5 MB.
   - **b) IMAP del buzón de Hostinger** (solo lo que llega a brokergy.es): `correo "plaza" --dias 14`
     lista; con uno solo lo baja, con varios `--uid N`. En solo lectura: no marca nada como leído.
2. **Mismo recorrido desde el paso 3**: mirar cada fichero, `leer`, `catastro`, plan, `crear` (o
   `documentar`) en seco y `--escribir`. Lo que cambia:
   - **El cuerpo del correo se lee como los mensajes del chat** (el aviso legal y la firma no cuentan).
   - **El partner sale del remitente**: la orden lo busca en la ficha del prescriptor (su email, el
     dominio si es de empresa, o la razón social del nombre) y lo imprime; se contrasta con quien firma
     el presupuesto. Si escribe el propio cliente, el partner es el instalador del presupuesto.
   - **Adjuntos duplicados** (mismo contenido, por hash) y logos en línea **se descartan solos** y se
     listan. Los nombres («WhatsApp Image … .jpeg») no dicen lo que son: se mira cada uno.
   - **En el plan va `correo` en vez de `chat`**, sin `wa_msg_id` (`referencia/plan.md`): el
     historial dice «📧 … por email de X «asunto»».
   - **No hay chat que renombrar**: ese paso se salta y se dice; el título de la sesión, sí.

Ejemplo: INSTALACIONES PLAZA 2014 SL (`correo-del-instalador@hotmail.com`), 19/10/2026, «DOCUMENTACION
PARA SUBVENCION»: el presupuesto 189 (PDF), el recibo del IBI con la RC y fotos de la caldera ACV
Delta —el esquema eléctrico de la tapa, no la placa: sin placa, la fila más reciente de su tipo y se
pide la placa—; una foto repetida, descartada; el partner PLAZA, por el email de su ficha.

## Si la oportunidad o el expediente YA EXISTE — `documentar`

El cliente sigue mandando cosas cuando la obra ya está dada de alta: las fotos de la vivienda, el
vídeo, su CEE, la carpintería que se cambia. El usuario lo pide con el nº («26RES080_OP52: guarda la
documentación del chat de María José»).

1. **`obra <nº>`**: de quién es, su carpeta y los apartados que tiene ESA obra (un RES080 con
   ventanas tiene `FOTO_VENTANAS_ANTES`; un RES060 no) con lo que ya hay subido.
2. **`chats` + `chat <tel> --bajar todo`** (o `--desde`): baja lo que mandó. Comprueba que el chat
   es de ESE cliente (nombre del chat, lo que escribe, la dirección del CEE). Por email,
   `correo-raw` / `correo` (arriba), y la misma comprobación con el cuerpo y los adjuntos.
3. **Mira cada fichero** y decide su apartado (tabla en `referencia/plan.md`). Un CEE: que su
   referencia catastral sea la de la obra. Lo que contradiga la simulación (el CEE dice que el agua la
   da un termo y la simulación, la caldera) **no se corrige**: va a `decisiones`.
4. **`docs.json`** (`referencia/plan.md`) → **`documentar`** en seco → `--escribir`.
5. **Nombre del chat y de la sesión.**

Ejemplo: 26RES080_OP52 (02/10/2026) — CEE anterior, 5 huecos de carpintería (V1…V5, «Puerta de
entrada» la V1), el cuarto de caldera, el baño con el termo y el vídeo de la vivienda.

## Al terminar, SIEMPRE (alta y documentar)

1. **La documentación en su sitio**: todo lo que mandó, en los apartados de la obra («12. DOCUMENTOS
   PARA CEE» en Drive), nunca suelto en la raíz ni en el escritorio.
2. **El nº de obra en el nombre del chat de WhatsApp**: `renombrar --op <nº> --tel <tel>` en seco y
   luego `--escribir`. **Si vino por EMAIL no hay chat**: se salta y el informe lo dice (el chat de
   WhatsApp de un instalador nunca se renombra con el nº de una obra). Con expediente, su nº (`RES080_87`); sin él, la oportunidad (`RES080_OP52`).
   Solo se toca el PREFIJO de la casa y lo de detrás se conserva letra a letra.
   - Si el nombre dice OTRA ficha (RES060 frente a RES080), no se toca: suele ser el chat de otra
     persona. `--forzar-ficha` solo si se ha comprobado.
   - Sin prefijo (`sin_prefijo`): `--anteponer` **solo si es el chat del PROPIO cliente**. El chat de
     un INSTALADOR lleva veinte obras y **nunca** se renombra con el nº de una.
   - Un número que no está en la agenda no se guarda desde aquí: se dice.
3. **El mismo nombre en el título de la sesión de Claude** (lo imprime `renombrar`; por email, el «Nº
   de obra para el chat» que imprime `obra <nº>` y el cliente): en Claude Code,
   `set_session_title` con `session_id: "self"`; donde no exista esa herramienta (Cowork), se le dice
   al usuario para que lo ponga a mano. Así se sabe de qué obra es cada conversación.

## Reglas que no se rompen

- **Sin emisor declarado, RADIADORES convencionales** (55 °C, el SCOP más prudente). Solo se cambia si
  lo dice el instalador o los papeles: suelo radiante, fancoils, «radiadores de baja temperatura».
  Un croquis con elementos por estancia o un presupuesto con «circuito de radiadores» confirman radiadores.
  **Una idea del cliente NO es un emisor declarado** (2026-10-14, 26RES060_OP300): «quiero poner suelo
  radiante, o a lo mejor techo, no sé por dónde pillarlo» sin presupuesto ni instalador → RADIADORES, y
  se apunta en `decisiones` que lo está pensando. Solo cuenta lo decidido: un presupuesto, el instalador
  o el cliente diciendo lo que TIENE o lo que se va a instalar.
- **La fila de la caldera (`rendimiento_id` de `BOILER_EFFICIENCIES`, `calculation.js`) la decide la
  PLACA, nunca el año de la vivienda** (regla del usuario, 2026-10-14). Las casas son antiguas, pero la
  caldera casi nunca es la original: poner una caldera «de la época de la casa» hunde el η y infla el
  ahorro.
  - **Con placa que dice el año** (fecha de fabricación, el código de fecha de Junkers/Bosch, el año
    del marcado CE): la fila de ESE año, aunque sea antigua. Si la placa dice 1994, va de antes de
    1998.
  - **Sin placa, o la placa no dice el año**: la fila MÁS RECIENTE de su tipo (combustible,
    condensación o no, mural o de pie según la foto): gasóleo `oil_post98` (0,79) o `oil_cond` (0,83);
    gas `gas_post98_auto` (0,73) o `gas_post98_cond_auto` (0,83). Y se dice en `decisiones` («sin año
    en la placa → ≥ 1998»). El año de construcción de la vivienda **no** cuenta.
  - Filas antiguas, solo con placa que lo diga: `oil_85_97` (0,70), `oil_pre85` (0,65),
    `gas_pre98_mural` (0,65), `gas_79_97` (0,65)…
  - Lo mismo frente al formulario: su «más de 20 años» en gasóleo cae en «anterior a 1985» (η 0,65);
    manda `rendimiento_id`. Y `edad` del funnel coherente con ella (`<10`, `10-20`, `>20`; sin año,
    `no_se`).
- **La potencia es la ÚTIL de la placa** (`Pn`, «potencia térmica/útil», *Output*), no el consumo.
- **El nº de serie de la caldera solo si está rotulado como tal.** En Junkers/Bosch «FD 583 …» es el
  código de FECHA de fabricación: se guarda con `serie_dudosa: true` (no se hereda al expediente).
- **ACS de hoy:** una caldera MIXTA (selector grifo / grifo+radiador, dos salidas, «mixta» en el
  modelo, o el CEE que dice «Calefacción y ACS») → `misma_caldera`; un termo → `termo`. **Se cambia
  el ACS** (`incluir: true`) si el presupuesto trae un equipo de ACS, lo dice el instalador **o la
  caldera que se retira es MIXTA**: al quitarla, el agua caliente la tiene que dar la aerotermia (así
  se hace en 76 de las 93 simulaciones recientes con el ACS en la caldera de gasóleo). Si el
  presupuesto no detalla el depósito, se dice en `decisiones` para confirmarlo con el instalador.
- **El CEE que aporta el cliente** (suele tenerlo de la deducción del IRPF por placas: un inicial y
  un final). Se carga el **MÁS RECIENTE** en `cee` del plan; su justificante de registro va a
  `DOC_CEE_EXISTENTE` y los anteriores (el inicial y su registro) a `OTROS_ANTES`.
  - `modo: "comparativa"` (**por defecto**): la simulación sigue ESTIMADA («CEE nuevo BROKERGY») y la
    propuesta enseña también la cifra «con tu CEE» (demanda × superficie del certificado). Es lo que
    se hace a mano cargando el CEE en «Cálculo Estimado» (OP140, OP152, OP168).
  - `modo: "cee"`: la simulación USA el certificado (como «Nueva simulación» con un CEE en la
    puerta). Entonces las dos cifras coinciden y **no hay comparativa**: solo si se pide así.
  - Lo que declare el CEE sirve para el resto del plan: placas fotovoltaicas (→ `placas:
    {estado:"si", kwp:5}`), si la caldera da el ACS, aires acondicionados (a `decisiones`: se
    quedan). Las placas vienen, según la versión con la que se hizo el CEE, en **«Generación
    renovable eléctrica»** (CE3X 3.x: potencia pico y autoconsumo mes a mes) o en **«Contribuciones
    energéticas»** (CE3X 2.3: «Inst. Fotovolt. 5 kWp»); las dos valen. El rendimiento estacional del
    CEE **no** cambia la fila de la caldera (manda la edad).
  - Solo PDF o fotos: el `.xml` no se lee fuera del navegador.
- **El chat puede ser del propio CLIENTE** (escribe en primera persona: «si tengo subvención»): su
  teléfono es el del chat y el partner es el instalador que firma el presupuesto (o el que va entre
  paréntesis en el nombre del chat).
- **La aerotermia sale del presupuesto** (o de la placa si ya está montada) y se casa con el catálogo.
  Fuera de catálogo va como `{ marca, modelo }`: la simulación usa el SCOP genérico y SE DICE.
  Darla de alta (ficha + EPREL) es de la skill `generar-cee-inicial` (`alta-aerotermia`).
- **Superficie: TODO lo que el Catastro declara como VIVIENDA cuenta, siempre** (regla del usuario,
  2026-10-01). Aunque el croquis solo dibuje radiadores en una planta, la otra planta de vivienda
  cuenta: en 26RES060_OP250 dejar fuera los 34 m² de la planta 1 bajaba el bono de 2.028 € a 1.594 €.
  El código lo impone (`construcciones` no puede quitar una vivienda); solo sirve para AÑADIR algo que
  el Catastro no da como vivienda (un «almacén» que se vive), y se dice en `decisiones`.
  **Excepción: una RC que agrupa VARIAS viviendas** (parcela sin división horizontal: el bajo y el 1º
  con la misma referencia, cada uno con su caldera y su presupuesto). Ahí cada vivienda es una
  oportunidad y cuenta SOLO lo suyo: `vivienda_construcciones` (ver `referencia/plan.md`); la segunda
  lleva `permitir_duplicado`. Caso: 26RES060_OP256 (1º, 166 m²) y OP257 (bajo, 150 + 35 m²).
- **Orientación y patios salen del croquis o de las fotos** (`orientacion`, `patios`): hacia dónde
  mira la fachada principal —la de la calle; el croquis suele ponerlo, «C/ HERNAN CORTES (NORTE)»— y
  cuántos patios interiores hay («PATIO»). Es lo que se corregía a mano en la calculadora: en OP250, N
  y 1 patio suben la demanda de 85,5 a 96,8 kWh/m²·año. Sin dato, orientación «media» y sin patios.
- **El partner es el instalador del chat** (por su acrónimo, que suele ir en el nombre del chat, o por
  el teléfono en su ficha). Si el chat es de un cliente directo, sin partner.
- **El cliente es el TITULAR** (el que va en el presupuesto/escritura): nombre, apellidos, DNI. La
  dirección que dé el instalador manda sobre la del Catastro para el cliente (el portal puede ser otro).
  Un teléfono que no es suyo no se pone como suyo: va en `decisiones`.
- **Placas solares: sin declarar** (`null`) salvo que se diga. «Sin declarar» no es «no».
- **Nunca** se manda nada al cliente ni al instalador desde aquí.

## Lo que el informe final dice SIEMPRE

- El nº de la oportunidad, el enlace `https://app.brokergy.es/?op=<id>`, la carpeta de Drive y el enlace
  de subida de documentación.
- Superficie, orientación y patios, caldera (y η), emisor, ACS, aerotermia y SCOP, presupuesto, ahorro
  y **bono CAE**. Con CEE, las **dos cifras de la comparativa** (con su CEE · CEE nuevo BROKERGY).
- Las **decisiones** tomadas y **lo que hay que revisar** (equipo fuera de catálogo, superficie
  parcial, nº de serie dudoso, teléfono que falta…).
- El **nombre nuevo del chat** de WhatsApp y el **título de la sesión**, o por qué no se ha tocado (por
  email: no hay chat). De dónde salió: el chat, o el correo (remitente, fecha y asunto).
- Que la **propuesta (PDF) se revisa y se envía desde la app** — la skill no envía nada.

## Después del alta: preguntarle a Fran por WhatsApp (costumbre desde 2026-10-05)

Claude trabaja como un compañero más: con la oportunidad hecha, **antes de enviar nada** le escribe a
Fran desde el WhatsApp de la EMPRESA a su móvil PERSONAL (el chat con la etiqueta **MOIA**, que ya no
lleva el bot de clientes) con el resumen y la pregunta «¿se la envío así o la quieres revisar tú?».

1. `node scripts/asistente_whatsapp.js avisar <OP> --a partner` en seco (`--a cliente` si el chat es
   del propio cliente; `--nota "…"` para algo que deba saber) → luego `--enviar`.
2. `node scripts/asistente_whatsapp.js leer --esperar 20` lee lo que contesta (transcribe sus notas de
   voz). Si no contesta en la sesión, se queda pendiente y se mira después con `leer`.
3. Según lo que diga:
   - **«Envíala»** → `node scripts/claude_propuesta.js enviar <OP> --a partner` en seco, revisar, y
     `--enviar`. Después `asistente_whatsapp.js decir "✓ Enviada a …" --enviar`.
   - **«La reviso yo»** → no se envía nada; se le confirma («Vale, te la dejo en PTE ENVIAR»).
   - **Un cambio** («ponle la Haier de 16», «presupuesto 9.000») → se corrige, se vuelve a avisar.
   - Dudoso → se le pregunta, nunca se supone un «sí».

El canal está **siempre abierto**: en el VPS, el contenedor `asistente` (implementation/asistente/)
recibe el aviso del backend cuando Fran escribe a la empresa y lanza a Claude con
`implementation/backend/scripts/asistente_instrucciones.md`. Así Fran puede pedir desde el móvil
«prepara la propuesta de Antonio Foncamán» sin que haya nadie delante del PC.

## Cómo se invoca

- Escribiendo `/alta-oportunidad` seguido de lo que hay que hacer:
  `/alta-oportunidad 26RES080_OP52 guarda lo que ha mandado María José` ·
  `/alta-oportunidad da de alta lo último de ISM Alejandro` ·
  `/alta-oportunidad da de alta lo que ha mandado Instalaciones Plaza por email`.
- O sin barra, en lenguaje normal: «26RES080_OP52: guarda la documentación del chat RES080 Maria José
  Valdepeñas», «crea la oportunidad con lo que ha mandado X por WhatsApp», «revisa el email de X y
  guárdalo para la simulación». La skill se carga sola.
- Lo único que hace falta darle: el **nº de obra** (si ya existe) y **el chat** (como se ve en el
  móvil, o el teléfono) **o el correo** (quién lo manda, o el asunto). Si hay varios parecidos,
  pregunta cuál.

## Pruebas

```bash
node implementation/backend/scripts/test_alta_oportunidad.js   # bloque de la petición, plantas, plan → funnel → resultado
node implementation/backend/scripts/test_whatsapp_media.js     # nombres de adjunto, contactos
node implementation/backend/scripts/test_renombrar_contacto.js # el nº de obra en el nombre del chat
```

## Si la lectura del chat falla

`chat`/`chats` llaman a `https://app.brokergy.es/api/whatsapp/conversacion` (y `renombrar`, a
`/api/whatsapp/contactos/renombrar`) con la clave interna del
`.env` (`INTERNAL_API_KEY`, la misma del VPS). Un 503 es que WhatsApp no está conectado en el servidor
(Ajustes → WhatsApp). Si dice que la ruta no está desplegada, hay que desplegar el backend. Mientras,
el usuario puede reenviar los ficheros o dejarlos en una carpeta: el resto de órdenes trabaja con
ficheros locales.

**Por email**: si `get_message` RAW sale en línea en vez de guardarse en fichero, el correo es tan
pequeño que no trae nada que bajar (se lee con `get_message` normal); el base64 no se copia a mano.
Si `correo` (IMAP) no entra, revisa `LOTE_SO_SMTP_USER/PASS` en el `.env`; Gmail sigue valiendo.
