<!-- conocimiento · área: consultas · las rutas de los enlaces son relativas a la raíz del repo -->

## El autoconsumo fotovoltaico NO es ahorro de energía final en los CAE (30/10/2026)

**Caso:** 26RES080_66 (RES080 con 6 kWp de placas ya instaladas). En CE3X 3.x el XML (v3.0) da
cada uso en bruto y resta la electricidad autoconsumida solo del total del vector eléctrico
(`<Tot>`, con `<EnergiaGeneradaAutoconsumida>` aparte). Fran, 30/10/2026: «la fotovoltaica no se
debe tener en cuenta en el ahorro de energía final, ni en el inicial ni en el final». Pregunta: ¿lo
dicen así las últimas directivas, o con el XML 3.0 hay que contar ya el autoconsumo?

### Respuesta corta

**No se cuenta.** La Comisión Europea lo dice expresamente: la electricidad fotovoltaica generada
in situ **no es ahorro de uso final de la energía**, porque cambia de dónde viene la electricidad,
pero no reduce lo que consumen los equipos. Para un RES080 eso significa calcular EF_i y EF_f con la
**suma de los usos** de `<EnergiaFinalVectores>` (calefacción + ACS + refrigeración + iluminación +
ventilación, en bruto), **nunca con el `<Tot>` eléctrico neto de autoconsumo**. Que el XML 3.0 traiga
el autoconsumo restado en el `<Tot>` es cosa de cómo calcula CE3X la calificación (CTE DB HE 2019);
no cambia lo que es ahorro de energía final a efectos del sistema CAE.

### El porqué

- **Ficha RES080 (Orden TED/845/2023, versión V1.1):** AE = FP · (EF_i − EF_f), con EF el «consumo
  de energía final anual del edificio» antes y después, sacado de dos CEE hechos con la misma
  herramienta. No menciona el autoconsumo ni el apartado del XML. Plantilla en
  `implementation/backend/plantillas/FichaRES080.pdf`.
- **Directiva (UE) 2023/1791, anexo V, punto 2, letra k):** las medidas que promuevan renovables a
  pequeña escala en edificios pueden contar «siempre que redunden en un ahorro de uso final de la
  energía comprobable, y medible o estimable». La letra l) admite expresamente la **solar térmica**
  (el calor para un uso final concreto).
- **Recomendación (UE) 2024/1590 de la Comisión, apartado 7.8** (interpreta los artículos 8, 9 y 10
  y el anexo V; el sistema CAE es el sistema de obligaciones del artículo 9): la electricidad de
  paneles fotovoltaicos in situ «no puede considerarse ahorro de uso final de la energía en el
  contexto del artículo 8». La aclaración de la letra l) es para la generación de calor (bombas de
  calor y solar térmica) y no incluye la electricidad generada in situ, porque la fotovoltaica no
  reduce el consumo de energía final.
- **Adicionalidad (anexo V, 2.b):** además, unas placas que ya estaban antes de la obra no son
  ahorro de la actuación.

### Lo que quedó sin confirmar

- No se encontró una nota, FAQ o resolución del MITECO sobre el autoconsumo en las fichas CAE. La
  Recomendación no es vinculante, pero es el criterio interpretativo de la Comisión y no hay ninguno
  español en contra. Si un verificador pidiera otra cosa, se le cita el apartado 7.8.
- **Aplicado en la app el 30/10/2026** (regla 134 reescrita, `energiaVectorSinFv` en `calculation.js`):
  el vector eléctrico va en bruto en todos los caminos, y el Certificado RES080 lo explica citando la
  Recomendación y la Directiva. Antes la regla 134 tomaba el `<Tot>` neto como bueno.
- Para no quedar en desventaja frente a otros sujetos que sí lo cuenten, se prepara una consulta al
  buzón CAE del MITECO (borrador del 30/10/2026). Si contesta otra cosa, se cambia la regla 134.

### Medido en 26RES080_66 (CE3X 3.2, mismas placas de 6 kWp en los dos, autoconsumo mes a mes)

| | Σ usos (kWh/m²) | `<Tot>` neto (kWh/m²) | Autoconsumida (kWh) |
|---|---|---|---|
| Inicial (gasóleo, convertido a 3.2) | 522,88 | 513,72 | 2.767,81 |
| Final (aerotermia) | 39,10 | 15,96 | 6.987,62 |

- **Sin la fotovoltaica (lo correcto): (522,88 − 39,10) × 302 = 146.102 kWh.**
- Con el `<Tot>` neto, aunque las dos fases tengan las mismas placas: 150.320 kWh. Los 4.218 kWh
  de diferencia son autoconsumo, no ahorro: el inicial apenas consume electricidad (solo
  refrigeración) y el final sí, así que «en igualdad de condiciones» la fotovoltaica sigue
  sumando.

### Fuentes

- Recomendación (UE) 2024/1590, DO L de 4.6.2024: <https://boe.es/doue/2024/1590/L00001-00025.pdf>
- Directiva (UE) 2023/1791, DO L 231 de 20.9.2023, anexo V: <https://www.boe.es/doue/2023/231/L00001-00111.pdf>
- Catálogo de fichas (Resolución de 3 de julio de 2024, BOE-A-2024-14816): <https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-14816>
