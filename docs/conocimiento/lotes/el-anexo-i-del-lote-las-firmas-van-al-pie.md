<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## El Anexo I del lote: las firmas van al PIE de la hoja, y sus casillas se miden (2026-11-12)

El «Anexo I · Listado Cesión» del lote ([anexoListadoHtml.js](implementation/frontend/src/features/lotes/logic/anexoListadoHtml.js))
lo firman dos personas, cada una en una casilla FIJA de
[signBoxes.js](implementation/frontend/src/features/expedientes/logic/signBoxes.js):
- `anexo_i_listado_proveedor`: Brokergy, con Autofirma, antes de enviarlo;
- `anexo_i_listado`: el S.O., desde `/firmar-lote`.

Las coordenadas viajan en el `fixedBox` del envío y se guardan en `documentos_so`.

### Qué pasó

El bloque de firmas iba justo detrás de la tabla (`margin-top: 26px`), así que **bajaba con cada
actuación**. Las casillas se midieron con un lote corto, en y 188–269 pt. En un lote de 10 caían
**encima de las filas 8 y 9**.

Se vio el 12/11/2026, al re-firmar el Anexo I de LOTE-2026-018 por la inexactitud nº 7 (CAE-2059).
En la prueba en seco, la firma de Brokergy tapó las filas del 164 y del 198 (no salió así). Se firmó en la casilla
real (y 39–105, medida el 11/11/2026), y el S.O. firmó en la suya con un `fixedBox` corregido en ese
envío.

**REGLA — el bloque de firmas va ANCLADO al pie de la hoja, con un hueco fijo bajo cada rótulo.**

`.hoja` es un flex en columna que llena la hoja útil (A4 apaisado menos 2 × 10 mm) y `.firma` lleva
`margin-top: auto`. Debajo de cada rótulo («EL PROVEEDOR / BROKERGY» y el nombre del S.O.) queda un
hueco de 90 px. Así los rótulos están en el mismo sitio con 1 actuación que con 10 (y 117–124 pt), y
las casillas caen siempre en blanco:
- Proveedor: 131,42 – 337,106.
- S.O.: 504,42 – 710,106.

Esas mismas casillas también caen en blanco en los PDF hechos con la maqueta anterior. Por eso sirven
para «Firmarlo yo ahora» en los firmados del S.O. (`FirmadosSoModal`).

⚠️ **El flex va en `.hoja` y NO en el `body`.** La vista previa de `AnexoListadoModal` mete este HTML
con `dangerouslySetInnerHTML`, así que su `<style>` alcanza al `body` de la app.

**REGLA — las casillas se MIDEN sobre el PDF de verdad, con el mismo motor que la app.**

```bash
node implementation/backend/scripts/check_anexo_listado_firmas.mjs [--medir]
```

Genera el PDF con `htmlToPdf` (1, 5 y 10 actuaciones, con las filas de un lote real) y lo lee con
MuPDF. Falla si:
- sale más de una hoja;
- los rótulos se mueven con el número de filas;
- una casilla no queda debajo de su rótulo o no está centrada con él;
- una casilla tiene texto dentro.

`--medir` da las posiciones para volver a derivar las casillas y cuántas actuaciones caben en una hoja:

| Filas | Caben en una hoja |
|---|---|
| RES060 como las de un lote real | 10 |
| RES060 con todas las direcciones y RC en tres líneas | 8 |
| RES093 (título de cinco líneas) | 7 |

Un lote más largo desborda a una segunda hoja: el riesgo que ya anotaba `signBoxes.js`. Si llega uno,
hay que paginar la tabla y repetir las firmas, no mover las casillas.
