<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## El Nº de REGISTRO del MITECO en el lote, y los requerimientos del Gestor (2026-10-27)

El 27/10/2026 llegaron cinco requerimientos del Gestor Autonómico de Castilla-La Mancha
(E_CAE_2026_07019 … 07023, firmados el 26/10, plazo de 10 días), todos iguales: «se ha
presentado el dictamen del verificador, pero no se ha adjuntado el informe
correspondiente». Ninguno nombra el lote, ni el dictamen, ni un expediente: solo citan la
solicitud por su **nº de registro REGAGE…**, que sale en el justificante que devuelve la
sede al presentarla. Para repartirlos hubo que leer el justificante de cada lote (y, el
del LOTE-2025-002, bajarlo del correo de Interalco: en la app seguía el del 02/09).

| Requerimiento | Registro | Lote |
|---|---|---|
| E_CAE_2026_07023 / C-LM 2016-0756 | REGAGE26e00088159961 (09/10 17:11) | LOTE-2025-002 (nueva presentación) |
| E_CAE_2026_07022 / C-LM 2016-0755 | REGAGE26e00088163268 (09/10 17:33) | LOTE-2025-005 |
| E_CAE_2026_07021 / C-LM 2016-0754 | REGAGE26e00088164963 (09/10 17:46) | LOTE-2025-006 |
| E_CAE_2026_07020 / C-LM 2016-0753 | REGAGE26e00088168779 (09/10 18:13) | LOTE-2026-008 |
| E_CAE_2026_07019 / C-LM 2016-0752 | REGAGE26e00088169866 | LOTE-2026-007 (lo confirmó Fran el 27/10) |

El 07019 no se casó por el número: el requerimiento cita REGAGE26e00088169866 y el
LOTE-2026-007 se registró con REGAGE26e00088167025 (09/10 18:00). Fran confirmó el 27/10
que los lotes de la tanda son el 2, 5, 6, 7 y 8, y lo cerró el justificante de la
subsanación: la sede colgó la del 07019 de la solicitud **…167025**, la del 007. El
`registro_miteco` del 007 se queda como estaba. **Un requerimiento se casa por el
justificante de su subsanación, no por el número que cite.**

**La subsanación (27/10/2026).** Interalco subió esa tarde el informe en cada uno. El
justificante de una subsanación lleva DOS registros: el suyo y el de la solicitud a la que
se aporta (es lo que lo casa con el lote).

| Requerimiento | Registro de la subsanación | Solicitud | Lote |
|---|---|---|---|
| 07023 | REGAGE26e00092679075 | …159961 | LOTE-2025-002 |
| 07022 | REGAGE26e00092679950 | …163268 | LOTE-2025-005 |
| 07021 | REGAGE26e00092680498 | …164963 | LOTE-2025-006 |
| 07020 | REGAGE26e00092681034 | …168779 | LOTE-2026-008 |
| 07019 | REGAGE26e00092681588 | …167025 | LOTE-2026-007 |
| (sin requerimiento) | REGAGE26e00092682715 | …91699648 | LOTE-2025-009 |

El LOTE-2025-009 no tenía requerimiento: el informe se aportó como «Adjuntar
documentación adicional» a la solicitud, que no da justificante descargable; queda la
captura de la sede. Todo se guarda en `{LOTE} - DOC. VERIFICACIÓN` junto al requerimiento:
`5.2 Justificante de subsanacion 1 {LOTE}.pdf` y, en el 009,
`5.2 Aportacion del informe en la sede - captura LOTE-2025-009.png`.

**Dónde se archivan.** Cada requerimiento se guardó en Drive como
`{LOTE} - DOC. VERIFICACIÓN / 5.2 Requerimiento de la G.A. 1 {LOTE}.pdf` (el nombre del
slot `requerimiento_ga`), copiándolo a la carpeta y **sin** subirlo por
`POST /api/lotes/:id/documentos/requerimiento_ga`. Esa ruta pasa el lote y todos sus
expedientes a REQUERIMIENTO G.A. y mueve sus carpetas a la de requerimientos: para un
requerimiento que solo pide aportar el informe, que el Sujeto Obligado sube en la sede,
no compensa. Los cinco lotes siguen SUBIDO A MITECO.

El mismo 27/10 se mandó a Interalco (Jesús Almodóvar), en el hilo de cada lote, el
informe de verificación de los cinco. El LOTE-2025-009 (presentado el 23/10, sin el
informe) aún no tiene requerimiento.

**Por qué faltaba el informe.** El paquete `gestor` ([envioGestorService.js](implementation/backend/services/envioGestorService.js), `INDICE`)
mete el DICTAMEN (`E{n}-2`) y los escritos del lote (`E{n}-5-x`), pero no el INFORME de
verificación. Comprobado en los ZIP subidos: ni los de los cinco lotes del 09/10 ni los
del LOTE-2025-009 (presentado el 23/10) lo llevan. El informe de cada lote está en la app
(`documentos_so`, slot `informe_verificacion`) y en Drive como
`{LOTE} - DOC. VERIFICACIÓN / 4.2 Informe de Verificación {LOTE}.pdf`. Desde el
27/10/2026 el paquete lo lleva como pieza obligatoria `E{n}-2-1` (ver "El PAQUETE de cada
actuación"); los lotes ya presentados se subsanan aportando ese PDF, sin rehacer los ZIP.

| Qué | Dónde |
|---|---|
| Columna `lotes.registro_miteco` | [scripts/lotes_registro_miteco.sql](implementation/backend/scripts/lotes_registro_miteco.sql) (aplicada el 27/10/2026) |
| Leer el REGAGE del justificante | [utils/regageJustificante.js](implementation/backend/utils/regageJustificante.js) |
| Rellenarlo al subir el justificante; corregirlo a mano | `POST /api/lotes/:id/documentos/justificante_miteco` y `PATCH /api/lotes/:id` en [routes/lotes.js](implementation/backend/routes/lotes.js) |
| El campo y la chapa 🏛 | [LoteDetailModal.jsx](implementation/frontend/src/features/lotes/components/LoteDetailModal.jsx) y [LotesView.jsx](implementation/frontend/src/features/lotes/views/LotesView.jsx) |
| Rellenar los lotes ya presentados | `node implementation/backend/scripts/rellenar_registro_miteco.js` (en seco; `--aplicar`, `--forzar CODIGO=REGAGE…`) |
| Prueba | `node implementation/backend/scripts/test_regage_justificante.js [justificantes.pdf]` |

**REGLA — el nº de registro se LEE del justificante, sin IA.** La sede escribe el número en
claro (a veces en un stream Flate): basta inflar los streams y buscar `REGAGE\d\d[a-z]\d+`.
Probado con los once justificantes de los lotes 001 a 009. Con dos números distintos en el
mismo PDF no se adivina: se deja vacío.

**REGLA — un justificante nuevo es una presentación nueva: su número MANDA.** Se sustituye
el que hubiera y el anterior queda en el historial del lote (como en LOTE-2025-002, que se
presentó el 02/09 y otra vez el 09/10).

**REGLA — va junto al nº del verificador, y lo ve y edita todo el staff.** Son los dos
nombres del lote fuera de casa: `⧉ CAE-1711` (el verificador) y `🏛 REGAGE…` (el MITECO).
No es un dato económico.
