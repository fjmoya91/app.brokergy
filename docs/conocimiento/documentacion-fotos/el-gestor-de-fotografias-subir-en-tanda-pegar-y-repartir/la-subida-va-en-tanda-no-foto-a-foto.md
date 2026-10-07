<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### La subida va en TANDA, no foto a foto

Cada foto era su propio POST, y ese POST le pedía a Drive **tres cosas antes de
mover un solo byte**: buscar la subcarpeta, listar el slot para calcular el índice
`_N` y —en un apartado de una sola foto— listar otra vez para borrar la anterior.
Ocho fotos eran ~24 idas y vueltas a Google, **en serie**, porque dos subidas a la
vez calculaban el mismo índice y se pisaban el nombre.

**REGLA — se lista Drive UNA vez por tanda, se reservan los índices y se sube en
paralelo.** Con el listado ya en la mano, el índice de las N fotos se reparte de
una vez y el borrado del slot único no cuesta una segunda consulta. Medido por el
test: de 3 listados + 3 subidas en serie a **1 listado + 3 subidas concurrentes**
(tope de 4 a la vez: más no acelera y sí arriesga un 429 de Drive).

**REGLA — la subcarpeta se resuelve una vez POR PROCESO** (`ensureSubfolderId`).
`subfolderIdCached` solo BUSCA, y en una carpeta recién creada devuelve null, así
que la ruta caía en `getOrCreateSubfolder` a pelo en cada foto. ⚠️ El respaldo de
esa función es devolver el PADRE cuando falla: ese caso no se cachea, o un fallo
puntual de Drive dejaría todas las fotos del proceso cayendo en la raíz.

**REGLA — las dos rutas comparten la MISMA función.** `/:slot` (un fichero) sigue
viva —la usan los navegadores sin refrescar y el gestor del Anexo Fotográfico— y
delega igual que `/batch`: si cada una nombrara el fichero por su cuenta, la misma
foto acabaría con un nombre distinto según por dónde entre.

**REGLA — una tanda a medias se responde 200 con el parcial.** Lo que ya está en
Drive no puede presentarse como si no hubiera pasado nada: vuelven `items` y
`fallidas`, la pantalla conserva lo subido y dice cuántas se quedaron fuera. Solo
si no entra NINGUNA es un error de verdad.

**La foto se ve puesta ANTES de que responda el servidor.** Se pinta la miniatura
local en gris con su indicador mientras viaja: soltar diez fotos dejaba la tarjeta
exactamente igual durante medio minuto, y eso no se distingue de que no haya
pasado nada. Y el botón dice la fase real — "Preparando 3 de 10…" mientras se
reducen (que no es subir) y luego un porcentaje que ya es **monótono**, porque es
el de una sola petición y no vuelve a cero en cada foto.
