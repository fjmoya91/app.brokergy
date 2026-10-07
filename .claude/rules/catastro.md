---
paths:
  - "implementation/backend/services/catastro*.js"
  - "implementation/backend/routes/catastro.js"
  - "implementation/backend/services/neighborService.js"
  - "implementation/frontend/src/**/Catastro*.jsx"
  - "implementation/frontend/src/utils/{direccionCatastral,traerDireccionCatastral}.js"
  - "implementation/frontend/src/components/ParcelaCard.jsx"
---
# Catastro — WAF, endpoints WCF JSON, búsqueda por coordenadas, OCR de la referencia, fachada (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/catastro/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

15. **Catastro — Cliente HTTP**: NUNCA usar `axios` contra `ovc.catastro.meh.es`. Usar el helper `catastroGet()` en [catastroService.js](implementation/backend/services/catastroService.js) (http.request puro, `family:4`, UA `Mozilla/5.0 (compatible; Brokergy/1.0)`). El WAF rechaza axios + Chrome UA largo desde IPs de datacenter.

16. **Catastro — Endpoints**: usar SOLO los WCF JSON (`/OVCServWeb/OVCWcf.../svc/json/*`), NUNCA los ASMX (`/ovcservweb/.../asmx/*`). Los ASMX están filtrados por el WAF a IPs de datacenter; los WCF JSON sirven la misma data sin ese filtro. Params del JSON: `CoorX/CoorY` (no `Coordenada_X/_Y`), `RefCat` (no `RC`).

17. **Catastro — Sin ráfagas**: no usar `Promise.all` con peticiones al Catastro. Siempre secuencial con `await sleep(200+)` entre cada una. Ver `getRCByCoords` para el patrón actual (central + 2 puntos N/E en serie, 800ms).

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/catastro/modulo-catastro-cambios-profundos.md` — Módulo Catastro — Cambios profundos (2026-05-19) · 11,3 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/catastro/modulo-catastro-cambios-profundos.md`
  - **REGLA — el modelo solo LEE; qué es una referencia lo decide el código.**
  - **REGLA — con VARIAS referencias en la imagen se pregunta.**
  - **REGLA — el lector es del flujo INTERNO, no de la landing.**
  - **REGLA — no se sirve una foto que no se puede pintar.**
  - **REGLA — de una foto rota se rescata su MINIATURA EXIF**
  - **REGLA — el cierre se RESTAURA en origen**

<!-- generado:fin -->
