# La VOZ DE FRAN: respuestas reales elegidas, para que el agente de WhatsApp las copie (2026-11-18)

Este es el sitio que el diseño del agente reservó para la voz de Fran
([el-agente-de-whatsapp-y-el-director-comercial.md](el-agente-de-whatsapp-y-el-director-comercial.md)).
No va en la BD: son respuestas suyas reales, elegidas de los chats, con el caso y el porqué. Cada vez que
se revisa un chat y se contesta (o Fran corrige un borrador), se añade aquí el caso. **Todavía no lo lee
el prompt** (`CONOCIMIENTO` de `services/botPrompt.js`): cuando se cablee, entra como ejemplos y las
lecciones de abajo pasan a sus reglas.

Cada caso: lo que preguntó · lo que contestó el contestador (si contestó) · lo que contesta Fran · la
lección para el agente.

---

## 1. «¿Pongo el aerotermo si tengo un termo de dos meses?» — 26RES060_284, Benito (18/11/2026)

**El chat.** Con el CEE inicial ya registrado, Benito (persona de contacto de la titular) pregunta «Al
final como se ha solicitado el expediente: ¿con o sin aerotermo?». Después: «Entonces debería de
ponerlo. Lo pregunto como dudaba al tener un termo de dos meses».

**Lo que contestó el contestador** (REAL):
- a la primera: «Se ha solicitado con aerotermia, y también con el aerotermo… El certificado energético
  inicial está hecho con la máquina de aerotermia para la calefacción y con el aerotermo Johnson para el
  agua caliente». **Mal**: el CEE inicial es la casa COMO ESTÁ, con la caldera y su termo. La aerotermia y
  el aerotermo van en la MEDIDA DE MEJORA. Al cliente, además, eso no le dice nada.
- a la segunda: «lo miro y te digo qué conviene». **Mal**: es el acuse que Fran no quiere, y la respuesta
  estaba en la app.

**Dónde estaba la respuesta.** `oportunidades.datos_calculo.via_fm` de la OP371: `elegible`, 9.232 € por
la vía FM frente a 4.592 € por la vigente. Con la Resolución del factor multiplicador (BOE-A-2026-23367),
la bomba tiene que «satisfacer completamente la demanda de calefacción y el ACS»: **sin el aerotermo, no
hay vía FM** ([factor-multiplicador…](../calculo/factor-multiplicador-la-resolucion-publicada-res060-fm.md),
FAQ 1 y `FM_ACS_QUE_HACER`). El aerotermo está en el presupuesto del instalador
(`instalacion.cambio_acs: true`, JOHNSON AEROTERMO 110 L).

**El primer borrador (MAL, corregido por Fran).** Le decía «sí, ponlo»: con la FM la bomba tiene que dar
también el ACS y, sin el aerotermo, se iría por la vía de antes. Fran lo corrigió (18/11/2026):

> «Cuando es con FM, lo que les digo a los clientes es que aún no sabemos seguro cómo tenemos que actuar
> para poder alcanzar el máximo: estamos esperando a que los auditores nos digan qué entra y qué no entra
> para saberlo. Para el certificado de eficiencia energética inicial aún no se necesita saber nada de eso.
> Sería luego, cuando se vaya a justificar.»

**Lo que contesta Fran:**

> Benito, con la normativa nueva (la del factor multiplicador) todavía no sabemos seguro cómo hay que
> hacerlo para llegar al máximo: estamos esperando a que los auditores nos digan qué entra y qué no.
>
> Para el certificado energético inicial no hace falta saber nada de eso. Eso se verá luego, cuando
> vayamos a justificar la obra.

**Lecciones para el agente:**
1. **Con la vía FM no se afirma qué hace falta para el máximo.** Lo que se dice es lo de Fran: aún no lo
   sabemos seguro y esperamos a que los auditores (verificadores) digan qué entra y qué no. Lo que la app
   calcula en `via_fm` (y la «lectura prudente» de la Resolución sobre el ACS) es un criterio interno, no
   una respuesta para el cliente.
2. **Lo que no hace falta para el paso en el que está, se dice que no hace falta.** Con el CEE inicial
   registrado o por hacer, la duda de la FM no le afecta: se resuelve al JUSTIFICAR. Se le tranquiliza con
   eso, no con un «lo miro y te digo».
3. **El CEE INICIAL describe la casa de ANTES.** Nunca se dice que «está hecho con la aerotermia». Lo
   nuevo es la medida de mejora, y al cliente no hace falta contárselo.
4. **Sin cifras.** No se repiten importes de la propuesta para empujar una decisión de obra.

---

## 2. Acuse tras una noche sin contestar: siete respuestas que Fran aprobó tal cual (19/11/2026)

La ronda de [la-noche-del-18-11-lo-que-el-contestador-dejo-sin-contestar.md](la-noche-del-18-11-lo-que-el-contestador-dejo-sin-contestar.md)
preparó 8 respuestas de riesgo BAJO. Fran las aprobó sin cambiar una coma («ve contestando») y salieron 7
a las 7:36. La octava (Emilia, 26RES080_50) no salió: a las 23:49 había mandado 12 fotos más y su
borrador ya no valía. Dos ejemplos del patrón:

> ¡Hola Javier!
>
> Perdona que no te haya contestado antes. Recibido el justificante de titularidad de la cuenta, gracias.
>
> Por tu parte ya no falta nada por ahora. Los anexos para firmar los preparamos nosotros y te llegan
> hechos, con un enlace para firmarlos.

> ¡Hola Sergio!
>
> Perdona que no te haya contestado antes. Sí, ya podéis empezar, y el justificante de la cuenta ya lo
> tenemos, gracias.
>
> Lo más importante ahora son las fotos: la caldera vieja ya quitada y la máquina de fuera y la de
> dentro, cada una con su pegatina bien de cerca.

**Lecciones para el agente:**
1. **El molde que vale**: disculpa de una línea, acuse de lo que mandó en lenguaje de casa, y lo que le
   falta (máximo dos cosas y un enlace) o «por tu parte no falta nada; ahora seguimos nosotros».
2. **«Ya podéis empezar» solo con el CEE inicial REGISTRADO**, comprobado en el momento.
3. **Justo antes de mandar se vuelve a leer el chat.** Si el cliente ha escrito algo después, el borrador
   se rehace.
4. **Lo que conteste el cliente se vuelve a mirar.** Javier (26RES093_13, una hibridación) contestó «luego
   me comentas lo de la caldera por si acaso la quito finalmente». Quitar la caldera en una hibridación
   cambia la ficha, así que eso lo decide Fran.

---

## 3. «¿Se podría pedir la segunda opción de 4.000 extras?» + presupuesto nuevo — 26RES060_OP407, José Nieto (19/11/2026)

**Lo que preguntó** (18/11): si podía ir por la vía FM (la «segunda opción» de la propuesta), con el
presupuesto nuevo de TEKNIKAL (sin los 100 € de «Gestión de CAEs», 15.437,59 €), y si importa cuándo subir
la potencia de la luz a 7,5 kW. El 16/11 había dicho además que «todo iría a nombre de mi mujer».

**El primer borrador (MAL, rehecho antes de mandarlo).** Decía «sí, encaja» con la cifra FM (8.878 €) y
la lista de documentos de la Resolución como requisitos. Choca con el caso 1: con la FM no se afirma ni
se dan cifras.

**Lo que salió (19/11, con el «mándalo, revisa primero» de Fran):** el presupuesto revisado y que quitar
la gestión del CAE está bien («la propuesta no cambia»); para la FM, «a priori cumple lo principal (el
ACS por la aerotermia), pero aún no sabemos seguro cómo hay que hacerlo para llegar al máximo, esperamos a
los auditores; para el certificado inicial no hace falta saberlo». Solo un consejo práctico: guardar las
facturas de la luz de noviembre a marzo (vivienda habitual). La potencia: no influye en la ayuda, pero el
boletín o factura del electricista, después del CEE inicial, y que guarde el boletín. A nombre de la
mujer: como en [cae-a-nombre-de-un-copropietario…](../consultas/cae-a-nombre-de-un-copropietario-y-tope-irpf-60.md).

**Lecciones para el agente:**
1. **Antes de mandar un borrador de días antes, se relee el chat y las memorias nuevas.** En este caso
   habían llegado una pregunta nueva (la potencia) y la regla de la FM del caso 1.
2. **Una pregunta que se dejó con «lo confirmo y te digo» se contesta en la misma respuesta**, sin
   esperar a que la repita.

---

## 4. Catastro + presupuesto de una casa nueva, «Buenos días cuando puedas» — Fran Ruimor (20/11/2026)

**Lo que mandó** (8:15): la captura del Catastro de una parcela de Vara de Rey y el presupuesto de una
aerotermia por una caldera de gasoil. Tiene tres obras en la app; esta no es ninguna.

**Lo que contestó el contestador** (REAL, C696): «Hola, buenos días. He recibido la foto y el presupuesto
1-000048. ¿Me dices de qué obra son? Con el nombre del titular o la dirección me vale, así lo coloco en su
expediente». **Mal tres veces**: recita lo recibido (hasta el número del presupuesto), pregunta de qué obra
es algo que es de una obra NUEVA (el «obra NUEVA» de Gemini se perdía antes de llegar al cerebro) y
«lo coloco en su expediente» suena a máquina.

**Lo que contesta Fran:**

> Buenos días, Fran. Lo vamos a revisar y te pasamos la propuesta.

Y que el alta se ponga en marcha sola: «cuando nos pasan catastro, foto de caldera y/o presupuesto es para
eso».

**Lecciones para el agente** (ya en el prompt y en el código, ver
[el-contestador-contesta-como-fran.md](el-contestador-contesta-como-fran.md), «La PETICIÓN NUEVA»):
1. **Catastro, caldera o presupuesto de una casa que no está en la app = petición de propuesta.** No se
   pregunta para qué ni de qué obra es; se contesta lo de Fran y se da de alta.
2. **«Buenos días» o «Buenas tardes» según la hora, con el nombre con que le llama Fran.**
3. **Lo recibido no se recita.** «Lo vamos a revisar» ya dice que ha llegado.
