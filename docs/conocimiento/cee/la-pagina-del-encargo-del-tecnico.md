<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## La PÁGINA DEL ENCARGO del técnico (2026-09-30)

Al certificador el encargo le llegaba repartido en un email, un WhatsApp, la carpeta de
Drive, el enlace de subida y, si acaso, la app. Ahora hay UNA página pensada para el
móvil — `/encargo/:id?token=&phase=[&origen=cee]` — con lo que le toca AHORA (aceptar ·
visitar y subir · lo estamos revisando · firmar y presentar · registrado), el cliente
con **Llamar / WhatsApp / Email**, la vivienda con **Cómo llegar** (por coordenadas si
las hay) y el Catastro, la instalación, lo que confirmó el cliente, las fotos y
documentos de SU fase con visor, las fechas y los accesos (carpeta, envolvente, app).

| Qué | Dónde |
|---|---|
| Firma, enlace, carga y lista blanca (fuente única) | [encargoTecnico.js](implementation/backend/services/encargoTecnico.js) |
| Rutas públicas | `GET /api/public/encargo/:id` · `GET /api/public/encargo/:id/fichero/:driveId` |
| Rutas staff (el enlace, para el popup) | `GET /api/expedientes/:id/enlace-encargo` · `GET /api/cee-directos/:id/enlace-encargo` |
| La página | [EncargoTecnicoView.jsx](implementation/frontend/src/features/encargo/EncargoTecnicoView.jsx) |
| Prueba | `node implementation/backend/scripts/test_encargo_tecnico.mjs` |

**REGLA — el enlace es del TÉCNICO ASIGNADO.** El token es un HMAC de negocio + id +
fase + `certificador_id`: al pasar el encargo a otro técnico, el enlace del anterior
deja de valer SOLO (403 «este enlace ya no vale») y también sus fotos (404), sin
tabla de tokens que mantener. Cada fichero se vuelve a comprobar contra la firma.

**REGLA — lista blanca, y ni un IMPORTE.** Solo viajan los campos que la página pinta: ni
el bono, ni la inversión, ni el margen. **El OBJETIVO del certificado SÍ** —demanda mínima y
superficie útil mínima, o ahorro mínimo en un RES080— en la tarjeta «Objetivo del certificado»:
de ellas sale el ahorro en MWh que se puede certificar, y son **las MISMAS cifras del email del
encargo**, que salen de la misma función ([utils/objetivoEncargo.js](implementation/backend/utils/objetivoEncargo.js),
`objetivosEncargo`, que ahora usa también `notify-certificador`). La tarjeta termina pidiendo
certificar la vivienda tal y como es y contarlo si no sale. Un CEE directo no tiene objetivo (no hay
simulación detrás). De las fotos, solo las de SU fase (ANTES para el inicial,
DESPUÉS para el final) y **nunca facturas, presupuestos ni los cajones «Otros»**; el
proxy de miniaturas solo sirve un `driveId` que esté en esa lista (caché de 20 min).
«Falta» se decide con `utils/materialCee` en el inicial (vídeo O fachada+patios;
caldera y placa), no con el `required` del checklist.

**REGLA — el paso REGISTRADO lo manda también el JUSTIFICANTE.** En los migrados el
subestado se quedó en `ASIGNADO` y la página pedía «acepta el encargo» de un
certificado ya inscrito (26RES060_100). Solo el justificante: un `.xml` subido no
prueba nada (puede haber vuelto a trabajo).

**Aceptar usa los acuses de SIEMPRE** (`cert-ack` en el CAE, `cee-ack` en los
directos) — no hay un tercer camino. El domicilio del cliente solo sale si no es la
misma cadena que la vivienda y se rotula en NEUTRO («Domicilio del cliente»: puede
diferir por una errata). El equipo de ACS solo sale aparte si es OTRA máquina
(`acsEsOtroEquipo`, por el modelo — regla 12.c).

**El enlace va DENTRO de los mensajes del encargo**: en el WhatsApp sustituye la línea
«🔗 Abre el expediente en la app» (`conEnlaceEncargo`), en el email es un botón, y el
popup de `EncargoCertificadorModal`/rejilla lo pide al abrirse. El texto de esa línea
es el MISMO en los dos lados (`TEXTO_ENLACE` = `TEXTO_ENLACE_ENCARGO`, lo vigila el
test). Con «Solo asignar» no hay enlace (no hay encargo que enseñar).
⚠️ **No lo llevan todavía**: los mensajes en bloque del parte diario
(`seguimientoLote`) ni el visto bueno (`approve-cee`).

⚠️ **Un banco de pruebas que monte `routes/public.js` NO se puede llamar `*server.js`.**
`whatsappService` decidía si era el servidor con `/server\.js$/`, y un
`banco_encargo_server.js` se tomó por él y **auto-conectó la sesión de WhatsApp del
disco** (falló porque el backend local ya la tenía abierta). Ahora exige el nombre
exacto (`/(^|[\\/])server\.js$/`), pero en un banco pon además `WHATSAPP_ENABLED=false`.
