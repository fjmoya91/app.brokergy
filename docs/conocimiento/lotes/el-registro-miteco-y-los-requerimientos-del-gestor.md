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
| E_CAE_2026_07019 / C-LM 2016-0752 | REGAGE26e00088169866 | **sin casar**: no es el de ningún justificante que tengamos |

LOTE-2026-007 se registró con REGAGE26e00088167025 (09/10 18:00) y no tiene requerimiento
en esta tanda; por descarte, el 07019 sería suyo solo si se presentó dos veces.

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
