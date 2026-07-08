-- ─────────────────────────────────────────────────────────────────────────────
-- lotes.documentos_so — documentos del envío al Sujeto Obligado (firma en cadena)
-- ─────────────────────────────────────────────────────────────────────────────
-- Al "Enviar al S.O." se crean los borradores del Anexo I (listado cesión), una
-- ficha RES por expediente y la Solicitud de Verificación (subida) en la carpeta
-- del lote en Drive. Cada entrada guarda el borrador y, cuando el S.O. firma por
-- el enlace público (/firmar-lote/:id), su versión firmada. Es el equivalente a
-- los *_drive_link / *_signed_link del expediente, pero a nivel LOTE.
--
-- Estructura de cada entrada (JSON):
-- {
--   "key": "anexo_i" | "ficha_<expId>" | "solicitud_verificacion",
--   "tipo": "anexo_i_listado" | "ficha_res" | "solicitud_verificacion",
--   "expediente_id": "<uuid>|null",
--   "label": "Anexo I · Listado Cesión" | "Ficha RES060 — 26RES060_118" | ...,
--   "anchor": ["texto ancla para pre-situar la firma", ...],
--   "draft_link": "https://drive...", "draft_file_id": "<id>",
--   "signed_link": "https://drive...|null", "signed_file_id": "<id>|null",
--   "sent_at": "ISO", "signed_at": "ISO|null"
-- }

ALTER TABLE public.lotes
    ADD COLUMN IF NOT EXISTS documentos_so JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.lotes.documentos_so IS
    'Documentos enviados al Sujeto Obligado para firma en cadena (Anexo I + fichas RES + Solicitud de Verificación), con borrador y firmado por documento. Ver /api/lotes/:id/enviar-so y /firmar-lote/:id.';

-- Grants (PostgREST/supabase-js necesitan permiso explícito desde 2026-10-30).
GRANT SELECT, INSERT, UPDATE ON public.lotes TO anon, authenticated, service_role;
