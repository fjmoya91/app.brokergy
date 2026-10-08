<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Las TRES placas de la obra, de un botón (2026-09-15)»; la introducción y el resto, en esta misma carpeta.

### Lo que cuesta, medido (15/09/2026)

Con `gemini-2.5-flash`, que es el que usan todos los lectores de la app:

| | tokens entrada | salida | coste |
|---|---|---|---|
| Una placa | ~1.030 | ~120 | **0,0006 €** |
| Un expediente entero (las tres placas) | ~3.560 | ~360 | **~0,002 €** · 5-7 s |

**El cruce con el catálogo NO gasta ni un token**: es una consulta a Supabase y una
comparación de cadenas. La parte «inteligente» que se temía cara es la barata.

⚠️ **Lo que se compara entre modelos es el COSTE POR LECTURA, no el precio por token.**
Medido sobre la misma foto: 445 tokens de entrada en 2.5-flash frente a **1.251** en
todos los 3.x. Los modelos nuevos tokenizan la imagen con casi el triple de detalle, así
que uno con precio unitario más bajo puede salir más caro leyendo placas — y en estas
placas **aciertan todos**, así que hoy no hay ninguna razón para cambiar.

| modelo | €/lectura | ¿acierta? |
|---|---|---|
| **gemini-2.5-flash** (el que se usa) | **0,00028** | ✓ |
| gemini-3.1-flash-lite | 0,00040 | ✓ |
| gemini-3.5-flash-lite | 0,00053 | ✓ |
| gemini-3.6-flash | 0,00111 | ✓ |
| gemini-3.8-flash | 0,00116 | ✓ |

⚠️ **`gemini-2.5-flash-lite` ya responde 404** («no longer available to new users»,
remitiendo a `gemini-3.5-flash-lite`), aunque la página oficial de deprecaciones siga
diciendo que 2.5 no tiene fecha de retirada anunciada. El día que le toque a
`gemini-2.5-flash` **solo hay que cambiar `GEMINI_MODEL`** —la variable ya existe y la leen
los seis lectores—, y el relevo se decide con `comparar_modelos_ocr.js`, no de oídas.
⚠️ `gemini-3.5-flash-lite` **no admite `thinkingBudget: 0`** (responde 400). Desde el 07/10/2026
ya no hace falta tocar nada para migrar a él: `ajustesGemini` le manda `thinkingLevel: minimal`
(regla 121, [el razonamiento y la temperatura según el modelo](docs/conocimiento/infra/razonamiento-y-temperatura-segun-el-modelo.md)).
Antes de cambiar, `test_gemini_ajustes.js --vivo <modelo>`.
