<!-- conocimiento · área: infra · origen: sesión 2026-10-07 · las rutas de los enlaces son relativas a la raíz del repo -->

## El RAZONAMIENTO y la TEMPERATURA de Gemini, según el modelo (2026-10-07)

El 07/10/2026 llegó un aviso obligatorio de Google AI Studio: **se retiran `thinkingBudget` y los
parámetros de muestreo (`temperature`, `topP`, `topK`)**. Desde ahora hay que usar `thinkingLevel`
y no mandar los de muestreo. En los modelos que vengan, mandarlos responderá `400 INVALID_ARGUMENT`. Todos
nuestros lectores mandaban `temperature: 0` y casi todos `thinkingBudget`: el día que se cambiara
`GEMINI_MODEL` (o cualquier `*_MODELO`) se caían **todos a la vez**, en silencio hasta la primera
lectura.

| Qué | Dónde |
|---|---|
| Qué se manda a cada modelo | [utils/geminiAjustes.js](implementation/backend/utils/geminiAjustes.js) — `ajustesGemini(modelo, { pensamiento, temperatura })` |
| Quién lo usa | `llamarGemini` de [placaOcrService.js](implementation/backend/services/placaOcrService.js) (y con él paredes, vídeo, clasificar fotos, aclaración de fechas y placas de equipo), `botCerebro`, y los OCR de CEE, factura, lote, Catastro, justificante, RITE y registro del CEE; los scripts `comparar_modelos_ocr` y `rellenar_potencias_catalogo` |
| Pruebas | `node implementation/backend/scripts/test_gemini_ajustes.js` · con `--vivo [modelos]` manda una petición de TEXTO a cada modelo por `llamarGemini` |

**REGLA — ningún lector escribe `thinkingConfig` ni `temperature` a mano**: se mezcla
`...ajustesGemini(modelo, { pensamiento, temperatura })` en el `generationConfig`. `pensamiento: 0`
es «no razonar» (lo de siempre al transcribir), un número es un tope como el antiguo presupuesto y
`null` es «lo que traiga el modelo» (el `pensar` del inventario de fachadas).

**Medido el 07/10/2026** con un texto de prueba, sin datos de clientes:

| Modelo | `thinkingBudget: 0` | `thinkingLevel: minimal` | `low` | Temperatura |
|---|---|---|---|---|
| gemini-2.5-flash | ✓ 0 tokens pensados | **400** «not supported for this model» | 400 | se respeta |
| gemini-3.5-flash (bot) | ✓ 0 | ✓ 0 | ✓ | **se respeta** (a 0, 4 de 4 iguales) |
| gemini-3.5-flash-lite | **400** | ✓ 0 | ✓ | se ignora |
| gemini-3.6-flash (nº de serie, vídeo) | ✓ 0 | ✓ 0 | ✓ | **se ignora** (a 0, 4 respuestas distintas) |
| gemini-3.7-flash | piensa igual (69) | **400** «MINIMAL is not supported» | ✓ | — |
| gemini-3.8-flash | ✓ 0 | **400** | ✓ 0 | — |

De ahí la tabla de `ajustesGemini`:

- **Serie 2.x**: `thinkingBudget` y temperatura, como siempre. Con `GEMINI_MODEL=gemini-2.5-flash`
  los lectores mandan EXACTAMENTE lo mismo que antes.
- **Gemini 3 o posterior**: `thinkingLevel`, nunca `thinkingBudget`. «No razonar» es `minimal` en
  los Flash hasta la 3.6 y `low` en todo lo demás (3.7, 3.8, los Pro y cualquier alias sin versión
  como `gemini-flash-latest`, que se trata como el modelo más nuevo). Un presupuesto se traduce:
  ≤ 2.048 → `low`, ≤ 8.192 → `medium`, más → `high`.
- **La temperatura solo se manda antes de la 3.6**, que es donde todavía hace algo. A partir de ahí
  no se manda.

**El reintento ante BUCLE de las placas sigue sirviendo.** Repetía la lectura con `temperatura: 0.4`
para que no saliera idéntica. En 3.6-flash esa temperatura no llega, pero tampoco hace falta: ese
modelo ya ignora el 0 y da una respuesta distinta en cada llamada, así que la repetición varía sola.

**Antes de cambiar un modelo**: `node implementation/backend/scripts/test_gemini_ajustes.js --vivo
<modelo>` (céntimos, sin datos de clientes) y, para decidir si lee igual, `comparar_modelos_ocr.js`.
Un 400 nuevo de «thinking level» se arregla en `ajustesGemini`, no en el lector.
