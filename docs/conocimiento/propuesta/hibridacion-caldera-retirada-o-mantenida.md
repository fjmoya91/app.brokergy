<!-- conocimiento · área: propuesta · las rutas de los enlaces son relativas a la raíz del repo -->

## Hibridación: la propuesta enseña el bono RETIRANDO y MANTENIENDO la caldera (2026-10-01)

Con «Hibridación» marcada la simulación calcula el bono con la caldera en apoyo
(RES093: el ahorro se pondera por el C_b). Pero casi siempre el cliente puede
elegir quitarla, y entonces el bono es el de una sustitución (C_b = 1) y sube
mucho (en el caso que lo motivó, 2.040 € con caldera frente a ~3.300 € sin ella).
La propuesta no lo decía.

| Qué | Dónde |
|---|---|
| Las dos cifras, el texto de la tabla, el recuadro y el mensaje | [hibridacionPropuesta.js](implementation/frontend/src/features/calculator/logic/hibridacionPropuesta.js) |
| El cálculo sin caldera (`result.financialsSinCaldera`) | `handleCalculate` en [CalculatorView.jsx](implementation/frontend/src/features/calculator/views/CalculatorView.jsx) |
| El selector «Precio en la propuesta» | panel de hibridación de [CalculatorForm.jsx](implementation/frontend/src/features/calculator/components/CalculatorForm.jsx) |
| Tabla, recuadro y mensaje de envío | [ProposalModal.jsx](implementation/frontend/src/features/calculator/components/ProposalModal.jsx) |

**REGLA — quien prepara la propuesta elige qué cifra es el PRECIO** (`inputs.hibridacionPropuesta`):

- **Manteniendo la caldera** (por defecto, lo de siempre): la propuesta va con el
  bono de la hibridación y, debajo del Bono CAE y **en verde**, «Si retira la
  caldera: X € — Y € más».
- **Retirando la caldera**: TODA la propuesta (indicadores, tabla, cláusula del
  neto, mensaje y la versión que se sella) va con el bono sin caldera, y debajo,
  **en rojo**, «Si mantiene la caldera en apoyo (hibridación): X € — Y € menos».

En los dos casos sale un recuadro debajo de la tabla y un párrafo en el mensaje
de WhatsApp/email con las dos cifras.

**REGLA — retirar la caldera es DESMONTARLA Y SACARLA DE LA VIVIENDA.** Dejarla en
casa, aunque esté desconectada, no vale: sigue siendo una hibridación. Se
justifica con **dos fotos del mismo hueco**: con la caldera instalada y una vez
quitada. El texto lo dice siempre que hay comparativa.

⚠️ Solo cambia la PRESENTACIÓN. La ficha (RES093), el C_b y `result.financials`
que se guardan siguen siendo los de la hibridación: si el cliente decide retirarla,
el expediente se pasa a sustitución como hasta ahora.

⚠️ Solo en la propuesta de AEROTERMIA: en una reforma (RES080) el ahorro sale de
los certificados y esta comparativa no aplica. Si las dos cifras salen iguales no
se enseña nada.

⚠️ `normalizeData` pasa los enums a MAYÚSCULAS: `modoHibridacionPropuesta` compara
sin distinguir mayúsculas.
