<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## La FICHA del expediente ya no pisa la ENVOLVENTE (2026-10-07)

**Caso: 26RES060_222.** El Agente IA dejó el CEE inicial hecho el 06/10. Al día siguiente, con la
ficha del expediente abierta desde las 18:22, se abrió la envolvente en otra pestaña, se movieron y
quitaron ventanas (se guardaron solas, ~30 veces) y a las 18:28 se generó el `.cex`, que salió bien.
A las 18:29, desde la ficha, se encargó el CEE al certificador. Al recargar la envolvente, los cambios
no estaban: volvían las 11 ventanas «por confirmar» del agente. Reconstruido con el log de nginx:

| Hora (UTC+2) | Petición | Qué pasó |
|---|---|---|
| 18:22:14 | `GET /api/expedientes/:id` | la ficha se carga con la envolvente del agente |
| 18:24 – 18:28 | `PUT /api/cee-envolvente/:id/trabajo` ×30 | se guardan las ventanas cambiadas |
| 18:28:17 | `POST /api/cee-envolvente/:id/cex` | el `.cex`, con los cambios: bien |
| **18:29:18** | **`PUT /api/expedientes/:id`** | la ficha reenvía `cee` ENTERO con la envolvente de las 18:22 |
| 18:29:45 | `GET …/trabajo` | la envolvente se recarga con lo pisado (y lo vuelve a guardar) |

**El fallo:** el PUT del expediente hace `{ ...existing.cee, ...cee }`, y la copia de `cee` que manda
la ficha es la de cuando se abrió. Ya se blindaban así `revision_*`, `agente_ia`, `presentacion` y
`envolvente_revision`, pero no el trabajo de la envolvente, que también lo escribe solo su ruta
(`/api/cee-envolvente`, por la RPC de clave) y desde OTRA pestaña — justo el caso en que la copia de
la ficha se queda vieja.

**REGLA — lo que escribe la ventana de la envolvente no se escribe por el PUT de la ficha.**
`envolvente`, `envolvente_fotos` y `envolvente_imagenes` (y en un CEE directo además
`construcciones_elegidas` y su `_detalle`) se conservan de la BD en `PUT /api/expedientes/:id` y en
`PUT /api/cee-directos/:id`; si la BD no las tiene, la ficha no las crea. Ninguna pantalla las
escribe por esa ruta: al aceptar una oportunidad las vuelca `expedienteService` (inserción), y el
Agente IA las guarda con `guardarTrabajo`.

Lo perdido en 26RES060_222 no se puede recuperar de la BD (no hay historial de `cee.envolvente`): el
`.cex` generado a las 18:28 sí lleva los cambios, pero el plano hay que volver a corregirlo a mano.

Prueba: `node implementation/backend/scripts/test_put_cee_envolvente.js` (monta las dos rutas reales
con una Supabase simulada; sin el arreglo, la envolvente vieja gana).
