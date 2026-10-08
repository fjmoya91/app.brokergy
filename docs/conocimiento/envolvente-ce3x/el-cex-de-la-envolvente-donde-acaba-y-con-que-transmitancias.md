<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El `.cex` de la envolvente: dónde acaba y con qué transmitancias (2026-09-13)

De la referencia catastral sale la envolvente medida; lo que el `.cex` necesita
ALREDEDOR —titular, zona climática, transmitancias— no está en Catastro y hasta
ahora no lo componía nadie: el botón de generar leía `expediente.ce3x_datos`,
**que no existe en ninguna tabla**, y el motor moría con un `500 'termicas'`.

| Qué | Dónde |
|---|---|
| La ficha del certificador (fuente única, la comparten vista y backend) | [logic/fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) |
| Cargar el expediente, componer y guardar | [ceeEnvolventeCex.js](implementation/backend/services/ceeEnvolventeCex.js) |
| Rutas | `POST /api/cee-envolvente/:id/ficha` (lo que se va a escribir, sin escribir) · `POST .../cex` |
| Prueba de punta a punta con un expediente real | `node implementation/backend/scripts/probar_cex_envolvente.js 26RES060_186 [--escribir]` |

**REGLA — las transmitancias son las de la GUÍA DE TRANSMITANCIAS de BROKERGY, y
desde el 08/10/2026 la Guía son los «Estimados según antigüedad y zona climática» de
CE3X 3.2, escritos como «Conocidas»** (decisión de Fran: «cada nuevo CEE debe llevar
valores conocidos como si se hubiera seleccionado estimados según antigüedad y
zona»). Salen de [transmitanciasCe3x.js](implementation/frontend/src/features/calculator/logic/transmitanciasCe3x.js),
la MISMA tabla que usa la calculadora en las simulaciones nuevas, el PDF de la Guía
y la revisión: **no se copia ni una U, se importa**. Fachada, cubierta, suelo al aire,
suelo contra el terreno («Por defecto»), partición vertical y partición horizontal
—hacia arriba «Otro», hacia abajo garaje, cada una con la suya— llevan la U **y la
masa** de CE3X, por el periodo que DECLARA el `.cex` (su «Normativa vigente», no el
año a secas) y, de 1980 a 2007, por la **zona NBE** que el `.cex` escribe en sus datos
generales (`zona_nbe`). Comprobado abriendo con CE3X los `.cex` nuevos de 26RES060_188
(23 cerramientos) y 26RES060_186 (14, partición incluida): las U y masas «Conocidas»
son idénticas a las que CE3X pone con «Estimados». La tabla, cómo se sacó y el porqué:
«Los valores POR DEFECTO de CE3X 3.2, por época y zona».

Hasta el 07/10/2026 la Guía era la del 17/03/2026 (2,20/2,50/1,25 antes de 1960 ·
1,90/2,10/1,10 hasta 1978 · 1,80/1,90/1,05 hasta 1990 · 1,69/1,69/1,00 hasta 2007 ·
U_max del CTE 2006 por zona hasta 2013 · 0,35/0,25/0,35 desde 2014; particiones
2,56 → 1,60; masas fijas del `.cex` de 26RES060_186). Se conserva como
`getUByYearGuiaAnterior`: con ella se revisan los certificados de antes del
08/10/2026 y siguen calculando las simulaciones guardadas sin la marca
`guia_transmitancias`.

**Verificado contra ese mismo expediente** (con la Guía anterior): la ficha derivada
reproducía **19 de 19** campos del `.cex` que el certificador escribió a mano
—normativa NBE-CT-79, zona D3, 165 m², 1 planta, ventilación 0,83, año 1994 y las seis
transmitancias con sus masas—. Desde el 08/10/2026 las U y masas cambian a propósito;
los demás campos, no. La ventilación sale también de la app (`getVentanaYACHByYear`),
no de una tabla nueva.

**REGLA — el `.cex` se GUARDA SIEMPRE en la carpeta del expediente**, `1. CEE /
CEE INICIAL`, que es la que ya se comparte con el certificador al encargarle el
CEE (la resuelve `ceeUploadService.ensureCeeSectionFolder`, no se escribe
ninguna ruta a mano). No se descarga y ya está: un fichero en la carpeta de
descargas de quien pulsó el botón no está en el expediente — no lo ve el
técnico, no lo ve quien revisa, y a la semana nadie sabe si llegó a generarse.
Si Drive falla, la respuesta es un **502 que lo dice**, nunca un "generado".

**REGLA — el nombre lleva `_REVISAR` y eso es funcional, no decorativo.**
`{nº} - CEE INICIAL_REVISAR.cex` lo ha escrito una máquina: hay que abrirlo en
CE3X y comprobarlo antes de que valga como certificado. Y sobre todo, vive en la
MISMA carpeta y con la MISMA extensión que el `.cex` que entrega el técnico, que
`matchSlot` reconoce **solo por la extensión**: sin la salida de
`_revisar.cex → null` en [ceeUploadService](implementation/backend/services/ceeUploadService.js),
generarlo dejaría la rejilla del CEE y el popup público del certificador diciendo
que el certificado ya está presentado. El paquete del verificador no se ve
afectado: pide `xml`/`pdf`/`registro`/`etiqueta`, nunca un `.cex`.

**REGLA — la ficha se compone en el BACKEND, no llega del navegador.** Los datos
son del expediente y las U de la función que estudió la oportunidad. Si los
mandara el cliente, cualquiera con la sesión abierta podría escribir un
certificado con las transmitancias que quisiera. El navegador solo manda lo que
se señala en el plano: los huecos, la entrada y qué medianeras dan a un espacio
no habitable (`loSenalado()`).

**REGLA — lo que no se puede derivar sale DECLARADO, no inventado.** La demanda
de ACS (140 l/día), la masa de particiones ('Pesada') y el tipo de edificio son
decisiones del certificador: van con su valor por defecto —el de los expedientes
ya emitidos— y **dicen que lo son**. La **zona HE4** (la de radiación, para ACS)
solo se afirma donde está comprobada contra `.cex` reales (Ciudad Real y Toledo →
V); en el resto se dice que falta en vez de escribir una plausible. Cada valor
de la ficha lleva su `de:`, y el popup "Lo que se va a escribir en el .cex" los
enseña antes de generar.

**REGLA — la foto de fachada y el croquis van DENTRO del `.cex`, y salen del
Catastro.** Son las MISMAS que la app ya rescata para la ficha catastral
(`catastroService.getFacadeImage` / `getParcelImage`): aquí no hay un cliente
nuevo contra Catastro, se reutiliza el que ya respeta el WAF. Van **en serie y
con pausa**, no se piden si el monitor está en modo bloqueado, y se cachean por
RC mientras viva el proceso — regenerar tres veces no puede costar nueve
peticiones. Solo se bajan **al GENERAR**: la previsualización de la ficha se
abre muchas veces. Que falte una no impide generar (muchos inmuebles no tienen
foto registrada): se dice en los avisos y se puede poner en CE3X. Medido en
26RES060_186: el `.cex` pasa de 13 KB a 86,7 KB y las dos entran como PNG de
179×134, que es lo que guarda CE3X.

⚠️ **La foto de fachada del Catastro llega MAL TERMINADA** (medido en esa RC:
330.687 bytes que acaban en `ff00`, con el fin de JPEG en el byte 62.354 —
idéntico byte a byte descargándolo con `curl`, así que no lo corrompe la app).
El motor ya lo contempla y usa lo que puede leer, pero su aviso lo daba por un
fichero de disco: `p.name` con bytes en base64 reventaba con un
`UnboundLocalError` **justo en el caso para el que ese aviso existe**. Arreglado
en `tools/generar_cex.py` de los DOS repos a la vez (app y `C:\Proyectos\CEE`),
que se mantienen idénticos.

⚠️ **`AVISOS_IMAGEN` es una lista GLOBAL del módulo** y el CLI la usa una vez por
proceso; el servicio vive semanas. Sin vaciarla en cada petición, el `.cex` de un
expediente salía con los avisos de todos los anteriores — con fotos de otros
clientes nombradas dentro. La limpia `server.py` al entrar en `/cex`.

**La altura de planta es la que se usó para MEDIR** (`parametros.floor_height_m`),
no una decisión aparte: si la ficha declarara 2,8 y las fachadas se hubieran
medido con 2,7, las superficies del `.cex` no cuadrarían con su propia altura.
Para cambiarla hay que volver a traer la envolvente.

⚠️ Las cadenas de los desplegables de CE3X son EXACTAS y están medidas sobre el
corpus de 1.188 `.cex`: normativa `Anterior` · `NBE-CT-79` · `C.T.E.` ·
`CTE 2013` (no hay opción para el CTE 2019: un edificio de 2020 se escribe como
CTE 2013 aunque su U sea la de nZEB), municipio `Otro` + el nombre en texto, y
la provincia capitalizada ("Ciudad Real", no "CIUDAD REAL") o CE3X la deja
vacía.
