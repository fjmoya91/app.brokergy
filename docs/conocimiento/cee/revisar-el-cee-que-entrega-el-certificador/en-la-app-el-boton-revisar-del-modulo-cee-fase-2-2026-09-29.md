<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «REVISAR el CEE que entrega el certificador (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### En la app: el botón «Revisar» del módulo CEE (fase 2, 2026-09-29)

Lupa en la cabecera de cada fase de la rejilla del CEE, junto al visto bueno (solo ADMIN, solo en
el CAE), con el color del último veredicto: gris sin revisar, verde, ámbar o rojo. Abre
[RevisionCeeModal.jsx](implementation/frontend/src/features/expedientes/components/RevisionCeeModal.jsx):
fallos, avisos y «sin comprobar» primero; lo correcto plegado; «Volver a revisar», «🧩 Poner la
medida» (si falta) y «✓ Dar el visto bueno», que abre el popup de siempre y, con NO APTO, pregunta
antes sin bloquear.

| Qué | Dónde |
|---|---|
| Revisar y guardar | `POST /api/expedientes/:id/revisar-cee?fase=` (**staffOnly**) → `revisarYGuardar` |
| Poner la medida | `POST /api/expedientes/:id/cee/poner-medida` (**staffOnly**) → `ponerMedida` |
| El resumen guardado | `cee.revision_inicial` / `cee.revision_final` (metadatos: veredicto, recuento y los puntos no verdes) |

**REGLA — ninguna IA en el veredicto.** El juicio es código determinista: la misma revisión da
siempre lo mismo y cada punto dice de dónde sale su cifra.

**REGLA — `revision_*` la escribe SOLO su ruta** (RPC `set_expediente_cee_field`), y el PUT general
la PRESERVA: la copia de `cee` que el detalle reenvía en cada autoguardado se hidrató al abrir y la
borraría (mismo fallo que `docs_validados`).

**REGLA — sin `.xml` pero con `.cex` se revisa igual y sale NO APTO «falta el .xml»**: el Registro lo
pide. Medido el 29/09/2026: 26RES060_196, _197 y _204 estaban así. Lo que se ve en el `.cex` se
revisa igualmente.

⚠️ `matchSlot` reconoce ahora también la copia que hace Drive del borrador (`_REVISAR (1).cex`):
en 26RES060_196 esa copia se tomaba por la entrega del técnico, también en la rejilla.

⚠️ En un CEE directo no hay botón: la ruta vive solo en `/api/expedientes` y allí no hay medida de
mejora que revisar.
