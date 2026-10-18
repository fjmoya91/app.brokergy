---
name: contestar-cliente
description: >-
  Contesta a un CLIENTE de BROKERGY como lo haría Fran cuando pregunta por su expediente CAE: "oye Fran,
  ¿cómo va lo mío?", "¿cómo va mi expediente?", "¿sabéis algo?", "¿cuándo cobro?", "¿tengo que hacer algo?".
  Úsalo cuando el usuario pegue el mensaje de un cliente o diga "contesta a X", "qué le digo a X que
  pregunta cómo va lo suyo", "respóndele a X", "X pregunta por su expediente". Localiza el expediente
  (número, nombre o teléfono), mira EN VIVO en qué fase está y qué le falta al cliente, elige la respuesta
  tipo de esa fase y la adapta: si al cliente le falta algo, se lo pide con el enlace real; si la pelota
  está en nuestro tejado (revisión, verificación, administración), la respuesta de siempre: está en
  revisión, a los revisores no se les presiona porque cuando se presiona salen desfavorables, paciencia,
  de momento todos favorables y el primer interesado soy yo. No da importes ni fechas que no estén
  confirmadas. Siempre en borrador: el WhatsApp sale solo con el «sí» de Fran.
---

# Contestar a un cliente como Fran

Cuando un cliente pregunta cómo va lo suyo, la respuesta depende de **dónde está la pelota**: si le
falta algo a él, se le dice qué y dónde; si está en nuestro terreno, se le tranquiliza con la respuesta
de siempre. Esta skill decide cuál de las dos toca **mirando el expediente en vivo** y redacta el
mensaje con el tono de Fran.

- Proyecto Supabase: `app.brokergy` → project_id `okfeopwetlxdffrsbfqw`.
- **MCP BROKERGY:** `search_by_client`, `get_expediente`, `datos_contacto_expediente`, `enviar_whatsapp`.
- Para el envío se siguen las salvaguardas de la skill `enviar-whatsapp` (titular ≠ destinatario,
  enlaces solo del backend, borrador primero). Esta skill solo añade **qué se contesta**.

## 1. Localiza el expediente

- Con número (`26RES060_198`, o dictado: «veintiséis RES cero sesenta, ciento noventa y ocho»), úsalo.
- Con nombre: `search_by_client`. Con varios resultados, **pregunta cuál** (dirección o número). Un
  cliente puede tener varias obras: contestar por la que no es es peor que no contestar.
- Con solo el teléfono o el chat: `whatsapp_chat_expediente` (chat_id → `oportunidad_id`) y de ahí
  `expedientes.oportunidad_id`; si no aparece, se busca el teléfono en `clientes`.
- Si todavía es una **oportunidad** sin expediente (no ha aceptado la propuesta), esta skill no aplica:
  díselo a Fran.

## 2. Mira EN VIVO dónde está (nunca de memoria)

Llama a las dos, justo antes de redactar:

1. `get_expediente` → `estado_actual`, `dias_en_estado_actual`, `responsable_bloqueo`, `historial_json`.
2. `datos_contacto_expediente` → `cliente.pendiente` (lo que le falta AL CLIENTE, con su `url`) y a quién
   irá el mensaje (`cliente.nombre`).

**La traducción del estado a lenguaje de cliente ya existe en la app**: `mapEstadoToHito()` en
`implementation/backend/services/portalService.js` (la usa el portal del cliente). Se usa ESE criterio,
para no decirle por WhatsApp una cosa y en su portal otra.

## 3. Elige la respuesta (la primera que encaje)

### A. Le falta algo AL CLIENTE → se le pide, con su enlace
Si `cliente.pendiente` no está vacío, **eso manda sobre el estado**: aunque el expediente esté en
«PTE FIN EXPTE», si le falta firmar los anexos, decirle «está en revisión» sería mentirle y además
dejaría el expediente parado. Se le dice qué falta y se pega el `url` TAL CUAL.

> Hola {nombre}, va bien, pero para seguir adelante nos falta una cosa tuya: *{lo que falta}*.
> Lo puedes hacer desde aquí, con el móvil, en un par de minutos:
> {url}
> En cuanto lo tengamos, seguimos. Cualquier duda me dices. Un saludo, Fran

Ojo: lo que falta del **instalador** (factura, CIFO, fotos de la obra) no se le pide al cliente. Si es lo
que frena el expediente, se le dice que estamos esperando la documentación del instalador, sin culpar a
nadie, y se avisa a Fran por si quiere escribir al instalador (skill `enviar-whatsapp`).

### B. En nuestro terreno → «está en revisión» (la respuesta de siempre)
Estados: `PENDIENTE REVISAR EXPTE`, `PTE FIN EXPTE` (sin nada pendiente del cliente),
`REQUERIMIENTO BROKERGY`, `DOC. COMPLETA`, `ENVIADO A VERIFICADOR`, `REQUERIMIENTO VERIFICADOR`,
`PTE. SUBIDA MITECO`, `SUBIDO A MITECO`, `REQUERIMIENTO G.A.`

Decisión de Fran (15/10/2026): todo lo que está en su terreno se contesta igual, **en revisión**. A los
revisores no se les presiona: por lo que se comenta en otros foros, cuando se les presiona los
expedientes están saliendo desfavorables.

> Hola {nombre}, tu expediente está en revisión. En esta fase no conviene presionar a los revisores:
> por lo que se comenta en otros foros, cuando se les presiona están saliendo desfavorables, así que
> no nos queda otra que tener un poco de paciencia y esperar. La buena noticia es que de momento
> estamos teniendo todos favorables 👍 Y créeme que el primer interesado en que esto salga cuanto
> antes soy yo. En cuanto haya novedades te aviso. Un saludo, Fran

- En un **requerimiento** (verificador o administración) no se le cuenta el detalle técnico ni que hay
  un requerimiento: para él sigue «en revisión». Si el requerimiento necesita algo SUYO (una re-firma),
  ya sale en `cliente.pendiente` y manda el caso A.
- «Todos favorables» solo mientras sea verdad. Si Fran dice que ha salido alguno desfavorable, esa
  frase se quita de aquí.

### C. Certificado inicial (antes de la obra)
Estados: `PTE. CEE INICIAL`, `EN CERTIFICADOR CEE INICIAL`, `EN TRABAJO (CEE INICIAL)`,
`PENDIENTE REVISIÓN (INICIAL)`, `REVISADO Y LISTO (INICIAL)`

> Hola {nombre}, estamos con el certificado energético inicial de tu vivienda, que es lo primero que
> hay que tener antes de la obra. {si aún no ha ido el técnico: «El técnico se pondrá en contacto
> contigo para la visita.» · si ya está hecho: «Ya está hecho y lo estamos revisando antes de
> registrarlo.»} En cuanto esté registrado te aviso. Un saludo, Fran

Si es `REVISADO Y LISTO (INICIAL)` y el registro tarda, también es nuestro terreno: vale el caso B.

### D. Obra en marcha
Estado `PTE. FIN OBRA` sin nada pendiente del cliente:

> Hola {nombre}, el certificado inicial ya está registrado, así que estamos a la espera de que se
> termine la instalación. Cuando acabe, el instalador nos pasa la factura y las fotos y seguimos con
> el resto. Un saludo, Fran

### E. Certificado final
Estados `PTE. CEE FINAL`, `EN CERTIFICADOR CEE FINAL`, `EN TRABAJO (CEE FINAL)`,
`PENDIENTE REVISIÓN (FINAL)`, `REVISADO Y LISTO (FINAL)`:

> Hola {nombre}, con la obra terminada estamos con el certificado energético final, el que demuestra
> la mejora. Después preparamos el expediente para mandarlo a revisión. Un saludo, Fran

### F. Ya emitido, pendiente de cobro
Estados `CAE EMITIDO – PTE PAGO BROKERGY`, `PTE. PAGO BROKERGY A CLIENTE`:

> Hola {nombre}, buenas noticias: tu expediente ya ha salido favorable y está emitido. Ahora estamos
> en la parte del cobro; en cuanto se haga el pago te aviso. Un saludo, Fran

### G. No se contesta solo: se le pasa a Fran
- `FINALIZADO` y el cliente dice que no ha cobrado → puede ser un pago perdido: Fran.
- `RECHAZADO` → explicarlo es cosa de Fran.
- Pregunta **cuánto** va a cobrar o **cuándo exactamente**, reclamaciones, enfado, o cualquier cosa que
  no sea «cómo va» → se redacta como mucho un acuse («Lo miro y te digo») y se avisa a Fran.

## 4. Cómo escribe Fran

- De **tú**, castellano de España, cercano y corto: tres o cuatro frases. Nada de «Estimado cliente».
- Empieza por «Hola {nombre de pila}» (el de `cliente.nombre`, que es a quien llega). Firma «Un saludo,
  Fran».
- Un emoji como mucho. `*negrita*` solo para lo que se le pide.
- **Nunca** el nombre interno del estado («PTE FIN EXPTE», «S.O.», «MITECO», «lote»), ni importes, ni
  fechas que nadie ha confirmado. Un plazo inventado se convierte en una promesa incumplida.
- Si el cliente ha preguntado algo más en el mismo mensaje, se contesta también o se dice que Fran lo
  mira; no se ignora.
- Las plantillas son la idea, no un texto fijo: si el cliente escribe por tercera vez en un mes, no se
  le manda el mismo párrafo copiado; se reconoce («Ya sé que se está haciendo largo…»).

## 5. Borrador y envío

1. Enseña a Fran: **expediente**, **fase** (estado y días en él), **qué caso** has aplicado y por qué, a
   quién irá (titular y destinatario, si no coinciden) y el **texto**.
2. `enviar_whatsapp` con `modo="borrador"`, `destinatario="CLIENTE"`.
3. Solo con su «sí» para ESE mensaje: `modo="enviar"`. Con `solicitado` vacío si no se pide nada, o con
   lo pedido en el caso A, para que quede en el historial.

Si Fran solo quiere el texto para mandarlo él desde el móvil, se le da el texto y no se envía nada.

## Ejemplo (en seco, 15/10/2026)

`26RES060_198` está en `PTE FIN EXPTE`, responsable BROKERGY… pero `cliente.pendiente` trae «Firma los
anexos» (Anexo I y Cesión) con su enlace de `/firmar-anexos/…`. Caso **A**, no B: se le pide la firma
con ese enlace. Decirle «está en revisión» lo habría dejado parado esperando algo que depende de él.
