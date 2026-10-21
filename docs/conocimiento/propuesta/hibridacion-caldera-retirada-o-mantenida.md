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

## Y manteniendo la caldera, el cliente sabe que el bono puede bajar (2026-10-21)

Manteniendo la caldera, la cobertura de la bomba se puede medir de dos maneras y el
bono cambia mucho: sobre la **carga de diseño** (demanda y horas: es el criterio que
defendemos, con algún expediente ya favorable) o sobre la **potencia de la caldera
instalada** (el que nos pueden exigir en la verificación). En el caso que lo motivó:
2.308 € por demanda, 1.438 € por la caldera de 37,8 kW, 2.422 € retirándola.

**REGLA — las DOS hipótesis se le dicen al cliente ANTES de aceptar, por escrito,
en un mensaje APARTE** (decisión de Fran: «que no nos pueda decir un cliente que no
se lo habíamos dicho»):

- 1️⃣ lo que vamos a defender → lo solicitaremos por X €;
- 2️⃣ si no nos lo dan por válido y piden justificarlo con la potencia de la caldera
  instalada (N kW) → el bono bajaría a Y €;
- y, si hay comparativa, que retirándola esto no aplica y el bono sería Z €.

El porqué de las horas NO se explica: solo las cifras. Va por el mismo camino que el
aviso de biomasa (`buildAvisoFinal`): WhatsApp, la ÚLTIMA burbuja tras el enlace;
email, al final del cuerpo; envío programado, `whatsapps[].avisoFinal`. Al partner,
en tercera persona. Si sale también el de biomasa, van en la misma burbuja. Además,
el recuadro de hibridación del PDF lleva un párrafo con las dos cifras (la versión
sellada lo conserva).

| Qué | Dónde |
|---|---|
| Los dos bonos (`result.hipotesisHibridacion`), con el MISMO SCOP y clima | `handleCalculate` en [CalculatorView.jsx](implementation/frontend/src/features/calculator/views/CalculatorView.jsx) |
| Cifras, mensaje y párrafo del recuadro | `hipotesisHibridacion` · `mensajeHipotesisHibridacion` · `avisoHibridacion` en [hibridacionPropuesta.js](implementation/frontend/src/features/calculator/logic/hibridacionPropuesta.js) |
| «Hipótesis 1 · Hipótesis 2» y P. CALDERA siempre visible | panel de hibridación de [CalculatorForm.jsx](implementation/frontend/src/features/calculator/components/CalculatorForm.jsx) |

⚠️ Se calculan los DOS métodos elija lo que elija «Base del % de cobertura»; el
mensaje dice cuál de las dos lleva la propuesta adjunta (con «Retirando», ninguna).

⚠️ La potencia es la tecleada en P. CALDERA (ahora siempre a la vista: con «Demanda»
no mueve el C_b) o, sin teclear, la de la PLACA (`inputs.placa_caldera.potencia_kw`).
**Sin ninguna de las dos no sale el mensaje** y el panel lo dice en ámbar («falta la
potencia de la caldera»): hay que teclearla antes de enviar. Tampoco sale si el
criterio de la caldera no da menos, ni en reforma.

Tras tocarlo: `node implementation/backend/scripts/test_hipotesis_hibridacion.mjs`.
