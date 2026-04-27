-- ============================================================
-- MIGRACIÓN: Tabla EXPEDIENTES
-- Ejecutar en Supabase SQL Editor
-- Fecha: 2026-04-01
-- ============================================================

-- 1. Crear tabla expedientes
CREATE TABLE IF NOT EXISTS public.expedientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relaciones obligatorias
    oportunidad_id UUID NOT NULL REFERENCES public.oportunidades(id) ON DELETE RESTRICT,
    cliente_id     UUID NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE RESTRICT,

    -- Referencia legible oficial (ej: "26RES060_0001")
    numero_expediente VARCHAR(50) UNIQUE,
    correlativo       INT,

    -- Referencia redundante a la oportunidad (legacy o backup)
    id_oportunidad_ref VARCHAR(50),

    -- Módulos JSONB (todos los campos se guardan aquí para generar documentos)
    cee            JSONB NOT NULL DEFAULT '{}',
    instalacion    JSONB NOT NULL DEFAULT '{}',
    documentacion  JSONB NOT NULL DEFAULT '{}',

    -- Metadatos
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices de búsqueda
CREATE INDEX IF NOT EXISTS expedientes_oportunidad_idx ON public.expedientes(oportunidad_id);
CREATE INDEX IF NOT EXISTS expedientes_cliente_idx     ON public.expedientes(cliente_id);

-- 3. Añadir FK en clientes.id_expediente (antes era UUID sin FK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'clientes_id_expediente_fkey'
          AND table_name = 'clientes'
    ) THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_id_expediente_fkey
            FOREIGN KEY (id_expediente) REFERENCES public.expedientes(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. RLS — el backend usa service_role (bypasa RLS), pero activamos como segunda capa
ALTER TABLE public.expedientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan todos los expedientes" ON public.expedientes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.auth_user_id = auth.uid()
              AND u.id_rol = (SELECT id_rol FROM public.roles WHERE nombre_rol = 'ADMIN')
        )
    );

CREATE POLICY "Prescriptores ven sus expedientes" ON public.expedientes
    FOR SELECT USING (
        cliente_id IN (
            SELECT c.id_cliente FROM public.clientes c
            JOIN public.prescriptores p ON c.prescriptor_id = p.id_empresa
            JOIN public.usuarios u ON p.representante_legal_id = u.id_usuario
            WHERE u.auth_user_id = auth.uid()
        )
    );
