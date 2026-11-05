<!-- conocimiento · área: propuesta · las rutas de los enlaces son relativas a la raíz del repo -->

# Condiciones reforzadas: el «Perfil exigente» (2026-11-05)

Petición de Fran (05/11/2026, sobre 26RES060_OP369, Vicente Jesús González Madrigal, Tomelloso): hay
clientes que piden la simulación, dejan que BROKERGY les haga el CEE y se van con otro gestor que
paga más €/MWh. Fran quiere:

- **sin anticipo**: cobrar por adelantado es una barrera de entrada y no se quiere;
- una **penalización que haga no rentable irse** tras la visita, **legal y no abusiva**;
- **sin derecho de igualación**: BROKERGY puede sacar MÁS ahorro del mismo edificio aunque pague
  menos €/MWh, así que el neto del cliente es mayor; entrar a competir en €/MWh es perder;
- que el cliente **no vea los kWh ni el €/MWh antes de comprometerse**: hoy la propuesta solo
  enseña el dinero neto, y el convenio (con los kWh y el precio) le daría ya la táctica para
  llevárselo a otro.

## Lo que se hizo

Un conmutador **«Perfil exigente»** en la calculadora (`inputs.condicionesReforzadas`, solo ADMIN,
tarjeta rosa junto a «Dto. Certificados»). Por defecto apagado: las propuestas de siempre no cambian.

**REGLA — el compromiso se cierra AL ACEPTAR, no en el convenio.** En `/firma` el cliente solo ve el
neto en euros. Ahí marca una casilla APARTE y obligatoria de «compromiso de cesión en exclusiva»
(aceptación expresa de una condición general, LCGC). El convenio, con los kWh y el €/MWh, llega
después, ya comprometido.

**REGLA — la compensación es el 40 % del bono de la opción impresa, con un mínimo de la tarifa.**
`penalizacionReforzada(caeBonus) = max(702,78 €, round(40 % × bono redondeado))`, + IVA. En la
comparativa, una cifra por opción. El 40 % es aproximadamente lo que se le saca a otro gestor sobre
el bono (unos 40 €/MWh sobre 100). Fuente única: `penalizacionReforzada` en
[cifrasPropuesta.js](implementation/frontend/src/features/calculator/logic/cifrasPropuesta.js) y
su réplica CommonJS en [importesPropuesta.js](implementation/backend/utils/importesPropuesta.js).

**REGLA — la cifra se SELLA con la versión de la propuesta.** `importesDe` añade
`importes.reforzadas = { pct, penalizacion, penalizacion_reforma? }`. `GET /api/public/cliente/:id`
las devuelve (con la tarifa) solo si la versión **vigente** las selló. Una propuesta enviada antes de
encender el conmutador no las lleva: hay que **enviar una versión nueva**. Activar el conmutador
no cuenta como «cambio de importes» en el historial.

**REGLA — `/aceptar` rechaza la primera aceptación sin la casilla** (400). La comprobación va
ANTES de actualizar la ficha del cliente. El historial de ACEPTADA guarda
`compromiso_exclusiva: {...cifras, aceptado: true}` e `inicio_anticipado`. Las condiciones tienen su
propia versión, `CONDICIONES_REFORZADAS_VERSION = '2026-11-05-R'`. Las de siempre (`2026-09-23`) no
cambian.

## Qué dice cada sitio

**La propuesta, hoja 4.** La cláusula 03 «Cesión en exclusiva y compensación» (tarjeta ámbar)
sustituye a las 03 «Vinculación» y 04 «Penalización»; Vigencia y Datos pasan a 04 y 05.

- Cesión en exclusiva y firma del convenio, a cambio del bono de la propuesta, ajustado al ahorro
  verificado.
- Hecha la visita del CEE, y salvo causa imputable a BROKERGY, el cliente abona en 15 días, como
  liquidación anticipada de los daños (art. 1152 CC):
  - **a)** si tramita el ahorro con otra empresa o no firma el convenio: el 40 % del bono (mínimo
    la tarifa);
  - **b)** si no sigue adelante o no aporta la documentación en 30 días desde que se le pida por
    escrito: la tarifa (702,78 € + IVA).
- Desistimiento en 14 días.

**REGLA — la hoja 4 es de ALTO FIJO y estas cláusulas se midieron.** Con dos tarjetas separadas, la
firma se metía 69 px bajo el pie. Juntas quedan 55 px de margen en la propuesta simple y 33 px en
la comparativa; la normal deja 27 px. Si se alarga un texto, hay que volver a medir: `.prop-firma`
tiene que acabar por encima de `.prop-cta` en `.prop-page` n.º 4.

**`/firma`** ([condicionesAceptacion.js](implementation/frontend/src/features/public/logic/condicionesAceptacion.js)
→ `condicionesReforzadas`) tiene seis apartados:

1. Aceptación;
2. Compromiso de cesión en exclusiva, con a) y b) desarrollados;
3. CEE;
4. Tramitación;
5. **Derecho de desistimiento**, con el modelo de formulario (arts. 102–108 TRLGDCU);
6. Protección de datos.

Dos casillas:

- el compromiso, obligatorio, que bloquea el botón;
- el **inicio anticipado**, opcional (art. 108.3 TRLGDCU): si desiste después, paga solo lo hecho.

Demo: `/firma/demo?reforzadas`.

## Por qué así (lo legal)

- Consumidor, contrato a distancia: **desistimiento de 14 días obligatorio**. Si no se informa, el
  plazo se alarga a 12 meses (art. 105 TRLGDCU).
- Una cláusula penal es válida (arts. 1152–1154 CC). Frente a un consumidor no puede ser una
  «indemnización desproporcionadamente alta» (art. 85.6 TRLGDCU). Por eso es un % del bono, que es
  aproximadamente el lucro que se pierde, y no una cifra fija alta. Además solo nace **tras la
  visita**, cuando el CEE ya está hecho.
- La casilla aparte es la aceptación expresa de la condición; el cliente no puede decir que no la
  vio.
- **El bono se ajusta en proporción** al ahorro verificado, sin dar los kWh. Es lo que el convenio
  concretará.

⚠️ **Pendiente de revisión por un asesor**: el ajuste proporcional sin kWh, la redacción de a) y b),
y si el 40 % aguanta un control de abusividad. Hasta entonces, el conmutador se usa solo con
perfiles concretos.

⚠️ **Las propuestas NORMALES tampoco informan del desistimiento** (cláusula 04 de siempre, condiciones
`2026-09-23`). Queda como mejora aparte.

Tras tocarlo:

```bash
node implementation/backend/scripts/test_cifras_propuesta.mjs
```

```bash
node implementation/backend/scripts/test_importes_propuesta.js
```
