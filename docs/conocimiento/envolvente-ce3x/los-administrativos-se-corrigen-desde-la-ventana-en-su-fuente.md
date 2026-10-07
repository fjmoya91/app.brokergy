<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Los administrativos se CORRIGEN desde la ventana, en su fuente (2026-09-14)

Dos cosas que salieron de usarla, y son la misma: la pestaña de **Datos
administrativos** decía «no consta» de datos que la app SÍ tiene, y no daba
forma de arreglarlos sin cerrar la pestaña.

| Qué | Dónde |
|---|---|
| La cascada del teléfono y el correo del titular | `contactoDelCliente()` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) |
| Escribir en la ficha del cliente / del técnico | `guardarCliente` · `guardarTecnico` · `fuenteEditable` en [ceeEnvolventeCex.js](implementation/backend/services/ceeEnvolventeCex.js) |
| Rutas | `PUT /:id/cliente` (**staffOnly**) · `PUT /:id/tecnico` (equipo interno **o el propio técnico**) |
| Superficie | `PanelAdministrativos` / `GrupoFicha` en [PanelesFicha.jsx](implementation/frontend/src/features/cee-envolvente/components/PanelesFicha.jsx) |
| Prueba | `node implementation/backend/scripts/test_contacto_cliente_ce3x.mjs` |

**REGLA — el teléfono y el correo del titular caen a su PERSONA DE CONTACTO, y
se dice con su nombre.** En muchas obras quien lleva el trato es un hijo, la
pareja o el instalador, y su número —el marcado «Notif. aquí»— es el único que
tenemos: la ficha preguntaba solo por `tlf` y `email`, así que ese dato no
llegaba nunca al `.cex`. Medido en 26RES060_187: el titular los tiene a null y
los de JUAN ANTONIO estaban escritos dos líneas más abajo. El del TITULAR manda
cuando existe —en el certificado el cliente es él—, la decisión es **campo a
campo** (hay fichas con el móvil del titular y el correo del contacto), y cuando
sale del contacto el `de:` lo dice: no es lo mismo el correo de quien firma que
el de quien lleva la obra.

**REGLA — se corrige EN LA FUENTE, no en una copia.** El botón de editar escribe
en `clientes` y en `prescriptores`, que es de donde lo lee todo lo demás: el
Anexo I, el convenio y los avisos. Un titular guardado también dentro del
trabajo acabaría ganándolo el que se guardara el último. Por eso la regla de la
pestaña sigue en pie —los administrativos NO se teclean en la ficha— y lo que
cambia es que ya no hay que salir a arreglarlos a otra pantalla.

**REGLA — en LECTURA se enseña lo compuesto; en EDICIÓN, las COLUMNAS.** Lo que
hay que revisar es lo que va a ir al `.cex` (el nombre ya unido a los apellidos,
la provincia pasada por el desplegable de CE3X), y sobre eso no se puede
escribir: dejar editable «Nombre o razón social» obligaría a adivinar dónde
acaban el nombre y empiezan los apellidos. El backend devuelve `fuente` —las
columnas en crudo— FUERA de `ficha`, que es lo que se le manda al motor.

**REGLA — el CLIENTE lo corrige el equipo interno; el TÉCNICO, también ÉL.** Del
titular cuelgan el Anexo I y el convenio que ya puede estar firmado: ahí el
certificador no pinta nada. Sus once campos sí son suyos —es él quien sabe su nº
de colegiado— y se comprueban contra el certificador **ASIGNADO** a ese
expediente, nunca sobre la ficha de otro. El `dni` del cliente no está en la
lista: el bloque de CE3X no tiene NIF y ése cuelga de documentos firmados.

**REGLA — lo que se escribe pasa por `normalizeData`,** igual que el formulario
de Clientes. Si no, el mismo dato quedaría en MAYÚSCULAS escrito desde una
pantalla y capitalizado desde la otra, y `provinciaCe3x` —que casa contra un
desplegable de CE3X— dejaría de encontrarlo.
