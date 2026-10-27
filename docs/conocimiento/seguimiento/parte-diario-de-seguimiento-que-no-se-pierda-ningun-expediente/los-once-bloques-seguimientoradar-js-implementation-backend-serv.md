<!-- conocimiento · área: seguimiento · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)»; la introducción y el resto, en esta misma carpeta.

### Los once bloques — [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js)

Cada detector responde a lo mismo: *¿de quién es la pelota y desde cuándo?* Los plazos y
la reinsistencia viven en el mapa `BLOQUES` (todos con variable de entorno).

| Bloque | Criterio | Pelota | Botón |
|---|---|---|---|
| `RECHAZO_SIN_REENVIAR` | `rechazoBorrador().obsoleto` >2 d | BROKERGY | — (corregir y regenerar) |
| `REVISION` | `cee_* ∈ PRESENTADO/PTE_REVISION` (plazo 0) | BROKERGY | — |
| `OBRA_SIN_CERRAR` | obra ejecutada + `cee_final` sin encargar >5 d | BROKERGY | — |
| `TRAMITACION` | `PTE FIN EXPTE`/`REVISADO Y LISTO (FINAL)` con documentos **sin generar ni enviar** >10 d | BROKERGY | — |
| `SIN_LOTEAR` | `loteService.ESTADOS_COMPLETO` sin `lote_id` >15 d | BROKERGY | — (meterlo en un lote) |
| `REGISTRO` | `cee_* = REVISADO` **sin fecha de registro** >2 d | CERTIFICADOR | Recordar el registro |
| `CERT_SIN_ENTREGAR` | `ASIGNADO/EN_TRABAJO/PTE_PRESENTACION` >10 d | CERTIFICADOR | Pedir fecha |
| `SIN_ENCARGAR` | encargo sin salir, **con técnico o sin él** (plazo 0); si el agente revisa su documentación tras la aceptación, el detalle dice qué hace (`detalleAgente`, regla 158) | BROKERGY | — |
| `MIGRADO_SIN_REVISAR` | `PENDIENTE REVISAR EXPTE` >15 d | BROKERGY | — |
| `FIRMA_PENDIENTE` | `_sent_at` sin `_signed_link` >7 d | CLIENTE/INSTALADOR | Recordar la firma |
| `FIN_OBRA` | CEE ini. registrado, sin señales de obra >30 d | CLIENTE/INSTALADOR | ¿Cómo va la obra? |

**REGLA — `TRAMITACION` cubre lo que NO SE HA PEDIDO; `FIRMA_PENDIENTE`, lo pedido que no
vuelve.** El reparto es por `_sent_at`, y no es un matiz: aquél exige que el documento
haya salido, así que **un CIFO que nunca se generó no lo reclamaba nadie** (11 de 19
expedientes en `PTE FIN EXPTE` estaban así). Con los dos, ningún documento se cae entre
las dos sillas y ningún expediente sale por partida doble diciendo lo mismo. El RITE
entra solo **mientras bloquee** —o sea, mientras el CIFO no esté firmado—: lo aporta el
instalador y con el CIFO ya firmado no desbloquea nada.

**REGLA — en `REGISTRO` cada fila dice QUIÉN lo registra** (decisión del usuario,
2026-10-11): el técnico que lo firma («Luis», «Raquel») y, si lo firma el de la CASA (por
CIF, como `esDeBrokergy`), «Fran (Eva)», porque esos los presenta Eva. Si la presentación
ya se encargó (`cee.presentacion[fase].enviado_at` sin `registrado_at`), entre paréntesis va
a quién se le encargó; un «Fran (Eva)» sin encargo sale en ámbar «· sin enviarle». Encima
del bloque, el reparto (cuántos tiene cada uno). Lo calcula `quienRegistra` en
`rellenarNombres` (`f.registra`); del encargo solo viajan el nombre y la fecha, nunca el
`nonce` del enlace.

**REGLA — a los CEE de Fran no se les «recuerda al certificador»: los presenta la casa**
(desde el 25/10/2026: Eva ya no presenta; `aLaCasa` deja la fila en REGISTRO como «Presentarlo (firma y tasa en el PC)», responsable BROKERGY y sin tarjeta de Despachar — ver «El VISTO BUENO deja el CEE listo para presentar»). Lo que sigue es lo que había del 11/10/2026 al 25/10/2026, ya sin entrada:
(decisión del usuario, 2026-10-11). Era escribirse a uno mismo. `aEva` les cambia la
acción a `presentar-cee` (responsable `PRESENTADOR`): en Despachar salen en UNA tarjeta
«Eva» cuyo popup ([PresentarEvaModal.jsx](implementation/frontend/src/features/seguimiento/components/PresentarEvaModal.jsx))
abre, uno a uno, el MISMO `EncargarPresentacionModal` del módulo CEE (correo con el
borrador y los tres ficheros); en Revisar, la fila lleva «✉ Enviar a Eva». No es un
mensaje de `seguimientoLote` ni tiene enlace de un clic en el parte diario (allí sale como
«abrir el expediente»). El aviso es el propio encargo: enviado hace menos de 3 días
(`reinsistir` de REGISTRO) la fila calla; pasado, se ofrece «Reenviar a Eva», que le
cambia el enlace (el popup lo advierte).

**REGLA — con FECHA DE REGISTRO el CEE está registrado, diga lo que diga el subestado**
(2026-10-12). El 25RES080_31 (CEE final registrado el 29/12/2025, ya en MITECO) salió en
«Enviar a presentar a Eva»: se le dio otra vez el visto bueno desde el portal y
`POST /:id/approve-cee` lo devolvió de `REGISTRADO` a `REVISADO`. Dos arreglos: esa ruta
ya no baja un CEE `REGISTRADO` (el mensaje sale igual, el subestado solo avanza), y
`detectarRegistro` se salta la fase con `fecha_registro_cee_{inicial,final}` o con
`presentacion[fase].registrado_at`.

**REGLA — `SIN_LOTEAR` es el único bloque que habla de DINERO, no de un documento.** El
CAE no se emite ni se cobra hasta que el expediente entra en un lote, y ese tramo estaba
**entero fuera del parte**: 28 expedientes el 07/09/2026, el más viejo de hacía dos
meses. Su fecha es el último hito documental (registro del CEE final, o el inicial de
respaldo), nunca `updated_at`, que se mueve al abrir y guardar la ficha y rejuvenecería
justo al que más lleva esperando.

**REGLA — quién puede lotearse lo decide `loteService.ESTADOS_COMPLETO`, y se IMPORTA.**
Solo `DOC. COMPLETA`. La primera versión copió la lista aquí y añadió
`DOC. COMPLETA APPSHEET`: 24 líneas mandándote a hacer algo que `evaluarElegibilidadBase`
rechaza con un 400. Un parte que propone acciones imposibles se deja de mirar entero.
⚠️ Los migrados de AppSheet quedan hoy **sin ningún bloque** —tampoco entran en
`TRAMITACION`, donde listarles lo que "falta" serían 18 alarmas falsas: su documentación
vive en el Drive antiguo—. Harán falta uno propio en cuanto se decida qué hay que
hacerles para llevarlos a `DOC. COMPLETA`.

**El buscador vale para las DOS vistas.** En REVISAR no hay 28 tarjetas sino ~150 filas
en once bloques plegados, así que sin él responder "¿y el 26RES060_119?" obliga a
abrirlos todos. Filtra las FILAS (nº de expediente, cliente, municipio, certificador o
instalador), descarta el bloque que se queda sin ninguna —una cabecera vacía haría creer
que el expediente está dentro— y **abre los bloques solos** mientras haya filtro.

**REGLA — tener TÉCNICO no es haberle ENCARGADO.** `detectarSinEncargar` salía por
`if (e.certificador_id) return` dando por hecho que con técnico puesto ya lo cubría otro
bloque, y no: `CERT_SIN_ENTREGAR` arranca en `ASIGNADO`, o sea cuando el encargo YA
SALIÓ. Un expediente con técnico elegido y el encargo sin mandar no lo miraba nadie
(26RES093_1 y 26RES060_128, parados 146 y 131 días). Es el peor sitio donde esconderse,
porque en la ficha parece que está en marcha.

**REGLA — "sin fin de obra" NO es un solo caso.** Si hay factura, CIFO o RITE, la obra
está HECHA y lo que falta es encargar el CEE final (`OBRA_SIN_CERRAR`, pelota nuestra).
Preguntarle "¿cómo va la obra?" a quien ya facturó es quedar mal con quien cumplió y
además esconde el atasco verdadero. Medido: 9 de 25 estaban así.

**REGLA — un MIGRADO no necesita encargo de CEE**: el suyo se hizo en el sistema
antiguo. Lo que le falta es que alguien lo audite (`MIGRADO_SIN_REVISAR`). Sin esta
salida, 15 migrados pedían un CEE que ya existe.

**REGLA — las firmas se agrupan por FIRMANTE, no por documento.** Al cliente le faltan
a la vez el Anexo I y la Cesión y los firma de una sentada en el mismo enlace: una fila
por documento son dos recordatorios el mismo día diciéndole cada uno que le falta "un"
documento.

**REGLA — UNA consulta para los ocho detectores, con campos CONCRETOS del JSONB.**
Nunca `cee` ni `documentacion` enteros (regla 22): `cee.xml_inicial` son megas.
