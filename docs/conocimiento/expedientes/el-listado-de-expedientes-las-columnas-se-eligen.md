<!-- conocimiento · área: expedientes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El listado de expedientes: las columnas se ELIGEN (2026-09-15)

La tabla tenía SIETE columnas fijas y escritas a mano en tres sitios distintos
—cabecera, fila de filtros y celdas—, alineados por POSICIÓN: para añadir una
había que tocar los tres y acertar con el orden, y el `hidden lg:table-cell` de
una celda tenía que coincidir con el de su cabecera o la tabla se descuadraba
entera. Por eso no había forma de filtrar por **instalador**, que es la pregunta
que más se hace de una cartera ("¿qué tengo de INSTOTERMA?").

Ahora hay un botón **▦ Columnas · N** que dice cuáles se ven y deja encender o
apagar las que hagan falta, cada una con su propio filtro.

| Qué | Dónde |
|---|---|
| EL REGISTRO — rótulo, ancho, filtro, valor y pintado de cada columna | [logic/expedientesColumnas.jsx](implementation/frontend/src/features/expedientes/logic/expedientesColumnas.jsx) |
| El panel de selección y las vistas de fábrica | [components/ColumnasPicker.jsx](implementation/frontend/src/features/expedientes/components/ColumnasPicker.jsx) |
| La cabecera: ordenar, redimensionar y REORDENAR arrastrando | [components/TablaExpedientesHead.jsx](implementation/frontend/src/features/expedientes/components/TablaExpedientesHead.jsx) |
| El logo de una empresa (o sus iniciales) — compartido con lotes y cuadro de mando | [components/LogoEmpresa.jsx](implementation/frontend/src/components/LogoEmpresa.jsx) |
| Los datos que piden las columnas nuevas | `get_expedientes_list_v4` (`scripts/get_expedientes_list_v4.sql`) |

**REGLA — las columnas son una LISTA DECLARATIVA, no N bloques de JSX copiados.**
Cada una se declara UNA vez y de ahí salen la cabecera, la fila de filtros, las
celdas, el orden y el CSV. Es el mismo criterio que el menú lateral: cuando eran
copias había que tocarlas de una en una y la última nacía ya distinta de sus
hermanas.

**REGLA — `valor()` es lo que la columna DICE y `render()` cómo lo enseña.** El
orden y la exportación usan `valor`, así que una columna que solo defina el
pintado se puede ver pero no ordenar ni exportar: las dos cosas van juntas.

**REGLA — quién puede ver una columna se declara en `roles`, y el backend lo
repite.** La lista es una comodidad de pantalla, nunca el control de acceso — una
key guardada en el navegador sobrevive a un cambio de rol. El **INSTALADOR no se
le enseña al CERTIFICADOR** (regla 48.d: es dato comercial) y la ruta se lo capa
de la respuesta; el **margen** sigue siendo solo de ADMIN, como ya hacía
`stripBrokergyMargin`.

**REGLA — las columnas se REORDENAN arrastrando su cabecera, y el nº de
expediente no se mueve.** Es lo que identifica la fila: con el identificador en
medio de la tabla, las celdas de su izquierda no se sabe de quién son. Lo demás
se coloca como cada uno quiera, y el orden —igual que los anchos— se guarda en su
navegador. "↺ Orden", en el panel de columnas, devuelve el de la app.

**REGLA — el arrastre va con EVENTOS DE PUNTERO, no con el drag&drop de HTML5.**
Tres motivos y el tercero es el que decide: es el mismo mecanismo que el tirador
de ancho que vive dos centímetros a la derecha en ese mismo `<th>`; el "fantasma"
que genera Chrome de una cabecera de 360 px es un rectángulo enorme y translúcido,
mientras que aquí se pinta una etiqueta del tamaño de un dedo; y el drag&drop
nativo **no se puede disparar con eventos sintéticos**, así que un gesto escrito
con él no se puede comprobar ni en un banco de pruebas ni en un navegador
automatizado — se verifica a ojo o no se verifica.

⚠️ Y el auto-desplazamiento va con `setInterval`, **no con `requestAnimationFrame`**:
el navegador lo congela cuando la ventana no está a la vista, así que tampoco se
puede comprobar. Es el mismo tropiezo que el rasterizado de pdf.js (regla 34).

**REGLA — el gesto es TOLERANTE en los dos extremos.** Al llegar al borde, la
tabla **se desplaza sola** (con muchas columnas encendidas hay scroll horizontal y
la columna destino puede estar fuera de la vista: sin eso, llevar una del
principio al final es imposible). Y lo que manda mientras se arrastra es la
posición HORIZONTAL: soltar sobre "Acciones" la deja la última y soltar sobre el
nº de expediente la deja justo detrás de él — si no, el arrastre se queda sin
sitio donde soltar justo en los dos sitios a los que más se mueve.

⚠️ Un arrastre NO puede acabar ordenando la columna: el `click` llega después del
`pointerup` y el navegador no sabe que veníamos de mover algo. Se guarda CUÁNDO
acabó el arrastre (120 ms de ventana), no un booleano — con una bandera, el clic
que se tragaba podía ser el de media hora después sobre otra cabecera.

**REGLA — un filtro activo NO puede esconderse al ocultar su columna.** Al
apagarla se limpia su filtro. Una lista recortada por algo que no se ve en
ninguna parte es la peor forma de quedarse a cero resultados — el mismo problema
que ya resolvía el aviso de "hay N filtros más activos" cuando la tabla
desaparecía.

**REGLA — el filtrado recorre TODAS las columnas, no solo las visibles.** El
panel de filtros del MÓVIL enseña los mismos selectores sin que haya tabla
detrás; que no quede ninguno activo sobre una columna oculta lo garantiza la
regla de arriba.

**REGLA — una columna de FECHA filtra por RANGO, y la fecha se lee en LOCAL.**
`Creado` lleva su desde/hasta como la columna Fecha de Oportunidades
(`filtroDeFecha` en el registro; el ORDEN «más reciente primero» no se declara —
lo da la cabecera para cualquier columna con `valor`). ⚠️ La comparación **nunca**
es `iso.slice(0,10)`: `created_at` viene en UTC, así que un expediente dado de
alta a las 00:30 en España son las 22:30 UTC del día ANTERIOR y se filtraría en
el día que no es — y solo se nota en los extremos del rango, que es justo donde
se mira. Vive en [rangoFecha.js](implementation/frontend/src/features/expedientes/logic/rangoFecha.js),
**fuera del `.jsx`** para poder probarlo desde Node. Los dos extremos son
INCLUSIVOS (quien escribe «hasta el 18» espera ver lo del 18) y una fila **sin
fecha no entra en un rango**: no se sabe si cae dentro, y colarla haría creer que
sí. El popover va PORTALEADO a `body` (regla 29.b): la tabla tiene scroll
horizontal y recortaría un `absolute` justo en las columnas de la derecha, que es
donde viven las fechas. Tras tocarlo:
`node implementation/backend/scripts/test_rango_fecha.mjs`.

**REGLA — la CABECERA ordena, y sin ordenación elegida manda la PRIORIDAD.** La
lista es una cola de trabajo antes que una hoja de cálculo, así que el tercer
clic vuelve al orden de siempre. Lo vacío va SIEMPRE al final, se ordene como se
ordene: un bloque de guiones arriba esconde justo lo que se ha pedido ver.

**REGLA — "Exportar" saca lo que SE ESTÁ VIENDO**: las columnas visibles y las
filas filtradas, con `;` y BOM (mismo criterio que el CSV de venta cruzada). Un
botón que exporta "todo" mientras la pantalla enseña otra cosa es la forma más
fácil de mandar el fichero equivocado.

### Las vistas de fábrica

Un preset es solo una lista de keys, así que no hay nada que mantener aparte. La
primera reproduce EXACTAMENTE la tabla de siempre: nadie debe encontrarse la
pantalla cambiada sin haberla cambiado. La elección se guarda en ESE navegador
(es una preferencia de pantalla, no un dato del negocio).

| Vista | Para qué |
|---|---|
| **Operativa** | La de siempre — expediente · CCAA · estado · ficha · certificador · ⚡€▲ · año |
| **Seguimiento CEE** | En qué fase está cada certificado y desde cuándo |
| **Económica** | Ahorro, bono y margen POR SEPARADO (ordenables), con su lote |
| **Cartera** | Quién trae la obra y a quién llamar: cliente · teléfono · instalador · municipio |

### El LOGO de la empresa, y una sola pieza para pintarlo

Las columnas **Instalador** y **Certificador** llevan el logotipo de la empresa
(`prescriptores.logo_empresa`, que ya viaja en `/api/prescriptores`): en una lista
de 267 filas se reconoce quién trae la obra antes de leer la razón social. Sin
logo —o si no carga— caen a las INICIALES, para que la fila no baile.

**REGLA — el dibujo es UNO**: [components/LogoEmpresa.jsx](implementation/frontend/src/components/LogoEmpresa.jsx).
Había DOS copias con el mismo dibujo (`LogoEmpresa` en los lotes y
`AvatarPartner` en el cuadro de mando) y este era el tercer sitio que lo pedía:
o se escribía la tercera copia o se juntaban. Se juntaron, y las dos PIELES se
conservan en `variante` —el cuadro de mando pinta sus iniciales en el color de
marca y los lotes en gris—, que eso no es algo que unificar a ojo desde aquí.

**En el CERTIFICADOR, el logo solo sustituye a las iniciales cuando existe**: sin
él se conserva el chip con el color de su FICHA, que es como se ha leído siempre
esa columna. Y el logo de un instalador HEREDADO sale atenuado igual que su
nombre, o el logo lo haría pasar por declarado.

⚠️ **Los logos pesan 8 MB y se descargan enteros en cada carga.** Están guardados
como data URL a tamaño de papel (el mayor, **1,97 MB**) porque se imprimen en las
propuestas, y `GET /api/prescriptores` hace `select('*')`: 60 logos × su tamaño
completo para pintarlos a 24 px. Ya era así antes de esto —la vista de
expedientes se los tragaba sin pintar ni uno—, así que pintarlos no cuesta una
petición más; pero la cuenta pendiente es guardar una MINIATURA aparte y que el
listado lea esa.

### La columna INSTALADOR y su cascada

**REGLA — UNA cascada, y la del listado coincide con la de la FICHA.** El primer
escalón es `instalacion.instalador_id`, que es el campo que se edita en
Instalación y lo que se ve al abrir el expediente; si la columna dijera otra cosa
que la ficha sería peor que no tener columna. Detrás van
`expedientes.instalador_asociado_id` y el `prescriptor_id` de su oportunidad,
porque con el primero solo **98 de 267 expedientes saldrían vacíos teniéndolo**
(80 lo declaran solo en la columna —los migrados— y otros tantos lo heredan).

**REGLA — lo HEREDADO se marca.** Sale atenuado y en cursiva, con "heredado de la
oportunidad — la ficha de Instalación no lo declara": es el instalador que
consta, y a la vez lo que hay que corregir en la ficha.

⚠️ En el backend conviven SEIS cascadas distintas para "quién es el instalador"
(`routes/expedientes.js` 302, 1409, 4286, 5452; `routes/lotes.js` 361;
`routes/oportunidades.js` 1656) y **no se han unificado**: de ellas cuelgan
documentos ya emitidos. Esta es la del listado y está declarada en un solo sitio.

### Lo que hacía falta traer — `get_expedientes_list_v4`

Añade sobre v3 **solo lo que alguna columna pinta**, y siempre escalares o JSONB
podados (la regla 22 sigue en pie): `lote_id` + `lote` {codigo, estado, año},
`instalador_asociado_id` + el `prescriptor_id` de la oportunidad, y `seguimiento`
**recortado a las cuatro claves de fase** (el objeto entero pesa 279 kB y trae
tokens de aviso y sellos de migración que el listado no enseña). El payload sube
~40 kB sobre los 1,7 MB de v3.

⚠️ De paso ARREGLA un fallo real: `isLoteable` ya filtraba por `!exp.lote_id` y
ese campo **nunca llegaba**, así que los 45 expedientes ya loteados se ofrecían
como seleccionables y el error solo aparecía al crear el lote (el backend sí lo
rechaza: `loteService.evaluarElegibilidadBase`).
