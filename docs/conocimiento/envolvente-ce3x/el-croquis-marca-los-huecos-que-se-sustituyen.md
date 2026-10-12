<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## El CROQUIS marca los huecos que se SUSTITUYEN (2026-10-12)

Lo pidió Fran con 26RES080_66 (un RES080 de ventanas): el auditor del verificador comprueba que
las ventanas que cambian en el CEE final son las de la FACTURA y las de las fotos de antes y
después, y para eso hace falta ver en el plano **cuáles** se sustituyen. Hasta ahora el croquis
las dibujaba todas igual y la marca «- CAMBIA» (regla 66) solo se leía en el nombre.

| Qué | Dónde |
|---|---|
| Dibujo, leyenda, cuadro y recuento | [croquisCee.js](implementation/backend/services/cee/croquisCee.js) (`esCambia`, `P.cambia`, `simbolo('cambia')`) |
| De dónde sale la marca | el hueco del trabajo con `cambia: true`, o el nombre del `.cex` acabado en «- CAMBIA» |
| Rehacerlo | `node implementation/backend/scripts/cee_inicial.js croquis <nº> [--fase final] [--escribir]` |

**REGLA — un hueco que se sustituye va en su color, con leyenda.** Color `#C2185B` (5,8:1 sobre
blanco, se lee impreso y no es el de ningún otro elemento del plano): banda suave a los dos lados
del muro, el vidrio en ese color y su rótulo también. La leyenda «Hueco que se sustituye
(«- CAMBIA»)» y el recuento «N se sustituyen» del título **solo salen en la hoja que tiene
alguno**: en una planta que la obra no toca serían una entrada sin nada que señalar. En el cuadro
de huecos la fila lleva el nombre en ese color y un filete a la izquierda.

**REGLA — la SUPERFICIE de un hueco del `.cex` ya va multiplicada.** CE3X guarda en `superficie`
el total (3 ventanas de 1,00 × 1,30 → 3,90) y el croquis la volvía a multiplicar por el
`multiplicador`: salían 11,70 m². Ahora se usa tal cual, la medida dice «(×3)» y los recuentos de
huecos (título, cuadro, superficies) cuentan UNIDADES, no filas: la planta 1 de 26RES080_66 decía
«6 huecos» con 10 ventanas dibujadas.

**REGLA — el muro de un cerramiento del `.cex` se busca por su NOMBRE completo, y el id solo si
ese muro no se ha renombrado.** Un `.cex` hecho a mano nombra sus muros a su manera («F1NO
PATIO», «FBSE1 - SIN AISLAR»), y al poner esos nombres en el plano (`trabajo.nombres`) el id del
motor FBNO1 puede ser ya el «FBNO3». Casando por la primera palabra y por id, «F1SE PATIO» cogía
el largo de «F1SE» y «FBNO1» el de otro muro (`muroDeNombre`). Y si el muro no está en el plano,
la planta del hueco sale de la ZONA de su cerramiento en el propio `.cex`: sin eso la fila no caía
en ninguna hoja.

**El caso.** En 26RES080_66 el CEE inicial lo hizo Fran a mano en CE3X 2.3, con los códigos del
proyecto del arquitecto. El plano de la app se montó con sus 20 huecos en la pared que les
asigna su `.cex` (radiografía del motor) y con sus nombres; se marcaron «- CAMBIA» los 10 de
planta baja (la factura del carpintero son 11 carpinterías de planta baja; el fijo de 1600×480 va
sobre otro hueco); y el CEE final se hizo copiando el inicial con esos 10 en «Conocidas» (regla
117). El croquis del final es el que va al auditor.
