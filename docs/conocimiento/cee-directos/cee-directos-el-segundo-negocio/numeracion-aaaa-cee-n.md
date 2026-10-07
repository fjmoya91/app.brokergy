<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Numeración — `{AAAA}CEE_{n}`

Año a **CUATRO** dígitos (no como el CAE) y correlativo **GLOBAL**: no se reinicia en
enero (2025CEE_44 → 2026CEE_45). El siguiente sale de
`cee_directo_siguiente_correlativo()`, que **bloquea la tabla**: dos altas leyendo
`MAX+1` desde Node sacarían el mismo número.

En modo manual, un número ya usado **se bloquea** y se dice quién lo tiene, avisando
en el propio formulario y no al pulsar "Crear". El histórico arrastra un `2025CEE_18`
**duplicado** (Alfredo Castellanos y Vasil Marinov), así que el índice único es
**PARCIAL** (`WHERE NOT duplicado_historico`): protege todo lo demás sin obligar a
renumerar el expediente de nadie.
