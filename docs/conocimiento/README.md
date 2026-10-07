# El conocimiento del proyecto: cómo está organizado y por qué

> Decisión del 07/10/2026. Sustituye al `CLAUDE.md` único de 1,1 MB. Este documento explica el
> problema, las alternativas que se estudiaron, la arquitectura elegida y por qué no empeora el
> trabajo de Claude. Si algún día se replantea, se replantea desde aquí.

## 1. El problema, medido

Hasta el 07/10/2026 todo lo aprendido del proyecto vivía en un único `CLAUDE.md`: **1,1 MB, 13.577
líneas, unos 490.000 tokens**. Era un diario de diseño (~100 secciones fechadas: qué pasó, qué se midió,
qué regla salió) más ~160 reglas críticas repartidas en tres sitios del fichero.

Claude Code carga ese fichero **entero** al empezar cada sesión, otra vez tras cada compactación y en
**cada subagente** que no sea Explore o Plan. Consecuencias medidas:

| Efecto | Dato |
|---|---|
| Contexto gastado antes de escribir nada | 512.000 tokens (51 % de la ventana); 330.000 libres hasta la compactación |
| Subagentes | Uno con modelo de 200.000 tokens **falló al arrancar** (la petición pesaba 454.000) |
| Consumo | Cada mensaje vuelve a enviar esos ~490.000 tokens: de ahí «nos quedamos sin tokens» |
| Cumplimiento | La documentación oficial recomienda **menos de 200 líneas** por CLAUDE.md: «los ficheros largos consumen contexto y reducen el cumplimiento» |

Lo que **no** era el problema: la memoria automática (`MEMORY.md`, ~7.000 tokens) ni las herramientas
(~45.000 tokens fijos).

## 2. Lo que se le exige a la solución

1. **No perder nada.** Todo el texto se conserva tal cual, y se puede demostrar con un script.
2. **Para el área en la que se trabaja, las mismas reglas que antes**, palabra por palabra, y sin que
   Claude tenga que acordarse de buscarlas.
3. Lo que vale para todo el código, siempre presente.
4. Las «regla N» que citan 135 ficheros del código siguen encontrándose.
5. Que se puedan usar subagentes, también en paralelo.
6. Que no vuelva a crecer, y que lo vigile un script, no la buena voluntad.
7. Que se pueda deshacer de un golpe.

## 3. Cómo carga Claude Code las instrucciones

Es lo que hace posible la solución. Fuentes: [memory](https://code.claude.com/docs/en/memory),
[large-codebases](https://code.claude.com/docs/en/large-codebases), [sub-agents](https://code.claude.com/docs/en/sub-agents).

| Mecanismo | Cuándo se carga | ¿Ahorra? |
|---|---|---|
| `CLAUDE.md` de la raíz | Siempre, y otra vez tras compactar | No |
| `@import` dentro de `CLAUDE.md` | Se expande al arrancar | **No**: «imported files also load at launch» |
| `.claude/rules/*.md` **con** `paths:` | Al usar Read, Write o Edit sobre un fichero que casa; se recarga tras compactar | **Sí** |
| `.claude/rules/*.md` **sin** `paths:` | Siempre | No |
| `CLAUDE.md` de una subcarpeta | Al usar Read/Write/Edit dentro de ella | Sí |
| Skills | La descripción siempre; el cuerpo, al usarla | Sí |
| Subagentes Explore y Plan | No cargan `CLAUDE.md` | — |
| Resto de subagentes | Cargan `CLAUDE.md` y las reglas | — |

Límite que hay que tener presente: las reglas por ruta **solo se activan con Read/Write/Edit**, no con
`cat` o `grep` por consola. Para editar hay que leer antes con Read, así que al tocar código se activan
siempre; por eso el protocolo pide leer y editar código con esas herramientas.

## 4. Alternativas estudiadas

| Opción | A favor | En contra | Veredicto |
|---|---|---|---|
| A · Dejarlo igual | Ningún cambio | Todo lo de la tabla del punto 1, y empeora con cada sección | ✗ |
| B · Partir con `@import` | Más ordenado | **Cero ahorro**: se expande al arrancar | ✗ |
| C · Resumir el texto | Menos texto | Se pierden el porqué y las cifras medidas, que son lo que impide repetir errores; resumir es reescribir y meter fallos | ✗ |
| D · Biblioteca en `docs/` con un índice | El texto, intacto; arranque mínimo | Depende de que Claude decida abrir el documento | Necesaria, pero sola no basta |
| E · Reglas por ruta (`.claude/rules` + `paths:`) | Se cargan **solas** al tocar el código del área, y vuelven tras compactar | Con TODO el texto dentro, el área de la envolvente pesaría 330 KB | Sí, con el texto de las reglas críticas, no la historia |
| F · `CLAUDE.md` por subcarpeta | Nativo | Los temas cruzan backend, frontend y motor: no caben en una carpeta | No hace falta |
| G · Convertirlo en skills | Carga perezosa | Choca con «skills solo en `skills/`, publicadas en la cuenta»; una skill es un procedimiento, no un conjunto de reglas | ✗ |
| H · `claudeMdExcludes` | Inmediato | Esconde todo sin dar nada a cambio | Solo como parche de emergencia |

## 5. La arquitectura elegida: tres niveles y dos redes de seguridad

**Nivel 1 — `CLAUDE.md` (siempre; límite 20 KB, hoy ~11 KB).** Qué es el proyecto, la regla de oro del
despliegue, cómo se trabaja (protocolo de peticiones, también por audio, y de subagentes), lo que vale
para TODO el código en una línea cada cosa, la tabla de áreas y cómo se documenta.

**Nivel 2 — `.claude/rules/<área>.md` (se carga sola al leer/editar código del área).** Para cada una
de las 22 áreas: las **reglas críticas numeradas, con su texto íntegro**, y, generadas por el script,
la lista de documentos del área y **todas las frases «REGLA —» en negrita de esos documentos** (775 en
total, copiadas tal cual). El `paths:` de cada área apunta a SUS ficheros, nunca a los que comparten
todas (como `routes/expedientes.js`); dos áreas transversales (`transversal-backend`,
`transversal-frontend`) recogen lo que vale para cualquier ruta o pantalla. La más grande,
`envolvente-ce3x`, pesa ~104 KB (~28.000 tokens) y solo se carga al trabajar en la envolvente.

**Nivel 3 — `docs/conocimiento/<área>/*.md` (bajo demanda).** El detalle íntegro: 192 documentos, uno
por sección del antiguo `CLAUDE.md`; las secciones de más de 16 KB, partidas por subsección en una
carpeta, para que consultar un detalle no obligue a leer 55 KB.

**Red 1 — hook de lectura** ([.claude/hooks/conocimiento-lectura.mjs](../../.claude/hooks/conocimiento-lectura.mjs)).
Al abrir un fichero de código con Read, Claude recibe la lista de documentos que hablan de ese fichero.
Cubre lo que el `paths:` no cubre (los ficheros que comparten todas las áreas, un fichero nuevo) y es
determinista: no depende de que Claude se acuerde.

**Red 2 — búsqueda por identificador.** Los documentos citan ficheros, funciones, rutas y campos por su
nombre. `grep -rn "<nombre>" docs/conocimiento .claude/rules` encuentra lo decidido sobre lo que se va
a tocar, se haya clasificado donde se haya clasificado.

**El vigilante — `node scripts/conocimiento.mjs comprobar`** y el hook de edición
([.claude/hooks/conocimiento-editado.mjs](../../.claude/hooks/conocimiento-editado.mjs)): tamaños, que
cada `paths:` case con ficheros reales, que no haya reglas repetidas, que toda «regla N» que cite el
código exista, y que las partes generadas estén al día (las rehace solo).

## 6. Por qué el resultado no empeora

- **Para el área en la que se trabaja, Claude tiene lo mismo que antes, palabra por palabra.** Las reglas
  críticas de esa área y todas las «REGLA —» de su historia se cargan solas al abrir el código. Lo único
  que hay que abrir a propósito es la narración (el porqué y lo medido), y para eso están las dos redes.
- **Menos ruido, mejor cumplimiento.** Con 490.000 tokens de instrucciones, la regla que importa compite
  con otras 2.000 que no tienen nada que ver con la tarea. La documentación oficial lo dice: los
  ficheros largos reducen el cumplimiento.
- **Más contexto libre, menos olvidos.** Con medio contexto gastado al empezar, una tarea larga se
  compacta pronto y se pierde lo hablado. Ahora la ventana es casi entera para el trabajo.
- **Subagentes.** Antes, cada uno cargaba 490.000 tokens o ni arrancaba. Ahora arrancan con unos pocos
  miles, así que se pueden lanzar en paralelo y mantienen limpia la conversación principal.
- **Lo que sí cambia, y su remedio.** Una pregunta de diseño sin tocar código no carga reglas solas; el
  protocolo obliga a mirar los documentos antes de contestar (y el índice lo hace rápido). Un fichero
  editado por consola no activa su regla; el protocolo pide Read/Edit.

## 7. Cifras

| | Antes | Después |
|---|---|---|
| Instrucciones al arrancar | ~490.000 tokens | ~3.000 (CLAUDE.md) |
| Trabajando en la envolvente (lo más grande) | ~490.000 | ~3.000 + ~28.000 de su regla |
| Subagente general-purpose | ~490.000 (o no arranca) | ~3.000 + lo que abra |

Las medidas reales de la prueba están en [MIGRACION.md](MIGRACION.md).

## 8. Cómo se mantiene

- Lo nuevo de un área: un documento en `docs/conocimiento/<área>/` (un fichero por tema, con fecha y el
  porqué). Si es una regla que no se puede romper, además una entrada numerada en su
  `.claude/rules/<área>.md` (`node scripts/conocimiento.mjs siguiente` da el número).
- `CLAUDE.md` solo cambia para el protocolo, la tabla de áreas o una regla de TODO el código.
- Las listas de documentos, las «REGLA —» de cada área y el [INDICE.md](INDICE.md) **se generan**: no se
  editan a mano (`node scripts/conocimiento.mjs regenerar`; el hook de edición lo hace solo).
- Presupuestos: `CLAUDE.md` ≤ 20 KB (se para por encima); una regla de área, aviso por encima de 40 KB y
  límite de 128 KB. Si un área pasa del límite, se parte en dos con `paths:` distintos.

## 9. Migración y marcha atrás

La migración la hace un script, no una persona: `node scripts/conocimiento.mjs migrar <CLAUDE.md>`
reparte el fichero antiguo según [scripts/conocimiento/reparto.mjs](../../scripts/conocimiento/reparto.mjs)
(por título de sección y número de regla, nunca por número de línea) y **se niega a escribir** si alguna
sección o regla no tiene destino o si alguna línea con texto no aparece íntegra en él. Así se puede
repetir sobre la última versión del `CLAUDE.md` en el momento de aplicarla. El fichero antiguo queda en
el historial de git; deshacerlo es revertir un commit. Detalle y resultado: [MIGRACION.md](MIGRACION.md).

## 10. Cuándo revisar esta decisión

- Si Claude Code cambia cómo carga `CLAUDE.md` o `.claude/rules` (por ejemplo, si las reglas por ruta
  empiezan a activarse también por consola, o deja de existir `paths:`).
- Si se detecta un cambio hecho sin respetar una regla que estaba en un documento: añadir el fichero que
  faltaba al `paths:` del área o subir esa regla a numerada.
- Si un área supera el límite: partirla.
