-- ─────────────────────────────────────────────────────────────────────────────
-- Rol TRABAJADOR (2026-07-02)
-- Usuario interno de Brokergy que opera como ADMIN EXCEPTO:
--   · NO ve el margen/beneficio de Brokergy (precio CAE venta S.O., comisión
--     prescriptor, beneficio Brokergy, factura S.O.). Sí ve bono del cliente y
--     presupuesto de la obra.
--   · NO puede borrar (oportunidades, expedientes, partners, clientes, lotes…).
--   · NO toca ajustes globales (WhatsApp, remitente de emails, catálogo aerotermia).
--
-- El capado de dinero y de borrado se aplica en el backend (middleware + strips)
-- y en el frontend (flags de rol). Este script solo da de alta el rol.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO roles (id_rol, nombre_rol) VALUES (8, 'TRABAJADOR')
ON CONFLICT (nombre_rol) DO NOTHING;

-- Mantener la secuencia por delante del MAX(id_rol) tras el insert explícito.
SELECT setval(pg_get_serial_sequence('roles', 'id_rol'), (SELECT MAX(id_rol) FROM roles));
