<!-- conocimiento · área: rite-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La app RITE — rite.brokergy.es (2026-11-25)

**Por qué.** Lo pidió Fran el 25/11/2026, a raíz de un instalador que pedía una memoria RITE suelta:
«al igual que tengo una aplicación de los certificados de eficiencia energética, una aplicación que sea
independiente pero que esté integrada» para hacer las memorias RITE. Los datos de entrada son los de
siempre (el titular, la superficie del Catastro, los rendimientos de la máquina) y hay dos niveles:
**rápido** (las estancias se estiman por la superficie) y **extendido** (se meten las estancias y los
elementos de radiador de cada una, y de ahí sale la potencia por estancia). Se le propusieron tres
alcances: el asistente dentro del CIT del CRM, el CIT más la app del instalador, o una app externa. **Eligió
la app externa en su subdominio, como «CEE by BROKERGY»** (tarjeta del 25/11/2026).

### Lo que se reutiliza (no se reescribe ninguna regla de la memoria)

**REGLA — la memoria suelta pasa por las MISMAS funciones que la de una obra CAE.** Una memoria de la app
no tiene expediente: [services/riteapp/payload.js](implementation/backend/services/riteapp/payload.js) traduce sus
datos y la cuenta del instalador a las formas `exp`, `cli`, `op` y `pres` del CRM y las pasa por
`validateMemoriaRite` ([utils/riteValidation.js](implementation/backend/utils/riteValidation.js)) y por
`buildRitePayloads` ([services/riteGenerador.js](implementation/backend/services/riteGenerador.js), sacado de
`routes/expedientes.js` ese día para que sea la fuente única de las dos entradas). El generador
(`rite-generator`, `/generar-rite-json`) es el mismo contenedor: las reglas 74, 228, la cascada, el
emplazamiento de la regla 149 y el ACS valen solas.

| Pieza | Dónde | Estado |
|---|---|---|
| Generador (Word, PDF, borrador del certificado, guía JE6) | `implementation/rite-generator` | ya en producción |
| Validación (lo que falta) | `validateMemoriaRite` | ya en producción |
| Payload del generador | `services/riteGenerador.js` | sacado del router el 25/11 |
| Memoria suelta → formas del CRM, tabla de estancias, avisos | `services/riteapp/payload.js` | hecho, 11 pruebas |
| Modo extendido (elementos reales) | `cargas_desde_locales` en `rite-generator/lib/cargas_termicas.py` | hecho |
| Tablas | [scripts/riteapp_schema.sql](implementation/backend/scripts/riteapp_schema.sql) | escrito, **sin aplicar** |
| Cuentas, alta con Google o email, créditos | patrón de la app de certificadores (`certappAuth`, `certapp_movimientos`) | por hacer |
| Pantallas | 3.ª entrada del build, `rite.html` + `src/rite/`, con las piezas de `src/certificadores/ui` | por hacer |
| Catastro | `traerDireccionCatastral` / `catastroService.getByRC` (dirección, superficie, plantas y zona) | ya existe |
| Equipos | catálogo `aerotermia` (potencias, SCOP, frío) con `resolvePotenciasCatalogo` | ya existe |

### El modo extendido: la potencia sale de los radiadores

**REGLA — en el modo extendido, la POTENCIA INSTALADA de una estancia es elementos × W por elemento; la
CARGA de cálculo sigue siendo m² × W/m² de la zona.** Por defecto 100 W por elemento (el criterio del
22/09/2026: aluminio de 600 mm a ΔT50 da 119-141 W, y 100 W deja margen para la aerotermia), editable para
toda la vivienda (`estancias.w_elemento`) o por estancia (`w_elemento` del local), entre 30 y 400 W. Una
estancia sin elementos se calcula como en el rápido (⌈carga / 100 W⌉). Solo con RADIADORES: con suelo,
splits o conductos los elementos no se guardan y la columna va en blanco. En el modo rápido los elementos
tecleados se descartan. El cálculo está DOS veces, a propósito: `cargas_desde_locales` (lo que sale en el
documento) y su espejo `tablaEstancias` (lo que se enseña antes de generar). Si se cambia uno, se cambia el
otro.

Avisos que no bloquean: estancias sin elementos en el modo extendido; los radiadores suman más de un 25 %
por encima de la potencia de la bomba; estancias estimadas en el rápido («revísalas antes de firmar»).

**REGLA — de momento solo Castilla-La Mancha.** La plantilla es la oficial de la JCCM
(`plantilla_rite_jccm.docx`) y la guía es la de la JE6: una vivienda de otra provincia BLOQUEA con su
motivo (`PROVINCIAS_CLM`).

### El flujo previsto

1. **Alta** (`rite.brokergy.es/`): con Google o con un enlace al email, y una memoria gratis (como la app
   de CEE). Datos de la EMPRESA instaladora: razón social, CIF, nº de empresa RITE, representante que firma
   (o técnico habilitado distinto) y municipio. Si ya es partner de BROKERGY, `prescriptor_id`.
2. **Nueva memoria**: referencia catastral → «Traer datos del Catastro» (dirección, superficie, plantas y
   zona) → titular → equipo del catálogo (o a mano) con su nº de serie, emisor, ACS y frío → fecha de
   pruebas → **estancias, rápido o extendido** (la pantalla de `LocalesRiteModal` más la columna de
   elementos) → revisión con la tabla de cargas y los avisos.
3. **Generar**: la primera vez gasta 1 crédito (`riteapp_consumir_credito_memoria`); volver a generar la
   misma, no. Ficheros: la memoria en Word y PDF, el borrador del certificado y la guía JE6, en su carpeta
   de Drive.
4. **Firmar y presentar**: los firma él (AutoFirma del representante) y los presenta en eDICE, o **«Que la
   presente BROKERGY»**, que da de alta un CIT (`{AAAA}CIT_{n}`) en el CRM con la memoria ya hecha y sigue
   el circuito CIT de siempre.

Numeración de la app: `{AAAA}RIT_{n}`, correlativo propio por año (trigger con candado, como los informes).

### Para producción (lo de una vez, como cee.brokergy.es)

SQL `riteapp_schema.sql` en Supabase (con el «sí» de Fran) · DNS `rite` → `187.77.93.213` · bloque de
nginx + certbot (copia de referencia en `nginx/`) · `RITEAPP_URL` en el `.env` del VPS y en `crearCors` ·
Redirect URLs de Supabase Auth para Google · desplegar el backend y **el contenedor del rite-generator**
(lleva el modo extendido).

Tras tocarlo: `node implementation/backend/scripts/test_riteapp_payload.js` (con el generador levantado,
`--generar <carpeta>` hace los ficheros de verdad).
