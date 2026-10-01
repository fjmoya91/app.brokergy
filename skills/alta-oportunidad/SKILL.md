---
name: alta-oportunidad
description: 'DA DE ALTA una oportunidad (simulación) de BROKERGY con lo que un instalador mandó por WHATSAPP, sin rellenar el formulario: lee el chat del WhatsApp de la empresa (texto, fotos, PDF, tarjetas de contacto y notas de voz), saca la referencia catastral, la caldera y su PLACA (potencia útil, combustible), el croquis, el presupuesto (importe con IVA y la aerotermia del catálogo) y el nombre y DNI del cliente, y crea la oportunidad por las MISMAS funciones que «Nueva simulación», con sus documentos en Drive. Úsalo cuando el usuario diga "da de alta lo último que ha mandado ISM", "hazle la simulación al cliente que me ha pasado Alejandro", "crea la oportunidad con lo del WhatsApp de X", "mira el chat de N y monta la simulación". Sin emisor declarado se toman RADIADORES. Primero en seco; lo que no se puede afirmar se pregunta o se marca para revisar, nunca se inventa. La propuesta (PDF) se revisa y se envía desde la app.'
---

# Alta de oportunidad desde WhatsApp

El instalador pide una simulación por WhatsApp y manda, en una ráfaga de mensajes, casi siempre lo mismo:
la **referencia catastral** (escrita, en captura o en el PDF del Catastro), la **foto de la caldera**,
la **foto de su placa**, a veces si son **radiadores** o no, y de vez en cuando un **croquis** o el
**presupuesto**. Con eso esta skill hace lo que antes era rellenar «Nueva simulación» a mano:
deja la oportunidad en **PTE ENVIAR**, con su simulación calculada, el cliente dado de alta y los
documentos en sus apartados de Drive.

- **Todo sale por las MISMAS funciones que el formulario** (`funnelToCalculatorInputs`,
  `computeFullCalculatorResult`, `createLead`, `subirFicherosASlot`): la oportunidad de la skill y la del
  formulario no pueden diferir.
- **El chat se LEE en el servidor** (la sesión de WhatsApp vive en el VPS): solo lectura — no se envía
  nada, no se marca nada como leído, no se crea ningún chat.
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

**Sin `--escribir` no se toca nada**: siempre primero en seco.

## El recorrido

1. **Encontrar el chat.** El usuario lo nombra como lo ve en el móvil («el WhatsApp de ISM Alejandro
   Administración»): `chats "ism alejandro"`. Si sale más de uno, pregunta cuál.
2. **`chat <tel>`**. Lee el listado entero, no solo el bloque ▶: la petición puede venir en dos días
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
7. **Informe final** (abajo).

## Reglas que no se rompen

- **Sin emisor declarado, RADIADORES convencionales** (55 °C, el SCOP más prudente). Solo se cambia si
  lo dice el instalador o los papeles: suelo radiante, fancoils, «radiadores de baja temperatura».
  Un croquis con elementos por estancia o un presupuesto con «circuito de radiadores» confirman radiadores.
- **La fila de la caldera la decide su EDAD real, no el «más de 20 años» del formulario.** En gasóleo,
  el formulario lleva «>20» a «anterior a 1985» (η 0,65) aunque la caldera sea de 2005. Usa
  `rendimiento_id` de `BOILER_EFFICIENCIES` (`calculation.js`) con lo que diga la placa (año) o, si
  no lo dice, el AÑO DE LA VIVIENDA (una caldera no es anterior a la casa en que se instaló):
  gas `gas_post98_auto` (0,73) / `gas_post98_cond_auto` (0,83) / `gas_pre98_mural` (0,65);
  gasóleo `oil_post98` (0,79) / `oil_85_97` (0,70) / `oil_pre85` (0,65) / `oil_cond` (0,83).
  Y `edad` del funnel coherente con ella (`<10`, `10-20`, `>20`).
- **La potencia es la ÚTIL de la placa** (`Pn`, «potencia térmica/útil», *Output*), no el consumo.
- **El nº de serie de la caldera solo si está rotulado como tal.** En Junkers/Bosch «FD 583 …» es el
  código de FECHA de fabricación: se guarda con `serie_dudosa: true` (no se hereda al expediente).
- **ACS de hoy:** una caldera MIXTA (selector grifo / grifo+radiador, dos salidas, «mixta» en el
  modelo) → `misma_caldera`; un termo → `termo`. **Se cambia el ACS** (`incluir: true`) si el
  presupuesto trae un equipo de ACS o lo dice el instalador.
- **La aerotermia sale del presupuesto** (o de la placa si ya está montada) y se casa con el catálogo.
  Fuera de catálogo va como `{ marca, modelo }`: la simulación usa el SCOP genérico y SE DICE.
  Darla de alta (ficha + EPREL) es de la skill `generar-cee-inicial` (`alta-aerotermia`).
- **Superficie: TODO lo que el Catastro declara como VIVIENDA cuenta, siempre** (regla del usuario,
  2026-10-01). Aunque el croquis solo dibuje radiadores en una planta, la otra planta de vivienda
  cuenta: en 26RES060_OP250 dejar fuera los 34 m² de la planta 1 bajaba el bono de 2.028 € a 1.594 €.
  El código lo impone (`construcciones` no puede quitar una vivienda); solo sirve para AÑADIR algo que
  el Catastro no da como vivienda (un «almacén» que se vive), y se dice en `decisiones`.
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
  y **bono CAE**.
- Las **decisiones** tomadas y **lo que hay que revisar** (equipo fuera de catálogo, superficie
  parcial, nº de serie dudoso, teléfono que falta…).
- Que la **propuesta (PDF) se revisa y se envía desde la app** — la skill no envía nada.

## Pruebas

```bash
node implementation/backend/scripts/test_alta_oportunidad.js   # bloque de la petición, plantas, plan → funnel → resultado
node implementation/backend/scripts/test_whatsapp_media.js     # nombres de adjunto, contactos
```

## Si la lectura del chat falla

`chat`/`chats` llaman a `https://app.brokergy.es/api/whatsapp/conversacion` con la clave interna del
`.env` (`INTERNAL_API_KEY`, la misma del VPS). Un 503 es que WhatsApp no está conectado en el servidor
(Ajustes → WhatsApp). Si dice que la ruta no está desplegada, hay que desplegar el backend. Mientras,
el usuario puede reenviar los ficheros o dejarlos en una carpeta: el resto de órdenes trabaja con
ficheros locales.
