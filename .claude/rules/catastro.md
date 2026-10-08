---
paths:
  - "implementation/backend/services/catastro*.js"
  - "implementation/backend/routes/catastro.js"
  - "implementation/backend/services/neighborService.js"
  - "implementation/frontend/src/**/Catastro*.jsx"
  - "implementation/frontend/src/utils/{direccionCatastral,traerDireccionCatastral}.js"
  - "implementation/frontend/src/components/ParcelaCard.jsx"
  - "implementation/frontend/src/utils/enlacesInmueble.js"
  - "implementation/frontend/src/components/EnlacesInmueble.jsx"
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

122. **El icono del Catastro abre la ficha por `/api/catastro/sede/:rc`, nunca por el atajo `OVCListaBienes.aspx?rc1=&rc2=`** (2026-10-07). Ese atajo no es la ficha: lo resuelve la propia Sede y su respuesta depende del navegador — a Fran, con 7847709VJ9374N0001DD, le contestaba «No hay inmuebles en la ubicación seleccionada» y en un navegador limpio abría la ficha. La ruta (pública: es un enlace que se abre en otra pestaña) pregunta al Catastro UNA vez —caché 30 días, «no existe» 1 día— la delegación (`dt.loine.cp`), el municipio del CATASTRO (`dt.cmc`, no el INE: Logroño 900 frente a 89) y la referencia de 20, y redirige a `OVCConCiud.aspx?del=&mun=&UrbRus=U|R&RefC=<20>` —con la de 14 esa página da «Error de Datos»— o, en una parcela de varios inmuebles, a su lista con `del`/`mun`. Si el Catastro no contesta o está bloqueado, al atajo de siempre: lo resuelve el navegador de quien pulsa, así que no castiga al WAF. Lo deciden `codigosSede` y `urlSedeCatastro` ([catastroService.js](implementation/backend/services/catastroService.js)); lo usan `enlaceSedeCatastro` (todos los iconos del frontend) y `comoLlegar` (el «Ver en Catastro» de la página del encargo). Tras tocarlo: `node implementation/backend/scripts/test_enlace_sede_catastro.js` (con `--en-vivo`, contra el Catastro y en serie). Ver «El ENLACE a la ficha del inmueble en la Sede».

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/catastro/enlace-a-la-ficha-de-la-sede.md` — El ENLACE a la ficha del inmueble en la Sede (2026-10-07) · 4,8 KB
- `docs/conocimiento/catastro/modulo-catastro-cambios-profundos.md` — Módulo Catastro — Cambios profundos (2026-05-19) · 11,3 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/catastro/enlace-a-la-ficha-de-la-sede.md`
  - **REGLA — ningún enlace a la Sede se compone a mano: todos pasan por `/api/catastro/sede/:rc`.**
  - **REGLA — la ficha exige la referencia de 20.**
  - **REGLA — `mun` es el código del CATASTRO (`dt.cmc`), no el del INE.**
  - **REGLA — `UrbRus` lleva U o R según el `cn` del Catastro**
  - **REGLA — si el Catastro no contesta o está bloqueado, se va al atajo de siempre.**
- `docs/conocimiento/catastro/modulo-catastro-cambios-profundos.md`
  - **REGLA — el modelo solo LEE; qué es una referencia lo decide el código.**
  - **REGLA — con VARIAS referencias en la imagen se pregunta.**
  - **REGLA — el lector es del flujo INTERNO, no de la landing.**
  - **REGLA — no se sirve una foto que no se puede pintar.**
  - **REGLA — de una foto rota se rescata su MINIATURA EXIF**
  - **REGLA — el cierre se RESTAURA en origen**

<!-- generado:fin -->
