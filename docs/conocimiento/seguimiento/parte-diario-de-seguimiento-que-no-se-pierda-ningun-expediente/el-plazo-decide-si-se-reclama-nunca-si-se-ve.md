<!-- conocimiento · área: seguimiento · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)»; la introducción y el resto, en esta misma carpeta.

### El PLAZO decide si se RECLAMA, nunca si se VE (2026-09-07)

Eran el mismo número, y por eso no se podía uno fiar de la pestaña: lo movido
recientemente no existía en ninguna parte. Medido el 07/09/2026 — **5** expedientes con
el visto bueno dado y sin registrar, y la pantalla enseñaba **2** (se callaba
26RES060_119, cuyo CEE final se había mandado a registrar el día antes). El plazo de 2
días era razonable para no darle la lata al certificador; era absurdo para esconderle a
Brokergy en qué punto está su propia cartera.

`escanear()` emite ahora **todas** las filas y marca cada una `vencida` (plazo cumplido,
o **sin fecha** — no saber desde cuándo espera algo es peor, no mejor). Quien reclama
filtra por esa marca y nadie recibe un mensaje antes de tiempo:

| Superficie | Qué lleva |
|---|---|
| `agruparPorDestinatario` (DESPACHAR y los envíos en bloque) | solo `vencida` |
| Parte diario de WhatsApp / email (`seguimientoDiario`) | solo `vencida` |
| Pestaña **REVISAR** | TODO — lo parado primero, lo que va en plazo detrás y atenuado |

**REGLA — parado y en plazo se cuentan APARTE.** La ruta devuelve `parados` y `en_plazo`
además de `total`, y cada bloque su `vencidas`. El titular y el badge cuentan lo PARADO,
que es lo que duele; mezclarlos convertiría la lista de tareas en un inventario.
