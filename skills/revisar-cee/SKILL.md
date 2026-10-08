---
name: revisar-cee
description: 'Revisa el CERTIFICADO DE EFICIENCIA ENERGÉTICA que entrega un certificador, antes de darle el visto bueno para que lo registre. Úsalo cuando el usuario diga "revisa el CEE del expediente NNN", "mírame este certificado", "¿puedo dar el visto bueno al CEE de X?", "acaban de subir el CEE inicial", "revisa el .xml / el .cex que me han pasado", o adjunte un .xml, .cex o PDF de un CEE. Comprueba lo que se revisa a mano: que el CEE inicial declare el equipo que se va a sustituir con su combustible, que el alcance (calefacción / calefacción+ACS) coincida, que la demanda y la superficie no queden por debajo de las simuladas, transmitancias y ventilación de la guía, huecos y puentes térmicos, y —leyendo el .cex— que la MEDIDA DE MEJORA del inicial exista, esté calculada sobre ESE edificio y lleve el equipo y el SCOP del expediente; en un RES080, qué envolvente cambia. INFORMA con veredicto y evidencia: no da el visto bueno ni avisa al certificador; eso lo decide una persona.'
---

# Revisar un CEE antes de dar el visto bueno

Contesta a *«¿puedo decirle al certificador que lo registre?»* con un veredicto —**APTO**, **APTO CON
AVISOS** o **NO APTO**— y, punto por punto, **lo que dice el certificado** frente a **lo que dice el
expediente**. La evidencia va siempre al lado: es lo que permite contrastarlo sin abrir el fichero.

- **Esto PROPONE. No aprueba.** El visto bueno, el aviso al certificador y el cambio de fase se dan en
  el módulo CEE del expediente, con una persona delante.
- **Lo que no se puede comprobar se DICE.** Un punto omitido en silencio se lee como un punto que está
  bien, y aquí eso significa dar por revisado algo que nadie ha mirado.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`. MCP BROKERGY: `get_expediente`.

## Entrada

Un **nº de expediente** (`26RES060_186`), un **fichero** adjunto, o los dos. Lo que hace falta:

| Qué | De dónde sale |
|---|---|
| El `.xml` del CEE | **`expedientes.cee->>'xml_inicial'` / `'xml_final'` en Supabase** (ver abajo), o Drive → `1. CEE / CEE INICIAL` |
| El expediente | MCP `get_expediente` |
| El `.xml` de la **otra fase**, si existe | la otra clave / la otra carpeta — con los dos se puede decir qué cambia |

**El `.xml` manda.** El PDF y el `.xml` salen del mismo `.cex`, así que revisando el XML se revisa lo
que lee el auditor, y además es exacto: el PDF habría que leerlo con IA. Si solo hay PDF, léelo y **di
en el informe que la revisión se ha hecho sobre el PDF**, no sobre el fichero de datos.

## Procedimiento

### 1. Reúne los ficheros

**Lo primero, Supabase**: el `.xml` crudo del certificado está guardado en el propio expediente
(`cee->>'xml_inicial'` y `cee->>'xml_final'`; 115 expedientes lo tienen). Es el camino corto: ni Drive
ni descargas.

```sql
select cee->>'xml_inicial' from expedientes where numero_expediente = '26RES060_192';
```

⚠️ **Ese XML está EN MAYÚSCULAS** (`<?XML VERSION…?>`, `<DATOSENERGETICOSDELEDIFICIO>`): lo deja así
`normalizeData`. `parseCeeXml` no puede releerlo —es el gotcha de la regla 32— pero el lector de esta
skill sí, porque busca sin distinguir mayúsculas. No lo "arregles" bajándolo a minúsculas.

⚠️ Y es **grande** (~110 KB cada uno): pídelo de UN expediente, nunca de un listado (regla 22).

Si no está en la BD, en Drive: `1. CEE / CEE INICIAL`, fichero `… – CEE INICIAL.xml`. Y si el usuario
adjunta el fichero, úsalo tal cual.

### 2. Ejecuta la revisión

**Con el comprobador (Claude Code, o Cowork por Desktop Commander)** — es el camino bueno, porque el
juicio lo hace código determinista y el resultado es reproducible. En Cowork el comando es el mismo,
lanzado EN EL PC con Desktop Commander (nunca en el sandbox): ver [comun/entorno.md](comun/entorno.md).

```bash
cd implementation/backend
node scripts/revisar_cee.js --expediente 26RES060_192 [--fase inicial|final]
```

Con `--expediente` lo trae todo solo: el `.xml` (de Supabase, o de Drive si no está en la BD) y el
**`.cex` del técnico** de su carpeta `1. CEE / CEE INICIAL|FINAL`, que lee el **motor**
(`cee-engine`, `POST /cex/radiografia`). ⚠️ Sin el motor levantado los puntos del `.cex` salen «sin
comprobar» —en local: `preview_start cee-engine`, puerto 8090—.

Con ficheros sueltos: `node scripts/revisar_cee.js <cee.xml> [otro.xml] --exp <expediente.json>`.

⚠️ **`--fase` siempre** con ficheros sueltos: de la fase depende el criterio (en el inicial se espera
una caldera y en el final una bomba de calor; en un RES080, que la demanda BAJE).

**Si falta la medida de mejora**, la app la pone — la MISMA que se añadía a mano:

```bash
node scripts/revisar_cee.js --expediente 26RES060_192 --poner-medida
```

⚠️ **ESCRIBE en Drive** (`{nº} - CEE INICIAL_CON MEDIDA_REVISAR.cex`, junto al del técnico, en una
carpeta que ve el certificador): pídelo solo si el usuario lo quiere. La medida sale **SIN calcular**
—el ahorro lo calcula el motor de CE3X al pulsar «Actualizar», y ese motor no está aquí—, así que
alguien tiene que abrirlo en CE3X, pulsar «Actualizar» y guardarlo como el `.cex` del certificado.
Sin aerotermia en el expediente pone una GENÉRICA con lo simulado; con el ACS fuera de alcance y la
caldera mixta retirada, un termo eléctrico.

**Sin el comprobador (Cowork sin Desktop Commander, o con el PC apagado)** — aplica a mano el criterio de [referencia/criterio.md](referencia/criterio.md)
leyendo el `.xml`, y **dilo en el informe**: «revisado sin el comprobador determinista». Es la misma
lista de puntos, pero el veredicto lo estás dando tú y no el código.

### 3. Cuenta el resultado
Empieza por el **veredicto y lo que lo decide**, no por la lista entera. Después los puntos que no
están en verde, con su evidencia. Lo correcto va al final y en una línea: es lo que no hay que mirar.

Si sale **NO APTO**, di en una frase qué hay que pedirle al certificador. No se lo escribas ni lo
envíes salvo que el usuario lo pida: para eso está el popup del módulo CEE, que ya sella el
seguimiento y el historial.

## Lo que se comprueba

Todos los umbrales están medidos sobre los 143 CEE iniciales que Fran había aprobado (29/09/2026).

| Punto | Contra qué | Si falla |
|---|---|---|
| El generador que se sustituye está en el CEE inicial | `caldera_antigua_cal.rendimiento_id` | NO APTO (en RES080, aviso) |
| Es de **combustión** (en RES060/093/TER100/TER173) | la ficha | NO APTO |
| El **combustible** es el declarado | `inputs.fuelType` + la fila de rendimiento | NO APTO si cambia de FAMILIA; aviso dentro de ella |
| …y el de la **PLACA y las fotos** de la caldera | `instalacion.placa_ocr.leido.combustible` | NO APTO — **a mano**: si la placa dice otro, manda la placa y el expediente se corrige (26RES060_191: placa «gasoleo», CEE y expediente «gas natural») |
| **Rendimiento** de la caldera (y su cola en el `.cex`) | la tabla | **solo informa** |
| El **ACS**: si la actuación lo toca, está descrito; y con el mismo equipo si así consta | `cambio_acs`, `misma_caldera_acs` | NO APTO / aviso |
| **Demanda** y **superficie** frente a las simuladas | la oportunidad | aviso hasta −10 %; NO APTO más abajo |
| **Referencia catastral** y **zona climática** | el expediente | NO APTO / aviso |
| **Transmitancias** = la Guía (±2 %): desde el 08/10/2026, los «Estimados según antigüedad y zona» de CE3X 3.2 | `transmitanciasCe3x.js` · antes, `getUByYearGuiaAnterior` | aviso desde el 01/04/2026; antes, info |
| **Ventilación** = la Guía | `getVentanaYACHByYear` | aviso desde el 01/04/2026 |
| **Año** = el de la simulación | la oportunidad | aviso |
| **Huecos**: que haya, y entre 6 % y 45 % de la fachada | lo aprobado | NO APTO / aviso |
| **Puentes**: forjado, contorno de hueco, pilares | lo aprobado | aviso |
| **Sótano**: sus muros, contra el TERRENO; y en una casa aislada, ninguna medianera | zonas bajo rasante del `.cex`, colindantes | NO APTO — **a mano** (aún no lo mira el código) |
| **Suelos por zona**: suelo + partición inferior ≤ superficie de la zona; nada «inferior» en la planta más baja ni entre dos plantas de vivienda | el `.cex` | NO APTO — **a mano** (aún no lo mira el código) |
| **Versión de CE3X**: la que tocaba en la fecha del certificado — **3.2** desde el 08/10/2026, 3.1 del 01 al 07/10/2026, 2.3 antes. Una 3.1 emitida desde el 08/10 se pasa a la 3.2 (misma forma, solo la cabecera) | cabecera del `.cex` y fecha del certificado | aviso (`version_ce3x_32`; la 2.3 tardía, `version_ce3x`) |
| **Datos generales de la 3.x** completos: superficie útil, nº de viviendas o unidades de uso, plantas sobre rasante (sin ellos CE3X no califica) | el `.cex` | aviso |
| …y con el criterio de la 3.2: **unidades de uso y plantas habitables, las de lo que se CERTIFICA** (un piso = 1); **plantas sobre y bajo rasante, las del EDIFICIO ENTERO** (Catastro), aunque sea un piso | Catastro (BuildingPart) | **a mano** (el código solo mira que estén): si no casa, se dice |
| **Reparto** de calefacción y ACS al 100 % | el `.cex` | aviso |
| **Aires y placas** que confirmó el cliente (las placas existentes cuentan como «Generación renovable eléctrica» o como contribución) | `confirmacion_cliente`, `fotovoltaica` | aviso |
| En la **3.2**, placas como **«Contribución energética»**: la FV va SIEMPRE en «Generación renovable eléctrica», potencia pico y autoconsumo mes a mes | el `.cex` | aviso (`fv_contribucion`; en la 3.1, solo informa) |
| **Medida de mejora**: existe, calculada, sobre ESTE edificio | el `.cex` | NO APTO (RES080: aviso si no hay) |
| **Medida**: bomba de calor, modelo y SCOP del expediente | el expediente o la simulación | NO APTO / aviso |
| **RES080**: qué elementos de envolvente cambian | `documentacion.envolvente` | NO APTO |
| **Fase final**: declara la bomba de calor instalada | `aerotermia_cal` | NO APTO |
| **Fecha del certificado** = la que consta en el expediente | `fechaFirmaCee` | aviso |
| **Fecha de visita** anterior al certificado, y que exista | el propio `.xml` | NO APTO / aviso |
| **Quién firma** el certificado es el técnico asignado | `prescriptores` del `certificador_id` | aviso |

## Lo que hay que saber

**El `.xml` de la 3.1 y el de la 3.2 son el MISMO esquema (v3.0).** Los distingue
`<Procedimiento><Version>`, que es la fecha de compilación: **2026.08.20** la 3.1, **2026.10.05** la
3.2. El de la 2.3 es el v2.0 (`CEXv2.3`). Cómo se lee cada uno: [referencia/criterio.md](referencia/criterio.md).

**La acumulación de ACS y la medida de mejora solo están en el `.cex`.** El `.xml` no declara el
depósito (medido en 462) ni qué equipo propone la medida o si está calculada. Por eso la revisión lee
el `.cex`, y si no lo tiene, esos puntos salen *no comprobables* en vez de callarse.

**En un RES080, qué se sustituye NO se lee del texto de la medida de mejora.** Su `<Nombre>` es texto
libre: en el corpus dice cosas como «CEE FINAL.cex» o «MAE 1». Lo que sí prueba qué cambia es comparar
los **dos certificados cerramiento a cerramiento**: la ventana que se sustituye es la que baja de U.
Por eso con un solo `.xml` ese punto sale como no comprobable — y por eso conviene pedirle al
certificador los dos.

**El combustible se compara por FAMILIA, no letra por letra.** La tabla del Anexo VIII no distingue
dentro de la familia: `gas_*` cubre el gas natural y el GLP con la misma fila y el mismo η, y `solid_*`
cubre el carbón y la biomasa. Así que un vector distinto de la misma familia **no mueve el ahorro** y
sale como aviso; lo que falla es cambiar de familia. Medido sobre los 115 expedientes con `.xml` en la
BD: de las 4 discrepancias, 2 son de la misma familia y 2 cambian de fila.

**«Conocido» NO existe en el `.xml`: se escribe `Usuario`.** Los tres valores de `<ModoDeObtencion>`
son `PorDefecto`, `Estimado` y `Usuario`, y ese último ES el «Conocido (Ensayado/justificado)» de
CE3X. Verificado por contraste: las bombas de calor —que en el `.cex` se declaran «Conocido»— llevan
`Usuario` en 618 de 769, y las calderas estándar `Estimado` en 392 de 394. Buscar la palabra
«Conocido» en el XML no encuentra nada, y de ahí a concluir que ningún certificado justifica sus
transmitancias hay un paso. ⚠️ Un HUECO no lleva `<ModoDeObtencion>` sino
`<ModoDeObtencionTransmitancia>`, y los PUENTES TÉRMICOS no cuentan (van casi siempre por defecto y
ahogarían el recuento).

**La fecha que se le pide firmar es la del EXPEDIENTE.** El visto bueno le dice «fírmalo con fecha X,
la misma con la que se emitió el certificado», y esa X sale de `fechaFirmaCee`. Si el `.xml` declara
otra, le estarás pidiendo una fecha que no es la de su propio certificado — corrige la del expediente
antes de dárselo. (Que el PDF firmado traiga después otra fecha ya lo comprueba `ceeFirmaService`.)

**Un `APTO CON AVISOS` no es un `APTO`.** Significa que algo no se ha podido mirar, o que algo no casa
sin llegar a invalidar el certificado. Léelos antes de dar el visto bueno.

## Qué NO hace

No da el visto bueno · no escribe en el expediente · no registra incidencias · no le escribe al
certificador · no toca la fase del CEE. Si el usuario quiere alguna de esas cosas, se hacen desde el
módulo CEE del expediente o con la skill que corresponda (`enviar-whatsapp` para avisarle).
