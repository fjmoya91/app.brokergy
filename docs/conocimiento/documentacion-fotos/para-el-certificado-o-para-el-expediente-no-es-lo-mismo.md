<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «REVISAR el CEE que entrega el certificador (2026-09-21)», en el CLAUDE.md antiguo.

### Para el CERTIFICADO o para el EXPEDIENTE: no es lo mismo (2026-09-21)

Las fotos de una obra sirven para dos cosas distintas y tenían la misma pinta:

| Destino | Qué es | Cuándo se pide |
|---|---|---|
| **`CEE`** | La fachada desde la calle, las paredes que dan a patios, el vídeo, los planos, el CEE anterior. Es lo que el CERTIFICADOR necesita para modelar la vivienda en CE3X | ANTES de aceptar, y deja de pedirse cuando el CEE inicial queda registrado |
| **`EXPEDIENTE`** | Caldera y su placa, máquinas nuevas y las suyas, caldera retirada, envolvente antes/después, facturas | Es lo que justifica la actuación: de aquí salen el Anexo Fotográfico y el CIFO |

Mezclados en una lista corrida, ni el admin sabía qué hacía falta para qué ni se
podía pedir una cosa sin la otra — y pedirle a la vez la fachada (que puede
hacer hoy) y la máquina nueva instalada (que no existe) es pedirle una foto
imposible, que es lo que hace que no atienda ninguna.

**REGLA — el destino es un ATRIBUTO del slot** (`destinoDeSlot` en
[reformaUploadService.js](implementation/backend/services/reformaUploadService.js)),
no una lista que cada vista rehace. Lo declara el checklist y lo consumen las tres
superficies: los dos bloques del panel, los botones de petición y el titular que
ve el cliente.

⚠️ En un **RES080 la ENVOLVENTE es del EXPEDIENTE**, no del certificado: son los
slots `FOTO_VENTANAS_ANTES`/`_DESPUES` y compañía, distintos de
`FOTO_FACHADA_PRINCIPAL`, que es la fachada desde la calle y solo sirve de
contexto para el CEE.

**Al cliente se le dice PARA QUÉ.** Si todo lo que se le pide es del mismo
destino, el enlace lo explica en una línea ("esto es para poder hacer el
certificado energético de tu vivienda; con estas fotos el técnico se ahorra una
visita"). Mezclado no se dice nada: afirmar "esto es para el certificado" con
media lista de la obra sería mentir a medias.

**REGLA — lo `optionalAlways` NO se reclama.** El CEE anterior se le OFRECE ("si
ya tienes uno") y el RITE lo emite el instalador: meterlos en una lista de "nos
falta" le reclama al cliente un papel que puede no existir, y le deja la
sensación de que su expediente está parado por su culpa cuando no lo está. Siguen
en la lista del popup para marcarlos a mano.

**REGLA — mientras la obra no esté terminada, lo del DESPUÉS no se preselecciona.**
El botón dice cuántas va a pedir, y ese número tiene que ser el de verdad: si
contara 9 y la lista viniera con 4 marcadas, sería una promesa falsa.
