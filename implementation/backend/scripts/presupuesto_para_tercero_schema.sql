-- ─── Presupuesto que pide un INSTALADOR para un cliente suyo (2026-11-10) ─────
-- Fran (04/11 y 10/11/2026): «el presupuesto nos lo solicita el instalador… se le
-- factura al instalador, pero los datos del cliente no van a ser los suyos para el
-- certificado… cuando se le envíe para aceptar, nos debe indicar los datos del
-- cliente».
--
-- El cliente del presupuesto (`cee_ofertas.cliente_id`) sigue siendo a quien se le
-- manda y a quien se FACTURA: el instalador. Con `para_tercero`, al aceptar él
-- rellena el PROPIETARIO de la vivienda, que es quien sale en el certificado; su
-- ficha queda en `propietario_cliente_id`. El CEE directo que nace guarda quién
-- PAGA en `pagador_cliente_id`: la factura y la entrega van a él.
--
-- Todo ADITIVO (regla 165): sin las columnas, lo de siempre.

ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS para_tercero boolean NOT NULL DEFAULT false;
ALTER TABLE public.cee_ofertas ADD COLUMN IF NOT EXISTS propietario_cliente_id uuid REFERENCES public.clientes(id_cliente) ON DELETE SET NULL;

ALTER TABLE public.cee_directos ADD COLUMN IF NOT EXISTS pagador_cliente_id uuid REFERENCES public.clientes(id_cliente) ON DELETE SET NULL;
