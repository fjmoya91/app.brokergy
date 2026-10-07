<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### La OFERTA — el paso anterior al expediente (2026-09-23)

Botón **Enviar oferta** en la pestaña CEE directos (junto a "+ Nuevo CEE"). Se
elige qué se ofrece —**un certificado (150 €)** o **inicial + final (220 €)**, sin
IVA y editable—, la **tasa de registro por certificado** (16,39 €, la de
Castilla-La Mancha; 0 = no se incluye) y el cliente, que puede ser un **alta
rápida con solo nombre y teléfono** (lo que se tiene de quien pregunta por
WhatsApp; se crea la ficha al enviar y se borra si no sale por ningún canal).
Conceptos y observaciones son los de los presupuestos que ya se mandaban
(P-26ING_39): "Certificado de Eficiencia Energética inicial y final, incluida su
presentación en Industria" + "Tasa Certificado … Castilla-La Mancha". Sale como la propuesta CAE:
**el PDF adjunto y un enlace** (`/aceptar-cee/:token`) donde el cliente completa
sus datos y la acepta. **Al aceptar nace el expediente `{AAAA}CEE_{n}`**.

| Qué | Dónde |
|---|---|
| Importes, líneas, mensaje y el HTML del PDF (fuente única: popup, backend y página pública) | [logic/ofertaCee.js](implementation/frontend/src/features/cee-directo/logic/ofertaCee.js) |
| Guardar, rasterizar, enviar y aceptar | [services/ceeOfertaService.js](implementation/backend/services/ceeOfertaService.js) |
| Alta del expediente al aceptar | `crearExpediente` en `ceeDirectoService.js` |
| Rutas staff | `GET/POST /api/cee-directos/ofertas` · `/:ofertaId/pdf` · `/enviar` · `/anular` (declaradas ANTES que `/:id`) |
| Rutas públicas | `GET /api/public/oferta-cee/:token` · `/pdf` · `POST /aceptar` |
| Superficies | `OfertaCeeModal` · filas del propio listado (`CeeDirectosView` + `AccionesOferta`) · `AceptarOfertaCeeView` |
| Esquema | `scripts/cee_ofertas_schema.sql` (tabla `cee_ofertas`, RLS deny-all) |
| Prueba | `node implementation/backend/scripts/test_oferta_cee.mjs` |

**REGLA — en el LISTADO el presupuesto es una FILA más, no un bloque aparte.**
Es trabajo vivo con la pelota en el cliente, así que va en la misma tabla: número
`{AAAA}PCEE_{n}` con su pastilla «Presupuesto», estado **«PRESUPUESTO ENVIADO»**,
«Pelota: Cliente» y los días desde el último envío. Pulsarla despliega sus
acciones (PDF · copiar enlace · reenviar · anular) — no abre ficha, porque todavía
no hay expediente. El **ACEPTADO no se pinta**: ya es la fila de su expediente y
saldría dos veces; el **ANULADO** solo con «Ver terminados» o buscando. Buscador y
filtro de prescriptor valen igual para los dos tipos de fila.

**REGLA — la oferta va en su PROPIA tabla, no como fila de `cee_directos`.** El
correlativo de los CEE es global y seguido desde 2024: una oferta rechazada se
comería un número, y además aparecería en el listado, el radar y la facturación.
Su número es `{AAAA}PCEE_{n}` y lo compone la BD en el INSERT (secuencia +
columna generada). Si ningún canal sale, la oferta se BORRA: nunca llegó a nadie.

**REGLA — el PDF es una RÉPLICA del presupuesto de AppSheet**
(`appsheet-factura-pdf/lib/presupuestoAppsheetHtml.js`), con las fuentes
AUTO-ALOJADAS (regla 25.b) y en una sola hoja: una oferta tiene dos líneas como
mucho. No se guarda en BD (regla 21): se REGENERA de la fila, y al aceptar se
archiva en `3. PRESUPUESTO Y FACTURAS` del expediente recién creado.

**La tasa es un suplido, sin IVA y UNA POR CERTIFICADO** (inicial + final = dos).
La nota del PDF cita el art. 78.Tres.3º LIVA — la plantilla de AppSheet citaba el
20.Uno.1º, que es otra cosa.

**REGLA — la aceptación pide LO MISMO que /firma/:id, SIN la cuenta bancaria**:
aquí no hay bono que ingresarle, paga él. Mismo reparto del email y el teléfono
(desvío de contacto, partner que no se pisa) y, si el DNI ya es de otra ficha, se
usa esa en vez de fallar. Y termina de completar sus datos: el **inmueble** —con
la **referencia catastral** siempre a la vista (rellena si la tenemos), botón
"Buscar" y **"Usar mi ubicación"** (GPS → `/api/catastro/reverse-geocode`, lo
mismo que la captación; en un edificio de varias viviendas se le pregunta cuál
es la suya)— y su **domicilio** ("vivo en este inmueble", por defecto sí). Lo
que corrige el cliente MANDA sobre lo de la oferta: el Catastro no da el piso. Las condiciones son propias
(`condicionesOfertaCee.js`, versión sellada en la oferta) y el popup de
condiciones se reutiliza parametrizado.

**REGLA — aceptar es un claim ATÓMICO** (`eq estado ENVIADA`) antes de crear nada:
dos pulsaciones no crean dos expedientes, y si el alta falla la oferta vuelve a
ENVIADA. Al aceptar se avisa al staff (WhatsApp + email, con el enlace para
encargar el CEE) y se le da acuse al cliente con su número de expediente.
