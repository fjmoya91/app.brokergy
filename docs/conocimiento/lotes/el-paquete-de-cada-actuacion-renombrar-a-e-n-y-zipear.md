<!-- conocimiento · área: lotes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El PAQUETE de cada actuación — renombrar a E{n} y zipear (2026-09-08)

Los ~20 documentos de cada expediente se bajaban de Drive, se renombraban a mano
uno a uno con su código del índice (`E3-3-5 - …`) y se comprimían. **Cinco veces por
lote.** Ahora sale de un botón, y antes de generar nada **dice qué falta y en qué
expediente**.

| Qué | Dónde |
|---|---|
| El ÍNDICE (qué documento es cada código y de dónde sale) | [envioGestorService.js](implementation/backend/services/envioGestorService.js) — `INDICE` |
| ZIP sin dependencias nuevas | [utils/zipStore.js](implementation/backend/utils/zipStore.js) |
| Ruta | `POST /api/lotes/:id/paquete-actuaciones` — `{ modo, dryRun }`, **adminOnly** |
| Botones | Fase 5 de `LoteProcesoFases` ("Comprobar el paquete E1-E5" → "Generar N ZIP") |
| El convenio del S.O. | `prescriptores.convenio_cae_link` · ficha del S.O. (`ConvenioCae` en `PrescriptorDetailModal`) |
| Prueba sin escribir en Drive | `node scripts/test_paquete_actuaciones.js LOTE-2026-004 [--gestor] [--zip]` |

**REGLA — la nomenclatura NO se inventa: se REPRODUCE.** Sale de los lotes ya
presentados (medida sobre LOTE-2025-002, 003 y 2026-004, que coinciden entre sí) y es
la que el verificador y la Gestora de Ahorros ya han aceptado. El prefijo es
`E{n}-{código}` y el orden de `INDICE` **es** el orden en que lo lee quien lo revisa.

**REGLA — el nº de actuación es el del INFORME de verificación**
(`instalacion.verificacion.orden_actuacion`), el mismo que rotula el anexo del MITECO
(regla 29). Sin él no se arma nada y se dice por qué: deducirlo de otra cosa haría que
los adjuntos dejaran de casar con el anexo que los cita.

**REGLA — lo IMPRESCINDIBLE bloquea; lo leve avisa.** Un paquete sin el justificante
de registro del CEE se presenta igual de bien que uno completo y el requerimiento
llega tres semanas después; uno sin la etiqueta energética, no. Cada pieza declara su
`obligatorio` y esa es la única fuente del corte. Las que faltan se dicen **por
expediente y con nombre**, y las demás actuaciones se generan igual.

**REGLA — los ficheros se COPIAN, nunca se mueven.** El original sigue en su carpeta
de siempre ("6. ANEXOS CAE", "5. FACTURAS", "1. CEE/…"), que es la que audita todo lo
demás. El paquete es una vista derivada: se puede regenerar, y lo que reemplaza lo
borra en vez de archivarlo en OLD porque nunca es la única copia de nada.

**REGLA — lo que ya está colocado con su código NO se toca.** Ni se renombra ni se
sustituye: ese nombre es el que el verificador ha visto (con su `_rev1`, su `_fdo_fdo`
y sus mayúsculas), y "corregirlo" solo dejaría dos copias del mismo papel con nombres
distintos. Es además lo que hace que regenerar sea idempotente y que un documento que
alguien dejó ahí a mano no desaparezca del ZIP por no constar en la base de datos.
Cuando una pieza sale de ahí —o de un respaldo en Drive— **se dice** (`⚠ sale de un
fichero suelto en Drive, no consta en el expediente`): hoy funciona porque hay una
copia, y el lote que viene detrás no la va a tener.

**REGLA — el nombre lo decide la PIEZA, no quien la encontró.** `nombreDe(ctx)` para
las dinámicas (el convenio con la marca del S.O., `Ficha RES080_fdo`, y el CIFO que en
un RES080 se llama Certificado de Reforma). Cayendo en la etiqueta de la interfaz
salían ficheros llamados `E1-3-1 - … - Ficha RES firmada por el S.O..pdf`.

**DOS paquetes, porque se arman en dos momentos:**
- `expediente` → la carpeta `E{n}` **dentro del expediente** + `E{n}.zip`. Se puede
  montar en cuanto el informe numera las actuaciones, semanas antes del dictamen.
- `gestor` → `{LOTE} - ENVIO GESTOR/E{n}` + `ActuacionE{n}.zip`: lo mismo MÁS el
  dictamen favorable (`E{n}-2`) y los escritos del lote (`E{n}-5-x`). Es el que se
  sube a MITECO, y su botón solo aparece con el dictamen ya subido.

**El CERTIFICADO RITE pasa a `3-2`.** En los lotes ya enviados comparte el `3-6` con
el justificante de registro del CEE final —dos ficheros con el mismo código— y el
`3-2` estaba libre en todos ellos. Se cambia en `COD_RITE` y en ningún otro sitio.

**REGLA — el CONVENIO CAE vive en la ficha del S.O.**, no en el lote: es el mismo
documento en las cinco actuaciones y en todos sus lotes. Se sube una vez (o se pega su
enlace de Drive) y va a una carpeta **fuera de cualquier lote o expediente** — dentro
de uno, quien ordene esa carpeta se lleva por delante el convenio de todos los demás
paquetes (mismo criterio que el catálogo de fichas técnicas).

**El ZIP se escribe sin dependencias nuevas** (`utils/zipStore.js`, modo STORE): el
contenido son PDFs, que ya vienen comprimidos por dentro, así que deflatearlos otra vez
ahorra una migaja y costaría una dependencia más en la imagen del backend. Verificado
con `zipfile` de Python sobre los cuatro ZIP de LOTE-2026-004 (12-29 MB cada uno).

⚠️ El atajo de "en seco no fusiono las fichas técnicas" (son varios PDF que se unen en
uno) **no puede aplicarse cuando se arma el ZIP de verdad**: con él puesto, el paquete
salía sin las fichas técnicas y sin decirlo.

### Los FIRMADOS del S.O. se sueltan todos y la app los coloca (2026-09-09)

El S.O. firma el Anexo I y las cinco fichas con su certificado y los devuelve por
email **con el mismo nombre con el que se los mandamos**. Había que abrir cada PDF
para ver de qué expediente era, comprobar a ojo que llevaba firma, renombrarlo y
subirlo a su slot: seis veces por lote. Ahora se sueltan los seis en la fase 2 y
la app los identifica, comprueba las firmas y los registra.

| Qué | Dónde |
|---|---|
| QUIÉN firma un PDF (leído del propio fichero) | [utils/firmasPdf.js](implementation/backend/utils/firmasPdf.js) — `leerFirmasPdf`, `firmanteCoincide` |
| Identificar, comprobar y registrar | [services/firmadosSo.js](implementation/backend/services/firmadosSo.js) — `procesarFirmados` |
| Ruta | `POST /api/lotes/:id/firmados` (multipart `files`, `dryRun`, `asignar`, `forzar`), **staffOnly** |
| Superficie | Zona de suelta en la fase 2 + `FirmadosSoModal` |
| Quién firma por Brokergy | `FIRMANTE_CESIONARIO` en [docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js) |
| Pruebas | `node scripts/test_firmados_so.js` · `node scripts/probar_firmas_pdf.js --lote LOTE-2026-004` |

**REGLA — las firmas se leen del PDF, NO con un modelo de IA.** Están escritas
dentro: el diccionario `/Type /Sig` trae `/SubFilter` y `/M`, y su `/Contents` es
un PKCS#7 cuyos certificados llevan el nombre y el NIF del firmante. `firmasPdf.js`
es un recorrido TLV de DER (~200 líneas, sin dependencias nuevas): milisegundos y
**coste cero**. Pagar una llamada a un LLM para leer un nombre que el fichero ya
dice sería además menos fiable — no hay garantía de que lo lea igual dos veces.
Medido sobre los firmados reales de LOTE-2026-004: el Anexo I devuelve sus dos
firmas (PEDRO JOSE LOPEZ MONTERO · 06239730Z y FRANCISCO JAVIER MOYA LOPEZ ·
06282551D, con su organización y su fecha) y la ficha, una.

**REGLA — esto NO valida la firma.** No se comprueba el hash del documento, ni la
cadena de confianza, ni la revocación: eso es de Autofirma y del validador del
Ministerio. Lo que se afirma es *"el PDF declara N firmas y éstos son los nombres
de sus certificados"*, que es justo lo que hace falta para clasificar un fichero y
ponerle nombre. Decirlo de otra manera en la pantalla sería prometer una validez
que nadie ha comprobado.

**REGLA — la firma COMPRUEBA, la identidad AVISA.** Un PDF sin firma electrónica
no es un firmado y no se registra: es el único caso que bloquea solo (probado con
el borrador sin firmar de una ficha real). Que el certificado no sea del
representante que consta en la ficha del S.O. **no** bloquea —puede haber cambiado
de apoderado, o firmar un administrador solidario— pero se dice quién firma de
verdad y hay que marcar "registrarlo igualmente". Nunca se traga en silencio.

**REGLA — el nº de expediente se compara vigilando el PREFIJO.** `26RES060_10` está
dentro de `26RES060_105`: un emparejamiento por "contiene" registraría la ficha
firmada en el expediente del vecino, y de ahí viaja al ZIP y al verificador sin que
nadie lo note. `contieneNumero` exige que lo que sigue al número no sea un dígito
(mismo cuidado que `normNum` al leer los informes de verificación).

**REGLA — lo que no se sabe de quién es, se PREGUNTA.** Si el nombre no lleva el nº
de expediente ni identifica al Anexo I, el fichero vuelve sin asignar y el modal
ofrece el desplegable de los documentos que están esperando firma. Elegir "el
primero que quede libre" es colocar la ficha de otro. Al asignarlo a mano se
**vuelve a analizar**: las firmas que se esperan dependen del destino (el Anexo I
pide dos y una ficha, una).

**REGLA — la zona de suelta es TODO el bloque de la fase, y se avisa ANTES de
llegar.** Con una cajita punteada hay que apuntar, y lo que se arrastra viene de
una descarga de seis PDF: se suelta donde se está mirando. En cuanto el puntero
entra en la ventana con ficheros, las fases que aceptan suelta se marcan (borde
discontinuo + "suelta aquí" en su cabecera) y la que tiene el puntero encima se
resalta; sin ese aviso hay que adivinar dónde vale soltar y el intento acaba en el
escritorio. **También plegada**: no hay que abrir la fase para soltar.

⚠️ El resaltado de la fase concreta se hace tocando las CLASES DEL NODO, no con
estado de React: `Fase` se recrea en cada render de `LoteProcesoFases`, así que un
`useState` dentro la remontaría a mitad de arrastre y el navegador cancelaría el
hover. Lo único que sí es estado es `arrastrando`, que cambia dos veces por
arrastre. Y el `dragover` de ventana hace `preventDefault`: sin él el navegador no
deja soltar y, al fallar la puntería, **abre el PDF** y se pierde la pantalla.

**REGLA — da igual en qué fase se suelte cada PDF.** El destino lo decide el
NOMBRE del fichero, no el sitio donde se soltó: la solicitud se puede soltar en la
fase 2 y una ficha en la fase 1. Las dos zonas existen porque son los dos sitios
donde uno mira, no porque filtren nada.

**La SOLICITUD DE VERIFICACIÓN firmada va por el mismo camino.** La firma el S.O.
(es el solicitante) y vuelve con las demás, así que se comprueba igual y
`guardarDocFirmado` la deja en `{lote} - DOC. VERIFICACIÓN` como
`1. Solicitud de Verificación {LOTE}_fdo.pdf`.

**REGLA — "Subir firmado" de una fila entra por el MISMO sitio.** Antes ese botón
posteaba directo a `/documentos/:key/firmado` **sin mirar la firma**: quedaba una
vía por la que un PDF sin firmar entraba como firmado. Ahora abre el mismo popup
con el documento YA ASIGNADO (`asignacionInicial`), así que la comprobación y el
`_fdo` no dependen de por dónde hayas entrado.

Eso obliga a distinguir DOS listas en `procesarFirmados`, y la diferencia importa:
`candidatos` es todo lo firmable del lote —donde se busca cuando el destino lo dice
una PERSONA— e `identificables` solo lo que ya se le mandó, que es contra lo que se
empareja por el nombre. Un documento que no ha salido no puede volver firmado, y
ofrecerlo como destino automático invitaría a colocar ahí un fichero de otra cosa.

**REGLA — si la firma que falta es la NUESTRA, se firma desde la propia fila.** El
S.O. puede devolver el Anexo I con su firma y sin la de Brokergy (o firmarlo antes
de que nosotros lo hayamos hecho). La fila ofrece **"🖊️ Firmarlo yo ahora con
Autofirma"**, que abre el MISMO `FirmarConCertificadoModal` del popup del Anexo I
con la caja del Proveedor (`SIGN_BOXES.anexo_i_listado_proveedor`, fuente única con
Autofirma) y el PDF firmado **sustituye** al que se soltó: lo que se registra
después es el firmado, no el que llegó por email. Al volver de Autofirma se
RE-ANALIZA, así que el aviso desaparece solo y la fila pasa a verde.

El botón va **antes** del "registrarlo igualmente": firmarlo ARREGLA el aviso;
forzarlo solo lo acepta como está. Y qué caja le toca a cada documento vive en un
mapa explícito (`CAJA_BROKERGY`) porque hoy solo el Anexo I lleva firma nuestra —
las fichas las firma el S.O. y nadie más.

⚠️ Qué firma falta viaja en ESTRUCTURA (`res.faltan[].rol`), no dentro de la frase
del aviso: leer eso de un texto en castellano se rompe la primera vez que alguien
mejore la redacción.

⚠️ `FirmarConCertificadoModal` **no se portalea solo**, así que se monta como
HERMANO del velo de este modal y no dentro (regla 29.b): metido dentro, su
`position: fixed` se ancla al ancestro con `backdrop-filter` y además scrollearía
con el listado de ficheros.

**REGLA — se registra por `guardarDocFirmado`, no por un camino nuevo.** Es la misma
función que usan la firma en cadena del enlace público y la subida a mano: ya
renombra con `_fdo`, deja la ficha en "10. EXPEDIENTE CAE" de su expediente y
retira el visto bueno anterior. El nombre del paquete (`E3-3-1 - 25RES060_90 -
Ficha RES060_fdo`) NO se pone aquí: lo pone `envioGestorService` al armar el ZIP,
y lo único que necesita es que la entrada tenga su `signed_link`.

**Dos tiempos, y el primero no escribe** (`dryRun`): se sueltan, se ve qué ha
entendido la app de cada fichero —incluido **con qué nombre va a quedar guardado**,
que es la mitad de lo que se revisa ahí— y solo entonces se aplica. De esto depende
qué PDF acaba dentro del ZIP que se presenta.

**Probado en producción el 2026-09-09**: el Anexo I y las **cinco** fichas de
LOTE-2026-008, soltados de golpe y registrados en 11 segundos, cada uno
identificado por su nombre y con sus firmas leídas del certificado (el Anexo I con
las dos: Francisco Javier Moya López + Pedro José López Montero; las fichas con la
del S.O.).

⚠️ El nombre del fichero llega de un formulario: en Windows puede traer la ruta
entera y algunos navegadores lo codifican en latin1. Se limpia en la ruta
(`Buffer.from(originalname,'latin1').toString('utf8')` + quitar la ruta) o el
emparejamiento falla por un nombre que en pantalla se ve bien.

**El resumen del popup de la solicitud va PLEGADO.** Son cinco páginas de
formulario dentro de un popup: abierto empuja "Enviar por API" —que es a lo que se
entra— fuera de la pantalla y obliga a recorrer el documento entero para llegar al
botón. Lo que se revisa ahí arriba son los CAMPOS; el documento se mira cuando se
quiere comprobar cómo ha quedado.
