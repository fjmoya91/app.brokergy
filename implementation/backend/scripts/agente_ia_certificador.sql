-- agente_ia_certificador — el AGENTE IA, un certificador más.
--
-- Los CEE que se generan con las skills (generar-cee-inicial · generar-cee-final)
-- se perdían de vista: se le pedía a Claude, y después nadie sabía si estaba
-- hecho o no. Ahora el agente es un CERTIFICADOR de la tabla de siempre: sale en
-- el selector de técnico del módulo CEE, se le «encarga» como a cualquiera, y la
-- skill marca la fase (en trabajo → pendiente de revisión) y avisa al terminar,
-- igual que un técnico al subir su .cex. Ver «El AGENTE IA, un certificador más»
-- en CLAUDE.md.
--
-- Lo que lo distingue es la columna `es_agente_ia`, nunca el nombre: un nombre se
-- edita desde Prescriptores y una comprobación por texto dejaría de reconocerlo
-- el día que alguien lo corrija. Sin email ni teléfono a propósito: no hay a
-- quién escribirle, y el encargo NO le manda nada (asignar ES el encargo, como
-- cuando el certificador es la propia casa).
--
-- Aplicar en Supabase (MCP apply_migration). Idempotente.

ALTER TABLE public.prescriptores
    ADD COLUMN IF NOT EXISTS es_agente_ia boolean NOT NULL DEFAULT false;

-- Uno solo: el código lo busca por la marca y dos filas lo harían ambiguo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_prescriptores_agente_ia
    ON public.prescriptores ((es_agente_ia)) WHERE es_agente_ia;

INSERT INTO public.prescriptores
    (razon_social, acronimo, tipo_empresa, es_autonomo, es_agente_ia, logo_empresa, notas)
SELECT 'AGENTE IA', 'AGENTE IA', 'CERTIFICADOR', false, true,
       'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA2NCA2NCc+PHJlY3Qgd2lkdGg9JzY0JyBoZWlnaHQ9JzY0JyByeD0nMTQnIGZpbGw9JyMxNzE3MWMnLz48Y2lyY2xlIGN4PSczMicgY3k9JzEwJyByPSc0JyBmaWxsPScjRkY2RDAwJy8+PHJlY3QgeD0nMzAuNScgeT0nMTInIHdpZHRoPSczJyBoZWlnaHQ9JzgnIGZpbGw9JyNGRjZEMDAnLz48cmVjdCB4PSc4JyB5PScyOScgd2lkdGg9JzYnIGhlaWdodD0nMTEnIHJ4PScyJyBmaWxsPScjRkY2RDAwJy8+PHJlY3QgeD0nNTAnIHk9JzI5JyB3aWR0aD0nNicgaGVpZ2h0PScxMScgcng9JzInIGZpbGw9JyNGRjZEMDAnLz48cmVjdCB4PScxNCcgeT0nMjAnIHdpZHRoPSczNicgaGVpZ2h0PScyOScgcng9JzknIGZpbGw9JyNGRjZEMDAnLz48Y2lyY2xlIGN4PScyNScgY3k9JzMzJyByPSc0LjUnIGZpbGw9JyMxNzE3MWMnLz48Y2lyY2xlIGN4PSczOScgY3k9JzMzJyByPSc0LjUnIGZpbGw9JyMxNzE3MWMnLz48cmVjdCB4PScyNCcgeT0nNDEuNScgd2lkdGg9JzE2JyBoZWlnaHQ9JzMnIHJ4PScxLjUnIGZpbGw9JyMxNzE3MWMnLz48L3N2Zz4=',
       'Certificador VIRTUAL: los CEE que prepara Claude con las skills generar-cee-inicial y '
       || 'generar-cee-final. No firma ni presenta: deja el borrador {nº} - CEE …_REVISAR.cex en la '
       || 'carpeta del CEE y avisa por WhatsApp y email al terminar. Para firmar y registrar hay '
       || 'que asignar un técnico.'
WHERE NOT EXISTS (SELECT 1 FROM public.prescriptores WHERE es_agente_ia);
