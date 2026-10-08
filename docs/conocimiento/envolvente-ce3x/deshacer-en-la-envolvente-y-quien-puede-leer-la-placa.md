<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## DESHACER en la envolvente, y quién puede leer la placa (2026-09-16)

### La otra cara del autoguardado

En la ventana de la envolvente no hay botón de guardar: se guarda solo con un
freno de 1,2 s, y eso es lo correcto — que alguien se olvide de pulsar no puede
costarle el trabajo. Pero **un error también se guarda solo**: apartar la pared
equivocada, borrar una ventana que costó medir o pulsar «quitar» en el hueco de
al lado se persistía antes de darte cuenta, y la única salida era rehacerlo a
mano.

| Qué | Dónde |
|---|---|
| La pila, el freno y el atajo | [useDeshacer.js](implementation/frontend/src/features/cee-envolvente/logic/useDeshacer.js) |
| Volver a montar el plano con otro trabajo | `restaurar` / `sembrar` en [usePlanoEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/usePlanoEnvolvente.js) |
| Los botones | `Paso` en [PestanasCe3x.jsx](implementation/frontend/src/features/cee-envolvente/components/PestanasCe3x.jsx) |
| Prueba de la mecánica | `node implementation/backend/scripts/test_deshacer.mjs` |

**REGLA — se deshacen el PLANO y los AJUSTES a la vez.** Son una sola cosa: se
guardan en el mismo documento (`cee.envolvente`) y se cargan juntos. Deshacer uno
sin el otro dejaría el expediente diciendo dos cosas.

**REGLA — restaurar es SEMBRAR con otro trabajo.** No se guardan copias del mapa
de muros: se vuelve a montar desde la geometría y se le pone encima el trabajo de
ese paso, con la MISMA función que siembra al abrir. Así solo hay una forma de
leer un trabajo — la del fichero— y un campo nuevo no se queda fuera al deshacer.
⚠️ Al restaurar NO se mira el `localStorage`: ahí está lo ÚLTIMO, que es justo de
lo que se quiere volver, y leerlo dejaría el botón sin efecto.

**REGLA — lo que evita el BUCLE es el dedupe, no una bandera.** Al restaurar, la
vista cambia de estado y el efecto se vuelve a disparar con el estado restaurado;
como su huella ya es la de `pila[pos]`, no se apunta nada. Sin eso, deshacer
apuntaría un paso nuevo y no se podría salir. Vigilado: cien disparos con el
mismo estado no mueven la pila.

**REGLA — la SELECCIÓN no gasta un paso.** `sel` es dónde se está mirando, no
trabajo: contándolo, pulsar una pared sería un paso y Ctrl+Z te devolvería la
selección anterior en vez de deshacer lo que hiciste. Es el mismo criterio que
`hayCambios` al cerrar la pestaña. Dentro de la foto sí viaja y se restaura: es
dónde estabas cuando hiciste ese cambio.

**REGLA — Ctrl+Z NO se intercepta dentro de un campo de texto.** Ahí es el del
navegador y deshace lo que estás escribiendo, que es lo que uno espera.
Robárselo para tirar del histórico de la app sería peor que no tener atajo — para
eso está el botón, que además funciona desde cualquiera de las ventanas.

El freno de **700 ms** es lo que convierte un cambio en un PASO: sin él, teclear
«150» en los litros del depósito serían tres pasos y habría que pulsar deshacer
tres veces para quitar un número. Y el histórico se corta en **60 pasos** (~2 KB
cada uno, en memoria, nunca se escriben): esto resuelve el resbalón de hace un
minuto, no un control de versiones.

Los botones van en la **barra de apartados**, no en la cabecera del plano: el
resbalón se comete en cualquiera de las ventanas —también tecleando en
Instalaciones— y la cabecera solo se ve en la del plano. Salen **deshabilitados,
no escondidos**: que estén ahí en gris es lo que dice que ya no queda nada que
deshacer.

### Y la ventana se repintaba sin parar (2026-10-08)

**REGLA — lo que devuelve `useDeshacer` va MEMORIZADO.** La vista lo mete en la
barra de apartados (`barra` es un `useMemo` que se le pasa a la ventana con
`onPestanas`, que es un `setState` del padre). Devolvía un literal nuevo en cada
render, así que la barra «cambiaba» siempre, el padre volvía a pintar, la vista
con él, y otra vez: un bucle **sin fin desde que se abría la ventana**. Medido en
26RES060_188 con la ventana quieta: **252 renders en 5 s** (~50 por segundo, sin
parar) y «Maximum update depth exceeded» 20-40 veces en la consola; con el objeto
memorizado, **0 renders** en reposo. Cualquier cosa que viaje a la barra de
apartados tiene que ser estable por la misma razón: `ir` ya era un `useCallback`.
Tras tocarlo: `node implementation/backend/scripts/test_deshacer.mjs`.

De paso se vio que **abrir la ventana guarda el trabajo una vez**: el
autoguardado compara con `ultimo`, que nace vacío, así que el primer PUT sale
siempre. Es la MISMA copia que se acaba de leer (medido: solo cambia
`guardado_at`, que no usa nadie más que un `console.log`), así que se deja así.
