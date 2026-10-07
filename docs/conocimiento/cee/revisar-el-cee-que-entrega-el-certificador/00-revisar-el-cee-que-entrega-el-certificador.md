<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «REVISAR el CEE que entrega el certificador (2026-09-21)»; cada subsección está en su propio fichero de esta carpeta.

## REVISAR el CEE que entrega el certificador (2026-09-21)

Cuando el certificador sube su certificado, antes de decirle que lo registre hay que abrirlo y
comprobar una lista de cosas: que declare el equipo que se va a sustituir con su combustible, que el
alcance coincida, que la demanda y la superficie no queden por debajo de las simuladas, y —en un
RES080— que se vea QUÉ elementos se rehabilitan. Se hacía a ojo, expediente a expediente.

| Qué | Dónde |
|---|---|
| Los HECHOS del certificado (lector de `.xml`, sin DOM) | [radiografiaCee.js](implementation/backend/services/cee/radiografiaCee.js) |
| El JUICIO (cruce con el expediente, punto por punto) | [revisionCee.js](implementation/backend/services/cee/revisionCee.js) |
| Combustible declarado y su FAMILIA (fuente única) | [utils/combustibleCaldera.js](implementation/backend/utils/combustibleCaldera.js) |
| Por línea de órdenes | `node scripts/revisar_cee.js --expediente 26RES060_192 [--fase inicial\|final]` |
| Skill | `skills/revisar-cee/` (+ su `referencia/criterio.md` para Cowork) |
| Pruebas | `node implementation/backend/scripts/test_revision_cee.js` |

**REGLA — el fichero solo se LEE; el juicio es del código.** Mismo reparto que
`facturaOcrService` ↔ `facturaIncidencias` y `placaOcrService` ↔ `elegirPotencia`. Cada comprobación
sale con la EVIDENCIA literal —lo que dice el certificado frente a lo que dice el expediente—, que es
lo que permite contrastarla sin abrir el fichero y reproducir por qué saltó.

**REGLA — esto PROPONE; el visto bueno lo da una persona.** No escribe en el expediente, no registra
incidencias, no le escribe al certificador y no toca la fase del CEE. Eso sigue en el módulo CEE, que
es donde se sella el seguimiento y el historial.

**REGLA — lo que NO se puede comprobar se DICE.** Un punto omitido en silencio se lee como un punto
que está bien, y aquí eso significa dar por revisado algo que nadie ha mirado. Por eso hay un estado
`no_comprobable` que cuenta aparte y que **impide decir APTO a secas**: el veredicto baja a APTO CON
AVISOS. Es lo que separa «lo he mirado y está bien» de «esto no lo he podido mirar».
