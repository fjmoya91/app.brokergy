-- ─────────────────────────────────────────────────────────────────────────────
-- COPROPIETARIOS de una vivienda (2026-09-17)
--
-- Una vivienda puede tener DOS (o más) propietarios, y hasta ahora la ficha solo
-- tenía sitio para uno: lo que se hacía era meter los dos en los campos del
-- titular ("CARLOS MÓNICA" / "POVEDA OCHOA CASTELLANOS SÁNCHEZ", medido en la
-- ficha de Mónica Castellanos). Eso deja un nombre que no es el de nadie y —lo
-- que de verdad duele— un solo teléfono y un solo correo: al otro propietario no
-- se le puede escribir.
--
-- REGLA — esto es un DESTINATARIO, no un firmante. El Anexo I y el Convenio de
-- Cesión se siguen emitiendo a nombre del TITULAR y con su único recuadro de
-- firma: aquí no se toca ningún documento. Lo que se gana es poder mandarle a
-- cualquiera de los dos (o a los dos) los mensajes, los anexos y las peticiones
-- de documentación.
--
-- Es un JSONB y no una tabla por lo mismo que `prescriptores.contactos_notificacion`:
-- son dos o tres personas por ficha, sin vida propia (no se consultan sueltas, no
-- se buscan, no tienen expedientes) y se leen SIEMPRE junto al cliente. Una tabla
-- obligaría a un join en las quince consultas que ya traen el cliente entero.
--
-- Cada entrada:
--   { id, es_empresa, nombre, apellidos, dni, email, tlf }
--
-- `nombre` (y no `nombre_razon_social`) porque la etiqueta cambia con `es_empresa`,
-- igual que en el titular. El saneado —qué claves se admiten, el tope y las
-- MAYÚSCULAS— es fuente única en utils/normalization.js (`normalizeCliente`), que
-- es por donde pasa todo lo que se escribe en `clientes`, venga de la ruta que
-- venga.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS copropietarios jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clientes.copropietarios IS
  'Otros propietarios de la vivienda, además del titular: [{id, es_empresa, nombre, apellidos, dni, email, tlf}]. '
  'Son DESTINATARIOS de mensajes/anexos; el titular es quien firma los documentos. '
  'Saneado en utils/normalization.js (normalizeCliente).';

-- Nadie consulta por el contenido del array (se lee siempre con la fila del
-- cliente), así que no lleva índice: un GIN aquí solo costaría escrituras.
