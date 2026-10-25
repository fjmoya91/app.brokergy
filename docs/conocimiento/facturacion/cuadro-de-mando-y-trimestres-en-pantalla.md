<!-- conocimiento · área: facturacion · las rutas de los enlaces son relativas a la raíz del repo -->

### Cuadro de mando y trimestres en pantalla: el armazón de Facturación, «Hoy» y «Trimestres» (2026-10-24)

**Por qué.** El servidor ya calculaba el cuadro de mando, los modelos estimados y el paquete para la
gestoría ([trimestres-y-contabilidad.md](docs/conocimiento/facturacion/trimestres-y-contabilidad.md));
faltaba verlo. Fran pidió la pestaña Facturación en el estilo «carta de pago» (regla 164: la única
pantalla interna en crema; el menú lateral sigue oscuro) y, con ella, una portada que diga cómo va el
año y qué hay que hacer hoy, y el cierre de cada trimestre sin montarlo a mano. Esta es la parte de
pantalla: el armazón de la pestaña, «Hoy» y «Trimestres». Los listados y los editores van aparte.

| Qué | Dónde |
|---|---|
| Armazón: cabecera, «+ Nuevo ▾» (tecla N), ⚙, pestañas, URL y última pestaña | [views/FacturacionView.jsx](implementation/frontend/src/features/facturacion/views/FacturacionView.jsx) |
| «Hoy»: el cuadro, sus KPI y la tira plegada | [components/hoy/CuadroMando.jsx](implementation/frontend/src/features/facturacion/components/hoy/CuadroMando.jsx) |
| Gráfico mensual (SVG propio), embudo y «Para hoy» | [GraficoMensual.jsx](implementation/frontend/src/features/facturacion/components/hoy/GraficoMensual.jsx) · [Embudo.jsx](implementation/frontend/src/features/facturacion/components/hoy/Embudo.jsx) · [ParaHoy.jsx](implementation/frontend/src/features/facturacion/components/hoy/ParaHoy.jsx) |
| «Trimestres»: resumen, gastos y paquete | [components/trimestres/](implementation/frontend/src/features/facturacion/components/trimestres/TrimestresVista.jsx) (`TrimestresVista`, `GastosTrimestre`, `PaqueteGestoria`) |
| ⚙ Ajustes: Emisores e Importar de AppSheet | [components/AjustesFacturacion.jsx](implementation/frontend/src/features/facturacion/components/AjustesFacturacion.jsx) |
| Piezas compartidas (aviso, error de API, diálogo crema, toast, fechas) | [estilo.jsx](implementation/frontend/src/features/facturacion/estilo.jsx), al final |
| Banco de pruebas (local, sin escribir) | `fx-demo.html` en el puerto 5186 (`.claude/launch.json` → `fx-demo-5186`) |

**REGLA — el ADMIN abre en «Hoy» y lo ve todo; el TRABAJADOR solo Presupuestos y Artículos.**
Facturas, Trimestres y el cuadro son importes de BROKERGY (y las rutas son `adminOClaveInterna`); un
`?sub=` que el rol no ve cae en su pestaña por defecto. La última pestaña se recuerda en
`localStorage` (`fx-sub`), con `try/catch`: es una comodidad y puede fallar.

**REGLA — lo que se ve vive en la URL, y al salir de la pestaña se limpia.** `sub`, `f`, `serie`, `t`,
`nuevo`, `abrir` ([urlFacturacion.js](implementation/frontend/src/features/facturacion/urlFacturacion.js)).
En «Trimestres», `f` es la VISTA (`resumen` · `gastos` · `paquete`; sin `f`, resumen), no un chip de
listado. Cambiar de subpestaña quita `f`/`serie`/`t`; `nuevo` y `abrir` se quitan siempre al navegar.
La limpieza al desmontar va en diferido para que el doble montaje de StrictMode no borre el `f` de un
enlace pegado.

**REGLA — dos contribuyentes que NO se mezclan también en pantalla.** El selector de «Hoy» es
BROKERGY (ING + CAE, por defecto) o «Fran, autónomo» (FML). La FML nunca se suma a lo de BROKERGY:
para la sociedad es gasto. En «Trimestres», dos tarjetas: SOCIEDAD (303 con ISP, 111, candidatos al
349, gastos por actividad) y AUTÓNOMO (303 y 130 acumulado).

**REGLA — ningún componente vuelve a sumar lo que da la API.** Héroe, KPI, tira, trimestre, leyenda
del gráfico y totales de gastos salen tal cual (`acumulado`, `cobros`, `presupuestos`, `trimestre`,
`lineas`, `totales`). Lo único que se calcula aquí es presentación: la geometría del gráfico, los pasos
del embudo (contajes por estado: creados = `con_partidas + antiguos`; salieron = enviados + aceptados +
rechazados; contestados = aceptados + rechazados) y los días que quedan de plazo.

**REGLA — con la API caída, NUNCA un 0,00 € (regla 38).** Un fallo del cuadro (503, red) enseña
`ErrorApi`: aviso ámbar y «Reintentar»; si falla otro año, no se pintan las cifras del anterior; si
falla el mismo, se quedan las de la última lectura buena con una nota. Nada se reintenta solo (un
bucle contra una BD caída la remata). Los contadores de las pestañas solo salen con el cuadro traído.
El esqueleto, solo en la primera carga; al cambiar de año, lo de antes atenuado (`fx-recargando`).

**REGLA — ámbar, nunca rojo.** El tono `rojo` de la API se pinta en el ámbar fuerte (`--vence-*`,
`tonoDeApi`); `azul` es el crema informativo.

**REGLA — «Para hoy»: una fila por cosa y UN botón por fila.** Sale de `cobros.vencidas` (una a
una, con su `id` y su `origen`), de `presupuestos.por_facturar.presupuestos` y de `avisos` (su
`filtro` dice adónde ir). «Cobrada» abre el `CobroDialog` con el `id` de la vencida, sin buscarla, y
SOLO en las que se cobran aquí: las de `origen` LOTE (CAE) llevan «Ir a Lotes» y van primero; las de
CEE_DIRECTO y GESTION_CAE se cobran desde su expediente («Revisar» lleva al listado de vencidas).
Cuando las vencidas salen una a una, el aviso agrupado que las repite no se pinta. «Facturar», una fila
por presupuesto aceptado sin factura, lo abre en Presupuestos (`abrir`). «Prepararla» («Falta la
factura FML de…») abre el borrador FML que haya o DUPLICA la última FML emitida
(`POST /facturas/:id/duplicar`, nace BORRADOR con el mes siguiente) y la abre con `abrir`; no emite ni
envía. «Emitir» y «Revisar» solo cambian la vista.

**REGLA — lo que casi seguro ya está cobrado y no se marcó, en «Para hoy» con UN botón (25/10/2026).**
Dos casos que inflaban «Te deben»: (1) un lote que ya está en «PTE. PAGO BROKERGY A CLIENTE» o
FINALIZADO con su factura al S.O. sin cobrar (aviso ámbar con `filtro.motivo: 'COBRO_SIN_MARCAR'`,
`lote_id`, `factura_id`, `factura` y `total`): es UNA fila ámbar, por delante del resto de lo ámbar,
con «Ir a Lotes»; si esa factura además sale entre las vencidas, la fila de la vencida no se repite.
(2) Cada venta CAE de Drive sin el cobro marcado (`cobros.drive.pendientes`): fila ámbar «Cobrada» que
abre el MISMO `CobroDialog` de las ING con `url` = `POST /ventas-drive/:fileId/cobro` (no tienen
vencimiento: nunca son «vencidas»). En «Trimestres › Gastos», cada venta CAE de Drive leída lleva
también «Cobrada» / «Quitar el cobro». La nota de «Te deben» dice cuánto de lo CAE es de Drive (eso no
se cobra en Lotes): sale de `cobros.drive.pendiente`, no se resta aquí.

**REGLA — el titular de la variación no presume con el año anterior incompleto (25/10/2026).** Si
`acumulado.sl.comparable` es `false` (el año anterior tiene ventas CAE de Drive sin leer, o Drive no
respondió), en vez de «87 veces lo de 2025» sale «Sin comparar con 2025:» y `nota_comparacion`. En 2025
eran cinco sin leer: dos FACTP de Iberdrola y F-2025CAE_3/4/5 a Axoil.

**Las seis tarjetas de la SL** son Te deben, Vencido, Cobrado, **Días medios de cobro**
(`cobros.dias_medios_cobro`: de la fecha de la factura a la del cobro, en lo cobrado ese año y sin la
FML), **Por facturar** (`presupuestos.por_facturar`: aceptados de CUALQUIER año sin factura viva, sin
IVA; lleva al chip «Por facturar») y Esperando respuesta. El «% de aceptación» salió de las tarjetas
porque ya lo dice el titular del embudo.

**REGLA — leer gastos GASTA Gemini: se confirma diciendo cuántos.** «Leer N con IA» abre un diálogo
con el número y lo que cuesta; después `POST /gastos/leer` por tandas mientras `quedan > 0`, con
`SendActionOverlay` (`icon: 'read'`) y «Parar» (se para al acabar la tanda). Nunca se lee al abrir la
pantalla. Corregir es `PUT /gastos/:fileId` con SOLO lo cambiado (vacío = lo que diga el código); una
factura en otra moneda pide en su fila lo cargado en la tarjeta (`total_eur`). Corregir o leer
invalida el resumen guardado del trimestre.

**REGLA — el paquete se enseña en SECO antes de escribir; montarlo escribe en el Drive de
PRODUCCIÓN.** «Ver el plan» es `POST /trimestre/:t/paquete?seco=1` y deja claro qué se COPIA y qué
YA ESTÁ (en el T3, 3 y 56); los avisos repetidos se agrupan por mensaje (35 «sin leer» son una línea,
regla 29.d). «Montarlo en Drive» pide confirmación con el plan delante (carpetas, PDF que se copian,
libro que no pisa) y se sigue con `SendActionOverlay` (`icon: 'upload'`). Solo ADMIN con sesión.

**REGLA — los enlaces a Drive, solo para ADMIN** (regla 1): el PDF de cada gasto y el libro del
paquete. Toda la subpestaña ya es de ADMIN, pero el componente lo vuelve a mirar.

**Lo que no se ve en pantalla y por qué.** El NIF del autónomo no se pinta (es un DNI; el nombre basta).
Los datos de los emisores (IBAN, DNI) solo en su diálogo de ⚙ Ajustes, que lee `facturacion_emisores`.

#### Lo que la API aún no da (y cómo se ha resuelto)

- El `id` y el `origen` de las vencidas, los días medios de cobro y lo por facturar faltaban en la
  primera versión y ya vienen en `/cuadro` (24/10/2026).
- **El año anterior mes a mes**: no viene en el cuadro; se pide `/cuadro?anio=` del anterior en segundo
  plano solo para la marca fina del gráfico (si falla, el gráfico sale sin ella).
- Los avisos de «Para hoy» son de toda la casa: no se filtran por contribuyente.

#### Comprobado (24/10/2026, banco de pruebas contra producción, solo lecturas y `?seco=1`)

- «Hoy» 2026: 222.757,26 € de la SL («37 veces» lo de enero-octubre de 2025), 249.167,14 € pendientes
  (245.454 € de CAE, en Lotes), 62.952,98 € vencidos; 55 días medios de cobro sobre 41 facturas; 4
  presupuestos por facturar (924,73 € sin IVA); FML 20.250 € (+69 %). Con el cuadro forzado a 503:
  solo el aviso y «Reintentar», ninguna cifra.
- «Trimestres» 2026-T3: SL −422,10 € (303) y 1.012,50 € (111); autónomo 1.417,50 € (303) y 337,50 €
  (130); 6 de 9 en la lista del SOP; 21 pendientes de cobro. Gastos: 39 justificantes, 48 por leer (12
  de «6. JUNIO»). Paquete en seco: 3 se copian, 56 ya están.
- 360 y 390 px sin scroll horizontal; `check-hooks`, `vite build` y `eslint` de estos ficheros, limpios.

#### Comprobado (25/10/2026, banco de pruebas, solo lecturas)

- «Hoy» 2026: el titular dice «Sin comparar con 2025: 2025 tiene 5 ventas CAE de Drive sin leer»; «Te
  deben» 575.771,82 € (de lo CAE, 435.532,60 € son las cuatro ventas de Drive sin el cobro marcado);
  «Para hoy» con LOTE-2026-004 (F-2026CAE_8, 63.700,33 €) y LOTE-2025-003 (F-2026CAE_9, 74.196,99 €)
  en ámbar, las cuatro ventas de Drive con «Cobrada» (el diálogo se abre; marcar lo corta el banco) y
  el aviso de las cinco de 2025 sin leer. La F-2026CAE_10 (LOTE-2025-001) ya no sale: se marcó cobrada
  el 14/10/2026. «Trimestres › Gastos» 2026-T2: la autofactura de Iberdrola con «cobro sin marcar» y
  «Cobrada».
