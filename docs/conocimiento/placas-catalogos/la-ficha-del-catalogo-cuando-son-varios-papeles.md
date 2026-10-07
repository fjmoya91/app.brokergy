<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La ficha del catálogo cuando son VARIOS papeles (2026-09-11)

El catálogo guardaba UNA ficha por modelo y durante mucho tiempo bastó. Dejó de
bastar con el **EPREL**: cuando el SCOP se justifica por ahí, el certificado
necesita **tres documentos** —la ficha del fabricante, la ficha EPREL y la
etiqueta energética— y el catálogo solo aportaba el primero. Así que en cada
expediente con ese equipo alguien buscaba los otros dos y los soltaba a mano en
el gestor de anexos (`LABEL_673322.pdf`, `FICHE_673322_ES.pdf`). Otra vez. Y otra.

Ahora eso se hace **una sola vez**: los anexos ya dados por buenos se unen en un
PDF y ese PDF pasa a ser la ficha del modelo. El siguiente expediente que elija
ese equipo se la copia entera.

| Qué | Dónde |
|---|---|
| Unir, subir al catálogo, sellar el slot y retirar las piezas | [fichaConsolidada.js](implementation/backend/services/fichaConsolidada.js) |
| Ruta | `POST /api/expedientes/:id/fichas-tecnicas/consolidar` (`grupos[]`), **staffOnly** |
| Qué se ofrece y qué se propone marcar | [logic/fichaConsolidable.js](implementation/frontend/src/features/expedientes/logic/fichaConsolidable.js) |
| Popup | `ConsolidarFichaModal.jsx`, desde el gestor de anexos del CIFO y del RES080 |
| Qué trae dentro la ficha del catálogo | `ficha_tecnica_partes` (`scripts/ficha_tecnica_consolidada.sql`) |
| Prueba sin BD, sin Drive y sin tocar el catálogo | `node implementation/backend/scripts/test_ficha_consolidada.mjs` |

**REGLA — un pack POR HUECO, nunca uno para todo.** Un expediente puede llevar la
bomba de calefacción y un equipo de ACS, que son DOS modelos del catálogo: meter la
ficha del segundo dentro de la del primero no estropea un expediente, **estropea el
catálogo**, y de ahí baja a todos los que lleven ese modelo. La ruta recibe
`grupos[]`, uno por hueco con SUS piezas, y los valida TODOS antes de escribir nada
— a mitad de la tanda el catálogo ya estaría escrito y no se puede descubrir ahí que
el segundo hueco no existía.

**REGLA — de quién es cada PDF suelto lo dice una PERSONA.** El EPREL y la etiqueta
pueden ser del equipo de calefacción, del de ACS, o valer para los dos. Con más de un
hueco **nada viene preasignado** y el popup pregunta pieza a pieza; con uno solo no hay
ambigüedad y va todo marcado. Lo que se deja sin asignar se queda como anexo suelto del
expediente y no entra en ningún catálogo. Una pieza puede ir en DOS packs (un documento
que cubre los dos equipos), y entonces solo se retira de la lista si los dos salieron
bien — si no, seguiría haciendo falta suelta para el que falló.

**REGLA — se une EXACTAMENTE lo que va al certificado.** Mismo orden del gestor,
mismos recortes de páginas (`cifo_annex_prefs.excluded`) y el mismo `unirAnexos`
que produce la ficha técnica suelta del paquete E{n}. Si la ficha del catálogo no
fuera página a página el bloque de anexos, el documento suelto y el que va dentro
del certificado dejarían de coincidir — que es lo que compara quien lo verifica.
Por eso el ORDEN no se toca en el popup: se cambia en el gestor, que es donde
manda.

**REGLA — el RECORTE también se guarda, y por sí solo justifica el gesto.** La ficha
del fabricante suele traer treinta páginas de las que valen dos; quitar el resto en el
gestor y guardarla así ahorra ese trabajo a todos los expedientes que vengan detrás.
Por eso un pack de UNA sola pieza vale **si lleva recorte** — y una sola pieza SIN
recorte se bloquea: dejaría la ficha del catálogo igual que está y lo único que haría
es archivar una copia en OLD.

**REGLA — consolidar deja el EXPEDIENTE consolidado también.** El catálogo y el
expediente no pueden contar cosas distintas: si aquí se quedaran las piezas
sueltas, el día que alguien pulse ⟳ en la ficha se traería el conjunto —que ya
lleva el EPREL dentro— y el certificado saldría con el **EPREL dos veces**
(`dedupeByDriveId` no lo ve: son ficheros distintos). Las piezas salen de la
lista de anexos, pero **no se borran de Drive**: son la prueba de lo que se unió.
El slot se sella por el MISMO camino que el botón ⟳ (`asegurarFichaTecnica` con
`force`), para que no haya dos formas de dejarlo.

**REGLA — una pieza que no se puede leer ABORTA.** `fetchAnnexBuffers` se salta
en silencio lo que no baja; aquí no vale: una ficha incompleta subida al catálogo
no se queda en este expediente. Y solo se unen ficheros DE ESTE EXPEDIENTE (el
driveId lo manda el navegador): se comprueba contra los slots de ficha y contra
`cifo_extra_annexes`, mismo criterio que el proxy de contenido de los anexos.

**REGLA — se dice qué trae dentro.** `ficha_tecnica_partes` guarda los METADATOS
del conjunto (nombre de cada pieza, sus páginas y cuándo se unió — regla 21) y el
gestor lo pinta bajo el badge: *"📎 Conjunto de 3 documentos · 5 págs"*. Sin eso,
el siguiente expediente ve "5 págs" y no sabe si el EPREL va dentro sin abrir el
PDF — que es exactamente lo que lleva a subirlo otra vez. Se escribe **siempre**
que se toca `ficha_tecnica`: guardar una ficha suelta lo pone a NULL, porque una
nota de "conjunto" que sobrevive a la ficha que describe miente con toda la
autoridad de un registro. Solo se afirma sobre un fichero que ACABA de salir del
catálogo (`source: 'model'`): sobre uno adoptado de la carpeta del expediente
podría ser una subida a mano con el nombre canónico.

⚠️ El orden de operaciones no es indiferente: **catálogo → slot → retirar piezas**.
Si fallara el sellado del slot, las piezas NO se retiran y la respuesta lo dice
con esas palabras — es el único estado desde el que un ⟳ duplicaría el EPREL.
