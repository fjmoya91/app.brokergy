<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Precio CAE al cliente — 100 €/MWh, y solo hacia adelante (2026-09-09)

Hay **DOS cifras y no son lo mismo**; confundirlas cambia el bono de expedientes ya
firmados. Las dos viven en
[calculation.js](implementation/frontend/src/features/calculator/logic/calculation.js):

- **`CAE_PRECIO_CLIENTE_NUEVAS` = 100 €/MWh** — lo que se estampa en una propuesta que
  se hace HOY. Va solo donde se COMPONEN inputs nuevos: la calculadora, el funnel y la
  comparativa de CEE.
- **`CAE_PRECIO_CLIENTE_ANTERIOR` = { estandar: 95, res080: 60 }** — el respaldo de
  LECTURA de lo ya guardado sin precio propio. Es el valor con el que se calcularon en
  su día, y por eso **no puede subir a 100**: un expediente antiguo no cambia de bono
  porque hoy cambie la tarifa. Va donde se LEE un expediente (panel económico, su
  gemelo de Node, el editor de Economía).

El precio al SUJETO OBLIGADO sigue siendo propio de cada ficha (160 €/MWh en las de
sustitución/hibridación, 140 en RES080): ahí no hay política única. El **TERCIARIO**
arranca ya en el precio nuevo: TER100 y TER173 no tienen ni un expediente anterior
cuya economía haya que preservar.

### El precio se SELLA en la oportunidad — [precioCae.js](implementation/backend/utils/precioCae.js)

La calculadora guarda el precio en `inputs.caePriceClient`, pero la economía del
EXPEDIENTE lee `inputs.cae_client_rate`: dos nombres para el mismo dato, y por eso el
precio tecleado **nunca llegaba al expediente**. Medido el 09/09/2026: **66
expedientes** tienen un precio tecleado (de 88 a 150 €/MWh) que su panel ignora, y en
48 de ellos eso hace que el panel diga que le debemos al cliente **menos** de lo que
su propuesta firmada le prometía. Sin arreglarlo, un expediente nuevo a 100 €/MWh
también saldría calculado a 95.

**REGLA — el sello se escribe en las oportunidades NUEVAS y, una vez escrito, se
mantiene al día. Las ANTERIORES no se marcan nunca.** Su economía se calculó con el
respaldo, hay obra en marcha sobre esas cifras y no pueden moverse. Por eso la
condición es *"no existía"* o *"ya lo trae"*, jamás *"existe"* — y un reguardado de una
oportunidad anterior **retira** el sello aunque el navegador lo mande.

**REGLA — no hace falta ninguna marca de fecha.** La PRESENCIA de la clave ES la marca,
y además es la que el expediente ya leía. Una fecha de corte habría que explicarla cada
vez que alguien lea el código, y se rompe al migrar datos.

**REGLA — se mantiene al día, no solo al crear.** Sellar únicamente en el alta dejaría
el sello viejo al cambiar el precio, y el expediente calcularía con una tarifa que ya
nadie ve en la calculadora: peor que el fallo que arregla.

⚠️ Los 66 expedientes anteriores **siguen calculando con el respaldo**, no con su
precio tecleado. Es una decisión tomada (2026-09-09), no un descuido: corregirlos
movería el bono de 66 expedientes en marcha, 27 de ellos RES080 que pasarían de 60 a
95-150 €/MWh (con el S.O. en 140, alguno daría margen negativo). Si algún día se
quiere, es sembrarles el sello con su `caePriceClient`.

```bash
node implementation/backend/scripts/test_precio_cae_sello.mjs
```
