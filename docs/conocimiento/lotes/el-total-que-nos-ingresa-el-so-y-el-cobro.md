<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## El TOTAL que nos ingresa el S.O., y marcarlo COBRADO (2026-10-15)

El Resumen del lote enseñaba el ahorro, el pago al cliente y el beneficio, pero no **lo que
el Sujeto Obligado nos tiene que ingresar**, que es la cifra con la que se coteja la
transferencia del banco. Había que sumarla de cabeza (pago al cliente + beneficio, u
oferta × ahorro). Y cuando el S.O. pagaba no había dónde anotarlo: `facturas_so.estado`
preveía `PAGADA` desde su creación, pero nada lo escribía.

Ahora, en el Resumen (solo ADMIN: es dinero de Brokergy), una tarjeta **«Total a cobrar del
S.O.»**: la base **sin IVA** en grande y el total **con IVA (21 %)** debajo, en pequeño, con
céntimos. A la derecha, la fecha del ingreso y **«Marcar cobrado»**; una vez marcado,
«✓ Cobrado el dd/mm/aaaa» (con «deshacer»). La fila de la factura en la fase 6 lo repite.

| Qué | Dónde |
|---|---|
| Cálculo | `totalCobroSo()` en [loteEco.js](implementation/frontend/src/features/lotes/logic/loteEco.js) |
| Tarjeta y acción | [LoteDetailModal.jsx](implementation/frontend/src/features/lotes/components/LoteDetailModal.jsx) |
| Ruta | `POST /api/lotes/:id/factura-so/cobro` (adminOnly) — `{ cobrada, fecha_cobro }` |
| Columnas | `facturas_so.fecha_cobro` (dd/mm/aaaa), `cobrada_at`, `cobrada_por` ([facturas_so_schema.sql](implementation/backend/scripts/facturas_so_schema.sql)) |

**REGLA — con la factura emitida, el total es EL DE LA FACTURA.** Es el importe que el S.O.
ha recibido y el que va a transferir; recalcularlo podría dar unos céntimos distintos y
entonces el cotejo no sirve. Sin factura: oferta × ahorro **verificado** si lo tienen todos
los expedientes, y si no el **estimado**, avisado en ámbar. Medido en LOTE-2025-001:
21.261 € (pago cliente verif.) + 16.679 € (beneficio verif.) = **37.940 €** sin IVA =
base de la F-2026CAE_10 (216.800 kWh × 175 €/MWh); con IVA, 45.907,40 €.

**REGLA — solo se cobra una factura que EXISTE.** Sin número no hay importe con el que
cotejar el ingreso: la ruta responde 409 y la tarjeta dice que se genere antes.

**REGLA — marcarla cobrada mueve el lote a «PTE. PAGO BROKERGY A CLIENTE».** Es lo que
significa salir de «CAE EMITIDO – PTE PAGO BROKERGY». Lo hace la pantalla por la ruta de
estado de siempre (`PATCH /:id/estado`), con su guarda de la regla 28: si falta el ahorro
verificado de algún expediente, se dice y el cobro queda anotado igual. Deshacer el cobro
NO retrocede el estado.

**REGLA — regenerar o reenviar una factura COBRADA no la devuelve a EMITIDA.**
`upsertFacturaSo` conserva `PAGADA`: perder el cobro es volver a reclamarle al S.O. lo que
ya pagó.
