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

- `docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md` — La app de certificadores — cee.brokergy.es (2026-10-24) · 16,4 KB
- `docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md` — Desplegar cee.brokergy.es (2026-10-24) · 3,2 KB
- `docs/conocimiento/certificadores-app/seguridad-de-la-app.md` — La seguridad de la app de certificadores, antes de salir (2026-10-24) · 2,5 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md`
  - **REGLA — mismo repo, mismo backend, mismo Supabase; tablas propias.**
  - **REGLA — el origen `ext` se ADAPTA, no se bifurca**
  - **REGLA — cada certificador toca SOLO lo suyo, y lo ajeno es 404.**
  - **REGLA — nada sale a terceros desde local.**
  - **REGLA — el asistente va capado.**
  - **REGLA — la carpeta de Drive se comparte con el EMAIL del certificador**
  - **REGLA — el tipo de un fichero sale de sus BYTES y se sirve sin poder ejecutarse**
  - **REGLA — pedida la obra, la vivienda, el titular y el cuestionario se CONGELAN**
  - **REGLA — el crédito va LIGADO A LA OBRA**
  - **REGLA — la IP de los límites es la de verdad**
  - **REGLA — la beta no se puede usar para mandar correo ni para pisar a otro**
  - **REGLA — el enlace del propietario caduca**
  - **REGLA — lo interno no llega al certificador**
  - **REGLA — sin `CERTAPP_TOKEN_SECRET` en producción, la app se cierra**
- `docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md`
  - **REGLA — el nginx.conf del VPS no está en git**
  - **REGLA — `index certificadores.html` en ese server**
  - **REGLA — el CORS de cee.brokergy.es sale de `CERTAPP_URL`, nunca de `FRONTEND_URL`**
  - **REGLA — un certificador de la app NO entra en el CRM**
- `docs/conocimiento/certificadores-app/seguridad-de-la-app.md`
  - **REGLA — en una obra `ext` la referencia catastral sale SIEMPRE de `certapp_obras.ref_catastral`**
  - **REGLA — el `.cex` (y el croquis en PDF) de una obra `ext` solo con la obra PEDIDA**
  - **REGLA — topes por CUENTA para el certificador de la app**
  - **REGLA — el aviso de «la IA ha terminado» pasa por el interruptor `CERTAPP_AVISOS_ENABLED`**
  - **REGLA — una sesión de Supabase sin fila en `usuarios` no entra en el CRM**

<!-- generado:fin -->
