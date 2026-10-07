<!-- conocimiento · área: placas-catalogos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El CATÁLOGO DE VENTANAS — marcos y vidrios (2026-09-07)

El otro equipo que un RES080 tiene que justificar. Gemelo del catálogo de
`aerotermia`: se elige el modelo y el expediente se rellena solo con **Uf** (marco)
y **Ug + factor solar + composición** (vidrio), y su **ficha técnica se adjunta al
certificado RES080** como anexo, sin buscarla a mano.

| Qué | Dónde |
|---|---|
| Esquema + siembra | `scripts/ventanas_catalogo.sql` — tablas `ventanas_marcos` y `ventanas_cristales` |
| Rutas | [routes/ventanas.js](implementation/backend/routes/ventanas.js) — `/api/ventanas/marcos` · `/cristales` |
| Normalización, etiquetas y volcado al expediente | [logic/ventanasCatalogo.js](implementation/frontend/src/features/expedientes/logic/ventanasCatalogo.js) |
| Huecos de ficha del RES080 (`marco` · `cristal`) | `resolveEnvolventeFichaSlots` en [logic/fichasTecnicas.js](implementation/frontend/src/features/expedientes/logic/fichasTecnicas.js) |
| La ficha del expediente VUELVE al catálogo | [services/catalogoFichas.js](implementation/backend/services/catalogoFichas.js) |
| Pestaña propia (staff) | `features/ventanas/views/VentanasView.jsx` |
| Pruebas | `node scripts/test_catalogo_ventanas.js` · `node scripts/test_ficha_ventana_drive.js` |

**POR QUÉ EXISTE.** Las listas de marcas y modelos vivían en el `localStorage` del
navegador —no se compartían entre usuarios ni entre ordenadores— y el Uf, el Ug y
el factor solar nacían con tres valores fijos: **2,7 · 1,3 · 0,43**. Medido sobre
los 25 RES080 con la envolvente rellena, esos tres números aparecen tal cual en
varios expedientes, que es lo que pasa cuando un valor por defecto parece medido y
no obliga a mirar la ficha. Ahora **nacen vacíos**: se eligen del catálogo o se
teclean, y un hueco se ve.

**REGLA — la MARCA es el fabricante del SISTEMA; el CARPINTERO va aparte.**
«Aluminios Manzanares S.L.» no es una marca de perfil: es quien fabrica y monta la
ventana con perfil de Cortizo o de Kömmerling. En **9 de los 25** RES080 el campo
`marco_nuevo_marca` llevaba la carpintería, así que el certificado declaraba como
fabricante del sistema a una carpintería de pueblo y el Uf no se podía contrastar
con ninguna ficha. El expediente guarda ahora los dos: `marco_nuevo_marca` (del
catálogo) y **`marco_carpinteria`** (texto libre). El certificado imprime la fila
"Carpintería que la fabrica y monta" solo cuando difiere de la marca — decirlo dos
veces sería ruido. Los 9 históricos se separaron con
`scripts/separar_carpinteria_de_marca_ventana.sql`, dejando la marca VACÍA: de
esos expedientes no consta qué sistema se instaló, y adivinarlo (PLANIA es de
STRUGAL, A.61 RPT de SIMER) sería meter en un certificado una marca sin comprobar.

**REGLA — el Uf es de la serie EN SU APERTURA, no de la serie.** Por eso una fila
por (marca, serie, **apertura**): la STRUGAL PLANIA da 1,30 en doble junta, 1,25 en
triple y 1,10 con refuerzo con rotura; la Cortizo A70 abisagrada, 1,30, y la C70
corredera, 1,80. Una fila por serie autorrellenaría el Uf de la tipología
equivocada, que es justo el error que el catálogo viene a evitar.

**REGLA — el Ug es de la capa MÁS la composición.** Una fila por (fabricante,
gama, **composición**): el mismo Guardian Sun da Ug 1,3 en 4/16/4 con aire y 1,0
con argón. Es también como están nombradas las fichas de "02. CRISTALES".

**REGLA — un valor que no está ESCRITO en la ficha no se siembra.** La siembra sale
de leer las 107 fichas del Drive: `validado` solo va a `true` cuando el Uf o el Ug
están dentro del documento. En los 8 marcos cuya ficha solo declara el **Uw** (o lo
lleva únicamente en el nombre del fichero, como "S53RP Y VALOR Uf 1.59"), el campo
queda a NULL y la nota dice dónde mirar. Un número tomado del nombre de un PDF
acaba impreso en un certificado sin que nadie lo haya comprobado. Estado actual:
**22 marcos** (14 con Uf verificado) y **22 vidrios** (todos verificados).

**REGLA — un modelo SIN el dato no PISA lo que ya hubiera escrito.** `aplicarMarco`
omite `marco_nuevo_transmitancia` cuando el catálogo no tiene Uf, en vez de poner
un cero. El selector avisa en la propia fila ("Falta el Uf") y ofrece completarlo
allí mismo: se teclea una vez, con la ficha delante, y queda para todos los
expedientes que vengan detrás (`PATCH /api/ventanas/:tipo/:id`, que **no** pasa por
el payload completo del PUT y por eso no borra la ficha ni las notas).

**REGLA — se busca SIN TILDES, y por eso el listado viene entero.** "kommerling"
tiene que encontrar "KÖMMERLING", y un `ilike` en SQL no lo hace: la ruta devuelve
las decenas de filas y el filtro vive en el navegador (`norm()` con NFD, como el
resto de buscadores de la app).

**REGLA — dar de alta y editar es `staffOnly`; BORRAR es `adminOnly`.** Aquí no hay
ni un euro: son datos técnicos que se teclean con la ficha delante, y quien rellena
el expediente es a menudo un TRABAJADOR. Si el alta exigiera un ADMIN, el modelo no
se daría de alta — se escribiría a mano en el expediente y el catálogo seguiría
vacío. Un borrado sí se lleva por delante la ficha de los expedientes que lo citen.

**REGLA — el alta DESDE UN EXPEDIENTE es idempotente** (`upsertar: true`): el mismo
modelo se puede estar dando de alta desde dos expedientes a la vez, y chocar con la
clave única a mitad de rellenar la envolvente es un callejón sin salida. Desde la
pestaña del catálogo NO se upserta: allí el 409 es un aviso útil, porque quien
teclea está mirando la lista.

### La ficha que se sube a un expediente VUELVE al catálogo

Vale también para la **aerotermia** (y para su ficha EPREL). La ficha aparece casi
siempre por ese lado: alguien la busca para UNA obra y la sube ahí; sin el camino
de vuelta, el hueco del modelo se queda vacío para siempre.

**REGLA — se PROPONE, nunca se escribe en silencio.** Al elegir el fichero salta
`GuardarEnCatalogoGate`: la casilla nace **marcada** si el modelo no tiene ficha y
**desmarcada** si ya la tiene, diciendo que la sustituye. Sin modelo del catálogo
detrás no hay puerta —no hay a quién guardársela— y la subida sigue directa.

**REGLA — el fichero del catálogo NO puede vivir dentro de la carpeta de un
expediente.** Ahí lo puede mover o borrar cualquiera que ordene ese expediente, y
la auto-copia dejaría de funcionar para todos los demás sin que nadie se entere. Se
copia a `06. CALIDAD/01. FICHAS TECNICAS AEROTERMIA`, `…/06. VENTANAS/01. MARCOS` o
`…/02. CRISTALES` (ids con variable de entorno y valor de respaldo, mismo criterio
que la carpeta de producción de los CEE directos). La ficha anterior se **archiva
en OLD**, no se borra: es la prueba de un dato que puede estar ya impreso.

### Los huecos de ficha del RES080

`resolveEnvolventeFichaSlots(expediente)` añade dos huecos —`marco` y `cristal`— a
los de la bomba de calor, **solo si el expediente declara que sustituye ventanas**.
En un RES080 de cubierta no hay carpintería que justificar, y un hueco vacío
permanente en la hoja de anexos se lee como un documento que falta.

⚠️ `ftAttachmentSlots(instalacion, expediente)` recibe el expediente **entero**
(la envolvente vive en `documentacion`, que `instalacion` no ve). El CIFO lo llama
SIN ese segundo argumento y por eso no ve los huecos de envolvente, aunque comparta
el estado de anexos con el RES080 en `DocumentacionModule`.

Nombres canónicos en Drive: `{nº} - FT MARCO VENTANA.pdf` y `{nº} - FT VIDRIO.pdf`
(sin "AEROTERMIA": se archivan en la misma carpeta y el nombre es lo que las
distingue). Campos: `documentacion.ft_marco_link` / `ft_cristal_link`.
