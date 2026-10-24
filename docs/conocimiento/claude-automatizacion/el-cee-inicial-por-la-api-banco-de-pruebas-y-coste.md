<!-- conocimiento · área: claude-automatizacion · las rutas de los enlaces son relativas a la raíz del repo -->

## El CEE inicial por la API de Claude: banco de pruebas y coste medido (2026-10-19)

Para llevar a producción la skill [generar-cee-inicial](skills/generar-cee-inicial/SKILL.md) hacía
falta saber cuánto cuesta por la API y con qué modelo. Herramienta:
[tools/banco-cee-api/](tools/banco-cee-api/banco.mjs), un agente propio (Messages API, bucle de
herramientas a mano) con la skill entera en el `system` y las MISMAS órdenes de
`scripts/cee_inicial.js`.

**REGLA — el banco va EN SECO y A CIEGAS.** [seco.cjs](tools/banco-cee-api/seco.cjs) se carga antes
del script: corta TODA escritura en Supabase (cualquier método que no sea GET, y toda RPC) y en
Drive (lo apunta en `seco.log`), quita `--escribir`/`--enviar`, y esconde de lo que lee el CEE que
se quiere comparar (`cee_inicial`, `xml_inicial`, el final, la envolvente, el sello, `agente_ia`):
el agente empieza de CERO. Los documentos de Drive solo se leen de «0. PRESUPUESTO» y «12.», nunca
de «1. CEE» ([docs_obra.cjs](tools/banco-cee-api/docs_obra.cjs)).

**Lo medido (Opus 5.5, en seco, con las fotos ya en la app):**

| Expediente | Esfuerzo | Coste | Vueltas | Tiempo | Frente al CEE de referencia |
|---|---|---|---|---|---|
| 26RES060_194 | medio | **1,21 $** | 18 | 10 min | superficie y letra iguales; 9/13 huecos (le faltaron los del patio NO) |
| 26RES060_189 | alto | **1,86 $** | 24 | 13 min | superficie y letra iguales; 9/7 huecos; preparó el WhatsApp pidiendo las paredes N y S |

En Claude Code, la sesión que generó el 189 costó 4,53 $ equivalentes, y las 28 sesiones maduras de
la skill (13–19/10) tienen una mediana de ~9,5 $: lo caro de esas sesiones no es el CEE sino lo de
alrededor (buscar y bajar fotos del WhatsApp, preguntar, esperar, corregir), con cada llamada
arrastrando ~300.000 tokens frente a ~70.000 en el banco.

**26RES060_237 (Lucinio), hecho a la vez por Claude Code y por el agente**, con fotos mal etiquetadas
(la fachada subida como placa, la placa en «OTROS») y un cuerpo trasero de almacén: Claude Code
~2,83 $ y el agente Opus **1,71 $** (12 min) dieron el MISMO CEE — 151 m², 11 huecos (11,9 frente a
12,9 m²), demanda 167,6 / 168,5, letra G/G. La única diferencia de fondo, la aerotermia: el agente no
tenía con qué buscar en el catálogo y puso la genérica (de ahí la herramienta `catalogo_aerotermia`).

**REGLA — esta skill, con OPUS y esfuerzo ALTO** (decisión de Fran, 19/10/2026). Sonnet 5.5 con
esfuerzo medio abandonó el 194 (0,25 $, sin medida); con esfuerzo alto y las lecciones terminó el
194 (0,61 $) y el 237 (0,72 $) con resultados parecidos, pero se deja más huecos y razona peor lo
dudoso. ~1 $ más por CEE no compensa: Sonnet queda para lo mecánico (p. ej. el CEE final RES060).

**El agente APRENDE de cada pasada** con [lecciones.md](tools/banco-cee-api/lecciones.md), que va en
su `system`: lo que falla por el ARNÉS o por cómo trabaja el agente. Lo que sea regla de NEGOCIO va
a la skill (fuente única para Claude Code y la API) y solo con el visto bueno de Fran.

**Por qué el coste se trocea** (idea de Fran, 19/10/2026): la fase cara (el agente) debe correr UNA
vez y con el paquete completo. Antes, sin IA, la app sabe por el Catastro qué fotos hacen falta
(lados, patios, placa) y las pide en su enlace de subida; un modelo barato comprueba lo subido; y
solo entonces se lanza el agente.

**Desde la app** (2026-10-19): el botón CE3X ofrece «Generar con IA» y lo apunta en la cola
`cee_ia_trabajos`; `banco.mjs atender` (o `atender.cmd`) la atiende en el PC con la MISMA pasada que
`banco.mjs generar` (`generarReal`). Ver «Generar el CEE inicial con IA desde el botón CE3X» en
`docs/conocimiento/cee-generacion/`. **Desde el 24/10/2026 el botón va por la suscripción** (el
Claude del WhatsApp); la cola del PC solo con `CEE_IA_VIA=api`.

**Lo que costó el banco** (consola de Anthropic, 19/10/2026): ~13,8 M tokens de entrada —más del
90 % lecturas de caché— y ~13 $: cinco pasadas con Opus (~10,7 $) y tres con Sonnet (~1,6 $). Fue
el pico del mes; no se ha vuelto a lanzar.
