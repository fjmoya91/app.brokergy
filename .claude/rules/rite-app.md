---
paths:
  - "implementation/frontend/rite.html"
  - "implementation/frontend/src/rite/**"
  - "implementation/backend/routes/riteapp*.js"
  - "implementation/backend/services/riteapp/**"
  - "implementation/backend/services/riteGenerador.js"
  - "implementation/backend/middleware/riteappAuth.js"
  - "implementation/backend/scripts/*riteapp*"
  - "implementation/rite-generator/lib/cargas_termicas.py"
  - "nginx/rite.brokergy.es.conf"
---
# App RITE — rite.brokergy.es: la memoria RITE suelta de un instalador, rápida o extendida (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/rite-app/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

245. **La memoria RITE SUELTA de la app RITE (rite.brokergy.es, `{AAAA}RIT_{n}`) pasa por las MISMAS funciones que la de una obra CAE, y en el modo EXTENDIDO la potencia de cada estancia sale de sus radiadores** (Fran, 25/11/2026). [services/riteapp/payload.js](implementation/backend/services/riteapp/payload.js) traduce la memoria y la cuenta del instalador a `exp`/`cli`/`op`/`pres` y las pasa por `validateMemoriaRite` y por `buildRitePayloads` ([services/riteGenerador.js](implementation/backend/services/riteGenerador.js), fuente única con `routes/expedientes.js`): ninguna regla de la memoria se copia. Modo extendido: **potencia instalada = elementos × W por elemento** (100 W por defecto; editable de 30 a 400 W para la vivienda o por estancia) y la carga de cálculo sigue siendo m² × W/m² de la zona; sin elementos, como en el rápido. Solo con radiadores. El cálculo está en `cargas_desde_locales` (rite-generator) y en su espejo `tablaEstancias`: se cambian los dos. La plantilla es la de la JCCM: fuera de Castilla-La Mancha bloquea. Tras tocarlo: `node implementation/backend/scripts/test_riteapp_payload.js` y, para las obras CAE, `test_locales_rite.mjs` y `test_acs_alcance_rite.js`. Ver "La app RITE".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/rite-app/00-la-app-rite.md` — La app RITE — rite.brokergy.es (2026-11-25) · 6,1 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/rite-app/00-la-app-rite.md`
  - **REGLA — la memoria suelta pasa por las MISMAS funciones que la de una obra CAE.**
  - **REGLA — en el modo extendido, la POTENCIA INSTALADA de una estancia es elementos × W por elemento; la
CARGA de cálculo sigue siendo m² × W/m² de la zona.**
  - **REGLA — de momento solo Castilla-La Mancha.**

<!-- generado:fin -->
