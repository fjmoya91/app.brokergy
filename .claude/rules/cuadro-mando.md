---
paths:
  - "implementation/frontend/src/features/dashboard/**"
  - "implementation/backend/services/cuadroDireccion.js"
  - "implementation/backend/services/libroContable.js"
  - "implementation/backend/routes/cuadroMando.js"
  - "implementation/backend/scripts/check_cuadro_mando.js"
---
# Cuadro de mando de dirección — EBITDA, caja, salud, previsión y negocio de toda la empresa (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/cuadro-mando/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

216. **El cuadro de mando es de DIRECCIÓN y en el navegador no se hace ninguna cuenta de dinero: todo sale de [cuadroDireccion.js](implementation/backend/services/cuadroDireccion.js) con las MISMAS funciones que el resto de la app** (2026-11-14, Fran: «tiene que ser como el cerebro de mi empresa… en un simple golpe lo tengo que ver todo»). Pestaña solo ADMIN y rutas `adminOClaveInterna` (`GET /api/cuadro-mando/negocio` y `/finanzas?anio=`, caché 5/10 min, `?forzar=1`); con la BD caída, 503 y el aviso, nunca un cuadro a cero (regla 38). El servicio reutiliza `dashboardAgg`, `loteEco` y `expedienteFinancials` del frontend por ESM y `contabilidadService` (ventas, cobros, gastos, 303/111): nunca una segunda versión de esas cuentas. **La cuenta de resultados es de la SOCIEDAD, sin IVA ni suplidos**: ingresos = las ventas de la contabilidad (la FML es GASTO de la SL, no ingreso; las tasas del registro de un CEE son suplidos y todo ingreso se desglosa con `desgloseVenta`); coste directo del CAE = cada venta casada con SU lote y su margen repreciado al precio de ESA factura (lo que no casa, al coste medio); técnicos de CEE = nº de CEE facturados × el HONORARIO medio conciliado; estructura = **los trimestres CERRADOS, del libro maestro de la gestoría** («04. CONTABILIDAD / CONTABILIDAD {año} - BROKERGY (master).xlsx», que lee SOLO EN LECTURA [libroContable.js](implementation/backend/services/libroContable.js) y que tiene que sumar lo que dice su hoja RESUMEN), y si un trimestre no está en el libro, de Drive leído; siempre sin inversiones, bonos, «no gasto» ni certificadores y tasas del registro de los CEE del CAE; el trimestre EN CURSO, cada mes con lo leído o la media mensual de los cerrados si es más, marcado «estimado». **Con gastos sin leer de un trimestre cerrado que no está en el libro, el EBITDA es PROVISIONAL** y los indicadores que dependen de él salen en gris, nunca en verde. El cierre del año: seguro (facturado + lo que ya se puede facturar), **esperado** (+ los lotes del MITECO y del verificador cuya factura cae antes del 31/12 a la MEDIANA medida de días del envío al verificador a la factura) y máximo (+ todo lo enviado). La etapa de un lote la deciden los hechos del dinero (factura al S.O., su cobro, los bonos transferidos por expediente). La previsión pondera con lo MEDIDO (ratio del verificador, rechazos, conversión de la propuesta SEGÚN SU EDAD), nunca con una tasa plana. Los enlaces abren otra pestaña con los deep-links de `App.jsx` (no existe `tab=incidencias`). Tras tocarlo: `node implementation/backend/scripts/check_cuadro_mando.js` (solo lectura: la cuenta suma, los meses suman el año, cada lote en una etapa, circulante y cartera, sin NaN) y `node implementation/frontend/scripts/check-hooks.mjs`; la pantalla, en el banco `fx-demo.html?vista=cuadro` a 390 px y en escritorio. Ver "El cuadro de mando de DIRECCIÓN".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/cuadro-mando/el-cuadro-de-mando-de-direccion.md` — El cuadro de mando de DIRECCIÓN: toda la empresa de un golpe (2026-11-14) · 15,1 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/cuadro-mando/el-cuadro-de-mando-de-direccion.md`
  - **REGLA — en el navegador no se hace NINGUNA cuenta de dinero.**
  - **REGLA — la cuenta de resultados es de la SOCIEDAD y sin IVA ni suplidos.**
  - **REGLA — la estructura de un trimestre CERRADO sale del libro maestro que se entrega a la gestoría; la del
trimestre en curso se estima y se dice.**
  - **REGLA — un lote está en la etapa que dicen los HECHOS del dinero, no solo su estado**
  - **REGLA — la previsión pondera con lo MEDIDO en la app, nunca con una tasa a ojo.**
  - **REGLA — caja.**
  - **REGLA — lo de siempre.**

<!-- generado:fin -->
