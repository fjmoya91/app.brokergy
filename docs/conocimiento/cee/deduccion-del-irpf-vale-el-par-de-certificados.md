<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Deducción del IRPF — ¿vale el par de certificados? (2026-08-27)

Recuadro en el módulo CEE, debajo de la rejilla, **solo cuando el expediente tiene
las DOS fases** (en un CEE directo de alcance ÚNICO no se pinta: sin el CEE de
después no hay nada que comparar). Sale en los dos negocios: CAE y CEE directos.

Lo que exige la norma (DA 50ª de la Ley del IRPF, RDL 19/2021) para la deducción
de la vivienda: reducir el **consumo de energía primaria no renovable** al menos un
**30 %**, **o** llegar a **letra A o B** en la escala de ESE indicador. Basta una.
Fuente única: [logic/irpfEpnr.js](implementation/frontend/src/features/expedientes/logic/irpfEpnr.js).

**REGLA — la letra que cuenta es la del CONSUMO, no la de EMISIONES.** El
certificado trae las dos y a menudo no coinciden: medido en `25RES060_71`, el CEE
final es **B en emisiones y C en consumo**. Mirar la de emisiones daría por bueno
un expediente que no cumple.

**REGLA — `<EnergiaPrimariaNoRenovable>` aparece DOS veces en el XML.** Dentro de
`<Consumo>` es el número (kWh/m²·año); dentro de `<Calificacion>`, la letra y su
`<EscalaGlobal>`. Un `getElementsByTagName` sobre el documento devuelve las dos y
se cogería la que caiga primero: hay que acotar por el padre. Y la letra es hija
DIRECTA — con `getElementsByTagName('Global')` se cogería el `<Global>` numérico
de dentro de `<EscalaGlobal>`.

**REGLA — el `.xml` GUARDADO en BD no lo puede releer `parseCeeXml`.** El
`normalizeData` del backend deja `cee.xml_inicial`/`xml_final` **enteros en
MAYÚSCULAS**, y ahí `parseCeeXml` falla por dos motivos: busca los tags con
mayúsculas exactas (`<Demanda>` ≠ `<DEMANDA>`) y, antes de eso, `DOMParser`
rechaza el documento COMPLETO porque `<?XML VERSION="1.0"?>` no es un prólogo
válido. Por eso existe **`parseEpnrFromXml`**, que quita la declaración, busca sin
distinguir mayúsculas y **nunca lanza**. No se tocó `parseCeeXml` —del que
dependen la calculadora, el CIFO y el RES080— por un dato nuevo.

Sin ese rescate la comprobación solo valdría para lo que se suba a partir de hoy:
los certificados ya subidos tienen en `cee_inicial`/`cee_final` un objeto parseado
**sin** este dato. Con él funciona sobre los **59 pares** que ya hay en producción
(58 cumplen; `26RES060_134` no, porque tiene el MISMO xml en las dos fases).

**REGLA — esto INFORMA, no decide.** Que el certificado cumpla el requisito
técnico no es que al cliente le corresponda la deducción: hay plazos de expedición,
base máxima anual y la situación de cada declaración. El texto habla del
certificado ("el ahorro certificado es del 41,6 %"). **Al cliente le llega por la
GUÍA de la Renta** (ver "La GUÍA de la deducción del IRPF"), que habla de lo que
acreditan los certificados y de cómo se rellena la declaración, con una estimación
marcada como tal y el aviso de que depende de su situación fiscal — nunca afirma
que tenga derecho a un importe (decisión del usuario, 2026-10-01).

Se avisa además si las **superficies de los dos certificados no casan** (>2 %):
el indicador es por m², así que si una está mal el porcentaje compara dos edificios
distintos. Medido en `26RES060_153`: 91 m² frente a 123 m². Y si el de antes es
POSTERIOR al de después (están intercambiados).

### El PDF también lo trae, y el lector ya lo saca (2026-10-01)

El consumo GLOBAL de energía primaria no renovable y su letra van impresos en la
primera página del certificado ("CALIFICACIÓN ENERGÉTICA OBTENIDA") y en el apartado 2
del Anexo II. `ceeOcrService` los lee ya (`energia_primaria_no_renovable`), y
`ceeToXmlShape` los deja en los MISMOS campos que `parseCeeXml` (`epnrConsumo`,
`epnrLetra`): un CEE cargado por PDF sirve para la comprobación igual que uno con su
`.xml`. Medido sobre un escaneo de otro técnico (281,7 E) y sobre un CEE nuestro
(151,3 D): los dos correctos, ~4 s. La ESCALA (umbrales A…F) solo la da exacta el `.xml`.

### Un CEE directo de UN solo certificado: el CEE ANTERIOR del cliente

El caso: el cliente hizo la obra y ya tenía un CEE de ANTES, de otro técnico; a
nosotros solo nos contratan el de después y hay que saber si el par vale para la
deducción. En la caja «Cargar CEE por fichero» de un encargo de alcance ÚNICO hay dos
botones: **«CEE de este encargo»** y **«CEE anterior del cliente»**. El segundo guarda
en `cee.cee_anterior` (forma de `ceeToXmlShape` + `_origen`, `_fichero`,
`_cargado_at`) y debajo sale [CeeAnteriorCliente](implementation/frontend/src/features/expedientes/components/CeeAnteriorCliente.jsx)
con la comparación —el mismo `AvisoIrpfEpnr`, con su prop `comparar` y sus rótulos—.

**REGLA — ese certificado NO es una fase.** En un encargo ÚNICO la fase que el módulo
llama "inicial" es el NUESTRO; cargar ahí el de antes del cliente pisaba sus datos sin
decir nada. Medido en **2026CEE_60** (01/10/2026): la demanda pasó de 180,37 a 127,8 y
las fechas del 29/09 al 29/06, las del certificado del otro técnico (reparado desde su
`.xml`). Por eso el botón del CEE propio **pregunta** si ya hay `.xml` subido.

**REGLA — solo se pinta si se ha cargado**: la mayoría de estos encargos son
compraventas y alquileres, donde no hay un antes que comparar.

✅ 2026CEE_60 REPARADO el 01/10/2026: la "reparación" de arriba no había llegado al
objeto guardado — `cee_inicial` seguía siendo el CEE del otro técnico leído por OCR
(`_fileName: "OCR (IA)"`: demanda 127,8, 120,36 m², ACS 0, fechas 29/06). Se rehízo
entero desde su propio `.xml` (`parseCeeXml`, como al subirlo en la rejilla: 180,37 ·
130 m² · ACS 17 · 151,34 D · 29/09/2026) junto a `fecha_firma/visita_cee_inicial` y
los combustibles, con nota en el historial. `cee_anterior` (el del otro técnico) no se
tocó.
