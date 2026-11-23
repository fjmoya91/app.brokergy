<!-- conocimiento · área: transversal-backend · las rutas de los enlaces son relativas a la raíz del repo -->

### El historial del expediente es siempre una lista (2026-11-23)

**Qué pasó.** Al abrir la pestaña del certificado de 26RES060_303 la app enseñaba «ALGO HA FALLADO
… ((intermediate value) || []).filter is not a function». `ComunicacionesCertificador.jsx` hace
`(documentacion.historial || []).filter(…)`, y en ese expediente `historial` no era una lista sino
un TEXTO con una lista dentro (`'[{"id":"…_pedido_aceptacion", …}]'`).

**Por qué.** Tres servicios apuntaban en el historial con el mismo patrón:

```js
Array.isArray(historial)
  ? rpc('merge_expediente_doc_json', { p_field: 'historial', p_value: [entrada] })
  : rpc('set_expediente_doc_field',  { p_field: 'historial', p_value: [entrada] })
```

`set_expediente_doc_field(p_oportunidad_id uuid, p_field text, p_value text)` hace `to_jsonb(p_value)`:
supabase-js manda la lista, Postgres la recibe como `text` y la guarda como una cadena JSON. Pasaba
justo la primera vez, cuando el expediente aún no tenía historial: el agente de aceptación al pedir
las fotos (`aceptacionAgente.registrarPedido`), el cambio de vía FM (`expedienteService.cambiarViaFm`)
y la huella del lote verificado (`loteVerificados.anotarHistorialExpediente`). El 23/11/2026 había
ocho expedientes así: 26RES080_107, 26RES060_291, _300, _298, _271, 26RES080_108, 26RES060_303 y
26RES060FM_301. Se enderezaron con SQL (`(documentacion->>'historial')::jsonb`) sin perder ninguna
entrada.

La otra rama tampoco valía sola: `merge_expediente_doc_json` hace `COALESCE(doc->campo, '{}') || valor`,
y sobre una clave ausente deja un `{}` delante de la lista.

**REGLA — Una entrada al historial del expediente se añade con `anadirAlHistorial(supabase, expedienteId,
entrada)` ([utils/historialExpediente.js](implementation/backend/utils/historialExpediente.js)), que llama a
la RPC `expediente_historial_append` y deja siempre una lista.**

La RPC (`implementation/backend/scripts/expediente_historial_append.sql`, `SECURITY DEFINER`, solo
`service_role`):

- si `historial` es una lista, añade la entrada al final;
- si es un texto que empieza por `[`, lo convierte en lista y añade;
- si no existe o es otra cosa, crea la lista con la entrada.

No lee ni reescribe `documentacion` entera (regla de las escrituras atómicas), así que no pisa lo que
otra ruta escriba a la vez.

**El frontend no se cae aunque vuelva a pasar**: `ComunicacionesCertificador`, `HistorialModal` y el
modal de historial de `ExpedientesView` leen el historial con `Array.isArray` y, si no es una lista,
lo tratan como vacío.

**Comprobación** (debe dar 0):

```sql
select count(*) from expedientes
where documentacion ? 'historial' and jsonb_typeof(documentacion->'historial') <> 'array';
```

Quedan otros que escriben el historial por `merge_expediente_doc_json` solo cuando ya es una lista
(`utils/documentacionAtomica.js`, `services/ceeRegistradoAviso.js`, `scripts/fm_conservar_numero.js`):
no rompen el tipo, pero lo nuevo debe usar `anadirAlHistorial`.
