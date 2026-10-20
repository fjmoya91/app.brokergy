# Cuando el material llega por EMAIL

El instalador no siempre usa WhatsApp: a veces manda el presupuesto, el recibo del IBI y las fotos de
la caldera en un correo. El usuario lo pide igual: «da de alta lo que ha mandado Instalaciones Plaza
por email», «revisa el email de X y guárdalo para la simulación», «26RES060_OP310: guarda lo que ha
mandado por correo».

Lo único que cambia es **cómo se encuentra y se baja**. Desde que hay una carpeta con el cuerpo y los
adjuntos, el recorrido es el MISMO que con el chat: mirar cada fichero, `leer --placa / --presupuesto
/ --rc`, `catastro`, plan, `crear` (o `documentar`) en seco y luego `--escribir`.

## Los dos buzones

| Buzón | Qué llega | Cómo se lee |
|---|---|---|
| Gmail `franciscojavier.moya.s2e2@gmail.com` | **Todo**: lo suyo y, reenviado, lo de `franciscojavier.moya@brokergy.es` | Conector de Gmail de claude.ai + `correo-raw` (**camino principal**) |
| Hostinger `franciscojavier.moya@brokergy.es` | Solo lo que se manda a esa dirección | `correo` por IMAP, solo lectura |

Si no se sabe a cuál escribió, se busca en Gmail: allí está todo.

## a) Gmail — el conector de claude.ai + `correo-raw`

El conector (`search_threads`, `get_thread`, `get_message`) **no tiene descarga de adjuntos**. Lo que
funciona (probado el 19/10/2026 con correos de 72 KB a 8,5 MB):

1. **Buscar**: `search_threads` con la sintaxis de Gmail — `from:correo-del-instalador@hotmail.com`,
   `from:plaza has:attachment newer_than:7d`, `subject:subvencion`. Si salen varios, se dice cuál se
   ha cogido (remitente, fecha, asunto) o se pregunta.
2. **Leer el texto** (opcional): `get_message` normal da el cuerpo y los nombres de los adjuntos.
3. **Bajarlo entero**: `get_message` con `messageFormat: "RAW"`. Trae el MIME en base64url y, como pasa
   del límite de salida, Claude Code lo **guarda en un fichero** y dice dónde:
   `~/.claude/projects/<proyecto>/<sesión>/tool-results/mcp-…-get_message-<n>.txt`. Ese fichero es un
   JSON con `id`, `threadId`, `internalDate` y `raw`.
4. **Sacar las partes**, desde `implementation/backend`:

   ```bash
   node scripts/alta_oportunidad.js correo-raw "<ruta del .txt que dijo la herramienta>"
   ```

   Acepta también un `.eml`. `--out <carpeta>` para dejarlo en otro sitio (siempre una carpeta NUEVA y
   vacía: si existe con algo, crea `-2`, `-3`…).

Si el RAW sale EN LÍNEA (un correo tan pequeño que no se guarda en fichero), no trae nada que bajar
que no se vea ya: se lee con `get_message` normal. Copiar el base64 a mano no se hace.

Sin Node, lo mismo con Python (con `-I`, el fichero de entrada como argumento y la salida en una
carpeta nueva y vacía; el script, fuera de esa carpeta):

```python
import base64, json, sys, pathlib
from email import message_from_bytes, policy
j = json.load(open(sys.argv[1], encoding='utf-8'))
msg = message_from_bytes(base64.urlsafe_b64decode(j['raw'] + '=' * (-len(j['raw']) % 4)), policy=policy.default)
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=False)
for n, part in enumerate(msg.iter_attachments(), 1):
    (out / f"{n:02d}_{part.get_filename() or 'adjunto'}").write_bytes(part.get_payload(decode=True))
```

## b) Hostinger — `correo` por IMAP

```bash
node scripts/alta_oportunidad.js correo "plaza" --dias 14     # lista (uid · fecha · remitente · asunto · nº adjuntos)
node scripts/alta_oportunidad.js correo --uid 5807            # baja ESE
```

Busca la cadena en el remitente (nombre o dirección) o en el asunto, en `INBOX`, de los últimos
`--dias` (14 por defecto). Con un solo resultado lo baja; con varios, se elige con `--uid`. Se abre
**en solo lectura** (EXAMINE): no se marca nada como leído ni se mueve. Cuenta y servidor: los de
`LOTE_SO_SMTP_USER` / `LOTE_SO_SMTP_PASS` del `.env` en `imap.hostinger.com:993` (los mismos que usa
`firmadosSoCorreo.js`).

## Lo que dejan los dos

En `implementation/backend/scratch/alta-oportunidad/<remitente>-<fecha>/` (fuera de git, como la
carpeta de `chat`):

- `01_…`, `02_…`: los adjuntos numerados con su nombre original. Un `.eml` adjunto (un correo
  reenviado como adjunto) se abre y sus adjuntos salen como `NN_reenviado_…`.
- `cuerpo.txt`: De, Para, Fecha, Asunto y el texto.
- `correo.json`: lo mismo más cada adjunto con su tipo, tamaño y `sha256`, y lo descartado.

Y por pantalla, el cuerpo, la lista de adjuntos, lo **descartado** y el **partner** del remitente.

**Se descarta solo**: un adjunto con el MISMO contenido que otro (por hash: Hotmail y el móvil repiten
fotos) y las imágenes EN LÍNEA de menos de 20 KB (logos y firmas). Lo demás se mira.

## Lo que cambia frente al chat

- **El cuerpo se lee como los mensajes del chat**: «son radiadores», «la casa es de su madre», el nombre
  del titular. El aviso legal y la firma no dicen nada de la obra.
- **El partner sale del remitente**: `correo-raw` / `correo` buscan la dirección en la ficha del
  prescriptor (`email`, `email_contacto`, `email_responsable`); con un dominio de empresa, el dominio;
  sin nada, la razón social del nombre del remitente. Es una PISTA: se contrasta con quien firma el
  presupuesto. Si el que escribe es el propio cliente, el partner es el instalador del presupuesto.
- **Los nombres de los adjuntos no dicen lo que son** («WhatsApp Image 2026-10-19 at 12.59.55.jpeg»):
  cada uno se mira con la vista, como en el chat.
- **En el plan va `correo` en vez de `chat`** (ver `plan.md`), sin `wa_msg_id`. El historial de la
  oportunidad dice entonces «📧 Alta automática con lo recibido por email de X «asunto» (fecha)».
- **No hay chat que renombrar**: el paso del nombre del chat se SALTA y el informe lo dice. El título
  de la sesión sí se pone (con el nº que da `obra <nº>`). Si el instalador tiene además un chat de
  WhatsApp, es el suyo: nunca se renombra con el nº de una obra.
- **Nada se contesta al remitente desde aquí.** Si falta algo (la placa), se prepara el WhatsApp o el
  correo en borrador y sale con el «sí» del usuario.

## Caso: INSTALACIONES PLAZA, 19/10/2026

Correo de INSTALACIONES PLAZA 2014 SL (`correo-del-instalador@hotmail.com`) a la dirección de
brokergy.es, asunto «DOCUMENTACION PARA SUBVENCION»; llegó a los dos buzones. Cuerpo: una línea («te
adjunto toda la documentación que necesitas para la subvención de la caldera») y el aviso legal.
Adjuntos: el **presupuesto 189** (PDF, aerotermia y placas fotovoltaicas), y ocho fotos con nombres
de WhatsApp: el **recibo del IBI** (con la referencia catastral → `leer --rc`) y la **caldera ACV
Delta**, de la que vino el **esquema eléctrico** de la tapa y NO la placa de características: sin
placa, la fila de la caldera es la más reciente de su tipo, se dice en `decisiones` y se le pide la
placa. Una de las fotos venía dos veces (mismo contenido) y se descartó sola. El partner salió por el
email de su ficha (PLAZA).
