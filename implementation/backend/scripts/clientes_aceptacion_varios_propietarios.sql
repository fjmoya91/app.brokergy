-- Varios propietarios en la aceptación de la propuesta: SOLO si el equipo lo
-- habilita desde la ficha del cliente (2026-10-06). Por defecto, una única persona.
alter table public.clientes
    add column if not exists aceptacion_varios_propietarios boolean not null default false;
