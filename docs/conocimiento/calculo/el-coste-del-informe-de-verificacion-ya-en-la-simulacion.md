<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El COSTE DEL INFORME DE VERIFICACIÓN, ya en la simulación (2026-09-11)

Campo nuevo en **Datos Económicos → Configuración y margen Brokergy** (ADMIN, como todo
ese bloque): el importe en € del informe de verificación de ese expediente. De él salen
tres cifras que antes solo existían cuando el lote ya estaba montado y la factura del
verificador subida — es decir, meses después de haber pactado el precio.

| Qué | Cómo |
|---|---|
| Verificación repercutida | `coste ÷ MWh de la actuación` |
| Le cuesta al S.O. | `precio CAE S.O. + repercutida` (€/MWh) |
| Máximo que se le puede pedir | `EQUIVALENCIA_FINANCIERA − repercutida` |

**REGLA — el coste de la verificación NO es nuestro y NO toca el margen.** Lo paga el
SUJETO OBLIGADO (decisión 2026-08-04, la misma que aplica `lotes/logic/loteEco.js`): el
beneficio de Brokergy sigue siendo `precio S.O. − precio cliente`, ni un euro menos. Si
se restara aquí, el mismo expediente daría un beneficio en la oportunidad y otro distinto
en su lote.

**REGLA — la EQUIVALENCIA FINANCIERA es una sola.** 198,62 €/MWh (2026) vive ahora en
[calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js) y
`loteEco.js` la **reexporta**: la necesitan los dos extremos del negocio —la simulación,
para saber hasta dónde se puede pedir; el lote, para saber cuánto se le ahorró de verdad—
y dos copias divergirían el año que el Ministerio la cambie. **Revisar en 2027.**

**Por qué importa el €/MWh y no el importe**: el mismo informe de 1.500 € pesa 13,64
€/MWh sobre una actuación de 110 MWh y **150 €/MWh** sobre una de 10 — ahí el expediente
deja de tener sentido para el S.O., que pagaría más que al FNEE. Por eso, cuando el
desembolso del S.O. supera la equivalencia, la cifra sale en **rojo** y se dice con todas
las letras que a ese precio no lo compraría.

**REGLA — esto es para CASOS PUNTUALES: por defecto no se ve ni cambia nada.** El campo
nace **plegado** detrás de un "+ Coste de verificación" y las tres líneas solo aparecen
con un importe tecleado, así que la pantalla de siempre —y el recuadro de beneficio— se
ven exactamente igual que antes. Si la oportunidad ya trae un importe guardado, se abre
sola: un dato guardado no puede quedar escondido detrás de un clic que nadie sabe que hay
que dar. "Quitar" borra el importe además de plegarlo, o quedaría un valor contando sin
estar a la vista.

⚠️ **`calculateFinancials` tiene 15 consumidores** (expedientes, lotes, cuadro de mando,
landing, comparativas y el gemelo de Node) y **ninguno pasa `costeVerificacion`**: todos
reciben 0 y su resultado es idéntico al de antes. El test lo comprueba campo a campo
—los 28 que la función ya devolvía— sobre 13 escenarios × 2 importes, y que omitir el
parámetro devuelva el MISMO objeto que pasar 0.

El valor viaja en `inputs.costeVerificacion` y se guarda con la oportunidad. **No pisa
`lotes.coste_verificacion`**, que es el REAL y sale de la factura (regla 28): éste es una
estimación para negociar.

```bash
node implementation/backend/scripts/test_coste_verificacion.mjs
```
