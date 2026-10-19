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

### Desde el 19/10/2026: el criterio de los VERIFICADORES

Los verificadores piden que la D_ACS se calcule **siempre con los litros/día que
declara el certificado** (`<DemandaDiariaACS>` en el `.xml`; en el PDF, el apartado
de instalaciones de ACS). Medido en la BD ese día: con los MISMOS litros/día, el CEE
inicial (CE3X 2.3) y el final (3.x) dan demandas por m² distintas —26RES060_113: 112
l/día en los dos y 13,23 frente a 22,90 kWh/m²·año; 26RES060_146: 224 l/día y 9,97
frente a 5,89—, así que la demanda por m² no es un dato estable del edificio y los
litros sí. Sustituye, para el caso de las demandas distintas, al «manda el CEE
inicial» del 17/09/2026 (regla 12.f), que sigue valiendo en modo XML.

**REGLA — los litros/día del CERTIFICADO mandan sobre lo tecleado.** `litrosDia()` lee
primero `cee_inicial.acsLitrosDia` (o el `.xml` crudo si el lector no lo guardó), luego
el final, y solo sin ninguno lo tecleado en L/D. En la rejilla, con litros en el
certificado la casilla L/D los enseña sin dejar teclear; y el CIFO dice de qué
certificado salen («…Certificado de Eficiencia Energética **inicial** aportado»,
solo con los dos cargados). El OCR del PDF también los trae (`ceeToXmlShape` →
`acsLitrosDia`).

**REGLA — un expediente NUEVO nace en L/D** (`expedienteService`: todo menos el
`manual` del terciario). Hasta que llega el CEE inicial no hay litros que leer, y
`resolveDacs` enseña la D_ACS simulada (`demandAcsFallback`); con un CEE cargado que
no los declara, la cifra se queda en 0 y la puerta del documento lo para.

**REGLA — al CARGAR un certificado, si las dos demandas difieren, el método pasa solo a
L/D** (`ajusteAcsLitros`, en `CeeModule` al subir el `.xml` o leer el PDF): en `xml` o
`cte` con las demandas distintas → `litros` con los del certificado; en `litros` sin
cifra → se copia; `manual` nunca. **Si las dos demandas coinciden no se toca**: ahí da
igual una cifra que la otra, y un expediente en marcha no tiene por qué cambiar.
El aviso previo a generar (`ACS_DIFIERE`) ya no dice «se usa la del inicial»: pide L/D.

**REGLA — los EN MARCHA se ponen al día con un script, en seco primero.**
`node implementation/backend/scripts/dacs_litros_pendientes.mjs [--escribir] [--solo N,N]`:
(1) rellena `acsLitrosDia` desde el `.xml` crudo en todos (40 casos, no mueve ninguna
cifra en XML/CTE), (2) pasa a L/D los PENDIENTES —antes de «ENVIADO A VERIFICADOR»—
con el ACS en alcance y las demandas distintas, avisando de los que tienen el CIFO
firmado (hay que regenerar CIFO, Anexo I y Convenio y volver a firmarlos: el ahorro
cambia), y (3) solo LISTA los que ya están con el verificador o cerrados. Medido en
seco el 19/10/2026: **12 pendientes** (8 con el CIFO firmado), 3 en MITECO sin tocar
y 11 sin litros que leer (sin `.xml` en la BD). La D_ACS casi siempre BAJA: 26RES093_6
pasa de 4.540 a 2.731 kWh/año.

```bash
node implementation/backend/scripts/test_dacs_litros.mjs
node implementation/backend/scripts/test_dacs_fase_inicial.mjs
node implementation/backend/scripts/check_cifo_paginas.mjs
```
