---
paths:
  - "implementation/frontend/src/features/seguimiento/**"
  - "implementation/backend/routes/{seguimiento,acciones}.js"
  - "implementation/backend/services/{seguimiento*,recordatorios,revisionPendienteNotifier}.js"
  - "implementation/backend/utils/{accionToken,materialCee}.js"
---
# Seguimiento — parte diario, radar de bloques, enlaces de acción y envío en bloque (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/seguimiento/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

_Esta área no tiene reglas numeradas: mandan las «REGLA —» de sus documentos, abajo._

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/seguimiento/aviso-de-cee-entregados-y-sin-revisar.md` — Aviso de CEE entregados y sin revisar · 1,3 KB
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/00-parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente.md` — Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10) · 0,8 KB
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/el-parte-dentro-de-la-app-pestana-seguimiento.md` — El parte DENTRO de la app — pestaña "Seguimiento" · 1,2 KB
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/el-plazo-decide-si-se-reclama-nunca-si-se-ve.md` — El PLAZO decide si se RECLAMA, nunca si se VE (2026-09-07) · 1,6 KB
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/encargar-el-cee-desde-la-propia-cola.md` — Encargar el CEE desde la propia cola (2026-09-23) · 2,1 KB
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/envio-en-bloque-seguimientolote-js-implementation-backend-servic.md` — Envío en BLOQUE — [seguimientoLote.js](implementation/backend/services/seguimientoLote.js) · 5,7 KB
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/los-enlaces-de-accion-acciontoken-js-implementation-backend-util.md` — Los enlaces de acción — [accionToken.js](implementation/backend/utils/accionToken.js) + [routes/acciones.js](implementation/backend/routes/acciones.js) · 1,7 KB
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/los-once-bloques-seguimientoradar-js-implementation-backend-serv.md` — Los once bloques — [seguimientoRadar.js](implementation/backend/services/seguimientoRadar.js) · 5,2 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/el-plazo-decide-si-se-reclama-nunca-si-se-ve.md`
  - **REGLA — parado y en plazo se cuentan APARTE.**
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/encargar-el-cee-desde-la-propia-cola.md`
  - **REGLA — el material es: VÍDEO de la vivienda, o FACHADA + PATIOS; y la CALDERA con
su PLACA.**
  - **REGLA — el popup del encargo es UNO.**
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/envio-en-bloque-seguimientolote-js-implementation-backend-servic.md`
  - **REGLA — la clave de grupo NO lleva el `scope`.**
  - **REGLA — el envío en bloque NO puede delegar en `notify-certificador`**
  - **REGLA — al CERTIFICADOR se le escribe como a un compañero, no como a un cliente.**
  - **REGLA — el plazo frena al AUTOMÁTICO, no a ti.**
  - **REGLA — la antigüedad se OMITE cuando es de hoy.**
  - **REGLA — el `detalle` del radar está escrito para TI, no para quien lo recibe.**
  - **REGLA — el envío NO se implementa en `acciones.js`**
  - **REGLA — `/parte/global` se declara ANTES que `/:tipo/:expId`**
- `docs/conocimiento/seguimiento/parte-diario-de-seguimiento-que-no-se-pierda-ningun-expediente/los-once-bloques-seguimientoradar-js-implementation-backend-serv.md`
  - **REGLA — `TRAMITACION` cubre lo que NO SE HA PEDIDO; `FIRMA_PENDIENTE`, lo pedido que no
vuelve.**
  - **REGLA — `SIN_LOTEAR` es el único bloque que habla de DINERO, no de un documento.**
  - **REGLA — quién puede lotearse lo decide `loteService.ESTADOS_COMPLETO`, y se IMPORTA.**
  - **REGLA — tener TÉCNICO no es haberle ENCARGADO.**
  - **REGLA — "sin fin de obra" NO es un solo caso.**
  - **REGLA — un MIGRADO no necesita encargo de CEE**
  - **REGLA — las firmas se agrupan por FIRMANTE, no por documento.**
  - **REGLA — UNA consulta para los ocho detectores, con campos CONCRETOS del JSONB.**

<!-- generado:fin -->
