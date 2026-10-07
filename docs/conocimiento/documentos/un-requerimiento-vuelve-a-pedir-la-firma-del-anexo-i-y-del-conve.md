<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Un REQUERIMIENTO vuelve a pedir la firma del Anexo I y del Convenio (2026-09-04)

Cuando el verificador emite un requerimiento y **cambia el importe de la ayuda**, el Anexo I
y el Convenio de Cesión que el cliente ya firmó dejan de servir: declaran una cifra que no
es la que se va a tramitar, y esa discrepancia es lo primero que compara quien los revisa.
Hasta ahora la app no tenía forma de decirlo — el expediente daba las dos firmas por
recibidas, el parte diario no vigilaba nada y el enlace del cliente le enseñaba sus dos
papeles como ya entregados.

Es el mismo mecanismo de re-firma del CIFO (regla 27), generalizado a los tres documentos.

| Qué | Dónde |
|---|---|
| Qué documentos tienen re-firma, y si la firma que hay sigue valiendo | [docValidacion.js](implementation/backend/utils/docValidacion.js) — `BORRADORES_CLIENTE.refirma`, `refirmaPendiente`, `firmaVigente` |
| Registrar el requerimiento (sello + contexto + historial) | `POST /api/expedientes/:id/documentos/rechazar` con `tipo:'requerimiento'` |
| Importes, plazo y TEXTOS del mensaje | [logic/requerimientoFirma.js](implementation/frontend/src/features/expedientes/logic/requerimientoFirma.js) |
| Superficie | El popup de **rechazo** del módulo Documentación, con dos modos; el envío, `EnviarAnexosModal` |
| Prueba del ciclo entero, sin BD | `node implementation/backend/scripts/test_refirma_requerimiento.js` |

**REGLA — se lanza desde el POPUP DE ENVÍO, igual que el del instalador.** El selector
*Primera firma · Requerimiento* va pegado al mensaje, que es donde se ve el efecto de
elegir uno u otro, y por defecto sale **Requerimiento cuando ya tenemos alguna firma** de
esos anexos: nadie reenvía por gusto un documento que ya volvió firmado (mismo criterio que
`CertificadoCifoModal`). Al lado, el plazo en días, porque de ahí salen la fecha del mensaje
y la de la página de firma y tienen que ser la misma. Cambiar de plantilla **rehace el
texto aunque se hubiera editado**: son dos mensajes que no comparten una sola frase.

**REGLA — el importe del mensaje se recalcula DENTRO del compositor, no se lee del render.**
Al pulsar la otra plantilla el estado aún no ha llegado, y el texto salía anunciando la
cifra de la plantilla anterior — un mensaje de primera firma prometiendo el importe del
requerimiento, o al revés.

**REGLA — quien SELLA la re-firma es el módulo de Documentación, no el popup.** El envío le
devuelve en `onMarkSent(docs, links, meta)` qué plantilla se usó; el módulo, que es el dueño
del expediente, sella `{doc}_refirma_at` **solo en los anexos de los que ya había firma**,
guarda el contexto y escribe el historial. Así el mismo sellado vale se entre por el popup
de envío o por el registro del requerimiento.

**REGLA — también es el MISMO botón que el rechazo, con dos modos.** El gesto es idéntico ("este
documento firmado ya no vale, hay que volver a pedirlo") y duplicarlo en un botón nuevo
habría llenado una fila que ya lleva tres controles. Lo que cambia es de quién es la culpa:
un rechazo dice "lo hemos corregido"; un requerimiento, "no has hecho nada mal, ha cambiado
el importe". Por eso el tipo se elige ARRIBA del todo y condiciona el texto, el destinatario
por defecto y los botones. Solo se ofrece sobre un anexo del cliente **ya firmado**: sin
firma que anular, un requerimiento no es más que un reenvío.

**REGLA — afecta a los DOS anexos a la vez.** Se firman juntos, en la misma sentada y desde
el mismo enlace: pedirlos por separado son dos mensajes el mismo día diciéndole cada uno que
le falta "un" documento. El sello va solo en los que YA están firmados — marcar uno que aún
no ha vuelto dejaría una re-firma pendiente eterna que el parte diario reclamaría para
siempre.

**REGLA — el importe nuevo sale del ahorro VERIFICADO, no de un campo del mensaje.** Es el
mismo número con el que se le va a pagar y el que imprime el convenio adjunto. El popup pide
el **ahorro verificado en kWh**, lo guarda en `instalacion.verificacion.ahorro_verificado_kwh`
y deja que `calculateFinancials` calcule el importe con las tarifas del expediente
(`results.caeBonusVerificado`); un importe tecleado a mano habría hecho que el mensaje y el
PDF pudieran decir cosas distintas, y el cliente firmaría el que no es.

**REGLA — mientras el requerimiento esté vivo, los anexos se GENERAN con la cifra nueva.**
No solo al reenviarlos: también desde el botón "Generar" de la fila (`resultsParaDocumento`).
El borrador de Drive es lo que sirve el enlace de firma, así que regenerarlo con el estimado
de siempre machacaría el bueno y el cliente volvería a firmar el documento invalidado, sin
que nadie lo notara. El anterior se archiva en `6. ANEXOS CAE/OLD`, como cualquier reemplazo.

**REGLA — el firmado que tenemos deja de CONTAR, pero no se borra.** `{doc}_refirma_at`
posterior a `{doc}_signed_at` significa "existe el fichero, pero es de la versión anterior":
el slot pasa a ámbar con su aviso (importe anterior → nuevo y plazo), la vista pública deja
de darlo por recibido y el radar del parte diario lo vigila como firma pendiente — contando
desde la re-firma, no desde el envío original, que es de hace meses y arrancaría el aviso con
un retraso inventado. Lo cierran las TRES vías por las que puede llegar la firma nueva: el
enlace público (`/anexos-upload`, que no pasa por `mergeDocumentacion` y lo hace a mano), el
PUT del expediente y la subida desde la app — esta última lo limpia explícitamente porque
Drive puede devolver el mismo enlace al reemplazar el fichero, y entonces el merge no lo vería.

**REGLA — un importe que BAJA se cuenta con lo que ha costado sostenerlo.** Un
requerimiento no es una carta que llega y se traslada: es un expediente que podía decaer
entero y que se ha defendido documento a documento hasta dejarlo aprobable. Anunciar la
cifra a secas convierte una gestión ganada en una mala noticia — el cliente entiende que le
hemos recortado la ayuda, cuando lo que se ha evitado es perderla. El mensaje dice primero
QUÉ SE HA HECHO y termina en que **el expediente sigue adelante**; la cifra va dentro de esa
frase, nunca antes. Solo se dice cuando el importe baja: si sube, o si no hay cifra nueva,
hablar de haberlo salvado es adornar algo que no ha pasado.

Y lo dicen IGUAL las cuatro superficies, porque es justo donde dos redacciones se
contradicen (una diciendo que hemos salvado el expediente y otra que la ayuda ha bajado): el
mensaje (`mensajeRequerimiento`), el asiento del correo y el aviso previo
(`tituloRequerimiento`) y la página de firma, que repite el relato en su propio JSX.

**REGLA — al cliente se le explica ANTES de que abra los papeles.** El mensaje dice, en este
orden: qué ha pasado, qué importe pasa a tener su ayuda, qué plazo tenemos, qué necesitamos y
que la versión anterior queda anulada. Y la página de firma repite el aviso con las mismas
cifras: quien vuelve al enlace desde un WhatsApp de hace un mes no tiene el correo delante.
Se le dice expresamente que **no ha hecho nada mal** — es la primera conclusión a la que
llega quien recibe dos veces el mismo documento.

**REGLA — el aviso previo del popup es OPCIONAL y por defecto no se manda.** Los documentos
nuevos salen a continuación con su propio mensaje; dos correos seguidos sobre lo mismo se
leen como un lío. Por eso elegir "Requerimiento" pone el destinatario del aviso en "sin
aviso".
