# El ACS se declara en el MISMO clima que la calefacción (2026-10-21)

Caso: **26RES060_122** (hibridación SH MASTER 14 + termo Haier HP200M7-F9, zona D3). Fran: «no vamos
a decir que uno tiene clima cálido y la otra clima medio».

**REGLA — el SCOP_dhw y el SCOP de calefacción salen de la MISMA temporada.** Si la calefacción se
declara en clima medio (`aerotermia_cal.scop_temporada = 'medio'`), el ACS también: su valor sale de
los datos de clima MEDIO de su ficha y el CIFO lo rotula así.

- El CIFO rotulaba el ACS con `zoneLabel` (la ZONA: en D3, «Cálido») aunque la calefacción estuviera
  sellada en medio. Ahora usa `climaScopAcs` ([cifoDoc.js](../../../implementation/frontend/src/features/expedientes/logic/cifoDoc.js)):
  con la temporada de calefacción sellada manda ella; sin sello, la zona, como siempre (un CIFO ya
  emitido no cambia al regenerarse). El Anexo VI no se toca: su F_c es por ZONA.
- Un termo con bomba de calor (depósito incorporado) se justifica por el **Anexo IV**:
  SCOP_dhw = 2,5 · η_wh, con la η_wh de **clima medio** de su ficha EPREL. HP200M7-F9 (EPREL 2391062):
  135 % medio (116 % frío, 146 % cálido) → 2,5 · 135 % = 3,375 → **3,38**. El 3,63 que traía el catálogo
  no sale de ningún dato de clima medio de la ficha (está cerca del 146 % del cálido).
- La ficha técnica que se aporta tiene que traer SOLO el dato que se declara. Del SH MASTER hay dos:
  la «ed.2» original (solo clima medio, 3,85 a 55 °C) y la del catálogo «SCOP MEDIO-CALIDO»
  (`3,85/4,58`). En 26RES060_122 se puso la «ed.2» en el hueco del expediente
  (`… - FT AEROTERMIA CALEFACCION.pdf`); el CIFO adopta la que encuentra y no copia la del catálogo.
- La potencia de la bomba es la de la FICHA/PLACA, no el número comercial: el MASTER 14 es el
  SH-HPM12-Nd2 y da **12 kW** (el catálogo tiene 14, y así toda la serie: MASTER 17 = 14 kW,
  MASTER 19 = 16 kW). Con la potencia de la CALDERA (método «caldera», 38,4 kW) el C_b bajaba de
  82,10 % a 57,91 %.

## El botón «Clima del SCOP» (2026-10-21)

Fran: «un botón … para saber si el ahorro sale mayor», en la oportunidad y en el expediente.

**REGLA — en una hibridación el clima se ELIGE, y lo elegido viaja de la oportunidad al expediente.**
Junto a «Base del % de cobertura»: en la calculadora `inputs.scopClima` (con el bono de cada clima al
lado, `result.comparativaClima`) y en «Análisis de Hibridación» del expediente `instalacion.scop_clima`
(con el bono de cada clima en el propio botón, calculado por `computeExpedienteFinancials`). Solo con la
hibridación ACTIVA y en zona cálida; sin hibridación todo sigue como estaba. Pulsar es una decisión
explícita: los SCOP se releen del catálogo aunque se hubieran tecleado. Al aceptar, `expedienteService`
copia `scop_clima` y sella `scop_temporada: 'medio'` en la bomba y en el ACS.

Medido en pantalla (local, 21/10/2026): 26RES060_OP6 · cálido 3.610 € (SCOP 4,58 · C_b 68,94 %) frente a
medio 4.468 € (SCOP 3,85 · C_b 88,63 %); 26RES060_122 · cálido 4.045 € frente a medio 5.125 €.

⚠️ Pendiente de decidir: el Haier HP200M7-F9 (catálogo 137) tiene `scop_dhw_calido` = `scop_dhw_medio`
= 3,63, que no está en su ficha técnica (COP 3,26 a 7 °C); con método «ficha» la calculadora lo usa en
los dos climas. Con el η_wh de su EPREL (ya en el catálogo: 146 / 135 %) saldría 3,65 / 3,38.
