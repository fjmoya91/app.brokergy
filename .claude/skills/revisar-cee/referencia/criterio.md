# El criterio, para aplicarlo sin el comprobador

Todo lo de aquí está MEDIDO sobre los 462 certificados reales de `data/real_cases_xml`. Cuando se
pueda ejecutar `scripts/revisar_cee.js`, se ejecuta: esto es el respaldo para cuando no hay repo
delante (Cowork), y entonces **hay que decir en el informe que se ha revisado sin el comprobador**.

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

### 4. El rendimiento
`<RendimientoEstacional>` × 100 vs. el `value` de la fila del Anexo VIII (`BOILER_EFFICIENCIES`).
**Más de 8 puntos de separación → aviso**, no fallo: es el mismo umbral con el que la app
preselecciona la casilla desde un CEE cargado. Importa porque el CIFO recalcula con la casilla del
expediente, no con el η del certificado.

### 5. El ACS
- `cambio_acs !== false` → `<InstalacionesACS>` tiene que estar descrito. Si no está → **NO APTO**.
- `misma_caldera_acs === true` → el aparato de ACS debe ser el MISMO (mismo `<Nombre>` y `<Tipo>`) que
  el de calefacción. Si es otro → **aviso**: una de las dos cosas está mal.
- Fuera de alcance → solo se mira que el certificado no lo contradiga.

### 6. La acumulación de ACS — NO SE PUEDE con el `.xml`
Buscado en los 462: el único nodo con «volumen» es `<VolumenEspacioHabitable>`, que es el de la
vivienda. **Sale siempre como no comprobable** y hay que mirarlo en el `.cex` o en CE3X. No se calla.

### 7. Demanda y superficie
`<Demanda><EdificioObjeto><Calefaccion>` y `<SuperficieHabitable>` contra lo que simuló la
oportunidad (`result.q_net` y `result.superficieAplicada`). **Holgura del 2 %** — por debajo son
redondeos del `.cex`. Si la demanda o la superficie certificadas quedan **por debajo** de las
simuladas → **NO APTO**: sobre esas cifras se le prometió el bono al cliente.

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

### 10. Las transmitancias, justificadas

`<ModoDeObtencion>` de cada cerramiento opaco (fachada, cubierta, suelo, particiones).

⚠️ **En el `.xml` NO existe «Conocido»**: los tres valores son `PorDefecto`, `Estimado` y
**`Usuario`**, y `Usuario` ES el «Conocido (Ensayado/justificado)» de CE3X. Verificado por contraste:
las bombas de calor —que en el `.cex` se declaran «Conocido»— llevan `Usuario` en 618 de 769, y las
calderas estándar `Estimado` en 392 de 394.

⚠️ Un **HUECO** no lleva `<ModoDeObtencion>` sino `<ModoDeObtencionTransmitancia>` y
`<ModoDeObtencionFactorSolar>`. Los 5.618 huecos del corpus son así.

⚠️ Los **PUENTES TÉRMICOS** (contorno de hueco, caja de persiana, encuentros, pilares) NO cuentan:
van por defecto en 19.999 de las 29.780 apariciones y ahogarían el recuento. Se distinguen porque no
tienen `<Superficie>` sino `<Longitud>`. Los **adiabáticos** tampoco: su U no describe nada.

**Aviso, no fallo.** Un CEE con transmitancias por defecto es válido; lo que pasa es que son el caso
más desfavorable —dan más demanda y con ella más ahorro— y es de lo primero que el verificador mira
con lupa. Medido con el propio lector sobre los 115 expedientes con `.xml` en la BD: **65 de 115**
tienen todas sus fachadas y cubiertas justificadas, así que como fallo dejaría fuera a media cartera.

⚠️ **El SUELO no cuenta**: solo el **11 %** lo justifica, y metido en la cuenta el aviso saltaría en
casi los 115. Cuando va por defecto se menciona en el detalle, sin disparar nada.

**En un RES080 pesa más** si el cerramiento sin justificar es de los que se rehabilitan: su U de
partida es la base del ahorro. Se señala en el detalle.

Cuánto se justifica cada uno, en los 115 expedientes de producción: **fachada 63 %** · cubierta 72 %
· partición vertical 66 % · partición horizontal 56 % · **suelo 11 %** · adiabáticos y lucernarios
0 %.

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

---

## El veredicto

| | Cuándo |
|---|---|
| **NO APTO** | hay al menos un fallo |
| **APTO CON AVISOS** | ningún fallo, pero hay avisos o puntos no comprobables |
| **APTO** | todo comprobado y todo correcto |

Un `no_comprobable` no tumba el certificado, pero **tampoco deja decir APTO a secas**: es lo que
separa «lo he mirado y está bien» de «esto no lo he podido mirar».
