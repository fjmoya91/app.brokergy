<!-- conocimiento · área: oportunidades · las rutas de los enlaces son relativas a la raíz del repo -->

## Lo que NO se le pregunta al cliente (2026-10-24)

**Caso: 26RES060_OP337** (Pedro Moreno, San Carlos del Valle, partner Calefacciones Miguel
González). Pedro mandó por WhatsApp el recibo del IBI, el presupuesto, su DNI, la caldera, la
fachada, el patio y los planos, y preguntó «nos dices luego qué más te va faltando». Tras el alta y
el CEE inicial, el borrador de respuesta le pedía cuatro cosas:

1. a nombre de quién está la casa, porque el IBI estaba solo a nombre de su mujer;
2. con qué calientan el agua;
3. si son radiadores;
4. fotos de la parte de atrás.

Respuesta de Fran: «eso ya lo comentamos» (el ACS), «lo del IBI ni caso», «antes de pedir fotos,
razona si las de detrás se pueden pedir» y **«¿con lo que tienes lo puedes sacar?»**. Se podía: la
propuesta salió ese mismo día, sin preguntarle nada.

**REGLA — Antes de redactar un WhatsApp con «lo que falta», se comprueba si con lo que hay ya se
saca la simulación y el CEE. Si se saca, no se pregunta nada y se sigue hasta la propuesta.**

| Lo que NO se pregunta | Por qué / qué se hace |
|---|---|
| Con qué calientan el agua | Lo decide el presupuesto: con ACS, inicial con la caldera de hoy y final con la aerotermia; sin ACS, termo en los dos (regla 163) |
| Si son radiadores | Sin emisor declarado, radiadores convencionales (regla 99) |
| A nombre de quién está la casa (el IBI a nombre de otro, el cónyuge) | El TITULAR es el del presupuesto y el DNI que manda. El IBI solo sirve para sacar la referencia catastral: no se cuestiona ni cambia el titular |
| Fotos de paredes en el linde con un solar o con otra finca | No pueden tener ventanas (art. 582 del Código Civil): van ciegas (regla 167) |

**Lo que SÍ se pide**, porque cambia el resultado y no se puede deducir:

- la placa de la caldera ilegible, o la caldera sin foto en su sala (regla 162);
- una pared a la PROPIA parcela (patio, corral) que no sale en ninguna foto ni en Street View;
- el presupuesto, si no hay.

### Obra de FESSA SOLAR: el CEE lo pone FESSA, al cliente no se le piden paredes (2026-10-27)

**Caso: 26RES060_242** (Ubaldo Alexander Gallegos, Santa Cruz de la Zarza, partner FESSA SOLAR, SL,
`d00cd9ab-…`). El acuse de la aceptación le pidió las fotos de cada pared y sus ventanas; el cliente
mandó cuatro vídeos de los patios y la fachada en vez de la placa de la caldera que anunciaba. Fran:
«cuando el expediente viene de FESA Solar no hay que pedirle lo mismo al cliente, porque FESA ya nos
aporta los certificados de eficiencia energética: nada de las paredes. Sí las fotos de la aerotermia
si no las tenemos y de la caldera anterior: sin fotos de la caldera anterior no se puede hacer nada».

**REGLA — en una obra de FESSA SOLAR (partner), al cliente NO se le piden fotos de paredes, fachadas,
patios ni vídeo de la vivienda: el CEE inicial (y su `.cex`/`.xml`) lo aporta FESSA
(`DOC_CEE_EXISTENTE`). Se le pide SOLO lo de los equipos que falte: la caldera anterior en su sala y
su PLACA (regla 162), y las placas de características de la aerotermia instalada.** Si aun así manda
fotos o vídeos de la casa, se guardan en su apartado y no se comentan.

⚠️ El acuse automático de la aceptación (`routes/public.js`, «Para poder hacer el CEE inicial
necesitamos…») y la lista de pendientes del cliente (`datos_contacto_expediente`) todavía piden
fachada y patios en estas obras: hasta cambiarlos, el WhatsApp a mano no los repite.
