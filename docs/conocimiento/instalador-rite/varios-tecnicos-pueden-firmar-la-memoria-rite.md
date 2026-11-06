<!-- conocimiento · área: instalador-rite · las rutas de los enlaces son relativas a la raíz del repo -->

## VARIOS técnicos pueden firmar la Memoria RITE de una empresa (2026-11-06)

FONCAMAN CRIPTANA tiene dos instaladores con carné que firman sus memorias: FRANCISCO JAVIER
MANJAVACAS LIZCANO (06263712F, carné 460000330) y ANTONIO MANJAVACAS LIZCANO (06221962W). El
instalador pidió que por defecto salga Francisco Javier, sin que el otro desaparezca. La ficha solo
tenía sitio para UN técnico firmante.

**REGLA — `tecnico_firmante_*` sigue siendo el técnico POR DEFECTO; los demás van en
`prescriptores.tecnicos_firmantes_rite`** (JSONB `[{nombre, apellidos, dni, carnet}]`, migración
`backend/scripts/prescriptores_tecnicos_firmantes_rite.sql`). Así ningún generador, barrido ni
espejo Python cambia: todos siguen leyendo los mismos campos. En la ficha (`PrescriptorDetailModal`,
bloque «Habilitación RITE») se añaden, se quitan y «Hacer por defecto» intercambia uno con el de
arriba. La lista la sanea `limpiarTecnicosRite` (mayúsculas, sin filas sin nombre o DNI, máx. 10) y
el PATCH general solo la toca si viene en el payload.

**REGLA — cuál firma se ELIGE al enviar, y vale para ESE expediente.** Con más de un técnico, la
tarjeta «Firma la Memoria RITE» de `FirmantesEnvio` pasa a ser un selector (popup RITE y popup del
CIFO cuando manda también la memoria). Elegir guarda `documentacion.memoria_rite_tecnico = { dni,
nombre, at, por }` por `PUT /api/expedientes/:id/memoria-rite/tecnico` (staffOnly, RPC de merge,
clave en `CLAVES_PROTEGIDAS`); elegir el de por defecto guarda `dni: null`, así que si mañana se
cambia el de por defecto en la ficha, los expedientes sin elección lo siguen. El nombre lo resuelve
el servidor desde la ficha, nunca del body.

**REGLA — la sustitución la hace UNA función y su espejo**: `aplicarTecnicoRite(pres, dni)`
([instaladorFirmante.js](implementation/backend/utils/instaladorFirmante.js)) en `loadRiteContext`
—de ahí beben `/memoria-rite/files`, `/generate`, `/instalador/enviar` y el barrido— y
`presConTecnicoRite` ([instaladorPendientes.js](implementation/frontend/src/features/expedientes/logic/instaladorPendientes.js))
en el CIFO (fila «Técnico firmante de la memoria»). Pone al elegido en `tecnico_firmante_*`. Un DNI
que ya no está en la ficha cae al de por defecto: nunca un documento a nombre de quien ya no figura.
Un técnico sin carné NO hereda el del de por defecto.

⚠️ El camino LEGADO del microservicio (`/generar-rite/{numero}`, solo CLI, con su propio
`SQL_INSTALADOR`) no conoce la elección: saca siempre el de por defecto.

Tras tocarlo: `node implementation/backend/scripts/test_tecnicos_rite.js 26RES060_259 --generar`
(con el rite-generator levantado y `RITE_SERVICE_URL` apuntando a él): genera la memoria con cada
técnico y comprueba que sale el nombre y el carné de ese y no el del otro.
