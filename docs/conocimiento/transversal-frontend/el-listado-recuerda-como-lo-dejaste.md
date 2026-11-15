<!-- conocimiento · área: transversal-frontend · origen: sesión 2026-11-04 · las rutas de los enlaces son relativas a la raíz del repo -->

## El listado recuerda cómo lo dejaste (2026-11-04)

Fran, 04/11/2026: «si yo filtro y selecciono un expediente y luego le doy para
atrás, que me siga apareciendo lo mismo, que no tengas que volver a aplicar el
filtro».

Filtrar la cartera de 365 expedientes por un instalador cuesta varios clics
(buscador del instalador, chips de estado, rango de fechas). Hasta ahora todo
eso vivía **solo** en el estado del componente, y la vista se **desmonta** en
cuanto se pulsa su pestaña del menú (`navNonce` en [App.jsx](implementation/frontend/src/App.jsx)
remonta la vista a propósito), se entra por un deep-link o se recarga la página:
el filtro había que volver a ponerlo a mano cada vez. En Oportunidades era peor,
porque abrir una te lleva a la calculadora y eso desmonta el listado entero.

**REGLA — un listado recuerda cómo lo dejaste: búsqueda, filtros y orden.** La
pieza es [utils/memoriaVista.js](implementation/frontend/src/utils/memoriaVista.js)
y es UNA para todas las pantallas:

- `useVistaGuardada(clave)` → lo guardado la última vez, leído **una sola vez al
  montar**. Siembra los `useState`: `useState(memoria.search || '')`.
- `useGuardarVista(clave, { … })` → guarda en cuanto cambia algo. Un `Set` se
  pasa como array (`[...statusSel]`).
- `useScrollLista(clave, enDetalle, listo)` → dónde habías bajado.

Claves en uso: `expedientes`, `oportunidades`, `clientes`, `lotes`,
`cee-directos`.

**REGLA — se guarda CÓMO se mira, nunca lo que se mira.** En la memoria van
cadenas y banderas de filtro; los datos se vuelven a pedir al backend al montar,
como siempre. Nada del negocio se queda en el navegador.

**REGLA — lo que llega por props MANDA sobre lo recordado.** El cuadro de mando
y el parte diario abren el listado con un filtro sembrado (`initialEstados`,
`initialPrioridad`, `initialEstado`): ese gana, y se consume como ya hacía. Si
no, pulsar «14 pendientes de revisión» en el cuadro de mando te dejaría la
pantalla con el filtro de ayer.

**REGLA — la memoria es de la SESIÓN (`sessionStorage`), no del navegador.** Es
la diferencia con las COLUMNAS y sus anchos, que son `localStorage`
(`exp_panel_cols_v1`, `exp_panel_col_widths_v1`): una columna encendida es una
preferencia de pantalla y se quiere para siempre; un filtro de hace tres días
que reaparece solo deja un listado medio vacío y a nadie acordándose de haberlo
puesto. Al cerrar la pestaña se olvida. (El listado de CLIENTES ya guardaba
`tipo`/`estado`/`partner` en `localStorage` desde la regla 73 y **se ha dejado
como estaba**: ahí se añade solo la búsqueda y la página.)

**REGLA — el sitio al que habías bajado se vuelve SOLO al volver de una ficha.**
`recordar()` se llama al abrir la ficha y el valor se **gasta** la primera vez
que la lista vuelve a estar en pantalla. Cambiar de pestaña no apunta nada, así
que se sigue entrando por arriba — que es lo decidido en
[DashboardLayout.jsx](implementation/frontend/src/components/layout/DashboardLayout.jsx)
(«el que scrollea es `<main>`»: el buscador y el resumen tienen que verse al
entrar). Por eso el sitio va en **su propia clave** (`…​.scroll`) y no dentro del
objeto de los filtros, que se reescribe entero cada vez que se toca un filtro y
se lo llevaría por delante.

El que scrollea es el `<main>` del layout, no la ventana: el hook lo busca
subiendo desde el propio listado (`ref={lista.ancla}` en el `<div>` raíz →
`closest('main')`). Y la vuelta se hace en un `useLayoutEffect` **cuando ya hay
filas pintadas** (`listo`), no al montar: sin altura que recorrer, un
`scrollTop` no hace nada.

**REGLA — una página recordada que ya no existe se baja a la última que hay.**
En Clientes y en Oportunidades se recuerda también la página. Si la lista ha
menguado (otro filtro, un dato borrado), una página 7 que ya no existe deja la
tabla **vacía y sin explicación**: se acota contra `totalPages`. Y en
Oportunidades, el efecto que devuelve a la página 1 al cambiar un filtro **no
dispara en el primer render** (`paginaSembrada`), o borraría justo la página que
se acaba de recordar.

### Qué recuerda cada listado

| Listado | Clave | Qué |
|---|---|---|
| Expedientes | `expedientes` | búsqueda, chips de estado, los once filtros de columna, rango de CREADO, ordenación, resumen plegado, scroll |
| Oportunidades | `oportunidades` | los diez filtros, orden por fecha, búsqueda global, página, scroll |
| Clientes | `clientes` | búsqueda y página (tipo/estado/partner siguen en `localStorage`, regla 73) |
| Lotes | `lotes` | filtro de estado (el modo Lotes/Vista S.O. sigue en `localStorage`) |
| CEE directos | `cee-directos` | búsqueda, «ver terminados», filtro de certificador, scroll |

### Tras tocarlo

`npm run build` en `implementation/frontend` (pasa `check-hooks.mjs`) y, en la
app: filtrar → abrir una ficha → volver (el filtro y el sitio siguen ahí) ·
cambiar de pestaña y volver (el filtro sigue, pero se entra por arriba) · F5 (el
filtro sigue) · abrir el listado desde el cuadro de mando (manda su filtro).
