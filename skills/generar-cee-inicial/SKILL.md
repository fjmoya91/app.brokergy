---
name: generar-cee-inicial
description: 'GENERA el CEE INICIAL (.cex de CE3X) de una oportunidad o expediente desde sus FOTOS o un VÍDEO de la vivienda: lee las placas de la caldera y de la aerotermia, cuenta y mide los huecos de cada fachada, los asigna a su pared en el plano del Catastro y escribe el .cex con la aerotermia como MEDIDA DE MEJORA. Con un VÍDEO (casi siempre de dentro) saca el fotograma de cada ventana y deduce a qué pared da; lo que no se puede saber no lo adivina: prepara el WhatsApp al propietario pidiendo esas paredes con su plano en rojo (en seco; se envía solo con tu «sí»). Si la aerotermia no está en el catálogo, la da de alta con su ficha, EPREL y Keymark. Úsalo con "genera el CEE inicial de NNN", "hazme el .cex de la OP246", "prepara la envolvente de X con sus fotos / su vídeo", "mete esta aerotermia en el catálogo". Gemelo de `revisar-cee`. Lo leído nace DUDOSO y lo que no se puede afirmar no se inventa.'
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
| `leer-pared <clave> --pared ID --fotos id1,id2` | Inventaria los huecos de una fachada desde su foto (escala por la puerta). Admite un fotograma del vídeo: `--fotos frame:F1` | nada |
| `video <clave> [--archivo v.mp4] [--refrescar]` | Lee el **VÍDEO** de la vivienda: estancias, plantas, cada hueco con su fotograma, a qué da y **a qué pared va** (o «dudoso»). Deja `mosaico.jpg`, la hoja de contactos y `video.json` con la propuesta para el plan (`frame:H3`). Ver `referencia/video.md` | nada |
| `pedir-fotos <clave> [--paredes …] [--enviar]` | El **WhatsApp al propietario** pidiendo la foto de las paredes que no se han podido resolver, una por lado, numeradas y con su plano en rojo. **En seco** salvo `--enviar` (solo con el «sí» del usuario); al enviar, el CEE queda «esperando las fotos» | con `--enviar` |
| `eprel <modelo>` | Busca el modelo en EPREL y baja su ficha (ES) y su etiqueta | nada |
| `alta-aerotermia --json d.json [--ficha ft.pdf:1,3-4] [--eprel-fiche f.pdf] [--eprel-label l.pdf]` | Da de alta el equipo en el catálogo y guarda la ficha unida en Drive | con `--escribir` |
| `aplicar <clave> --plan plan.json` | Guarda el trabajo, pega las fotos, compone la ficha, escribe el `.cex`, lo guarda en Drive **y avisa** (`--sin-aviso` lo calla). Además lo **califica con CE3X 3.1 en el PC** (≈1 min, sin abrir su ventana) y deja al lado su **`.xml` y su `.pdf` oficial** (`… _REVISAR.xml/.pdf`); `--sin-pdf` lo salta. En seco, `--calificar` lo califica y los deja junto a la copia local | con `--escribir` |
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
1. **`estado`**. Sin carpeta de Drive no hay dónde dejar el `.cex` (en una oportunidad: guardarla
   desde la calculadora). Si ya hay trabajo guardado, `aplicar` lo conserva y añade encima.
   En un **CEE directo** las fotos están en «4. DOCUMENTACIÓN PARA CEE» (no en «12.»), y no hay
   oportunidad: la instalación actual sale del **cuestionario** del cliente
   (`documentacion.cuestionario`: calefacción, ACS, aires, placas) y se TECLEA en el plan
   (`ajustes.instalacion` / `ajustes.equipos_extra`), con el aviso de que no viene de una placa.
   **La versión de CE3X**: por defecto la **3.1**; la 2.3 solo si se pide (`ajustes.version_ce3x`).
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
4b. **¿Hay VÍDEO en vez de (o además de) fotos de las fachadas?** (`estado` lo dice: «vídeos de la
   vivienda: …»; si llegó por WhatsApp, bájalo y pásalo con `--archivo`). Lánzale **`video`** y sigue
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

## Reglas que no se rompen

- **Una ventana con balcón es una BALCONERA**: `ventana` de ~2,10 m de alto, no `puerta` (una puerta
  sale de madera al 90 % de marco; una balconera es un hueco acristalado).
- **Una puerta de patio acristalada** va como `puerta` con `porc_marco` 30-40 y su marco y vidrio.
- **El garaje, un trastero o un porche NO son vivienda**: van al croquis (o a `zonas_fuera`) y sus
  huecos NO se ponen — la puerta del garaje, y también las ventanas que el reparto deje dentro del
  garaje. Un porche abierto es `PORCHE` (exterior), no un espacio no habitable.
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
   que manda es el del presupuesto (`DOC_PRESUPUESTO`): búscalo en el catálogo por su CÓDIGO comercial
   («LAVX1123DV» → id 43, ERLA11D2V3 + EBVX11S23DJ6V) y ponlo en `aerotermia_id`. Sin aerotermia en el
   expediente **la medida de mejora no se escribe** (aviso «No consta el equipo nuevo»).
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
   máquina frigorífica** (250 %), repartiendo el 100 % del frío; en un CEE directo, «calefacción y
   refrigeración». Los aires se QUEDAN en la medida: la aerotermia cubre el frío que no cubren ellos.
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
9. **La POTENCIA de cada equipo, también DENTRO de las medidas (CE3X 3.1).** La 3.1 la pide por
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
12. **Califícalo en seco antes de escribir**: `aplicar … --calificar` (CE3X 3.1 en el PC) da la letra
   y los errores de CE3X sin tocar nada. Sin **fecha de emisión y de visita** CE3X califica pero NO
   escribe el XML («invalid literal for int()»): en un CEE sin visita todavía es lo esperado y se dice.
13. **Aerotermia + ACS + PLACAS en UNA medida.** Si en la carpeta hay un presupuesto de
   fotovoltaica (p. ej. `OTROS_ANTES__PPTO. FV.pdf` en «12.»), la medida es UN conjunto con todo
   lo que se instala: `"medidas": ["aerotermia_fv"]`, con los kWp del presupuesto × la producción
   de **PVGIS con el tejado real** (coplanar, no los ángulos óptimos) en `ajustes.autoconsumo_kwh`
   / `autoconsumo_pvgis`, y su importe en `ajustes.autoconsumo_inversion`. Cómo, paso a paso:
   `referencia/plan.md` → «Aerotermia + ACS + placas en UNA medida». Busca también el presupuesto
   de la aerotermia: el «aerotermo» que trae es el equipo de ACS aparte.
14. **El CERTIFICADOR**: si el usuario dice quién firma («ponme a mí»), asígnalo en la app (el
   certificador de la casa no recibe aviso). Con un técnico asignado el `.cex` lleva sus datos y el
   agente no le quita el encargo.

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
- Que el `.cex` va **sin técnico** si es una oportunidad, y que la medida de mejora va **sin calcular**
  (en CE3X: Medidas de mejora → Actualizar).

## Pruebas

```bash
node implementation/backend/scripts/test_agente_ia.js       # el agente: a quién se le queda, fases, aviso
node implementation/backend/scripts/test_senalado.mjs       # lo señalado, montado sin React
node implementation/backend/scripts/test_placa_ocr.js       # potencia útil vs consumo, Input/Output
node implementation/backend/scripts/test_placa_equipo.js    # casación con el catálogo, EAN ≠ serie
node implementation/backend/scripts/test_ortofoto.mjs       # rejilla de la ortofoto, fecha del vuelo
node implementation/backend/scripts/test_video_envolvente.js  # vídeo: a qué pared va cada ventana, qué se pide
python -m pytest implementation/cee-engine/tests/test_fxcc_plantas.py   # croquis catastral: lectura, cuerpos, propuesta
```

## Y después: el CEE final

Cuando el técnico entrega el inicial (con su medida calculada) y se le da el visto bueno, el CEE
final sale de esa medida: skill **`generar-cee-final`** (o el botón «Generar» de la fila del CEE final).
