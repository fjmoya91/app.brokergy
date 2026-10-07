<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «Confirmación de cobro — el formulario del final (2026-09-07)», en el CLAUDE.md antiguo.

### El Anexo Fotográfico de un RES080 ve la ENVOLVENTE (2026-09-07)

`anexoConcepts` pedía el checklist con `buildDocChecklist(datos_calculo)` **a
pelo**, que cae a los `inputs` y al funnel de la OPORTUNIDAD. Pero en un RES080 lo
que se rehabilita —ventanas, cubierta, fachada— lo declara el EXPEDIENTE, en
`documentacion.envolvente`. Consecuencia: **la skill y el MCP veían una lista de
apartados distinta de la del modal de la app**, que sí resolvía el alcance
(`public.js` ya llamaba a `docsAlcance.enriquecer`).

Medido en **26RES080_44**, un RES080 cuya actuación principal SON las ventanas: el
anexo salía con **5 actuaciones y 10 fotos** en vez de 7 y 30 — las 8 fotos de
`FOTO_VENTANAS_ANTES` y las 12 de `FOTO_VENTANAS_DESPUES` estaban en Drive con su
nombre canónico y no entraban. En **26RES080_54**, la cubierta y la fachada.

**REGLA — el alcance se resuelve en `syncEnvolventeAndReload`**, que es por donde
pasan las DOS vías de la skill (generar y consultar estado). Es la regla del
checklist (§ "el checklist se pide SIEMPRE por `checklistForOportunidad`") llevada
al Anexo: las superficies que deciden qué documenta un expediente comparten
alcance, y aquí una decidía por su cuenta.

Vigilado por `node implementation/backend/scripts/test_anexo_alcance_res080.js`,
que barre TODOS los RES080 con envolvente declarada (27 hoy) y comprueba que cada
uno pide sus apartados.

⚠️ Esto NO clasifica fotos: si las fotos están sueltas en `2. FOTOS Y VIDEOS/ANTES`
con su nombre de WhatsApp y no hay ninguna `FOTO_*` en `12. DOCUMENTOS PARA CEE`,
el anexo sigue sin tener de dónde tirar — ese paso lo hace la skill renombrando al
slot que corresponde (es el caso de 26RES080_54).
