<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «REVISAR el CEE que entrega el certificador (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### Con el `.cex` delante, y la MEDIDA DE MEJORA (2026-09-29)

La revisión lee también el **`.cex` que entregó el técnico** — el depósito de ACS, la cola con la
que CE3X estima la caldera y la **medida de mejora** solo están ahí. Criterios de Fran (29/09/2026),
todos **medidos sobre los 143 CEE iniciales que él había aprobado** antes de fijarlos:

| Qué | Dónde |
|---|---|
| Los HECHOS del `.cex` (sin deserializar) | [tools/radiografia_cex.py](implementation/cee-engine/tools/radiografia_cex.py) → `POST /cex/radiografia` |
| Poner la medida en el `.cex` del técnico | `poner_medida` en `cee-engine/server.py` → `POST /cex/medida` |
| Bajar el `.cex`/`.xml` del técnico y llamar al motor | [services/cee/revisionCex.js](implementation/backend/services/cee/revisionCex.js) |
| El juicio de lo que sale del `.cex` | [services/cee/revisionCeeCex.js](implementation/backend/services/cee/revisionCeeCex.js) |
| Carga (BD + Drive + motor), compartida CLI/barrido | [services/cee/cargarRevision.js](implementation/backend/services/cee/cargarRevision.js) |
| Calibrar contra lo aprobado | `node scripts/barrer_revision_cee.js [--cex-json …]` |
| Pruebas | `node scripts/test_revision_cee_cex.js` · `pytest cee-engine/tests/test_radiografia_cex.py` |

**REGLA — las transmitancias y la ventilación, IGUALES A LA GUÍA (`getUByYear` /
`getVentanaYACHByYear`), pero solo AVISO y solo desde el 01/04/2026** (`FECHA_GUIA`). Medido: de 142
aprobados solo 55 la cumplían entera —53 de los 68 que firmó el propio Fran difieren—, y la
coincidencia sube desde abril de 2026. Antes de esa fecha, solo se informa. No cuentan el suelo
contra el terreno «Por defecto» (su U la calcula CE3X), las medianeras ni los puentes.

**REGLA — la demanda y la superficie por debajo de lo simulado: aviso hasta −10 %, NO APTO más
abajo** (`LIMITE_FALLO_PCT`). Había aprobados 13 entre −4 % y −24 %.

**REGLA — el rendimiento de la caldera SOLO INFORMA** (estado `info`, que se enseña y no cuenta en el
veredicto). El `.xml` da el ESTACIONAL (56,8 %) y la tabla del expediente es otra cosa (79 %): como
aviso saltaba en 97 de 116 aprobados.

**REGLA — la medida de mejora del INICIAL es obligatoria en sustitución e hibridación** (NO APTO sin
ella; en RES080, aviso: 20 de los 22 aprobados sin medida son RES080), **tiene que estar CALCULADA**,
**calculada sobre ESTE edificio** y con **el equipo, el SCOP y el SCOP_dhw del expediente** (±2 %)
—en hibridación, el C_b—. Una medida calculada guarda DOS fotos del edificio (`datosEdificioOriginal`
y `datosNuevoEdificio`, con instalaciones, envolvente y generales): si la original no coincide con el
fichero de hoy, el certificador tocó el edificio después de calcularla (**medida desfasada** →
NO APTO). Medido en 26RES060_154: superficie 213,9 → 280 m² y ACS 336 → 140 l/día después.

**REGLA — si el expediente aún no declara la aerotermia, se compara (y se compone) con la GENÉRICA
de la simulación** (`conAerotermiaSimulada` en `fichaCe3x.js`: SCOP de calefacción, SCOP_dhw y
potencia de la oportunidad). Criterio de Fran: «si se ha traído de la oportunidad, la que aparezca;
si no, una genérica». Medido el 29/09/2026: 13 de los 15 iniciales pendientes no la tenían. Vale
también para el equipo de ACS aparte que no declara su SCOP_dhw (o que ni se ha identificado).

**REGLA — en la MEDIDA, si el ACS no se cambia y la caldera que se retira era mixta, el ACS lo da un
TERMO ELÉCTRICO** (`termoSiRetira` en `instalacionNueva`, lo pide `medidasCe3x`). Quién daba el ACS
lo dicen los equipos del `.cex` de esa fase (`existentes`), nunca el flag `misma_caldera_acs`. Solo
en sustitución: en una hibridación la caldera se queda.

**REGLA — la app PONE la medida, pero no la CALCULA.** `--poner-medida` (o `ponerMedida`) compone la
medida con los MISMOS escritores que el `.cex` que genera la app y la mete en el fichero del técnico
tocando SOLO los pickles 5, 6 y la casilla del informe; lo guarda como
`{nº} - CEE INICIAL_CON MEDIDA_REVISAR.cex` (el `_REVISAR` hace que `matchSlot` no lo tome por la
entrega). Una medida suya con otro nombre se conserva. El ahorro y la calificación los calcula el
motor de CE3X al pulsar «Actualizar», que no está aquí: alguien tiene que abrirlo y pulsarlo.

**REGLA — sin `.xml` en la BD se busca en Drive** (los migrados: 210 de los aprobados no lo tienen en
la BD) y **sin motor, los puntos del `.cex` salen «sin comprobar»**, nunca en blanco.

⚠️ El `.cex` se busca SIN crear ni hacer pública la carpeta (`carpetaSinCrear`): para LEER no se
toca Drive.
