<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## AUTOCONSUMO con PVGIS — kWp ⇄ kWh/año y su reparto mensual (2026-10-02)

La barra **⚡ Autoconsumo máximo declarable** del módulo CEE (CAE y CEE directos) lleva
un botón **☀️ kWp con PVGIS** que despliega la producción fotovoltaica DE ESA VIVIENDA:
se teclea la potencia y sale la energía, o se teclea la energía (el máximo, o el 90 % que
declara la medida) y salen los kWp — y en los dos casos los **doce meses**, que son la
tabla «Autoconsumo mensual (kWh/mes)» de «Generación renovable eléctrica» de CE3X. Con
placas YA instaladas arranca por su potencia. El mismo panel va junto a los kWh de la
medida de autoconsumo de la envolvente, con «Usar en la medida».

| Qué | Dónde |
|---|---|
| Regla de tres, reparto mensual, ubicación del expediente (puro, sin imports) | [logic/produccionFv.js](implementation/frontend/src/features/expedientes/logic/produccionFv.js) |
| Consultar PVGIS, normalizar, caché 30 días, UTM/RC → lat/lon | [pvgisService.js](implementation/backend/services/pvgisService.js) |
| Ruta | `GET /api/pvgis/produccion?lat&lon` · `?utm_x&utm_y[&huso]` · `?rc` (+ `inclinacion`, `orientacion`, `perdidas`, `montaje`), **internalOnly** |
| El panel | [ProduccionFotovoltaica.jsx](implementation/frontend/src/features/expedientes/components/ProduccionFotovoltaica.jsx) |
| Pruebas | `node implementation/backend/scripts/test_produccion_fv.mjs [--en-vivo]` |

**REGLA — PVGIS se pregunta con 1 kWp, UNA vez por sitio.** Su producción es lineal en
la potencia pico, así que la ESPECÍFICA (kWh por kWp, anual y por mes) contesta las dos
preguntas: `kWh = kWp × específica` y `kWp = kWh ÷ específica`. La caché es por sitio y
ángulos, nunca por potencia. Medido en Tomelloso (39,16, −3,02): **1.673,88 kWh/kWp·año**
con los ángulos óptimos (36°, −4°), ~4 s la primera vez.

**REGLA — la API es la ESTABLE, PVGIS 5.3 (`re.jrc.ec.europa.eu/api/v5_3/PVcalc`)**: media
mensual de 19 años (SARAH3 2005-2023), sombras del horizonte y ángulos óptimos en una
llamada. La v6 (`photovoltaic-geographic-information-system.ec.europa.eu/api/v6`) está en
prototipo: medido el 02/10/2026, `performance/broadband` solo da el total del periodo y
`power/broadband` la serie HORARIA (590 KB por diez años). Cambiar es `PVGIS_API_URL` +
`normalizar`.

**REGLA — los doce meses SUMAN EXACTO el total** (resto mayor, `repartir`): se teclean en
CE3X y doce redondeos sueltos no suman lo declarado. Siguen la curva de PVGIS; el panel
dice que el autoconsumo de un mes no puede pasar de lo que se consume ese mes, y avisa si
una potencia produce más que el máximo declarable del CEE.

**REGLA — se pregunta al ABRIR el panel, no al pintar la barra**: la barra sale en cada
CEE que se abre. Lo preguntado se recuerda en la sesión y el backend lo guarda 30 días.
Sin tejado conocido van los ángulos ÓPTIMOS; «⚙ Tejado» deja poner inclinación,
orientación (convenio PVGIS: 0 = Sur, −90 = Este, 90 = Oeste), montaje y pérdidas (14 %).

**La ubicación**: la UTM que el Catastro sembró al crear el expediente
(`instalacion.coord_x/coord_y`, huso 30) → lat/lon con `utmALatLon` de `ortofoto.js` (la
misma de la envolvente, por ESM); si no hay, la referencia catastral (`getByRC`, cacheado);
en la envolvente, el centro del `georef`. Una UTM que no cae en España no se manda (422).

**La medida del `.cex` lleva los kWp**: «Usar en la medida» guarda los kWh y la producción
específica en `ajustes.autoconsumo_pvgis` (~300 bytes), y `medidasCe3x({ autoconsumoFv })`
pone `potencia_pico_kwp` (y el reparto mensual) en el equipo `renovable` de la medida, que
`potencias_de_equipos` del motor usa en vez de la estimación de 1.500 kWh/kWp de la 3.1.
Sin PVGIS consultado, la medida sale exactamente como antes. El 90 % declarable
(`AUTOCONSUMO_DECLARABLE`) vive ahora en `autoconsumoMaximo.js` (fichaCe3x lo reexporta):
la barra y la medida no pueden usar dos cifras distintas.

> **Desde el 08/10/2026 (CE3X 3.2)**: los meses ya NO son la curva de PVGIS de los kWh declarados,
> sino, cada mes, **lo menor entre la producción de PVGIS y el consumo eléctrico de ese mes** (sacado
> del XML), y en el PC CE3X los ajusta a su consumo exacto al calificar. En la 3.2 la fotovoltaica
> nunca va como contribución. Ver «CE3X 3.2 — la vigente desde el 08/10/2026, y el AUTOCONSUMO mes a
> mes» (`ce3x-3-2-la-vigente-y-el-autoconsumo-mes-a-mes.md`).

**REGLA — en la 3.1 (y la 3.2) el autoconsumo se ESCRIBE como «Generación renovable eléctrica»**
(2026-10-02): potencia pico y autoconsumo MES A MES, un `models.GeneradorElectrico` con la
forma medida sobre «EJEMPLO MIGRADO.cex» (claves STRING, nombre y zona UNICODE, meses FLOAT, `id`
un `uuid.UUID` derivado de sus datos para que el fichero salga igual cada vez). En la 2.3, la
contribución anual de siempre. Lo decide el motor (`separar_generadores` ·
`instalaciones_de_medida` · `generador_electrico` en
[generar_cex.py](implementation/cee-engine/tools/generar_cex.py)) y es el MISMO camino en las
CUATRO superficies que escriben una medida: el `.cex` de la envolvente (inicial y final),
«Poner la medida» en el `.cex` del técnico (con la versión de ESE fichero) y el CEE final desde
la medida. Sin los doce meses, en la 3.1 se quedaba como contribución —que calcula igual— y se
decía; en la 3.2 NO se escribe (su manual prohíbe la contribución para la fotovoltaica) y se dice.

**REGLA — en una medida el generador va en TRES sitios**: `listadoGeneradoresElectricoMM`, el
slot 13 de `datosInstalaciones` y el de la copia de `mejoras[1][1]`. Medido con CE3X 3.1: sin el
tercero la medida abre pero calcula un ahorro de CERO; con él, el mismo 34,2 % que la misma
energía como contribución. Es UN objeto (las otras apariciones salen como GET).

**REGLA — los meses los pregunta el BACKEND si nadie lo hizo** (`pvgisParaAutoconsumo` en
[ceeEnvolventeCex.js](implementation/backend/services/ceeEnvolventeCex.js)): manda lo guardado
en `ajustes.autoconsumo_pvgis` (con su tejado); si no hay, al GENERAR —nunca en la
previsualización, que se pide muchas veces— se pregunta con los ángulos óptimos del sitio y 12 s
de plazo (`PVGIS_ESPERA_CEX_MS`). Si PVGIS no responde, contribución anual + aviso: un `.cex` no
se queda esperando a un servicio de fuera.

**REGLA — las placas que YA declara el fichero viajan en sus medidas** (`generadores_de_base`).
Un `.cex` del técnico hecho en la 3.1 con las placas como generador perdía las placas en la
medida que le ponía la app, y CE3X la calculaba sobre una vivienda SIN ellas: medido, una medida
que no cambia nada salía con un **−51,9 %**; con el arreglo, 0 %. Vale también para la medida de
aislamiento y para la de retirar el generador en apoyo del CEE final.

Comprobado de punta a punta el 02/10/2026 con 26RES060_186 (CEE final, en seco): el backend
preguntó a PVGIS (1.674 kWh/kWp), el motor escribió 6,19 kWp y 10.359 kWh mes a mes, y CE3X 3.1
abrió el fichero, calculó la medida (93,7 %) y escribió su XML.

```bash
python -m pytest implementation/cee-engine/tests/test_generador_electrico.py
```

⚠️ Las placas que ya tiene la vivienda (`instalacion.fotovoltaica`) la app sigue SIN escribirlas
en el CEE inicial: las declara el certificador.
