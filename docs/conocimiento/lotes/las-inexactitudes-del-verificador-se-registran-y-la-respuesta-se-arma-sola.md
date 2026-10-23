<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## Las INEXACTITUDES del verificador se registran solas, y la RESPUESTA se arma al subsanar (2026-10-22)

El informe de inexactitudes (Marwen: «Inexactitud nº N», clasificación, estado,
**actuaciones relacionadas** y «Hecho encontrado») se leía a mano y cada punto se
trasladaba a mano a cada expediente. Para contestar se montaba a mano, en la raíz del
lote, una carpeta `{n}. REQUERIMIENTO` con los documentos corregidos renombrados como en
el paquete (`E3-4-5 - 25RES080_7 - ANEXO I_rev1_fdo.pdf`) y un ZIP — así están
LOTE-2025-005, -006 y -009. Decisión del usuario: que al subirlo se registren las
incidencias, subsanarlas documento a documento y que lo corregido acabe solo en esa
carpeta, organizado para contestar.

| Qué | Dónde |
|---|---|
| Leer el PDF (solo transcribe) | `leerInformeInexactitudes` en [loteOcrService.js](implementation/backend/services/loteOcrService.js) |
| Casar, registrar, copiar, preparar la carpeta | [inexactitudesLote.js](implementation/backend/services/inexactitudesLote.js) |
| Al subirlo | `POST /api/lotes/:id/documentos/informe_inexactitudes` (lo hace solo) |
| Releerlo / registrarlo después (`seco: true` = solo decirlo) | `POST /api/lotes/:id/documentos/:key/inexactitudes` |
| Al subsanar una incidencia | `PATCH /api/expedientes/:id/incidencias/:incId/resolver` |
| Preparar la carpeta (`seco: true` = solo decirlo) | `POST /api/lotes/:id/requerimiento/:ronda/carpeta` |
| Pruebas sin red | `node implementation/backend/scripts/test_inexactitudes_lote.js` |

### Registrar

Al subir el informe (fase 4 del lote) se lee con Gemini y **cada inexactitud pasa a ser
una incidencia del expediente de cada actuación que cita**: «Actuaciones relacionadas:
1,2» es el nº de actuación de la solicitud, el mismo que `verificacion.orden_actuacion`
(sellado al enviar por API). Procedencia `VERIFICACION`, tipo `INEXACTITUD`, GRAVE salvo
que diga «no importante». Medido sobre LOTE-2025-012 (CAE-1904): 6 inexactitudes → 15
incidencias en los 5 expedientes, 4,8 s.

**REGLA — el modelo solo LEE.** A qué expediente y a qué documento va cada una lo deciden
reglas que se pueden probar. Documento: si el hecho NOMBRA documentos (Anexo I, informe
fotográfico, CIFO, factura…) son esos; si no, por el tema (SCOP, impulsión → CIFO; UTM →
CIFO, Convenio de Cesión y Anexo Fotográfico, que es donde las declaramos; referencia
catastral → además el Anexo I).

**REGLA — la que habla de VARIOS documentos sale en CADA uno** (`slots`; `slot` solo si
es uno). «El nº de serie según el Anexo I difiere del de la placa en el informe
fotográfico» se arregla en uno de los dos y no se sabe en cuál hasta corregirlo: colgarla
del primero dejaba el otro en verde. El frontend la pinta en todos
(`slotsDeIncidencia` en `logic/incidenciaSlots.js`).

**REGLA — es IDEMPOTENTE, y la identidad es (lote, nº de inexactitud).** Releer no
duplica. Un informe POSTERIOR (ronda 2) que repite una ya subsanada la **reabre** y la
pasa a su ronda (la respuesta va a `2. REQUERIMIENTO`); una que da por **cerrada** se
subsana sola, «Cerrada por el verificador». Lo que no casa con ningún expediente (cita
una actuación que no es del lote, o no cita ninguna) se dice y no se registra.

Lo leído se sella en la entrada del informe (`documentos_so[].inexactitudes`) y la fila
del lote lo enseña, con «Volver a leer» y «Preparar N. REQUERIMIENTO».

### Contestar

Al pulsar **Subsanar** en el visor del documento, si la incidencia viene de una
inexactitud, el documento corregido se COPIA a `{ronda}. REQUERIMIENTO` (raíz del lote)
con el nombre del paquete — `E{n}-{código} - {nº} - {NOMBRE}` del índice de
[envioGestorService.js](implementation/backend/services/envioGestorService.js),
conservando el `_revN` del original — y lo que ha pasado queda en el hilo.
**Descartar no copia** (no hay nada corregido).

**Y también a la `E{n}` del expediente** (decisión del usuario, 22/10/2026: «quiero una copia en
la carpeta E1-En y en la carpeta requerimiento»), con el mismo nombre, para que el paquete del
expediente sea el que vale (`ponerEnCarpetaE`). Pasa al subsanar y al «Preparar».

**REGLA — en la `E{n}` la versión anterior NO se borra: va a `E{n}/OLD`** (con su `_OLD`). Es
lo que vio el verificador y de ahí sigue saliendo el «ya visto»: la comparación mira `E{n}/OLD`,
las rondas anteriores y lo que haya en `E{n}` **salvo** lo que esté también en la carpeta de ESTA
ronda (eso lo pusimos nosotros al subsanar y el verificador aún no lo ha visto). Sin esa
excepción, la corregida que acabamos de dejar en `E{n}` se leería como «ya vista» y «Preparar» la
dejaría fuera. El `E{n}.zip` del expediente NO se rehace solo: si hace falta, «Generar» el paquete.

**El Anexo I del LOTE (listado de cesión) va a TODAS las `E{n}`**, cada una con su número
(`E3-1-1 - LOTE-… - ANEXO I LISTADO CESION_rev2_fdo.pdf`), porque es del lote y está en todos los
paquetes; en el requerimiento sigue siendo uno, `E1a{N}-1-1`. Lo de antes, a `E{n}/OLD` de cada una.
Aplicado el 22/10/2026 en LOTE-2025-012… **mal**: la `_rev2_fdo` que se puso en E1–E5 y en
«1. REQUERIMIENTO» (y su ZIP) era el **borrador sin firmar** (md5 = el de
`2. Anexo I LOTE-2025-012_rev2.pdf`, cero firmas; la `_fdo` firmada quedó en OLD). La pieza
`1-1` cae al `draft_link` cuando no hay firmado, y el reenvío por requerimiento borra el
`signed_link`. **REGLA — al paquete solo va el Anexo I FIRMADO** (`colocarAnexoILote`, que
resuelve la pieza sin el borrador). Y con el mismo nombre no basta para darlo por puesto: se
compara el md5, para que el firmado que llegue sustituya a esa copia.

**REGLA — solo se copia lo que es DISTINTO de lo que ya vio el verificador**, y se
compara por CONTENIDO (md5 de Drive) contra la copia del paquete en la `E{n}` del
expediente y las de respuestas anteriores. Subsanar no prueba que el papel se haya
corregido, y contestar con el mismo documento es contestar con lo que motivó la
inexactitud. Por FECHA no basta: en LOTE-2025-012 el Anexo I corregido de 26RES093_4 se
firmó a las 14:21 y el informe se subió a las 14:23. Sin copia con la que comparar se cae
a la fecha (cambiado desde el día del informe).

**Preparar N. REQUERIMIENTO** (botón en la fila del informe) repasa la ronda entera:
copia lo corregido que no entró al subsanar (lo típico: se subsanó antes de que volviera
firmado), añade las fichas RES y el Anexo I del lote que el S.O. haya vuelto a firmar,
rehace `{LOTE} - CONTESTACION A INEXACTITUDES.zip` con TODO lo que haya en la carpeta
(también lo que se deje a mano, como el escrito de contestación) y dice qué incidencias
siguen abiertas y qué documento sigue igual que el que vio el verificador.

Pendiente: el MCP (`subsanar_incidencia`) no copia; lo recoge «Preparar».

### Lo que el S.O. vuelve a firmar sustituye SOLO (2026-10-23)

Decisión del usuario: «cuando mandamos de nuevo firmar la ficha al Sujeto Obligado, que sepa
cuál hemos mandado y el Anexo, y cuando lo subamos a la app que lo sustituya en la carpeta E{n}
que le corresponda, para que esa carpeta siempre tenga la última versión de los documentos
firmados». Hasta ahora la ficha o el Anexo I re-firmados se registraban (en «10. EXPEDIENTE
CAE» y en la carpeta del lote) pero la `E{n}` seguía con la versión vieja hasta pulsar
«Preparar N. REQUERIMIENTO».

| Qué | Dónde |
|---|---|
| Qué se mandó a volver a firmar | `documentos_so[]`: `rev`, `file_name` (`…_rev1.pdf`), `sent_at`, `requerimiento_at` — lo sella `POST /api/lotes/:id/requerimiento` |
| A qué ronda contesta | `rondaDelRefirmado`: el último `informe_inexactitudes_N` subido ANTES de `requerimiento_at` |
| Colocarlo | `colocarRefirmados(loteId, docKeys)` en [inexactitudesLote.js](implementation/backend/services/inexactitudesLote.js) |
| Quién lo llama | `procesarFirmados` (suelta en la fase 2 y buzón), «Subir firmado» de la fila y la firma en `/firmar-lote` |

Al registrarse un firmado con `requerimiento_at`: la ficha va a la `E{n}` de su expediente y
el Anexo I a TODAS las `E{n}` (lo de antes, a `E{n}/OLD`), y la copia a `{ronda}.
REQUERIMIENTO`. Mismo motor que «Preparar» (`copiarPiezas` / `colocarAnexoILote`, con su
comparación por md5); el ZIP de la contestación NO se rehace solo: «Preparar».

**REGLA — el `requerimiento_ronda` del reenvío NO es la ronda de inexactitudes**: es la marca de
tiempo del envío (acota el enlace de firma, `?r=`). La ronda se deduce de las fechas. Sin
informe anterior a la re-firma no se coloca nada y se dice (no viene de una inexactitud).

Primer uso, 23/10/2026: Jesús devolvió por correo las fichas `_rev1` de 25RES060_67, _74, _78 y
26RES093_6 (LOTE-2025-010) y la `_rev2` de 26RES060_100 (LOTE-2025-012). Registradas con
`probar_firmados_correo.js --dias 1 --aplicar` → cada `E{n}` con la re-firmada y la `_fdo`
anterior en OLD; «1. REQUERIMIENTO» de LOTE-2025-010 creada con las cuatro. Los dos Anexo I
venían solo con la firma de Pedro José: falta la de Brokergy y no se registran solos.

### Lo que el CLIENTE vuelve a firmar, también solo (2026-10-23)

Decisión del usuario, el mismo día: «que lo que el cliente vuelve a firmar con una inexactitud
abierta vaya solo a su E{n} y al requerimiento, dejando la incidencia abierta para que yo la
cierre». Caso: Eusebia (25RES060_88, por su representante notarial) y Javier Panduro
(25RES060_85) volvieron a firmar el Anexo I desde su enlace a las 08:43 y 08:49; el firmado
estaba en la app pero la `E{n}` seguía con el viejo hasta pulsar «Subsanar».

| Qué | Dónde |
|---|---|
| Qué se coloca (puro) | `planCorregidosExpediente` / `firmadosCambiados` en [inexactitudesLote.js](implementation/backend/services/inexactitudesLote.js) |
| Colocarlo | `colocarCorregidosExpediente(expedienteId, campos)` |
| Quién lo llama, aparte | `/anexos-upload` (enlace del cliente), la subida del CIFO por el instalador, `cesion-manuscrita` y el `PUT /expedientes/:id` (DocsManager y la contrafirma) |

Documentos: Anexo I (`4-5`), Convenio (`1-2`), Anexo Fotográfico (`3-4`) y CIFO (`3-5`), cada
uno solo si tiene una inexactitud ABIERTA colgada de su slot. Mismo motor que «Subsanar»
(`copiarPiezas`, md5 contra lo que vio el verificador), así que subsanar después no duplica.

**REGLA — la incidencia SIGUE ABIERTA**: se deja una NOTA en su hilo («ha llegado firmado…,
copiado a… ciérrala cuando lo hayas revisado»). Que llegue firmado no prueba que esté bien.

**REGLA — el Convenio con firma ELECTRÓNICA del cliente espera la contrafirma de Brokergy**
(`cesion_firmado_brokergy`): sin ella no es el documento que se contesta. La contrafirma puede
dejar el MISMO enlace (Drive reemplaza el fichero), así que el PUT cuenta también que
`cesion_firmado_brokergy` pase a true.
