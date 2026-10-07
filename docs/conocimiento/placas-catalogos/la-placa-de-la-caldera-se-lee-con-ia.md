<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La PLACA de la caldera se lee con IA (2026-09-13)

De la caldera existente hacen falta tres datos para escribirla en el `.cex`: marca,
modelo y **POTENCIA**. Los dos primeros dejan el equipo como «CALDERA EXISTENTE» si
faltan; **sin la potencia no se escribe el equipo en absoluto**, y ese dato no está en
ningún campo del expediente. Está en la placa de características, y su foto lleva
meses en Drive: el instalador la sube al slot `FOTO_PLACA_CALDERA_ANTES` («la etiqueta
con marca, modelo y potencia»), que además está en `FULL_RES_SLOTS` precisamente para
que ese número se lea. Se seguía tecleando a mano mirando la foto.

| Qué | Dónde |
|---|---|
| Lectura (prompt + esquema) y la ELECCIÓN de la potencia | [placaOcrService.js](implementation/backend/services/placaOcrService.js) |
| Ruta | `POST /api/expedientes/:id/placa-caldera/ocr` (`aplicar`, multipart `files[]` opcional), **staffOnly** |
| Superficie | Bloque **Caldera existente** de la ficha, en `/envolvente/:id` |
| Qué se escribe con ello | `instalacionExistente()` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) |
| Prueba de lo determinista | `node implementation/backend/scripts/test_placa_ocr.js` |
| Probar contra un expediente real, sin escribir | `node implementation/backend/scripts/probar_placa_ocr.js 26RES060_186` |

**REGLA — las fotos van como FOTOS, no como PDF.** Los demás lectores pasan por
`ceeOcrService.normalizeToPdf` porque leen DOCUMENTOS. Una placa es un primer plano y
lo que se busca —el nº de serie, un «23,3» grabado en relieve— vive en unos pocos
píxeles: meterla en un PDF la recomprime por el camino, que es justo lo que
`FULL_RES_SLOTS` evita al subirla. Gemini acepta varias imágenes en la misma petición.
Medido sobre 26RES060_186: **3 fotos, 1.502 tokens de entrada, 2,2 s**, ~0,001 €.

**REGLA — se leen también un par de fotos de la CALDERA ENTERA.** La MARCA suele estar
en el frontal, en letras grandes, y no en la etiqueta de datos —que a veces solo trae
el nº de serie y las potencias—. Con la etiqueta sola el modelo lee media respuesta.

**REGLA — el modelo TRANSCRIBE las potencias una a una; cuál vale lo decide el
código.** Una placa trae el consumo calorífico (`Qn`, `Hi`) y la potencia útil (`Pn`),
que es la que pide CE3X, y casi siempre como RANGO porque la caldera modula. Se le
piden todas con su rótulo literal (`potencias[]`) **y** la línea entera
(`potencia_texto`), y `elegirPotencia()` aplica: útil sobre consumo, y de un rango el
máximo. Esa línea es además la EVIDENCIA que se enseña en pantalla — es lo que separa
«lo pone la placa» de «lo ha dicho una máquina».

**REGLA — una placa POLICOMBUSTIBLE se resuelve con el combustible del EXPEDIENTE.**
Las calderas antiguas de fundición queman lo que se les eche y declaran **una potencia
por combustible**: la ROCA P-30-4 de 26RES060_186 pone «Potencia kW Sólido 15,3
Líquido 23,3 Gas 23,3». Ahí no hay una potencia que leer, hay tres, y coger la primera
—o la mayor— es declarar una caldera un **52 % más potente** que la real. La familia
sale de `caldera_antigua_cal.rendimiento_id` + `inputs.fuelType`
(`combustibleDeclarado`), porque `BOILER_EFFICIENCIES` no tiene fila de GLP ni
distingue carbón de biomasa. **Sin combustible declarado NO se elige ninguna** y se
dice por qué: adivinarla es escribir un certificado con la caldera de otro.
⚠️ El orden de `FAMILIAS` importa: «gasóleo» contiene «gas».

**REGLA — se PROPONE, y al aplicar solo se rellenan HUECOS.** Lo que hay escrito lo
puso una persona con la caldera delante. Lo que difiere sale como **conflicto** con las
dos versiones a la vista y no se toca. El `0` de `potencia_caldera` no cuenta como
valor puesto: ese campo nace en `''` y se guarda como 0 en cuanto alguien abre y guarda
Instalación, así que tomarlo por un dato dejaría el hueco sin rellenar para siempre.

**REGLA — el COMBUSTIBLE leído NUNCA se escribe.** De él cuelgan el rendimiento de la
tabla, el ahorro y la propuesta que el cliente ya firmó. Una discrepancia con la placa
es un hallazgo que mira una persona, no una corrección que se aplica sola.

**El decimal.** En los avisos y en pantalla va con COMA, que es castellano; el valor que
viaja al `.cex` conserva el PUNTO, que es lo que escribe el propio CE3X en sus ficheros
(`V24.0`, `V90.0`, medido en `CARBON.cex`).

Se escribe en `caldera_antigua_cal` (y se refleja en `caldera_antigua_acs` mientras sea
la misma, como hace la propia app) más `instalacion.potencia_caldera_kw`, con la huella
en `instalacion.placa_ocr` —qué se leyó, de qué fotos, quién y cuándo (solo metadatos,
regla 21)—: una comprobación que se ve una vez y se pierde al cerrar el popup no sirve
de nada.

⚠️ **`potencia_caldera` YA EXISTÍA** en Instalación: es la potencia nominal de la
caldera existente que en un RES093 se teclea para la base del Cb. Es el MISMO número,
así que `instalacionExistente()` lo mira también — antes un expediente que ya lo tenía
escrito volvía a pedirlo.
