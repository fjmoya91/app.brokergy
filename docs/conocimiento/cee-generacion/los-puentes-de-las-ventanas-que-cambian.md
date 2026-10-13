<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## Los PUENTES TÉRMICOS de las ventanas que CAMBIAN (RES080, 2026-10-05)

Fran: «cuando se cambien ventanas, los puentes térmicos de ventanas también deben ser mucho mejores…
al final estamos resolviendo un puente térmico. Eso siempre debe pasar cuando se vaya a generar el
CEE final desde el CEE inicial».

**REGLA — en el PREVISTO (y en el CEE final de un RES080, que sale de él) los puentes de cada ventana
«- CAMBIA» pasan a los ψ de la «Mejora de Puentes Térmicos» del propio CE3X 3.2:**

| Puente | ψ por defecto | ψ de la mejora de CE3X |
|---|---|---|
| Contorno de hueco | 0,55 | **0,02** |
| Caja de persiana | 1,49 | **0,65** |

El resto de la tabla, por si se usa algún día: pilar integrado 0,01 · pilar en esquina 0,16 ·
fachada-forjado 0,16 · fachada-cubierta 0,26 · fachada-suelo al aire 0,22 (voladizo y solera no tienen).

**De dónde salen:** `Envolvente.tablasValores(...).obtenerPTMedidasMejora()` de CE3X 3.2, preguntado
con el oráculo (`tools/oraculo_ce3x`). Son fijos: no dependen de la época (CE3X tiene seis, la última
«A partir de 2020» = CTE 2019) ni de la zona. No se inventa ningún ψ: es el que pondría el
certificador marcando la mejora en CE3X, y el que el verificador reproduce con su copia del programa.

**Cómo se escriben** (medido en `.cex` de certificadores: 26RES080_83, c02, c10…): un ψ tecleado va
en TEXTO (`'0.02'`) con la marca `usuario_fi`; la longitud sigue `defecto`. Uno por defecto es
`float` + `defecto_fi`. Un puente es de un hueco por su NOMBRE, «PT {tipo}-{hueco}», como lo escriben
la app y CE3X; uno que ya tenga un ψ menor no se empeora.

**La medida del INICIAL** (el conjunto de `medida_previsto.py`) lleva la pieza
`[nombre, 'Mejora de Puentes Térmicos', params]`, con `params` = diez pares `[casilla, ψ]` en el orden
del diálogo `MedidasDeMejora.ventanaPT` (leído con el oráculo al aceptarlo): contorno de hueco es el
3.er par y caja de persiana el 4.º. ⚠️ CE3X aplica esa mejora por TIPO, a TODOS los puentes de ese
tipo —también a la puerta de entrada que no se cambia—: se avisa (`avisos_medida`), como con la
sustitución de huecos por orientación. Sin esa pieza la medida calcularía con los puentes viejos y no
daría lo que da el previsto.

**Medido en 26RES080_93:** calefacción del previsto 154,94 → 145,36 kWh/m², y la de la medida del
inicial 176,6 → 165,5. Con placas el ahorro por vector apenas se mueve (41,86 → 41,78 MWh): al bajar
el consumo, el autoconsumo de cada mes —que se recorta a lo que consume el edificio— baja igual. Sin
placas, el ahorro sube.

`previsto.puentes_huecos: false` en el plan lo apaga. Fuente única: `PSI_MEJORA_HUECO` /
`_mejorar_puentes_de_huecos` en [tools/previsto.py](implementation/cee-engine/tools/previsto.py) y
`_mejora_puentes` en [medida_previsto.py](implementation/cee-engine/tools/oraculo_ce3x/medida_previsto.py);
el texto de la medida lo dice (`textosDelPrevisto`, `hechos.puentes`). Prueba:
`python -m pytest implementation/cee-engine/tests/test_previsto.py`.
