<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## El ahorro verificado se GUARDA SOLO, y si sale MENOR se decide al pagar (2026-11-18)

Fran, 18/11/2026: «quiero que los ahorros verificados se guarden en sus correspondientes
expedientes y, si en algún caso es menos, cuando vayamos a pagar los lotes nos salte un
aviso, para que autoricemos el pago, decidamos si subimos el precio al cliente para pagarle
lo que se acordó o por el contrario se le paga sobre lo verificado».

Sustituye a «el ahorro verificado se PROPONE, nunca se escribe solo» (de
[las-cifras-del-lote-se-leen-de-sus-documentos.md](las-cifras-del-lote-se-leen-de-sus-documentos.md)):
el cuidado se mueve de ESCRIBIR la cifra (que es la del verificador) a PAGAR menos de lo
declarado (que es una decisión de dinero).

### 1. Al subir el informe de verificación, lo que casa sin duda se guarda solo

Pasa en `subirDocumentoLote` ([routes/lotes.js](implementation/backend/routes/lotes.js)), así
que vale para «Subir» en la fase 4 y para el correo de Marwen (regla 225). El reparto lo hace
`separarAplicables` ([loteVerificados.js](implementation/backend/services/loteVerificados.js)) y
escribe `aplicarAhorrosVerificados` con `origen: 'INFORME_VERIFICACION_AUTO'`.

**REGLA — se guarda solo lo que no admite duda**: casado por el NÚMERO de expediente (nunca por
el titular), con su cifra leída, sin repetirse en otra actuación y sin pisar un verificado
DISTINTO ya registrado. Lo que ya estaba igual no se reescribe. Lo demás va a la revisión de
siempre (`AhorrosVerificadosModal`, solo con las filas que faltan).

**REGLA — si la suma de las actuaciones no cuadra con el total del informe, no se guarda
NINGUNA**: alguna cifra se ha leído mal y no se sabe cuál (el CAE-1601 no cuadraba consigo
mismo).

Que el verificado sea menor que lo declarado NO impide guardarlo: es la cifra del verificador,
con ella se factura al S.O. Lo que se decide es qué se le paga al cliente.

En pantalla: el overlay dice lo guardado, en ámbar los menores («se decide al pagar») y, si
queda algo, «Revisar los N que faltan». El historial del lote lo apunta.

**REGLA — lo que FALLA se avisa lo PRIMERO** (Fran, 18/11/2026: «si algo no cuadra, nos debe
llegar alguna notificación»). Cuando el informe llega por el correo de Marwen (regla 225), el
aviso a Fran va por WhatsApp Y email, y si algo no ha ido solo —informe sin leer, suma que no
cuadra (no se guarda ninguno), ahorros sin guardar, expedientes que el informe no cita,
verificados MENORES, dictamen o factura sin leer, un PDF que no se pudo subir— el título lleva
«⚠ REVISAR ·» y el texto ARRANCA con «⚠ HAY QUE REVISAR — LOTE…» y una línea por fallo
(`problemasDe` en [verificacionCorreo.js](implementation/backend/services/verificacionCorreo.js)):
el WhatsApp no lleva título, y un «no cuadra» al final del mensaje no se leía. **Subido A MANO**
en la fase 4 (el informe, el dictamen o la factura del verificador), si hay algún fallo sale el
MISMO aviso, con «(subido a mano por …)» en la cabecera (`avisarSubidaAMano`, desde
`subirDocumentoLote`; Fran: «sí, avisa también»); si todo va bien no se manda nada, porque quien
lo sube ya lo ve. Por el correo no se duplica: ahí avisa `verificacionCorreo`, una vez por correo.

**REGLA — lo que el lote escribe en un expediente queda en el HISTORIAL del expediente** (Fran,
20/11/2026: «no quiero perder la trazabilidad del expediente»). `instalacion.verificacion` solo
guarda la ÚLTIMA cifra, así que cada ahorro verificado (solo o aplicado a mano), cada inversión
del dictamen y cada decisión de un verificado menor se apunta también en
`documentacion.historial` del expediente: la cifra, de qué informe o dictamen y lote sale, la
actuación, quién, y **lo que había antes** si cambia (`anotarHistorialExpediente` en
[loteVerificados.js](implementation/backend/services/loteVerificados.js)). Se AÑADE por la RPC de
merge, nunca reescribiendo `documentacion`, y un fallo ahí no deshace la cifra. Se ve en el
historial del expediente (fase TRAMITACIÓN). Los 21 guardados solos de LOTE-2026-018 y
LOTE-2026-015 se apuntaron después, con la fecha en que se guardaron.

Para un lote con el informe YA subido: `guardarAhorrosDelInformeSubido(loteId, { seco })`
(export de `routes/lotes.js`; en seco por defecto). Primer uso, 18/11/2026: **LOTE-2026-018**
(CAE-2059), 10 de 10 guardados, 596.516 kWh, cuadra. Ninguno menor: la diferencia con lo
declarado era de menos de 1 kWh en todos (redondeo). Con `buffer` mira en seco un informe aún
SIN subir (el del correo, antes de colgarlo). **LOTE-2026-015** (CAE-2035, 20/11/2026), desde
el correo de Marwen: informe, dictamen MW-2035/26 favorable y factura FV20261501 (2.200 € de
base) subidos solos, 11 de 11 guardados, 722.891 kWh, cuadra, ninguno menor; el lote pasó a
VERIFICADO y se avisó sin «⚠».

### 2. Verificado MENOR que lo declarado: se decide en la fase 7, antes de pagar

La cuenta es pura y única ([logic/ahorroMenor.js](implementation/frontend/src/features/lotes/logic/ahorroMenor.js),
`estadoAhorroMenor`), y la usan el panel y el servidor (`cobroService.ahorroMenorDe`).

**REGLA — «lo acordado» es el bono DECLARADO**: el ahorro del expediente (el del CEE presentado
al verificador) a su precio pactado (`computeExpedienteFinancials`: `savingsKwh` → `cae`).
**Por debajo de 1 € no es «menos»**: es el verificador redondeando a kWh enteros.

**REGLA — sin decidir, no entra en la remesa** (`pagoDeExpediente`: motivo y `decidir_ahorro`).
La fase 7 lo avisa arriba y en su fila, con dos botones (solo ADMIN,
`POST /api/lotes/:id/cobros/:expId/ahorro-menor`, [ahorroMenorService.js](implementation/backend/services/ahorroMenorService.js)):

- **Pagarle lo acordado**: se le SUBE el precio por MWh (`instalacion.economico_override.cae_client_rate`)
  lo justo para que el bono sobre el verificado sea el declarado. El precio se resuelve con DOS
  evaluaciones de la propia economía (`precioParaAcordado`: el bono es lineal en el precio), así
  entran el descuento del prescriptor y el IVA de la empresa sin reescribir la fórmula; seis
  decimales. El margen baja, y lo cuentan el panel, el lote y la factura, porque leen el mismo
  precio. La remesa transfiere el declarado CONGELADO, al céntimo (`bonoVerificado`).
- **Pagarle lo verificado**: al precio de siempre, sobre lo verificado.

**REGLA — lo acordado se CONGELA al decidir** (`ahorro_menor.bono_declarado` en
`documentacion.cobro`, por la RPC de merge): al subir el precio, el declarado recalculado
también sube y ya no sirve de referencia. El verificado al precio pactado sale de
`bono declarado × kWh verificado ÷ kWh declarado` (lineal en el ahorro).

**REGLA — una decisión vale para ESAS cifras**: si llega otro informe con otro verificado, o
cambia el declarado, vuelve a estar pendiente («había una decisión para otras cifras»).

**REGLA — se puede cambiar de opinión hasta la remesa**, y deshace lo anterior: de «acordado»
a «verificado» el precio vuelve EXACTAMENTE al que había (`precio_override_antes`), o se quita
si no había ninguno. Con la remesa generada ya no se toca (409). Cada decisión va al historial
del lote.

Los ya pagados sin decidir (anteriores a esto) se pagaron sobre lo verificado y la fila lo dice
en gris. Medido el 18/11/2026: 6 de 94 expedientes con verificado salen menores; 4 ya pagados
(LOTE-2025-001 y los paquetes PRE APP) y **2 por pagar en LOTE-2025-002**: 25RES060_69 (−186,24 €;
para lo acordado, 90 → 93,04 €/MWh) y 25RES060_70 (−146,43 €; 92 → 94,93 €/MWh).

⚠️ El override se escribe leyendo y reescribiendo `instalacion` (como `aplicarAhorrosVerificados`):
un expediente abierto en otra pestaña que autoguarde podría devolver el precio anterior. Si la
fila de la fase 7 vuelve a pedir la decisión, es eso.

⚠️ Con «acordado», el Anexo I y el Convenio imprimirían el precio nuevo si se REGENERAN
(`getClientCaeRate` lee primero el override). Tras la verificación no se regeneran; si un
requerimiento del G.A. lo pidiera, decidirlo antes.

Tras tocarlo: `node implementation/backend/scripts/test_ahorro_menor.mjs` y `test_remesa_sepa.js`.
