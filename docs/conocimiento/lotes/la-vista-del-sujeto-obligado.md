<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## La «Vista S.O.»: su obligación del año y cómo vamos con ella (2026-10-28)

Fran (28/10/2026): «quiero una vista como si yo fuera Interalco», para saber cuánto
tiene que cubrir, cuánto ya tiene, cómo van nuestros lotes con él y cuánto le puedo
ofrecer. De la Orden de obligaciones 2026 (Anexo II) INTERALCO tiene **20,03 GWh** de
cuota, de los que el **8 %** va obligatoriamente al Fondo (1,60 GWh) y **18,43 GWh**
los puede cubrir con CAE; de esos, **9 GWh** dice que ya los tiene comprados a otros
agentes.

| Qué | Dónde |
|---|---|
| Las cuentas (función pura, también la usa el backend) | [logic/obligacionSo.js](implementation/frontend/src/features/lotes/logic/obligacionSo.js) |
| El panel (conmutador «Lotes / Vista S.O.» de la pestaña Lotes) | [SujetoObligadoPanel.jsx](implementation/frontend/src/features/lotes/components/SujetoObligadoPanel.jsx) |
| Guardar la obligación y calcular lo disponible | [services/obligacionSo.js](implementation/backend/services/obligacionSo.js) |
| Rutas | `GET /api/lotes/obligacion-so/:soId` (staff) · `PUT` (adminOnly) · `GET /api/lotes/disponible` (staff) |
| Prueba | `node implementation/backend/scripts/test_obligacion_so.mjs` |

**REGLA — la obligación la TECLEAMOS, por S.O. y año.** Va en `app_settings` como
`obligacion_so:{id}` (mismo patrón que las tarifas del verificador, sin migración):
cuota en GWh, % mínimo al Fondo (8 por defecto), lo comprado a otros, equivalencia
financiera (198,62 €/MWh por defecto; la del Anexo II de 2026 es 198,624), ventas
computables (informativo), fuente y notas. Un año sin cuota no se guarda. Lo ve todo
el staff (son GWh y cifras públicas del Anexo II); solo el ADMIN la edita. Los GWh
se aceptan con coma («20,03»), con punto («20.03») o con millar («1.496,94»).

**REGLA — lo que le falta = cubrible con CAE − lo comprado a otros − TODO lo nuestro
para ese año**, nunca negativo (si se pasa, «le sobra»). Es lo que le faltaría aunque
se emitiera todo lo que tenemos en curso; aparte va lo **asegurado hoy** (otros +
nuestro ya emitido), que es lo único seguro.

**REGLA — lo nuestro, por ETAPAS vistas desde el S.O.**, no por los 14 estados del
lote: **CAE emitidos** (estado de cobro/finalizado, o con la resolución de emisión
subida aunque el estado no se haya movido), **en la Administración** (pte. subida,
subido a MITECO, requerimiento G.A.), **en verificación** (enviado, requerimiento,
verificado) y **en preparación** (borrador, firmas del S.O., oferta del verificador).
Cada lote con su cifra más firme: los CAE de la resolución → las unidades de nuestra
factura → el ahorro verificado de TODOS sus expedientes → el estimado. Medido el
28/10/2026: INTERALCO, 15 lotes, 4,72 GWh (1,17 emitidos · 2,30 en la Administración ·
0,78 en verificación · 0,47 en preparación) → le faltan **4,71 GWh** (≈ 935.000 € al
Fondo); asegurado hoy, el 55 % de lo cubrible.

**REGLA — cada lote cuenta para UN año de obligación**: un CAE emitido, el de su
resolución (o, sin ella, el de nuestra factura); uno sin emitir, el año en curso.
El ADMIN lo cambia lote a lote («2025», «2027», «No cuenta»), y solo se guardan las
excepciones (`asignacion`). Los que cuentan para otro año salen plegados debajo.

**REGLA — lo disponible es lo que tenemos SIN lote y sin rechazar**, en kWh (sin
importes), por cercanía al CAE: **listo para lotear** (DOC. COMPLETA), **obra
terminada** (CEE final y papeles), **en obra** (PTE. FIN OBRA) y **antes de la obra**.
Se acumula en ese orden frente a lo que le falta («con lo listo, el 39 %; sumando lo
que cierra papeles, el 76 %»). Lo que ya pasó por verificación SIN lote (53
FINALIZADO y 2 en pago el 28/10/2026) se vendió antes de la app y no cuenta. La cifra
de cada expediente es la de `economiaCae.economiaDe` (verificado si lo hay; si no, la
del CEE o la de la propuesta). **Es el mismo volumen para cualquier S.O.**: si se
ofrece a dos, se cuenta dos veces. Medido el 28/10/2026: 1,85 GWh listos (31) · 1,72
cerrando (31) · 6,23 en obra (111) · 1,80 antes (39) = 11,60 GWh; la consulta tarda ~3 s.

**La de INTERALCO 2026 está GUARDADA** (28/10/2026, con el «sí» de Fran): 20,03 GWh, 8 % al Fondo,
9 GWh de otros, 198,624 €/MWh y 1.496,94 GWh de ventas computables. El 29/10/2026 Jesús
Almodóvar (Interalco) corrigió lo de otros: **10,582 GWh** (Axoil 1,582 que vencen en 2026, Effic 4 y
STX 5), lo que les deja 7,85 GWh por cubrir («unos 8»); con nuestros 4,72 GWh en curso, faltan 3,13.

**El aspecto es el de Facturación** (Fran, 28/10/2026: «que se parezca a Facturación - carta de
pago»; regla 164): papel crema a todo el ancho, con su propia cabecera y el conmutador dentro; la
lista de lotes sigue oscura. La cifra protagonista es **lo que le falta**; debajo, las seis cuentas,
la cuota tramo a tramo (las etapas, ordinales, en un solo tono verde de oscuro a claro; lo que
falta, rayado en ámbar, nunca rojo), los lotes por etapa y lo disponible (el naranja ordinal del
embudo de Facturación). Las piezas son las `.fx-` de `facturacion/estilo.jsx` (`DialogoFx` para
editar, `ErrorApi` con la BD caída, el aviso flotante al guardar). Junto al titular va el LOGO del
S.O. (`prescriptores.logo_empresa`, 29/10/2026): el de Interalco tiene el texto en BLANCO (hecho para
fondo oscuro) y en una caja blanca solo se veía la gota, así que al cargarlo se mira su luminosidad
media y, si es claro, la caja va en tinta (`logoEsClaro`). Sin logo, no se pinta caja.

`loteEco.js` importa ahora con extensión `.js` (Vite lo resuelve igual) para que el
backend y las pruebas lo puedan importar desde Node.

## El ENLACE para el propio S.O. y con qué se cubre lo que le falta (2026-11-03)

Fran (03/11/2026): a INTERALCO le faltan 1,89 GWh para 2026 y hay que mandarle lotes esta semana.
Quiere saber qué tiene ya listo y qué hay que terminar, y además un enlace para que él consulte
«en todo momento» cómo vamos.

| Qué | Dónde |
|---|---|
| La vista calculada en el SERVIDOR (lotes del S.O. enriquecidos + las mismas cuentas) | `vistaDeSo` en [routes/lotes.js](implementation/backend/routes/lotes.js) → `vistaSo` de [services/obligacionSo.js](implementation/backend/services/obligacionSo.js) |
| Lo que puede ver el S.O. | `vistaParaElSo` en el mismo servicio |
| El token | `getEnlace` / `crearEnlace` / `quitarEnlace` / `soDelToken` (mismo servicio) |
| Rutas | `GET /api/lotes/obligacion-so/:soId/vista` (staff) · `GET/POST/DELETE …/enlace` (adminOnly) · `GET /api/public/so/:token` (pública, valida su token) |
| La página | `/so/:token` → [SujetoObligadoPublicoView.jsx](implementation/frontend/src/features/public/views/SujetoObligadoPublicoView.jsx), con las MISMAS piezas que el panel (`ResumenObligacion`, `EtapasLotes`; formatos y CSS en [vistaSoEstilo.js](implementation/frontend/src/features/lotes/components/vistaSoEstilo.js)) |
| El botón | «Enlace para {S.O.}» en la cabecera de la Vista S.O. (solo ADMIN): crear, copiar, abrir, cambiar, quitar |
| El plan | `planParaCubrir` en [logic/obligacionSo.js](implementation/frontend/src/features/lotes/logic/obligacionSo.js), bloque «Para cubrir lo que le falta» del panel |

**REGLA — el enlace es un token de 128 bits por S.O., y quitarlo o cambiarlo deja muerto el
anterior.** Va en `app_settings` como `enlace_so:{id}` (sin migración, como la obligación). Lo
crea, lo cambia y lo quita SOLO el ADMIN (las dos capas). La ruta pública compara el token en
tiempo constante, responde `404` si no abre nada y `503` si no puede calcular, y no se cachea.
Mandárselo al S.O. es un envío como cualquier otro: con el «sí» de Fran.

**REGLA — el S.O. ve su obligación y NUESTROS LOTES; de lo que no está en un lote, solo el
TOTAL.** `vistaParaElSo` deja pasar las cifras de su obligación (las del Anexo II, públicas,
SIN nuestras notas, que son internas), los lotes de ese año por etapa (código, estado, nº de
actuaciones, kWh y de dónde sale la cifra) y la cartera como un número («10,94 GWh más»). No
lleva clientes, ids, ofertas ni importes nuestros, ni los lotes que cuentan para otro año. La
cartera va solo en total porque es la misma para cualquier S.O. (Fran, 03/11/2026: el detalle
nos comprometería). **Un lote vacío no se enseña**: es el que estamos armando (0 MWh y sin
código); uno sin código pero con expedientes sale como «Lote en preparación».

**REGLA — el estado del lote le llega en SU idioma, nunca el nuestro.** (Fran, 03/11/2026, al ver
el enlace: «PTE. PAGO BROKERGY A CLIENTE» o «PTE. FIRMA S.O.» son pasos de nuestra casa). Lo
traduce `ESTADO_PARA_EL_SO` en `services/obligacionSo.js`, antes de que salga del servidor:

| Estado interno | Lo que lee el S.O. |
|---|---|
| BORRADOR | En preparación |
| SOLICITADO PRESUPUESTO A VERIFICADOR | Pidiendo oferta al verificador |
| PTE. OFERTA VERIFICADOR | Esperando la oferta del verificador |
| PTE. FIRMA S.O. | Pendiente de vuestra firma |
| PTE. FIRMA OFERTA S.O. | Pendiente de vuestra firma (oferta del verificador) |
| ENVIADO A VERIFICADOR | En verificación |
| REQUERIMIENTO VERIFICADOR | Requerimiento del verificador · respondiendo |
| VERIFICADO | Verificado |
| PTE. SUBIDA MITECO | Verificado · por presentar al MITECO |
| SUBIDO A MITECO | Presentado en el MITECO |
| REQUERIMIENTO G.A. | Requerimiento del Gestor · respondiendo |
| CAE EMITIDO – PTE PAGO BROKERGY · PTE. PAGO BROKERGY A CLIENTE · FINALIZADO | CAE emitidos |

Un estado que no esté en el mapa sale con el **título de su etapa**, nunca en crudo. La fuente de
la cifra va también en texto («CAE de la resolución», «facturado», «verificado», «estimado»: no
«de nuestra factura»), y del código se quita lo de entre paréntesis («PAQUETE 1 - 2025 (PRE APP)» →
«PAQUETE 1 - 2025»). En el móvil la chapa del estado es una frase: se parte en dos líneas en vez de
cortarse. Lo vigila la sección 8 de `test_obligacion_so.mjs`.

**REGLA — lo que le falta se cubre primero con lo LISTO y luego terminando lo que tiene la obra
hecha, de más a menos MWh; de lo que aún se está cerrando, lo que tiene incidencias GRAVES
abiertas no cuenta.** `planParaCubrir`: TODO lo listo para lotear (DOC. COMPLETA o más: ahí
manda el estado, Fran 03/11/2026 — sus graves abiertas solo se avisan, «si ya están resueltas,
ciérralas»); si no llega, los de la etapa «obra terminada» (CERRANDO) sin graves, de más MWh a
menos, hasta cubrirlo — esos salen resaltados y son la lista de trabajo de la semana. Los
CERRANDO con graves se nombran aparte («subsanadas, entrarían»). Las incidencias las trae `GET /api/lotes/disponible` por expediente, solo de lo
listo y lo cerrando (`utils/incidenciasAbiertas.js`: estado ABIERTA, el criterio del listado y
del MCP). Medido el 03/11/2026: le faltan 1,89 GWh; listo 1,01 GWh (17, uno con graves
abiertas: 25RES080_28); con la obra hecha y sin graves 1,35 GWh (24): llega terminando parte de
esos 24.

**REGLA — el S.O. ve el AHORRO por trabajar con BROKERGY; a cuánto le sale el CAE (€/MWh) lo ve
solo nuestro ADMIN** (2026-11-05). Bajo la tarjeta «Con BROKERGY». Primero Fran pidió el €/MWh
(«a cuánto está pagando el CAE, coste verificación + compra a mí») y luego lo acotó: «que
Interalco de momento no vea a cuánto está pagando el CAE, solo el ahorro». Se suman nuestra factura
(su base; sin factura, la oferta × MWh) y la verificación, y se dividen por los MWh. Solo cuentan
los lotes con la verificación facturada, porque sin ella la cifra saldría más baja de lo que le
cuesta. El ahorro es (equivalencia − ese €/MWh) × MWh. Lo calculan `costeDelLoteParaSo` y
`precioCaeParaSo`. En `CAMPOS_OBLIGACION` solo pasa `ahorroCaeEur`: el enlace público NI RECIBE el
€/MWh. La Vista S.O. interna lo pinta solo con `conPrecio`, que es `canEdit` (ADMIN). Para
enseñárselo algún día, basta con añadir `costeCaeMwh` a `CAMPOS_OBLIGACION`. Medido el 05/11/2026
para INTERALCO: 177,20 €/MWh sobre 16 lotes (5,44 GWh), con 116.664 € de ahorro frente a 198,62 €/MWh.

La vista en el servidor tarda ~4 s (la mitad es lo disponible); en local el modo estricto de
React la pide dos veces.

## Su cuenta en el REGISTRO NACIONAL DE CAE: emitido no es liquidado (2026-11-19)

Fran (19/11/2026) dejó el certificado del MITECO a INTERALCO (del 18/11/2026, CSV
GEN-467c-…): un PDF firmado y un Excel con los tramos de CAE inscritos a su nombre. Lo pidió para
la Vista S.O., «que sea útil para nosotros y el S.O.»: **«puede ser que para nosotros sea
resolución favorable, pero luego los tienen que liquidar ellos»**. Los dos ficheros están en
`…/03. SUJETOS OBLIGADOS/5. INTERALCO/CAE EMITIDOS MITECO`.

| Qué | Dónde |
|---|---|
| Leer el Excel (columnas por su título) y el PDF (texto con MuPDF, sin IA); guardar | [services/registroCaeSo.js](implementation/backend/services/registroCaeSo.js) |
| El cruce con nuestros lotes (función pura) | `normalizarRegistro` y `cruzarRegistro` en [logic/obligacionSo.js](implementation/frontend/src/features/lotes/logic/obligacionSo.js); `computeVistaSo({ …, registro })` |
| El bloque «Su cuenta en el Registro» y el chip de cada lote | `RegistroCae` y `ChipRegistro` en [SujetoObligadoPanel.jsx](implementation/frontend/src/features/lotes/components/SujetoObligadoPanel.jsx), los mismos en la página del S.O. |
| Rutas | `GET /api/lotes/obligacion-so/:soId/registro` (staff) · `POST …/registro` (adminOnly; Excel + PDF; en seco, `?guardar=1` guarda) |

**REGLA — lo que dice el MITECO se guarda TAL CUAL y se cruza en cada vista.** Va en `app_settings`
como `registro_cae_so:{id}` (el patrón de la obligación): tramos (vencimiento, código inicial y
final, total, expediente de emisión), solicitudes sin resolver (E_CAE + REGAGE), fechas, CSV y lo
liquidado contra el año. Un certificado nuevo SUSTITUYE al anterior: cada uno es la foto completa de
su cuenta. Se sube desde la propia Vista S.O. («Nuevo certificado», solo ADMIN): primero se LEE y se
enseña, y luego se guarda. Un PDF de otro NIF no se acepta; si el Excel no cuadra con su TOTAL
INVENTARIO o con la razón social, se avisa. **Solo se afirma lo liquidado si el certificado lo dice**
(«no consta que se haya liquidado ningún CAE contra la obligación de 2026» → 0); si no, «sin dato».

**REGLA — un tramo es NUESTRO por el expediente de emisión de la resolución del lote (o su primer
código CAE); a falta de eso, si un lote emitido sin casar tiene EXACTAMENTE esos CAE. Una solicitud
pendiente es nuestra por el REGAGE del lote (`registro_miteco`), sin mirar mayúsculas.** Cada lote
queda en una de cuatro situaciones: **en su cuenta** (inscrito, sin liquidar, con su vencimiento) ·
**pte. de resolución** · **aún no figura** (tiene REGAGE pero no salía en el certificado) · **no
figura en su cuenta** (lo damos por emitido y no está: o lo liquidó o algo no cuadra, y se avisa;
solo para los lotes del año que se mira).

**REGLA — una resolución que subimos DESPUÉS del certificado entra sola en su cuenta, sin esperar a
otro certificado** (Fran, 19/11/2026: «que se actualice cuando subimos una resolución nueva»). El
MITECO inscribe el CAE en la cuenta del S.O. al resolver, así que un lote emitido cuya
`fecha_resolucion` (o, sin ella, la subida del certificado CAE) es del día del certificado o posterior
se cuenta como un tramo más: con su expediente de emisión, sus códigos y el vencimiento que lleva el
propio código (`CAE_…_311228` → 31/12/2028, `venceDeCodigo`), marcado «después del certificado» en el
paso 3, en el chip del lote y en la tabla. Sale de los pendientes de resolución, entra en el total de
su cuenta y en lo de BROKERGY. Sin esto, el lote recién resuelto se pintaba como **«no figura en su
cuenta»**, una alarma falsa. Una resolución ANTERIOR al certificado que no figura sigue siendo «no
figura» (o ya se liquidó o algo no cuadra). El día de corte es la fecha del certificado, no la de los
datos: E_CAE_2026_07019, resuelto el 04/11, ya estaba en un certificado «con datos a 03/11».

**REGLA — se pinta como un CAMINO y el último paso es SUYO**: recién presentados → pendientes de
resolución → en su cuenta sin liquidar → **liquidado contra el año («le toca a {S.O.}»)**. Aparte, los
vencimientos por año y, en ámbar, lo que vence el 31/12 del año que se mira («o se liquidan contra
la obligación de {año}, o se pierden»). Las cuentas de la obligación (lo que falta, lo asegurado) NO
cambian: el certificado es la comprobación de que lo asegurado está de verdad en su cuenta. En la
vista interna, además, si lo de otros agentes en su cuenta cuadra con lo que nos dijo que compró. El
S.O. ve todo esto en su enlace: son sus datos del Registro y nuestros códigos de lote.

Medido el 19/11/2026 (certificado del 18/11, datos a 03/11): **13.707.801 CAE en 40 tramos, nada
liquidado contra 2026**. Nuestros, 9 tramos = **3.125.537**, que son exactamente los 9 lotes que la
vista daba por emitidos (el PAQUETE 1 PRE APP es E_CAE_2026_02095, y LOTE-2026-004, sin el
certificado leído, E_CAE_2026_06161, los dos por la cifra). De otros agentes, 10.582.264: cuadra con
los 10,582 GWh que dijo Jesús Almodóvar el 29/10. Las 4 solicitudes sin resolver son LOTE-2025-009,
010, 011 y 012 (1,13 GWh); LOTE-2026-013 y 014 (presentados el 16/11) aún no figuraban. **Vencen el
31/12/2026 1.804.037 CAE, ninguno nuestro** (Axoil 1.582.000 · E_CAE_2025_02729 · E_CAE_2026_00069).
