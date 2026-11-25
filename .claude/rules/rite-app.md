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

245. **La memoria RITE SUELTA de la app RITE (rite.brokergy.es, `{AAAA}RIT_{n}`) pasa por las MISMAS funciones que la de una obra CAE, y en el modo EXTENDIDO la potencia de cada estancia sale de sus radiadores** (Fran, 25/11/2026). [services/riteapp/payload.js](implementation/backend/services/riteapp/payload.js) traduce la memoria y la cuenta del instalador a `exp`/`cli`/`op`/`pres` y las pasa por `validateMemoriaRite` y por `buildRitePayloads` ([services/riteGenerador.js](implementation/backend/services/riteGenerador.js), fuente única con `routes/expedientes.js`): ninguna regla de la memoria se copia. Modo extendido: **potencia instalada = elementos × W por elemento** (100 W por defecto; editable de 30 a 400 W para la vivienda o por estancia) y la carga de cálculo sigue siendo m² × W/m² de la zona; sin elementos, como en el rápido. Solo con radiadores. El cálculo está en `cargas_desde_locales` (rite-generator) y en su espejo `tablaEstancias`: se cambian los dos. La plantilla es la de la JCCM: fuera de Castilla-La Mancha bloquea. **«Hazme esta memoria»** (Fran, mismo día): `hazMemoria` ([services/riteapp/encargo.js](implementation/backend/services/riteapp/encargo.js)) por `POST /api/riteapp-admin/memorias` (`staffOClaveInterna`) y la herramienta `memoria_rite` del MCP la crea en la cuenta del instalador (si es partner sin cuenta, se le crea PENDIENTE con su firmante real), trae la vivienda del Catastro, el equipo del catálogo (con varias coincidencias NO elige: devuelve opciones) y las estancias por superficie con la MISMA `logic/localesRite.js` del CRM, y si no falta nada la GENERA y queda en sus Documentos: lo de BROKERGY **no gasta créditos**; el instalador gasta 1 la primera vez (regenerar es gratis y si el generador falla se devuelve). Las versiones anteriores van a «OLD» y un fichero solo se sirve si es de ESA memoria (404). Tras tocarlo: `node implementation/backend/scripts/test_riteapp_payload.js`, `test_riteapp_encargo.js` (en seco, con el generador levantado) y, para las obras CAE, `test_locales_rite.mjs` y `test_acs_alcance_rite.js`. Ver "La app RITE".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/rite-app/00-la-app-rite.md` — La app RITE — rite.brokergy.es (2026-11-25) · 10,5 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/rite-app/00-la-app-rite.md`
  - **REGLA — la memoria suelta pasa por las MISMAS funciones que la de una obra CAE.**
  - **REGLA — en el modo extendido, la POTENCIA INSTALADA de una estancia es elementos × W por elemento; la
CARGA de cálculo sigue siendo m² × W/m² de la zona.**
  - **REGLA — de momento solo Castilla-La Mancha.**
  - **REGLA — lo de BROKERGY NO gasta créditos del instalador**
  - **REGLA — un fichero solo se sirve si es de ESA memoria**
  - **REGLA — la pantalla de estancias no calcula potencias.**

<!-- generado:fin -->
