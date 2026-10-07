<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «GENERAR el CEE inicial desde las fotos — skill `generar-cee-inicial` (2026-09-29)»; la introducción y el resto, en esta misma carpeta.

### El CROQUIS CATASTRAL POR PLANTAS, de la Sede (2026-10-05)

Lo que el motor conjeturaba —DÓNDE está el garaje, el almacén o el porche dentro de una planta—
**lo publica el Catastro**: el croquis catastral por plantas, en la ficha de la parcela del visor
de la Sede («Información de parcelas e inmuebles» → «Más información de la parcela»), sin
identificación ni captcha. Lo pidió el usuario: «cuando haces un CEE, descárgate del Catastro
cualquier archivo que te pueda ayudar». Se bajan cinco productos:

| Producto | Qué es | Para qué |
|---|---|---|
| **FXCC por plantas** (ZIP: `.dxf` + `.asc`) | Cada local de cada planta DIBUJADO con su código de destino y sus m² | El motor: cuerpos y propuesta EXACTOS |
| **Croquis por plantas (PDF)** | El mismo croquis, para personas | La skill lo MIRA; el certificador lo tiene al lado |
| **KML por plantas** y **KML de la parcela** | 3D (Google Earth) | Ver volúmenes y alturas |
| **FXCC con colindantes** | La parcela y sus vecinas, con su nº de plantas | Medianeras |

| Qué | Dónde |
|---|---|
| Descargar (postback de ASP.NET, caché, candado) | [src/catastro/sede.py](implementation/cee-engine/src/catastro/sede.py) |
| Leer el FXCC (norma `formato_fxcc.pdf` v2024) | `leer_fxcc` en [src/catastro/fxcc.py](implementation/cee-engine/src/catastro/fxcc.py) |
| Encaje con la parcela, contraste con `lcons`, propuesta | `traer_de_la_sede` · `adjuntar_fxcc` · `_propuesta_fxcc` en `pipeline.py` |
| Qué hay dentro de cada cuerpo, planta a planta | `_casar_por_croquis` en [gis/cuerpos.py](implementation/cee-engine/src/gis/cuerpos.py) |
| Motor | `POST /envolvente` con `sede_catastro` (→ `catastro_fxcc`, `catastro_sede`) · `POST /catastro/documentos` (los ficheros en base64) |
| Skill | `cee_inicial.js paredes` (baja y enseña) · `catastro <clave> [--escribir]` · `aplicar --escribir` (los sube) |
| Drive | `1. CEE / CEE INICIAL / CATASTRO` — `guardarDocsCatastro` en `ceeEnvolventeCex.js` |
| Ventana | la ruta de geometría lo pide siempre (`CEE_SEDE_CATASTRO=false` lo apaga) |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_fxcc_plantas.py` (fixture real) |

**Cómo se pide (medido el 2026-10-05).** Cada enlace es un *postback* de
`/CYCBienInmueble/OVCListaBienes.aspx?origen=Carto&huso=3857&x=..&y=..` (la ficha del punto que
abre el visor): se rellenan `hdDelegacion`/`hdMunicipio`/`hdRC` y `__EVENTTARGET` con el control
(`btnFXCCDes`, `btnPDFFXCC`, `btnFXCCVer`, `btnVerFXCC`, `btnFXCCColindantes`), y la Sede REDIRIGE a
la descarga con su propio token (`…DescargaFXCC.aspx?refcat=..&captcha=<token>`). No se resuelve
ningún captcha ni se adivina ninguna URL: es lo que hace el navegador. ⚠️ En el HTML del servidor
la delegación, el municipio y la RC están en `CargarBien('13','93','U','RC',…)` y en los enlaces
`…?del=13&mun=93&refcat=…`, **escapados (`&#39;`)**; los `PonRefCat(…)` los pone después el JS. Los
dos GML de la ficha llegan VACÍOS por esta vía (el motor ya los trae por INSPIRE).

**REGLA — mismas cautelas que con el Catastro de siempre**: IPv4, orden de cabeceras, en serie con
pausa y un CANDADO de proceso (FastAPI atiende en hilos), caché por parcela 30 días
(`CEE_SEDE_TTL_DIAS`) y **el fallo también se recuerda** 6 h (`CEE_SEDE_REINTENTO_H`). En `/envolvente`
solo se pide el FXCC: 3 peticiones a `www1.sedecatastro.gob.es`, que NO es el `ovc` del buscador
(el KML 3D sí redirige a `ovc`: solo lo baja `/catastro/documentos`). Nada de esto tumba una medición.

**Cómo se lee.** Capas `PG-xx` (planta general) y `PSn-xx` (planta significativa n, en el orden del
`.asc`, de abajo arriba): las líneas `LP`+`LI` se poligonizan y a cada polígono se le pega su
CENTROIDE (dos textos en el mismo punto de alineación 11/21: código `AU` —o `AA` en la general— y
superficie `AS`). Medido: los 17 recintos del fichero real salen con la superficie que rotula
Catastro (< 1 %). ⚠️ Catastro escribe POLYLINE estilo R12 (`VERTEX`…`SEQEND`): el lector antiguo
(`leer_dxf`) no las entendía. El nivel sale del NOMBRE de la planta (la norma obliga a que acabe en
sus códigos: `BAJA 00`, `Plantas 01,02,03`, `Plantas 01 A 03`) con `normaliza_planta`, la misma que
da la planta de `lcons`; uno que no lo dice (`ATICO AT`) se deduce por su orden y se marca.

**REGLA — cada local casa con SU fila de `lcons`**: el código es DESTINO.PUERTA.ESCALERA (`V.04.1` =
escalera 1, puerta 04) y la planta la da la hoja. Medido: los 8 locales de 8480109VH9888S casan. Y
**manda esa fila** (lo que marcó una persona en la ficha técnica, el tipo de edificio); sin fila,
el destino con las listas de `alphanumeric` (`fxcc.cuenta`, una sola función para la propuesta y
para los cuerpos). Lo exterior (`PTO`, `YPO`, `TZA`, `SOP`…) no cuenta nunca.

**REGLA — solo se usa si CAE sobre la parcela.** El DXF va en el huso de la cartografía del
municipio: si no se solapa con la parcela de INSPIRE se prueba en los otros (`25828…25831`,
`23028…23031`) y, si ninguno encaja, no se usa y se dice. Además se contrastan las superficies por
planta con `lcons` (el croquis tiene su FECHA, la del `.asc`).

**Con el croquis, la propuesta deja de ser una conjetura**: en cada planta que describe, los
recintos que no cuentan —agrupados por uso de zona, menos lo que ya es un cuerpo aparte— salen con
`origen: 'fxcc'`, confianza alta y su motivo («lo dibuja el croquis catastral (30/12/15): …»). Se
PROPONE, no se aplica (puede haber una obra posterior al croquis). En la skill esos polígonos van a
`zonas_fuera` TAL CUAL (no a `croquis`, que los reajusta).

**Y cada cuerpo sabe qué tiene DENTRO**, planta a planta (`por_croquis`, `detalle`): manda sobre la
casación por superficie. Medido en **26RES060_OP267** (CL Romeras 8, Villanueva de los Infantes): el
cuerpo de 47,7 m² se daba por el PORCHE de 45 m²; es COMERCIO abajo y ALMACÉN arriba. La conjetura
geométrica ponía el comercio «al fondo, al norte». Una planta del cuerpo donde el croquis no pone
NADA de esta parcela es de otra (`niveles_de_otra_parcela`: la casa «maclada» `.II08I09I`, porche
de ésta abajo y casa del vecino arriba) y tampoco cuenta. Con todo aplicado, suelo de la baja
78,25 m² (= V.04.1, 78) y planta 1 64,5 + 35,9 m² (= V.03.1, 100).
