# Un CEE «incompleto» no se da por bueno ni se sube (2026-10-19)

## Qué pasó — 26RES060_195

El 18/10/2026 se generó con la skill `generar-cee-final` el CEE FINAL de 26RES060_195 (copiando el
inicial del técnico, CE3X 3.2) y se le avisó a Luis Alberto Lanuza de que podía presentarlo. El 19/10
escribió por WhatsApp: los PDF que habíamos subido llevaban la marca de agua **«certificado
incompleto»**, firmarlo no la quitaba, CE3X 3.2 avisaba al imprimir

> Extra element Huecos in interleave · Element Modelo failed to validate content - linea 400

y la 2.3 no lo abría («Error al abrir el fichero», normal: es un `.cex` de la 3.2).

**Causa.** El CEE INICIAL de esa obra (el del técnico, hecho en la 2.3, revisado el 21/09 y
REGISTRADO el 22/09) **no tiene NINGÚN hueco**: ni una ventana ni una puerta (pickle 3, lista de
huecos vacía; el trabajo de la envolvente de la app también tiene las 18 paredes sin huecos). CE3X no
deja la lista vacía en el XML: escribe un hueco de RELLENO con todo a «99999999.99». El esquema v2.0
(2.3) lo aceptaba; el v3.0 (3.1/3.2) exige en cada `<Hueco>` su `<Construccion>` y su `<Opaco>`, y
`xml2cert` responde `element "Hueco" incomplete; missing required elements "Construccion" and
"Opaco"`. El PDF sale igual, con la marca. El final se COPIA del inicial (regla 127), así que heredó
el fallo.

**Por qué no lo vio nadie.** `cexAPdf.calificarCex` sacaba el PDF con `xml2cert` pero **no leía su
`.log`**, que es el único sitio donde dice que el XML no valida (`pdfDeXml` sí lo leía, pero solo lo
usa el vigilante del PC, que con la marca escribía el PDF igual y solo avisaba). Así que el script
dio el final por bueno, lo subió y avisó. En la carpeta quedaron DOS PDF con el mismo nombre, los dos
con la marca (el log del vigilante no tiene nada de la 195: no salió de él). Y la revisión del inicial se hizo el 21/09, antes de que
la lupa mirase el `.cex` (29/09, «no declara ningún hueco» → falla); con solo el `.xml`, el hueco de
relleno contaba como una ventana.

Barrido de la BD el mismo día (`cee.xml_inicial` / `xml_final` de expedientes y CEE directos con el
hueco de relleno): **solo 26RES060_195**.

## Lo que se decidió

**REGLA — un XML que no VALIDA no sale de `cexAPdf` como bueno.** `calificarCex` (y
`ponerPrevistoComoMedida`) pasa SIEMPRE el XML por `xml2cert` —también con `pdf: false`; son ≈4 s— y
lee su `.log`. Si no valida: `ok: false`, `incompleto` con los motivos, `marcaDeAgua: true` y **sin
PDF**. `incompletoDelXml` dice antes y con palabras de la casa el caso del edificio sin huecos (vale
para el v2.0 y para el XML en MAYÚSCULAS de la BD).

**REGLA — la última puerta es la subida.** `guardarCalificadoEnDrive` valida el XML (`validarXml`)
antes de subir nada: si no valida, no sube ni el XML, ni el PDF, ni el `.cex`. Todos los caminos que
suben un calificado pasan por ahí.

**REGLA — un final no se copia de un inicial sin huecos.** `ceeFinalCopiando` lee el `.cex` del
inicial con el motor (`/cex/radiografia`) y, sin huecos, para con 422 antes de pasar dos veces por
CE3X. Arreglarlo es decisión del usuario: el inicial puede estar ya registrado.

**REGLA — lo incompleto no se da por terminado.** `cee_inicial.js aplicar` y `cee_final.js` no
avisan al equipo ni marcan la fase; `firmar_cee.js` no firma; `presentar_cee.js preparar` lo deja NO
LISTO (sin xml2cert en el equipo, avisa de mirar el PDF). El vigilante `pdf_del_xml.js` ya no deja un
PDF con la marca en la carpeta: avisa y no lo escribe.

**REGLA — sin huecos es NO APTO en la revisión**, con `.cex` o solo con el `.xml`: `radiografiaCee`
ya no cuenta el hueco de relleno (`esRelleno`) y `revisionCee` anota `huecos` como falla también sin
`.cex`, con el porqué (`HUECOS_CERO`).

Las skills (`generar-cee-final`, `generar-cee-inicial`, `revisar-cee`, `presentar-cee`,
`justificar-expediente`) lo dicen y remiten a `skills/_comun/cee-incompleto.md`.

## Cómo se comprueba

```bash
cd implementation/backend
node scripts/test_cee_incompleto.js                      # sin CE3X
node scripts/test_cee_incompleto.js "<ruta del .xml>"    # con xml2cert: ok=false = incompleto
node scripts/test_revision_cee.js                        # caso «sin ningún hueco → NO APTO»
```

Medido el 19/10/2026: el final de la 195 → `ok=false` con los dos motivos; el de la 196 (mismo día,
10 huecos) → `ok=true`. `cee_final_copiando.js 26RES060_195` para en 6 s con el motivo;
`calificarCex` del `.cex` ya hecho devuelve `incompleto` sin PDF y `guardarCalificadoEnDrive` se niega.
