# Fichas con FACTOR DE CORRECCIÓN: RES060FC y las de hibridación por zona (2026-10-21)

El borrador de Resolución de la DGPLACE (consulta pública, 2026) multiplica el ahorro de cambiar una
caldera por una bomba de calor: f_C **2** en unifamiliar, **2,5** en piso (2 en el cuerpo de la
Resolución) y **3** en bloque. El documento entero son 173 páginas (en el Drive, «01. RD 36-2023
(CAES) / 00. NORMATIVA / 00. NORMATIVA NACIONAL / 03. CONSULTAS PÚBLICAS / Propuesta de Resolución
DGPLACE BOBMAS DE CALOR.pdf»; el de julio es idéntico) y trae la **RES060FC**, la RES062FC (paso de
calderas individuales a una bomba centralizada) y la familia **RES090FC…RES099FC** de hibridación.

La app enseña la cifra, solo al ADMIN, en la calculadora (tarjeta violeta y chips «FC» de la barra
fija), en el resumen económico del expediente y, si se marca, en el mensaje de la propuesta
([avisoFc.js](../../../implementation/frontend/src/features/calculator/logic/avisoFc.js)). Fuente única
del cálculo: [res060fc.js](../../../implementation/frontend/src/features/calculator/logic/res060fc.js).
Revisión pedida por Fran el 21/10/2026 con una captura en la que el FC de una casa de Cuenca de 1930 salía
en 359 MWh.

## Las fórmulas

- **RES060FC** (sustitución): `AE = mín(AES ; 0,70·CEF) · f_C`, con
  `AES = (D_CAL·S)·(1/η − 1/SCOP) + D_ACS·(1/η − 1/SCOP_dhw)`.
- **RES090FC…RES094FC** (hibridación en paralelo, A3-A4 · B3-B4 · C1-C4 · D1-D3 · E1):
  `AE = mín(AES ; 0,70·CEF_calefacción) · f_C`, con el AES ponderado por el C_b en la calefacción y en
  el ACS. Los modos alternativos (RES095FC…RES098FC) y la RES062FC no se calculan.
- D_CAL es la del **Anexo IV** (provincia + año de construcción + tipología), no la del CEE: es el
  cambio de la ficha nueva.

**REGLA — el f_C se aplica UNA vez.** La RES060FC escribe además un «· f_C» al final de su AES, con lo que
el ACS saldría multiplicado por f_C². Las otras once fichas del MISMO borrador lo aplican una sola vez
sobre el mínimo: es una errata. Hasta este día la app respetaba el literal. Medido en 73 RES060 con el
XML del CEE: 4.534 MWh con el doble f_C frente a 4.132 con uno, y en **14** cambiaba cuál de las dos
fichas convenía.

**REGLA — en una HIBRIDACIÓN la ficha es la de SU zona, con SU tabla de C_b.** La RES060FC exige retirar
la caldera o dejarla en preinstalación sin hibridar, así que no vale para un RES093. Antes se calculaba
la RES060FC sin C_b, y el FC de una hibridación salía como si la bomba lo cubriera todo. Cada zona
tiene su Anexo V: la de D1-D3 coincide con la `BIVALENCE_TABLE` de la ficha vigente, salvo el tramo del
95 al 100 %, que ahora sube hasta 1. En A, B y C el C_b empieza a contar desde el 10 %; en D y E, desde
el 15 %. Entre puntos se interpola y se redondea a tres decimales, como pide la ficha. El tope es el CEF
de **calefacción**.

**REGLA — el CEF es el del CEE INICIAL.** Es su consumo de energía final: Σ `<EnergiaFinalVectores>` ×
superficie (`cefDelCee`). Antes se estimaba con la demanda de la app ÷ η de la tabla, y se quedaba
corto: CE3X declara las calderas viejas al 25-69 %, y en 80 expedientes el CEF real salió de mediana
**1,45 veces** el estimado (solo 2 por debajo). Sin CEE se sigue estimando, y si es ese tope el que
corta la cifra, se avisa de que puede subir. Con el CEE cargado, el tope casi nunca manda. En la
captura de Cuenca, el tope estimado dejaba el FC en 358 MWh; con un CEE de 420 kWh/m² serían 459.

**REGLA — piso y bloque van por las plantas del EDIFICIO.** El Anexo IV tiene una tabla para edificios
de 1-3 plantas y otra para los de 4 o más, que da hasta un 28 % menos. La app no sabía cuántas tenía el
edificio, así que se pregunta en la tarjeta (`inputs.fcPlantasEdificio`: `'1-3'` | `'4+'`, viaja con la
oportunidad y la lee el expediente). Sin el dato se usa la de 1-3 plantas y se avisa con la cifra de la
otra. El bloque (`tipoInmueble: 'bloque'`) lleva f_C 3, aunque su `tipo` diga piso. El tipo se compara
en minúsculas: `normalizeData` guarda `'PISO'`, y así un piso cobraba como unifamiliar.

**REGLA — la provincia vale por código o por NOMBRE, y el año que falta se dice.** 68 oportunidades
guardan la provincia escrita («CIUDAD REAL»), y con solo el código se quedaban sin cifra. 141 no tienen
año: se toma el tramo 1981-2007 y se avisa, porque cambiar de tramo mueve mucho la demanda.

- η: la del cálculo vigente, salvo las dos filas de gas de condensación. El Anexo II del borrador da
  83 % antes de 1998 y 85 % desde 1998 con encendido automático; la tabla de la ficha vigente, al revés
  (85/83).

**REGLA — la cifra del FC no se enseña sin sus avisos.** El motor devuelve `avisos` y `elegible`, y
cada aviso tiene uno de tres tonos:
- **bloquea** (no se puede pedir):
  - no hay caldera que sustituir;
  - el expediente ya se ha subido a MITECO con la ficha vigente (de `SUBIDO A MITECO` en adelante). La
    Resolución dice que lo resuelto desde el RDL 7/2026 no puede volver a pedir el FC;
  - la obra empezó antes del 22/03/2026 (`calcCifo`), o hay facturas posteriores al 30/11/2027;
  - en zona D o E, el CEE final tiene una F o una G (solo en la RES060FC).
- **aviso** (la cifra puede ser otra):
  - el expediente está en un lote o en el verificador (si se sube a MITECO antes de 2027, se pierde el FC);
  - falta el año o faltan las plantas del edificio;
  - el CEF es estimado y es el que corta la cifra;
  - faltan las potencias o la zona de la hibridación;
  - la caldera es de biomasa o eléctrica: la Resolución habla de combustible fósil y la ficha, de
    «combustión o eléctrica».
- **info**: la letra que se exigirá, el f_C del piso, los plazos y el cupo (se presenta del 02/01/2027
  al 01/01/2028, con el 10 % de las obligaciones de 2027 repartido por orden de resolución) y los
  requisitos. Los requisitos son: inercia de 15 L por kW, mantenimiento de 2 años, certificado de baja
  tensión, vivienda habitual (facturas del 1/11 al 31/3 del invierno anterior con más de 75 kWh/mes) y
  consentimiento informado del IRPF.

La tarjeta y el popup lo enseñan. El resumen del expediente pone la ficha en rojo con el motivo, y el
aviso de la propuesta no anuncia un FC que no se puede pedir.

**REGLA — manda la FILA DE CALDERA, no el desplegable de tipo.** 24 oportunidades dicen «No tiene
Calefacción» en el tipo con una caldera de gasóleo o de gas elegida en el rendimiento. Leído a pelo, el
FC las daba a todas por no elegibles (`contextoCalderaFc`).

## Lo medido (21/10/2026, 182 expedientes RES060/RES093 con CEE inicial)

- 81 tienen el CEF del certificado.
- **69 no son elegibles**: 35 empezaron la obra antes del 22/03/2026, 33 ya están en MITECO y 1 tiene
  una G en el CEE final.
- De los elegibles, **56** ganan con el FC: de 2.805 a 3.590 MWh en total. Las mayores subidas son las
  de las casas anteriores a 1980: 26RES060_178 pasa de 93 a 144 MWh y 26RES060_176, de 103 a 150.
- Las 13 hibridaciones son todas de la zona D (RES093FC).

## Lo que queda fuera

- La D_ACS del Anexo III del borrador (mes a mes, con el agua fría de la capital y 60 °C): se usa la de
  la app.
- El SCOP de ACS «siempre en clima cálido» del Anexo I: se usa el de la app.
- El consumidor vulnerable severo (×1,5, fichas -S): el motor lo admite (`vulnerable`), pero ninguna
  pantalla lo pregunta.
- La RES062FC y los modos alternativos.

Tras tocarlo: `node implementation/backend/scripts/test_res060fc.mjs`.
