-- ============================================================================
-- sime_shp_m_pro_no_es_conjunto.sql — el flag de "conjunto" estaba mal puesto
-- ----------------------------------------------------------------------------
-- Las SIME SHP M PRO (006 · 008 · 010 · 012 · 014 · 016) son bombas de calor
-- MONOBLOQUE aire/agua de 6 a 16 kW para CALEFACCIÓN: no traen acumulador de
-- ACS. Lo confirma su propia ficha de producto (un único PDF para toda la gama,
-- Rgto. 811/2013): declara SCOP a 55 °C y a 35 °C por clima y no menciona ni
-- perfil de carga de ACS ni volumen de acumulación. En el catálogo tenían
-- `deposito_acs_incluido = true` con `litros_acs` vacío, que es justo el síntoma
-- del flag mal puesto.
--
-- POR QUÉ IMPORTA: desde 2026-09-13 ese flag decide que el bloque de ACS del
-- expediente se rellene SOLO con el mismo equipo (ver logic/acsCatalogo.js). Con
-- el flag mal, a una bomba que no calienta agua se le atribuiría el ACS. El
-- síntoma ya se veía antes: 4 expedientes llevan una SHP M PRO y ADEMÁS un
-- interacumulador aparte (26RES060_146 con una ECOMAXI VB 300 S; 26RES060_174,
-- _184 y _185 con un JOHNSON MANANTIAL), que es la prueba de que el depósito no
-- venía dentro.
--
-- CÓMO SE DECLARA SU ACS: con un depósito aparte, o sea el **Anexo VI** de la
-- ficha RES060 (SCOP_dhw = COP A7/55 · Fc) — el modo "Acumulador ACS" del
-- expediente, que toma el COP de la bomba de CALEFACCIÓN. Para eso hace falta
-- `cop_a7_55`, que hoy solo tiene la 010 (3,650).
--
-- EL COP A7/W55, LEÍDO DE SU CATÁLOGO. No está en la ficha de producto del Rgto.
-- 811/2013 (que solo declara SCOP por clima) sino en las TABLAS DE RENDIMIENTO -
-- CALEFACCIÓN del catálogo técnico, fila DB = 7 °C y columna LWT = 55 °C, según
-- EN 14511:2018 — que es la norma que pide el Anexo VI. Fichero en Drive:
-- "SIME_SHP_M_PRO_ficha_tecnica.pdf" (42 págs), páginas 18 a 23.
--
-- Cada valor se comprobó contra su propia fila (COP = HC / PI), que es la
-- verificación interna que trae la tabla:
--
--   006 → 6,40 / 2,00 = 3,20      012 → 12,0 / 4,00 = 3,00
--   008 → 8,20 / 2,60 = 3,15      014 → 14,0 / 4,75 = 2,95
--   010 → 9,40 / 3,03 = 3,10      016 → 16,0 / 5,61 = 2,85
--
-- ⚠️ El 010 tenía 3,650 en el catálogo, que es su COP **A7/W45**: se había copiado
-- de la columna de al lado, un 18 % por encima del real. Con él, 25RES060_68
-- declara hoy un SCOP_dhw de 4,06 (= 3,65 · 1,113) donde le correspondería 3,45.
-- Ese expediente NO se toca aquí: su cifra puede estar ya presentada.
--
-- NO MUEVE NINGUNA CIFRA YA GUARDADA: el flag solo se lee al ELEGIR el modelo
-- (autorrelleno, campo de litros, badge del catálogo). Los SCOP de los
-- expedientes existentes están persistidos en `instalacion` y no se recalculan.
--
-- Aplicado el 2026-09-13.
-- ============================================================================

UPDATE public.aerotermia
   SET deposito_acs_incluido = false
 WHERE marca ILIKE 'SIME'
   AND modelo_comercial ILIKE 'SHP M PRO%'
   AND deposito_acs_incluido;

UPDATE public.aerotermia a SET cop_a7_55 = v.cop
FROM (VALUES
  ('SHP M PRO 006', 3.20),
  ('SHP M PRO 008', 3.15),
  ('SHP M PRO 010', 3.10),   -- tenía 3,650, que es su A7/W45
  ('SHP M PRO 012', 3.00),
  ('SHP M PRO 014', 2.95),
  ('SHP M PRO 016', 2.85)
) AS v(modelo, cop)
WHERE a.marca ILIKE 'SIME' AND a.modelo_comercial = v.modelo;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- Deben quedar los 6 en false y con litros_acs nulo. Las SIME ECOMAXI (VA/VB)
-- NO se tocan: ésas sí son bombas de ACS con acumulador, y tienen sus litros y
-- su SCOP_dhw declarados.
--
-- SELECT modelo_comercial, deposito_acs_incluido, litros_acs, cop_a7_55
--   FROM public.aerotermia WHERE marca ILIKE 'SIME' ORDER BY modelo_comercial;
-- ── OTROS 5 con la MISMA prueba documental (aplicado 2026-09-13) ────────────
-- El registro EPREL distingue el CALEFACTOR (`spaceheaters`) del COMBINADO, que
-- es el que además produce ACS. Cuatro modelos están registrados por su propio
-- fabricante como calefactores, y el quinto lo declara su informe Keymark
-- ("Application: Heating (medium temp)"):
--
--   110  DAIKIN Altherma 3 12 kW      EPREL spaceheaters
--    69  PANASONIC Aquarea HT 9 kW    EPREL spaceheaters
--    67  TOSHIBA ESTÍA ALFA 65        EPREL spaceheaters
--   112  TOSHIBA ESTÍA GAMMA 65       EPREL spaceheaters
--   115  EAS M-THERMAL 2              Keymark 041-K066-07

UPDATE public.aerotermia SET deposito_acs_incluido = false
 WHERE id IN (110, 69, 67, 112, 115);

-- ── COP A7/W55 leídos de informes KEYMARK (EN 14511-2, Medium temperature) ──
--   115  EAS M-THERMAL 2      12,00 / 3,87 = 3,10
--   126  BAXI IRIDIUM 4 kW     4,40 / 1,36 = 3,24
--   124  BAXI IRIDIUM 9 kW     8,00 / 2,52 = 3,18
--   122  BAXI IRIDIUM 12 kW   11,50 / 3,65 = 3,15  ← ya lo tenía; la lectura lo CONFIRMA

UPDATE public.aerotermia a SET cop_a7_55 = v.cop
FROM (VALUES (115, 3.10), (126, 3.24), (124, 3.18)) AS v(id, cop)
WHERE a.id = v.id AND a.cop_a7_55 IS NULL;

-- ── IRIDIUM 6 y 14 kW: el enlace YA era correcto, faltaba leer bien el documento
-- (aplicado el 2026-09-13, tras revisión) ───────────────────────────────────
-- BAXI certifica el Keymark por PAREJA de modelos — "Iridium 4/6" e "Iridium
-- 12/14" son un único informe con DOS bloques "Model Iridium X MR" dentro, cada
-- uno con su propio ensayo EN 14511-2. El enlace de `ficha_tecnica` del 6 kW y
-- del 14 kW YA apuntaba al documento correcto (el que certifica precisamente ese
-- modelo); lo que faltó la primera vez fue leer el SEGUNDO bloque del PDF y no
-- solo el primero que aparece al recorrer el texto plano — con ese error se
-- habría copiado el COP de su "pareja", que es un ensayo distinto:
--
--   125  BAXI IRIDIUM 6 kW   (bloque "Iridium 6 MR")   6,10 / 1,91 = 3,20
--   123  BAXI IRIDIUM 14 kW  (bloque "Iridium 14 MR") 13,50 / 4,44 = 3,04
--
-- Cada uno es un ensayo PROPIO, distinto del de su pareja (4 kW → 3,24 · 12 kW →
-- 3,15): no es el mismo valor repetido, así que copiarlo a ciegas del primer
-- bloque encontrado habría sido tan erróneo como no rellenarlo.

UPDATE public.aerotermia a SET cop_a7_55 = v.cop
FROM (VALUES (125, 3.20), (123, 3.04)) AS v(id, cop)
WHERE a.id = v.id;

-- ── Los 16 que quedan por confirmar (el FLAG, no el COP) ────────────────────
-- AEROSUN CONFORT PLUS 7 · ARISTON NIMBUS COMPACT M NET (50/80/120/150) · BAXI
-- IRIDIUM (4/6/9/12/14) · DAIKIN MINICHILLER · HISENSE HI-AQUASMART · PANASONIC
-- Aquarea HT 7 kW · SAUNIER DUVAL GENIA AIR MAX 8 · GREE VERSATI IV MB (12/16).
-- No se tocan: sus fichas son DE GAMA —cubren la variante con depósito y la que
-- no—, así que mencionar un perfil de carga no prueba que ESE modelo lo lleve. Un
-- flag corregido a ojo es el mismo error al revés.
--
-- ⚠️ El BAXI IRIDIUM ya tiene su COP A7/55 completo en los 5 (arriba), pero eso
-- NO resuelve si `deposito_acs_incluido` es correcto: el dato hace falta tanto si
-- termina confirmándose que NO llevan depósito (Anexo VI) como si el flag se
-- queda como está. Sigue con `deposito_acs_incluido = true` sin confirmar.
--
-- ⚠️ Y el caso contrario: los GREE VERSATI IV MB 12 y 16 SÍ producen ACS —su
-- Keymark declara "Calefacción/ACS" con perfil de carga XL y su η_DHW—. Ahí el
-- problema no es el flag: es que les faltan los datos de ACS en el catálogo.
--
-- Para listar en cualquier momento los que siguen con el síntoma:
-- SELECT id, marca, modelo_comercial, potencia_calefaccion, cop_a7_55
--   FROM public.aerotermia
--  WHERE deposito_acs_incluido AND litros_acs IS NULL
--    AND NOT (coalesce(scop_dhw_medio,0)>0 OR coalesce(scop_dhw_calido,0)>0
--             OR coalesce(eta_acs_calida,0)>0 OR coalesce(eta_acs_media,0)>0)
--  ORDER BY marca, modelo_comercial;
