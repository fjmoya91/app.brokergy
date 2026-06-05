# Mapeo Supabase → Memoria RITE (app.brokergy)

Project ID Supabase: `okfeopwetlxdffrsbfqw`

## Cómo localizar un expediente
```sql
SELECT e.*, o.*, c.*
FROM expedientes e
LEFT JOIN oportunidades o ON e.oportunidad_id = o.id
LEFT JOIN clientes c ON e.cliente_id = c.id_cliente
WHERE e.numero_expediente = '26RES060_120';
```

## Origen de cada dato de la memoria

### Titular → tabla `clientes`
- nombre = `nombre_razon_social` + `apellidos`
- NIF = `dni`
- dirección = `direccion`, `municipio`, `provincia`, `codigo_postal`
- teléfono = `tlf`

### Ubicación instalación → `expedientes.instalacion` (jsonb) + `oportunidades`
- ref_catastral = `instalacion->>ref_catastral` (o `oportunidades.ref_catastral`)
- coords = `instalacion->>coord_x` / `coord_y`
- misma_direccion = `instalacion->>misma_direccion` (si true, usar dirección del cliente)

### Equipo calefacción → `instalacion->aerotermia_cal`
- marca, modelo, potencia, scop (SCOP/COP), numero_serie
- refrigerante: deducir del modelo (R290, R32, R410A...) o del catálogo `aerotermia`
- Datos técnicos extra (SCOP 35/55, SEER) → JOIN `aerotermia` por `aerotermia_db_id`

### Equipo ACS → `instalacion->aerotermia_acs`
- marca, modelo, potencia, scop, numero_serie
- acumulación litros: deducir del modelo (ACS 110 → 110 L) o catálogo

### Emisor → `instalacion->>tipo_emisor`
- "radiadores_convencionales" → RADIADORES (solo calor, sin generador frío)
- "suelo_radiante" → SUELO RADIANTE
- Si hay frío reversible + fancoils → marcar generador frío

### Caldera sustituida → `instalacion->caldera_antigua_cal`
- marca, modelo, numero_serie → tipo actuación = REFORMA/SUSTITUCIÓN

### Datos de cálculo / demandas → `oportunidades.datos_calculo->inputs`
- superficie, zona climática (`zona`), año construcción (`anio`), plantas
- demandas: `inputs->xmlDemandData` (demandaCalefaccion, demandaACS, demandaRefrigeracion)
- num habitaciones → `expedientes.cee->>num_rooms`

### ⚠️ Cargas térmicas por local
**NO están en la BD.** Solo hay superficie total y nº habitaciones.
Opciones: (A) dejar en blanco, (B) estimar proporcional × factor (90 W/m² zona fría),
(C) pedir desglose. El reparto estimado NO es dato real → avisar siempre.

### Instalador → tabla `prescriptores` (vía `expedientes.instalador_asociado_id` o `instalacion->>instalador_id`)
**IMPORTANTE:** los datos del firmante están en la PROPIA tabla prescriptores,
NO en `usuarios`. No hacer JOIN con usuarios para el nombre.
- razón social = `razon_social`, CIF = `cif`
- **nombre firma = `nombre_responsable` + `apellidos_responsable`** (ej. "ERNESTO OVEJERO MARTI")
- cargo = `cargo`
- **Nº Empresa RITE (Reg. Integrado Industrial) = `numero_carnet_rite`** (ej. "08-B-D20-46001112")
  ⚠ OJO: pese al nombre del campo, `numero_carnet_rite` guarda el **Nº de Empresa RITE**
  (registro integrado industrial), NO el carné personal del técnico.
  En la memoria va en "Instalador/a con carné" y en el JE6 en "Nº Registro Integrado Industrial".
- NIF del firmante = `nif_responsable` (a menudo vacío → completar en BD)
- localidad firma = `municipio`
- marcas = `marca_referencia` (CSV: "TRADESA,PANASONIC")

```sql
SELECT razon_social, cif, numero_carnet_rite,
       nombre_responsable, apellidos_responsable, nif_responsable, cargo, municipio
FROM prescriptores WHERE id_empresa = '<instalador_id>';
```

## Posiciones de campo en plantilla (modelo RD 1027/2007)
El relleno es POR POSICIÓN (los nombres están duplicados: Texto33 ×3, Casilla31 ×N).
Filtrar ffData sin nombre para alinear índices (452 campos válidos).

| Pos | Campo | Pos | Campo |
|-----|-------|-----|-------|
| 0 | Nombre titular | 71 | Marca gen. calor |
| 1 | NIF | 72 | Modelo |
| 2 | ✓Física | 73 | Nº fabricación |
| 5 | ✓Mujer | 74 | Potencia calef. |
| 6/7 | Calle/Nº titular | 75 | Acumulación L |
| 10 | Teléfono | 119-122 | Aislamiento tuberías |
| 12/13 | Localidad/Prov titular | 132 | ✓Bitubo |
| 14/15 | Calle/Nº instalación | 137 | ✓Cobre |
| 18/19 | Localidad/Prov instalación | 140/142 | Ø máx/mín |
| 20 | ✓Vivienda | 151 | ✓Radiadores aluminio |
| 26/27 | ✓Calefacción/✓ACS | 158-178 | Regulación (SI por fila) |
| 30 | ✓Individual | 179/180 | Temp verano/invierno |
| 33 | ✓Reforma | 219+ | Tabla cargas (filas ×9, inicio Texto147) |
| 37 | ✓Electricidad | 445 | Firma: nombre instalador |
| 40/41 | ✓Otro + "AEROTERMIA" | 446 | Firma: carné RITE |
| 69/70 | ✓Calef-ACS/✓Bomba calor | 450/451 | Firma: localidad/fecha |

Tabla cargas: 25 filas disponibles. Columnas por fila (9):
Texto147=planta, 146=local, 148=nº, 149=superficie, 150=orientación,
151=cargas_cálculo, 152=emisor, 155=elementos, 154=potencia.
