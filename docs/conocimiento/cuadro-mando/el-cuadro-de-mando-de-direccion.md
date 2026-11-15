<!-- conocimiento · área: cuadro-mando · las rutas de los enlaces son relativas a la raíz del repo -->

## El cuadro de mando de DIRECCIÓN: toda la empresa de un golpe (2026-11-14)

**Por qué.** Fran (14/11/2026), sobre la pestaña «Cuadro de mando»: «tiene que ser como el cerebro de mi
empresa. Y en un simple golpe lo tengo que ver todo», con la imagen de marca nueva, en el móvil, y no solo
los CAE: también los CEE directos y lo demás; «cómo vamos ya también cerradas, sin facturas… las del
ministerio, las que están enviadas»; y «una vista a nivel como si fuese un CFO para saber mi EBITDA y todos
los indicadores económicos… y previsión de venta, facturación». El cuadro antiguo solo pintaba la cartera
CAE (GWh y margen por fase), calculado en el navegador sobre `GET /api/expedientes`.

| Qué | Dónde |
|---|---|
| Las cuentas (todas) | [services/cuadroDireccion.js](implementation/backend/services/cuadroDireccion.js) |
| Rutas (solo ADMIN o clave interna) | [routes/cuadroMando.js](implementation/backend/routes/cuadroMando.js): `GET /api/cuadro-mando/negocio` · `GET /api/cuadro-mando/finanzas?anio=` (las dos con `?forzar=1`) |
| La pantalla | [views/DashboardView.jsx](implementation/frontend/src/features/dashboard/views/DashboardView.jsx), [components/CuadroSecciones.jsx](implementation/frontend/src/features/dashboard/components/CuadroSecciones.jsx), [components/CarteraCae.jsx](implementation/frontend/src/features/dashboard/components/CarteraCae.jsx), estilo en [cuadroEstilo.js](implementation/frontend/src/features/dashboard/cuadroEstilo.js) sobre el kit crema de Facturación |
| Que cuadre | `node implementation/backend/scripts/check_cuadro_mando.js [año]` (solo lectura) |
| Gastos de los trimestres cerrados | [services/libroContable.js](implementation/backend/services/libroContable.js): el libro maestro de la gestoría, solo lectura |

### Qué enseña, en este orden

1. **Arriba**: el EBITDA del año (con su minigráfico acumulado y la cuenta en cuatro líneas) y seis cifras:
   facturado, margen bruto, te deben, circulante neto, cartera ponderada y cierre del año.
2. **Requiere tu atención**: lotes por facturar, bonos por transferir de lotes ya cobrados, expedientes listos
   para lote (y sin CIFO), urgentes, incidencias, parados en cierre ≥ 30 días, CEE directos sin facturar o sin
   cobrar, propuestas calculadas sin enviar, gastos de Drive sin leer y los avisos de Facturación (vencidas,
   FML que falta, plazo fiscal ≤ 20 días). Cada una con su enlace a la pestaña que lo resuelve.
3. **Salud**: margen bruto, margen EBITDA, crecimiento interanual, días medios de cobro, vencido sobre lo
   pendiente, peso del mayor cliente, meses de estructura cubiertos por la cartera y punto de equilibrio. Verde
   = bien, ámbar = vigilar, **gris = no se puede juzgar todavía** (con gastos sin leer, el EBITDA, la cobertura y
   el equilibrio salen grises: no se pinta de verde algo que puede ser mentira).
4. **Resultados**: la cuenta de resultados de gestión (abajo), el gráfico mensual de Facturación (ING + CAE) y
   el EBITDA de cada mes.
5. **Caja**: circulante neto y su desglose, cobrado en el año, vencido, lo que debe el CAE, el próximo plazo
   fiscal y las facturas más antiguas sin cobrar.
6. **Previsión**: la escalera de la cartera CAE (bruto frente a ponderado), el cierre del año y lo que viene de
   servicios.
7. **Negocio CAE**: de la propuesta al cobro (captación → fases del expediente sin lote → etapas del lote) y la
   lista de lotes con su etapa, importe y margen; la captación por estado, altas por mes y conversión por edad.
8. **Otros servicios**: CEE directos (facturado, ticket, margen por CEE, por facturar, por cobrar, en marcha),
   presupuestos de servicios (tasa de aceptación, enviados, aceptados sin facturar) e informes / CIT.
9. **Análisis de la cartera CAE** (plegado): el cuadro antiguo — filtros, precio simulado (vacío = el precio
   medio de los lotes abiertos, clave `brokergy-cuadro-precio-so` del navegador), reparto, los que más margen
   dejan y exportar a Excel.

### Cómo se calcula cada cifra (las REGLAS)

**REGLA — en el navegador no se hace NINGUNA cuenta de dinero.** Todo sale de `cuadroDireccion.js`, que
reutiliza lo que ya calcula la app y no lo vuelve a escribir: `dashboardAgg` (filas de expediente y
oportunidad, fases), `loteEco` (`computeLoteEco`, `totalCobroSo`) y `expedienteFinancials` del frontend
importados por ESM (con extensión `.js`), y `contabilidadService` para ventas, cobros, gastos y el 303/111.
Dos fuentes son dos verdades: si una cifra del cuadro no casa con su pestaña, el fallo está en la función
compartida.

**REGLA — la cuenta de resultados es de la SOCIEDAD y sin IVA ni suplidos.**
- *Ingresos* = las ventas de `contabilidadService.cuadro` (ING + CAE de `facturas_so` + autofacturas de Drive
  leídas). La **FML de Fran no es ingreso**: es un gasto de la SL (va dentro de Estructura). Las tasas del
  registro de un CEE son **suplidos** (`desgloseVenta`): fuera del ingreso, y por eso el desglose por origen
  (CEE / gestión CAE / otros) usa la misma base.
- *Coste directo del CAE*: cada venta CAE del año (`ventasCae`) se **casa con su lote** (por código, o un lote
  «PRE APP» por importe ±2 %) y su coste es `base × (1 − margen del lote ÷ base del lote)`, con el margen que
  dan sus expedientes **repreciados al precio real de esa factura** (bonos a clientes, comisión del partner,
  ITP, certificados). Lo que no casa (ventas antiguas por Drive) lleva el coste medio de lo casado. Se casa por
  venta y no por mes de `fecha_cae`: PAQUETE 2 tiene el CAE de septiembre y la autofactura de octubre.
- *Técnicos de los CEE directos*: nº de CEE facturados × el **honorario** medio sellado al conciliar las
  facturas de los certificadores (`fact_cert.honorario`). Las tasas que adelanta el técnico se repercuten al
  cliente como suplido: ni ingreso ni coste.
- *Estructura*: ver «La estructura sale del libro de la gestoría», abajo.

**REGLA — la estructura de un trimestre CERRADO sale del libro maestro que se entrega a la gestoría; la del
trimestre en curso se estima y se dice.** (2026-11-14, Fran: «entra en la carpeta S2E2 para el resto de
facturas que ya se le pasó de los trimestres».) Leer factura a factura en Drive dejaba 101 gastos sin leer
y una estructura de 20.250 € (solo la FML): el EBITDA presumía de más. El libro
`04. CONTABILIDAD / CONTABILIDAD {año} - BROKERGY (master).xlsx` es lo que se cierra cada trimestre (su SOP
«Cierre contable trimestral» está en la misma carpeta) y es la verdad contable.
- Lo lee [services/libroContable.js](implementation/backend/services/libroContable.js), **solo lectura**:
  descarga el .xlsx (`gastosDrive.ficheroEn` + `contenido`) y lo interpreta en memoria; se recuerda mientras su
  `modifiedTime` no cambie. Las columnas se buscan por su cabecera, no por su posición. Hojas: «GASTOS {año}»
  (facturas recibidas de la SL: líneas CAE, ING y la FML que el socio factura a la SL) y «VEHÍCULO Y DIETAS»
  (solo las filas con Contrib. «Empresa SL»; las del autónomo no son de la SL).
- Cada fila se clasifica: **bono** (la cesión del ahorro al cliente: ya está en el coste directo),
  **inversión** (columna INMOV: CAPEX, debajo del EBITDA), **certificados** (honorarios de los certificadores
  y tasas del registro de los CEE en la línea CAE: ya están en el coste directo de cada expediente),
  **sin importe** (filas «IMPORTE PENDIENTE») y **estructura** (el resto, FML incluida), con el IVA que no
  se deduce (el ISP se autorrepercute y se deduce: neutro). Los suplidos (las tasas que repercute un
  certificador) no son coste.
- El mes contable es el de la columna Mes si cae dentro del trimestre de la fila; si no (la Pepephone de
  marzo facturada el 1/04 va en T2), el primer mes de ese trimestre: los meses suman cada trimestre.
- **Control**: la base de todas las filas de un trimestre tiene que sumar lo que dice la fila «Gastos SL —
  Base imponible» de su hoja RESUMEN; si no cuadra, aviso ámbar y el check falla. El 14/11/2026 cuadraba al
  céntimo en T1, T2 y T3 (70.284,02 · 145.214,55 · 35.645,58 €).
- Un trimestre cerrado que NO está en el libro sale de Drive leído factura a factura, como antes; si le
  quedan gastos sin leer, el EBITDA es **provisional** y se dice cuántos faltan.
- El trimestre **en curso** cuenta cada mes transcurrido con lo leído en Drive o, si es menos, con la
  **media mensual de los trimestres cerrados** (las facturas de un mes llegan después; el mes de hoy cuenta
  entero: prudente). Va marcado «estimado» en la cuenta. Sus gastos sin leer no hacen provisional el EBITDA:
  los recuerda el aviso del trimestre de Facturación.

**REGLA — un lote está en la etapa que dicen los HECHOS del dinero, no solo su estado**: en preparación →
en el verificador → en el MITECO → CAE emitido por facturar → facturado por cobrar → cobrado con bonos por
pagar → cerrado. Desde «CAE emitido» mandan la factura al S.O. (`facturas_so`), su cobro y los bonos
transferidos (`documentacion.cobro.transferencia` de cada expediente); «PTE. PAGO BROKERGY A CLIENTE»
implica que el S.O. ya pagó. Los bonos pendientes se cuentan **por expediente sin transferencia**, no por
diferencia de importes (dejaba restos).

**REGLA — la previsión pondera con lo MEDIDO en la app, nunca con una tasa a ojo.**
- Lo que deja el verificador: Σ verificado ÷ Σ estimado de los expedientes con ≥ 5 verificados.
- La tasa de rechazo de expedientes.
- La conversión de una propuesta **según su edad** (0–30, 30–90, 90–180, > 180 días): de las que tenían esa
  edad y se han podido observar 60 días más, cuántas acabaron en expediente. Con una tasa plana del 61 % la
  captación vieja inflaba la previsión; medido el 14/11/2026: 68 % · 33 % · 13 % · 0 %.
- Tramos: CAE emitido (ya), en el MITECO (semanas), en el verificador (1–3 meses), para lote (lotes en
  preparación + expedientes LISTO sin lote), cierre, obra y captación. Los expedientes viejos EMITIDOS sin lote
  no entran (eran migrados ya cobrados por fuera).
- *Cierre del año* (solo el año en curso). **Seguro** = facturado + CAE emitido + presupuestos aceptados y
  CEE terminados por facturar. **Esperado** = + los lotes del MITECO y del verificador que, al ritmo medido,
  se facturan antes del 31/12. **Máximo** = + todo lo enviado (si todo se adelanta). Es la cifra grande de la
  tarjeta y del KPI. (2026-11-14, Fran: «¿se ha contado lo que tenemos a punto? Todo lo enviado al
  verificador que a priori saldrá adelante»: antes el cierre solo sumaba el MITECO.)
  - El ritmo: la **mediana de días del envío al verificador a la factura al S.O.** de los lotes ya facturados
    (`lotes.fecha_envio_verificador` → `facturas_so.fecha`; con menos de 3 medidos, 60 días). Cada lote se
    factura en su envío + la mediana, nunca antes de una semana desde hoy; entra si esa fecha cae en el año.
    Pesa lo mismo que en su tramo (× lo que deja el verificador si no está verificado entero).
  - La tarjeta lo dice lote a lote (plegado): etapa, envío, fecha prevista de factura, importe y margen, y si
    entra o pasa al año siguiente. El check exige seguro ≤ esperado ≤ máximo, esperado − seguro = los que
    entran y máximo − seguro = MITECO + verificador.

**REGLA — caja.** *Te deben* = lo pendiente de cobro de `contabilidadService` (ya incluye las autofacturas de
Drive sin `brk_cobro_fecha`: no se suman otra vez). *Circulante neto* = te deben − bonos por pagar de lotes
facturados o cobrados − IVA del 303 del trimestre − retenciones del 111. No es el saldo del banco: la app no
lo lee.

**REGLA — lo de siempre.** Rutas `adminOClaveInterna` y pestaña solo ADMIN (importes y margen). Con la BD
caída, 503 y el aviso de `ErrorApi`, nunca un cuadro a cero (regla 38). Caché en el servidor: 5 min el
negocio, 10 las finanzas (la promesa misma, para que dos pestañas no lancen dos lecturas de Drive);
«Actualizar» manda `?forzar=1`. Lecturas ligeras: las rutas JSONB que se usan, nunca el JSONB entero (regla
22). Los enlaces van a otra pestaña (`target="_blank"`) con los deep-links que entiende `App.jsx` (`tab=`
`expedientes&estados=`, `oportunidades&opestado=`, `lotes`, `cee-directos`, `facturacion&sub=&f=`). No hay
pestaña `incidencias`.

### En pantalla

El kit crema de la carta de pago (regla 164) con los componentes de Facturación (`Importe`, `ErrorApi`,
`GraficoMensual`, `fx-kpi`, `fx-tile`…) y las clases `cm-` propias. Barra de secciones pegajosa que marca la
que se lee (IntersectionObserver) y en el móvil se desliza sola. Primero llega el negocio (~2 s) y se pinta;
las finanzas (~12 s en frío: leen los gastos de Drive) llegan con su esqueleto. El año solo cambia la cuenta
de resultados: el negocio en marcha es siempre el de hoy. «Copiar resumen» deja en el portapapeles las cifras
de cabecera, las etapas de los lotes y la lista de atención. Probado a 1440, 390 y 360 px sin scroll
horizontal. Banco: `fx-demo-5186` (o una copia que apunte al worktree) con `fx-demo.html?vista=cuadro`
(bloquea toda escritura: local = producción).

### Medido el 14/11/2026 (solo lecturas, contra producción)

- Tiempos: negocio 2,3 s (403 KB), finanzas 12 s en frío (18 KB).
- 2026: ingresos **921.958 €** (CAE 899.627 · ING 22.331), coste directo 508.874 €, margen bruto
  **413.085 € (44,8 %)**, estructura 20.250 € (solo la FML: 101 gastos sin leer), **EBITDA 392.835 €**,
  provisional. 11 de 13 ventas CAE casadas con su lote; 244.553 € sin casar (autofacturas de Drive antiguas).
- Caja: te deben 410.816 €, bonos por pagar 220.577 € (32.621 € de lotes ya cobrados), IVA del T4
  117.111 €, circulante **73.110 €**.
- Lotes: 1 en preparación, 7 en el verificador (589.388 €), 4 en el MITECO (193.868 €), 5 facturados por
  cobrar (336.829 €), 2 cobrados con bonos por pagar, 3 cerrados.
- Cartera ponderada 2,92 M€ (margen 1,18 M€); cierre 2026: 924.060 € seguro, hasta 1.117.929 €.
- CEE directos 2026: 52 facturas, 20.273 € sin suplidos; 2 terminados sin factura, 8 sin cobrar.
- El check encontró al primer intento que el desglose de ING por origen sumaba 649 € más que la contabilidad:
  eran las tasas (suplidos). De ahí la regla de usar `desgloseVenta` en todo lo que sea ingreso.

### Medido el 14/11/2026, con el libro de la gestoría y el cierre por lotes

- Ventas CAE del libro: T1 71.569 €, T2 274.388 €, T3 0 € — **cuadran al euro** con las del cuadro. T4
  (216.842 € en octubre y 336.829 € en noviembre) aún no está en el libro.
- Estructura **33.853 €**: T1 10.668 · T2 8.343 · T3 8.687 (libro) · T4 6.155 estimados (octubre y
  noviembre a 3.078 €/mes). FML 20.250 € dentro. Fuera: bonos del libro 213.184 € (por fecha de pago),
  certificadores y tasas del registro 7.348 €, inversiones 3.084 € (portátil, iPhone, bombas del piloto).
  **EBITDA 379.232 € (41,1 %)**, ya no provisional (antes 392.835 €).
- Del envío al verificador a la factura: 55–109 días, **mediana 57** (8 lotes). Cierre 2026: seguro
  924.060 € · **esperado 1.198.547 €** (los 4 lotes del MITECO y LOTE-2026-013 y 014, ya verificados, con
  factura hacia el 3, 16 y 25/12) · máximo 1.707.149 € (los 5 enviados del 5 al 10/11 caen a primeros de
  enero al ritmo medido: 508.601 €).
