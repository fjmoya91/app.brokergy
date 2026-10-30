<!-- conocimiento · área: propuesta · las rutas de los enlaces son relativas a la raíz del repo -->

# La colaboración se ve en la portada, y el coste de los servicios es UNO (2026-10-22)

Petición de Fran (22/10/2026, sobre 26RES060_OP279 con RCA INSTALACIONES): cuando se hace el
descuento de los certificados o se colabora con un instalador, que **se vea en la primera página**
que es una colaboración, que **se explique en las condiciones** y que **los números de arriba y los
de abajo cuadren**. Sin añadir páginas.

## Lo que no cuadraba

| Sitio | Decía (sin «Descuento Certificados») |
|---|---|
| Tabla de la portada | «Gestión tramitación Expediente CAE» **+ 250 €** |
| Cláusula 2 | CEE 220 + tasas 32,78 + gestión 0 = **252,78 € + IVA** (305,86 €) |
| Convenio de Cesión / confirmación de cobro | se descuentan **250 € sin IVA** |

Con el descuento activo la portada no lo decía en ningún sitio: solo la página 4, en verde pequeño.

Y los totales no eran la suma de lo impreso: OP279 ponía «CAE 5.161 € + IRPF 5.772 €» bajo una ayuda
total de **10.932 €** (los decimales se redondeaban por separado). Con impuestos por el cobro del CAE,
la tarjeta sumaba el CAE BRUTO bajo un total que usa el NETO (5.161 + 5.772 bajo 9.952 €).

**REGLA — lo que se le descuenta del bono es `caeMaintenanceCost`, en todas partes.** La portada, la
cláusula 2 y el convenio dicen la MISMA cifra (250 € por defecto, 0 € con «Descuento Certificados»).
La tarifa (220 + 32,78 + 450 = **702,78 € + IVA**) es lo que costaría sin promoción: se enseña tachada
y es la penalización de la cláusula 4, que ya no repite sus tres líneas (las desglosa la cláusula 2).

**REGLA — cada total es la suma de las cifras IMPRESAS.** Se redondea cada componente una vez y la
ayuda total, el % cubierto y la inversión neta se recomponen a partir de ellos. Vale para el PDF,
para los mensajes de envío y para los importes que se SELLAN en cada versión
(`utils/importesPropuesta.js`, que repite la cuenta porque es CommonJS). No toca la economía del
expediente ni lo guardado: solo lo que se enseña.

**REGLA — con «Descuento Certificados» y un colaborador, la bonificación es SUYA.** En la tarjeta del
colaborador de la portada sale «🎁 Ventaja por esta colaboración · Certificados energéticos, tasas y
gestión del CAE · ~~702,78 €~~ 0 €» —dentro de la tarjeta, que no crece (la marcan los logos de 92 px)—
y la cláusula 2 dice «gracias a la colaboración con {empresa}, BROKERGY asume íntegramente su coste».
Sin colaborador, la misma franja va debajo como «Promoción BROKERGY».

Sin descuento la portada no lleva franja y la fila de la tabla dice «**Honorarios BROKERGY** (nada
por adelantado · se descuentan del bono una vez cobrada la ayuda)», y el total de la cláusula 2 se
llama igual: «Honorarios BROKERGY a descontar del Bono Energético CAE», con la «Promoción
BROKERGY» restando 452,78 € hasta los 250 €.

**REGLA — en la tabla de la portada NO se nombra la tarifa de 702,78 €** (Fran, 29/10/2026: «da
lugar a malentendidos»). Hasta ese día la fila decía «(se descuenta del bono · tarifa 702,78 €)», en
letra pequeña y en lenguaje de contrato, y se leía como un coste de 700 €. La tarifa sigue donde
tiene que estar: el desglose de la cláusula 2, la penalización de la cláusula 4 y el precio tachado
de la promoción. **Y la fila NO sale de la tabla** para ir a un punto aparte: la inversión neta
final ya los incluye, y sin la fila la tabla dejaría de sumar (regla de arriba).

Fuente única: [logic/cifrasPropuesta.js](implementation/frontend/src/features/calculator/logic/cifrasPropuesta.js)
(`cifrasPropuesta`, `costesServicio`, `TARIFA_SERVICIOS`).

## Medido (22/10/2026, en local, con un banco de pruebas sin BD)

Con los importes de OP279, las cuatro variantes (descuento con y sin colaborador, sin descuento,
comparativa con reforma) caben: portada con 24 px sobre el pie negro (el margen objetivo del ajuste;
sin zoom) y la hoja 4 con 61–69 px. Las filas nuevas de la cláusula 2 la desbordaban 29 px hasta
quitar la repetición de la cláusula 4.

Tras tocarlo: `node implementation/backend/scripts/test_cifras_propuesta.mjs` y
`test_importes_propuesta.js`.
