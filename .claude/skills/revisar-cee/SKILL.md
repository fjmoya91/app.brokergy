---
name: revisar-cee
description: >-
  Revisa el CERTIFICADO DE EFICIENCIA ENERGÉTICA que entrega un certificador, antes de darle el visto
  bueno para que lo registre. Úsalo cuando el usuario diga "revisa el CEE del expediente NNN", "mírame
  este certificado", "¿puedo dar el visto bueno al CEE de X?", "acaban de subir el CEE inicial", "revisa
  el .xml / el .cex que me han pasado", o adjunte un .xml, .cex o PDF de un CEE. Comprueba lo que se
  revisa a mano: que el CEE inicial declare el equipo que se va a sustituir con su combustible, que el
  alcance (calefacción / calefacción+ACS) coincida, que la demanda y la superficie no queden por debajo
  de las simuladas, que la vivienda sea la del expediente, y —en un RES080— QUÉ elementos de envolvente
  cambian entre los dos certificados. INFORMA con un veredicto y la evidencia de cada punto: no da el
  visto bueno, no avisa al certificador y no registra nada. Eso lo decide una persona.
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

**Con el repo delante (Claude Code)** — es el camino bueno, porque el juicio lo hace código
determinista y el resultado es reproducible:

```bash
cd implementation/backend
node scripts/revisar_cee.js <cee.xml> [otro.xml] --exp <expediente.json> --fase inicial|final
```

`expediente.json` es lo que devuelve `get_expediente`, guardado tal cual. Sin `--exp` hace solo la
radiografía (qué dice el certificado), que ya vale para mirarlo por encima.

⚠️ **`--fase` siempre.** De la fase depende el criterio: en el inicial se espera una caldera y en el
final una bomba de calor, y en un RES080 se espera que la demanda BAJE. Sin ella se deduce del nombre
del fichero, que es una conjetura — y equivocarla no da un aviso raro: revisa con el criterio
contrario. En la app la fase la da el slot al que se subió, que es un dato.

**Sin el repo (Cowork)** — aplica a mano el criterio de [referencia/criterio.md](referencia/criterio.md)
leyendo el `.xml`, y **dilo en el informe**: «revisado sin el comprobador determinista». Es la misma
lista de puntos, pero el veredicto lo estás dando tú y no el código.

### 3. Cuenta el resultado
Empieza por el **veredicto y lo que lo decide**, no por la lista entera. Después los puntos que no
están en verde, con su evidencia. Lo correcto va al final y en una línea: es lo que no hay que mirar.

Si sale **NO APTO**, di en una frase qué hay que pedirle al certificador. No se lo escribas ni lo
envíes salvo que el usuario lo pida: para eso está el popup del módulo CEE, que ya sella el
seguimiento y el historial.

## Lo que se comprueba

| Punto | Contra qué | Si falla |
|---|---|---|
| El generador que se sustituye está en el CEE inicial | `caldera_antigua_cal.rendimiento_id` | NO APTO (en RES080, aviso) |
| Es de **combustión** (en RES060/093/TER100/TER173) | la ficha | NO APTO |
| El **combustible** es el declarado | `inputs.fuelType` + la fila de rendimiento | NO APTO si cambia de FAMILIA; aviso dentro de ella |
| El **rendimiento** encaja con la casilla del Anexo VIII (±8 pts) | `BOILER_EFFICIENCIES` | aviso |
| El **ACS**: si la actuación lo toca, está descrito; y con el mismo equipo si así consta | `cambio_acs`, `misma_caldera_acs` | NO APTO / aviso |
| **Acumulación de ACS** | — | **no comprobable con el `.xml`** (ver abajo) |
| **Demanda** y **superficie** ≥ las simuladas | la oportunidad | NO APTO |
| **Referencia catastral** y **zona climática** | el expediente | NO APTO / aviso |
| **RES080**: qué elementos de envolvente cambian | `documentacion.envolvente` | NO APTO |
| **Fase final**: declara la bomba de calor instalada | `aerotermia_cal` | NO APTO |
| **Transmitancias** de muros, cubierta, suelo y particiones justificadas | el propio `.xml` | aviso |
| **Fecha del certificado** = la que consta en el expediente (la que se le pide firmar) | `fechaFirmaCee` | aviso |
| **Fecha de visita** anterior al certificado, y que exista | el propio `.xml` | NO APTO / aviso |
| **Quién firma** el certificado es el técnico asignado | `prescriptores` del `certificador_id` | aviso |

## Lo que hay que saber

**La acumulación de ACS NO está en el `.xml`.** Medido sobre los 462 certificados reales del corpus: el
único nodo con «volumen» es `<VolumenEspacioHabitable>`, que es el de la vivienda. Ese punto solo se
puede comprobar abriendo el **`.cex`** (o mirándolo en CE3X), y por eso la revisión lo saca marcado
como *no comprobable* en vez de callarlo.

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
