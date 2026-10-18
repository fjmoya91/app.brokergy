<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Lo que el FLAG esconde y lo que MAYÚSCULAS borra (2026-09-16)

Dos fallos distintos, encontrados el mismo día y con la misma forma: el dato
estaba escrito en el expediente y el documento no lo decía.

### El nº de serie del equipo de ACS lo decide el DATO, no el flag

En 26RES080_34 el Anexo I imprimía `Ud. interior: 075076300000022` —la serie de
la unidad EXTERIOR— teniendo `002425200000056` guardada en el nodo de ACS.

Es un **CONJUNTO BIBLOC**: UNA máquina del catálogo (`aerotermia_db_id` 94 en los
dos nodos, así que `mismaMaquina()` los reconoce y el flag
`misma_aerotermia_acs` sigue en true) pero **DOS aparatos**, la unidad exterior y
la de dentro —que es la que calienta y acumula el agua—, cada uno con su placa y
su serie. El CIFO las declara en dos filas («Nº serie unidad exterior» / «Nº
serie equipo ACS») y el Anexo I en dos líneas.

**REGLA — el flag no puede esconder una SERIE declarada.** `acsSerieDeclarada(inst)`
en [aerotermiaUnits.js](implementation/frontend/src/features/expedientes/logic/aerotermiaUnits.js)
(con su espejo CJS): si el nodo de ACS declara serie propia, ésa es la que se
imprime; si no, se sigue cayendo a la de calefacción. Es la misma regla de
`acsMismoEquipo` (regla 12.c) aplicada a la serie — entre un booleano que nadie
ha tocado y un dato escrito a mano, manda el dato.

Lo aplican los TRES documentos que la imprimen: `cifoDoc.js` (`acsNuSerieEx`),
`docGenerators.js` (`snInt` del Anexo I) y `res080Doc.js`, donde además «Misma
unidad» deja de ser cierto en cuanto hay dos aparatos.

**REGLA — solo cambia la SERIE.** El equipo, el SCOP_dhw y el ahorro siguen
colgando del flag a propósito: moverlos cambiaría cifras de expedientes ya
emitidos (regla 12.c, que por eso los AVISA en vez de corregirlos).

Medido sobre producción: **8 expedientes** con el flag en true, serie propia en
el nodo de ACS y distinta de la de calefacción —25RES060_36 · _39 · _41,
26RES060_102 · _107, 26RES080_34 · _59 · _66—, todos con SCOP_dhw propio (o sea,
con el bloque de ACS rellenado a conciencia). Ninguno tiene cascada, y los 18
monoblocs con la MISMA serie en los dos nodos no se mueven: el resultado es la
misma cadena.

```bash
node implementation/backend/scripts/test_serie_acs_flag.mjs
```

### Y la segunda línea del Anexo I dice QUÉ aparato es (18/10/2026)

La casilla «n serie de equipos» del impreso es una sola, y la llenaban siempre
dos rótulos fijos, «Ud. exterior» / «Ud. interior». Fallaba por dos lados:

- **ACS con OTRA máquina** (26RES060_195: monobloc Aerosun Advanced 12 + bomba de
  calor de ACS HTW-AT-V100MR290A, otro modelo del catálogo): imprimía «Ud.
  interior: AX24031603070524088», que es falso — el monobloc no tiene ud.
  interior. Ahora, cuando `acsEsOtraMaquina(inst)` (la máquina, no el flag:
  regla 49), la línea es **«Equipo ACS: …»** («Equipos ACS (n):» en cascada), el
  mismo rótulo que la fila del CIFO («Nº serie equipo ACS»), así los dos
  documentos dicen lo mismo. Medido: **80 expedientes** tienen el ACS en otra
  máquina del catálogo (Aeromax, Atheria, Manantial, HTW…); el texto solo cambia
  al regenerar su Anexo I.
- **La «ud. interior» con la MISMA serie que la exterior** (26RES060_136: monobloc
  Aerosun Confort 12 que da también el ACS, flag en true y el nodo de ACS sin
  serie) imprimía la serie de la exterior dos veces, la segunda como «Ud.
  interior». Es un aparato, no dos: esa línea ya **no se imprime**. Corrige lo
  que arriba se daba por bueno («los 18 monoblocs … no se mueven»): el CIFO no se
  mueve, el Anexo I deja de repetir la línea.

**REGLA — la serie del equipo de ACS sale SIEMPRE que se actúa sobre el ACS
con una bomba de calor o con un acumulador del que tenemos la placa; NO sale si
no se actúa sobre el ACS o si se pone un termo eléctrico** (decisión del usuario,
18/10/2026: «aunque no sea una unidad interior, si es un aerotermo debe aparecer
también el número de serie, y si es un acumulador y tenemos fotos de la placa
también»). Un aerotermo de ACS aparte y un acumulador se rotulan **«Equipo
ACS»**, como la fila del CIFO; un acumulador sin serie escrita no saca línea (no
se inventa). El termo eléctrico (efecto Joule) queda fuera con el MISMO criterio
que `acsEnAlcance`, con el que el CIFO decide su fila — antes el Anexo I solo
miraba `cambio_acs` e imprimía la serie del termo. Casos en
`test_serie_acs_flag.mjs`.

**Lo que NO cambia**: el bibloc con la serie de la de dentro declarada (regla
12.e) sigue con sus dos líneas «Ud. exterior» / «Ud. interior»; sin serie en la
exterior no se quita nada (se ve la raya de «falta el dato»). Fuente única: `deriveAnexoI` en
[docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js)
(`serialsLineas`), que comparten el impreso oficial (`anexoIFormulario`) y el
clásico (`serialsHtml`). Verificado en seco con los datos reales: el 195 sale
«Ud. exterior: IN2601309004-053 / Equipo ACS: AX24031603070524088» y el 136,
«Ud. exterior: IN2601306006-030».

⚠️ Visto al medir: 26RES060_112 declara en el nodo de ACS (HAIER HP200M7-F9) la
MISMA serie que en la aerotermia de calefacción (SH MASTER 12), que son dos
máquinas distintas: es un dato mal copiado, y el Anexo I lo imprime tal cual.

### `estado_cifo` ya no avisa de una ficha que el CIFO SÍ lleva (18/10/2026)

`estado_cifo` (MCP → `GET /cifo/estado` → `getEstadoCifo` en
[cifoService.js](implementation/backend/services/cifoService.js)) decía «Falta la
ficha técnica de la aerotermia … el CIFO se genera sin ese anexo» con el hueco del
expediente vacío aunque el CATÁLOGO tuviera la ficha — y `generar_cifo` la copia
sola al generar (`ensureScopAnnexes`). Pasó en 26RES060_136 y _195. Ahora
`avisosFichasTecnicas(…, { contarCatalogo: true })` da por cubierto el hueco
cuyo modelo (`aerotermia_db_id`) tiene `ficha_tecnica` en el catálogo; los huecos
siguen saliendo de `resolveFichaSlots` (regla 8.c), sin otra decisión. Si el
catálogo no responde se avisa como antes. En la GENERACIÓN no se usa: allí el
aviso se calcula después de la copia y el hueco ya dice la verdad.

### El BONO SOCIAL se guardaba y la lectura lo tiraba

Se marcaba «Bono social eléctrico para consumidores vulnerables», se cambiaba de
pestaña y volvía sin marcar; y el Anexo I imprimía «Ninguno de los anteriores».
El dato ESTABA en la BD (26RES060_165: `tipos: ["ELECTRICO_VULNERABLE"]`).

Dos causas encadenadas, y las dos están arregladas:

1. **`normalizeData` subía el sub-árbol a MAYÚSCULAS.** Los ids del bono son
   enums en minúscula (`electrico_vulnerable`) y `leerSubvenciones` **descarta lo
   que no case EXACTO**, así que al releer desaparecía. Mismo gotcha que
   `fotovoltaica` y `envolvente`: `subvenciones` va ya en la **BLACKLIST**.
   ⚠️ Afectaba también a `ayuda.fondo_nacional`, que se compara con `=== 'si'` y
   **viaja al verificador** en `SE_fondo_nacional`: en MAYÚSCULAS se le declaraba
   «no» teniendo «SI» escrito en el expediente.
2. **Lo ya guardado tiene que poder abrirse**: `leerSubvenciones` casa los enums
   SIN distinguir mayúsculas y devuelve el id canónico (`canon` / `canonId`),
   igual que `rescatarHueco` en la envolvente. Cubre `bono_social.tipos`,
   `catalogo_id`, `estado` y `fondo_nacional`.

**REGLA — Subvenciones se AUTOGUARDA, como el resto de la ficha.** Era el ÚNICO
módulo del expediente con un botón manual, y ese botón vive al final de una
pantalla larga: se marcaba el bono, se cambiaba de pestaña y el módulo se
desmontaba con lo marcado dentro, sin guardar y sin decirlo. Mismo modelo que
Instalación (freno de 900 ms + referencia de lo último persistido, con la primera
emisión como línea base). Se manda **solo su clave** (`{ documentacion: {
subvenciones } }`): `mergeDocumentacion` funde en el backend, y reenviar
`documentacion` entera desde una copia hidratada es justo lo que pisa lo que
hayan escrito otros endpoints. El botón se sustituye por el acuse
«Guardando… / ✓ Guardado» — un autoguardado mudo no se distingue de no guardar.

```bash
node implementation/backend/scripts/test_subvenciones_bono.mjs
```

### Lo que se escribe ENCIMA del PDF en el visor no se envía

El impreso oficial se previsualiza como PDF real en un iframe, y el visor del
navegador trae sus propias herramientas de anotación (texto, lápiz, resaltado).
Lo que se escriba con ellas vive **solo en esa pestaña**: no está en el fichero,
no se guarda en Drive y no viaja en el envío — y desde el otro lado no hay forma
de notarlo, porque el PDF que recibe el cliente sale limpio. Lo dice ahora la
propia barra del visor (`DocumentoOficialPreview`), que es donde se comete el
error. Para marcar casillas a mano sigue estando el formato **Clásico**, cuyo
estado sí viaja en `overrides.anexo1`.
