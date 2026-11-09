# FACTOR MULTIPLICADOR: la Resolución publicada (RES060_FM, RES090_FM…RES094_FM, RES080_FM) (2026-11-07)

Resolución de 3 de noviembre de 2026 de la DGPLACE, **BOE núm. 278 de 7/11/2026, BOE-A-2026-23367**
(153 págs.). En el Drive: «01. RD 36-2023 (CAES) / 00. NORMATIVA / 00. NORMATIVA NACIONAL /
01. CONSOLIDADA / 07-11-2026 - FACTOR MULTIPLICADOR AEROTERMIA.pdf». **Entra en vigor el 8/11/2026.**
Sustituye al borrador de la consulta pública que la app calculaba como «FC»
([fichas-con-factor-de-correccion-res060fc-y-res09xfc.md](fichas-con-factor-de-correccion-res060fc-y-res09xfc.md)).
Comparación hecha el 7/11/2026 a petición de Fran, cotejando con script las tablas del BOE con las de
[res060fc.js](../../../implementation/frontend/src/features/calculator/logic/res060fc.js).

Para sacar el texto: `fitz` (PyMuPDF) **sin** `-I` sobre el PDF; las fórmulas son dibujos y se leen
renderizando la página (RES060_FM p. 8, RES080_FM p. 22, RES090_FM p. 25).

| Ficha | Págs. | Qué es |
|---|---|---|
| RES060_FM | 6–14 | Sustitución de caldera por bomba de calor (la nuestra) |
| RES062_FM | 15–19 | Calderas individuales de un bloque → bomba centralizada (f_M 4) |
| RES080_FM | 20–22 | **Nueva**: rehabilitación profunda, f_M solo sobre la parte de la bomba |
| RES090_FM…RES094_FM | 23–67 | Hibridación en PARALELO, una por zona: A3-A4 · B3-B4 · C · D1-D3 · E1 |
| RES095_FM…RES099_FM | 68–112 | Hibridación en modo ALTERNATIVO (por zona) |
| …_FM-S | 113–150 | Las mismas con consumidor vulnerable (×1,5) |
| Anexo A / Anexo B | 151 / 153 | Declaración de ayudas (sustituye al «anexo I») / consumidor vulnerable |

## Lo que cambia respecto al borrador

| | Borrador (lo que calcula hoy la app) | Publicado |
|---|---|---|
| Nombre | RES060FC, «factor de corrección» f_C | **RES060_FM**, «factor multiplicador» **f_M** |
| Fórmula RES060 | `mín(AES ; 0,70·CEF) · f_C` | `[(D_cal·S)·(1/η − 1/SCOP_bdc) + D_ACS·(1/η − 1/SCOP_dhw)] · f_M` — **sin tope de CEF** |
| Fórmula hibridación | `mín(AES·C_b ; 0,70·CEF_cal) · f_C` | `[…mismo corchete…] · C_b · f_M` — **sin tope** |
| D_cal | Tabla del Anexo IV (UNI / pisos 1-3 pl. / pisos ≥4 pl.) | La del **CEE POSTERIOR** (su anexo II). En **unifamiliar**, `mín(D_cal CEE ; 2 × tabla UNI)`. En el resto, la del CEE sin más. Las tablas de pisos desaparecen |
| D_ACS | Mes a mes con agua fría y 60 °C | `d_ACS · S`: **11 kWh/m²·año** (unifamiliar o piso individual), **16** (centralizado) |
| S | Superficie útil | La del **CEE posterior** |
| CEE inicial | Necesario (CEF) | **No se pide** en RES060_FM ni en las de hibridación: solo el CEE posterior registrado. (La RES080_FM sí pide el previo) |
| f_M | 2 · 2 (piso, en el cuerpo) / 2,5 (en la ficha) · 3 · 4 | **2 unifamiliar · 2,5 piso con sistema individual · 3 edificio con sistema centralizado · 4 individual → centralizado** (RES062) |
| Vulnerable | Solo severo, ×1,5 | Vulnerable, vulnerable severo **o** en riesgo de exclusión (RD 897/2017; no basta la familia numerosa sin renta), ×1,5 |
| Zonas D y E | Exige CEE con letra A–E (bloqueaba) | **Ya no excluye**: con F o G se aporta un documento firmado por el propietario de que se le ha informado de que la bomba podría no rendir lo previsto (doc. 13) |
| Inercia | Depósito ≥ 15 L/kW | Certificado de que la inercia es la que pide el FABRICANTE, con volumen total (L) y específico (L/kW) |
| Mantenimiento | Contrato de 2 años | **Oferta** de contrato de 2 años con firma de **aceptación o desistimiento** del propietario |
| Baja tensión | Siempre | «cuando en su caso sea de aplicación» |
| Cupo | 10 % de las obligaciones de 2027 | **15 % de la obligación de 2026 = 1.286.876.082 kWh** (≈1,29 TWh), por orden de fecha de **resolución**; a igual fecha, por fecha de solicitud |
| Presentación | 02/01/2027 – 01/01/2028 | **15/01/2027 – 31/12/2027** (comunidades de propietarios: hasta 28/02/2028) |
| Actuaciones | Iniciadas desde 22/03/2026 hasta 30/11/2027 | Igual; el inicio se justifica con **factura posterior al 22/03/2026**. Facturas **antes del 01/12/2027** (CC. PP.: antes del 01/01/2028) |
| Calderas | Gas, gasóleo, sólido, eléctrica | El Anexo II **quita las de combustible sólido**: solo gas (natural o GLP), gasóleo y eléctrica. **Todo sólido (carbón o biomasa) va siempre por la RES060 vigente**, por decisión de Fran: el Anexo II publicado no le da η. La eléctrica choca con el Primero b) («combustible fósil»): pendiente de consulta (FAQ 3) |
| ACS | «o uno de los servicios cuando sean independientes» | Esa frase **desaparece**: la bomba ha de «satisfacer completamente la demanda de calefacción y el ACS». Lectura prudente: **sin ACS por la bomba no hay FM** (FAQ 1) |
| RES080 | No había | **RES080_FM** (abajo) |

**Lo que NO cambia** (cotejado con script): la tabla UNIFAMILIAR del Anexo IV (51 provincias × 7 tramos,
idéntica a `ANEXO_IV.UNI`, ahora solo sirve de TOPE ×2); las tablas de C_b en paralelo de **aerotermia**
de las cinco zonas (idénticas a `CB_PARALELO`); el Anexo II de gas y gasóleo (83 % gas condensación antes
de 1998, 85 % desde 1998 con encendido automático); el Anexo I del SCOP; el «solo una vez por actuación» y
que lo **ya resuelto favorablemente desde el RDL 7/2026 no se puede volver a presentar**.

**Nuevo en las tablas de C_b**: una segunda columna para **geotermia o hidrotérmica**, algo más alta. El %
es de **potencia** nominal de la bomba (A7/Wxx) sobre la potencia total necesaria en proyecto; por debajo
del 10 % (A, B, C) o del 15 % (D, E) el C_b es 0; entre puntos, interpolación lineal; tres decimales.

## Lo que esto supone

- **Las fichas FM no sustituyen a las de siempre: conviven.** La Resolución no deroga ninguna; las FM son
  el camino para cobrar el factor (Segundo, Quinto y Séptimo). La RES060 vigente sigue para lo que no
  cabe en FM: carbón o biomasa, aire-aire, aerotermia sin ACS, segunda residencia, o cuando se acabe el cupo. Lo
  único que cambia en todas las fichas es el Anexo A en lugar del anexo I (FAQ 7).
- **La RES060_FM es la ficha vigente RES060 multiplicada por f_M**, con dos diferencias: D_ACS = 11·S en vez
  de la del CEE, y en unifamiliar la D_cal no puede pasar de 2 × la tabla. Con la vía FM el bono sube
  aproximadamente **×2 en unifamiliar y ×2,5 en piso**. Sin tope de CEF, la cifra depende solo del CEE final.
- **No hace falta CEE inicial** en RES060_FM ni en las hibridaciones: un coste que desaparece si se va por FM.
- **El riesgo es el cupo y el calendario**: no se presenta hasta el 15/01/2027, el orden lo da la fecha de
  RESOLUCIÓN (no la de presentación), y cuando se agoten los 1,29 TWh no hay FM. Lo que se presente con la
  ficha vigente y se resuelva ya no puede pedir el FM.
- **El cupo es pequeño**: 1,29 TWh con f_M ≥ 2 son ~0,64 TWh de ahorro real. Si la demanda supera a la oferta,
  se agotará pronto en 2027.

## Documentación que pide la RES060_FM (apartado 3)

1. Declaración responsable del **instalador** con la tipología: unifamiliar · piso con sistema individual de
   calefacción y ACS · edificio con sistema centralizado.
2. **Anexo A** (declaración de ayudas del propietario inicial del ahorro).
3. **Certificado de la instalación** de la empresa habilitada (con lo del art. 23.2.b del RITE, firmado por su
   representante) que incluya: a) los valores de las variables de la fórmula; b) si no se retira la caldera,
   justificación de que la bomba cubre íntegra la demanda (con Ax/Wy, temperatura exterior de proyecto y de
   impulsión) y de que la caldera queda en preinstalación, no hibridada, con accionamiento manual de
   emergencia; c) **certificado de inercia** con volumen total (L) y específico (L/kW).
4. **Vivienda habitual** (solo piso o unifamiliar): facturas de luz (o de combustible) **continuas del 1/11 al
   31/3 del invierno anterior al inicio**, con CUPS, dirección **idéntica a la catastral** y **> 75 kWh/mes de
   media**; o la curva horaria firmada digitalmente por la distribuidora.
5. Declaración de ayudas «según el formulario de la web» (es la misma que el 2).
6. **Facturas** con descripción de los elementos principales **y su número de serie**, posteriores al
   22/03/2026 y anteriores al 01/12/2027.
7. **Informe fotográfico antes y después** que permita ver que lo hecho coincide con la factura.
8. **Oferta del contrato de mantenimiento** de ≥ 2 años desde la puesta en servicio, con firma de aceptación
   **o de desistimiento** del propietario.
9. **Certificado de baja tensión** registrado, con el aumento de potencia, cuando sea de aplicación.
10. **Comunicación de puesta en servicio** de la instalación térmica (o el acta, si ya está inscrita o
    ≤ 70 kW).
11. **CEE posterior** a la actuación, **registrado**.
12. **Consentimiento** del propietario inicial del ahorro: a) acepta que el incentivo es un aumento
    patrimonial que **tributa en el IRPF**; b) el ahorro dependerá del funcionamiento de la bomba.
    Fran (7/11/2026): **va como cláusula del Convenio CAE y como texto de la propuesta**; con eso queda
    garantizada la información.
13. Zonas **D y E con CEE F o G**: documento firmado por el propietario de que ha sido informado de que, por
    el aislamiento, la bomba podría no alcanzar las prestaciones esperadas.

Requisitos (apartado 2): no cambia la tipología (individual sigue individual); caldera retirada o en
preinstalación sin hibridar; en D y E la bomba lleva sistema de seguridad (p. ej. resistencias) para
temperaturas negativas; excluidas las bombas de accionamiento térmico y los climas α.

**Hibridación (RES090_FM…RES094_FM)**: los documentos 1–12 equivalentes (sin el certificado de inercia ni el
de F/G), modo **bivalente paralelo** obligatorio, y el 13 propio: si se sustituye la caldera por otra más
eficiente hibridada, fichas técnicas con las potencias a la temperatura exterior de diseño (sin ahorro por la
mejora de la caldera). Excluida la caldera individual de un piso hibridada con la bomba de un centralizado.

**RES080_FM** (rehabilitación profunda; envolvente **y** sustitución de caldera por bomba a la vez):
`AE = (EF_i − EF_f) · (f_M·EF_simBC + EF_simRest) / (EF_simBC + EF_simRest)`, con **cuatro CEE**: previo,
posterior, posterior simulando SOLO la bomba (EF_simBC) y posterior simulando todo MENOS la bomba
(EF_simRest), todos con la misma herramienta. Lleva su propia documentación (certificado del director de
obra, vivienda habitual, etc.).

**Vulnerable (_FM-S)**: la misma documentación más factura con bono social a su nombre (o la solicitud) +
**Anexo B** firmado, nota simple / contrato de alquiler o cesión, empadronamiento y, si es inquilino,
compromiso de 2 años sin subir el alquiler. f_MPE = 1,5 sobre la superficie del vulnerable.

**Anexo A — para TODAS las fichas del catálogo**, no solo las FM: «sustituye al anterior anexo I». Pide
nombre de la actuación, código y nombre de la ficha, CC. AA., dirección, referencia catastral y **número de
serie de los equipos**; propietario y, en su caso, representante con sus poderes; las casillas de ayudas (no
solicitada · solicitada → obtenida / no obtenida / pendiente, con una tabla por programa) y el compromiso de
comunicar cambios en **5 días al sujeto obligado o delegado** con el que se firmó el convenio CAE.

## Dudas: lo que se ha decidido leer (07/11/2026)

La respuesta argumentada de cada una, con la cita y la consulta al MITECO que haría falta, está en la
[FAQ del factor multiplicador](../consultas/factor-multiplicador-faq.md). Ninguna está
confirmada por el MITECO todavía. En resumen:

- **ACS**: la bomba **tiene que dar también el ACS**. La frase del borrador que admitía un solo servicio
  se quitó, y la fórmula suma D_ACS = 11·S siempre. Una aerotermia solo de calefacción, tal cual, va por
  la RES060 vigente; pero en la app **no se bloquea**: es un aviso que dice qué hacer (añadir el depósito
  de ACS al presupuesto). Decisión de Fran, 07/11/2026: «Que sea un aviso». Ver la REGLA de la sección
  siguiente. La regla 163 (sin ACS declarado no se calcula) vale para la vía vigente, no para la FM.
- **D_cal del CEE posterior**: nuestro CEE final (copia del inicial con las instalaciones cambiadas)
  **vale**. La sustitución no cambia la demanda; lo que pide la ficha es que sea posterior a la obra y
  esté registrado. En pisos no hay tope: la D_cal del CEE es lo primero que mirará el verificador.
- **Combustibles**:
  - gas (natural o GLP) y gasóleo: sí;
  - **carbón o biomasa (todo sólido): siempre por la RES060 vigente.** Decisión de Fran, 07/11/2026: «si
    es carbon, biomasa, es decir solido, siempre a la normal». El Anexo II publicado no les da η;
  - eléctrica: la ficha la admite (η = 100 %), pero el Primero b) habla de fósil. Se consulta antes de
    prometerla.
- **RES080_FM**: pondera con consumos, al revés de lo lógico. Se calcula **literal** (la bomba sale
  ~19 % por debajo en el caso típico) y se pregunta.
- **Erratas**: la RES095_FM es en realidad una copia de la paralela, con el código «RES095FC». La
  RES099_FM tiene título de paralelo y contenido alternativo. Hay más en la RES080_FM y en los «punto
  5/6». No afectan a hibridaciones en paralelo en C y D.
- **Ya presentado sin resolver**: la Resolución solo veta lo «resuelto favorablemente». Pero el silencio
  es estimatorio a los 15 días hábiles (art. 13.2 RD 36/2023) y haría falta un dictamen nuevo. No se
  desiste de nada sin respuesta escrita del MITECO.

## Qué tiene que hacer la app (lanzado el 7/11/2026 en subsesiones)

- ✅ Motor ([res060fc.js](../../../implementation/frontend/src/features/calculator/logic/res060fc.js)): pasar
  del borrador a lo publicado (sin tope de CEF, D_cal del CEE con el tope ×2 en unifamiliar, D_ACS = 11·S,
  f_M, fechas y cupo nuevos, F/G como documento y no como bloqueo, todo sólido (carbón o biomasa)
  fuera de la FM y por la vigente (FAQ 3), nombres _FM). La pregunta
  de las plantas del edificio sobra. **Hecho el 7/11/2026**: ver la sección siguiente.
- ✅ Oportunidades: bono por la vía vigente y por la vía FM, para elegir. **Hecho** (columna «Vía FM»,
  solo ADMIN, con su precio propio opcional); falta aplicar el relleno en la BD, después del deploy.
- ✅ El conmutador «Vía de tramitación» en la calculadora, para acogerse a la FM antes de aceptar
  (`inputs.ruta_fm`). **Hecho el 7/11/2026**: ver la sección siguiente.
- Expediente: un código propio para la vía FM y su documentación completa en el gestor (los 13 puntos), el
  Anexo A en lugar del Anexo I, y la cláusula del IRPF en el convenio y la propuesta.
- ✅ RES080_FM: motor, calculadora, expediente, Oportunidades y serie `26RES080FM_N`. **Hecho el
  9/11/2026**: ver «La RES080_FM en la app».

## La app: las dos vías, en la calculadora y en Oportunidades (07/11/2026)

**Fuente única del cálculo**: `calculateRes060FM` en
[res060fc.js](../../../implementation/frontend/src/features/calculator/logic/res060fc.js), la usan la
calculadora (tarjeta «Vía FM» y chips «FM ≈…» bajo las cifras), el expediente (el `useMemo` del FM de
`ExpedienteDetailView`) y el resumen de la tabla
([viaFm.js](../../../implementation/frontend/src/features/calculator/logic/viaFm.js)). Devuelve `avisos`
(bloquea / aviso / info) y `elegible`. La caldera la sigue decidiendo `contextoCalderaFc` (la FILA de la
caldera, no el desplegable de tipo). Pruebas: `node implementation/backend/scripts/test_res060fc.mjs`.

**REGLA — un bloque que solo cambia el ACS no va por la vía FM.** Con `changeHeating: false` (que solo
cuenta en un bloque, como en la vigente) la calefacción se cancela del corchete y el FM queda
**bloqueado**: la ficha pide que la bomba dé la calefacción Y el ACS. Caso: **26RES060_OP190** (bloque de
7.225 m² que solo cambia el ACS) salía de 136 a 1.704 MWh contando una calefacción que la obra no toca.

**REGLA — calefacción SIN ACS es un AVISO que dice qué hacer, nunca un bloqueo, y la cifra FM ya
supone que se añade el ACS** (Fran, 07/11/2026: «Que sea un aviso»). La Resolución pide que la bomba dé
también el ACS (apartado 1 de la ficha); la salida comercial es ofrecer el depósito. Con
`changeAcs: false` y la calefacción cambiada, el motor suma **D_ACS = d_ACS·S** (11, o 16 en un bloque
centralizado) con el SCOP_dhw del equipo o el de la app (3,0) y marca `acsSupuesto`; sin SCOP_dhw no lo
suma y marca `acsSinScop` (la cifra es solo la calefacción y subirá). Sigue **elegible**. El texto
(`FM_ACS_QUE_HACER` en `res060fc.js`): «La Resolución pide que la aerotermia dé también el ACS (apartado
1 de la ficha). Añade el depósito de ACS al presupuesto para ir por esta vía», y a continuación la
cuenta («La cifra FM ya supone que se añade: D_ACS = 11 × 170 m² = 1.870 kWh/año, con SCOP_dhw 3,00») o
que no se ha podido sumar. Sale en la tarjeta «Vía FM», en el popup (fila «D_ACS, si se añade el ACS»,
«(supuesto)» en SCOP y d_ACS), en el tooltip de la columna, en el conmutador cuando no hay tarjeta
debajo (29.d) y en el párrafo de la propuesta (`lineaFactorCorreccion({ acs })` de `avisoFc.js`: «habría
que añadir a la instalación / al presupuesto el depósito de ACS: esa cifra ya lo tiene en cuenta»). La
caldera eléctrica sigue con su aviso, sin cambios. Pruebas: `test_res060fc.mjs` y
`test_via_fm_precio.mjs` (sección 5).

**REGLA — toda propuesta va ACOMPAÑADA del cálculo por la vía FM** (Fran, 08/11/2026, 26RES060_OP376: «a
partir de ahora las propuestas deben ir acompañadas del cálculo con FM»). El conmutador del aviso FM del
popup de envío (`includeFc` de `ProposalModal`) nace **encendido**: el mensaje lleva el párrafo de
`lineaFactorCorreccion` (bono vigente → bono por la vía FM, fechas, cupo) y el del consentimiento del IRPF.
Solo sale si `estadoFc` dice que procede (no sólido, no terciario, no solo reforma); quien envía puede
apagarlo en una propuesta concreta. Antes nacía apagado porque era un borrador en consulta pública. Y al
preparar una propuesta (alta, CEE de la simulación, aviso a Fran) se dan siempre las DOS cifras.

**REGLA — la comparativa se GUARDA en escalares al guardar la oportunidad**:
`datos_calculo.via_fm` (~300 B, `resumenViaFm`) = `{v, normativa, ficha, aplica, no_aplica?,
mwh_vigente, mwh_fm, eur_vigente, eur_fm, elegible, motivo?, acs?, n_avisos, dcal, calculado}`. `dcal` dice de
dónde sale la D_cal (`cee_final` / `cee_inicial` / `simulacion`); `aplica: false` es terciario (y,
hasta el 09/11/2026, solo reforma: desde la v3 una solo-reforma lleva la RES080_FM, ver «La RES080_FM en
la app»); `acs` (`supuesto` / `sin_scop`) es la simulación sin ACS. `VIA_FM_VERSION` = 2 desde
que el ACS se supone (07/11/2026): un `via_fm` v1 ya guardado solo se rehace volviendo a guardar la
oportunidad o con el relleno y `--forzar` (sin él, no pisa lo que ya hay). El listado la pide con `datos_calculo->via_fm` (regla 22: nunca el JSONB entero).

**REGLA — solo ADMIN** (regla 102): `via_fm` está en `SOLO_ADMIN_DEEP` de
[financialScrub.js](../../../implementation/backend/utils/financialScrub.js), así que a quien no es ADMIN
(partner, TRABAJADOR, certificador) se le quita en `GET /api/oportunidades`, en `GET /:id` y en lo que usa
el mismo scrub (expedientes, lotes). La columna y su filtro solo se pintan con `isAdmin`.

**La columna «Vía FM»** ([ViaFmCelda.jsx](../../../implementation/frontend/src/features/admin/components/ViaFmCelda.jsx)),
detrás de la de importes: MWh y € por la vía FM en violeta (el color del FM en la calculadora), con «≈»
si la D_cal es estimada (sin CEE); debajo, la diferencia con la vigente (verde si gana). No elegible:
tachado y chapa ámbar «No elegible», con el motivo en el tooltip. «no aplica» en cursiva; «—» sin calcular.
Sin ACS: chapa ámbar «Falta ACS» y su texto en el tooltip. Filtro: FM da más · Elegibles · Elegibles a
falta del ACS · No elegibles · Sin calcular. En el móvil, un chip («falta ACS» dentro).

**REGLA — la vía FM tiene SU precio CAE, como la opción RES080; sin teclear, el mismo que la
vigente** (Fran, 7/11/2026: «mismo precio para ambos, pero dar la posibilidad de elegir precio por
formato de ficha, igual que se hace ya en RES060 y RES080»). Casilla **«CAE RES060_FM (€/MWh)»** (o
RES09x_FM) en Datos Económicos, junto a la general y a la del RES080, **solo ADMIN** y solo cuando hay
cálculo FM. Es `inputs.caePriceClientFm`; `precioCaeFm(inputs)` cae al general, así que todo lo guardado
da las mismas cifras (el relleno, repetido con este código: 463 de 463 iguales). Se sella como
`cae_client_rate_fm` solo si difiere del general, con la misma condición que los otros dos
(`sellarPrecioCae`; ver [el precio CAE al cliente](precio-cae-al-cliente-100-mwh-y-solo-hacia-adelante.md)), y la comparativa FM del expediente lo lee
antes que el general. La calculadora hace `financialsRes060FC` con él (la comisión restada al cliente
se sigue restando); el relleno, sin rehacer la economía, desplaza el precio final guardado
(`precioFinalFm`). Si difiere, `via_fm` lo dice (`precio_fm`, `precio_vigente`) y el tooltip de la
columna también. El bono es lineal en MWh: `máx(0, MWh × precio × 1,21 si es empresa con IVA −
legalización)` (`bonoConKwh`), y cuadra con el guardado en 463 de 463.

**REGLA — quien no es ADMIN no ve el precio FM, no lo cambia y no estropea `via_fm`.** Las dos claves
están en `SOLO_ADMIN_DEEP` (y en `MONEY_KEYS_*` del certificador). Al guardar alguien que no es ADMIN,
[utils/viaFmAlGuardar.js](../../../implementation/backend/utils/viaFmAlGuardar.js) **restaura** el precio
FM de la BD y **rehace `via_fm` en el servidor** (`viaFmDesdeDatosCalculo`): su navegador lo calculó sin
ese precio. Pruebas: `node implementation/backend/scripts/test_via_fm_precio.mjs` y
`test_precio_cae_sello.mjs` (sección 10).

**REGLA — la vía se ELIGE con el conmutador «Vía de tramitación», que escribe `inputs.ruta_fm`, nunca
`via_fm`** (Fran, desde el principio: «la app deberá poder acogerse a este factor multiplicador si el
cliente cumple»). `via_fm` lo borra `financialScrub` a quien no es ADMIN (regla 200), y el conmutador es
del **equipo interno** (ADMIN y TRABAJADOR), sin importes: el € de cada vía sigue en la tarjeta «Vía FM»,
de ADMIN. Pieza: [ConmutadorViaFm.jsx](../../../implementation/frontend/src/features/calculator/components/ConmutadorViaFm.jsx),
encima de la tarjeta en `ResultsPanel`. Lo guarda **su propia ruta**, `POST /api/oportunidades/:id/ruta-fm`
(`staffOnly`, `{ activar }`), que **vuelve a calcular en el servidor** la elegibilidad sobre la simulación
GUARDADA (`viaFmDe` → `viaFmDesdeDatosCalculo`) y responde 409 si ya hay expediente, si no hay cálculo FM,
si no aplica o si no es elegible; escribe con la RPC `oportunidad_merge_inputs` y anota el historial.
**El guardado de la calculadora no la toca** (`conservarRutaFm` en `viaFmAlGuardar.js`: se queda la de
la BD, también para un navegador viejo sin la clave): sus dos escritores son esta ruta y `cambiarViaFm`
del expediente. Deshabilitado, y dice por qué: sin guardar, con cambios sin guardar, sin cálculo FM, no
elegible (el texto de lo que bloquea) o ya expediente («la vía se cambia en su pestaña «Vía FM»»).
Apagarla se puede siempre antes del expediente; si está encendida y la simulación deja de ser elegible,
aviso ámbar. Al aceptar, el popup dice el número de la serie FM (`26RES060FM_N`) que le dará
`createExpediente`. Pruebas: `test_via_fm_precio.mjs` (sección 6).

**Relleno de lo ya guardado**:
`node implementation/backend/scripts/backfill_via_fm.mjs` — EN SECO por defecto (`--solo ID`,
`--informe ruta.json`, `--precio-fm N` solo para mirar). Mide también los expedientes RES060/RES093 (solo
lectura). `--escribir` usa la RPC `oportunidades_set_via_fm`
([scripts/oportunidad_set_via_fm.sql](../../../implementation/backend/scripts/oportunidad_set_via_fm.sql)):
de una sentencia, **no mueve `updated_at`** (si no, 463 oportunidades saldrían como recién tocadas) y **no
pisa** un `via_fm` ya guardado salvo `--forzar`. **Aplicado el 09/11/2026** tras el deploy de 4a56e8de
(con `financialScrub` ya quitando `via_fm` a quien no es ADMIN; escrito antes, viajaría en el
`GET /api/oportunidades/:id` del partner, regla 102): primero la RPC (`oportunidad_set_via_fm.sql`, solo
`service_role`) y después `--escribir`, al mismo precio que la vigente («sí» de Fran del 7/11/2026). 428
oportunidades con `via_fm` v3 (32 RES080_FM), ninguna `updated_at` movida. Las altas desde WhatsApp (`computeFullCalculatorResult`) no generan `via_fm` hasta que se guardan
en la calculadora; el relleno las cubre. **Desde el 09/11/2026 también las de SOLO reforma (RES080_FM)**:
pide además `result.res080` y `result.financialsRes080` (sus campos sueltos, regla 22), la energía por
vectores y la demanda de refrigeración de los dos CEE y los kWh `efSimBC`/`efSimRest`. En seco ese día: 15
elegibles RES080_FM (1.075,0 → 1.231,7 MWh); 26RES080_OP89 sale 90,9 MWh / 9.088 €, lo mismo que la
calculadora.

### Lo medido (en seco, 07/11/2026, al mismo €/MWh, con el ACS supuesto)

**Oportunidades**: 609 leídas; FM calculado en **463** (69 sin datos para calcular, 70 no aplica:
terciario o solo reforma). **46 no elegibles** (41 sólido, 4 sin caldera, 1 solo ACS) y **347 elegibles**
(83 con CEE, 264 con la D_cal estimada): 345 ganan y 2 pierden.

| | Vigente | Vía FM |
|---|---|---|
| MWh/año (elegibles) | 12.932,7 | 25.144,0 |
| Bono | 1.293.283 € | 2.518.145 € (**+1.224.862 € neto**: +1.225.393 las que ganan, −531 las dos que pierden) |
| RES060_FM (328) | 12.051,3 MWh | 23.375,5 MWh |
| RES093_FM (19) | 881,5 MWh | 1.768,6 MWh |

- En captación viva (sin aceptar ni rechazar): 177 elegibles, 176 ganan, **+639.137 € neto**.
- **Sin ACS en la simulación: 120 de las 347 elegibles** (`changeAcs: false`, 9 de ellas RES093), todas
  con el ACS supuesto (ninguna sin SCOP_dhw: la app pone 3,0). Ganan **+436.581 €** por la vía FM, de los
  que **+49.640 € (495 MWh) son el ACS supuesto**; sin él eran +386.941 €. En captación viva, 71 con
  +290.205 €. Son las que hay que ofrecer con el depósito de ACS.
- Elegibles por estado: ACEPTADA 168 · ENVIADA 124 · PTE ENVIAR 39 · LEAD 14 · RECHAZADA 2.
- Lo nuestro elegible son **25,1 GWh/año** frente a un cupo de 1.287 GWh: el cupo no lo agotamos
  nosotros; lo agota el mercado.
- Las que más ganan: 26RES060_OP109 (RES093, 273,5 → 560,7 MWh, +40.200 €, sin ACS), OP265 (+26.474 €),
  OP319 (+23.366 €, sin CEE). **Pierden** OP330 (−471 €) y OP366 (−60 €): la D_cal de su CEE pasa de
  2 × la tabla UNI y el tope recorta.
- Borrador (FC) frente a lo publicado, sobre 223 oportunidades: 13.033,5 → 17.476,3 MWh.

**Expedientes RES060/RES093** (solo medido; el expediente es de otra sesión): 218 calculados, 59 sin CEE.
**131 elegibles, todos ganan: +472.930 €** (5.998,7 → 10.762,8 MWh; de todos los calculados, 10.647,5 →
19.132,3). No elegibles: 32 ya presentados, 29 empezados antes del 22/03/2026, 26 de sólido. De los
131: 35 en un lote o en verificación (+142.216 €), 33 con fecha de inicio (+123.484 €) y 63 aún sin
fechas de obra (+207.230 €). La D_cal sale del CEE final en 68 y del inicial en 63. El que más:
26RES060_215, +27.296 €.

## La RES080_FM en la app (09/11/2026)

**Fuente única del cálculo**: `calculateRes080FM` en
[res080fm.js](../../../implementation/frontend/src/features/calculator/logic/res080fm.js). Parte del
RES080 vigente ya calculado (`totalEnergiaInicialAno` = EF_i, `totalEnergiaFinalAno` = EF_f) y aplica la
fórmula **literal** de la pág. 22: `AE = (EF_i − EF_f) · (f_M·EF_simBC + EF_simRest) / (EF_simBC +
EF_simRest)`, con f_M 2 / 2,5 / 3 (`tipologiaFM` de `res060fc.js`, el mismo criterio). Devuelve lo mismo
que la RES060_FM (`cae`, `ficha: 'RES080_FM'`, `avisos` bloquea/aviso/info, `elegible`), así que el
Económico, el panel «Vía FM» y el Convenio FM del expediente lo usan en el mismo hueco (`res060fc`).
Pruebas: `node implementation/backend/scripts/test_res080fm.mjs` (37 comprobaciones, con el ejemplo de la
FAQ: 25.577 kWh literal, 31.667 ponderando con ahorros).

**REGLA — los dos CEE SIMULADOS mandan; sin ellos la cifra es «≈» y lo dice.** Precedencia de cada
uno: su CEE (energía final sin FV × S), después los kWh/año tecleados (`inputs.efSimBC` / `efSimRest` en la
calculadora, `documentacion.via_fm.ef_sim_bc` / `ef_sim_rest` en el expediente, saneados en
`sanearDatosFm`) y, si no, una **estimación** por uso desde el previo y el posterior: calefacción y
refrigeración, BC = E_f·D_i/D_f y Rest = E_i·D_f/D_i; ACS, BC = E_f,acs y Rest = E_i,acs. El cociente solo
depende de la razón EF_simBC/EF_simRest. Aviso «Faltan los CEE simulados» con los que faltan (doc. 11
EF_simBC, doc. 10 EF_simRest).

**REGLA — bloquea lo que la ficha excluye**: la demanda de calefacción no baja (sin envolvente va por la
RES060_FM), el posterior sigue con caldera o el previo ya era eléctrico, combustible SÓLIDO (siempre por
la vigente, como en la RES060_FM), sin caldera, ya presentado, obra antes del 22/03/2026, factura desde el
01/12/2027 (CC. PP. 01/01/2028) o fuera de plazo. Sin vectores en el XML el cambio de generador no se
puede comprobar: aviso, no bloqueo.

**Precio**: el de la opción RES080 (`caePriceClientRes080` / `cae_client_rate_res080` sellado), no el
`cae_client_rate_fm`.

**Dónde sale**: tarjeta «Vía FM · RES080_FM» de la calculadora (solo ADMIN,
[Res080FmCard.jsx](../../../implementation/frontend/src/features/calculator/components/Res080FmCard.jsx),
con los dos kWh tecleables) y chips «FM ≈…» bajo Bono/Ahorro Reforma; popup de desglose
(`Res060FCModal` con `ficha: 'RES080_FM'`); pestaña Económico y panel «Vía FM» del expediente RES080
(con los dos kWh); columna «Vía FM» de Oportunidades cuando la oportunidad es **solo de rehabilitación**
(`comparativaReforma === false`): `resumenViaFm` da `ficha: 'RES080_FM'` y `estimada` («≈»).
`VIA_FM_VERSION` = 3. Con comparativa RES060/RES080 la columna sigue enseñando la RES060_FM. El
conmutador «Vía de tramitación» también vale para la solo-reforma, y al aceptar numera `26RES080FM_N`.

**Los CEE simulados, ¿los puede hacer la app?** Sí, con piezas que ya existen, pero sin un comando
único (09/11/2026, solo mirado): **EF_simRest** es la «base» del final RES080 (skill
`generar-cee-final`, paso 1 de 26RES080_83: el inicial con la envolvente nueva y los generales del
previsto) **calificada antes** de cambiar las instalaciones; **EF_simBC** es el camino del final RES060
(`ceeFinalCopiando.js`: el inicial con solo las instalaciones cambiadas), **sin** la medida de
autoconsumo. Los dos en CE3X 3.2, como el previo y el posterior («misma herramienta»), y sin FV.

### Lo medido (en seco, 09/11/2026, expedientes RES080 con los dos CEE)

`node implementation/backend/scripts/seco_res080fm.mjs` (solo lee). **39 elegibles con cifra**, todas
estimadas (ningún expediente tiene aún CEE simulados) y todas sin finalizar: **3.042,0 → 3.444,8 MWh** y
**252.709 → 285.973 € (+33.264 €)**, con cocientes de 1,07 a 1,29 (lejos del f_M: la fórmula literal
pondera con consumos). No elegibles: 17 ya presentados, **6 empezados antes del 22/03/2026** (entre ellos
26RES080_54 y 25RES080_28), 4 sin caldera (26RES080_101, _43, _51, _67), 2 de sólido (_49, _78) y 1 cuya
demanda no baja (26RES080_90). Ejemplos: 26RES080_50 61,6 → ≈79,3 MWh (6.160 → 7.933 €), 26RES080_85 87,2
→ ≈104,2 MWh (8.720 → 10.418 €), 26RES080_57 198,4 → ≈226,0 MWh (11.905 → 13.560 €), 26RES080_72 (piso,
f_M 2,5) 55,3 → ≈66,0 MWh.

⚠️ Una primera pasada daba 45 elegibles: el script leía las fechas de `calcCifo` con otras claves
(`fecha_inicio` en vez de `inicio`) y no aplicaba el plazo. Lo cazó la pestaña Económico de 26RES080_54
en el navegador, que ya decía «no elegible: empezó el 21/07/2025».

**Hallazgo para Fran**: en 36 de los 39, `(EF_simRest − EF_f)·f_M` (una RES060_FM sobre la envolvente
nueva, solo indicativo) sale por encima de la RES080_FM literal: 4.663 frente a 3.445 MWh. Si una obra de
reforma puede pedir por la RES060_FM está **sin decidir**: no se promete nada a ningún cliente.

### Pendiente (dudas abiertas en la app)

- **ACS en el mensaje de la propuesta**: `lineaFactorCorreccion` ya acepta `acs` y `estadoFc` lo
  devuelve, pero la llamada de `ProposalModal.jsx` (de la sesión del expediente) aún no lo pasa
  (`acs: fcInfo.acs`); hasta entonces el párrafo del mensaje no dice lo del depósito. El aviso del popup
  de envío sí lo dice.
- Eléctrica: aviso «pendiente de consulta» (FAQ 3).
- No se detecta la comunidad de propietarios (fechas de CC. PP.); la geotermia no se toma del equipo
  (columna nueva del C_b); el consumidor vulnerable (×1,5) no se pregunta.
- La D_cal «del CEE posterior» es la de nuestro CEE final, que copia la del inicial (FAQ: vale).
