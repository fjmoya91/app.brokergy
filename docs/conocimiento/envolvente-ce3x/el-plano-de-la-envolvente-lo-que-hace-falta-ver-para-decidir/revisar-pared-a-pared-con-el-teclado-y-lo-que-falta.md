<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El plano de la envolvente: lo que hace falta VER para decidir (2026-09-13)»; la introducción y el resto, en esta misma carpeta.

## Revisar pared a pared con el TECLADO, y UNA lista de lo que falta (2026-10-29)

**Lo pidió Fran** («¿Qué más cosas mejorarías de la app envolvente para que la usabilidad sea la mejor
posible?» → «todo»). Caso medido: **26RES060_188** (dos plantas, 25 paredes, 12 medidas por confirmar).
Antes, a 1920 px el plano empezaba a ~800 px de la parte de arriba. Encima tenía seis píldoras de
estado, ~30 mandos repetidos por planta y dos filas de Vivienda y Cubierta en cada tarjeta. Ahora
empieza a ~380 px. Se comprobó con `captura.js --auditar` a 1920, 1280 y 1024: **cero botones que se
pisan o se salen**. Quedan dos excepciones:

- el auditor marca los botones del panel de la pared que están dentro de su caja con scroll, porque no
  tiene en cuenta el recorte;
- a 1024 px, la barra de apartados pasa por debajo de «Deshacer», que va `sticky` a propósito.

Son seis cambios.

**REGLA — un atajo NUNCA se roba una tecla.** No actúa:

- dentro de un campo;
- con Ctrl, ⌘ o Alt pulsados (Ctrl+Z es de `useDeshacer`);
- con Intro sobre un botón o un enlace con el foco (Intro es su clic);
- dentro de un `[role="dialog"]`;
- con la pestaña de la envolvente escondida: la ventana no se desmonta, se esconde, y se comprueba con
  `offsetParent`.

Las teclas:

| Tecla | Qué hace |
|---|---|
| **Intro** | La pared queda revisada y se pasa a la siguiente por mirar |
| **→ / ←** | Pared siguiente o anterior: todas, en el orden del plano, sin las apartadas, y da la vuelta |
| **V / P** | Añade una ventana o una puerta a la pared abierta. Va por `anadeHuecoA`, así que en una medianera la pasa a exterior (regla 181) |
| **Supr** | Quita el ÚLTIMO hueco (Ctrl+Z lo devuelve) |
| **A** | Abre el asistente, por el evento `EVENTO_ABRIR_ASISTENTE` |

Una tecla mantenida (`repeat`) no cuenta: si contara, saldrían 20 ventanas.

El orden de las plantas lo da `plano.plantas`, de abajo arriba, no su id en texto: con el id, la
planta 1 salía antes que la baja. `siguientePorMirar` usa el mismo orden, con los números como números
(FBE2 antes que FBE10). El oyente se pone UNA vez y lee el plano por una referencia que se actualiza en
un efecto (`react-hooks/refs` no deja tocarla al pintar).

Fuente única: [atajosPared.js](implementation/frontend/src/features/cee-envolvente/logic/atajosPared.js).
Los atajos también salen listados en la columna (`Atajos`).

**REGLA — lo que falta para generar es UN número y UNA lista, y cada línea lleva a lo suyo.**
`faltaParaGenerar` ([pendientes.js](implementation/frontend/src/features/cee-envolvente/logic/pendientes.js))
junta en una lista:

- la entrada;
- las fachadas sin rumbo;
- lo que dicen las otras pestañas (`construirPestanas`);
- la carpintería sin decir;
- las paredes sin mirar (el MISMO criterio que `resumen.sinTocar`);
- las medidas por confirmar (`pendientesDe`).

`bloquea` es lo que PARA el `.cex`: sin entrada, sin rumbo o un «! falta…». La píldora dice:

- «Faltan N para generar · K lo impiden», si algo bloquea;
- «Quedan N por revisar», si no;
- «✓ Listo para generar», cuando no queda nada.

Lleva dentro la barra de paredes miradas. Cada línea de la lista lleva a su pared, a su pestaña o al
popup de las ventanas. La entrada y la carpintería YA DECIDIDAS siguen en la tira, en neutro: son lo
que se comprueba de un vistazo.

**REGLA — los mandos de TODO el plano van UNA vez, en la barra «Ver».** Son tres, y van en
`MandosComunes`:

- **Equipos**: su tira ya iba una vez;
- **el fondo, Catastro o Satélite**: ya era de la pantalla, porque encenderlo en la baja lo encendía
  también en la primera;
- **Google**.

En cada tarjeta quedan los del gesto sobre ESE plano: Pizarra, Pared nueva y el zoom (`mandosFuera`).
Encender los Equipos desde fuera cierra lo que la tarjeta tuviera abierto, igual que antes. Se ajusta
al pintar, comparando con lo último visto, sin efecto.

**REGLA — Vivienda y Cubierta van PLEGADAS en una línea que dice lo que HAY** («Garaje fuera 139,16 m²
· Porche abierto fuera 5,60 m² · cubierta se conserva»). Pulsarla abre las dos tiras de siempre y
«▴ plegar» las cierra.

Se abren solas mientras se dibuja con ellas (zona, croquis, cubierta, adosado, móvil conectado,
propuesta abierta) o si hay algo que ofrecer: el adosado por delimitar. El texto va en `w-0 flex-1
truncate`. Con solo `truncate`, su ancho mínimo ensanchaba la tarjeta 177 px a 1280 y pisaba la de al
lado.

**REGLA — la leyenda va PLEGADA en la esquina del propio plano** (`LeyendaFlotante`, arriba a la
derecha). Abajo están la brújula y la atribución del PNOA. Plegada es una píldora con cuatro muestras
de color. Si está abierta o plegada se recuerda en `localStorage`, por persona y con `try/catch`: es
una comodidad. La franja de debajo de las tarjetas quedaba fuera de la vista justo cuando se miraba el
plano. La instrucción del modo de dibujo (`AyudaDibujo`) sigue debajo de su plano.

**REGLA — lo que cambia al VOLVER A MEDIR se resalta y se dice.**
[cambiosAlMedir.js](implementation/frontend/src/features/cee-envolvente/logic/cambiosAlMedir.js)
compara las paredes de antes, ya en el lienzo de hoy, con las nuevas, con la traducción de
`identidadParedes`. Saca tres cosas:

- **paredes nuevas**;
- **las que el motor ha renumerado**: por el id de Catastro, porque el nombre puesto a mano lo conserva
  el trabajo;
- **huecos sin pared**.

Se resaltan en el plano (trazo de marca, `animate-pulse`) y se dicen en una línea: «Al volver a medir:
2 paredes nuevas (FBO1, FBO2) · FBS1 ahora es FBS3». Se quitan solos a los 12 s o con su ✕.

No es un cambio:

- **abrir la ventana**: no había nada antes;
- **deshacer**: `restaurar` siembra con `conLocal: false` y no se compara;
- **medir y que salgan las mismas paredes**: así pasó en 26RES060_188 al quitar el almacén, que ya era
  zona.

**REGLA — «Deshacer» dice QUÉ deshace** («Deshacer · V11 añadida a FBE1»; entero en `title`, y
«Rehacer: …»). [describirPaso.js](implementation/frontend/src/features/cee-envolvente/logic/describirPaso.js)
compara las dos FOTOS de la pila:

- **un hueco**, por `uid`: añadida, quitada, movida de una pared a otra, dada por buena o medidas;
- **las listas de paredes**, en este orden: apartada, partición, CAMBIA, revisada;
- **la entrada**;
- **el resto del trabajo**, por su clave, con el nombre de la pared si es de una sola;
- **los ajustes**: «cómo son las ventanas», «las medidas de mejora»…

La selección no es un cambio. Se calcula al MOVERSE por la pila (`sitio`, guardado en el estado
`hist`) y no al pintar, porque leer la pila (un `ref`) al pintar no se puede. Lo que devuelve
`useDeshacer` sigue MEMORIZADO (regla 48.h).

Pruebas (todas puras, en Node):

- `node implementation/backend/scripts/test_atajos_pared.mjs`
- `test_falta_para_generar.mjs`
- `test_cambios_al_medir.mjs`
- `test_describir_paso.mjs`

Y las de siempre de la ventana: `test_deshacer.mjs`, `test_rotulos_plano.mjs` y `test_pizarra.mjs`.
