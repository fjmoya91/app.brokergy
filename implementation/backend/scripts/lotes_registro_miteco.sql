-- ─────────────────────────────────────────────────────────────────────────────
-- Nº de REGISTRO de la solicitud de emisión ante el MITECO, en el lote (2026-10-27)
--
-- Es el «número de registro REGAGE…» del justificante que devuelve la sede del
-- MITECO al presentar la solicitud de emisión (REGAGE26e00088163268). Con él cita
-- el lote el Gestor Autonómico en sus requerimientos («Con fecha … (número de
-- registro REGAGE…) INTERNACIONAL DE ALCOHOLES SA, presenta solicitud…»), y es lo
-- único que los casa con nuestro lote: el requerimiento no nombra el lote, ni el
-- dictamen, ni los expedientes. Medido el 27/10/2026: cinco requerimientos
-- (E_CAE_2026_07019…07023) que solo se pudieron repartir entre los lotes leyendo
-- el justificante de cada uno.
--
-- Se rellena SOLO al subir el justificante (se lee del PDF) y se puede corregir a
-- mano. Junto a `expediente_verificador` (el nº del verificador): uno por cada
-- lado de la mesa. No es un dato económico: lo ve y lo edita todo el staff.
--
-- Columna nueva en una tabla que ya existe: no toca el RLS ni los GRANT (regla 150).
-- APLICADO en producción el 2026-10-27.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.lotes ADD COLUMN IF NOT EXISTS registro_miteco VARCHAR(100);

COMMENT ON COLUMN public.lotes.registro_miteco IS
  'Nº de registro (REGAGE…) de la solicitud de emisión de CAE en la sede del MITECO; se lee del justificante.';
