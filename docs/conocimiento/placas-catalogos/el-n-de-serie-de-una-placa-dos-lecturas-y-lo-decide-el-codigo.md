<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El Nº DE SERIE de una placa: dos lecturas, y lo decide el código (2026-09-30)

El lector de placas (el de Instalación, el de la calculadora y el de la envolvente)
fallaba justo en el dato que más pesa. Medido sobre **37 placas de ud. exterior y 41
de caldera** de expedientes cuyo nº de serie tecleó una persona:

- **El nº de serie bajo un código de barras o un QR, sin rótulo, salía en blanco**: el
  prompt decía que ese texto NUNCA era el nº de serie, y en muchas marcas lo es (LASIAN
  AERIA HT 12 de 26RES093_11: `8D00260116160057`; Aerosun: `IN2601309004-053` bajo un QR).
- **Cogía el código de ARTÍCULO** de la tabla («CODICE 8119208» de las Sime) en vez de la
  pegatina «SN: 540J0268…».
- **Se comía o duplicaba un cero** en las rachas («075076300000022»).
- En calderas sucias o giradas, un dígito distinto **escrito en silencio** (26RES093_11:
  la placa dice `0905326219` y se guardó `00053210`).

| Qué | Dónde |
|---|---|
| Qué es nº de serie y qué no · juntar dos lecturas · reglas del prompt | [utils/serieDePlaca.js](implementation/backend/utils/serieDePlaca.js) — `elegirSerie`, `combinarSeries`, `reglasSerie` |
| Las dos lecturas en paralelo (tope de salida + reintento ante bucle) | `leerDosVeces` en [placaOcrService.js](implementation/backend/services/placaOcrService.js) |
| Elegir la serie dudosa | `SeriesDudosas` en `LeerPlacasModal.jsx` · `dudosos` / `series_elegidas` en `POST /:id/placas/ocr` |
| Pruebas | `node implementation/backend/scripts/test_serie_placa.js` |

**REGLA — el modelo LEE; qué es el nº de serie lo decide el CÓDIGO.** Se le pide su nº
de serie, la línea literal y —al modelo nuevo— TODOS los códigos largos que vea con su
rótulo y su sitio (junto a barras, a un QR, en la tabla). `elegirSerie` toma: lo que
propone el lector, salvo que sea un código de PRODUCTO (CODE/CODICE/Art./Ref., «Cód.
iden. tipo», «Registro de tipo», «N.R.I. FABRICANTE»), un EAN/UPC con su dígito de
control, el propio MODELO o un ejemplo del prompt; si no, lo rotulado («SN»,
«MFG.NO.», «Nº fabricación», «Matricola»…); si no, **lo impreso sin rótulo junto a unas
barras o un QR**.

**REGLA — cada placa se lee con DOS MODELOS DISTINTOS, y si no coinciden NO se escribe
solo.** Repetir el mismo modelo no sirve (falla igual), pero dos distintos se equivocan
en sitios distintos. `gemini-2.5-flash` (la base: de él siguen saliendo marca, modelo y
potencias) y `gemini-3.6-flash` (`PLACA_OCR_MODELO_SERIE`, el que mejor lee: 32 de 37
frente a 25). Coinciden → «✓ dos lecturas coinciden». Discrepan → `serie_dudosa` +
`serie_alternativas`: el popup enseña las dos con su línea y un enlace a la foto, **sin
preseleccionar** (en calderas la preferida acierta ~6 de 10) y el servidor solo acepta
una de las dos leídas. Resultado medido: ud. exterior de **22/37 a 35/37**; caldera,
12 de 41 marcadas como dudosas en vez de escribirse mal. Coste: **~0,003 € por placa**.

**REGLA — NINGÚN PROMPT LLEVA UN Nº DE SERIE REAL DE EJEMPLO.** Medido: el modelo
**devolvió el ejemplo** como nº de serie de otra máquina (26RES060_151 salió con el de
26RITE_001; con razonamiento activado, en tres placas más). Los ejemplos son marcadores
(`EJEMPLOS_SERIE`, interpolados desde el util) y una lectura que coincida se descarta. El
razonamiento (`pensar`) **empeora** la lectura: más lento e inventa.

**REGLA — la lista de códigos va SOLO al modelo nuevo.** Pedírsela a `gemini-2.5-flash`
sin razonamiento lo mete en **bucle** (10 de 43 calderas, hasta el tope de salida); con su
prompt de siempre no lo hace nunca. Por eso hay dos prompts (`PROMPT` / `PROMPT_BASE`) y
toda lectura va con `maxOutputTokens` (1.536): un bucle acaba en respuesta cortada, se
reintenta una vez con `temperature: 0.4` y, si vuelve a fallar, queda la otra lectura.
(Desde el 07/10/2026 la temperatura solo se manda a los modelos anteriores a la 3.6. `gemini-3.6-flash`
la ignora y ya responde distinto en cada llamada, así que su reintento varía igual. Ver
[el razonamiento y la temperatura según el modelo](docs/conocimiento/infra/razonamiento-y-temperatura-segun-el-modelo.md).)

Un nº de serie dudoso leído en la **calculadora** no se hereda al crear el expediente
(`expedienteService`), y en la **envolvente** no se propone: se elige en «Leer placas».
⚠️ **«Dos lecturas coinciden» NO es «comprobado».** En 26RES080_54 los dos modelos
leyeron `3188697` en una placa escrita a mano: cada casilla de esa tabla trae una raya
vertical PREIMPRESA (se ve en las columnas vacías, siempre a la misma distancia del borde)
y en la columna usada cae justo entre el «3» y el «8». El nº es `388697`, el que tecleó una
persona. Lo leído se sigue revisando con la foto delante.
Al revés, 26RES093_8 tenía GUARDADOS un modelo y un nº de serie que salieron de una lectura
automática errónea del 15/09/2026 («CLIMA MIX 20 GE», `DS112210053`; y 23,3 kW, que es un
valor de ejemplo del prompt de entonces). La placa dice `CLIMA MIX FD 30` y `0611271051`:
corregido el 30/09/2026 y anotado en su historial.
⚠️ PENDIENTE: en la caldera, el modelo de siempre —el que da marca, modelo y potencia— se
equivoca con las fotos de contexto: en 26RES093_8 propone 29,3 kW (el consumo; la útil es
27,8) y gas natural (la placa dice gasóleo). Lo que ya consta no lo pisa, pero sale como
conflicto.
