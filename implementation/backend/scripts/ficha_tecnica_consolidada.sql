-- ============================================================================
-- ficha_tecnica_consolidada.sql — QUÉ lleva dentro la ficha del catálogo
-- ----------------------------------------------------------------------------
-- La ficha de un modelo dejó de ser siempre UN documento: cuando el SCOP se
-- justifica por EPREL hacen falta tres papeles (la ficha del fabricante, la
-- ficha EPREL y la etiqueta energética) y lo que se guarda en el catálogo es el
-- conjunto unido en un solo PDF (ver services/fichaConsolidada.js).
--
-- Sin esta columna, el siguiente expediente que copie esa ficha enseña "5 págs"
-- y no hay forma de saber si el EPREL va dentro o no sin abrir el PDF — que es
-- exactamente lo que lleva a subirlo otra vez a mano y a acabar con la ficha
-- EPREL duplicada dentro del certificado.
--
-- Es METADATO, no contenido (regla 21): nombre de cada pieza, sus páginas y
-- cuándo se consolidó. El PDF vive en Drive.
--
--   { "at": "2026-09-11T10:22:31.000Z",
--     "paginas": 5,
--     "piezas": [ { "nombre": "… - FT AEROTERMIA CALEFACCION.pdf", "paginas": 2 },
--                 { "nombre": "FICHE_673322_ES.pdf",              "paginas": 2 },
--                 { "nombre": "LABEL_673322.pdf",                 "paginas": 1 } ] }
--
-- Se escribe SIEMPRE que se toca `ficha_tecnica`: al guardar una ficha suelta se
-- pone a NULL. Una nota de "conjunto" que sobrevive a la ficha que describe
-- miente con toda la autoridad de un registro.
-- ============================================================================

alter table public.aerotermia
    add column if not exists ficha_tecnica_partes jsonb;

alter table public.ventanas_marcos
    add column if not exists ficha_tecnica_partes jsonb;

alter table public.ventanas_cristales
    add column if not exists ficha_tecnica_partes jsonb;

comment on column public.aerotermia.ficha_tecnica_partes is
    'Metadatos del conjunto unido en ficha_tecnica (piezas, páginas, fecha). NULL = ficha suelta.';
comment on column public.ventanas_marcos.ficha_tecnica_partes is
    'Metadatos del conjunto unido en ficha_tecnica (piezas, páginas, fecha). NULL = ficha suelta.';
comment on column public.ventanas_cristales.ficha_tecnica_partes is
    'Metadatos del conjunto unido en ficha_tecnica (piezas, páginas, fecha). NULL = ficha suelta.';
