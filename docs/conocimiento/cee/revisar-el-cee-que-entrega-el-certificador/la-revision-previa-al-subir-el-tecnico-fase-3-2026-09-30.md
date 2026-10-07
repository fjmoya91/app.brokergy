<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «REVISAR el CEE que entrega el certificador (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### La revisión PREVIA al subir el técnico (fase 3, 2026-09-30)

Cuando el certificador sube su `.xml` o su `.cex`, ve AL MOMENTO lo que la revisión detecta y lo
corrige antes de que llegue a Brokergy: menos ida y vuelta. Es la MISMA revisión de la lupa de Fran
(se guarda en `cee.revision_{fase}` con `origen: 'subida'`, así que la lupa se colorea sola), pero
al técnico se le enseña SU parte.

| Qué | Dónde |
|---|---|
| Qué parte ve el técnico, con qué palabras, y la línea para Fran | [revisionTecnico.js](implementation/backend/services/cee/revisionTecnico.js) — `vistaTecnico`, `guardadaParaTecnico`, `lineaParaStaff`, `preRevisar` |
| Ruta en la app (certificador ASIGNADO o staff) | `POST /api/expedientes/:id/pre-revision-cee?fase=` (`suyoSiCertificador`) |
| Ruta del enlace público `/subir-cee` (token) | `POST /api/public/cee-prerevision/:id?token=&phase=` |
| El panel (compartido por las dos superficies) | [PreRevisionCee.jsx](implementation/frontend/src/features/expedientes/components/PreRevisionCee.jsx) (+ `PreRevisionModal`) |
| Dónde sale | popup «Solicitar revisión» de la rejilla (al subir el `.cex`, o el `.xml` con el `.cex` ya subido, y en la campana), chapa 🔍 del certificador, y `/subir-cee` tras subir |
| Probar contra un expediente real SIN guardar | `node scripts/probar_pre_revision.js 26RES060_154 [--fase final]` |
| Pruebas | `node scripts/test_pre_revision_cee.js` |

**REGLA — la DEMANDA y la SUPERFICIE frente a la simulación SÍ se le enseñan, como algo que
REVISAR** (decisión del usuario, 2026-09-30, que revierte la primera versión): de ellas sale el
ahorro en MWh que se puede certificar, y el email del encargo ya se las da como «objetivo de
seguridad» — ocultárselas en la revisión dejaba al técnico con el objetivo en el correo y sin saber
si lo había alcanzado. Pero lo que para Fran es un FALLO al técnico le sale como algo que revisar
(`estadoTecnico`), nunca como «corregir», y con un consejo que le pide **comprobar su modelo**
(zonas calefactadas de todas las plantas, transmitancias y ventilación de la guía, estancias
habitables) **y decirlo si la vivienda es así** — no mover una cifra hasta que cuadre. La excepción
es el CEE final de un RES080 cuya demanda no baja, que sí es «corregir»: el certificado no recoge la
obra. Sin simulación detrás no se le enseña nada (no puede hacer nada con ello). Sigue sin ver lo
informativo (`rendimiento`, `caldera_cex`, `generales`). Y **nunca se le dice "APTO"**: «No hemos
visto nada que corregir» / «Hay N cosas que corregir antes de enviarlo».

**REGLA — el detalle de un expediente que abre un CERTIFICADOR lleva la revisión en SU versión**
(`revisionParaTecnico` dentro de `scrubExpedienteForUser`). Antes de esto la revisión guardada viajaba
entera al técnico, con el veredicto, los fallos y los botones de Brokergy dentro.

**REGLA — la revisión al subir lee el `.xml` de DRIVE, no el de la BD** (`xmlDeDrive`). El de la BD
lo escribe el navegador un instante DESPUÉS de subir, y por el enlace público no se escribe nunca:
revisar ése es revisarle el fichero anterior. La lupa de Fran sigue leyendo el de la BD.

**REGLA — los textos están escritos para Brokergy y al técnico se le habla de tú**
(`TEXTO_TECNICO`, por estado; `DICE_TECNICO` solo para la evidencia en tercera persona). Sin el
botón «Poner la medida» (`accion`), que es de Brokergy.

**REGLA — no bloquea.** Con algo que corregir el botón dice «Avisar igualmente a Brokergy» y el otro
«Lo corrijo y lo vuelvo a subir»; si hay un motivo, se cuenta en el mensaje. El visto bueno sigue
siendo de Fran.

**El aviso a Fran lleva el veredicto COMPLETO** (`notify-review`: WhatsApp, email e historial),
con lo que el técnico no ve: `NO APTO · 2 fallos (…) · 1 aviso`. ⚠️ **Sin el enlace de visto bueno
en el WhatsApp**: `approve-cee-from-email` APRUEBA con un GET, y la vista previa de enlaces de
WhatsApp lo abriría sola. Sigue en el email, donde ya estaba.

**La ruta pública tiene FRENO** (`CEE_PREREVISION_ESPERA_MS`, 20 s): el enlace no caduca y cada
revisión baja ficheros y llama al motor. Un `.xml`/`.cex` nuevo lo OLVIDA (`olvidar`), o el `.cex`
subido a los segundos del `.xml` recibiría la revisión de cuando aún no estaba. Tarda ~7 s (medido
sobre 26RES060_154); sin el motor, los puntos del `.cex` salen «sin comprobar».

Solo en el **CAE**: en un CEE directo no hay medida de mejora que revisar. Lo que no se ha hecho: que
se revise sola lo que el técnico deja DIRECTAMENTE en la carpeta de Drive (no hay gancho); lo cubre la
campana, que revisa antes de avisar. Las ayudas con IA (un CEE que solo llega en PDF, contrastar
huecos con las fotos) siguen para después y solo como aviso.
