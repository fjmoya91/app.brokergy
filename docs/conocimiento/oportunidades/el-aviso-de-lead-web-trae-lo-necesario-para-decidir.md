# El aviso de LEAD WEB trae lo necesario para decidir (2026-10-20)

Cuando entra un lead por la web (`POST /api/landing/lead`), se avisa por WhatsApp al chat de
administración (`WHATSAPP_ADMIN_CHAT`). Desde el 09/11/2026 sale para **todo lead público**; los de
la «Nueva simulación» del CRM no lo mandan. Antes la condición era `origen: 'reforma'`, que en la
práctica ya era todo. El aviso
solo traía la referencia, el nombre, el teléfono y el enlace de subida: para saber si el lead valía
la pena había que abrir la app (lo pidió Fran con 26RES060_OP312).

Ahora lo compone [avisoLeadAdmin.js](../../../implementation/backend/services/avisoLeadAdmin.js)
(función pura) y lleva: la ficha, si es un re-envío o un lead caliente, el contacto y el partner, la
dirección con la CCAA, el tipo de vivienda, la superficie, el año, la zona y la RC, la caldera con su
edad, el emisor, el ACS, las placas que ya tiene, los elementos de la reforma, el estado de la obra,
el gasto y el presupuesto, las cifras, el canal por el que quiere la propuesta, el plazo y el score.

Desde el formulario «Calcula tu ayuda» (09/11/2026) lleva además:
- **🔗** la obra que eligió en la web y quién mandó el enlace (`?ref=`);
- **🏡** si es su vivienda habitual, la habita otra persona todo el año o es segunda residencia;
- **📅** cuándo empezó la obra respecto al 22/03/2026;
- **🧾** el bono social de la luz, y si es solo por familia numerosa;
- **⚖️ Vía FM**: los MWh y el bono de `datos_calculo.via_fm`, que el servidor calcula con `viaFmDe`,
  como en la columna «Vía FM».

La línea de la vía FM lleva sus pegas: no aplica o no elegible, el ACS supuesto, y las que el resumen
aún no sabe y el cliente ha contestado: «NO cabe: segunda residencia» y «NO cabe: obra anterior al
22/03/2026». El gasto anual ya no se pregunta en el formulario público; si llega, se pinta. Ver «El
formulario "Calcula tu ayuda"».

**REGLA — las cifras del aviso salen con el MISMO criterio que la lista de oportunidades**: en un
RES080, `financialsRes080` y `res080.ahorroEnergiaFinalTotal`; en el resto, `financials` y
`savings.savingsKwh` (columna «⚡ € ▲» de `AdminPanelView`). Si cada sitio lo calculara a su manera,
el WhatsApp y la lista darían cifras distintas para el mismo lead.

**REGLA — el margen va solo porque el chat es el de administración.** Este aviso no puede
reutilizarse para un partner sin quitarle `profitBrokergy` (lo de importes y margen, solo ADMIN).

Tras tocarlo: `node implementation/backend/scripts/test_aviso_lead_admin.js`.
