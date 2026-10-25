---
paths:
  - "implementation/frontend/certificadores.html"
  - "implementation/frontend/src/certificadores/**"
  - "implementation/backend/routes/certapp*.js"
  - "implementation/backend/services/certapp/**"
  - "implementation/backend/middleware/certappAuth.js"
  - "implementation/backend/scripts/*certapp*"
  - "nginx/cee.brokergy.es.conf"
---
# App de certificadores — cee.brokergy.es: lista de espera, obras, cuestionario, generar con IA, entrega (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, el flujo, el contrato de la API) está en
> `docs/conocimiento/certificadores-app/`. Antes de cambiar el comportamiento de algo, lee el
> documento de su tema (lista al final). Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

_Esta área no tiene reglas numeradas: mandan las «REGLA —» de sus documentos, abajo._

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md` — La app de certificadores — cee.brokergy.es (2026-10-24) · 28,3 KB
- `docs/conocimiento/certificadores-app/alta-directa-google-y-email.md` — El alta: al momento, con Google o con el email (2026-10-24) · 8,0 KB
- `docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md` — Desplegar cee.brokergy.es (2026-10-24) · 3,5 KB
- `docs/conocimiento/certificadores-app/el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md` — El CEE de una obra: el encargo, la calificación en el PC, el aviso, la entrega y la firma (2026-10-25) · 9,5 KB
- `docs/conocimiento/certificadores-app/fotos-opcionales-y-equipo-generico.md` — Las fotos opcionales («Ahora no») y el equipo genérico con su antigüedad (2026-10-25) · 3,7 KB
- `docs/conocimiento/certificadores-app/lo-que-ha-visto-la-ia.md` — «Lo que ha visto la IA» — la fase 5 de la ficha (2026-10-25) · 7,2 KB
- `docs/conocimiento/certificadores-app/seguridad-de-la-app.md` — La seguridad de la app de certificadores, antes de salir (2026-10-24) · 3,0 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md`
  - **REGLA — el saldo de verdad sigue siendo `certapp_cuentas.creditos`**
  - **REGLA — mismo repo, mismo backend, mismo Supabase; tablas propias.**
  - **REGLA — el origen `ext` se ADAPTA, no se bifurca**
  - **REGLA — el arranque del CRM solo monta en SU página**
  - **REGLA — cada certificador toca SOLO lo suyo, y lo ajeno es 404.**
  - **REGLA — nada sale a terceros desde local.**
  - **REGLA — el asistente va capado.**
  - **REGLA — el asistente sabe en qué pantalla está**
  - **REGLA — la carpeta de Drive se comparte con el EMAIL del certificador**
  - **REGLA — el tipo de un fichero sale de sus BYTES y se sirve sin poder ejecutarse**
  - **REGLA — pedida la obra, la vivienda, el titular y el cuestionario se CONGELAN**
  - **REGLA — el crédito va LIGADO A LA OBRA**
  - **REGLA — la IP de los límites es la de verdad**
  - **REGLA — la beta no se puede usar para mandar correo ni para pisar a otro**
  - **REGLA — el enlace del propietario caduca**
  - **REGLA — lo interno no llega al certificador**
  - **REGLA — sin `CERTAPP_TOKEN_SECRET` en producción, la app se cierra**
- `docs/conocimiento/certificadores-app/alta-directa-google-y-email.md`
  - **REGLA — el enlace para entrar sirve UNA vez**
  - **REGLA — el alta por email no copia el teléfono**
  - **REGLA — la respuesta pública es siempre la misma**
  - **REGLA — sin aceptar las condiciones no hay alta**
  - **REGLA — el email de bienvenida sale en los DOS caminos**
  - **REGLA — el alta con sesión toma el email de la SESIÓN, nunca el del formulario**
- `docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md`
  - **REGLA — el nginx.conf del VPS no está en git**
  - **REGLA — `index certificadores.html` en ese server**
  - **REGLA — el CORS de cee.brokergy.es sale de `CERTAPP_URL`, nunca de `FRONTEND_URL`**
  - **REGLA — un certificador de la app NO entra en el CRM**
- `docs/conocimiento/certificadores-app/el-cee-de-una-obra-encargo-calificacion-entrega-y-firma.md`
  - **REGLA — sin calificar no se avisa: se encarga al PC.**
  - **REGLA — el PC solo da por buena la calificación si aparece `@@CALIFICADA_OK`.**
  - **REGLA — el agente encarga la calificación desde el contenedor del vigía, y allí ASISTENTE_URL es
el propio vigía**
  - **REGLA — una firma rota no se guarda**
  - **REGLA — firmar es validar**
  - **REGLA — el `.cex` no se sube**
  - **REGLA — un XML definitivo se lee en seco antes de guardarlo**
  - **REGLA — de cada clase gana el MÁS RECIENTE**
- `docs/conocimiento/certificadores-app/fotos-opcionales-y-equipo-generico.md`
  - **REGLA — la visita guiada se salta lo aparcado**
  - **REGLA — ninguna foto bloquea**
- `docs/conocimiento/certificadores-app/lo-que-ha-visto-la-ia.md`
  - **REGLA — el barrido solo BLOQUEA referencia catastral, dirección y municipio, nombre del titular y
«para qué».**
  - **REGLA — no escribe en la obra: PROPONE.**
  - **REGLA — solo lo que se VE.**
  - **REGLA — gratis para el certificador, con tope**
- `docs/conocimiento/certificadores-app/seguridad-de-la-app.md`
  - **REGLA — en una obra `ext` la referencia catastral sale SIEMPRE de `certapp_obras.ref_catastral`**
  - **REGLA — el `.cex` (y el croquis en PDF) de una obra `ext` solo con la obra PEDIDA**
  - **REGLA — topes por CUENTA para el certificador de la app**
  - **REGLA — el aviso de «la IA ha terminado» pasa por el interruptor `CERTAPP_AVISOS_ENABLED`**
  - **REGLA — una sesión de Supabase sin fila en `usuarios` no entra en el CRM**

<!-- generado:fin -->
