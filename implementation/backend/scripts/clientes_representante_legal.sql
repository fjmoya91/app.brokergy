-- ─── clientes: empresa + representante legal ─────────────────────────────────
-- Cuando el cliente es una persona JURÍDICA, quien firma los anexos no es el
-- titular (la sociedad) sino su representante legal. El Convenio de Cesión de
-- Ahorros y el Anexo I necesitan sus datos para redactar el bloque del Cedente
-- igual que ya se redacta el del Cesionario ("... actuando en nombre y
-- representación de la entidad X, con NIF Y ...").
--
-- es_empresa gobierna la UI (toggle EMPRESA en la ficha del cliente) y la
-- redacción de los documentos. Los tres campos del representante son nullable:
-- un cliente puede estar marcado como empresa antes de tener los datos.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS es_empresa BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS representante_nombre VARCHAR(200),
  ADD COLUMN IF NOT EXISTS representante_apellidos VARCHAR(200),
  ADD COLUMN IF NOT EXISTS representante_dni VARCHAR(20);

COMMENT ON COLUMN public.clientes.es_empresa IS 'TRUE si el cliente es persona jurídica: nombre_razon_social es la razón social, dni es el CIF y firma el representante legal.';
COMMENT ON COLUMN public.clientes.representante_nombre IS 'Nombre del representante legal (solo si es_empresa). Firma los anexos en nombre de la sociedad.';
COMMENT ON COLUMN public.clientes.representante_apellidos IS 'Apellidos del representante legal (solo si es_empresa).';
COMMENT ON COLUMN public.clientes.representante_dni IS 'DNI/NIE del representante legal (solo si es_empresa). No confundir con clientes.dni, que es el CIF de la sociedad.';

-- Backfill: los CIF españoles de sociedad empiezan por una de estas letras
-- (A,B,C,D,E,F,G,H,J,N,P,Q,R,S,U,V,W). Marca como empresa a los clientes ya
-- dados de alta con un CIF, para no tener que repasarlos uno a uno.
-- Los datos del representante siguen vacíos: se rellenan a mano en la ficha.
UPDATE public.clientes
   SET es_empresa = TRUE
 WHERE es_empresa = FALSE
   AND dni ~* '^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$';
