<!-- conocimiento · área: oportunidades · las rutas de los enlaces son relativas a la raíz del repo -->

## Bono por debajo de 3.000 € al dar de alta: se hace el CEE con CE3X y su XML va a la oportunidad (2026-10-23)

**Decisión de Fran (23/10/2026)**, al revisar las dos calderas de biomasa que mandó Federico Romero
(Villanueva de los Infantes): «si cuando la damos de alta el bono CAE del cliente es por debajo de
3.000 €, tendremos que realizar el certificado de eficiencia energética con CE3X y guardar el XML
simulado en la oportunidad, para saber realmente si se puede conseguir algo más con la situación
real».

**El porqué.** La simulación del alta es ESTIMADA: demanda por zona, tipo de vivienda, orientación y
patios de la calculadora. Cuando sale baja, la propuesta llega al cliente con una cifra que muchas
veces no lo convence, y la de verdad puede ser bastante mayor: en 26RES060_OP321 (un ático simulado
como piso intermedio) el bono pasó de 1.058 € a 4.491 € al cargar el CEE. Por debajo de 3.000 € ese
riesgo de perder la obra por una cifra prudente compensa hacer el CEE antes de enviar nada.

**REGLA — si el bono CAE del alta sale por debajo de 3.000 €, se hace el CEE INICIAL con CE3X
(skill `generar-cee-inicial`) y su XML se CARGA en la SIMULACIÓN de la oportunidad antes de avisar a
Fran o enviar la propuesta.**

- **La cifra que cuenta** es el «bono CAE» que imprime `alta_oportunidad.js crear` (al precio de la
  simulación). Se mira ya en el seco, y si baja de 3.000 € el informe lo dice desde ese momento.
- **Cómo**: `crear --escribir` (hace falta la carpeta de Drive) → `generar-cee-inicial` sobre la
  oportunidad → `cee_inicial.js aplicar --escribir`, que lo califica con CE3X 3.2 en el PC y carga
  el XML en la simulación solo (regla 152, [cargarCeeOportunidad.js](implementation/backend/services/cee/cargarCeeOportunidad.js)).
  Va como CEE NUESTRO: sin la comparativa «con tu CEE / CEE nuevo BROKERGY».
- **RES080**: el inicial y el PREVISTO, y los dos XML con `cargarRes080EnOportunidad`.
- **El informe da las dos cifras**: bono estimado del alta → bono con el CEE (ahorro y ayuda total).
- **Si el cliente ya aportó un CEE** (`cee` en el plan), no se hace otro: su cifra «con tu CEE» ya
  es la medida. Se dice, y si esa también baja de 3.000 €, se pregunta.
- **Si faltan fotos para el CEE** (fachadas, huecos), primero Street View (`streetview`); lo que no
  se pueda resolver se dice en el aviso a Fran con el borrador del WhatsApp que lo pide
  (`pedir-fotos`, en seco), y la propuesta espera.
- **En el servidor (el asistente del WhatsApp) no hay CE3X**: `aplicar` deja el `.cex` «por
  calificar» y el XML se carga cuando el PC lo califica (`asistente_pc.js ce3x <nº> --trabajo
  calificar`). Hasta entonces se dice que la cifra está pendiente.

Caso que lo pidió: CL MATIAS PACHECO 3 (Villanueva de los Infantes), caldera de pellets Kostrzewa,
180 m², radiadores, presupuesto 8.500 € + IVA → bono estimado **2.578 €** (en seco, 23/10/2026). La
otra del mismo día, CL CUESTA DEL JARDIN 9 (Ponast KP 20, 241 m²), salía en **3.184 €**: no aplica.
