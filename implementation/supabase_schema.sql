-- 1. EXTENSIÓN PARA UUID (si no está activa)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA ROLES
CREATE TABLE IF NOT EXISTS public.roles (
    id_rol SERIAL PRIMARY KEY,
    nombre_rol VARCHAR(50) UNIQUE NOT NULL
);

-- Insertamos roles por defecto si no existen
INSERT INTO public.roles (nombre_rol)
VALUES 
    ('ADMIN'), 
    ('DISTRIBUIDOR'), 
    ('INSTALADOR'), 
    ('CERTIFICADOR'), 
    ('CLIENTE PARTICULAR')
ON CONFLICT (nombre_rol) DO NOTHING;

-- 3. TABLA USUARIOS (extends auth.users)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id_usuario UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    id_rol INT REFERENCES public.roles(id_rol),
    nombre VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100),
    nif VARCHAR(20),
    email VARCHAR(150),
    tlf VARCHAR(20),
    ccaa VARCHAR(100),
    provincia VARCHAR(100),
    municipio VARCHAR(100),
    direccion TEXT,
    codigo_postal VARCHAR(10),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS en usuarios
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Política de usuarios: Un usuario puede ver y editar su propio perfil, ADMIN ve todo.
CREATE POLICY "Usuarios ven su propio perfil" ON public.usuarios
    FOR SELECT USING (auth.uid() = auth_user_id);
    
CREATE POLICY "Admins ven todos los usuarios" ON public.usuarios
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.auth_user_id = auth.uid() 
            AND u.id_rol = (SELECT id_rol FROM public.roles WHERE nombre_rol = 'ADMIN')
        )
    );

-- 4. TIPO ENUM EMPRESA
DO $$ BEGIN
    CREATE TYPE tipo_empresa_enum AS ENUM ('DISTRIBUIDOR', 'INSTALADOR', 'OTRO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 5. TABLA PRESCRIPTORES
CREATE TABLE IF NOT EXISTS public.prescriptores (
    id_empresa UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    es_autonomo BOOLEAN DEFAULT false,
    razon_social VARCHAR(150),
    acronimo VARCHAR(50),
    cif VARCHAR(20),
    email VARCHAR(150),
    tlf VARCHAR(20),
    representante_legal_id UUID REFERENCES public.usuarios(id_usuario),
    ccaa VARCHAR(100),
    provincia VARCHAR(100),
    municipio VARCHAR(100),
    direccion TEXT,
    codigo_postal VARCHAR(10),
    tipo_empresa tipo_empresa_enum DEFAULT 'DISTRIBUIDOR',
    marca_referencia VARCHAR(150),
    marca_secundaria VARCHAR(150),
    tiene_carnet_rite BOOLEAN DEFAULT false,
    numero_carnet_rite VARCHAR(50),
    logo_empresa TEXT,
    cargo VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS en prescriptores
ALTER TABLE public.prescriptores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Representante ve su prescriptor" ON public.prescriptores
    FOR SELECT USING (
        representante_legal_id IN (
            SELECT id_usuario FROM public.usuarios WHERE auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Admins ven todos los prescriptores" ON public.prescriptores
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u 
            WHERE u.auth_user_id = auth.uid() 
            AND u.id_rol = (SELECT id_rol FROM public.roles WHERE nombre_rol = 'ADMIN')
        )
    );

-- 6. ALTER TABLE OPORTUNIDADES
-- Agregamos las columnas necesarias si no existen
DO $$ 
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns 
                  WHERE table_name='oportunidades' AND column_name='creador_id') THEN
        ALTER TABLE public.oportunidades
            ADD COLUMN creador_id UUID REFERENCES public.usuarios(id_usuario),
            ADD COLUMN prescriptor_id UUID REFERENCES public.prescriptores(id_empresa),
            ADD COLUMN instalador_asociado_id UUID REFERENCES public.prescriptores(id_empresa),
            ADD COLUMN certificador_asociado_id UUID REFERENCES public.usuarios(id_usuario);
    END IF;
END $$;

-- RLS en oportunidades estará mitigado por Node, pero la activamos para mayor seguridad
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;

-- 7. TABLA CLIENTES
CREATE TABLE IF NOT EXISTS public.clientes (
    id_cliente UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_usuario UUID REFERENCES public.usuarios(id_usuario),
    nombre_razon_social VARCHAR(200) NOT NULL,
    apellidos VARCHAR(150),
    email VARCHAR(150),
    tlf VARCHAR(20),
    dni VARCHAR(20) UNIQUE,
    ccaa VARCHAR(100),
    provincia VARCHAR(100),
    municipio VARCHAR(100),
    direccion TEXT,
    codigo_postal VARCHAR(10),
    numero_cuenta VARCHAR(50),          -- Solo para CLIENTE PARTICULAR
    prescriptor_id UUID REFERENCES public.prescriptores(id_empresa),
    id_expediente UUID,                 -- Referencia futura a tabla expedientes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS en clientes
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gestionan todos los clientes" ON public.clientes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.usuarios u
            WHERE u.auth_user_id = auth.uid()
            AND u.id_rol = (SELECT id_rol FROM public.roles WHERE nombre_rol = 'ADMIN')
        )
    );

CREATE POLICY "Prescriptores ven sus clientes" ON public.clientes
    FOR SELECT USING (
        prescriptor_id IN (
            SELECT p.id_empresa FROM public.prescriptores p
            JOIN public.usuarios u ON p.representante_legal_id = u.id_usuario
            WHERE u.auth_user_id = auth.uid()
        )
    );

-- Añadir cliente_id a oportunidades (referencia oportunidad -> cliente)
DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns
                  WHERE table_name='oportunidades' AND column_name='cliente_id') THEN
        ALTER TABLE public.oportunidades
            ADD COLUMN cliente_id UUID REFERENCES public.clientes(id_cliente);
    END IF;
END $$;

-- Nadie sin cuenta que acceda por REST publicamente debería poder ver esto (Anon request)
-- A menos que queramos mantener la inserción pública. En BackendNodeJS usamos la Service Key, que se salta RLS.
-- Por lo tanto, dejar políticas RLS vacías restringe REST client, pero nuestro backend con service_role key funcionará perfectamente.

-- Hacemos RLS transparente para SELECT al anon por si la app legacy lo lee directo, pero OJO,
-- si el frontend ahora usa api temporalmente para select directo a supabase saltará si se deshabilita del todo.
-- (Actualmente la app va a través del backend (/api/oportunidades) usando anon o auth desde node).
