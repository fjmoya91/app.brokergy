<!-- conocimiento · área: clientes · las rutas de los enlaces son relativas a la raíz del repo -->

## La EMPRESA factura la venta del ahorro: autofactura o su factura (2026-11-04)

**Por qué.** Fran, 04/11/2026, con 26RES080_60 (LA XANTIPA CB) en la fase 7: «cuando se trata de una
persona jurídica, el cliente recibirá los 8.000 y pico, y debe emitir una factura a nuestro nombre por la
venta de ahorros energéticos […]. Si la ley permite emitir una autofactura y hacer el ingreso, sería lo
ideal; eso lo hace Iberdrola con nosotros. Si no, se le manda un ejemplo de cómo iría la factura para que
nos la emitan, y una vez nos la envíen, pagarles.» El precedente es la Parroquia de San José Obrero
(25TER100_1, factura 2026/0001, firmada el 15/02/2026): «Venta de Ahorros Energéticos para la emisión de
Certificados de Ahorro Energéticos (CAE)», 305.781 kWh × 0,105 € = 32.107,01 € **+ 21 % de IVA** =
38.849,48 €, a nombre de SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL.

**La ley lo permite.** Art. 5 del Reglamento de facturación (RD 1619/2012), «facturación por el
destinatario»: el destinatario puede expedir materialmente la factura en nombre y por cuenta del
proveedor si hay un **acuerdo previo por escrito** que fije **cómo acepta el proveedor cada factura**, y se
le remite cada una para que la acepte. Además: **serie específica** (art. 6.1.a) y la mención
**«Facturación por el destinatario»** (art. 6.1.m). El IVA lo sigue declarando el proveedor.

| Qué | Dónde |
|---|---|
| Líneas, número, acuerdo, observaciones, mensajes (fuente ÚNICA) | [logic/facturaVentaAhorro.js](implementation/frontend/src/features/lotes/logic/facturaVentaAhorro.js) |
| Pedir, expedir, aceptar, rehacer, recibida, «no procede», PDF, `paraRemesa` | [services/facturaVentaAhorro.js](implementation/backend/services/facturaVentaAhorro.js) |
| El popup de la fase 7 (solo ADMIN) | [FacturaVentaModal.jsx](implementation/frontend/src/features/lotes/components/FacturaVentaModal.jsx), botón «🧾 Factura de venta del ahorro» en la fila |
| Lo que ve la empresa | [FacturaAhorroView.jsx](implementation/frontend/src/features/cobro/views/FacturaAhorroView.jsx) en `/factura-ahorro/:expId?token=` (demo: `/factura-ahorro/demo`) |
| Rutas internas (adminOnly) | `GET /api/lotes/:id/cobros/:expId/factura-venta` · `POST …/pedir` · `…/rehacer` · `…/recibida` (multipart) · `…/no-procede` · `GET …/pdf[?modelo=1]` |
| Rutas públicas (token del cobro) | `GET /api/public/factura-ahorro/:expId` · `GET …/pdf` · `POST …/acuerdo` · `POST …/responder` |
| Registro | `documentacion.cobro.factura_venta` (objeto ENTERO por la RPC de merge); PDF en «5. FACTURAS» del expediente |
| Prueba sin red | `node implementation/backend/scripts/test_factura_venta_ahorro.mjs` |

**Los tres caminos**, elegidos en el popup:
1. **Autofactura (recomendada).** Se le manda un WhatsApp/email con el enlace. En su página acepta el
   ACUERDO (nombre + DNI de quien firma, casilla de «lo he leído»; se sella con hora, IP y navegador), en ese
   momento se EXPIDE la factura (`AF-{año}-{nnn}`, PDF a Drive) y la ACEPTA o dice qué está mal. Al equipo le
   llega un aviso (WhatsApp `WHATSAPP_ADMIN_CHAT` + `ADMIN_EMAIL`) en cada paso.
2. **La emite él.** Se le manda el MODELO en PDF (la plantilla de nuestras facturas con SU membrete,
   «(vuestro nº)» y «MODELO — a emitir por…»). Cuando la manda, en el popup se sube su PDF con su número y
   su TOTAL.
3. **No procede.** Entidad sin actividad empresarial (p. ej. una comunidad de propietarios): con su motivo,
   se le paga como a un particular.

### Lo ELIGE la empresa, en el formulario del cobro (2026-11-05)

Fran, 05/11/2026: «cuando se le envía al cliente el formulario, se le dan dos opciones: hazme una
autofactura, y se le explica todo, y entonces ya tiene que rellenar que está de acuerdo; o yo te emito la
factura, y entonces se le envían los datos que debe poner. Se le debe explicar bien al cliente.»

- El formulario `/cobro/:id` de una EMPRESA lleva una pregunta más, **obligatoria**: «¿Quién hace la
  factura?» (`bloqueFacturaVenta`, la añade `bloqueFormulario` del servicio en `buildVista`; demo:
  `/cobro/demo?empresa`). Dice antes POR QUÉ una empresa factura (vende el ahorro; no cambia lo que cobra) y,
  al elegir, NO avanza sola: enseña los pasos de esa opción (`PASOS_AUTOFACTURA`, 4: la hacemos nosotros —
  art. 5, como las eléctricas—, el acuerdo una sola vez, la revisáis y la aceptáis con su serie AF, y la
  registra su gestoría como emitida; `PASOS_CLIENTE`, 3) y sigue con «Continuar».
- Al confirmar, la pantalla final dice lo que va a recibir CON IVA y el **último paso**: autofactura → botón
  a `/factura-ahorro` para aceptar el acuerdo y la factura; «la emito yo» → los DATOS campo a campo (a nombre
  de, CIF, dirección, concepto con expediente y kWh, base, IVA, total, forma de pago), «Copiar los datos» y
  el enlace para subirla y ver el modelo.
- La elección se sella en `factura_venta.modo` + `elegido {at, por:'cliente', origen, modo}` (`elegir`) y el
  aviso al equipo la dice. Si `FACTURA_VENTA_ENVIO_AUTO=true`, además sale sola la petición (WhatsApp +
  email al contacto del cliente, `mensajeVentaAhorro` con los datos escritos o la explicación de la
  autofactura y el enlace al final). **Nace APAGADO** (como la carta de pago): sin él, los datos ya los ve en
  pantalla y el equipo manda el mensaje desde el popup.
- En `/factura-ahorro` también puede elegir (si no lo hizo), cambiar de opción mientras no haya nada
  expedido (`puedeElegir`) y, en «la emito yo», **subir él su factura** (PDF, nº y total; el total admite
  «9.820,00» o «9820.00», `leerImporte`): queda RECIBIDA con `por: 'cliente'` y al equipo le llega el aviso,
  con una línea si el total no cuadra. Rutas públicas nuevas: `POST /api/public/factura-ahorro/:expId/elegir`
  y `…/subir` (multipart `factura`), las dos con el token del cobro.

**REGLA — la empresa se reconoce por la FICHA (`clientes.es_empresa`)**, la misma marca que cambia el
Cedente del Convenio y el Anexo I. Un particular no ve nada de esto.

**REGLA — la BASE es lo que la remesa le iba a transferir** (bono VERIFICADO menos los honorarios si eligió
descontarlos, con `bloquePago`), y **el IVA va ENCIMA** (21 % por defecto, 0 % «no sujeta» a elegir), como
en la factura de la Parroquia. Es UNA línea a 1 ud por la base, con los kWh y el €/kWh en el detalle: kWh ×
precio redondeado no cuadra al céntimo con el bono, y el descuento de gestión va contado en el detalle y no
como línea negativa (el IVA por línea podía descuadrar un céntimo con el de la base). Por eso, antes de
pedirla, tiene que haber elegido cómo liquida la gestión (o regalársela): cambia la base.

**REGLA — el orden legal está en el código: ACUERDO → se EXPIDE → ACEPTA.** No se numera nada antes de
sellar el acuerdo; el número sale en el mismo gesto en que lo acepta. Sin aceptación no se paga.

**REGLA — la serie es la del PROVEEDOR**: `AF-{año}-{nnn}` correlativa POR CIF (buscando en todas las
fichas con ese CIF), porque son facturas de SU libro de emitidas, no del nuestro. No van al libro de
AppSheet ni a `facturas_emitidas`.

**REGLA — un número expedido no se tira.** Si señala un error, se corrige la ficha y «Rehacer» rehace la
misma `AF-…` (aún no estaba aceptada) y vuelve a pedir que la acepte. Una ACEPTADA ya no se rehace: sería
una rectificativa (no implementada: se hace a mano).

**REGLA — sin su factura ACEPTADA o RECIBIDA (o «no procede»), una empresa NO entra en la remesa**, y se
dice por qué («aún no ha aceptado el acuerdo», «la AF-… está sin aceptar», «ha señalado un error»…). Con
ella, **se transfiere el TOTAL de la factura, IVA incluido** (`paraRemesa` en `pagoDeExpediente`); si su
base no cuadra con la calculada hoy, sale un aviso. La carta de pago lee el importe de la remesa, así que
dice lo mismo.

**REGLA — la cuenta va ENMASCARADA también en el PDF** («Cuenta del proveedor»): viaja por WhatsApp y
email.

**Medido el 04/11/2026 en seco** sobre 26RES080_60 (LA XANTIPA CB, E26753236): 81.157 kWh verificados,
8.115,70 € + 1.704,30 € de IVA = **9.820,00 €**; el modelo en PDF sale en una hoja. El pedido quedó
bloqueado con razón: no había confirmado la cuenta ni elegido cómo liquida la gestión.

**Pendiente (no hecho):**
- Una cláusula en el **Convenio de Cesión** para las empresas que deje firmado el acuerdo de autofacturación
  desde el principio (hoy se acepta en el enlace, al cobrar). Toca un documento de alto fijo y medido.
- **VERI*FACTU**: las autofacturas no se encadenan aún. Cuando sea obligatorio (sociedades, 2027) el registro
  lo puede hacer nuestro SIF en nombre del proveedor (`EmitidaPorTercerosODestinatario = D`).
- Copia en contabilidad (facturas RECIBIDAS de la sociedad): hoy solo van a «5. FACTURAS» del expediente.
- Compensar la factura de gestión (si eligió «factura») con la de venta en una sola transferencia.
