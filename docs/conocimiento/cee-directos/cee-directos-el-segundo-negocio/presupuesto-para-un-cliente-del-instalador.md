<!-- conocimiento · área: cee-directos · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Presupuesto «para un cliente suyo»: lo pide el instalador, el certificado es del propietario (2026-11-10)

**El caso.** Un instalador (Alberto Soria, 10/11/2026) nos pide varios certificados para clientes
suyos. Quiere el presupuesto a SU nombre, ser él el contacto y que se le facture a él, pero el
certificado tiene que salir a nombre del dueño de cada vivienda, con su dirección y su referencia
catastral. Fran lo pidió el 04/11/2026 (sesión «Presupuestos: datos del instalador y cliente»), se
quedó en propuesta y se construyó el 10/11/2026.

**REGLA — el que va en el certificado sigue siendo el CLIENTE; quien paga es el PAGADOR.** No se
inventa un «titular» (ver «Quién es el CLIENTE y quién el PARTNER»): el `cee_directos.cliente_id` es
el PROPIETARIO y el instalador queda en la columna nueva `cee_directos.pagador_cliente_id`. El
presupuesto sigue a nombre del instalador (`cee_ofertas.cliente_id`) y apunta al propietario en
`cee_ofertas.propietario_cliente_id` cuando se acepta.

**Cómo se marca.** En el editor del presupuesto (Facturación), debajo del cliente: «Lo pide para un
cliente suyo» (`cee_ofertas.para_tercero`). Se marca sola al elegir una EMPRESA en un presupuesto
nuevo y se puede quitar. Por el MCP, `crear_presupuesto` con `para_tercero: true`. Solo actúa si el
presupuesto lleva un certificado (`alcance`): sin CEE no hay propietario que pedir. El mensaje del
envío ya avisa de que al aceptar se le pedirán los datos del propietario.

**Qué rellena el instalador al aceptar** (`/aceptar-cee/:token`, demo en `/aceptar-cee/demo?tercero`):
sus datos y su domicilio fiscal (los de la factura), el PROPIETARIO (nombre y DNI obligatorios;
móvil y email opcionales), el inmueble y el cuestionario de climatización dicho en tercera persona, y
**con quién concierta la visita el técnico**: «Conmigo» o «Con el propietario».

**REGLA — si la visita es con el instalador, la ficha del propietario nace con el DESVÍO de contacto
a él.** Así el técnico y los avisos le llegan al instalador por el camino de siempre
(`notificaciones_contacto_activas` + `persona_contacto_*`, con la persona de contacto del instalador
si la tiene). «Con el propietario» sin móvil ni email se trata como «Conmigo». En el cuestionario
queda `coordina_visita` y la ficha del CEE lo enseña como «Visita del técnico».

**REGLA — un DNI que ya tiene ficha ES esa persona.** Se usa esa ficha y solo se rellenan sus
huecos; **no se le cambia el desvío** (le desviaría también los avisos de lo que ya tenga con
nosotros). El DNI del propietario no puede ser el del instalador (400). Si el alta del CEE falla, la
oferta vuelve a ENVIADA y la ficha del propietario recién creada se borra si no cuelga nada de ella.

**El partner.** El del presupuesto; si no tiene, el `prescriptores` con el MISMO CIF que el
instalador (`partnerDelPagador`). El expediente nace con el nombre del propietario.

**REGLA — la factura y la entrega van a QUIEN PAGA.** En el popup de la factura el destino por
defecto es «Quien paga» (`destino: 'pagador'`, `destinoPorDefecto`); se puede cambiar a «Cliente»
si el instalador prefiere que se facture al propietario, y entonces la entrega sigue a la factura
(`destinatarioEntrega`). Sin factura todavía, también se entrega al pagador: es quien aceptó. La
confirmación tras aceptar le llega al instalador y dice a nombre de quién irá el certificado.

**Lo que NO cambia.** Un presupuesto sin la marca funciona exactamente igual que antes: el CEE es de
quien acepta y no hay pagador.

Código: [ceeOfertaService.js](implementation/backend/services/ceeOfertaService.js) (`resolverPropietario`,
`partnerDelPagador`, `aceptar`), [ceeFacturaService.js](implementation/backend/services/ceeFacturaService.js),
[ceeDirectoEntrega.js](implementation/backend/services/ceeDirectoEntrega.js),
[AceptarOfertaCeeView.jsx](implementation/frontend/src/features/public/views/AceptarOfertaCeeView.jsx),
[PresupuestoModal.jsx](implementation/frontend/src/features/facturacion/components/PresupuestoModal.jsx).
Esquema: [presupuesto_para_tercero_schema.sql](implementation/backend/scripts/presupuesto_para_tercero_schema.sql)
(aplicado en producción el 10/11/2026). Pruebas: `node implementation/backend/scripts/test_presupuesto_para_tercero.js`
y `node implementation/backend/scripts/test_oferta_cee.mjs`.
