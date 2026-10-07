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
