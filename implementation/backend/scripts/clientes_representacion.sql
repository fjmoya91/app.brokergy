-- ─── clientes: REPRESENTACIÓN del titular (apartado 3 del Anexo I) ───────────
-- Quién comparece y firma por el titular, y con qué título lo acredita.
--
--  · EMPRESA: siempre la representa su representante legal (representante_*,
--    ya existentes, ver clientes_representante_legal.sql).
--  · PARTICULAR: solo si `representado` (p. ej. un poder notarial a favor del
--    cónyuge). Sin él, el apartado 3 del Anexo I va EN BLANCO y sin casillas.
--
-- El título se imprime en el Anexo I («Poder Notarial de fecha … y número de
-- protocolo …» u «Otro documento (título y fecha de formalización)») y su copia
-- (`representacion_doc_link`) viaja en el paquete de la actuación. Ver
-- docs/conocimiento/documentos/la-representacion-del-titular-en-el-anexo-i.md.
-- Columnas sueltas y nullable: un cliente puede marcarse antes de tener el poder.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS representado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS representacion_tipo VARCHAR(20),
  ADD COLUMN IF NOT EXISTS representacion_fecha DATE,
  ADD COLUMN IF NOT EXISTS representacion_protocolo VARCHAR(40),
  ADD COLUMN IF NOT EXISTS representacion_documento VARCHAR(300),
  ADD COLUMN IF NOT EXISTS representacion_doc_link TEXT;

COMMENT ON COLUMN public.clientes.representado IS 'Particular que firma por medio de un representante (poder). Una empresa no lo necesita: siempre la representa su representante legal.';
COMMENT ON COLUMN public.clientes.representacion_tipo IS 'NOTARIAL (poder notarial: fecha + nº de protocolo) u OTRO (otro documento: título + fecha de formalización).';
COMMENT ON COLUMN public.clientes.representacion_fecha IS 'Fecha del poder notarial o de formalización del otro documento.';
COMMENT ON COLUMN public.clientes.representacion_protocolo IS 'Nº de protocolo del poder notarial.';
COMMENT ON COLUMN public.clientes.representacion_documento IS 'Título del documento que acredita la representación cuando no es un poder notarial (escritura de constitución, nombramiento de administrador…).';
COMMENT ON COLUMN public.clientes.representacion_doc_link IS 'Copia del documento que acredita la representación (Drive). Va en el paquete de la actuación.';

-- 2026-10-22 (2): domicilio, teléfono y email del REPRESENTANTE (apartado 3 del
-- Anexo I). Vacíos = los del titular (en una empresa, su sede y su contacto).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS representante_domicilio VARCHAR(300),
  ADD COLUMN IF NOT EXISTS representante_tlf VARCHAR(30),
  ADD COLUMN IF NOT EXISTS representante_email VARCHAR(200);

COMMENT ON COLUMN public.clientes.representante_domicilio IS 'Domicilio del representante si no es el del titular (vacío = el del titular).';
COMMENT ON COLUMN public.clientes.representante_tlf IS 'Teléfono del representante si no es el del titular (vacío = el del titular).';
COMMENT ON COLUMN public.clientes.representante_email IS 'Email del representante si no es el del titular (vacío = el del titular).';
