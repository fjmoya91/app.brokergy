<!-- conocimiento · área: cuadro-mando · las rutas de los enlaces son relativas a la raíz del repo -->

## Los impuestos en el cuadro de mando: IVA, retenciones, Sociedades y lo que hay que apartar (2026-11-18)

**Por qué.** Fran (18/11/2026): «¿el cuadro de mando ya incluye lo que me sale de IVA a pagar por trimestre,
impuestos, etc.? ¿Desde un visor saber todo?». Hasta entonces el cuadro solo restaba en la caja el 303 y el
111 del trimestre en curso, sin el Impuesto de Sociedades, sin los pagos a cuenta y sin saber qué se había
pagado ya. Se añade la sección **Impuestos**, entre Caja y Previsión.

| Qué | Dónde |
|---|---|
| Las cuentas | [services/impuestosEmpresa.js](implementation/backend/services/impuestosEmpresa.js) (puras, salvo leer y guardar los datos fiscales), llamadas desde `finanzas()` de [cuadroDireccion.js](implementation/backend/services/cuadroDireccion.js): sale en `f.impuestos` |
| Las cifras del libro | [services/libroContable.js](implementation/backend/services/libroContable.js): las filas «IVA A INGRESAR (303) SOCIEDAD», «… AUTONOMO» y «RETENCIONES IRPF PRACTICADAS» de la hoja RESUMEN del libro maestro (`fiscal`) |
| Los datos que la app no sabe | `app_settings` → clave `cuadro_impuestos`. `GET /api/cuadro-mando/impuestos/datos` (ADMIN o clave interna) · `PUT` (solo ADMIN; borra la caché de las finanzas) |
| La pantalla | [components/CuadroImpuestos.jsx](implementation/frontend/src/features/dashboard/components/CuadroImpuestos.jsx) y el diálogo «Datos fiscales» en el mismo fichero |
| Que cuadre | `node implementation/backend/scripts/check_cuadro_mando.js [año]` (imprime los impuestos y los comprueba) |

### Qué enseña

1. **Próximos pagos a Hacienda** de la sociedad: la cifra a **apartar** y la lista por fecha (303 y 111 de los
   trimestres sin pagar, los 202 que quedan y la cuota del Impuesto de Sociedades de julio), cada uno con su
   fuente y los días que faltan. Lo del autónomo (FML), aparte.
2. **Impuesto de Sociedades del año**: base prevista al 31/12, tipo, cuota, los tres pagos a cuenta (202), lo
   que queda a ingresar en julio del año siguiente y el resultado después de impuestos. Debajo, lo que saldría
   con la base de hoy.
3. **IVA y retenciones trimestre a trimestre**: el 303 de la sociedad (lo que se paga, con lo compensado), el
   111 y el 303 del autónomo, con su estado (Pagado · Cerrado · Vence el … · En curso · Por venir) y sus plazos.
4. En **Caja**, el 303 y el 111 que se restan son los de **todos** los trimestres sin pagar, y la casilla
   «Próximo pago a Hacienda» es el primero de la lista de arriba.

### Las REGLAS

**REGLA — cada cifra lleva su fuente, y manda la más fiable: CONFIRMADO › LIBRO › APP.**
- *Confirmado*: lo presentado o liquidado de verdad (cargo del banco, carta de pago, liquidación de la AEAT),
  anotado en los datos fiscales. Manda siempre.
- *Libro*: un trimestre CERRADO que ya está en el libro maestro de la gestoría, de su hoja RESUMEN. Es la
  misma fuente que la estructura del EBITDA (ver «El cuadro de mando de DIRECCIÓN»).
- *App*: el trimestre EN CURSO, de `contabilidadService.cuadro().trimestre`: lo mismo que Facturación →
  Trimestres, con «gastos sin leer» si los hay.
- Un trimestre cerrado que no está en el libro ni confirmado sale «—»: no se inventa.

**REGLA — un 303 negativo de la sociedad se COMPENSA en los siguientes; no se devuelve.** Lo que se paga en
un trimestre es su resultado menos lo que quedaba por compensar. Si el trimestre está CONFIRMADO, lo ingresado
ya lleva la compensación y el arrastre vuelve a cero.

**REGLA — un trimestre cerrado cuyo plazo ha pasado se da por pagado.** Lo pendiente (lo que se aparta y lo
que resta la caja) son los trimestres EN CURSO y los cerrados que aún están en plazo (`POR_PRESENTAR`). Plazos
los de `contabilidadService.plazos` (303 de T1–T3 el día 20 del mes siguiente; el del T4, el 30 de enero; el
111 del T4, el 20 de enero).

**REGLA — el Impuesto de Sociedades se estima sobre el resultado de GESTIÓN y se dice.**
- *Base*: el EBITDA del cuadro. Para el año en curso, la base prevista = EBITDA de hoy + el margen de lo que
  se factura antes del 31/12 (lotes por facturar, los lotes que «entran» en el cierre, presupuestos aceptados
  y CEE directos por facturar menos su técnico) − la estructura de los meses que faltan. Sin amortizaciones,
  resultado financiero ni ajustes fiscales: la base de verdad la cierra la gestoría.
- *Tipo*: el régimen anotado manda (empresa emergente o nueva creación, al 15 %). Si no hay, por la cifra de
  negocios del año ANTERIOR: microempresa (< 1 M€) o reducida dimensión (< 10 M€) con los tipos de la DT 44.ª
  LIS para cada año, o el general (25 %). Sin la cifra, reducida dimensión (el prudente), marcado «se supone».
- *Pagos a cuenta (202)*, modalidad de cuota (art. 40.2 LIS): el 18 % de la cuota del último Impuesto cuyo
  plazo había acabado — en abril el de hace dos años, en octubre y diciembre el del año anterior. Lo confirmado
  manda. Un año marcado «sin 202» (empresa emergente, Ley 28/2022 art. 8) no tiene pagos a cuenta.
- *A ingresar* = cuota − los 202, hasta el 25 de julio del año siguiente; «aplazable» si el régimen lo dice
  (empresa emergente: 12 meses el primer año con base positiva, 6 el segundo).

**REGLA — lo que la app no puede saber va en la BD, nunca en el código.** El régimen (desde/hasta, tipo,
años sin 202, años aplazables), el Impuesto de los años anteriores (base, cuota de la casilla 599, ingresado,
cifra de negocios) y los importes ya pagados se guardan en `app_settings.cuadro_impuestos` y se editan en el
diálogo «Datos fiscales» (solo ADMIN). **El repositorio es público**: ni los importes ni el régimen de la
empresa se escriben en el código, en los documentos ni en una skill. Los tipos de la ley sí, porque son
públicos. Leer esa fila con la BD caída sube como 503: un fallo no puede contestar «no hay datos», porque el
Impuesto saldría al tipo general y se leería como un dato.

**REGLA — «apartar para Hacienda» es la suma de la lista de próximos pagos de la sociedad.** El check lo
exige (y que la lista vaya por fecha, que los 202 sumen su total, que a ingresar = cuota − 202 y que el neto
= base − cuota). Lo del autónomo no entra: lo paga Fran, no la SL.

### Lo que la app no sabe y se avisa

- **Si un 202 calculado se pagó**: con el plazo pasado y sin confirmar, sale «no consta pagado» y un aviso gris
  en «Requiere tu atención» para confirmarlo con la gestoría y anotarlo.
- **Las retenciones de las nóminas** no están en la app: el 111 es solo el de las facturas recibidas. Se dice
  en la nota de la sección.
- **El T4 de un año pasado** que aún no está en el libro sale «—».
- Sin ningún dato fiscal anotado, un aviso gris lo pide (y el Impuesto sale al tipo de reducida dimensión, sin
  pagos a cuenta). El plazo del próximo pago a ≤ 20 días es un aviso ámbar, con enlace a Trimestres si es un
  303 o un 111.

### Medido el 18/11/2026 (contra producción, solo lecturas salvo la siembra)

- Los datos fiscales se sembraron una vez con un script en seco y luego `--escribir` (régimen, el Impuesto
  de 2025 del modelo 200 y los pagos confirmados del T2 y del 202 de abril), por Claude.
- T1 y T3 salen del libro, T2 confirmado y T4 de la app; el T3 salió negativo y se compensa en el T4. El
  check pasa («✓ El cuadro de mando cuadra») y la pantalla, en el banco a 1440 y 390 px, sin scroll horizontal.
