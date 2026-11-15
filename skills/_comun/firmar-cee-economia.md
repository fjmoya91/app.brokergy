# ⛔ Antes de FIRMAR un CEE inicial: que la ECONOMÍA cuadre con la oportunidad

**Regla de Fran (04/11/2026), para SIEMPRE.** Un CEE inicial que hace BROKERGY no se firma
(`firmar_cee.js`) solo porque CE3X lo califique sin errores. Antes se comprueba que, con el ahorro de
ESE CEE, el negocio sigue siendo el que se le ofreció al cliente. Vale también aunque el usuario diga
«firma» o «doy por válido»: primero la comprobación, después la firma.

## Se firma solo si se cumplen las DOS

1. **El cliente recibe en EUROS al menos el bono que se le dijo en la oportunidad.** Lo que cuenta es el
   bono, no el €/MWh: si se le ofrecieron 100 €/MWh y con el ahorro del CEE el mismo bono sale a
   90 €/MWh, el CEE sigue adelante.
2. **El beneficio de BROKERGY, con el Sujeto Obligado a 160 €/MWh, es de 2.000 € o más.**

**Si el ahorro con el CEE sale MÁS BAJO que el de la oportunidad, o el beneficio baja de 2.000 €, NO
se firma**: se dice al usuario con la tabla y se revisa qué pasa (superficie y plantas que cuentan,
demanda, la caldera que se retira y su rendimiento, la aerotermia de la medida, el alcance del ACS…).

## Dónde están las cifras

- **Con el CEE** (después de `listo --escribir` o `cargar --escribir`, que dejan el XML cargado): la
  economía del expediente, `get_expediente` del MCP de BROKERGY → bloque `economia`, con
  `origen_cifra: "CEE"`: `ahorro_kwh`, `bono_cliente`, `beneficio_brokergy`.
- **La oportunidad**: `oportunidades.datos_calculo.result.financials` → `savingsMwh` (ahorro),
  `caeBonus` (bono), `profitBrokergy` (beneficio), `finalPriceClient` (€/MWh al cliente) y
  `costeSoMwh` (€/MWh del S.O.). Se lee solo esa ruta, nunca `datos_calculo` entero.

## Lo que se enseña antes de firmar

| | Oportunidad | Con el CEE inicial |
|---|---|---|
| Ahorro | … MWh | … MWh |
| Bono al cliente | … € | … € |
| Beneficio BROKERGY (S.O. a 160 €/MWh) | … € | … € |

Y una línea con el veredicto: «cumple las dos condiciones, se puede firmar» o «NO se firma: …».

Caso que lo fijó: 26RES060_256 (04/11/2026): 33,41 → 34,52 MWh, bono 3.341,28 → 3.451,71 €,
beneficio 2.004,77 → 2.071,03 €: cumple. Documento:
`docs/conocimiento/cee/antes-de-firmar-el-cee-inicial-cuadra-la-economia.md`.
