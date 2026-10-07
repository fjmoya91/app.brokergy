<!-- conocimiento · área: infra · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La API de Gemini va en NIVEL DE PAGO (2026-09-01)

Todo lo que lee documentos —`ceeOcrService`, `facturaOcrService`,
`catastroOcrService`, `loteOcrService` y el `botCerebro`— comparte la MISMA
`GEMINI_API_KEY`, la del proyecto **OCR CEE** (`gen-lang-client-0635030717`).

Ese proyecto está en **Nivel 1 (de pago)** desde el 01/09/2026. Antes estaba en
el nivel gratuito, y eso traía dos problemas:

**REGLA — el nivel gratuito NO puede usarse con documentos de clientes.** Las
condiciones de la API dicen que en los servicios no de pago "Google usa el
contenido que envías […] para mejorar sus productos" y que "revisores humanos
pueden leer, anotar y procesar" entradas y salidas. Por aquí pasan facturas con
NIF, informes de verificación con nombres y direcciones, y referencias
catastrales. En el nivel de pago Google se compromete expresamente a lo
contrario. **Si algún día se crea una key nueva, tiene que ser de un proyecto
con facturación**: una key "que funciona" puede estar mandando los documentos de
los clientes a un conjunto de entrenamiento.

**Y el límite del gratuito eran 20 peticiones**, que es lo que hacía saltar los
429 al encadenar lecturas (un informe + un dictamen + una factura de un lote ya
son tres).

**Coste medido** (Gemini 2.5 Flash, $0,30/1M entrada · $2,50/1M salida):

| Documento | Páginas | Entrada | Salida | Coste |
|---|---|---|---|---|
| Factura del verificador | 1 | 524 | 202 | 0,0006 € |
| Dictamen | 4 | 1.577 | 553 | 0,0016 € |
| Informe de verificación | 24 | 6.173 | 504 | 0,0027 € |

Leer los tres documentos de un lote sale por **medio céntimo**. El consumidor
grande es el bot de WhatsApp con su tope de 40 respuestas/día (~2 $/mes en el
peor caso); todo el OCR junto no llega a 0,50 $/mes.

Un PDF le cuesta a Gemini **258 tokens por página** (medido: 24 páginas → 6.173
tokens), y acepta el PDF directamente sin convertirlo a imágenes. Es la razón
técnica de que no compense mover esto a otro proveedor: los modelos económicos
equivalentes cuestan lo mismo y habría que reescribir cinco servicios.
