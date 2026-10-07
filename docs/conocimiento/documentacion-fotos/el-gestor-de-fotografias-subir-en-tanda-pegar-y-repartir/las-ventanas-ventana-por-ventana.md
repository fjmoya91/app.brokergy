<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### Las VENTANAS, ventana por ventana (2026-09-30)

En un RES080 se cambian cinco, ocho, doce ventanas y cada una necesita su foto de
antes y la de después. Iban a granel —dos casillas, todas las de antes y todas las
de después— y ni quien revisa ni el Anexo Fotográfico sabían qué ventana nueva
correspondía a qué ventana vieja. Ahora los dos apartados de ventanas
(`FOTO_VENTANAS_ANTES` / `_DESPUES`) van en **tarjetas, una por ventana**, en el
enlace del cliente (guiado y lista) y en el panel interno.

| Qué | Dónde |
|---|---|
| Reglas: id, nombre, agrupar, progreso, orden del anexo (FUENTE ÚNICA, pura) | [logic/ventanasObra.js](implementation/frontend/src/features/docs/logic/ventanasObra.js) |
| Las tarjetas | [VentanasPorVentana.jsx](implementation/frontend/src/features/docs/VentanasPorVentana.jsx), montadas por `DocsManager` (`ventanasDeSlot`) |
| Guardar al subir · renombrar · reasignar | `subirFicherosASlot({ ventana })` y `actualizarVentanas` en `reformaUploadService` |
| Rutas | `POST /api/public/reforma-docs/:uuid/:slot[/batch]` con `ventana` + `ventanaNombre` · `PATCH /api/public/reforma-docs/:uuid/ventanas?token=` |
| Anexo Fotográfico | `collectPhotoGroups` anota y ordena (`ordenarPorVentana`); las filas llevan `rotulo` |
| Pruebas | `node implementation/backend/scripts/test_ventanas_obra.mjs` · `test_ventanas_subida.js` |

**REGLA — la ventana va EN LA FOTO, no en una lista aparte.** Cada entrada de
`reforma_uploads` lleva `ventana: 'V3'` y `ventana_nombre: 'Cocina'`, junto a su
estado: no hay tabla ni lista que pueda desincronizarse, y una ventana EXISTE cuando
tiene alguna foto. Renombrar escribe en todas sus fotos de los DOS apartados (RPC
`reforma_replace_slot`, como validar). El id **no se reutiliza** al borrar
(`siguienteId`): la 3 sigue siendo la 3, o la foto de después se emparejaría con otra.

**REGLA — en el DESPUÉS, la ventana VIEJA al lado** («Así estaba»): es lo que dice
de qué ventana es la foto que se está haciendo, la haga el cliente, el carpintero o
el equipo. Y el apartado del después **solo está hecho cuando TODAS las ventanas
tienen su foto nueva** (`slotDone` en DocsManager): si no, el recorrido guiado lo
daba por terminado con la primera. Por lo mismo, subir una foto de ventana **no
avanza** el paso guiado (`setPasoKey(slot.key)`): quedan las demás; el botón pasa
a «Ya están todas ›».

**REGLA — nada se esconde.** Las fotos sin ventana (las de antes de esto, las del
repartidor o del WhatsApp) salen en «fotos sin ventana asignada» con un
desplegable para colocarlas, y una foto que solo está en Drive se da de alta al
asignarla. Un id que no es una ventana se ignora: la foto entra igual, sin ventana.

**El nombre es opcional y de un toque** (`NOMBRES_RAPIDOS`: Salón, Cocina,
Dormitorio…), o tecleado. Mientras no hay ninguna ventana se enseña ya la «Ventana
1» con su botón; al añadir la segunda, la primera se queda (era provisional y
desaparecía). Mobile first: botones de 48 px, campos a 16 px.

**El Anexo Fotográfico las saca en orden de ventana y con su rótulo** («Ventana 2 ·
Cocina», igual en el antes y en el después, numerando las repetidas). El nombre
vigente sale de los DOS apartados (`nombresDeVentanas`). El orden manual del
gestor (`anexo_orden`) sigue mandando si existe.

**«Subir todas a la vez» existe, pero en segundo plano y con la explicación
delante**: *lo ideal es subir cada foto en su ventana, así sabemos cuál es cuál.*
Va debajo de las tarjetas, con un botón que no es el naranja. Lo que hace depende
de la fase, y la pantalla lo dice ANTES de pulsar:
- **Antes**: cada foto pasa a ser una ventana nueva, con números seguidos detrás de
  las que ya tienen foto (`idsParaTanda`; una ventana añadida en pantalla y vacía la
  ocupa la primera foto). Viaja como `ventanas` = JSON `['V3','V4',…]`, una por
  fichero (`ventanasPorFichero` en `subirFicherosASlot`).
- **Después**: no hay forma de saber de qué ventana es cada una, así que entran sin
  ventana y cada foto pregunta **«¿Cuál de estas era?»** enseñando cómo estaba cada
  ventana: se coloca TOCANDO la foto vieja, no eligiendo en un desplegable.
- Las fotos sueltas del antes (repartidor, WhatsApp) tienen además **«Cada foto es
  una ventana distinta»**, que las coloca todas de un toque, en serie.

⚠️ La miniatura dentro de un botón va con `renderMini(slot, it, { soloImagen: true })`:
un botón dentro de otro no es HTML válido.

⚠️ PENDIENTE: el parte diario y «qué falta» siguen contando el apartado del después
como hecho con UNA foto; no saben que a una ventana le falta la suya.
