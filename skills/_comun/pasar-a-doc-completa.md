# Pasar un expediente a DOC. COMPLETA: primero se VALIDA todo

**Decisión de Fran (05/11/2026, 26RES060_198 y _202):** «cuando lo pasemos a DOC. COMPLETA es porque
se supone que se ha validado todo. Esto debe hacerse siempre».

DOC. COMPLETA significa que el expediente entra en el siguiente lote **aunque tenga incidencias**. El
verificador audita la carpeta **«10. EXPEDIENTE CAE»**, y un documento solo llega a ella cuando se
VALIDA (el ✓ de la pestaña Documentación). Por eso, antes de cambiar el estado:

1. **Valida cada documento firmado, uno por uno**, por la ruta de la app:
   `POST api/expedientes/<id>/documentos/validar` con `{ "field": "<campo>" }`. La ruta comprueba la
   firma, copia el fichero a «10. EXPEDIENTE CAE» y sella `docs_validados`. Los campos:
   - siempre: `anexo_i_signed_link`, `anexo_cesion_signed_link`, `cert_cifo_signed_link`,
     `facturas_combined_link`, `cert_rite_drive_link`, `anexo_fotografico_signed_link`;
   - si están: `cert_rite_signed_link` (Memoria RITE) y `ficha_res060_signed_link` (Ficha RES).
   - Desde Claude Code: `node implementation/backend/scripts/justificar.js api POST api/expedientes/<id>/documentos/validar --json f.json`
     (en Git Bash, la ruta **sin la barra inicial**; con ella da 405).
2. **Un 409 `firma_rota` PARA.** No se fuerza sin el «sí» de Fran: se dice qué documento y qué firma,
   y se pide otra copia.
3. **Un documento que se ha vuelto a firmar se valida otra vez**: subir el firmado nuevo borra la
   validación anterior.
4. **Solo entonces, el estado**: `PATCH api/expedientes/<id>/estado` con
   `{ "nuevo_estado": "DOC. COMPLETA" }`, la ruta del selector de la app, que también mueve la carpeta a
   «05. DOC. COMPLETA». Nunca un `update` directo de `estado` en la BD.
5. Comprueba que `docs_validados` tiene todos los campos y dilo en el informe: qué se ha validado y
   dónde ha quedado la carpeta.

Pasar a DOC. COMPLETA es una decisión de Fran («pásalo a DOC. COMPLETA», «valídalo todo»). Si una
skill lo deja APTO, **lo propone**; no cambia el estado sin que lo pida.

Detalle y porqué: `docs/conocimiento/expedientes/pasar-a-doc-completa-se-valida-todo.md` (regla 196).
