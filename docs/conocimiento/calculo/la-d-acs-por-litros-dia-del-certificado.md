<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La D_ACS por LITROS/DÍA del certificado (2026-09-13)

El CEE declara en su apartado *«Instalaciones de Agua Caliente Sanitaria»* una
**Demanda diaria de ACS a 60° (litros/día)**. Cuando la trae, esa cifra es un DATO
del certificado —no una estimación—, así que el técnico la teclea y la D_ACS anual
sale de ella. Tercer modo de `expedientes.cee.acs_method`, junto a `xml` y `cte`:

| Modo | Toggle | De dónde sale |
|---|---|---|
| `xml` | **XML** | demandaACS (kWh/m²·año) × superficie útil del certificado |
| `cte` | **HAB** | Anejo F por dormitorios: 28 l/persona·día · N_P · C_e · 365 · ΔT |
| `litros` | **L/D** | `cee.dacs_litros_dia` · C_e · 365 · ΔT |
| `manual` | **MAN** | kWh/año a pelo (solo terciario, ver TER100) |

**REGLA — con los litros/día NO interviene la ocupación.** La fórmula es la misma
del Anejo F pero SIN el tramo `D_L/D · N_P`: el dato del certificado ya es el
consumo diario del EDIFICIO, y multiplicarlo otra vez por el número de personas lo
multiplicaría por cinco. Por eso la fórmula que imprime el CIFO es
`D_ACS = D_L/D · C_e · 365 · ΔT` y su tabla de leyenda no menciona N_P.

**REGLA — el ΔT de 46 °C sigue valiendo, y por eso se dice a qué temperatura está
referida la demanda.** El certificado la declara **a 60 °C**, que son exactamente
los 60 − 14 del salto térmico del Anejo F: si algún día se leyera de un impreso que
la dé a otra temperatura, el salto habría que rehacerlo.

**REGLA — el CIFO dice de DÓNDE sale.** Su Anexo I nombra el Certificado de
Eficiencia Energética aportado y el apartado del que se copia: es lo único que
separa este número de una estimación, y es lo primero que comprueba quien lo
verifica. Es la misma hoja que el modo CTE (`acsDemandHeavy` la parte igual);
holgura medida: **+71 px** en el peor caso (`check_cifo_paginas.mjs`).

**REGLA — la fórmula vive en `demandaAcs.js` y NADIE más la escribe.** Había TRES
copias que solo entendían `xml` y `cte` —`fichaRes060Html.js`, `fichaRes093Html.js`
y sus dos modales, más la del listado en `ExpedientesView.jsx`—, así que un
expediente en cualquier otro modo imprimía en su **ficha** una D_ACS distinta de la
de su propio **CIFO**: hoy le pasa a todo TER100 en modo manual, que en la ficha
sale con la estimación por dormitorios. Ahora las cinco superficies llaman a
`resolveDacs`. De paso se retiraron dos copias muertas (`AcsCell` en `CeeModule` y
el bloque de D_ACS de `CertificadoCifoModal`, que renderiza `buildCifoHtml`).

**REGLA — el listado también necesita el campo.** `CEE_ECO_FIELDS` pedía
`acs_method` y `num_rooms` pero **no** `dacs_manual` (ni el nuevo
`dacs_litros_dia`): los modos tecleados salían a 0 en la economía del listado y de
los lotes, distinta de la del propio expediente.

**REGLA — un modo TECLEADO sin cifra BLOQUEA el documento.** `litros` y `manual` se
quedan en 0 si nadie escribe nada, y el CIFO saldría con «D_ACS = 0,00» y el ahorro
de ACS a cero sin que nada lo delate. `validateExpediente` lo cuenta como dato que
FALTA (solo si el ACS entra en el documento — regla 12.b).

```bash
node implementation/backend/scripts/test_dacs_litros.mjs
node implementation/backend/scripts/check_cifo_paginas.mjs
```
