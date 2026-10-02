# El criterio, para aplicarlo sin el comprobador

Todo lo de aquí está MEDIDO sobre los 462 certificados reales de `data/real_cases_xml`. Cuando se
pueda ejecutar `scripts/revisar_cee.js`, se ejecuta: esto es el respaldo para cuando no se puede
ejecutar (Cowork sin Desktop Commander, o con el PC apagado — ver `comun/entorno.md`), y entonces **hay que decir en el informe que se ha revisado sin el comprobador**.

---

## Dónde vive cada dato en el `.xml`

```xml
<InstalacionesTermicas>
  <GeneradoresDeCalefaccion>
    <Generador>
      <Nombre>CALDERA LAURA 30/30F</Nombre>      ← el equipo, con su nombre
      <Tipo>Caldera Estándar</Tipo>              ← qué es (enum cerrado, abajo)
      <VectorEnergetico>GasNatural</VectorEnergetico>   ← el combustible
      <PotenciaNominal>31.50</PotenciaNominal>
      <RendimientoEstacional>0.67</RendimientoEstacional>  ← fracción: 0,67 = 67 %
      <RendimientoNominal>99999999.99</RendimientoNominal> ← ⚠️ "no consta"
      <ModoDeObtencion>Estimado</ModoDeObtencion>
    </Generador>
  </GeneradoresDeCalefaccion>
  <InstalacionesACS><Instalacion>…</Instalacion></InstalacionesACS>
  <GeneradoresDeRefrigeracion>…</GeneradoresDeRefrigeracion>   ← solo en 240 de 462
</InstalacionesTermicas>
```

Lo demás: `<IdentificacionEdificio>` (ref. catastral, zona climática, normativa, año),
`<DatosGeneralesyGeometria><SuperficieHabitable>`, `<Demanda><EdificioObjeto><Calefaccion>`,
`<Calificacion>` (ahí `<Global>` es una LETRA; fuera de ese bloque es un número),
`<CerramientosOpacos>` y los `<Elemento>` con `<Tipo>Hueco</Tipo>`.

**⚠️ `99999999.99` significa «no consta»**, no un valor. Sale en casi todos los
`<RendimientoNominal>` y en `<NumeroDePlantasSobreRasante>`.

**⚠️ Varios ficheros DECLARAN `encoding="UTF-8"` y están en ISO-8859-1.** Leídos como UTF-8, «Caldera
Estándar» sale con un carácter roto y deja de casar con el enum.

### El `.xml` de CE3X 3.1 (desde el 01/10/2026) es OTRO esquema

Lo de arriba es el esquema **v2.0** (CE3X 2.3). CE3X 3.1 escribe el **v3.0**
(`<DatosEnergeticosDelEdificio version="3.0">`): el mismo certificado con otras etiquetas. El
comprobador lee los dos y devuelve lo mismo (`services/cee/xmlCeeV30.js`); a mano, esto:

| Dato | v2.0 (CE3X 2.3) | v3.0 (CE3X 3.1) |
|---|---|---|
| Edificio (dirección, municipio, zona…) | `<IdentificacionEdificio>` | `<DatosEdificio>` |
| Referencia catastral | `<ReferenciaCatastral>` | `<ReferenciasCatastrales><Ref><Parcela>` + `<Inmueble>` (14 + 6) |
| Superficie útil | `<SuperficieHabitable>` | `<DatosEdificio><SuperficieUtil>` |
| Fecha del certificado | `<DatosDelCertificador><Fecha>` | `<DatosCertificado><FechaCalificacion>` (d/m/aaaa) |
| Visita | `<FechaVisita>` | `<InspeccionesObservaciones><Visita><Fecha>` — puede haber varias: la primera |
| Certificador | `<NIF>`, `<NIFEntidad>`, `<NombreyApellidos>` | `<DatosCertificador>`: `<Nif>`, `<NifEntidad>`, `<NombreApellidos>` |
| Demanda | `<Demanda><EdificioObjeto><Calefaccion>`/`<ACS>`/`<Refrigeracion>` | `<Indicadores><Demanda><Cal>`/`<Acs>`/`<Ref>` (no trae el total: es la suma) |
| Energía primaria no renovable y su letra | `<Consumo>…<Global>` y `<Calificacion>…<Global>` | `<Indicadores><EnergiaPrimariaNoRenovable><Tot>` y `<Calificacion><EnergiaPrimariaNoRenovable><Tot>` |
| Generadores | `<InstalacionesTermicas>` por servicio | `<Modelo><Sistemas><Generador>` con su `<Servicio>` (CAL · ACS · REF) |
| Cerramientos y huecos | `<CerramientosOpacos>`, `<Elemento>` con `<Tipo>Hueco</Tipo>` | `<Modelo><Opacos><Opaco>` y `<Modelo><Huecos><Hueco>` |

Y lo que cambia de significado, que es donde uno se equivoca:

- **Un `<Generador>` con `<EsFicticio/>` NO existe**: es el de sustitución que pone CE3X cuando la
  vivienda no tiene ese servicio (lo normal: una refrigeración que no hay). No se cuenta.
- **El `<Tipo>` del generador es otro enum**: «Caldera Estándar» → `CalderaConvencional`, «Bomba de
  Calor» → `ExpansionDirectaAireAgua`, «Efecto Joule» → `CalderaElectrica`. El vector va en
  mayúsculas: `GASOLEO`, `GASNATURAL`, `ELECTRICIDAD` (sin peninsular/insular). `MEDIOAMBIENTE` es lo
  que capta una bomba de calor, no un combustible.
- **La superficie de un opaco es NETA** (sin sus huecos); la del v2.0 era BRUTA. Para comparar, súmale
  la de sus huecos.
- **Los huecos se llaman con un «-» al final** («V1-» es la «V1» del v2.0) y la orientación va en código
  (N, S, E, W, NE, NW, SE, SW, H).
- **El MODO de obtención casi no está**: el v3.0 solo marca lo que va POR DEFECTO
  (`<PorDefecto>Transmitancia</PorDefecto>`). Lo demás puede ser Estimado o Conocido y el fichero no
  lo distingue: el punto de las transmitancias justificadas no se puede afirmar solo con el `.xml`.
- **La acumulación de ACS SÍ viene** (`<Sistemas><Acumulador>`, volumen en m³).
- **Las placas en la 3.1 pueden ir como «generador eléctrico»** (`<GeneradorElectrico>`, con la
  potencia) en vez de como contribución anual. Si el técnico las vuelve a meter así, la energía
  primaria y las emisiones eléctricas cambian respecto a la 2.3 **aunque la obra sea la misma**: no
  es el motor, es cómo se han declarado. El mismo `.cex` abierto en la 3.1 sin tocarlo da las
  mismas cifras.

---

## Los enums (contados sobre los 462)

`<Tipo>` de generador, y si quema combustible:

| `<Tipo>` | ¿combustión? | veces |
|---|---|---|
| `Caldera Estándar` | **sí** | 394 |
| `Caldera Condensación` | **sí** | 31 |
| `Bomba de Calor - Caudal Ref. Variable` | no | 769 |
| `Bomba de Calor` | no | 101 |
| `Efecto Joule` | no (resistencia eléctrica) | 121 |
| `Maquina frigorífica` / `… - Caudal Ref. Variable` | no (es frío) | 79 |
| `Bomba de varias velocidades` · `Bomba de caudal constante` · `Ventilador de caudal constante` | no (son auxiliares) | 34 |

`<VectorEnergetico>` → el combustible:

| XML | expediente | veces |
|---|---|---|
| `ElectricidadPeninsular` | electricidad | 1077 |
| `GasoleoC` | gasóleo | 243 |
| `GasNatural` | gas natural | 116 |
| `Carbon` | carbón | 24 |
| `GLP` | GLP | 18 |
| `BiomasaPellet` | pellets | 17 |

⚠️ En `<EnergiaFinalVectores>` la misma biomasa se escribe **`BiomasaPellet`** y en
`<VectorEnergetico>` a veces **`BiomasaPellete`** (con -e). Son el mismo combustible.

`<Tipo>` de cerramiento opaco: `Fachada` (3542) · `Adiabatico` (542) · `Cubierta` (533) ·
`ParticionInteriorVertical` (496) · `Suelo` (412) · `ParticionInteriorHorizontal` (283) ·
`Lucernario` (85).

---

## Los puntos, uno a uno

### 1. El equipo que se sustituye está en el CEE inicial
`<GeneradoresDeCalefaccion>` tiene que declarar la caldera que dice el expediente
(`instalacion.caldera_antigua_cal.rendimiento_id`). **Si no hay ninguno → NO APTO**, salvo que el
expediente declare `rendimiento_id: 'sin_calefaccion'` — es una vivienda sin calefacción, y 3 de los
462 certificados son justo eso y son válidos.

### 2. Es de combustión
Solo en **RES060 · RES093 · TER100 · TER173** (las que sustituyen caldera). Si el `<Tipo>` del CEE
inicial es una bomba de calor, **ese certificado describe la vivienda DESPUÉS de la obra**: el ahorro
se estaría calculando contra un estado de partida que no existió, y es lo primero que cruza un
verificador. → **NO APTO**. En **RES080** no aplica: allí se rehabilita la envolvente.

### 3. El combustible
`<VectorEnergetico>` vs. lo que declara el expediente. La fila de rendimiento lleva la familia en su
id: `gas_*` → gas natural (o GLP si `inputs.fuelType === 'glp'`), `oil_*` → gasóleo, `solid_*` →
carbón o pellets según `inputs.fuelType`, `electric` → electricidad. Si no casa → **NO APTO**: de ahí
salen el rendimiento de la tabla y el ahorro que se le prometió al cliente.

### 4. El rendimiento — SOLO INFORMA
`<RendimientoEstacional>` es el **estacional** (56,8 %) y la casilla del Anexo VIII del expediente es
otra cosa (79 %): comparados, saltaba un aviso en 97 de 116 certificados aprobados. Decisión de Fran
(29/09/2026): **se enseña, no se juzga**. El CIFO recalcula con la casilla del expediente. En el
`.cex` se ve además CÓMO lo estima el certificador: rendimiento de combustión, aislamiento, potencia.

### 5. El ACS
- `cambio_acs !== false` → `<InstalacionesACS>` tiene que estar descrito. Si no está → **NO APTO**.
- `misma_caldera_acs === true` → el aparato de ACS debe ser el MISMO (mismo `<Nombre>` y `<Tipo>`) que
  el de calefacción. Si es otro → **aviso**: una de las dos cosas está mal.
- Fuera de alcance → solo se mira que el certificado no lo contradiga.

### 6. La acumulación de ACS — solo en el `.cex`
Buscado en los 462: el único nodo del `.xml` con «volumen» es `<VolumenEspacioHabitable>`. El depósito
está en el `.cex` (bloque [8] del equipo que da ACS: `[True, litros, t_alta, t_baja, UA, …]`). Sin
`.cex` sale como no comprobable; con él, se enseña.

### 7. Demanda y superficie
`<Demanda><EdificioObjeto><Calefaccion>` y `<SuperficieHabitable>` contra lo que simuló la
oportunidad (`result.q_net` y `result.superficieAplicada`). **Holgura del 2 %** — por debajo son
redondeos del `.cex`. Si la demanda o la superficie certificadas quedan **por debajo** de las
simuladas: **hasta un 10 % por debajo → aviso; más de un 10 % → NO APTO** (Fran, 29/09/2026: había
aprobado 13 entre −4 % y −24 %). Sobre esas cifras se le prometió el bono al cliente.

⚠️ **En el CEE FINAL de un RES080 el criterio se INVIERTE**: allí la demanda TIENE que bajar, porque
el ahorro de la ficha es la diferencia entre el antes y el después. Una demanda que no baja es la
señal de que el certificado no recoge la mejora.

### 8. La vivienda
`<ReferenciaCatastral>`: se comparan los **14 primeros** caracteres (la finca). Los 20 llevan además
el cargo del inmueble, y otro cargo de la misma finca no es otra vivienda. Si difiere → **NO APTO**.
`<ZonaClimatica>` → **aviso**: de ella salen las transmitancias de referencia y el factor de
corrección.

### 9. RES080 — qué elementos se sustituyen
**NO se lee del texto de la medida de mejora.** Su `<Nombre>` es texto libre: en el corpus dice cosas
como «CEE FINAL.cex», «MAE 1» o «PLACAS SOLARES». Lo que prueba qué cambia es comparar los **dos
certificados** cerramiento a cerramiento, casándolos por `<Nombre>`: el que se sustituye es el que
**baja de transmitancia** (más de un 2 %).

Después se cruza con lo que declara la pestaña Envolvente (`documentacion.envolvente`):
`sustituye_ventanas` · `aislamiento_cubierta` · `aislamiento_muros` · `aislamiento_suelo`.

- El expediente declara algo que el certificado no recoge → **NO APTO**.
- El certificado mejora algo que el expediente no declara → **aviso**: revisar la pestaña Envolvente.
- Nada cambia entre los dos → **NO APTO**: un RES080 sin mejora de envolvente no tiene ahorro que
  justificar.
- **Con un solo `.xml` no se afirma nada** sobre este punto.

### 10. Las transmitancias, IGUALES A LA GUÍA

Criterio de Fran (29/09/2026): las U de **fachadas al aire, cubiertas y suelos declarados
«Conocidas»** tienen que ser las de la **Guía de Transmitancias de BROKERGY** para el año y la zona
del certificado (`getUByYear`, la MISMA con la que se calculó la propuesta), con **±2 %**:

| Año | Muro | Cubierta | Suelo |
|---|---|---|---|
| antes de 1960 | 2,20 | 2,50 | 1,25 |
| 1960-1978 | 1,90 | 2,10 | 1,10 |
| 1979-1990 | 1,80 | 1,90 | 1,05 |
| 1991-2007 | 1,69 | 1,69 | 1,00 |
| 2008-2013 | U_max del CTE 2006 por zona | | |
| 2014-2019 | 0,35 | 0,25 | 0,35 |
| desde 2020 | 0,27 | 0,22 | 0,30 |

- Distinta → **aviso**, no fallo, con la U de la guía al lado.
- **Solo en certificados emitidos desde el 01/04/2026**, que es cuando se empezó a exigir la guía.
  Antes, solo se informa. Medido: de 142 aprobados, 55 la cumplen entera, y casi ninguno de 2025.
- **NO cuentan**: el suelo contra el terreno «Por defecto» (su U la calcula CE3X con el perímetro),
  las medianeras (adiabáticas) y los puentes térmicos.

La **ventilación** va igual: la de `getVentanaYACHByYear` (0,83 ren/h desde 1979; 1,00 antes), aviso
desde el 01/04/2026 (63 de 142 aprobados usan otra, casi siempre 0,83 en viviendas anteriores a 1979).

### 11. Las fechas

Viven en `<DatosDelCertificador><Fecha>` (la del certificado, 462/462) y `<FechaVisita>`.
⚠️ `<FechaGeneracion>` es OTRA cosa —cuándo se guardó el fichero— y difiere de la del certificado en
115 de los 462. ⚠️ `//` es «no consta»: lo escriben 18 de los 462 en la visita.

- **Fecha del certificado ≠ la del expediente** → **aviso**. El visto bueno le dice «fírmalo con
  fecha X, la misma con la que se emitió el certificado», y esa X sale de `fechaFirmaCee`: si no
  coinciden, se le pedirá una fecha que no es la de su certificado.
- **Fecha del certificado futura** → **NO APTO**.
- **Visita posterior al certificado** → **NO APTO**: no se puede certificar una vivienda antes de
  visitarla.
- **Sin fecha de visita** → **aviso**: el certificado no acredita cuándo se tomaron los datos.
- **Con los dos certificados**: el final tiene que ser posterior al inicial → si no, **NO APTO**.

Lo que NO se comprueba aquí: la fecha con la que se ha firmado electrónicamente el PDF. Eso ya lo
hace `ceeFirmaService.comprobarFirmaCee` al recibirlo.

### 12. Quién firma

`<DatosDelCertificador>` trae `<NIF>`, `<NIFEntidad>` y `<NombreyApellidos>`. Se comparan con el
certificador asignado (`cee.certificador_id` → `prescriptores`; ⚠️ la columna del NIF es **`cif`**,
no `cif_nif`). Vale el NIF de la persona **o** el de su entidad: un técnico puede ejercer en una
empresa y firmar con su NIF personal mientras el expediente guarda el CIF de la sociedad (regla 48.f).

**Aviso, no fallo**: puede haberlo firmado un compañero de su despacho, pero conviene saberlo antes
de dar el visto bueno. Sin certificador asignado, no se afirma nada.

### 13. El CEE final
Tiene que declarar la **bomba de calor instalada**. Si sigue declarando la caldera → **NO APTO**: o es
el certificado de antes de la obra, o la actuación no se ha recogido. ⚠️ En **RES093 y TER173** la
caldera **no se retira** —son hibridaciones, y ahí conviven las dos—, así que eso es lo correcto.

### 14. Datos generales (del `.cex`)
- **Año** distinto del de la simulación → aviso (coincide en 91 de 94 aprobados).
- Superficie, plantas, altura, demanda de ACS y normativa → **se enseñan** (el nº de plantas no casa
  con la oportunidad en 26 de 110 aprobados: la oportunidad cuenta distinto).

### 15. Huecos y puentes (del `.cex`)
- **Ningún hueco** → NO APTO.
- Superficie de huecos / fachada al aire **fuera de 6 %-45 %** → aviso (p2 y p98 de lo aprobado).
- Falta alguno de **forjado · contorno de hueco · pilar integrado · pilar en esquina** → aviso (los
  llevan más del 93 % de los aprobados).

### 16. Equipos existentes (del `.cex`)
- Reparto de calefacción o ACS ≠ **100 %** → aviso (CE3X no calcula así).
- El cliente **confirmó aires** al aceptar y el inicial no tiene equipos de frío → aviso.
- El cliente **declaró placas** y no hay contribución renovable → aviso (van como EXISTENTES).

### 17. La MEDIDA DE MEJORA del CEE inicial (del `.cex`)
Es lo que Fran añadía a mano: «le cargo como medida de mejora lo que va a ser el final».

| Punto | Si falla |
|---|---|
| Existe | **NO APTO** en RES060/RES093/TER (aviso en RES080: 20 de los 22 aprobados sin medida son RES080) |
| Está **calculada** (ahorro ≠ 0 y foto del edificio) | **NO APTO** |
| Se calculó sobre ESTE edificio (la foto `datosEdificioOriginal` = el fichero de hoy) | **NO APTO** — se tocó el edificio después: hay que pulsar «Actualizar» |
| Propone una **bomba de calor** | **NO APTO** |
| El **modelo** es el del expediente | aviso |
| El **SCOP** de calefacción = el del expediente (±2 %) | aviso |
| El **SCOP_dhw** = el del expediente, si el ACS está en alcance | aviso |
| El ACS de la medida cubre el **100 %** | **NO APTO** (CE3X no la calcula) |
| En hibridación, la bomba cubre el **C_b** (±2 pts) | aviso |

**Si el expediente aún no declara la aerotermia** (13 de los 15 pendientes el 29/09/2026), se compara
con la **genérica de la simulación**: SCOP de calefacción, SCOP_dhw y potencia de la oportunidad.

**Una medida calculada guarda DOS fotos del edificio** (`datosEdificioOriginal` y
`datosNuevoEdificio`, cada una con instalaciones, envolvente y datos generales). Es lo que permite
detectar la medida DESFASADA — medido en 26RES060_154: superficie 213,9 → 280 m² y ACS 336 → 140 l/día
después de calcularla.

---

## El veredicto

| | Cuándo |
|---|---|
| **NO APTO** | hay al menos un fallo |
| **APTO CON AVISOS** | ningún fallo, pero hay avisos o puntos no comprobables |
| (info) | se enseña y no cuenta: la caldera, los datos generales, el depósito |
| **APTO** | todo comprobado y todo correcto |

Un `no_comprobable` no tumba el certificado, pero **tampoco deja decir APTO a secas**: es lo que
separa «lo he mirado y está bien» de «esto no lo he podido mirar».
