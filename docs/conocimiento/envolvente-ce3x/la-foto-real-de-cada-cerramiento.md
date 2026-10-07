<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La FOTO REAL de cada cerramiento (2026-09-15)

El plano dice que FBS3 da a la calle y mide 10,94 m. **No dice qué hay en ella.**
Eso se mira en una foto — y la foto casi siempre ya está en el expediente: el
cliente subió «tu casa vista desde la calle» y «las paredes que dan a un patio»
al hacer la simulación. Medido en 26RES060_186: **6 fotos de la envolvente** (2
de fachada, 4 de patios) llevando meses en Drive, mientras el certificador
contaba las ventanas a ojo y dejaba el `1,30 × 1,30` de por defecto.

Ahora se pulsa una pared —o un hueco— y se le pega la suya.

| Qué | Dónde |
|---|---|
| La foto ↔ el cerramiento (Drive + estado) | [paredFotoService.js](implementation/backend/services/paredFotoService.js) |
| La lectura (prompts, cajas, escala) | [paredOcrService.js](implementation/backend/services/paredOcrService.js) |
| Rutas | `GET|POST|DELETE /api/cee-envolvente/:id/fotos` · `/fotos/adoptar` · `/fotos/:driveId/contenido` · `POST /fotos/leer` — **internalOnly** |
| Superficie | `FotosCerramiento` en el panel de la pared y dentro de cada hueco; `LecturaFotoModal` para revisar |
| Aplicar al plano | `aplicaHuecosLeidos` / `anotaLecturaHueco` en `usePlanoEnvolvente` |
| Prueba de lo determinista | `node implementation/backend/scripts/test_pared_ocr.mjs` |
| Contra un expediente real, sin escribir | `node implementation/backend/scripts/probar_pared_ocr.js 26RES060_186 --pared=FBS3 --largo=10.94` |

**REGLA — primero lo que YA HAY, y después subir.** El botón abre la lista de
fotos del expediente (`FOTO_FACHADA_PRINCIPAL`, `FOTO_PATIOS_INTERIORES`,
`FOTO_VENTANAS_ANTES`…) ANTES que el selector de ficheros. Volver a pedirle al
cliente una foto que mandó en junio es la peor forma de estrenar esto, y además
la suya es la buena: es de antes de la obra. Una foto del expediente se
**REFERENCIA, no se copia** —ya está en su carpeta y ya la ve el gestor de
documentación—, y si el original desaparece se dice (`roto`), nunca se enseña un
hueco negro.

**REGLA — la foto vale AUNQUE NO SE LEA.** Que FBS3 tenga la suya es la prueba de
por qué ese cerramiento se clasificó como fachada y por qué tiene dos ventanas.
Por eso el bloque sale también en MEDIANERAS y particiones, donde más vale: es lo
que acredita que al otro lado hay un edificio y no un solar.

**REGLA — el modelo NO da metros; los pone el código.** Se le piden CAJAS
(`box_2d`, el formato de detección en el que está calibrado) y `aMetros()` las
convierte. Un metraje inventado por un modelo acaba siendo una superficie de
huecos dentro de un certificado sin que nadie sepa de dónde salió.

**REGLA — la escala es la PUERTA DE ENTRADA, no el ancho de la pared.** Es lo
contrario de lo que parece, y está medido sobre la fachada de 26RES060_186:

1. **La fachada nunca ocupa el encuadre exacto** (hay cielo, acera, la casa del
   vecino), así que tomar el ancho de la foto por el ancho de la pared mete un
   error que nadie puede acotar — daba la ventana a **2,4 m**.
2. **El modelo sobreestima las cajas ~1,5×** de forma sistemática (dio la puerta
   a 0,117 × 0,371 cuando en la imagen es 0,082 × 0,223) pero CONSISTENTE, así
   que las proporciones ENTRE huecos sí son buenas — y una referencia dentro de
   la misma foto cancela el sesgo entero.

Con la puerta (2,05 m de alto, que casi no varía; el ancho va de 0,80 a 1,40) la
ventana sale a **1,71 × 1,73 m** y la puerta de garaje a 1,02 m, que es lo que se
ve. **El largo de la pared VALIDA, no escala**: si los huecos suman más que la
pared, o si el ancho de fachada que sale de la escala no se parece al que midió
el motor, se dice y no se proponen medidas. Sin puerta a la vista **no hay
medidas, solo recuento** — que es lo que más falta hacía.

**REGLA — lo leído NACE DUDOSO.** Ni la mejor lectura de una foto en perspectiva
es un metro. Entra por el ámbar que la pantalla YA tiene, lo cuenta el titular
(«6 con medida por confirmar») y se cierra con el «✓ OK» que ya existe. No hace
falta un estado nuevo.

**REGLA — no se PISA lo que ya hay.** Con la pared vacía, lo leído se ofrece
marcado; con huecos ya puestos, las casillas nacen DESMARCADAS y se dice cuántos
hay. Reemplazarlos es un botón aparte que se lee como lo que es («Quitar los 4 y
poner estos 4»). ⚠️ Importa porque señalar la entrada YA coloca una puerta y una
ventana de relleno: sin ese botón, leer una fachada duplicaría siempre.

**REGLA — la carpintería y el vidrio se GUARDAN y se enseñan, pero NO van al
`.cex`.** `loSenalado` no tiene hoy casilla para ellos, y escribir en un
certificado un dato cuyo camino no se ha verificado es justo lo que la casa no
hace. El popup lo dice en pantalla. El día que haya casilla, el dato ya está.

⚠️ **`thinkingBudget: 0` CUELGA esta lectura.** Los demás lectores de la casa
transcriben —una placa se lee, no se razona— y por eso van con el presupuesto a
cero. Inventariar una fachada exige razonar, y ahí el resultado no es «peor»: la
petición **NO RESPONDE NUNCA**. Medido: 240 s colgada, y 13,3 s con `pensar`. No
es lentitud, así que **no se arregla subiendo el plazo**; y engaña, porque el
prompt largo con schema pequeño va, y el schema grande con prompt corto también
— es la combinación la que lo dispara. `llamarGemini` acepta `pensar` y
`deadline` para esto (por defecto sigue siendo lo de las placas, que no cambia).

**Coste medido**: entrada 1.099 · salida 516 · **pensamiento 2.148** tokens ≈
**0,006 €** por fachada, 12-17 s. Es diez veces una placa —el pensamiento se
factura como salida— y sigue siendo medio céntimo.

**Dónde vive**: los ficheros en Drive, en `1. CEE / CEE INICIAL / FOTOS
ENVOLVENTE` (cuelga de la carpeta que ya se comparte con el certificador, y en su
propia subcarpeta para no esconder los `.cex` entre quince fotos). En la BD, solo
metadatos en **`cee.envolvente_fotos`** — clave APARTE del trabajo, porque
`cee.envolvente` lo reemplaza entero el navegador cada 1,2 s y una foto subida
entre dos guardados se perdería (mismo motivo que `cee.envolvente_imagenes`).

**REGLA — se indexa por el ID DE CATASTRO, no por el nombre.** El nombre de una
pared es editable (FBE1 → PBE1 al reclasificarla), así que indexar por él haría
que renombrar una pared perdiera sus fotos. Y un hueco, por `id/uid`: su `uid` es
nuevo y estable, porque ni el nombre (V1) ni el índice lo son — el índice se
mueve con cada `splice` y el nombre se recoloca solo. `duplicaHueco` estrena uid:
con el del original, despegarle la foto a uno se la quitaría al otro.

⚠️ Al abrir una foto no sale un lightbox: sale el **panel de la pared y cada hueco
señalado sobre la imagen** — ver la sección de abajo.

⚠️ La miniatura se pide con **axios a un blob**, no con un `<img src>`: la ruta es
`internalOnly` y un `src` no puede llevar la cabecera de sesión. Así no hace falta
abrir una ruta pública con el id de Drive en la URL (a diferencia de
`reforma-thumb`, que sí la necesita porque la abre el cliente).

### La foto ABIERTA es una pantalla de trabajo, no un lightbox

Al pulsar una foto se abre con **el panel de la pared al lado** —qué es, cuánto mide,
su U, y la lista de sus huecos con sus medidas— y **cada hueco SEÑALADO sobre la
imagen** con su nombre: V1 es esa ventana, PE es esa puerta. Era el nombre del
fichero y nada más, y la foto se abre justo para contestar «¿cuál de estas es V1?».

| Qué | Dónde |
|---|---|
| El dibujo, las marcas y el gesto de señalar | [VisorCerramiento.jsx](implementation/frontend/src/features/cee-envolvente/components/VisorCerramiento.jsx) |
| Bajar los bytes y guardar (lo que toca la red) | `VisorAbierto` en `FotosCerramiento.jsx` |
| Normalizar y escribir la marca | `normalizarMarcas` / `guardarMarcas` en [paredFotoService.js](implementation/backend/services/paredFotoService.js) |
| Ruta | `PUT /api/cee-envolvente/:id/fotos/marcas` — **internalOnly** |

**REGLA — las marcas salen SOLAS de la lectura.** El modelo ya devuelve la caja de
cada hueco (`box_2d`), así que `aMetros` la conserva en fracciones del encuadre y
al aplicar la propuesta se escriben las marcas de una vez. Tirarla —como se hacía—
obligaba a atar las ventanas a mano una por una habiendo mirado ya dónde están.

**REGLA — el `uid` se fija ANTES de crear los huecos.** Si naciera dentro del hook
no habría forma de saber qué uid le tocó a cada caja, y la marca acabaría en otra
ventana. Por eso `aplicaHuecosLeidos` respeta un `uid` que venga puesto.

**REGLA — la marca vive con la FOTO, no con el hueco.** Es «dónde está esto EN ESTA
IMAGEN», y la misma ventana tiene otra caja en otra toma. Además `cee.envolvente` lo
reemplaza entero el navegador cada 1,2 s y son ~2 KB a propósito: cuatro números por
hueco lo engordarían sin que nadie lo pidiera.

**REGLA — se guarda el `uid`, jamás el NOMBRE.** V1 se renombra, y se recoloca solo
al quitar un hueco de en medio: con el nombre, la marca señalaría a la ventana de al
lado. Una marca cuyo hueco ya no existe **no se pinta y no se borra**: el hueco puede
volver de un «deshacer».

**REGLA — al aplicar una lectura se FUNDE; desde el visor, NO.** La lectura solo sabe
de los huecos que acaba de proponer, así que una lista completa se llevaría por
delante lo que el certificador señaló a mano en esa misma foto. En el visor la lista
SÍ es la verdad — quitar una marca es mandarla sin ella.

**REGLA — las marcas se escriben AL MOMENTO, no al cerrar.** Quien señala tres
ventanas y cierra la pestaña no puede perderlas, y no hay ningún botón de guardar que
le diga que hacía falta. Si la escritura falla, la marca **se retira de la pantalla**:
dejarla pintada haría dar por señalado un hueco que al volver no lo está.

**REGLA — el COLOR es el del PLANO** (`COLOR_HUECO`, importado de `PlanoPlanta`):
ventana azul (el del vidrio) y puerta marrón. Dos lenguajes de color para lo mismo
obligan a traducir entre las dos pantallas.

⚠️ **`var(--brand)` NO EXISTE — el token es `--brand-primary`.** Y en un atributo SVG
eso no falla de forma visible: se resuelve a **NEGRO**, así que el rótulo de cada
ventana salía como un rectángulo negro sobre la fachada sin que nada lo delatara. Las
clases de Tailwind (`text-brand`, `bg-brand`) sí funcionan — son un color de su
config, no esa variable.

⚠️ **Arrastrar sobre una `<img>` la SELECCIONA y la tiñe del azul del sistema.** Las
cajas se dibujaban bien debajo, pero la foto se volvía ilegible justo mientras se
señalaba sobre ella. Hacen falta las tres: `draggable={false}`, `select-none` y
`preventDefault()` en el `pointerdown`.

⚠️ El contenedor de la foto lleva su **relación de aspecto** medida en el `onLoad`
(`style={{aspectRatio}}`): con `object-contain` sobran bandas por dos lados y el SVG
—que va al 100 % del contenedor— dejaría todas las cajas corridas.

⚠️ La **relación de aspecto** de la foto viaja desde el navegador, que ya tiene el
blob. Sin ella no se puede cruzar una escala vertical con una horizontal, y una
foto muy escorzada daría medidas tranquilas. Pedírsela al backend obligaría a
meter una librería de imagen en el contenedor para leer dos números.
