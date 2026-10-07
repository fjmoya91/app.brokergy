<!-- conocimiento · área: lotes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El ZIP que se sube a beCAE es el MISMO paquete del MITECO (2026-09-09)

Antes de que el verificador emita su oferta hay que subirle a **beCAE** la
documentación de cada actuación: un ZIP por actuación con los ficheros renombrados
a `E{n}-…`, y la solicitud aparte. Es el paquete que ya existía (regla 40, modo
`expediente`), no otro: el del MITECO es ESE MÁS el anexo de la actuación, el
dictamen y los escritos del lote. Por eso el botón está en la **fase 3** del proceso
del lote, que es cuando se sube, y el de la fase 5 sigue donde estaba.

**REGLA — el contenido NO depende de la ficha.** Comparadas las 20 actuaciones de los
cuatro lotes con dictamen favorable (10 RES060, 4 RES080… y las de 2026-004: RES060,
3 RES080 y 1 RES093), las 20 llevan exactamente los mismos documentos. Lo único que
cambia con la ficha es cómo se llama el `3-5`: en RES060/RES093/TER es el
**Certificado CIFO** y en RES080 el **Certificado de Reforma**, que ya lo resuelve
`nombreDe`. No hay ninguna pieza exclusiva de una ficha, así que no hay un índice por
tipología que mantener.

**REGLA — la FICHA TÉCNICA va dos veces, y tienen que ser LA MISMA.** Dentro del
certificado —como anexo— y **suelta**, porque nos la piden además como documento
externo. Así que el `4-1` se arma con la misma decisión que el bloque de anexos del
certificado: `resolveAllFichaSlots` (una por MODELO de bomba de calor, más el marco y
el vidrio en un RES080 con ventanas) + los anexos sueltos que se le añadieron a mano,
y `buildAnnexPayload` los ordena, deduplica por fichero y aplica el recorte de
páginas guardado en el gestor de anexos. Verificado sobre LOTE-2026-008: el `4-1`
suelto es página a página el final del `3-5`. Con solo los `ft_*_link` en crudo —lo
que se hacía antes— el fichero de 26RES080_53 se quedaba en 6 páginas frente a las
**55** que se presentaron: faltaban la memoria de transmitancias, el marco, el vidrio
y la lana mineral. La unión la hace `pdfService.unirAnexos`, que parte de un
documento VACÍO: usando el primer anexo como base, su propio recorte de páginas no se
aplicaría y el fichero suelto dejaría de coincidir con el certificado.

**REGLA — el hueco de ficha técnica lo rellena EL QUE LA NECESITA, no una
pantalla.** El paquete resuelve el `4-1` desde el SLOT del expediente
(`ft_*_link`), y ese slot solo lo escribía el modal del certificado al abrirlo.
O sea que un expediente con el modelo ELEGIDO del catálogo y su ficha EN el
catálogo llegaba al lote diciendo que le faltaba un documento que no faltaba —
nadie había pasado por esa pantalla desde que el catálogo de ventanas existe.
Medido en LOTE-2025-005 (10/09/2026): **dos de cinco actuaciones bloqueadas** por
eso, con las tres fichas disponibles. La decisión salió de la ruta a
[fichaTecnicaSlot.js](implementation/backend/services/fichaTecnicaSlot.js)
(`asegurarFichaTecnica` / `asegurarFichasTecnicas`), la ruta `auto-copy` delega en
ella y **`envioGestorService` la llama antes de leer los huecos**: misma función,
mismo fichero, mismo nombre canónico, mismo slot. Es idempotente, así que la
comprobación en seco también la ejecuta —y el popup lo DICE en el subtítulo, en
vez de prometer que no ha tocado nada—. La ficha del catálogo **nunca sustituye**
a la que ya haya en el slot: puede ser una subida a mano que la corrige, y solo
`force` la reemplaza. Lo que no se puede rellenar sale como aviso con su motivo
(`avisos_ficha`), que siempre es el mismo y siempre se arregla en el mismo sitio:
el modelo no está elegido del catálogo, o está en el catálogo sin ficha.

⚠️ Los expedientes ANTERIORES al catálogo de ventanas declaran el marco y el
vidrio como TEXTO LIBRE, sin `marco_id`/`cristal_id`, así que ahí no hay nada que
copiar y el aviso lo dice. Para lo ya ocurrido:
`node implementation/backend/scripts/rellenar_fichas_tecnicas.js --lote=LOTE-2025-005 --execute`
(en seco sin `--execute`). Y cuando el certificado FIRMADO ya lleva un anexo que
no existe suelto —la ficha EPREL, o una versión distinta de la del catálogo—, la
pieza se EXTRAE del propio certificado: la regla es que el `4-1` sea página a
página su bloque de anexos, y eso manda sobre lo que diga el catálogo hoy.
Comprobado sobre 25RES080_26 (6 páginas) y 26RES080_34 (8): idénticos.

**REGLA — un enlace que apunta a un fichero BORRADO no es una pieza presente.**
Medido en LOTE-2025-005 el 10/09/2026: la comprobación dijo **18/18 en las cinco**
actuaciones y el ZIP de E3 salió con **15** documentos y el de E2 con 16. Lo que
faltaba —el Convenio de Cesión firmado, el Anexo Fotográfico y el Anexo I de
25RES080_7— seguía enlazado en el expediente, pero su fichero ya no estaba en
Drive: `getFileContent` daba 404, `copyFile` fallaba y el bucle de copia se saltaba
la pieza con un `if (bytes && bytes.length)`. **Un paquete al que le faltan tres
papeles se presenta igual de bien que uno completo**, que es justo lo que este
índice viene a evitar. `comprobarExisten()` mira ahora la metadata de cada pieza
que sale de un ENLACE guardado —las que se han encontrado listando una carpeta
existen por definición— y trata como ausente tanto el 404 como el fichero **en la
papelera**, que todavía se descarga pero desaparece el día que se vacíe. Se dice
con sus palabras (`estado: 'roto'`, "el fichero enlazado ya no existe en Drive —
vuelve a subirlo"): no es lo mismo que no tenerlo, porque el documento se generó y
se firmó y lo que hay que hacer es re-enlazarlo, no rehacerlo. Y si aun así una
copia se cae al generar, la actuación sale **NO OK** con la pieza listada, nunca
tragada. Cuesta ~10 s más por comprobación (de 12 a 23 s en un lote de cinco).

⚠️ **Un clic que no hace NADA es el peor final posible** — no se distingue de un
botón roto y lleva a pulsar otra vez, que aquí significa rehacer 120 MB. Pasó el
10/09/2026 con "Generar" y tenía DOS causas, las dos ahora cerradas: el texto del
`showConfirm` interpolaba una variable inexistente y el `ReferenceError` moría
dentro de un `async` que nadie escucha; y el popup de confirmación lo pinta
`ModalContext` DENTRO de `#root` mientras `SendActionOverlay` se portalea a
`document.body` (regla 29.b), así que **la pregunta quedaba tapada por el propio
overlay** y la función esperaba un "sí" invisible. Ahora el overlay se retira antes
de preguntar y se repone si la respuesta es que no, y `generarPaquete` envuelve
todo en un `catch` que saca el error en pantalla.

**REGLA — el Nº DE ACTUACIÓN se SELLA al enviar la solicitud por API.** Es el orden en
que las actuaciones se acaban de declarar al verificador, y es el que rotula cada
fichero del ZIP (`E3-3-1 - …`) y, meses después, el anexo del MITECO que los cita
(regla 29). Antes solo existía al registrar los ahorros del informe —semanas
después—, así que no se podía armar nada a tiempo. Se guarda en
`instalacion.verificacion.orden_actuacion` con `orden_origen: 'SOLICITUD_API'` y
**`soloSiFalta`**: un orden ya escrito no se pisa, y la discrepancia se ve en vez de
sustituirse en silencio —el ZIP que ya se subió lleva el número sellado—.

Para los lotes cuya solicitud salió antes de esto:

```bash
node implementation/backend/scripts/sellar_orden_actuacion.js LOTE-2026-008 --execute
```

Deduce el orden de la secuencia de FICHAS que se mandó a firmar al S.O., que es la
misma lista con la que se construyó la solicitud. Comprobado contra los cuatro PDF de
solicitud reales (0035-S07 a S10) leyendo sus bloques "Actuación N": coincide
actuación por actuación; y en los cuatro lotes con dictamen favorable coincide además
con el que el informe acabó asignando. Aun así lo ENSEÑA antes de escribir, porque el
número que manda es el que se ve en beCAE (`--orden=exp1,exp2,…` para forzarlo).

**REGLA — un papel de REQUERIMIENTO no se echa de menos** (`soloSiExiste`). La
*Declaración responsable del instalador* (`4-7`) no es del proceso: se escribió una
vez, para contestar a la inexactitud nº 4 de LOTE-2025-003 —el verificador objetó que
el emisor de la factura no era quien firmaba el certificado del instalador, o sea el
caso de la firma delegada ante Industria (regla 26.b)—. Una en veinte actuaciones. El
*Escrito de respuesta* (`5-1`) igual: solo existe si hubo requerimiento (2 de 4 lotes).
Si están, entran en el paquete; si no están, **no se dice nada** y no salen ni en el
listado: un aviso que aparece en todos los lotes y nunca hay que atender es el que
enseña a ignorar la lista entera. La del HUSO (`5-2`) SÍ avisa —está en los tres
últimos lotes, ya es parte del envío—.
⚠️ En LOTE-2026-004 el código `4-7` lo ocupa otro documento distinto ("DECLARACION
RESPONSABLE INVERSION"): el índice del gestor reutiliza ese hueco para lo que haya que
responder, así que no es "el" 4-7 de nada.

**REGLA — si el documento ESTÁ en Drive, el paquete lo coge** (`respaldo`). Es la
regla 20 aplicada aquí: un fichero que existe en su carpeta de siempre no puede
declararse "falta" porque nadie lo enlazara en el expediente. Medido en LOTE-2025-005:
el **Certificado RITE** de 25RES080_7 llevaba meses en `7. LEGALIZACION RITE` firmado y
registrado, y el **PDF único de facturas** de otras dos actuaciones estaba generado en
`5. FACTURAS` — tres de los cinco bloqueos eran enlaces que faltaban, no papeles. El
RITE excluye la MEMORIA, que vive en la misma carpeta y es el documento de al lado; las
facturas se reconocen por `" - facturas"`, que es como se llama siempre el combinado.

⚠️ **Con DOS candidatos el respaldo NO elige** (`unico`): quedarse con el primero es
decidir a ojo qué papel viaja al verificador. Se dice que falta y lo resuelve una
persona enlazándolo, que además lo deja arreglado para el lote siguiente. Y cuando una
pieza sale del respaldo el paquete lo DICE ("sale de un fichero suelto en Drive"), que
es lo que avisa de que el combinado de facturas puede ser anterior a la última factura
registrada.

**REGLA — una pieza puede NO PROCEDER, y eso no es que falte.** `exigencia()` da tres
respuestas y la tercera es la que evita los falsos bloqueos. El caso medido: el
**justificante de registro del CEE inicial** no existe cuando el CEE inicial es una
SIMULACIÓN, y 5 de las 20 actuaciones con dictamen favorable se presentaron sin él. La
señal es la fecha de registro del expediente —lo que se sella al subir el justificante
(regla 27.c), así que las dos cosas se mueven juntas—: sin ella se avisa, no se
bloquea. Y **se dice con el motivo**: una pieza del índice que desaparece de la lista
sin explicación se lee como un olvido.

⚠️ El **anexo de la actuación** solo es obligatorio en el modo `gestor`
(`obligatorioEn`). Para rellenarlo hacen falta el nº de dictamen y su fecha, así que a
la hora de subir a beCAE todavía no existe y exigirlo bloqueaba el paquete entero por
un papel que no puede estar.

**REGLA — GENERAR se pide de UNA actuación por PETICIÓN.** Armar las cinco de un
tirón son ~5 minutos (medido en el VPS el 09/09/2026: **~50 s por actuación**, E1 a
las 15:21:14 y E5 a las 15:24:47) y eso no cabe en los **120 s** de `proxy_read_timeout`
de `/api/`: nginx cortaba la respuesta a la altura de la segunda y la pantalla decía
**"no se pudo preparar el paquete"** mientras el servidor seguía y terminaba los cinco
ZIP. Dar por fallido un trabajo hecho es el peor error que puede cometer una pantalla
—el mismo vicio que el ACK de WhatsApp (regla 39)—. Ahora el frontend recorre las
actuaciones (`generarPaquete`) llamando con **`soloActuacion: n`**: cada petición dura
lo que dura su actuación, el overlay dice por dónde va ("Renombrando y comprimiendo… 3
de 5 · E3 · 26RES080_56") y si una se cae las demás quedan generadas y se dice cuál
falló. La comprobación en seco no baja ficheros y sigue yendo entera.

**REGLA — se puede PARAR, y volver a generar PREGUNTA.** Dos cosas que faltaban y
que solo se ven usándolo: (1) una tanda de cinco minutos sin botón de cancelar deja
como única salida refrescar la página —que es peor: corta sin decir por dónde iba—;
(2) al acabar, el botón seguía diciendo "Generar 5 ZIP" igual que antes, así que
pulsarlo rehacía 120 MB **en silencio**. Ahora el overlay lleva `cancelar` en la fase
de envío ("Parar aquí" + "se para al terminar esta actuación": lo ya pedido al
servidor no se puede deshacer sin dejar una carpeta a medio copiar), el resultado dice
**qué quedó sin generar** (`Sin generar: E3, E4, E5`) y el botón pasa a
**"↻ Volver a generar"** con `showConfirm`. La bandera de cancelación va por **`useRef`**:
el bucle corre fuera del render y con `useState` leería el valor del render en que
arrancó. Y solo se marca como generado si la tanda salió ENTERA — tras un parón, el
botón tiene que seguir invitando a terminar el trabajo sin preguntar nada.

⚠️ Como red de seguridad, esas dos rutas tienen su propia `location` en nginx con
**900 s** (`~ ^/api/lotes/[^/]+/(paquete-actuaciones|anexos-actuacion)$`; la de regex
gana a la de prefijo `/api/`, que se queda en 120 s — un plazo generoso para TODA la
API es una conexión colgada un cuarto de hora por cada petición que se atasque).
Aplicada **a mano en el VPS**, en `nginx.conf` y en su `nginx.https.conf` local, porque
esa config está divergida del repo y un cambio por `git pull` aborta el deploy entero
(ver `deploy_workflow`); y con `docker compose restart nginx`, nunca `reload`, por el
gotcha del inodo del bind-mount.

⚠️ Armando el ZIP **en memoria** no hay carpeta destino: `E{n}` puede no existir
todavía —y no existe en un lote que aún no se ha presentado, que es justo el que se
quiere comprobar—. Antes eso moría con "No se pudo preparar la carpeta E1".
