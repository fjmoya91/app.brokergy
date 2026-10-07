<!-- conocimiento · área: lotes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El ANEXO del MITECO por actuación (2026-09-01)

El impreso que va dentro de cada ZIP `ActuacionE{n}` de la solicitud de emisión de CAE.
Se hacía a mano: 15 campos por expediente, cinco por lote.

**REGLA — no se REPLICA el impreso: se RELLENA el oficial.**
`backend/plantillas/AnexoActuacionEstandarizada.pdf` es el formulario del Ministerio con
sus **33 campos vivos**. Escribir dentro de él es la única forma de que el escudo, la
**GillSansMT** de la cabecera, la **Calibri** del cuerpo (8/11/14pt — NO es la Arial de
las fichas RES), los márgenes y las cuatro notas al pie sean exactamente los suyos.
Rehacerlo en HTML sería imitar un documento que ya tenemos, y quien lo revisa compara
contra el modelo oficial.

**REGLA — el título de la ficha se ELIGE del catálogo.** "Código de ficha" es un
desplegable con las 115 fichas oficiales: se selecciona la opción, así que el texto es
literalmente el del Ministerio. `FICHA_CATALOGO` guarda las cuatro nuestras copiadas tal
cual; para añadir otra, `getDropdown('Código de ficha').getOptions()` las lista.

| Qué | Dónde |
|---|---|
| Relleno, formato y validación | [anexoActuacionService.js](implementation/backend/services/anexoActuacionService.js) |
| Ruta (los 5 del lote de una vez) | `POST /api/lotes/:id/anexos-actuacion` (**adminOnly**) |
| Botón | Fase 5 de `LoteProcesoFases` — "Generar anexos para MITECO" |
| Destino | La carpeta **`E{n}` del propio expediente**, como `{expediente} - AnexoE{n}.pdf` |
| Regenerar en bloque | `node scripts/generar_anexos_lote.js <LOTE> [--dry]` |

**De dónde sale cada dato** — todos de Supabase, y los que faltaban son justo los que se
incorporaron estos días:

| Campo | Origen |
|---|---|
| Nº de actuación (`Nº E 3`) | `instalacion.verificacion.orden_actuacion` — el orden con que el INFORME numera las actuaciones. Se guarda al registrar sus ahorros |
| Ahorro anual · Inversión | `verificacion.ahorro_verificado_kwh` / `inversion_verificada_eur` — los VERIFICADOS |
| Vida útil | `verificacion.vida_util_anios`, con respaldo por ficha (15 · RES080 25) |
| Identificación y fecha del dictamen | `documentos_so[dictamen_favorable].dictamen` del LOTE: uno cubre las cinco actuaciones y las cinco lo citan |
| UTM, referencia catastral | `instalacion.coord_x/coord_y/ref_catastral` |
| Fechas de ejecución | `documentacion.fecha_inicio_cifo` / `fecha_fin_cifo` (coinciden con las del informe de verificación) |
| CNAE | `4322` siempre |
| Ayudas públicas | "NO se ha solicitado", lo mismo que declara el Anexo I que firma el titular |

### La SOLICITUD de emisión sale del MISMO botón

La carátula del envío: un impreso por LOTE que declara quién solicita, el ahorro
total y una fila por actuación con su ficha y su ahorro. Va a la carpeta de
documentación del lote; los anexos, a la `E{n}` de cada expediente.

| Qué | Dónde |
|---|---|
| Relleno y validación | [solicitudCaeService.js](implementation/backend/services/solicitudCaeService.js) |
| Plantilla | `backend/plantillas/SolicitudEmisionCAE.pdf` (42 campos vivos) |
| Prueba sin subir nada | `node scripts/probar_solicitud_cae.js LOTE-2025-003` |

**REGLA — la solicitud y los anexos se generan JUNTOS, con un solo gesto.** Salen de
los mismos datos —nº de actuación, ahorro verificado y dictamen— y tienen que casar
entre sí: la fila E3 de la solicitud es el expediente cuyo anexo se llama AnexoE3 y
cuyo ZIP es `ActuacionE3`. Con dos botones se puede generar uno y no el otro, y que
diverjan sin que nadie se entere hasta el requerimiento.

**REGLA — si algún expediente se queda sin anexo, NO se genera la solicitud.** Declara
un ahorro total y una fila por actuación: sin uno de los anexos, lo que se subiría es
una carátula que no corresponde con sus adjuntos. Se dice por qué, y los anexos que sí
salieron se conservan.

**REGLA — el total es la SUMA de las filas**, calculada al vuelo y no heredada de otro
sitio: lo primero que comprueba quien la revisa es que cuadren.

⚠️ **El ahorro viaja en CRUDO desde el expediente, nunca el que el anexo ya formateó.**
Aquél lleva punto de millar ("28.852") y `Number()` lo lee como 28,852 — tres órdenes
de magnitud menos en la cifra por la que se emiten los CAE. Es el mismo fallo que el
de los números del OCR, y por eso `entero()` además normaliza el separador español
antes de sumar.

⚠️ **Las filas E6–E15 no se tocan, y las apariencias se regeneran UNA A UNA.** En este
impreso la opción "Seleccione código de la ficha" y la primera ficha del catálogo
(AGR010, pantallas térmicas en invernaderos) **exportan la misma cadena** — es un fallo
de la plantilla oficial. Un `form.updateFieldAppearances()` global dejaría las diez
filas vacías diciendo que se solicitan diez actuaciones de invernaderos. Sin tocarlas,
conservan su apariencia buena; la plantilla no trae `NeedAppearances`, así que el visor
no las repinta.

⚠️ **La fila 11 se llama `Ell-0`** en la plantilla —ele minúscula, no uno—. Es una errata
del Ministerio: hay que respetarla o esa fila sale sin ahorro.

**El título de la ficha se ELIGE del desplegable**, con el mismo `FICHA_CATALOGO` que el
anexo por actuación (los dos impresos usan la lista oficial y tenerla dos veces es
tenerla mal un día). La comunidad autónoma también se elige, y `opcionCcaa` la resuelve
aunque en la BD esté en mayúsculas o sin guion: una CCAA que no case dejaría la
solicitud sin el campo por el que el Gestor Autonómico la reparte.

**No se aplana**, igual que el anexo.

**REGLA — cada anexo va a la carpeta `E{n}` de SU expediente.** Ahí se juntan los
adjuntos de esa actuación (`E3-1- Convenio CAE`, `E3-3-1- Ficha RES060`, `E3-3-5-
Certificado CIFO`…), que es lo que acaba comprimido como `ActuacionE3`. Todos juntos en
la carpeta del lote habría que repartirlos a mano justo antes de subir a MITECO, que es
el momento en que un fichero en la carpeta equivocada cuesta un requerimiento. La
carpeta la resuelve `carpetaDeExpediente` (la misma del sincronizador); un expediente
sin carpeta se cuenta como incompleto en vez de dejar el anexo en cualquier sitio.

**REGLA — lo que falte se LEE de los documentos ya subidos.** Al generar, si falta el nº
de actuación se va al informe y si faltan la identificación y la fecha del dictamen se va
al dictamen: a esas alturas los dos están subidos, y mandar al usuario a pulsar antes dos
botones para que la app lea unos papeles que ya tiene es hacerle de recadero. Del informe
se completa **solo el orden** —identificación, no dinero—; los ahorros y las inversiones
siguen exigiendo revisión. Los dos rescates van en **try/catch**: la cuota del lector se
agota a las ~20 peticiones seguidas y un lote que ya tiene sus datos debe generar igual.

⚠️ **El dictamen escribe sus datos como viñetas** (`• 28/08/2026.`), así que llegan con
el punto pegado. `fecha()` BUSCA la fecha dentro del texto en vez de exigir que la cadena
entera lo sea —si no, el anexo salía sin ella—, y el lector quita el punto final de
fecha, año, referencia del informe y CCAA; nunca de `organismo` ("Grupo Marwen Calsan
S.L.") ni de `decision`.

**REGLA — el nº de actuación es el del INFORME.** Rotula el anexo y nombra sus adjuntos
en el ZIP (`E3-1-`, `E3-2-`…). Deducirlo de otra cosa —del orden alfabético, por
ejemplo— haría que los ficheros dejaran de casar con el formulario que los cita.

**REGLA — un anexo con huecos NO se genera.** Se presenta igual de bien que uno completo
y el requerimiento llega tres semanas después. `faltantes()` dice qué falta y en qué
expediente, y ese expediente se salta.

⚠️ **La mitad de los campos declaran tamaño 0, que significa "ajústalo tú"**, y pdf-lib
no lo implementa: escribe a 12pt y el título de la ficha —95 caracteres en una celda de
273pt— se sale de la tabla, mientras las coordenadas y la referencia catastral se cortan
a media cifra. `autoSize` replica lo que hace el lector: tope por la ALTURA de la casilla
(×0,65 — medido sobre el impreso relleno: 15,7pt → 10,2pt) y reducción si no cabe a lo
ancho.

⚠️ **Los tamaños FIJOS van en una tabla explícita (`TAMANO_CAMPO`), no se leen del /DA.**
Cualquier herramienta que reescriba la plantilla puede serializar ese `/DA` de forma que
pdf-lib deje de encontrar el `Tf` (pypdf escapa la barra en octal, `/Helv`), y
entonces el CNAE sale a 40pt sin que nadie lo note hasta abrir el PDF.

⚠️ **La plantilla del repo está VACIADA a propósito**: la que se nos pasó traía dentro
los datos de un expediente real. Vive en `backend/plantillas/` porque la imagen solo
copia `backend/` (ver [[project_backend_importa_frontend_esm]]), con su excepción en
`.gitignore` — la regla `plantillas/` la excluía y no habría llegado al VPS.

**No se APLANA**, igual que el modelo del Ministerio: si hay que corregir un dato a mano
antes de presentarlo, se puede.
