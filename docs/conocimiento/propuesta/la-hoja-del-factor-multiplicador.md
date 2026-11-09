# La hoja del FACTOR MULTIPLICADOR en la propuesta (2026-11-09)

Fran, 09/11/2026: «cuando demos la propuesta, quiero que demos el ejemplo con el cálculo actual y con el
factor multiplicador, y que quede claro que sería solicitando a partir de enero […] una página más que sea
explicando cómo ha funcionado el factor multiplicador y qué tienen que conseguir […] tanto en RES060,
RES093, RES080, todos». La gente ya lo conoce, y la propuesta tiene que contarlo por escrito.

Hasta ese día el FM salía solo en el TEXTO del mensaje (`lineaFactorCorreccion`, desde el 08/11), y en el
PDF solo una nota del IRPF cuando la oportunidad ya iba por esa vía. Una propuesta solo de reforma (RES080)
no lo ofrecía nunca.

## Qué lleva

**REGLA — toda propuesta en la que alguna opción sube por la vía FM lleva una HOJA más, la 2, detrás de la
portada, y una línea en la fila del bono de la portada que remite a ella.** Las hojas siguientes corren una
página. Cifras y textos salen de UNA fuente, [logic/fmPropuesta.js](../../../implementation/frontend/src/features/calculator/logic/fmPropuesta.js)
(`fmPropuesta` + `textosHojaFm`); `ProposalModal` solo los pinta (`renderHojaFm`). La hoja tiene:

1. **Las dos cifras**: «Vía actual — se puede pedir ya, es el importe firme» frente a «Con el factor
   multiplicador — se pide desde el 15/01/2027, estimado y sujeto a cupo», con lo que sube. Con aerotermia +
   reforma, una tabla con las dos opciones. Debajo, por qué no es el doble exacto (la ficha nueva calcula
   con otra fórmula; en la RES080_FM el factor solo va sobre la parte de la bomba).
2. **Cuándo se pide**: obra desde el 22/03/2026 (puede hacerla ya) · solicitud desde el 15/01/2027 ·
   facturas antes del 01/12/2027 (01/01/2028 en comunidades) · plazo hasta el 31/12/2027 (28/02/2028) ·
   cobro al resolver. Las fechas salen de las constantes de `res060fc.js`.
3. **Qué hace falta**, lo que tiene que conseguir el CLIENTE:
   - vivienda habitual, con las facturas del 1/11 al 31/3 del invierno anterior;
   - la bomba que dé calefacción y ACS (con el aviso del depósito si la simulación no lo lleva), o
     reforma y bomba a la vez con cuatro CEE;
   - las fechas de las facturas;
   - sus firmas;
   - el documento F/G, solo si toca;
   - en una línea, lo del instalador y los certificados («lo coordinamos nosotros»).
4. **Lo que debe saber** (ámbar):
   - no está garantizado (cupo por orden de resolución);
   - si no entra, se tramita por la vía actual con el mismo Convenio y cobra la cifra firme;
   - se cobra más tarde;
   - en la RES080_FM sin simulados, que la cifra es una estimación.
5. **¿Por qué vía vamos?** (verde): usted decide. Puede aceptar igual y se le confirma la vía antes de
   presentar; si prefiere cobrar antes, va ya por la actual.

**REGLA — cada opción con SU ficha y las MISMAS condiciones que el párrafo del mensaje.**
- Con aerotermia, la RES060_FM o la RES09x_FM de su zona (`estadoFc`).
- Solo reforma, la RES080_FM (`estadoFm080`), nunca la RES060_FM.
- En la comparativa, las dos.

Solo sale si el FM es MAYOR y nada lo impide (sólido, fechas, presentado): una cifra menor solo mete dudas
sobre la firme. La de la RES080_FM sin los dos CEE simulados lleva «unos» / «≈» y lo dice.

**REGLA — lo que se le pide al cliente es lo que dice SU ficha.** Cotejado con el BOE el 09/11/2026:

| Requisito | RES060_FM | Hibridación (RES09x_FM) | RES080_FM |
|---|---|---|---|
| Consentimiento del IRPF («aumento patrimonial», punto 12) | sí | sí | no |
| Oferta de mantenimiento de 2 años (punto 8) | sí | sí | no |
| Documento F/G, en zona D o E | sí | no | no |
| Boletín de baja tensión | si sube la potencia | **siempre** (sin «cuando sea de aplicación») | — |

Con la hoja, la nota del IRPF de la portada (`notaFm`) sobra: ya lo dice «Sus firmas».

**REGLA — la hoja la genera el equipo interno**, como el párrafo del mensaje (`fcVisible`). El conmutador
del popup de envío solo pone o quita el MENSAJE del FM; la hoja va siempre que proceda.

## El mensaje del FM va APARTE, el último (09/11/2026)

Fran, tras verla en su móvil: «lo de la nota aclaratoria del cambio de normativa se debería poner en un
mensaje por fuera». Metido en el texto largo, entre las cifras de la propuesta, se leía como parte de la
oferta.

**REGLA — el aviso del FM y el consentimiento del IRPF de esa vía ya NO van en el mensaje principal: van
en el ÚLTIMO mensaje, aparte**, por el mismo camino que los avisos de biomasa y de hibridación
(`buildAvisoFinal` → `mensajeFm`): última burbuja de WhatsApp (`textoDespues`), final del cuerpo del email,
`whatsapps[].avisoFinal` en el envío programado. El conmutador «Incluir el factor multiplicador» del popup
decide si sale; la vista previa lo enseña debajo del mensaje («aparte, el último»). Con la hoja en el PDF,
el mensaje remite a ella («Te lo explicamos en la página 2 de la propuesta»).

## Consumidor vulnerable: × 1,5 en la oportunidad (09/11/2026)

Fran: «que la oportunidad, si tiene lo del factor de vulnerabilidad, que lo calcule y que lo muestre». Las
fichas `-S` (RES060_FM-S, RES09x_FM-S) multiplican el factor por 1,5; la RES080_FM no tiene `-S`.

**REGLA — manda el conmutador del equipo; sin tocar, lo que declaró el cliente al aceptar.**
`esVulnerableFm` ([logic/viaFm.js](../../../implementation/frontend/src/features/calculator/logic/viaFm.js)):
`inputs.vulnerable` (Sí/No, en «Vía de tramitación» de la calculadora, `ConmutadorViaFm`) y, si es null,
`vulnerableDeConfirmacion(confirmacion_cliente)` — la regla de la familia numerosa de `vulnerableFmDeBono`:
una familia numerosa con el bono de vulnerable NO cuenta sin la renta (la Resolución excluye a quien lo
tiene solo por el título); con el severo o en exclusión, sí. Sin declarar nada, no. La calculadora pasa
`vulnerable` a `calculateRes060FM` y la cifra FM, la hoja y el mensaje salen con el × 1,5.

**REGLA — la cifra con el × 1,5 dice lo que hay que ACREDITAR y lo que saldría sin acreditarlo.** En la
hoja, la tarjeta «Consumidor vulnerable (× 1,5)» (factura con el bono social, Anexo B, empadronamiento,
nota simple o alquiler) y «sin acreditarlo: unos X €» (`bonoConKwh` con `cae / 1,5`); el «no es
multiplicar por…» usa el factor completo (3 en unifamiliar). Para que quepa, con esa tarjeta la de
«Fechas y facturas» se funde en la del instalador («Facturas, instalador y certificados»: las fechas ya
están en el calendario) y la introducción no lo repite. En el mensaje: «Esa cifra ya cuenta el × 1,5
de consumidor vulnerable…: habrá que acreditarlo con la factura».

**REGLA — el expediente lo hereda.** `semillaBonoSocial` (alta del expediente) siembra
`documentacion.via_fm.vulnerable` con lo declarado al aceptar y, además, con el «Sí» del equipo en la
oportunidad (`por: 'oportunidad (marcado por el equipo)'`); un «No» explícito del equipo manda sobre lo
declarado (el Anexo I sigue llevando el bono social). Si no se declaró nada al principio, se marca después
en la pestaña «Vía FM» del expediente.

## Alto fijo

La hoja es de alto fijo (1123 px, regla 25.b): lo que no cabe se queda debajo del pie. Medido el
09/11/2026 en local con `node scripts/claude_propuesta.js paginas <OP>`. Esa orden, nueva, es de SOLO
LECTURA: fotografía cada hoja y dice cuánto le sobra hasta el pie. Con `CLAUDE_ROBOT_APP_URL` apunta a un
localhost. Resultados:

| Caso | Margen hasta el pie |
|---|---|
| RES060 en zona D (siete requisitos, el peor) | 41 px |
| La misma, 26RES060_OP383, con consumidor vulnerable (× 1,5) | 27 px (pisaba 26 con la tarjeta añadida a secas) |
| Hibridación 26RES060_OP310 | 82 px |
| Solo reforma 26RES080_OP88, estimada | 66 px |
| Comparativa 26RES080_OP92 | 41 px |

El Chrome del servidor pinta unos 14 px más alto (`encajarPortadas`), así que queda aire. En rejilla, las
tarjetas de requisitos se estiraban a la más alta de su fila y dejaban 1 px. Por eso van en dos columnas
que se rellenan solas (`column-count`).

Pruebas: `node implementation/backend/scripts/test_fm_propuesta.mjs`.
