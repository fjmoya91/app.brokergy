---
name: generar-cee-inicial
description: 'GENERA el CEE INICIAL (.cex de CE3X) de una oportunidad o expediente desde sus FOTOS o un VÍDEO de la vivienda: lee las placas de la caldera y de la aerotermia, cuenta y mide los huecos de cada fachada, los asigna a su pared en el plano del Catastro y escribe el .cex con la aerotermia como MEDIDA DE MEJORA. Con un VÍDEO (casi siempre de dentro) saca el fotograma de cada ventana y deduce a qué pared da; lo que no se puede saber no lo adivina: prepara el WhatsApp al propietario pidiendo esas paredes con su plano en rojo (en seco; se envía solo con tu «sí»). Si faltan fotos de las fachadas, las saca de GOOGLE STREET VIEW (orden `streetview`). Si la aerotermia no está en el catálogo, la da de alta con su ficha, EPREL y Keymark. Úsalo con "genera el CEE inicial de NNN", "hazme el .cex de la OP246", "prepara la envolvente de X con sus fotos / su vídeo", "mete esta aerotermia en el catálogo". Gemelo de `revisar-cee`. Lo leído nace DUDOSO y lo que no se puede afirmar no se inventa.'
---

# Generar el CEE inicial desde las fotos

Deja en **`1. CEE / CEE INICIAL`** el fichero `{nº} - CEE INICIAL_REVISAR.cex`, con la vivienda
dibujada por el Catastro, sus huecos señalados en cada fachada, la caldera actual con la potencia de
su placa y la aerotermia real como **medida de mejora** — y el mismo trabajo guardado en la ventana de
la envolvente (`/envolvente/:id`), donde el certificador lo abre y confirma lo que está en ámbar.

- **Todo sale por las MISMAS funciones que la ventana** (`ceeEnvolventeCex.componerFicha`,
  `senalado.js`, `paredFotoService`, los lectores de placas). El `.cex` de la skill y el del botón no
  pueden diferir.
- **El modelo solo LEE; lo decide el código y una persona.** Cada lectura se contrasta con la foto
  antes de entrar en el plan. Lo leído nace `dudoso` (ámbar en la ventana).
- **No se inventa**: ni el polígono de un garaje, ni un nº de serie manuscrito, ni una potencia que
  la placa no dice. Se deja en blanco y se DICE en el informe final.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`. Motor de envolvente (cee-engine) levantado
  en `CEE_ENGINE_URL` (local: `http://127.0.0.1:8090`; `npm` del backend no lo arranca).
- **El que hace el CEE es el «AGENTE IA», un certificador más.** Sale en la barra de certificadores
  del expediente: al EMPEZAR se marca (`agente_ia.js empezar`) y al ESCRIBIR el `.cex` la fase pasa
  a «pendiente de revisión» y llega un aviso por WhatsApp + email, igual que cuando un técnico sube
  su archivo. Así se sabe siempre si está hecho o no (ver «El agente» más abajo).
- **Dónde se ejecuta — Claude Code o Cowork:** los comandos son los MISMOS y van SIEMPRE en el PC
  (repo + `.env` + motor). En Code, por la shell; en **Cowork, por Desktop Commander, nunca en el
  sandbox**. Rutas, motor y qué hacer si no hay PC: [comun/entorno.md](comun/entorno.md).

## La herramienta

Todo pasa por `implementation/backend/scripts/cee_inicial.js` (desde `implementation/backend`):

| Orden | Qué hace | Escribe |
|---|---|---|
| `estado <clave>` | Lo que hay: RC, zona, caldera, ACS, aerotermia, construcciones, trabajo y `.cex` | nada |
| `placas <clave>` | Lee la placa de la caldera y la de la aerotermia, la casa con el catálogo, contrasta año y combustible con la fila de rendimiento, guarda `placas.json` e imprime el bloque **PARA EL PLAN** | nada |
| `fotos <clave> [--out DIR]` | Baja todas las imágenes de «12. DOCUMENTOS PARA CEE» con su id de Drive | nada |
| `paredes <clave> [--out DIR]` | Mide el edificio (con el **croquis catastral por plantas**), lista paredes/construcciones/cuerpos, dibuja `plano.png` (cartografía), `plano_satelite.png` (paredes sobre la foto aérea) y `satelite.png` (la foto aérea sola, con la fecha del vuelo), y **baja los documentos del Catastro** a `<out>/catastro/` | nada |
| `catastro <clave> [--out DIR] [--refrescar-catastro]` | Solo los **documentos de la Sede del Catastro**: croquis por plantas (PDF), FXCC por plantas (DXF+ASC), KML 3D por plantas y de la parcela, FXCC con colindantes | con `--escribir` (los sube a `1. CEE / CEE INICIAL / CATASTRO`; `aplicar --escribir` ya lo hace solo) |
| `leer-pared <clave> --pared ID --fotos id1,id2` | Inventaria los huecos de una fachada desde su foto (escala por la puerta). Admite un fotograma del vídeo (`--fotos frame:F1`) y una foto de Street View (`--fotos sv:SV1`) | nada |
| `streetview <clave> [--out DIR]` | **Fotos de las fachadas desde Google Street View**: agrupa las paredes en LADOS de la casa (todas las plantas del mismo plano), busca el panorama más cercano DELANTE de cada lado, lo apunta y baja la foto a `<out>/streetview/SV<n>_<rumbo>.jpg` con su fecha, rumbo y oblicuidad. Lista aparte los lados a PATIO (no se ven desde la calle). En el plan van como `sv:SV1`. Clave `GOOGLE_MAPS_KEY`; ~0,007 € por foto | nada (las sube `aplicar --escribir`) |
| `video <clave> [--archivo v.mp4] [--refrescar] [--sin-audio]` | Lee el **VÍDEO** de la vivienda: estancias, plantas, cada hueco con su fotograma, a qué da y **a qué pared va** (o «dudoso»). Saca el **AUDIO** aparte y lo **transcribe con su segundo**: lo que se dice junto a cada ventana cuenta para decidir a qué da, y la hoja de contactos lo lleva de subtítulo. Deja `mosaico.jpg`, la hoja, `audio_1.aac`, `transcripcion.json` y `video.json` con la propuesta para el plan (`frame:H3`). Ver `referencia/video.md` | nada |
| `pedir-fotos <clave> [--paredes …] [--enviar]` | El **WhatsApp al propietario** pidiendo la foto de las paredes que no se han podido resolver, una por lado, numeradas y con su plano en rojo. **En seco** salvo `--enviar` (solo con el «sí» del usuario); al enviar, el CEE queda «esperando las fotos» | con `--enviar` |
| `eprel <modelo>` | Busca el modelo en EPREL y baja su ficha (ES) y su etiqueta | nada |
| `alta-aerotermia --json d.json [--ficha ft.pdf:1,3-4] [--eprel-fiche f.pdf] [--eprel-label l.pdf]` | Da de alta el equipo en el catálogo y guarda la ficha unida en Drive | con `--escribir` |
| `aplicar <clave> --plan plan.json` | Guarda el trabajo, pega las fotos, compone la ficha, escribe el `.cex`, lo guarda en Drive **y avisa** (`--sin-aviso` lo calla). Además lo **califica con CE3X 3.2 en el PC** (≈1 min, sin abrir su ventana) y deja al lado su **`.xml` y su `.pdf` oficial** (`… _REVISAR.xml/.pdf`); `--sin-pdf` lo salta. Si el autoconsumo de algún mes pasa del consumo de ese mes, CE3X lo ajusta y el `.cex` que sube es ESE (punto 13 de «Lo que hay que poner SIEMPRE»). En seco, `--calificar` lo califica y los deja junto a la copia local | con `--escribir` |
| `rehacer <clave> [--plan plan.json]` | **Rehace el CEE sobre lo corregido A MANO en la pizarra** (tras «Así es como está»): imprime la revisión (nota y cambios) y los huecos dibujados que quedan por medir, y aplica el plan sobre el trabajo guardado sin deshacer nada de lo dibujado (ver «Rehacer el CEE tras una corrección A MANO»). Marca la revisión como rehecha | con `--escribir` |
| `instalacion <clave> --plan plan.json` | **Solo lo de las PLACAS a la app** (Instalación del expediente, o inputs de la oportunidad), con el mismo plan que `aplicar`: sin `.cex`, sin Drive, sin aviso al equipo. Para un CEE ya hecho al que le falta la Instalación rellena | con `--escribir` |
| `croquis <clave> [--fase final]` | El **croquis en PDF** de lo que YA hay (trabajo guardado + `.cex` de la carpeta): plano de obra por planta con la marca de BROKERGY, a escala, con muros, huecos, cotas y zonas, y los cuadros de huecos, superficies y cerramientos (sin avisos: vale para una auditoría). `aplicar --escribir` ya lo hace solo | con `--escribir` (sube `… - CEE INICIAL_CROQUIS.pdf` junto al `.cex`) |

Y el **agente** (`implementation/backend/scripts/agente_ia.js`):

| Orden | Qué hace |
|---|---|
| `cola` | Lo que tiene encargado el agente y no ha terminado, y lo que dejó hecho pendiente de revisar |
| `empezar <clave> [--fase final] [--reasignar]` | Pone «AGENTE IA» en la barra de certificadores y la fase «en trabajo» |
| `terminar <clave> [--fase final] [--sin-aviso]` | Solo si el `.cex` se dejó por otro camino: «pendiente de revisión» + aviso |
| `estado <clave>` | Quién es el certificador y qué consta del agente en ese CEE |

`<clave>`: `26RES060_OP246` (oportunidad), `26RES060_186` (expediente) o `2026CEE_55` (CEE directo);
el origen se deduce del formato (`--origen op|cae|cee` lo fuerza). **Sin `--escribir` no se toca
nada**: siempre primero en seco.

## El recorrido

0. **Márcalo: `node scripts/agente_ia.js empezar <clave>`** (en una oportunidad no hace nada: no tiene
   certificador). Si el expediente no tiene técnico, pone **«AGENTE IA»** en la barra y la fase pasa a
   «en trabajo». Si ya tiene un **técnico de verdad** asignado, NO se lo quita: lo dice y el agente le
   prepara el borrador. **Pregunta** entonces si se quiere poner a nombre del agente (`--reasignar`):
   puede que ese técnico sea quien tiene que firmarlo.
   - Si el usuario pregunta «¿qué tienes pendiente?» o «¿está hecho el CEE de X?»: `agente_ia.js cola`
     (o `estado <clave>`).
0. **El título de la sesión, LO PRIMERO: `{nº} - {CLIENTE}`** — p. ej. `2026CEE_61 - JOSÉ ÁNGEL
   VIOLERO MANJAVACAS` (decisión del usuario, 2026-10-02), nunca una descripción de la tarea («CEE
   inicial con versión 3.1»). Lo imprime `estado` («título de la sesión: …»). En Claude Code,
   `set_session_title` con `session_id: "self"`; donde no exista esa herramienta (Cowork), se le dice
   al usuario para que lo ponga a mano. Así se sabe de qué obra es cada conversación.
0. **¿Lo ha mandado por WHATSAPP?** («Ceferino nos ha enviado fotos y vídeo», «lo que ha mandado
   Eladio»: 26RES060_225, _227, _188, 26RES080_92). Antes de nada se lleva a la obra con la skill
   **`alta-oportunidad`** (su apartado `documentar`), que es la que lee el chat: `chats "<nombre>"` →
   `chat <tel> --bajar todo` → mira cada fichero → `documentar --op <nº> --plan docs.json` en seco y
   `--escribir`. Así las fotos y los vídeos quedan en «12. DOCUMENTOS PARA CEE» (calle →
   `FOTO_FACHADA_PRINCIPAL`, patios → `FOTO_PATIOS_INTERIORES`, cualquier vídeo de la casa o de los
   patios → `VIDEO_VIVIENDA`, que es el que lee `video`) y el resto de órdenes los encuentran. **Al
   terminar el CEE, el nº de obra en el nombre del chat**: `renombrar --op <nº> --tel <tel>` (seco y
   `--escribir`); si es el chat del PROPIO cliente y no lleva el prefijo de la casa, con `--anteponer`
   («OP250 Ceferino (Ism)» → «RES060_225 OP250 Ceferino (Ism)»). El título de la sesión sigue siendo
   `{nº} - {CLIENTE}`.
1. **`estado`**. Sin carpeta de Drive no hay dónde dejar el `.cex` (en una oportunidad: guardarla
   desde la calculadora). Si ya hay trabajo guardado, `aplicar` lo conserva y añade encima.
   En un **CEE directo** las fotos están en «4. DOCUMENTACIÓN PARA CEE» (no en «12.»), y no hay
   oportunidad: la instalación actual sale del **cuestionario** del cliente
   (`documentacion.cuestionario`: calefacción, ACS, aires, placas) y se TECLEA en el plan
   (`ajustes.instalacion` / `ajustes.equipos_extra`), con el aviso de que no viene de una placa.
   **La versión de CE3X**: por defecto la **3.2** (la vigente desde el 08/10/2026; la 3.1 ya no
   está en el PC); la 2.3 solo si el usuario la pide expresamente (`ajustes.version_ce3x`). Los
   **Datos generales** de la 3.2 se rellenan con el criterio del punto 16 de «Lo que hay que poner
   SIEMPRE» (plantas sobre y bajo rasante: las del EDIFICIO entero).
2. **`placas`**, y **abre las fotos de las placas** para contrastar marca, modelo, potencia y serie.
   - La CALDERA: la potencia que va al `.cex` es la **útil** (`Pn`, *Output*, *Puissance rendue*),
     no el consumo (`Qn`, *Input*). En una placa policombustible, la del combustible del expediente.
     «Caldaia / Chaudière / Boiler» es la palabra caldera, no la marca: la marca suele estar en el
     frontal (foto de la caldera entera).
   - Un nº de serie manuscrito o cortado **no se escribe**. En CE3X no hace falta.
   - La AEROTERMIA: el código de la placa de la unidad exterior es el que casa con el catálogo. Un
     número de 13 cifras bajo unas barras es el **EAN**, no el nº de serie.
   - **Copia el bloque «PARA EL PLAN»** que imprime (`caldera` con marca, modelo, nº de serie,
     potencia, año y combustible; `placa_aerotermia`; `aerotermia_id` si la placa casa con el
     catálogo), **corrígelo con la foto delante** y añade a `caldera` su `nombre` y `da_acs`. Con eso,
     `aplicar --escribir` lo deja **también escrito en la app** (ver «Lo que se escribe en la app»).
     Un nº de serie DUDOSO sale ya quitado: ponlo solo si en la foto se lee claro.
   - Si dice que **la placa no cuadra con el rendimiento declarado** (año o combustible), NO lo
     cambies: de esa fila sale el ahorro prometido. Dilo en el informe.
3. **Si la aerotermia NO está en el catálogo**, se da de alta (ver `referencia/alta-aerotermia.md`):
   ficha técnica del fabricante (las páginas con el SCOP/η por clima y temperatura), `eprel <modelo>`,
   Keymark si existe. **Nada de valores deducidos**: el SCOP de clima **cálido** a 35 y 55 °C tiene
   que estar escrito en un documento, y SCOP = 2,5·(η+3)/100 tiene que cuadrar (el script lo
   comprueba). Primero en seco, luego `--escribir`. Nace `is_validated: false`.
4. **`fotos`** y **`paredes`**. Mira `plano.png` (norte arriba) junto a las fotos de fachada y patios
   y decide **qué foto es de qué pared**: la calle, el patio, la medianera. Cada planta es una pared
   distinta (`FBE1` planta baja, `F1E1` primera).
   - **ABRE EL CROQUIS CATASTRAL POR PLANTAS** (`<out>/catastro/croquis_por_plantas.pdf`, con Read):
     es el croquis oficial de Catastro, planta a planta, con **cada local dibujado y rotulado** con su
     código y sus m² (`V` vivienda, `AAL` almacén, `AAP` aparcamiento, `C` comercio, `YPO` porche, `TZA`
     terraza, `PTO` patio…). `paredes` lo baja de la Sede junto con su **FXCC** (el mismo croquis en
     DXF+ASC), que el motor YA ha usado: dice qué hay DENTRO de cada cuerpo planta a planta (bloque
     CUERPO) y propone las zonas con sus polígonos EXACTOS. Mira su **fecha** (la imprime `paredes`):
     si las fotos enseñan una obra posterior (un garaje convertido en salón), mandan las fotos, y se dice.
   - Si el croquis catastral está, **lo que dice MANDA**: los cuerpos que «sobran» (`→ sobra en los
     niveles…`) van a `cuerpos_fuera`, y la PROPUESTA marcada «DEL CROQUIS CATASTRAL (exacta)» va a
     **`zonas_fuera` tal cual** (sus m² ya son los de Catastro: no a `croquis`, que los reajusta).
   - **Mira también la VISTA AÉREA**: `satelite.png` (la foto sola, para leer los tejados sin rayas
     encima) y `plano_satelite.png` (las paredes encima). Es la ortofoto del PNOA (IGN), la misma capa
     «◩ Satélite» de la ventana. De ella sale lo que la cartografía no dice:
     · **qué hay al otro lado** de cada pared: calle, patio, piscina, el adosado de al lado o un solar
       (medianera o fachada) — contrástalo con cómo la clasificó Catastro;
     · **dónde está el garaje**: la entrada de coches desde la calle, el vado, un coche aparcado dentro
       de la parcela; y el porche, que a menudo se ve como una cubierta de otro material pegada a la casa;
     · **lo construido que no consta** en Catastro (un cobertizo, una ampliación): dilo en el informe;
     · **la cubierta**: inclinada de teja o plana (azotea), y si lleva **placas** (fotovoltaicas o
       térmicas) — contrástalo con lo que el cliente dijo al aceptar (`confirmacion_cliente`).
   - ⚠️ **La foto NO es una «ortoimagen verdadera»** (lo dice el propio IGN): los tejados altos salen
     **desplazados** respecto a la huella —medido en 26RES060_208: ~2 m en una casa de dos plantas—.
     La foto dice QUÉ hay y DÓNDE aproximadamente; **no se mide con ella**. La geometría es la del
     Catastro y las superficies, las suyas.
   - ⚠️ **Mira la FECHA DEL VUELO** (va en la leyenda y la imprime `paredes`). Una foto anterior a la
     obra o a una ampliación enseña otra casa: si las fotos del cliente contradicen la aérea, mandan
     las del cliente, y se dice.
   - Si NO hay croquis catastral (la Sede no lo da, o «NO cae sobre la parcela») y Catastro mezcla
     vivienda con garaje o porche en el MISMO cuerpo, `paredes` lo avisa (tabla de
     CONSTRUCCIONES por planta). Entonces **propón tú el CROQUIS** (`croquis` en el plan, ver
     `referencia/plan.md`): manchas aproximadas en fracciones de la huella (de oeste a este y de sur a
     norte) de DÓNDE está cada uso. **Los m² los pone Catastro**: el motor endereza las manchas, las
     ajusta a la superficie de cada uso en esa planta y alinea las paredes. Deduce el «dónde» de las
     fotos: en qué extremo de la fachada está la puerta del garaje (mirando la fachada desde la calle,
     derecha e izquierda dependen de hacia dónde mira: compruébalo con el plano), dónde está la
     entrada, qué hay bajo el porche; y de la vista aérea, por qué lado entra el coche. Lanza
     `aplicar` en seco y **mira `plano_plan.png` y `plano_plan_satelite.png`**: el garaje tiene que caer
     del lado de la entrada de coches.
   - Sin croquis catastral, la **PROPUESTA** del motor es una **conjetura geométrica** (garaje contra
     la calle o contra la fachada en cuya foto se vio una puerta de garaje, porche contra el patio,
     almacén al fondo), ya ajustada a los m² de Catastro, con su motivo, su confianza y el `poligono`
     listo para el plan (a `croquis`). Es un PUNTO DE PARTIDA: **contrástala con las fotos y la
     cartografía** antes de copiarla; si no cuadra, dibuja la tuya en fracciones. Medido en
     26RES060_OP267: la conjetura ponía el comercio «al fondo, al norte»; el croquis catastral lo dibuja
     en otro sitio.
   - Si con las fotos no se puede saber dónde está cada uso, **PREGUNTA** con una frase concreta
     («¿el garaje está al norte o al sur?»), o pide al usuario que lo pinte en la ventana
     («✏️ Croquis»). Nunca se inventa la topología; las superficies nunca se inventan: son de Catastro.
4a. **¿Faltan fotos de las FACHADAS?** (`fotos` dice «el expediente no tiene ninguna foto de fachada,
   patios ni ventanas», o faltan lados). **No esperes al cliente: lanza `streetview <clave>`** —es lo
   que se hacía a mano con Google Maps (decisión del usuario, 2026-10-06, 26RES060_OP256)—.
   - **MIRA cada foto** (haz una hoja de contactos y ábrela): la API apunta a la pared, pero **no sabe
     si hay algo delante**. Una casa vecina, una tapia o un coche tapan la nuestra (medido en OP256:
     los cuatro lados al noroeste enseñaban casas vecinas). Descarta lo que no es nuestra casa; la
     buena se reconoce por lo que ya sabes de ella (ladrillo/enfoscado, garaje, nº de portal, tejado).
     «⚠ muy de lado» = escorzo de más de 45°: vale para CONTAR huecos, no para medirlos.
   - **Mira la FECHA del panorama**: si es anterior a una obra o a lo que dicen las fotos del cliente,
     mandan las del cliente, y se dice.
   - Las fotos buenas van al plan como `sv:SV1` en `fotos` (a cada pared del lado que enseñan) y en
     `huecos[].foto` con su `box`. `aplicar --escribir` las sube a «FOTOS ENVOLVENTE» de su pared,
     marcadas como de Street View. Son de Google: apoyo para el CEE, **nunca** se suben a la
     documentación del cliente.
   - **Medir**: la escala de `leer-pared` sale de la puerta de 2,05 m, y una cancela o un porche la
     engañan (en OP256 midió la fachada al doble). Mide tú con el **ancho real del lado** (el de
     Catastro que imprime `streetview`/`paredes`) en píxeles de la foto, y redondea a 5 cm.
   - Los **PATIOS** (y la parte de atrás tapada) no salen en Street View: se piden al cliente
     (`pedir-fotos`) y el `.cex` sale con esas paredes sin huecos, **diciéndolo**.
4b. **¿Hay VÍDEO en vez de (o además de) fotos de las fachadas?** (`estado` lo dice: «vídeos de la
   vivienda: …»; si llegó por WhatsApp, súbelo primero a la obra con `documentar` —paso 0— o, solo para probar, pásalo con `--archivo`). Lánzale **`video`** y sigue
   `referencia/video.md`. En corto:
   - Casi siempre es de DENTRO: el **recuento por planta** sale bien (medido contra el técnico en
     26RES060_197 y _199) y la **pared** solo se decide cuando en esa planta hay UNA fachada que encaje
     con lo que se ve por la ventana (calle frente a patio/parcela). **Mira `mosaico.jpg`** con el plano
     y la vista aérea: si tú lo ves claro, decídelo y dilo en `decisiones`.
   - Lo asignado pasa al plan desde `video.json → propuesta` (`foto: "frame:H3"`): los fotogramas se
     suben a su pared al `aplicar --escribir`.
   - **Lo que no se puede saber NO se adivina**: `pedir-fotos <clave>` (en seco) y **enséñale al
     usuario el mensaje** para que diga si se envía. No escribas el `.cex` con huecos en paredes que no
     sabes: espera a las fotos (el CEE queda «esperando las fotos» en `agente_ia.js cola`).
5. **`leer-pared`** por cada fachada con foto. Es una **propuesta**: la IA confunde a veces una
   máquina exterior con una ventana o se deja un hueco de un balcón. **Cuenta tú los huecos en la
   foto** y usa lo leído solo como apoyo de las medidas (su escala sale de la puerta de 2,05 m, y en
   una foto escorzada es orientativa — lo dice el propio aviso).
6. Escribe el **plan** (`referencia/plan.md`) y lánzalo en seco: **`aplicar --plan`**.
   Incluye siempre **`decisiones`**: frases cortas con el PORQUÉ de lo que no se ve en el plano
   (qué foto usaste para cada fachada, por qué el garaje va ahí, qué descartaste, qué supones). El
   script añade solo el resumen de lo escrito; todo va al sello del agente y se lee en la banda
   «Cómo lo ha hecho» de la ventana de la envolvente (el croquis PDF ya NO las lleva). Revisa la
   ficha que imprime (superficie, plantas, instalaciones, medida) y los avisos. Luego `--escribir`.
   **Con `--escribir` avisa solo**: la fase queda «pendiente de revisión» (si el encargo es del agente)
   y sale el WhatsApp + email al equipo con el `.cex`, **el croquis en PDF** (`… - CEE INICIAL_CROQUIS.pdf`,
   junto al `.cex`: plano de obra por planta con la marca, a escala, y sus cuadros — sin avisos ni ámbar,
   que viven en la ventana), la carpeta y lo que queda por hacer. Si lo
   relanzas en la misma sesión para corregir algo menor, añade `--sin-aviso` (o el usuario recibirá
   otro aviso «actualizado»). Si el aviso falla, el `.cex` ya está guardado: dilo y reintenta con
   `agente_ia.js terminar <clave>`.
7. **Informe final**: el enlace del `.cex` y de la carpeta, y la lista de **lo que queda por hacer**
   (ver abajo). Nunca «listo» a secas: el `.cex` lleva `_REVISAR` porque hay que abrirlo en CE3X.

## Rehacer el CEE tras una corrección A MANO (la pizarra)

Si el plano que dejaste no coincide con la realidad, quien conoce la vivienda lo corrige en la
**pizarra** de la ventana de la envolvente (o del móvil, por el QR): elige un lápiz —muro exterior,
medianera, partición, ventana, puerta, borrar— y raya encima. Al pulsar **«✓ Así es como está»** queda
una REVISIÓN en `cee.envolvente_revision` (nº, quién, nota y la lista de cambios en palabras) y, si lo
marca, te llega la tarea: *«Rehaz el CEE de {nº} con sus cambios del plano»*.

1. `node implementation/backend/scripts/cee_inicial.js rehacer <nº>` (en seco): imprime la revisión
   (nota y cambios) y los huecos **dibujados a mano que quedan por medir** (nacen con un ancho
   aproximado y por confirmar).
2. **Lo dibujado a mano MANDA**: no lo quites, no le cambies el tipo, no le vuelvas a poner huecos.
   Lo único que haces sobre esas paredes es **medir** sus huecos con las fotos (`"medir"` en el plan,
   `referencia/plan.md`). Si un plan lo pisa, `aplicar` **para** y dice por qué (lo comprueba el código,
   `utils/loDibujadoAMano.js`); solo con `"forzar_mano": true` —y solo si el usuario lo pide.
3. `rehacer <nº> --plan plan.json` (con lo medido) y, revisado, `--escribir`. Escribe el `.cex` igual
   que `aplicar` y marca la revisión como **REHECHA** (la ventana deja de decir «Claude lo está
   rehaciendo»). La nota del usuario manda sobre lo que deduzcas de las fotos.
4. Contesta al usuario con lo que has medido y lo que no has podido (una ventana que no sale en
   ninguna foto se queda con la medida aproximada y por confirmar: dilo).

## RES080: el INICIAL y el PREVISTO

En un **RES080** (rehabilitación: ventanas, aislamiento, aires… además o en lugar de la aerotermia)
no basta con el inicial: hay que hacer también el **CEE PREVISTO** — la casa con TODA la obra hecha —
porque el ahorro de la ficha es la diferencia entre los dos. Se hacía a mano (19 RES080 medidos:
Eladio, Laura Millán, Diego Rubio…): copiar el inicial, cambiar lo de la obra y cargarlo en el inicial
como su medida de mejora. Ahora lo hace `aplicar` con el bloque **`previsto`** del plan
(`referencia/plan.md`):

1. **Marca en el plan lo que cambia**: las ventanas con `cambia: true`, las paredes que se aíslan en
   `cambian`, la cubierta en `cubierta_reforma` (salen «- CAMBIA» en el inicial, regla de siempre).
2. **PREGUNTA la U de lo que se aísla** (o el aislante: λ y espesor) — nunca se supone. Las ventanas
   nuevas: de su ficha / catálogo / presupuesto; sin datos, U marco 1,3 · U vidrio 1,3 · g 0,43 ·
   20 % de marco · permeabilidad 3. Ventilación **0,53** y masa **«Ligera»** siempre.
3. `aplicar` en seco con **`--calificar`**: imprime qué ha cambiado de verdad (ventanas, cerramientos
   con su U antes → después), los TEXTOS de la medida, y deja en la copia local el previsto, su
   XML/PDF y el inicial con el previsto dentro («…_CON PREVISTO.cex»). Revisa que el previsto
   califique mejor y que el ahorro sea razonable.
4. Con **`--escribir`**: el inicial va a Drive YA con la medida «Nuevo Edificio Definido por el
   Usuario» calculada por CE3X (con su coste y su plazo); el previsto queda al lado como
   `{nº} - CEE PREVISTO_REVISAR.cex` con su XML y su PDF; y en un expediente su XML se carga en la app
   como el del **CEE FINAL** (sin fechas de visita ni de firma: el previsto no se visita ni se firma).

- La medida del inicial **ES** el previsto: los equipos del previsto salen de las MISMAS medidas de la
  ficha y el motor los escribe con la MISMA función que una medida. No pueden contar dos obras.
- Necesita CE3X 3.2 en el PC (como el XML/PDF). Sin él (`--sin-pdf`), el previsto se guarda pero la
  medida hay que ponerla a mano en CE3X («Cargar edificio») y el XML cargarlo como CEE final: dilo.
- En una **oportunidad** el XML del previsto no se carga (no hay CEE final): se carga al aceptarla.
- **Si el usuario ya revisó el INICIAL** (el `.cex` sin `_REVISAR` de la carpeta, hecho a mano o por
  el técnico), el previsto se hace sobre ESE fichero y no sobre uno regenerado: se pasa a la 3.2
  con `python implementation/cee-engine/tools/convertir_cex.py <inicial>.cex` (por defecto `--a 3.2`;
  deja `<inicial>_v32.cex`; de una 3.1 solo cambia la cabecera) — no cambia el cálculo:
  compruébalo con la calificación — y se le pide el previsto al motor (`/cex/previsto`) con los
  equipos de `medidasCe3x` y el bloque `previsto`, como hace `aplicar`. Caso: 26RES080_87 (se hizo
  pasándolo a la 3.1, la vigente entonces).
- La medida «Nuevo Edificio» del inicial tiene que verse en CE3X como **«Nuevo Edificio Completo»**
  en el árbol de medidas. Si sale «Nuevas Instalaciones», al pulsarla da error: es el fallo
  corregido el 07/10/2026 en `medida_previsto.py` (ver CLAUDE.md, regla 117).

## Reglas que no se rompen

- **Lo dibujado a mano en la pizarra MANDA** sobre las fotos y sobre Catastro: solo se miden sus
  huecos (`medir`). Ver «Rehacer el CEE tras una corrección A MANO».
- **En CE3X 3.x (3.1 y 3.2) las RECOMENDACIONES DE USO van SIEMPRE** (Anexo III, apartado 1,
  «Recomendaciones de uso del edificio o parte del edificio»; decisión del usuario, 2026-10-07). Las
  pone el motor cuando la casilla está vacía, en TODOS los caminos: generar, convertir (de la 2.3 o
  la 3.1 a la 3.2), el previsto, «poner la medida» y el CEE final. Las del técnico, si las
  escribió, no se tocan. En la 3.2 las **medidas de mejora ya no salen en un PDF aparte**: van
  en el Anexo III del propio certificado.
  **Antes de entregar, abre el PDF del certificado y comprueba que ese apartado NO sale en blanco**
  (en 26RES080_87 salió vacío al convertir el inicial revisado: ya está corregido). Si sale vacío,
  no lo des por bueno: dilo.
- **Una ventana con balcón es una BALCONERA**: `ventana` de ~2,10 m de alto, no `puerta` (una puerta
  sale de madera al 90 % de marco; una balconera es un hueco acristalado).
- **Una puerta de patio acristalada** va como `puerta` con `porc_marco` 30-40 y su marco y vidrio.
- **El garaje, un trastero o un porche NO son vivienda**: van al croquis (o a `zonas_fuera`) y sus
  huecos NO se ponen — la puerta del garaje, y también las ventanas que el reparto deje dentro del
  garaje. Un porche abierto es `PORCHE` (exterior), no un espacio no habitable.
- **Contra qué da una pared pegada al VECINO lo decide QUÉ HAY al otro lado** (criterio de Fran,
  2026-10-08). **Primero se mira qué dice Catastro** (uso del colindante, cartografía, croquis por
  plantas) y **luego se CONFIRMA con las imágenes** (fotos, Street View, vista aérea); si no casan,
  mandan las imágenes y se dice:
  - una **casa con habitaciones** (vivienda calefactada) → **MEDIANERA**;
  - una **nave cerrada**, el **garaje** de una casa, un almacén o un trastero → **PARTICIÓN
    VERTICAL** (espacio no habitable): `"tipos": { "FBE1": "PARTICION_VERTICAL" }`;
  - nada construido (calle, patio, solar) → **FACHADA**.
  En las imágenes: la vista aérea (cubierta de chapa o plana de una nave) y Street View (portón de
  nave o de cochera). Caso 26RES060_221: la pared este de la planta baja daba a la nave
  del vecino (Catastro la tenía como fachada y como medianera) → partición vertical. Si no se puede
  saber qué hay, se pregunta en el informe en vez de suponerlo.
- **Las superficies por planta tienen que casar con Catastro**: vivienda + garaje + porche de cada
  planta. Lo comprueba el propio `aplicar` («CROQUIS ajustado … (Catastro …)»).
- **El ACS que da otro aparato** (un termo): la caldera va `da_acs: false` y el termo en `acs_aparte`.
  Sin eso la caldera sale mixta y el termo no aparece. Lo dice el funnel (`boilerAcsType`).
- **En una OPORTUNIDAD, `aplicar` cambia la aerotermia de la simulación** (los mismos campos que
  «Leer la placa» de la calculadora): el SCOP pasa del genérico al del catálogo, así que el
  **resultado de la propuesta queda desfasado** hasta que alguien abra la calculadora y guarde. Se
  anota en el historial y se dice en el informe.
- **En un EXPEDIENTE, `aerotermia_id` del plan SÍ se escribe en su Instalación** (decisión del
  usuario, 2026-10-02), con los MISMOS campos que el desplegable de Instalación: SCOP y temporada por
  la temperatura del emisor y, si el equipo es un CONJUNTO con depósito, el nodo de ACS con su
  SCOP_dhw propio (`nodoAcsDesdeConjunto`). Queda anotado en el historial. Si el expediente ya tenía
  OTRO equipo elegido, no se sustituye sin `"aerotermia_sustituir": true`. Sin placa, el nº de serie
  queda por poner (lo pide el CIFO): dilo en el informe.

### Lo que se escribe en la app (dos pájaros de un tiro)

Lo que la skill ya ha leído y contrastado para el `.cex` queda **escrito también en la app**, para
que al abrir el expediente la pestaña **Instalación** ya esté rellena (decisión del usuario,
2026-10-07). Sale del PLAN —lo revisado—, nunca de una lectura nueva.

- **EXPEDIENTE** → su **Instalación**, por el MISMO servicio que el botón **«✨ Leer placas»**
  (`services/placasInstalacion.js`): marca, modelo, nº de serie y potencia de la **caldera que se
  retira** (también la de ACS si es la misma, y `potencia_caldera`), y el nº de serie de la **ud.
  exterior / interior** si la bomba ya está puesta. Con sus reglas:
  - **Solo HUECOS.** Lo que ya escribió una persona no se toca: sale como `≠ consta «…» · placa «…»`
    y en los avisos. Dilo en el informe para que alguien lo mire.
  - Un **nº de serie dudoso** no se escribe (`serie_dudosa: true` en el plan): se elige en
    «Leer placas» mirando la foto.
  - El **EQUIPO**: si el plan trae `aerotermia_id`, manda el plan (la del PRESUPUESTO) y la placa solo
    lo confirma o lo contradice (aviso). Sin `aerotermia_id`, la placa rellena el hueco; un equipo ya
    elegido solo se sustituye con `"aerotermia_sustituir": true`.
  - La **fila de rendimiento** (y con ella el ahorro) NO se toca nunca: si la placa la contradice en
    año o combustible, se avisa.
  - Queda anotado en el historial («Placas puestas en Instalación por la skill…») y la huella en
    `instalacion.placas_ocr`. En seco se enseña con `+` lo que se escribiría.
- **OPORTUNIDAD** → sus inputs: la caldera a `placa_caldera` (la misma forma que `alta-oportunidad`,
  solo huecos), su potencia a `potenciaCaldera` y la aerotermia a `placa_ocr`. El expediente lo
  **hereda al aceptarse** (`expedienteService`), y la ventana de la envolvente ya lo enseña.
- **CEE directo** → no hay Instalación: va solo al `.cex` (`ajustes.instalacion`), como siempre.
- En el `.cex` la caldera sale con el nombre y la potencia de la **app**; el `nombre`/`potencia_kw` del
  plan solo van como ajuste «a mano» si DIFIEREN de lo que consta allí.

## Lo que hay que poner SIEMPRE (aprendido de las correcciones del usuario)

Antes de escribir el plan, recorre esta lista. Son cosas que el usuario ha tenido que pedir a mano
(26RES060_210, 2026-10-02) y que tienen que salir ya en el primer `.cex`:

1. **La AEROTERMIA del PRESUPUESTO, en el expediente y en el `.cex`.** Sin fotos de placas, el equipo
   que manda es el del presupuesto: búscalo en el catálogo por su CÓDIGO comercial
   («LAVX1123DV» → id 43, ERLA11D2V3 + EBVX11S23DJ6V) y ponlo en `aerotermia_id`. Sin aerotermia en el
   expediente **la medida de mejora no se escribe** (aviso «No consta el equipo nuevo»).
   - **Dónde está el presupuesto — mira SIEMPRE los DOS sitios** (2026-10-08, 26RES060_209): el slot
     `DOC_PRESUPUESTO` de «12.» **y la carpeta `0. PRESUPUESTO` del Drive del expediente**. En el 209 el
     slot solo tenía la cifra estimada (12.000 €, sin partidas) y el presupuesto real del instalador
     —con la máquina— estaba en `0. PRESUPUESTO/PRESUPUESTO DE LA INSTALACIÓN.pdf`. Léelo (PyMuPDF
     saca el texto) y di en el informe de dónde sale el equipo.
   - **`aerotermia_generica` es el ÚLTIMO recurso**: solo si en ninguno de los dos sitios hay un
     presupuesto que nombre la máquina. Si la hay, la medida va con ESA, no con la de la simulación.
   - **En un EXPEDIENTE, `aerotermia_id` no escribe la Instalación** (allí la aerotermia no se toca
     desde `aplicar`). Se pone con `proponerPlacas` ([placasInstalacion.js](../../implementation/backend/services/placasInstalacion.js)),
     la MISMA función del botón «Leer placas»: `equipos.unidades` con los códigos de la ud. exterior e
     interior, `equipoId` del catálogo, primero `simular` y luego `aplicar`. Así el SCOP (por emisor y
     zona) y el bloque de ACS del conjunto salen de las funciones del desplegable. Luego `aplicar` del
     CEE ya la lleva en la medida.
   - **Si el presupuesto nombra solo la EXTERIOR** («MÁQUINA INTERIOR CON ACS» sin modelo) y en el
     catálogo hay varias interiores con ella, **se PREGUNTA cuál** (con la recomendada primero): cada
     una tiene su depósito y su SCOP_dhw. En el 209 se eligió EHVX08S18EJ6V (180 l, id 211).
   - Si hay **dos filas** del mismo equipo, elige la que nombra el presupuesto y, a igualdad, la que
     tenga **SEER** (con suelo radiante o splits la medida declara también el frío, y sin SEER sale
     sin él) y **litros** de depósito.
   - Si el conjunto no tiene litros en el catálogo, sale «SIN acumulación». En Daikin el «S18/S23»
     de la unidad interior son 180/230 l: rellénalo en el catálogo (`litros_acs`) solo si otra fila
     con la MISMA unidad interior lo declara, y dilo en el informe.
2. **La ALTURA DE PLANTA**: el 2,80 por defecto se queda corto en casas de techos altos. Estímala de
   la foto de la fachada con la puerta como escala (2,05-2,20 m): de acera a suelo del balcón es la
   altura de la planta baja. Va en `altura_planta` del plan: el motor MIDE las fachadas con ella y la
   ficha la DECLARA (`ajustes.altura_libre_planta`). Desde la ventana se vuelve a medir con la
   guardada. Ej.: 26RES060_210 → 3,30 m.
3. **LUCERNARIOS**: una foto «de patios» o «de planos» que mira HACIA ARRIBA y enseña una cubierta
   acristalada es un **lucernario** (patio interior cubierto). Va en `lucernarios` del plan, en la
   planta de ARRIBA (su cubierta), con su medida estimada de la foto o de la vista aérea (un rectángulo
   claro en el tejado). Nace dudoso.
4. **AIRE ACONDICIONADO**: si el cliente confirmó al aceptar que tiene aires (`confirmacion_cliente`,
   lo avisa la ficha), pon `"aires": true`. En un CAE va como **«Equipo de sólo refrigeración» —
   máquina frigorífica** (250 %); en un CEE directo, «calefacción y refrigeración» (ahí se sigue
   repartiendo el 100 %). Los aires se QUEDAN en la medida: la aerotermia cubre el frío que no
   cubren ellos. **En un RES060 (cambio de caldera), SIEMPRE «máquina frigorífica» (sólo frío)**,
   sin esperar a su placa (decisión de Fran, 2026-10-07, 26RES060_223):
   `"aires": { "n": <los que dijo el cliente>, "modo": "refrigeracion" }`.
   **Un aire NO cubre la casa** (decisión de Fran, 2026-10-08): cada aparato enfría su estancia,
   **~40 m², entre el 10 % y el 25 % de la vivienda**, y entre todos como mucho el 100 % —se llega
   a partir de 4 en una casa de hasta 160 m²; una más grande necesita más—. Lo que no cubren lo
   pone CE3X con su sistema por defecto. **Potencia de frío de cada uno: 0,1 kW por m² que sirve,
   entre 3 y 5 kW.** Lo calcula `repartoAires` / `potenciaAireKw` (fichaCe3x.js), lo mismo que el
   bloque de la ventana: no pongas `potencia_kw` salvo que haya foto de su placa, que manda.
   Ej.: 1 aire en 233 m² → 17 % (39,6 m²) y 4 kW; 5 aires en 142 m² → 5 × 20 % y 3 kW.
   **Las TRANSMITANCIAS no se tocan en el plan** (desde 2026-10-08): la ficha escribe en «Conocidas»
   las U y masas que CE3X 3.2 pone con «Estimados según antigüedad y zona climática», por la
   normativa del `.cex` y su zona NBE (regla 129, Guía en «03. OPERACIONES / 02. MANUALES»). Solo
   con documentación de la obra (proyecto, cata) se retoca una U, y se dice en el informe.
5. **Una parcela con VARIOS inmuebles** (`paredes` avisa «FLOOR_AREA_MISMATCH» y Catastro declara mucho
   menos que la huella): el edificio no es la vivienda. Mira la lista de inmuebles de la parcela
   (otra vivienda, un garaje de otro titular). Hay que **delimitar la vivienda** («✂ Delimitar adosado»
   en la ventana, `recorte_vivienda`) y, dentro de su planta baja, el garaje/almacén con el **croquis
   «solo enderezar»** (`"croquis_ajustar": false`): el ajuste a Catastro escalaría los m² a la huella
   entera y los inflaría (en 26RES060_210 el almacén de 19 m² salía con 44). Sin saber dónde acaba la
   vivienda, **pregunta** con una propuesta concreta.
6. **Una pared que da a la calle y sale MEDIANERA** (un trozo de fachada que el recorte deja contra el
   resto del edificio): corrígela con `tipos` + `orientaciones` del plan.
7. **Los documentos pueden estar MAL ETIQUETADOS**: un «CEE existente» o unos «planos» pueden ser fotos
   del interior. Míralos todos; lo que enseñan (balconeras del salón, lucernario) sirve igual.
8. **La CALDERA**: si la «placa» es la de la centralita (Vitotronic, Logamatic…), la marca y el
   modelo salen del frontal y la **potencia no consta**: va con 24 kW por defecto y se pide la foto de
   la placa de la propia caldera.
9. **La POTENCIA de cada equipo, también DENTRO de las medidas (CE3X 3.x).** La 3.x la pide por
   servicio a todo equipo que no sea una caldera estimada (aires, aerotermia, termo), y sin ella no
   escribe el XML. El motor la pone en la instalación del edificio **y en los equipos de cada medida**
   (`medidas_equipos_a_31`, desde 2026-10-05: en 2026CEE_58 los siete aires de la medida de
   autoconsumo salían con la potencia en blanco). Si consta de una placa o factura, ponla en el plan
   (`potencia_calefaccion` / `potencia_refrigeracion` / `potencia_acs` en kW de cada equipo de
   `ajustes.equipos_extra`); si no, va por defecto (3 kW calefacción, 2,5 kW frío, o 0,08 kW/m²
   servido) y el aviso lo dice: inclúyelo en el informe.
10. **Varios equipos repartiéndose la calefacción** (caldera + aires en un CEE directo, como en
   2026CEE_60 y 2026CEE_58): reparte el **% y también la SUPERFICIE servida** en la misma proporción
   sobre la superficie del modelo (p. ej. caldera 40 % → 0,4 × 142 m²). Con la superficie entera en
   cada uno CE3X no califica: «la instalación de calefacción cubre una demanda superior al 100 %».
11. **No fuerces `superficie_util_habitable` por debajo de lo medido**: si es menor que la suma de las
   zonas, CE3X no califica («la superficie de las zonas del edificio es mayor que la del edificio»).
   La útil de los planos va en el informe, no en el ajuste.
12. **Califícalo en seco antes de escribir**: `aplicar … --calificar` (CE3X 3.2 en el PC) da la letra
   y los errores de CE3X sin tocar nada en Drive. Sin **fecha de emisión y de visita** CE3X califica
   pero NO escribe el XML («invalid literal for int()»): en un CEE sin visita todavía es lo esperado
   y se dice. Con autoconsumo, lee además la línea «Autoconsumo …» de la salida (punto 13).
13. **Aerotermia + ACS + PLACAS en UNA medida.** Si en la carpeta hay un presupuesto de
   fotovoltaica (p. ej. `OTROS_ANTES__PPTO. FV.pdf` en «12.»), la medida es UN conjunto con todo
   lo que se instala: `"medidas": ["aerotermia_fv"]`, con los kWp del presupuesto × la producción
   de **PVGIS con el tejado real** (coplanar, no los ángulos óptimos) en `ajustes.autoconsumo_kwh`
   / `autoconsumo_pvgis`, y su importe en `ajustes.autoconsumo_inversion`. Cómo, paso a paso:
   `referencia/plan.md` → «Aerotermia + ACS + placas en UNA medida». Busca también el presupuesto
   de la aerotermia: el «aerotermo» que trae es el equipo de ACS aparte.
   - **En la 3.2 la fotovoltaica va SIEMPRE en «Generación renovable eléctrica»** (potencia pico +
     autoconsumo MES A MES; manual, 7.1), nunca en «Contribuciones energéticas» —ni las placas
     ya instaladas ni las de la medida—. El motor ya no la escribe como contribución: sin los doce
     meses (PVGIS no responde) no genera la medida y lo dice.
   - **El autoconsumo de cada mes es lo MENOR entre la producción de PVGIS de ese mes y el consumo
     eléctrico de calefacción + refrigeración + ACS** (y la iluminación fuera del residencial
     privado) **de ese mes** (decisión del usuario, 2026-10-08). La app lo saca del XML del CEE que
     manda (el final si está, si no el inicial) con el reparto mensual de CE3X
     (`autoconsumoMensual.js`); sin XML —lo normal al generar el inicial— va la producción entera
     y se dice. CE3X 3.2 solo calcula con el TOTAL anual, pero AVISA de cada mes que se pasa.
     Medido en 2026CEE_58 (5 kWp): la curva de PVGIS de 8.170 kWh dejaba 6 meses avisados; con la
     regla quedan ~5.717 kWh y el ahorro de la medida baja del 52,8 % al 45,9 %.
   - **Al calificar en el PC lo AJUSTA CE3X** (`--calificar` en seco, y `--escribir`): cada mes
     avisado se recorta al consumo EXACTO que calcula CE3X, se recalcula y se guarda el `.cex` con
     CE3X; ese `.cex` ajustado es el que queda en la copia local y el que sube a Drive (el otro va a
     OLD) con su XML y su PDF. Ya no hace falta mirar a mano si CE3X se queja: **lee la línea
     «Autoconsumo de la medida «…»: en N meses (…) pasaba del consumo … se ha ajustado cada uno a
     su consumo (X → Y kWh)»** y llévala al informe (los kWh declarados y el ahorro que quedan).
   - El **90 % del máximo declarable** sigue valiendo para DIMENSIONAR los kWp; lo que se declara
     cada mes lo decide la regla de arriba.
14. **El CERTIFICADOR — por defecto FIRMA FRAN** (decisión del usuario, 2026-10-06: «ponme como
   certificador a mí siempre a no ser que te indique lo contrario»). Si el plan no dice otra cosa y
   en la barra está el AGENTE IA (o nadie, en una oportunidad), el `.cex` lleva los datos de
   **Francisco Javier Moya López** (`TECNICO_POR_DEFECTO` en `cee_inicial.js`). No hace falta
   ponerlo en el plan. Solo cambia si el usuario lo dice: otro técnico, `"tecnico": "<id_empresa>"`;
   sin técnico, `"tecnico": false`. Un técnico DE VERDAD asignado en la barra (un externo) no se
   sustituye: es quien firma, y el agente no le quita el encargo. La barra no se toca: el agente
   sigue en ella para el seguimiento (si el usuario quiere que conste él en la barra, se asigna en
   la app — el certificador de la casa no recibe aviso).
15. **Un SÓTANO: muros contra el TERRENO y suelos solo de la VIVIENDA** (Fran, 2026-10-01,
   26RES060_191: casa aislada con 19 m² de vivienda bajo rasante junto al garaje).
   - Los muros perimetrales de una planta **bajo rasante** son **«Muro en contacto con el
     terreno»**, nunca medianera ni «partición con el vecino» aunque Catastro tenga la parcela de
     al lado pegada: bajo tierra, al otro lado hay tierra. Las paredes contra el garaje o el almacén
     del propio sótano siguen siendo **partición vertical**.
   - En CE3X ese muro **no admite «Conocidas»** (solo «Estimadas» o «Por defecto»): va **«Por
     defecto»** y la U la pone CE3X por la normativa (CTE 2010, D3 → **0,66**). Sus puentes de
     fachada (pilares, forjado) se quitan con la pared.
   - **El suelo de cada zona es solo su VIVIENDA**: 19 m² de sótano habitable llevan 19 m² de suelo
     contra el terreno, no la huella entera con el garaje (salían 137,65). Y **ninguna «partición
     horizontal inferior»** en la planta más baja (no hay nada debajo) **ni entre dos plantas de
     vivienda** (regla 48.j; los `.cex` del motor anteriores al 21/09/2026 la traen como
     «Garaje/espacio enterrado»). Suelo + particiones inferiores de una zona ≈ su superficie.
   - **El motor aún no escribe el muro con terreno**: tras `aplicar --escribir`, pásalo con el propio
     CE3X — `MUROS=… QUITAR=… SUPERFICIES=… bash run.sh muros_terreno.py` (oráculo,
     `implementation/cee-engine/tools/oraculo_ce3x/`, con un CE3X 3.2 abierto) — y **vuelve a poner
     la medida** (lleva dentro la envolvente de antes) y a calcularla antes de sacar XML y PDF. En
     el informe, qué paredes y qué forjados se cambiaron.
16. **Los DATOS GENERALES de la 3.2** («Ampliación del manual de usuario CE3X», octubre 2026):
   - **Superficie útil** (RD 390/2021): la administrativa, la de lo que se certifica. **Superficie
     de cálculo**: la de los recintos habitables.
   - **Nº de viviendas o unidades de uso** y **plantas habitables**: las de lo que se CERTIFICA (un
     piso de un bloque = 1 vivienda).
   - **Plantas sobre y bajo rasante: las del EDIFICIO ENTERO, de Catastro**, aunque se certifique
     un piso (el ejemplo oficial «Vivienda dentro de bloque» pasa de 1 a 8). La app ya las propone
     así (`plantasDelEdificio`, de los BuildingPart de Catastro): no las bajes a las de la vivienda.
     Si Catastro no las da y salen de las plantas habitables, dilo en el informe.
   - Se corrigen en el plan con `ajustes.ce3x31` (`unidades_uso`, `plantas_sobre_rasante`,
     `plantas_bajo_rasante`, `superficie_util`), con este mismo criterio. En un «Bloque de
     Viviendas» la app no propone las unidades de uso: pon `unidades_uso: 1` si se certifica un piso.
17. **FECHAS de firma y de visita: HOY, por defecto** — Fran lo pide en casi cada CEE («fecha de firma
   hoy», «fecha de visita y firma hoy», «realiza el cee, fecha de hoy»: 26RES060_223, _225, _228,
   26RES080_OP60, 2026CEE_54, 2026CEE_63). El plan lleva SIEMPRE
   `"fechas": { "emision": "<hoy AAAA-MM-DD>", "visita": "<hoy>" }` salvo que diga otra fecha (o que
   aún no se firme: entonces sin `fechas`). `aplicar` solo las usa si el expediente no tiene ya las
   suyas (mandan las del expediente), y sin ellas CE3X 3.x no escribe el XML (punto 12). Dilo en una
   línea en `decisiones` y en el informe.
18. **La MEDIDA DE MEJORA es TODO lo que trae el PRESUPUESTO** (Fran, 26RES060_225: «como medida de
   mejora debe ser lo que aparezca en el presupuesto»). Léelo SIEMPRE (los dos sitios del punto 1) y
   comprueba, partida a partida, que la Instalación del expediente tiene CADA equipo antes de
   escribir: la aerotermia de calefacción, el equipo de ACS aparte (bomba de calor de ACS, termo)
   **con sus LITROS** y la fotovoltaica (→ `aerotermia_fv`, punto 13). Sin los litros el equipo de
   ACS sale «SIN depósito» (lo avisa `aplicar`): en 26RES060_225 el LASIAN ATHERIA 100 («Capacidad:
   100 Litros») se puso en `instalacion.aerotermia_acs.litros` con un `jsonb_set` atómico, como lo
   llevan los demás expedientes (MANANTIAL 110 → 110). El depósito de INERCIA de calefacción no es de
   ACS: no va. Lo que el presupuesto no dice (la potencia de la bomba de ACS) no se inventa: se dice.
19. **Un PATIO que Catastro no dibuja** (26RES060_225: los vídeos enseñan dos patios y Catastro solo
   uno de 6 m²; el otro, la «terraza» del croquis del cliente, lo cuenta como vivienda). La
   superficie NO se recorta (mandan los m² de Catastro); sus huecos van a la fachada de su
   ORIENTACIÓN más probable (la ventana y la puerta de la cocina que dan a poniente → la fachada a
   poniente), en ámbar, con el porqué en `por_que` y en `decisiones`, y se dice en el informe para
   que el certificador lo confirme o lo redibuje con la pizarra. `pedir-fotos` no lo resuelve: las
   fotos ya están, lo que falta es la geometría.

## Lo que el informe final dice SIEMPRE

- Que el aviso **ha salido** (o por qué no) y en qué fase queda: «pendiente de revisión» si el
  encargo es del agente; si hay un técnico asignado, que sigue siendo suyo.

- Qué se ha leído de cada placa, **qué ha quedado escrito en la app** (Instalación del expediente o
  inputs de la oportunidad) y qué **no** se ha escrito (y por qué): los conflictos `≠` con lo que ya
  constaba, los nº de serie dudosos y si la placa contradice la fila de rendimiento.
- Cuántos huecos por pared y que están **por confirmar** (ámbar) — en la **ventana de la envolvente**
  de la app (el croquis PDF es el plano limpio, para revisar y para auditoría). **No en CE3X**: allí no hay ámbar.
  En la ventana, «N medidas por confirmar» abre la lista y cada línea lleva a su pared; la banda
  «Lo ha preparado el Agente IA» enseña los avisos de esta pasada (se guardan en el sello al terminar).
- Lo que **no se ha podido afirmar**: garaje/porche dentro de la planta, fachadas sin foto (sin
  huecos puestos), depósito del termo sin litros, pilares estimados.
- Si hubo **VÍDEO**: cuántos huecos vio por planta, cuáles se asignaron a su pared (y con qué
  confianza), cuáles quedaron dudosos, y **qué se ha pedido al propietario** (o el borrador del
  WhatsApp pendiente de su «sí»), con el mosaico para que el usuario lo vea.
- Lo que dice la **vista aérea** y no consta en otro sitio (construcciones sin declarar, placas en el
  tejado que el cliente no mencionó, tipo de cubierta), con la **fecha del vuelo**.
- Lo que dice el **croquis catastral por plantas** (y su fecha): qué se ha quitado por él (cuerpos y
  zonas) y en qué contradice a las fotos, si en algo. Que los documentos del Catastro están en
  `1. CEE / CEE INICIAL / CATASTRO` (o por qué no: la Sede no los da para esa parcela).
- Quién va como **técnico** en el `.cex` (por defecto Fran; si había un técnico asignado, él), y que
  la medida de mejora va **sin calcular**
  (en CE3X: Medidas de mejora → Actualizar).
- Con **autoconsumo**: los kWp, los kWh declarados (la suma de los doce meses) y si CE3X ajustó
  algún mes a su consumo (cuántos, y los kWh antes → después), con el ahorro que queda.
- En un **RES080**: el enlace del PREVISTO, qué cambia (ventanas, cerramientos con su U), las dos
  calificaciones (inicial y previsto), el ahorro de la medida, y que su XML está cargado como CEE
  FINAL (o por qué no). Aquí la medida SÍ va calculada (la ha calculado CE3X).

## Pruebas

```bash
node implementation/backend/scripts/test_agente_ia.js       # el agente: a quién se le queda, fases, aviso
node implementation/backend/scripts/test_senalado.mjs       # lo señalado, montado sin React
node implementation/backend/scripts/test_placa_ocr.js       # potencia útil vs consumo, Input/Output
node implementation/backend/scripts/test_placa_equipo.js    # casación con el catálogo, EAN ≠ serie
node implementation/backend/scripts/test_ortofoto.mjs       # rejilla de la ortofoto, fecha del vuelo
node implementation/backend/scripts/test_video_envolvente.js  # vídeo: a qué pared va cada ventana, qué se pide
node implementation/backend/scripts/test_streetview.js        # Street View: lados de la casa, encuadre, UTM
python -m pytest implementation/cee-engine/tests/test_fxcc_plantas.py   # croquis catastral: lectura, cuerpos, propuesta
python -m pytest implementation/cee-engine/tests/test_previsto.py       # RES080: ventanas y aislamiento del previsto
```

## Y después: el CEE final

Cuando el técnico entrega el inicial (con su medida calculada) y se le da el visto bueno, el CEE
final sale de esa medida: skill **`generar-cee-final`** (o el botón «Generar» de la fila del CEE final).
