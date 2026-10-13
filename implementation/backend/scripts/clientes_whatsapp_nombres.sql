-- =====================================================================
-- El NOMBRE DE WHATSAPP del cliente, para buscarlo por él.
--
-- Cómo está guardado cada teléfono del cliente en la agenda de WhatsApp
-- («RES060_225 Ceferino (ISM)») y cómo se ha puesto él («Cefe»), de todos sus
-- teléfonos (titular, persona de contacto, copropietarios), en un TEXTO:
-- "RES060_225 Ceferino (ISM) · Cefe".
--
-- Es una COPIA para el buscador de Clientes (que filtra en el navegador sobre
-- el listado): la fuente es la agenda. La escribe el backend
-- (services/whatsappAgenda.js) al abrir la ficha y en el repaso del panel de
-- WhatsApp, solo cuando cambia. Texto y no JSONB: va en el LISTADO (regla 22).
--
-- Aplicado en producción (okfeopwetlxdffrsbfqw) el 13/10/2026.
-- =====================================================================

alter table public.clientes add column if not exists whatsapp_nombres text;

comment on column public.clientes.whatsapp_nombres is
  'Nombre(s) del cliente en la agenda de WhatsApp (agenda · pushname), para buscarlo. Copia; la fuente es WhatsApp.';
