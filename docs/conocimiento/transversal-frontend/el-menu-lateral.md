<!-- conocimiento · área: transversal-frontend · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El menú lateral (2026-08-24)

Con la pestaña de CEE directos el menú pasó a **diez entradas** y dejó de caber:
medido, el `<aside>` ocupaba los 918 px de la pantalla y su contenido pedía 1035.
Como nada tenía `overflow`, los 117 px sobrantes —el perfil y el botón de Salir—
se **cortaban sin forma de llegar a ellos**.

**REGLA — el que scrollea es el `<nav>`, no el `<aside>`.** Lleva `flex-1 min-h-0
overflow-y-auto`; el `min-h-0` es imprescindible, porque sin él un hijo `flex-1`
no puede encoger y sigue empujando el pie fuera de la vista aunque le pongas
`overflow`. Cabecera y pie van `shrink-0`: son lo único que nunca debe moverse.

**El sitio salía de la cabecera y del pie, no de quitar pestañas**: el logo
ocupaba 176 px (el 19 % de la pantalla) y el pie 197. Ahora 112 y 168, y por
debajo de 820 px de alto el logo encoge solo (`[@media(max-height:820px)]`) —
cada píxel de logo en un portátil es una pestaña que se va detrás del scroll.

**Las entradas son una LISTA DECLARATIVA, no diez botones copiados.** Cuando eran
copias había que tocarlas una a una y la última (CEE directos) nació ya distinta
de sus hermanas. Se agrupan por para-qué sirven —lo del día · Cartera · Fichas ·
Ajustes— y **los rótulos solo salen si el menú es largo** (>6 entradas): a un
partner con tres opciones, tres cabeceras le estorban. Plegado no hay rótulos,
pero se conserva la separación entre grupos: es lo que hace reconocible la forma
del menú de un vistazo.

⚠️ **WhatsApp sigue FUERA del `<nav>`**, entre las pestañas y el perfil, con su
color de estado (regla 13). No moverlo ahí dentro.

### Cerrar sesión — el menú de la cuenta (2026-08-25)

Cerrar sesión vivía SOLO en un botón al fondo del sidebar, que es justo lo que se
salía de la pantalla cuando el menú no cabía. Y aunque quepa, el fondo de una
barra lateral no es donde nadie lo busca: en cualquier app se pulsa el AVATAR.

- **Fuente única**: [UserMenu.jsx](implementation/frontend/src/components/layout/UserMenu.jsx),
  abierto desde los DOS avatares — el bloque de perfil del pie del sidebar (que
  ya no abre la ficha de golpe: abre el menú, y el icono es un chevron, no un
  lápiz) y el avatar de la barra superior del móvil, donde antes había que abrir
  el cajón y bajar hasta el fondo. En móvil es **hoja inferior**, no popover.
- El botón rojo del pie **se conserva** y pasa a decir "Cerrar sesión": es la
  salida de un clic. También hay uno en "Mi perfil" (`AdminProfileModal`, y la
  ficha del partner cuando llega con `onSignOut`), que es donde se acaba cuando
  uno busca su usuario.

**REGLA — `signOut` limpia la sesión local PASE LO QUE PASE.** Era
`return supabase.auth.signOut()` a pelo: si esa llamada falla —token ya caducado
(`session_not_found`), sin red, Auth caído—, supabase-js rechaza y no siempre
limpia su almacenamiento; como el estado de React solo se vaciaba con el evento
`SIGNED_OUT`, que entonces no llega, **pulsar el botón no hacía nada**. Ahora el
`finally` borra el token de axios, la caché de perfil, las claves `sb-*` y el
estado, y limpia el deep-link de la URL (`?tab=`, `?exp=`, `?cee=`) para que la
siguiente sesión no aterrice en el expediente del anterior.
