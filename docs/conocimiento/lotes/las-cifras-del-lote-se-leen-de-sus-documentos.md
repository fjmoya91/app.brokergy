<!-- conocimiento · área: lotes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Las cifras del lote se LEEN de sus documentos (2026-09-01)

Dos números del lote se tecleaban a mano, y por eso faltaban: el **coste de la
verificación** y el **ahorro verificado de cada expediente**. Los dos vienen impresos
en un PDF que ya subimos al lote.

| Qué | De dónde sale | Dónde acaba |
|---|---|---|
| Coste de verificación | **Factura del verificador**, su BASE IMPONIBLE | `lotes.coste_verificacion` + `documentos_so[factura_verificador].importe` |
| Ahorro verificado **e inversión** | **Informe de verificación**: de cada bloque "N. ACTUACIÓN A VERIFICAR", su "Ahorro anual conseguido (kWh)" y su "Inversión de la actuación sin IVA (€)" | `expedientes.instalacion.verificacion.ahorro_verificado_kwh` / `inversion_verificada_eur` |
| Nº de dictamen, fecha, referencia del informe y ahorro dictaminado | **Dictamen**, apartados 3, 7, 9 y 10 | `documentos_so[dictamen_favorable].dictamen` (se enseña en el Resumen del lote) |

| Qué | Dónde |
|---|---|
| Lectura (prompts + esquemas + parseo) | [loteOcrService.js](implementation/backend/services/loteOcrService.js) |
| Casación, contraste y escritura | [loteVerificados.js](implementation/backend/services/loteVerificados.js) |
| Rutas | `POST /:id/documentos/:slot` (lee al subir) · `POST /:id/ahorros-verificados/leer` · `POST /:id/ahorros-verificados` · `POST /:id/dictamen/leer` · `POST /:id/dictamen/aplicar` |
| Revisión | `AhorrosVerificadosModal.jsx`, desde la fase 4 de `LoteProcesoFases` |
| Prueba sin tocar nada | `node scripts/probar_lote_ocr.js <factura\|informe\|dictamen> <driveFileId> [loteId]` |

**REGLA — el modelo solo LEE; el juicio es del código.** A qué expediente corresponde
cada actuación, si la factura es de este lote y si las cifras cuadran lo deciden
funciones deterministas en `loteVerificados.js`, con sus avisos citados. Es el mismo
reparto que en las facturas de obra (`facturaIncidencias.js`).

**REGLA — los números se piden como TEXTO y los convierte `numeroEs()`.** Pedidos al
modelo como NUMBER, el punto de miles español se lee como decimal y "28.852" entra
como 28,852: tres órdenes de magnitud de error en el número con el que se paga a un
cliente. La conversión es determinista y está probada sobre los formatos reales.

**REGLA — el ahorro verificado se PROPONE, nunca se escribe solo.** Se lee al subir el
informe, se casa contra los expedientes del lote y se abre la revisión; aplica el
ADMIN. Sobre esa cifra se factura al S.O. y se le paga el bono al cliente, y una
transferencia hecha no se deshace. **Lo que no casa no se puede ni marcar**: adivinar a
qué expediente se parece una actuación es la forma de pagarle a un cliente el ahorro de
otro. Los lotes cuyo informe se subió antes de esto tienen "Leer los ahorros del
informe", que lo baja de Drive y lo relee.

**REGLA — se contrasta la suma con el total que declara el propio informe.** Se avisa,
no se bloquea: hay informes reales que no cuadran consigo mismos — medido en el
CAE-1601, sus cinco actuaciones suman 350.399 kWh y su total dice 350.339.

**REGLA — UNA sola revisión escribe las dos cifras.** El informe trae el ahorro Y la
inversión de cada actuación, y son las mismas que imprime el dictamen (medido en el
CAE-1601: idénticas en los dos papeles). Eran dos pantallas para dos números que vienen
juntos. El dictamen queda para lo que aporta en exclusiva —su nº y su fecha— y para
CONTRASTAR: si sus cifras coinciden con lo registrado, **no abre nada** (`sinCambios`);
solo pide revisión cuando algo difiere, que es cuando hace falta que alguien mire.

**REGLA — el dictamen NO puede ir solo.** Su tabla no cita el número de expediente, así
que sin el informe no hay forma de saber de quién es cada fila. El informe sí puede: es
el único documento que las identifica.

**REGLA — `aplicarAhorrosVerificados` FUNDE `verificacion`, no la reemplaza.** El sello
del dictamen y el del informe se escriben en momentos distintos y sobre la misma clave;
un reemplazo hacía que registrar el informe después del dictamen se llevara por delante
su nº y su fecha.

**REGLA — la INVERSIÓN del dictamen es la definitiva.** La declarada al principio
puede haberse corregido en un requerimiento, y la que vale es la que el organismo da
por buena. Se guarda en `instalacion.verificacion`, **no pisa `documentacion.facturas[]`**
—que es el registro de lo que de verdad se facturó— y la pantalla avisa cuando difiere.
Medido en el CAE-1601: `25RES060_75` tenía 6.930 € y el dictamen fija 6.080 €, que es la
corrección de su inexactitud nº 10 (un kit solar facturado junto a la bomba de calor,
ajeno a la ficha RES060).

**REGLA — los números de expediente se comparan SIN NINGÚN separador**, solo letras y
dígitos (`normNum`). El PDF escribe el mismo número de varias formas dentro del MISMO
documento: medido en el informe del CAE-1490, "25RES060_65" en unas actuaciones y
"25RES060 70" (con espacio) en otras, según cómo caiga el guion bajo al extraer el texto.
Conservando el `_`, tres de cinco expedientes salían como "no existe en este lote" — y
parecía un fallo del OCR, que había leído bien. Sin el separador el número sigue siendo
único ({AA}{FICHA}_{N}).

**REGLA — leer un PDF SE VE.** Tarda entre 6 y 14 s; sin señal el usuario cree que el
botón no ha hecho nada y vuelve a pulsar. Las tres lecturas usan el overlay estándar
(`SendActionOverlay`) con el icono **`read`**: la lupa recorre la hoja. No vale el de
subida — el fichero ya está ahí, y la nube haría pensar que sigue viajando. Del overlay
se pasa DIRECTO a la revisión cuando la hay: un "listo" que hay que cerrar para que
aparezca otra pantalla es un clic de peaje.

**REGLA — el dictamen se casa por el AHORRO, nunca por el orden.** Su tabla NO cita el
número de expediente: solo el código de ficha, que se repite (RES060, RES060, RES060,
RES080, RES080). Lo único distintivo de cada fila es su ahorro, que se compara contra el
verificado que dejó el informe. Por eso, **sin ahorros verificados no se propone nada** y
se dice qué hacer antes: casar por orden sería adivinar, y una inversión en el expediente
equivocado es la cifra que luego viaja al Anexo y al verificador. Si dos expedientes del
lote comparten ahorro, tampoco se casa ninguno.

**El dictamen es lo ÚLTIMO que llega**: su nº y su fecha no existen hasta que la
verificación termina, así que el bloque del Resumen solo aparece cuando ya está subido.

**REGLA — el modal de revisión es UNO con dos modos** (`informe` | `dictamen`). El gesto
es idéntico —revisar lo leído, casado contra los expedientes, y aplicarlo— y lo único que
cambia es qué número se escribe. Dos modales gemelos acabarían divergiendo justo en la
parte delicada, que es la de los avisos.

**REGLA — el nombre del fichero lleva el CÓDIGO DEL LOTE**: `4.2 Informe de Verificación
LOTE-2025-003.pdf`. Fuera de su carpeta —descargado, adjunto a un correo, encima de un
escritorio— "4.2 Informe de Verificación.pdf" no dice de qué lote es, y todos los lotes
generan un fichero con ese mismo nombre. Lo pone `nombreDocLote(slot, { codigo })`; el
firmado lo hereda del borrador. Para renombrar lo ya subido:
`node scripts/reorganizar_docs_lote.js --execute` (dry-run sin `--execute`).

**REGLA — la factura del verificador se coteja con SU lote.** Cita su `CAE-####` y su
nº de pedido (`LOTE-2025-002`), y la emite un NIF que ha de ser el del verificador del
lote. Subir la de otro lote emparejaría el coste con los expedientes equivocados y con
él el €/MWh que se le presenta al S.O. Avisa, no bloquea (mismo criterio que
`verificarEmisor` en la facturación del certificador).

**REGLA — se usa la BASE IMPONIBLE, nunca el total con IVA.** Todos los importes de la
app van sin IVA; caer al total inflaría el coste del S.O. un 21 %.

**REGLA — NO se paga a un cliente sin su ahorro VERIFICADO.** `PATCH /:id/estado`
rechaza con 409 el paso a `PTE. PAGO BROKERGY A CLIENTE` y a `FINALIZADO` si algún
expediente del lote no lo tiene (`puedePagarseAlCliente`), y dice cuáles faltan. La
fase 4 lo anuncia antes ("Ahorro verificado en 0 de 5 expedientes") para no enterarse
al intentar cambiar el estado.

**Menos scroll en Documentación**: las fases YA HECHAS van plegadas a una línea —que
sigue diciendo cuántos documentos guarda y si hay alguno por revisar— y se abren con un
clic. Con las seis abiertas, un lote en la fase 5 obligaba a bajar por cuatro bloques de
papeleo terminado. **Una fase con algo PENDIENTE no se pliega** aunque su papeleo esté
completo (la 4, mientras falte el ahorro verificado o la factura): plegarla escondería
justo lo único que hay que hacer. Un firmado "por revisar" no abre la fase — se anuncia
en la línea plegada, y abrirla entera devolvería el scroll que esto viene a quitar.
