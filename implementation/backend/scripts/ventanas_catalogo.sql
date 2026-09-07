-- ============================================================================
-- ventanas_catalogo.sql — el CATÁLOGO DE VENTANAS (marcos y cristales)
-- ----------------------------------------------------------------------------
-- Gemelo del catálogo de `aerotermia`, para el otro equipo que un RES080 tiene
-- que justificar: la carpintería y el vidrio.
--
-- POR QUÉ EXISTE. Hasta ahora las listas de marcas y modelos del módulo de
-- Envolvente vivían en el `localStorage` del navegador —o sea, no se compartían
-- entre usuarios ni entre ordenadores— y el Uf, el Ug y el factor solar nacían
-- con tres valores fijos (2,7 · 1,3 · 0,43). Medido sobre los 25 RES080 con la
-- envolvente rellena: esos tres números aparecen tal cual en varios expedientes,
-- que es lo que pasa cuando el valor por defecto no obliga a mirar la ficha.
--
-- DOS TABLAS, PORQUE SON DOS COSAS DISTINTAS.
--
--   · `ventanas_marcos`    — una fila por (marca, serie, APERTURA). El Uf no es
--     de la serie, es de la serie EN ESA APERTURA: la STRUGAL PLANIA da 1,30 en
--     doble junta, 1,25 en triple y 1,10 con refuerzo con rotura; la Cortizo A70
--     abisagrada da 1,30 y la C70 corredera, 1,80. Una fila por serie con "su"
--     Uf autorrellenaría el de la tipología equivocada, que es justo el error
--     que este catálogo viene a evitar.
--
--   · `ventanas_cristales` — una fila por (fabricante, gama, COMPOSICIÓN). Lo
--     que fija el Ug y el factor solar es la capa bajo emisiva MÁS el montaje:
--     el mismo Guardian Sun da Ug 1,3 en 4/16/4 con aire y 1,0 con argón. Es
--     también como están nombradas las fichas de "02. CRISTALES".
--
-- LA MARCA NO ES EL CARPINTERO. `marca` es el fabricante del SISTEMA (Cortizo,
-- Kömmerling, Gealan…). Quien fabrica y monta la ventana —Aluminios Manzanares,
-- Mancha Azuer, Alumitec Criptana— es el CARPINTERO y va en el expediente
-- (`documentacion.envolvente.marco_carpinteria`), nunca aquí: no es una marca de
-- perfil y meterlo en el catálogo lo convertiría en un modelo que nadie más va a
-- volver a usar.
--
-- `validado` = alguien ha comprobado el dato contra la ficha. Lo sembrado por
-- este script sale de leer las fichas del Drive: solo va a `true` cuando el Uf /
-- el Ug están escritos DENTRO del documento. Donde el valor solo se intuye por
-- el nombre del fichero, el campo queda a NULL y la nota dice dónde mirar —un
-- número inventado aquí acaba impreso en un certificado.
--
-- Seguridad: RLS deny-all (sin policies), como el resto de tablas nuevas. Todo
-- el acceso pasa por el backend con service_role. Ver [[project_supabase_rls_lockdown]].
-- ============================================================================

-- ─── MARCOS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ventanas_marcos (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    marca             text NOT NULL,                       -- CORTIZO, KÖMMERLING…
    serie             text NOT NULL,                       -- 'A 70', 'S53RP', 'PLANIA (doble junta)'
    apertura          text NOT NULL DEFAULT 'ABISAGRADA',  -- ABISAGRADA | CORREDERA | ELEVABLE | FIJA | PUERTA
    material          text,                                -- PVC | ALUMINIO RPT | ALUMINIO | MADERA | MIXTO
    uf                numeric,                             -- W/m²K — transmitancia del MARCO
    permeabilidad     text,                                -- clase al aire (1..4) si consta
    ficha_tecnica     text,                                -- URL (Drive o fabricante)
    ficha_tecnica_id  text,                                -- driveId, cuando la ficha vive en Drive
    notas             text,
    validado          boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ventanas_marcos_unicos UNIQUE (marca, serie, apertura)
);

-- ─── CRISTALES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ventanas_cristales (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fabricante        text NOT NULL,                       -- GUARDIAN | SAINT-GOBAIN
    gama              text NOT NULL,                       -- GUARDIAN SUN | PLANITHERM 4S | PLANITHERM ONE…
    composicion       text NOT NULL,                       -- '4/16/4 aire', '6/14/44.1 SI argón 90'
    ug                numeric,                             -- W/m²K — transmitancia del VIDRIO
    factor_solar      numeric,                             -- g (0..1)
    transmision_luminosa numeric,                          -- TL en % (dato de CE3X)
    ficha_tecnica     text,
    ficha_tecnica_id  text,
    notas             text,
    validado          boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ventanas_cristales_unicos UNIQUE (fabricante, gama, composicion)
);

CREATE INDEX IF NOT EXISTS ventanas_marcos_marca_idx    ON public.ventanas_marcos (marca);
CREATE INDEX IF NOT EXISTS ventanas_cristales_fab_idx   ON public.ventanas_cristales (fabricante);

-- ─── Seguridad ──────────────────────────────────────────────────────────────
ALTER TABLE public.ventanas_marcos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventanas_cristales ENABLE ROW LEVEL SECURITY;
-- Sin policies a propósito: deny-all. El backend usa service_role y se salta RLS.

-- Y sin grants a anon/authenticated: no los usa nadie (el frontend no hace .from()
-- sobre estas tablas) y TRUNCATE no pasa por RLS, así que dejarlos concedidos sería
-- regalar el único verbo que el deny-all no frena.
REVOKE ALL ON TABLE public.ventanas_marcos    FROM anon, authenticated;
REVOKE ALL ON TABLE public.ventanas_cristales FROM anon, authenticated;
GRANT  ALL ON TABLE public.ventanas_marcos     TO service_role;
GRANT  ALL ON TABLE public.ventanas_cristales  TO service_role;

-- ─── updated_at ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ventanas_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ventanas_touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ventanas_touch_updated_at() TO service_role;

DROP TRIGGER IF EXISTS ventanas_marcos_touch    ON public.ventanas_marcos;
CREATE TRIGGER ventanas_marcos_touch    BEFORE UPDATE ON public.ventanas_marcos
    FOR EACH ROW EXECUTE FUNCTION public.ventanas_touch_updated_at();

DROP TRIGGER IF EXISTS ventanas_cristales_touch ON public.ventanas_cristales;
CREATE TRIGGER ventanas_cristales_touch BEFORE UPDATE ON public.ventanas_cristales
    FOR EACH ROW EXECUTE FUNCTION public.ventanas_touch_updated_at();

-- ============================================================================
-- SIEMBRA — leída de "06. CALIDAD / 06. VENTANAS" del Drive (2026-09-07).
-- `ficha_tecnica_id` es el fichero que ya está ahí: no se duplica nada.
-- ============================================================================

INSERT INTO public.ventanas_marcos
    (marca, serie, apertura, material, uf, ficha_tecnica_id, ficha_tecnica, validado, notas)
VALUES
    -- Uf escrito DENTRO de la ficha → validado
    ('CORTIZO','A 70','ABISAGRADA','PVC',1.30,'12eOCShORXrashpsVKFdXG3yhY84PgbHz','https://drive.google.com/file/d/12eOCShORXrashpsVKFdXG3yhY84PgbHz/view',true,'Uf = 1,3 W/m²K (transmitancia térmica normalizada de carpintería).'),
    ('CORTIZO','A 84 PASSIVHAUS','ABISAGRADA','PVC',0.77,'1kF9THMOXv_ZkcgEzLPXJWx6_vPVqF1ti','https://drive.google.com/file/d/1kF9THMOXv_ZkcgEzLPXJWx6_vPVqF1ti/view',true,'Uf = 0,77 W/m²K. Uw ≥ 0,74 según tipología y vidrio.'),
    ('CORTIZO','C 70','CORREDERA','PVC',1.80,'1KVD6G5cjygSAWQkBU0zGw0X-awHvwi-r','https://drive.google.com/file/d/1KVD6G5cjygSAWQkBU0zGw0X-awHvwi-r/view',true,'Uf ≥ 1,8 W/m²K. Uw ≥ 1,3 según tipología y vidrio.'),
    ('KÖMMERLING','76 AD XTREM','ABISAGRADA','PVC',1.10,'1dt4EVQpNw0C0xwtgydz-50uI3uK24ILS','https://drive.google.com/file/d/1dt4EVQpNw0C0xwtgydz-50uI3uK24ILS/view',true,'Uf desde 1,10 W/m²K. Uw desde 0,83.'),
    ('KÖMMERLING','76 AD','ABISAGRADA','PVC',1.10,'1wVLLsYXl6ELBtSFoKkKUW_kkY-L0b7it','https://drive.google.com/file/d/1wVLLsYXl6ELBtSFoKkKUW_kkY-L0b7it/view',true,'Uf desde 1,10 W/m²K con hoja estándar.'),
    ('KÖMMERLING','76 MD','ABISAGRADA','PVC',1.00,'1lhzT6hrFoGNmI9AN7-OJxQ6dgl1cIvfN','https://drive.google.com/file/d/1lhzT6hrFoGNmI9AN7-OJxQ6dgl1cIvfN/view',true,'Uf desde 1,00 W/m²K. Uw desde 0,80.'),
    ('KÖMMERLING','PREMILINE','CORREDERA','PVC',2.20,'1g2ss8hogcQ7eb9cK5iOvRFTXUC_nWdwS','https://drive.google.com/file/d/1g2ss8hogcQ7eb9cK5iOvRFTXUC_nWdwS/view',true,'Sistema de perfiles deslizantes. Uf desde 2,20 W/m²K.'),
    ('KÖMMERLING','EUROFUTUR ELEGANCE','ABISAGRADA','PVC',1.30,'12eBudBgfvDh_RI5tq1DPHnh-qW1cXJbx','https://drive.google.com/file/d/12eBudBgfvDh_RI5tq1DPHnh-qW1cXJbx/view',true,'Uf desde 1,30 W/m²K con hoja 0113 (1,40 con hoja 0011).'),
    ('GEALAN','S 8000','ABISAGRADA','PVC',1.20,'1hibBW0DhJahEY_GrZmFhNtcrNi3NtTC_','https://drive.google.com/file/d/1hibBW0DhJahEY_GrZmFhNtcrNi3NtTC_/view',true,'Ensayo del valor Uf = 1,2 W/(m²·K).'),
    ('KBE','70 MM','ABISAGRADA','PVC',1.40,'1UUqGls4i-CFGoGCFEWiwYjNjpj8la880','https://drive.google.com/file/d/1UUqGls4i-CFGoGCFEWiwYjNjpj8la880/view',true,'Uf de la carpintería 1,4 W/m²K (ensayo 1230x1480 con vidrio 4-16-4 b.e.).'),
    ('REHAU','EURO-DESIGN 70','ABISAGRADA','PVC',1.30,'1NEy_7NA-MxI0NslXs_aHd5Z5NQJy0IFG','https://drive.google.com/file/d/1NEy_7NA-MxI0NslXs_aHd5Z5NQJy0IFG/view',true,'Uf 1,3 W/m²K (ventana de 1.230 x 1.480 mm).'),
    ('STRUGAL','PLANIA (doble junta)','ABISAGRADA','PVC',1.30,'1LRCb102NipYoQ10Af5Qry3f6kSUHJOUA','https://drive.google.com/file/d/1LRCb102NipYoQ10Af5Qry3f6kSUHJOUA/view',true,'Cálculo flixo del nudo 5 (marco 11331 + hoja 11241): Uf = 1,3 W/(m²·K).'),
    ('STRUGAL','PLANIA (triple junta)','ABISAGRADA','PVC',1.25,'1zxixakM9bkhzZ1DVNfZ7ySeTRCsE7_ps','https://drive.google.com/file/d/1zxixakM9bkhzZ1DVNfZ7ySeTRCsE7_ps/view',true,'Cálculo flixo del nudo 5 (marco 11341 + hoja 11241): Uf = 1,25 W/(m²·K).'),
    ('STRUGAL','PLANIA (triple junta, refuerzo con rotura)','ABISAGRADA','PVC',1.10,'1AlCq142oVmVTvQrmO1-PF5Fx0owjur4E','https://drive.google.com/file/d/1AlCq142oVmVTvQrmO1-PF5Fx0owjur4E/view',true,'Cálculo flixo del nudo 5.2 (marco 11341 + hoja 11241, refuerzo con rotura): Uf = 1,10 W/(m²·K).'),

    -- La ficha está, pero el Uf no está escrito dentro: se deja SIN valor a
    -- propósito. Un número tomado del nombre del fichero acabaría impreso en un
    -- certificado sin que nadie lo haya comprobado.
    ('STRUGAL','S53RP','ABISAGRADA','ALUMINIO RPT',NULL,'1uDS-I2O3ZCEtvJBZgEQVbGlC8eacIEII','https://drive.google.com/file/d/1uDS-I2O3ZCEtvJBZgEQVbGlC8eacIEII/view',false,'La ficha se llama "S53RP Y VALOR Uf 1.59" pero el documento solo imprime Uw ≥ 0,9. Confirma el Uf dentro antes de darlo por bueno.'),
    ('STRUGAL','VALIR','CORREDERA','ALUMINIO RPT',NULL,'1_D9-hOmm9AgUwJtABMUWp9l64GR_xPZd','https://drive.google.com/file/d/1_D9-hOmm9AgUwJtABMUWp9l64GR_xPZd/view',false,'La ficha se llama "S53RP Y VALIR Uf 2.7" pero el documento imprime Uw ≥ 1,6 a 2,5. Confirma el Uf dentro.'),
    ('STRUGAL','DOMUS','ABISAGRADA','ALUMINIO RPT',NULL,'1De3EdbAE7f9zKmE0zPIHEsYkK9_8EIcf','https://drive.google.com/file/d/1De3EdbAE7f9zKmE0zPIHEsYkK9_8EIcf/view',false,'La ficha se llama "DOMUS Y VALOR Uf 1,37" pero el documento imprime Uw ≥ 0,9. Confirma el Uf dentro.'),
    ('SIMER','4200 A.62 RPT C16','ABISAGRADA','ALUMINIO RPT',NULL,'14jEMj0UzKbBeSu1R_gJOksb4Mng7Vdsg','https://drive.google.com/file/d/14jEMj0UzKbBeSu1R_gJOksb4Mng7Vdsg/view',false,'Marco 62 mm / hoja 70 mm. La ficha declara Uw hasta 1,0 W/m²K, no el Uf.'),
    ('SIMER','3600 C32 RPT','CORREDERA','ALUMINIO RPT',NULL,'1yFnE9L06_xl93FOo_VpPdOaQbBNaYjLu','https://drive.google.com/file/d/1yFnE9L06_xl93FOo_VpPdOaQbBNaYjLu/view',false,'La ficha declara Uw hasta 1,5 W/m²K, no el Uf.'),
    ('CORTIZO','COR 60 CC16 RPT','ABISAGRADA','ALUMINIO RPT',NULL,'1il5h5dilf1gXuI5TnLTHNAyEHGpyoP_A','https://drive.google.com/file/d/1il5h5dilf1gXuI5TnLTHNAyEHGpyoP_A/view',false,'La ficha declara Uw desde 0,9 W/m²K. El Uf está en el cálculo térmico adjunto de la misma carpeta.'),
    ('CORTIZO','COR 70 HOJA OCULTA','ABISAGRADA','ALUMINIO RPT',NULL,'1A6wrQkMBJTBbckTFhgpkG3L6ZXYOf2JI','https://drive.google.com/file/d/1A6wrQkMBJTBbckTFhgpkG3L6ZXYOf2JI/view',false,'Informe térmico Cortizo: declara Uw = 1,1 W/(m²·K) con 4BE(12Ar)4(12Ar)4BE. El Uf va por nudos en el informe de secciones.'),
    ('CORTIZO','COR 3500','CORREDERA','ALUMINIO',NULL,'1T0Y2SKUvYVp_ZfyEcCPKfuMgj7hAhqZf','https://drive.google.com/file/d/1T0Y2SKUvYVp_ZfyEcCPKfuMgj7hAhqZf/view',false,'Cálculo térmico Cortizo COR 3500 (documento escaneado: el Uf hay que leerlo a mano).')
ON CONFLICT (marca, serie, apertura) DO NOTHING;

INSERT INTO public.ventanas_cristales
    (fabricante, gama, composicion, ug, factor_solar, transmision_luminosa, ficha_tecnica_id, ficha_tecnica, validado, notas)
VALUES
    -- Saint-Gobain / Calumen
    ('SAINT-GOBAIN','PLANITHERM 4S','4 (16 AIRE) 4',1.3,0.43,66,'1Tz22FNQCza7tUbpK9RdMnoAHmMlVbzeB','https://drive.google.com/file/d/1Tz22FNQCza7tUbpK9RdMnoAHmMlVbzeB/view',true,'Calumen. Capa PLANITHERM 4S en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','4 (12 AIRE) 4',1.6,0.43,66,'1qFj90xPAouppF77sznjqd-A3vT-rR-vi','https://drive.google.com/file/d/1qFj90xPAouppF77sznjqd-A3vT-rR-vi/view',true,'Calumen. Capa PLANITHERM 4S en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','6 (14 AIRE) 4',1.4,0.43,65,'1BpZinjqJKNIaKL85VcpKVAA-_8vlciqS','https://drive.google.com/file/d/1BpZinjqJKNIaKL85VcpKVAA-_8vlciqS/view',true,'Calumen. Capa PLANITHERM 4S en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','6 (14 AIRE) 6',1.4,0.42,65,'1W-71o-iTqoYafFcCIdvgzdXs7ybyvqUX','https://drive.google.com/file/d/1W-71o-iTqoYafFcCIdvgzdXs7ybyvqUX/view',true,'Calumen. Capa PLANITHERM 4S en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','6 (16 AIRE) 5',1.3,0.42,65,'1i2qShpm9O7wSq_Y4oPCuwiUuutt1_8Eh','https://drive.google.com/file/d/1i2qShpm9O7wSq_Y4oPCuwiUuutt1_8Eh/view',true,'Calumen. Capa PLANITHERM 4S en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','4 (14 AIRE) 4',1.4,0.43,66,'1C4f1ZYpqhQboWs2BABmc3CpKvB1xZPin','https://drive.google.com/file/d/1C4f1ZYpqhQboWs2BABmc3CpKvB1xZPin/view',true,'Calumen. Capa PLANITHERM 4S en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','4 (16 AIRE) 44.1 SILENCE',1.3,0.43,65,'1wijGPFa14XKSsFfM-gDbFP6LUAxwLQ-B','https://drive.google.com/file/d/1wijGPFa14XKSsFfM-gDbFP6LUAxwLQ-B/view',true,'Calumen. Laminado acústico PVB SILENCE en el vidrio interior.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','6 (16 AIRE) 44.1 SILENCE',1.3,0.42,64,'1RFM3lBVAOrcnljz-X0g5_f0LcMfjsCVo','https://drive.google.com/file/d/1RFM3lBVAOrcnljz-X0g5_f0LcMfjsCVo/view',true,'Calumen. Laminado acústico PVB SILENCE en el vidrio interior.'),
    -- Ojo: su fichero se llama "6 (16 AIR) 44.1 SI" pero DENTRO la configuración
    -- es de 14 mm, y por eso da 1,4 y no 1,3. Manda lo que dice el documento.
    ('SAINT-GOBAIN','PLANITHERM 4S','6 (14 AIRE) 44.1 SILENCE',1.4,0.42,65,'1e0uWyqrlx54ov3yj9u1rt7_yXRbrYZIY','https://drive.google.com/file/d/1e0uWyqrlx54ov3yj9u1rt7_yXRbrYZIY/view',true,'Calumen. El nombre del fichero dice 16 mm, pero la configuración del informe es 6 (14 AIR) 44.1 SI.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','6 (14 ARGÓN 90) 44.1 SILENCE',1.1,0.42,65,'1uho9U1t_5yooAdlSLoVkmhaAhL3BqBFP','https://drive.google.com/file/d/1uho9U1t_5yooAdlSLoVkmhaAhL3BqBFP/view',true,'Calumen. Cámara de argón al 90 %.'),
    ('SAINT-GOBAIN','PLANITHERM 4S','44.1 SILENCE (16 AIRE) 4',1.3,0.43,65,'1fBplMd4efqz7LhQjs_IpguuoHqQE19EG','https://drive.google.com/file/d/1fBplMd4efqz7LhQjs_IpguuoHqQE19EG/view',true,'Calumen. Laminado acústico en el vidrio exterior.'),
    ('SAINT-GOBAIN','PLANITHERM ONE','6 (14 AIRE) 4',1.4,0.47,70,'1Owx-JPFqjJres5iXE_2KhvSrwit6t4v7','https://drive.google.com/file/d/1Owx-JPFqjJres5iXE_2KhvSrwit6t4v7/view',true,'Calumen. Capa PLANITHERM ONE en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM ONE','6 (16 AIRE) 4',1.3,0.47,70,'1Qh_8y92dpvo-asfRRDBHbPE0ZiaUZYHC','https://drive.google.com/file/d/1Qh_8y92dpvo-asfRRDBHbPE0ZiaUZYHC/view',true,'Calumen. Capa PLANITHERM ONE en cara 2.'),
    ('SAINT-GOBAIN','PLANITHERM XN','4 (16 AIRE) 6',1.4,0.65,81,'1M5iDi9etgCyBxvmWpLGmLdbEM1yC_c5D','https://drive.google.com/file/d/1M5iDi9etgCyBxvmWpLGmLdbEM1yC_c5D/view',true,'Calumen. Capa PLANITHERM XN en cara 3.'),
    ('SAINT-GOBAIN','PLANITHERM XN','6 (16 AIRE) 4',1.4,0.60,NULL,'1EXb0dOUXHLmrqvWV6yec9rb0yOixYi4a','https://drive.google.com/file/d/1EXb0dOUXHLmrqvWV6yec9rb0yOixYi4a/view',true,'Calumen. Capa PLANITHERM XN.'),
    ('SAINT-GOBAIN','PLANISTAR ONE','44.1 (16 AIRE) 44.1',1.3,0.36,70,'1HAhS7XJr5F_DExHzk4_8eTD8UEDkPliD','https://drive.google.com/file/d/1HAhS7XJr5F_DExHzk4_8eTD8UEDkPliD/view',true,'Calumen. Doble laminado con capa PLANISTAR ONE en cara 4.'),

    -- Guardian / Performance Calculator
    ('GUARDIAN','GUARDIAN SUN','4 (16 AIRE) 4',1.3,0.43,NULL,'1Eu42ugwT8FZMpgwTnPL6CtI6LSyCexQV','https://drive.google.com/file/d/1Eu42ugwT8FZMpgwTnPL6CtI6LSyCexQV/view',true,'Performance Calculator. Capa Guardian Sun en cara 2. g = 42,8 %.'),
    ('GUARDIAN','GUARDIAN SUN','4 (16 ARGÓN) 4',1.0,0.43,NULL,'1AL0So8wthTakNTxhzjPERrQ5aivzNlV6','https://drive.google.com/file/d/1AL0So8wthTakNTxhzjPERrQ5aivzNlV6/view',true,'Performance Calculator. Cámara 100 % argón. g = 42,8 %.'),
    ('GUARDIAN','GUARDIAN SUN','4 (14 AIRE) 6',1.4,0.43,NULL,'1ikiu5tYvm_R426OgKorAZSGANW0_MKb5','https://drive.google.com/file/d/1ikiu5tYvm_R426OgKorAZSGANW0_MKb5/view',true,'Performance Calculator. Capa Guardian Sun en cara 2. g = 42,5 %.'),
    ('GUARDIAN','GUARDIAN SUN','6 (16 AIRE) 4',1.3,0.42,NULL,'1_HTvOBUbPfJpdgWqfzrYunY9c_VTtccN','https://drive.google.com/file/d/1_HTvOBUbPfJpdgWqfzrYunY9c_VTtccN/view',true,'Performance Calculator. g = 42,4 %.'),
    ('GUARDIAN','GUARDIAN SUN','3+3 (14 AIRE) 4',1.4,0.43,NULL,'1RL6vhH015ppbYu-d1kD2gBCBBK2PpcmU','https://drive.google.com/file/d/1RL6vhH015ppbYu-d1kD2gBCBBK2PpcmU/view',true,'Performance Calculator. Laminado exterior 3+3. g = 42,7 %.'),
    ('GUARDIAN','GUARDIAN SUN','4 (20 AIRE) 4',1.4,0.51,NULL,'10nDsFHqLDbzohHNQafeHn-VfxMDUCCWX','https://drive.google.com/file/d/10nDsFHqLDbzohHNQafeHn-VfxMDUCCWX/view',true,'Performance Calculator. Capa Guardian Sun en cara 3 (no en la 2): por eso el factor solar sube a 50,7 %.')
ON CONFLICT (fabricante, gama, composicion) DO NOTHING;
