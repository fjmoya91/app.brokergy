<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## Armar el lote: filtro por instalador y PROPUESTAS por antigüedad y por instalador (2026-10-27)

El selector «Añadir expediente» del lote listaba los elegibles por nº y había que
armar el lote a ojo, uno a uno. Fran (27/10/2026): que se pueda filtrar por
INSTALADOR y que la app PROPONGA el lote ella misma, por instalador y por
antigüedad, con lo más antiguo como preferente.

| Qué | Dónde |
|---|---|
| Nombre del instalador y `listo_desde` de cada elegible | `GET /api/lotes/elegibles` en [routes/lotes.js](implementation/backend/routes/lotes.js) |
| Las propuestas (función pura) | [logic/propuestaLote.js](implementation/frontend/src/features/lotes/logic/propuestaLote.js) |
| El picker: filtro, orden, línea del instalador, bloque de propuestas, «Añadir N» | [LoteDetailModal.jsx](implementation/frontend/src/features/lotes/components/LoteDetailModal.jsx) |
| Prueba (casos + lo que propondría hoy, solo lee) | `node implementation/backend/scripts/test_propuesta_lote.mjs` |

**REGLA — la antigüedad es la del RADAR.** `listo_desde` = fecha de registro del CEE
final, o la del inicial de respaldo: el mismo criterio que el bloque `SIN_LOTEAR`
del parte diario (`detectarSinLotear`), para que el picker y el parte digan los
mismos días. No `updated_at`, que rejuvenece al que alguien abre y guarda. El orden
por defecto del picker pasa a ser «Más antiguos primero» (queda «Por nº de expediente»).

**REGLA — el instalador es el de siempre del lote**: `instalador_asociado_id` del
expediente o, si no, `instalacion.instalador_id` — el mismo que usa
`sugerirMismoInstalador` al añadir. Su nombre (acrónimo o razón social) se trae en
UNA consulta a `prescriptores`.

**REGLA — una propuesta nunca mezcla año ni CCAA, ni pasa del cupo.** Lo exige la ruta
al añadir, así que se propone dentro de cada grupo año + CCAA y con lo que le queda
al lote hasta 5. Hay UNA propuesta «Los más antiguos» por grupo (el más viejo primero)
y una por cada instalador con al menos DOS expedientes en el grupo; el picker enseña
las cuatro primeras y el resto tras «Ver N más» (hoy salen 10). Con un tope de cuatro
por instalador se quedaban fuera MIGUELTURRA (3), INSTOTERMA (2) y JOSE VICENTE RUIZ (2). Con solo la del expediente más viejo, el lote vacío
proponía un lote de UNO: medido el 27/10/2026, 25RES080_28 era el único elegible de
2025 (818 días desde su CEE inicial, sin final registrado) y tapaba los 28 de 2026.

**REGLA — entre instaladores: primero el que ya está en el lote, luego el que más lleva
esperando.** Un instalador con UN solo expediente no es propuesta (ya está en la
lista), salvo que sea el del lote. Si la propuesta de un instalador es idéntica a una
de antigüedad no se repite: la de antigüedad se titula «X · los más antiguos», con el
nombre delante porque en el móvil el título se corta por el final.

En la tarjeta de cada elegible van primero los días y luego el instalador
(«⏳ 246 días · 🔧 ISM»): con el nombre delante, uno largo cortaba los días.

**REGLA — «Añadir N» entra por la MISMA ruta que el botón suelto** (`POST
/api/lotes/:id/expedientes`, uno a uno), que es la que valida estado, año y CCAA; al
primer fallo se para y dice cuántos entraron. Las propuestas se recalculan con el
cupo que queda, así que se pueden encadenar: un instalador y luego «completar con
los más antiguos».

Hoy (27/10/2026): 30 elegibles, todos con instalador y con fecha; 28 de CLM 2026.
