# ⛔ Nunca un CEE «incompleto»

**Caso: 26RES060_195 (19/10/2026).** El CEE final que se subió llevaba en el PDF la marca de agua
**«certificado incompleto»**: el técnico no lo pudo presentar, firmarlo no la quitaba y CE3X 3.2
avisaba al imprimir («Element Modelo failed to validate content»). Causa: el CEE INICIAL del técnico
(hecho en la 2.3 y ya registrado) **no tenía NINGÚN hueco** (ni ventanas ni puertas). La 2.3 lo
admitía; la 3.2 escribe en su lugar un hueco vacío (todo a «99999999.99», sin cerramiento) y su propio
esquema lo rechaza. El final se copia del inicial, así que heredó el fallo.

## Lo que hace el código (no lo esquives)

- `xml2cert` (el generador del PDF de CE3X) es quien VALIDA el XML, y solo lo dice en su `.log`.
  `cexAPdf.calificarCex` lo pasa SIEMPRE por él: si no valida devuelve `ok: false` con `incompleto`
  (los motivos) y **sin PDF**.
- `guardarCalificadoEnDrive` lo vuelve a validar antes de subir: **un XML que no valida no sube**, ni
  su PDF ni su `.cex`.
- `cee_final_copiando.js` **para antes de empezar** (422) si el inicial que copia no tiene huecos.
- `cee_inicial.js aplicar` y `cee_final.js`, con un XML incompleto, **no avisan** de que está listo
  ni lo dan por terminado.
- `firmar_cee.js` **no firma** y `presentar_cee.js preparar` lo deja **NO LISTO**.
- El vigilante `pdf_del_xml.js` ya no deja en la carpeta un PDF con la marca: avisa y no lo escribe.

## Lo que haces tú

1. **Antes de generar un CEE FINAL**: el inicial del que sale tiene que tener sus ventanas y puertas.
   Si `cee_final_copiando.js` para por eso, **no lo fuerces con `--base`** sin haber arreglado el
   inicial: díselo al usuario (el inicial puede estar ya registrado y eso es decisión suya).
2. Si un informe dice **«⛔ CERTIFICADO INCOMPLETO»**, el CEE **NO está hecho**: no es un aviso para
   luego. Se dice al usuario con el motivo, se corrige el `.cex` y se vuelve a generar. Nunca se sube a
   mano a Drive el XML o el PDF que el script rechazó.
3. **Antes de dar un CEE por bueno, firmarlo o presentarlo**, compruébalo:
   ```bash
   # desde implementation/backend · en el PC (necesita xml2cert de CE3X 3.2)
   node scripts/test_cee_incompleto.js "<ruta del .xml>"   # «ok=false» = incompleto
   ```
   Sin `xml2cert` (otro equipo) solo se ve la falta de huecos: **abre el PDF** y mira que no lleve la
   marca de agua.
4. **Al revisar un CEE del técnico** (`revisar-cee`), «Huecos (ventanas y puertas): no declara
   ningún hueco» es **NO APTO**: si se le da el visto bueno así, su final saldrá incompleto.
