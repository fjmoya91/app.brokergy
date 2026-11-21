---
paths:
  - "implementation/frontend/src/features/instalador/**"
  - "implementation/frontend/src/demo/instaladorDemo.jsx"
  - "implementation/frontend/instalador-demo.html"
  - "implementation/backend/routes/instaladorApp.js"
  - "implementation/backend/utils/appInstalador.js"
  - "implementation/backend/scripts/test_app_instalador.js"
---
# App del instalador — la app nueva del rol INSTALADOR (beta): obras en 5 pasos, Inicio, Obras y Clientes (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/instalador-app/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

230. **La app del INSTALADOR la decide UN interruptor y lee UNA tabla de pasos; nunca enseña dinero interno** (2026-11-21, Fran: rediseño para el instalador, beta RCA). Quién entra: `enBetaInstalador(user)` en [utils/appInstalador.js](implementation/backend/utils/appInstalador.js) — rol INSTALADOR y su `prescriptor_id` en `APP_INSTALADOR_BETA` (sin la variable, nadie; el DISTRIBUIDOR nunca) —; `/api/usuarios/me` lo devuelve como `app_instalador` y `App.jsx` monta `HostInstalador` EN LUGAR del `DashboardLayout`, así que todos los demás ven lo de siempre. Una obra es oportunidad + expediente con **5 pasos** (Simulada · Propuesta · Aceptada · Trámite · Cobro) y **quién tiene la pelota** (`tu`/`nos`/`cli`/`fin`), calculados SOLO en `pasoDeObra` (la tabla, escrita en el documento, es coherente con `estadoOportunidad.js` y el test lo comprueba con todos los estados); las tareas (firmar el CIFO, subir el RITE, hacer la factura) solo si su empresa es la INSTALADORA, con su destino decidido en el backend y el token solo dentro del enlace de SU obra. La API `/api/instalador-app` va con `enforceAuth` + la beta, solo lo suyo (el `or` de `soloLoSuyo`), **404** a lo ajeno, **503** con la BD caída, escalares en lista blanca y **nunca** margen, comisión, `via_fm`, notas internas, comisionista ni enlaces de Drive (reglas 1, 102 y 218). Las pantallas, estilo «carta de pago» SIN modo oscuro, CSS `.ia-`, piezas comunes en `features/instalador/ui/` para las fases 2 y 3. Tras tocarlo: `node implementation/backend/scripts/test_app_instalador.js`, `test_rutas_sin_sesion.js`, `test_rutas_partner.js`, `npm run build` y el banco `instalador-demo-5187` (sin API). Ver "La app del INSTALADOR, fase 1".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/instalador-app/app-del-instalador-fase-1.md` — La app del INSTALADOR, fase 1: cáscara, Inicio, Obras y Clientes en solo lectura (2026-11-21) · 10,3 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/instalador-app/app-del-instalador-fase-1.md`
  - **REGLA — quién ve la app nueva lo decide UN sitio: `enBetaInstalador(user)` en `utils/appInstalador.js`.**
  - **REGLA — la app del instalador nunca recibe margen, comisión, `via_fm`, notas internas, comisionista ni
enlaces de Drive (reglas 1, 102 y 218, y la de `via_fm` de cálculo), y ningún JSONB entero (regla 22).**

<!-- generado:fin -->
