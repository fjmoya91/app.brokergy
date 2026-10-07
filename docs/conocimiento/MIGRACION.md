# Migración del CLAUDE.md único a los tres niveles

> Cómo se hizo, cómo se comprobó que no se perdía nada y cómo se aplica o se deshace.
> El porqué: [README.md](README.md).

## 1. Qué hace el script

`node scripts/conocimiento.mjs migrar <CLAUDE.md antiguo>` reparte el fichero según
[scripts/conocimiento/reparto.mjs](../../scripts/conocimiento/reparto.mjs):

- cada sección `## ` va a la carpeta de su área (`docs/conocimiento/<área>/`), con su texto **tal cual**;
- las secciones de más de 16 KB se parten por subsección `### ` dentro de una carpeta propia;
- las subsecciones que con los meses quedaron escritas bajo la sección que no era (por ejemplo, la
  firma por QR dentro de «DESHACER en la envolvente») van a su área por la lista `SUBSECCIONES`;
- cada regla numerada va, **íntegra**, a la regla de su área (`.claude/rules/<área>.md`);
- las listas de documentos, las «REGLA —» de cada área y el `INDICE.md` se generan.

El reparto se hace por **título** de sección y **número** de regla, nunca por nº de línea, y el script
**se para** si una sección o una regla no tiene destino, si una subsección de la lista casa con más de
una, o si alguna línea con texto no aparece íntegra en su destino.

## 2. Resultado de la migración APLICADA (07/10/2026, 15:30)

Sobre el `CLAUDE.md` de la copia de trabajo de `main` (commit `5ddd6b3` más los cambios sin commit
de otras sesiones: la ampliación de las reglas 105 y 117 y la regla 120). Esa copia quedó guardada en
`C:\Proyectos\_copias-seguridad\2026-10-07_antes-de-reorganizar-claude-md\CLAUDE_main_copia-de-trabajo_15h.md`.

```
Original: 13579 líneas (1118,0 KB).
  · 12989 líneas copiadas TAL CUAL a 192 documentos y 22 reglas de área (163 reglas numeradas).
  · 590 líneas de estructura (vacías, «---» y la cabecera «## Reglas Críticas»), sin texto.
✓ Ninguna línea con texto se pierde ni se altera.
```

`comprobar` cuenta 159 números de regla y no 163: el `CLAUDE.md` antiguo ya traía repetidos el 42, el
43, el 92 y el 103 (dos reglas distintas con el mismo número). Se copian las dos; `siguiente` da el
primer número libre.

**Saltos de línea.** El `CLAUDE.md` de la copia de trabajo de `main` tenía secciones con CRLF, y al
pasar los ficheros a `main` (`core.autocrlf=true`) git los sacó con CRLF: el script dejó de reconocer
la cabecera `paths:` de las reglas y los tamaños del índice cambiaban según el disco. Desde entonces:
`.gitattributes` fija `eol=lf` para `CLAUDE.md`, `.claude/rules/*.md` y `docs/conocimiento/**`, y el
script lee todo normalizado a LF y mide los tamaños sobre ese texto. Claude Code sí entendía la
cabecera con CRLF (se vio cargar sola una regla desde `main` en ese estado); el que fallaba era el script.

| Nivel | Tamaño |
|---|---|
| `CLAUDE.md` nuevo | 11 KB (~3.000 tokens) |
| Reglas de área | de 1,3 KB (`infra`) a 106 KB (`envolvente-ce3x`); mediana ~12 KB |
| Documentos | 192 ficheros, 1,5 MB en total; el mayor, 24 KB |

## 3. Cómo se aplica (el día que se pase a `main`)

El `CLAUDE.md` de `main` sigue cambiando mientras tanto (otras sesiones añaden reglas), así que la
migración **se repite** sobre la última versión justo antes de aplicarla:

1. Que ninguna otra sesión esté escribiendo en el `CLAUDE.md`.
2. `git show main:CLAUDE.md > /tmp/CLAUDE_main.md` (o desde la copia de trabajo de `main` si tiene
   cambios sin commit).
3. `node scripts/conocimiento.mjs migrar /tmp/CLAUDE_main.md --forzar`. Si dice que una sección o una
   regla no tiene área, se añade a `scripts/conocimiento/reparto.mjs` y se repite.
4. `node scripts/conocimiento.mjs comprobar`.
5. Commit con el `CLAUDE.md` nuevo, `docs/conocimiento/`, `.claude/rules/`, los hooks y los scripts.
6. Las sesiones que ya estaban abiertas siguen con el `CLAUDE.md` antiguo en su contexto hasta que se
   cierren: si escriben en él, el hook de edición avisa de dónde va lo nuevo.

**Deshacer**: `git revert <commit>` devuelve el `CLAUDE.md` antiguo. Nada de la app depende de estos
ficheros (solo los lee Claude, y el asistente de WhatsApp por `grep`).

## 4. Prueba de aceptación

Se hace en una **sesión nueva** abierta en una copia que esté FUERA de la carpeta del repo (una sesión
abierta dentro de `.claude/worktrees/` cargaría también el `CLAUDE.md` del repo principal, que es su
carpeta padre) y **SIN git**: la app de escritorio, al abrir una sesión en una copia de git con cambios
sin commit, los guarda aparte con un `stash` («epitaxy: pre-switch from HEAD») y la sesión arranca con
el `CLAUDE.md` antiguo — pasó el 07/10/2026 con la primera copia de prueba. La copia sin git se monta
con `git archive HEAD -- implementation scripts skills .claude .gitignore package.json | tar -x`
más los ficheros nuevos. Para registrar qué instrucciones se cargan, `.claude/settings.local.json` (no se sube)
puede llevar un hook `InstructionsLoaded` que las apunte en `.claude/instrucciones-cargadas.log`.

| # | Qué se hace | Qué tiene que salir |
|---|---|---|
| 1 | `/context` nada más abrir | En **Memory files**, unos pocos miles de tokens (no 512.000) |
| 2 | «Lee con Read las 10 primeras líneas de `implementation/backend/services/placaOcrService.js`. No cambies nada. ¿Qué reglas de `.claude/rules` se te han cargado y qué documentos te ha sugerido el hook?» | Se cargan `placas-catalogos` (y `transversal-backend`, `infra`); el hook lista los tres documentos de placas |
| 3 | «Sin tocar nada: ¿qué precio CAE al cliente lleva una propuesta nueva, por qué no se cambia el de los expedientes ya firmados y dónde se sella? Dime de qué documento lo sacas.» | 100 €/MWh las nuevas; las anteriores se leen con el respaldo (95 · 60 RES080); se sella copiando `caePriceClient` a `cae_client_rate` (`precioCae.js`). Cita el documento de `calculo/` |
| 4 | «Lanza a la vez dos subagentes general-purpose con modelo haiku: uno que diga qué regla numerada prohíbe usar axios con el Catastro y otro qué hay que ejecutar tras tocar el CIFO. Que busquen en `.claude/rules` y `docs/conocimiento`.» | Los dos arrancan (antes: «Prompt is too long») y contestan regla 15 y `check_cifo_paginas.mjs` |
| 5 | (como audio) «eh, mírame el veintiséis RES cero sesenta ciento ochenta y siete que dice el instalador que no le deja firmar el CIFO, pero solo míralo, no toques nada» | Lo entiende como `26RES060_187`, solo lectura, y dice qué ha entendido antes de mirar |

### Resultados (07/10/2026)

La misma petición —«dos subagentes: los CEE de certificadores externos pendientes de revisar, y los
expedientes aceptados sin iniciar»— en una sesión con el `CLAUDE.md` antiguo y en otra con el nuevo:

| | `CLAUDE.md` antiguo (1,1 MB) | Tres niveles (9,8 KB) |
|---|---|---|
| Instrucciones al arrancar | el fichero entero | solo `CLAUDE.md` (registro `InstructionsLoaded`) |
| Reglas cargadas solas | — | `seguimiento` y `transversal-backend`, al abrir su código (`path_glob_match`) |
| Tokens del subagente «CEE pendientes» | 605.109 | **134.687** |
| Tokens del subagente «aceptados sin iniciar» | 622.871 | **109.428** |
| Total de los dos subagentes | 1.227.980 | **244.115 (−80 %)** |
| Tiempo | 83 s + 111 s | 97 s + 90 s |
| CEE pendientes | los 9 correctos | los mismos 9 |
| Aceptados sin iniciar | 16 (criterio del radar, con el material para el CEE de cada uno) | 19 (estado visible ACEPTADA; los 3 que traen el CEE del cliente, marcados como dudosos) y una oportunidad ACEPTADA sin expediente que el otro no vio |
| Fallos | — | el resumen dijo «6 de Raquel y 3 de Luis» con una tabla de 5 y 4 |

Lo que se perdió —el material para el CEE de cada expediente y dos dudas concretas que estaban escritas
en el `CLAUDE.md` antiguo— no era que faltara: estaba en `docs/conocimiento/seguimiento/`, pero nadie
le dijo al subagente que empezara por ahí. Para eso se añadió al `CLAUDE.md` la tabla «Por dónde
empezar según la pregunta», la regla de usar el criterio que ya calcula la app (y contar los totales
sobre la tabla), y que el encargo del subagente diga qué documentos leer primero.

**Segunda prueba, con esa tabla** (misma petición, sesión nueva):

| | `CLAUDE.md` antiguo | Tres niveles + tabla |
|---|---|---|
| Reglas cargadas solas | — | `seguimiento` y `transversal-backend` en CADA subagente, y `oportunidades` |
| Tokens de los dos subagentes | 1.227.980 | **258.711 (−79 %)** |
| Tiempo | 83 s + 111 s | 69 s + 129 s |
| CEE pendientes | 9 · 5 de Raquel y 4 de Luis | los mismos 9 · 5 y 4, bien contados |
| Aceptados sin iniciar | 16, con el material para el CEE | los mismos 16 con el criterio del radar, el material y «lo siguiente para arrancar» (5 listos para encargar, 11 a falta de material) |
| Hallazgos de más | dos dudas sobre 26RES080_82 y 26RES080_85 | la oportunidad OP16 duplicada del 26RES060_112 y un expediente a nombre de un edificio (posible bloque) |

El resultado de fondo coincide, y la parte accionable sale mejor. Las dudas «de más» cambian de una
ejecución a otra en las dos versiones (la primera prueba nueva sí avisó de los `.xml` que faltan): es
variación del modelo, no conocimiento perdido.

### Segunda tanda (07/10/2026, 14:12-14:21): cambiar código, preguntas y haiku + dictado

Tres sesiones nuevas en la copia sin git, con el registro `InstructionsLoaded` puesto. Cada una
arrancó solo con el `CLAUDE.md` nuevo: ~87.000 tokens de contexto en el primer turno, casi todo
herramientas y sistema (con el antiguo, el `CLAUDE.md` solo ya eran ~490.000).

| Prueba | Qué pasó | Veredicto |
|---|---|---|
| **Cambiar código**: «añade `GET /api/clientes/:id/resumen`, hazla como se hace aquí y documéntala» | Al abrir `routes/clientes.js` se cargaron solas `clientes` y `transversal-backend`, y el hook de lectura sugirió documentos. Reutilizó `cargarRelaciones` (la misma carga del listado y de WhatsApp), `staffOnly`, 503 y no ceros con la BD caída (regla 38), pasó `auditar_rutas_sin_guardian.js` y una prueba con Supabase simulado, y documentó en `docs/conocimiento/clientes/` con sus «REGLA —», que el script copió a la regla del área y al índice. Le quitó la cabecera generada al documento nuevo, porque `migrar --forzar` borra los que la llevan | ✓ |
| **Tres preguntas** (Catastro en paralelo · reparto de la caldera en la medida de un RES093 · qué D_ACS usa el CIFO) | Las tres bien y con su fuente: regla 17 (nunca `Promise.all`), `100 − C_b` con el caso 26RES093_8 y la regla 8.b, y la del CEE INICIAL (regla 12.f) | ✓ |
| **Haiku + dictado**: dos subagentes a la vez (uno `claude-code-guide`, otro `general-purpose` con haiku) y «mírame el veintiséis RES cero noventa y tres nueve, solo mirar» | Los dos subagentes arrancaron (antes, «Prompt is too long») y contestaron; el de haiku sacó los scripts del Convenio de `documentos.md` y la sesión descartó dos que había metido por una relación indirecta. Entendió `26RES093_9`, probó también `_009`, solo leyó y puso el título de la sesión | ✓ |

Detalles vistos que no impiden aplicarlo:

- **`comprobar` sin git avisa de que casi todos los `paths:` no casan**: lista los ficheros con
  `git ls-files`. En una copia con git solo quedan dos avisos esperados: `envolvente-ce3x` pesa
  106 KB (~30.000 tokens, se paga solo al trabajar en la envolvente) y `skills/alta-aerotermia/**`,
  que aún no está en git.
- **El hook de lectura busca por el NOMBRE del fichero**: para `clientes.js` sugirió un documento de
  CE3X y el de arquitectura, no los de clientes (esos los encontró la sesión por la regla del área).
  Cada lectura le añade ~1,3 s.
- Con el texto PEGADO (no tecleado), la sesión pregunta antes de ejecutar: es la regla del entorno
  para contenido pegado, no del conocimiento. Dictando o escribiendo en el chat no pasa.
