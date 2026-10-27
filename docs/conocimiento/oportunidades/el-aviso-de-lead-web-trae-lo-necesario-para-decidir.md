# El aviso de LEAD WEB trae lo necesario para decidir (2026-10-20)

Cuando entra un lead por la web (`POST /api/landing/lead` con `origen: 'reforma'`, la entrada
pública actual), se avisa por WhatsApp al chat de administración (`WHATSAPP_ADMIN_CHAT`). El aviso
solo traía la referencia, el nombre, el teléfono y el enlace de subida: para saber si el lead valía
la pena había que abrir la app (lo pidió Fran con 26RES060_OP312).

Ahora lo compone [avisoLeadAdmin.js](../../../implementation/backend/services/avisoLeadAdmin.js)
(función pura) y lleva: la ficha, si es un re-envío o un lead caliente, el contacto y el partner, la
dirección con la CCAA, el tipo de vivienda, la superficie, el año, la zona y la RC, la caldera con su
edad, el emisor, el ACS, las placas que ya tiene, los elementos de la reforma, el estado de la obra,
el gasto y el presupuesto, las cifras, el canal por el que quiere la propuesta, el plazo y el score.

**REGLA — las cifras del aviso salen con el MISMO criterio que la lista de oportunidades**: en un
RES080, `financialsRes080` y `res080.ahorroEnergiaFinalTotal`; en el resto, `financials` y
`savings.savingsKwh` (columna «⚡ € ▲» de `AdminPanelView`). Si cada sitio lo calculara a su manera,
el WhatsApp y la lista darían cifras distintas para el mismo lead.

**REGLA — el margen va solo porque el chat es el de administración.** Este aviso no puede
reutilizarse para un partner sin quitarle `profitBrokergy` (lo de importes y margen, solo ADMIN).

Tras tocarlo: `node implementation/backend/scripts/test_aviso_lead_admin.js`.
