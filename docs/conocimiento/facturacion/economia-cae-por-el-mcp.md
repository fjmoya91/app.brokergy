<!-- conocimiento · área: facturacion · las rutas de los enlaces son relativas a la raíz del repo -->

## La economía de los CAE, por el MCP: `get_expediente`, `volumen_cae` y `listar_facturas` CAE (2026-10-27)

**Por qué.** Fran quiere sacar datos REALES de la app para las convocatorias de premios y la previsión de
cierre (volumen de CAE, facturación posible y hecha) sin exportar Excel. El MCP solo daba el ciclo de vida
del expediente y las facturas ING/FML; el importe del CAE, los kWh y lo facturado al Sujeto Obligado no
salían por ningún sitio.

| Qué | Dónde |
|---|---|
| Economía de un expediente y volumen de la cartera | [services/economiaCae.js](implementation/backend/services/economiaCae.js) |
| Ventas CAE de un año (app + autofacturas de Drive leídas) | `ventasCae()` en [contabilidadService.js](implementation/backend/services/contabilidadService.js) |
| Rutas (adminOClaveInterna) | `GET /api/facturacion/economia-cae/expediente/:numero` · `GET /api/facturacion/economia-cae/volumen?anio=&ficha=&rechazados=1&detalle=1` · `GET /api/facturacion/ventas-cae?anio=` |
| Herramientas del MCP | `get_expediente` (bloque `economia`), `volumen_cae` (nueva), `listar_facturas` con `serie: 'CAE'` |

**REGLA — la economía sale de `computeExpedienteFinancials`, la fuente única del FRONTEND** (la del listado,
el panel del expediente y el lote), importada por ESM desde el backend. No del gemelo
`expedienteFinancialsNode.js`: ese no trae el ahorro VERIFICADO ni la herencia de la propuesta aceptada, y
un expediente sin CEE (86 de 345 el 27/10/2026, todos los migrados de 2024-2025) saldría a cero. El MCP
corre en su propio contenedor, sin `frontend/src`: por eso pide la cifra al backend y no la calcula.

**REGLA — cada cifra dice de dónde sale.** `origen_cifra` = `CEE` (recalculada con el certificado) o
`PROPUESTA` (heredada de la oferta aceptada); lo VERIFICADO va aparte (`ahorro_verificado_kwh`,
`bono_cliente_verificado`), y es sobre lo que se factura al S.O. En una factura de lote, la parte del
expediente es su ahorro verificado al €/MWh facturado; sin verificado no se reparte.

**REGLA — mismos criterios que la app.** El volumen deja fuera los RECHAZADOS (como el cuadro de mando);
las ventas CAE son las del cuadro de Facturación: `facturas_so` emitidas más las autofacturas de Drive ya
leídas, sin contar dos veces; las sin leer no cuentan y se dicen. Con Drive caído salen las de la app y un
aviso. Importes y margen: solo ADMIN o el MCP. Lecturas ligeras (regla 22): `cee` por `CEE_ECO_SELECT` y de
`datos_calculo` solo `inputs`, `zona` y las ramas de `result` que lee la economía, con `.in()` por lotes.

### Medido el 27/10/2026 (solo lecturas, contra producción)

- Cartera sin rechazados: **345 expedientes, 19.098,78 MWh estimados, 3.933,55 MWh verificados (59)**;
  bono a clientes 1.761.823,59 €, beneficio estimado 1.125.864,93 €. RES060 240 · RES080 87 · RES093 16 ·
  TER100 2. El cálculo de toda la cartera tarda ~6 s.
- Ventas CAE 2026: 8 facturas, 562.798,56 € sin IVA (680.986,25 € con IVA), todas cobradas; 4 de lotes
  (F-2026CAE_7…10, 1.171.298 kWh) y 4 autofacturas de Drive (Iberdrola ×3, Naturgy), éstas sin kWh.
- ⚠️ **Ventas CAE 2025: sale 0** porque sus 5 facturas (dos FACTP de Iberdrola y F-2025CAE_3/4/5 a Axoil)
  están en Drive **sin leer**. Para que cuenten: Facturación › Trimestres › Gastos › «Leer con IA».
- La inversión de los migrados está vacía (no tienen presupuesto guardado): en 2025 suma 0.
