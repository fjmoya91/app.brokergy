<!-- conocimiento · área: whatsapp · las rutas de los enlaces son relativas a la raíz del repo -->

# La noche del 18/11/2026: lo que el contestador dejó sin contestar (y cómo se recogió)

Fran no pudo atender el WhatsApp el 17 y el 18/11 y pidió que se contestara todo «sin mi intervención»,
a partir de las 7:30, y que sirviera para entrenar al asistente. Se hizo con la ronda de
[la-ronda-nocturna-de-whatsapp.md](la-ronda-nocturna-de-whatsapp.md) (`ronda_cc.js preparar --dias 3`),
8 subagentes de 10 chats cada uno y un encargo propio con las reglas de
[voz-de-fran.md](voz-de-fran.md). Lo que salió, medido:

## Lo medido

- **79 chats** con algo suyo nuevo en 3 días · 138 adjuntos (112 ya colocados) · 31 audios.
- **45 no necesitaban respuesta**: Fran ya había contestado a mano en 33 y el contestador lo había hecho
  bien en 25 (se solapan).
- **19 ESCALADOS por el TOPE de 40 en 24 h** desde el 17/11 a las 14:58, con la respuesta YA escrita y
  buena: nadie la mandó y los clientes esperaron de 6 a 60 h. El tope cuenta también los acuses («lo miro
  y te digo»): 54 acuses en 4 días.
- **15 borradores**: 8 de riesgo BAJO (acuse + lo que le falta, o «no te falta nada»), 7 con algo que
  decide Fran (vía FM, una obra empezada sin el CEE inicial registrado, anexos por rehacer, un RITE que otra
  sesión tiene por mandar). **19 ESCALAR** de verdad: altas de obras nuevas (FONJUCAR ×3, Ruidera ×3,
  Santos, Pedro de Casas de Ves), dinero (honorarios, revalorar un presupuesto), una queja de protección
  de datos, el desguace de una caldera, la factura de una empresa que no está en la app.
- **Guardado solo**: 8 fotos (con la obra y el apartado claros) y 1 justificante de titularidad. El
  resto no: presupuestos, capturas, documentos dudosos u obras nuevas.

## Lecciones para el asistente

1. **El tope no debe tragarse una respuesta buena.** Una fila que escala solo por el tope tiene ya su
   texto: lo que toca es mandarla en cuanto haya hueco (la ventana de 24 h corre), no dejarla para Fran.
   Y un acuse no debería contar para el tope (ya lo decía la revisión del 17/11 en
   [el-agente-de-whatsapp-y-el-director-comercial.md](el-agente-de-whatsapp-y-el-director-comercial.md)).
2. **El justificante de titularidad no tiene apartado** en el checklist, así que
   `contestadorDocumentos` no lo guarda. Se guarda bien por `services/justificanteCliente.subirJustificante`
   (el camino de la ficha: Drive + `justificante_titularidad_link` + lectura del IBAN), **solo si el
   expediente aún no tiene uno** (si hay uno lo archiva, no lo pisa a ciegas). Candidato a entrar en el
   contestador.
3. **La ronda no ve a los instaladores SIN obra** (su universo es «algo vivo»): esa noche se quedaron
   fuera Pedro (Casas de Ves) y Eduardo (La Puebla), que el contestador sí había escalado. Hay que cruzar
   la ronda con las filas ESCALAR de `wa_contestador`.
4. **Antes de mandar, se vuelve a leer el chat**: si lo último ya no es el mensaje suyo que se contestó, no
   se manda. Disculpa corta al principio si lleva más de ~10 h sin respuesta de verdad.
5. **Una sesión de obra con un borrador pendiente manda sobre la ronda**: en 26RES060_205 y 26RES093_14
   había sesiones con su propio mensaje preparado; la ronda no debe mandar otro por encima.

Los casos que Fran apruebe o corrija de este lote pasan a [voz-de-fran.md](voz-de-fran.md).
