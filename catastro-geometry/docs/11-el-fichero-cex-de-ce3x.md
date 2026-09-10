# El fichero `.cex` de CE3X — qué es por dentro

**Hallazgo del 2026-09-10.** Cambia el objetivo del proyecto, así que va aquí
antes que en ningún sitio.

Si el destinatario es el **certificador antes de emitir el CEE**, el mejor
entregable no es una tabla para teclear: es **un `.cex` que abre en CE3X con la
envolvente ya metida**.

## Qué es un `.cex`

Una secuencia de **pickles de Python en protocolo 0** (texto), escritos en modo
texto de Windows (por eso el fichero lleva CRLF y hay que normalizar `\r\n` → `\n`
antes de parsearlo). CE3X es una aplicación Python, y guarda su estado así.

Analizado `24RES080_XX - CEE PREVISTO CAE.cex` (108 KB): **15 pickles
concatenados**.

| # | Offset | Qué lleva |
|---|---|---|
| 0 | 0 | cabecera de versión: `CEXv2.3 Residencial` |
| 1 | 27 | datos administrativos: nombre, dirección, municipio, provincia, técnico, teléfono, email, CP |
| 2 | 474 | **datos generales**: `Anterior` · `Unifamiliar` · provincia · municipio · **zona climática `D3`** · superficie `186` · **altura de planta `2.7`** · nº plantas `2`. Ocupa 95 KB porque **dentro va la imagen del plano** |
| **3** | **95547** | **LA ENVOLVENTE** — 2.791 opcodes: cubiertas, muros, huecos, patrones de sombra |
| 4 | 106101 | instalaciones: bomba de calor, vector energético, demandas |
| 5–13 | | fechas, patrones de sombra, varios |
| 14 | 106764 | un hash |

Opcodes usados en todo el fichero: `LIST`, `DICT`, `APPEND`, `SETITEM`,
`UNICODE`, `STRING`, `INT`, `FLOAT`, `GET`, `PUT`… es decir **datos planos**. La
única excepción son 9 `INST` de una sola clase propia de CE3X:
`Envolvente.objetosEnvolvente.HuecoEstimadas` (los huecos estimados).

## REGLA DE SEGURIDAD — nunca `pickle.load()` un `.cex`

Deserializar un pickle **ejecuta código arbitrario**. Un `.cex` llega por correo,
de un certificador externo o de una carpeta de Drive: es un fichero de terceros.

Se analiza **siempre** con `pickletools.genops()`, que recorre los opcodes y
**no ejecuta nada**, y se reconstruyen los datos a mano. Es lo que se hizo para
sacar el mapa de arriba.

## Por qué esto importa tanto

Lo que hoy sale del proyecto (fachadas por orientación, medianeras, cubiertas,
suelos y particiones con espacios no habitables) es **exactamente** lo que vive
en el pickle 3. Y el pickle 2 lleva la altura de planta y la superficie, que
también calculamos.

Si se puede escribir un `.cex`, el certificador **abre el fichero y ya tiene la
envolvente**. Se acaba el teclear, y se acaba la idea de automatizar CE3X con
Computer Use — que es automatizar el teclear.

## Cómo se averigua la estructura del pickle 3: por DIFERENCIAS

No hace falta entender los 2.791 opcodes de golpe. Con CE3X delante:

1. guardar un `.cex` con la envolvente **vacía**;
2. añadir **un solo muro de fachada** de superficie conocida y guardar otra vez;
3. **desensamblar los dos y restar**. Lo que aparece es el registro de un muro,
   con sus campos y su orden;
4. repetir con una medianera, una cubierta, un suelo y una partición.

Cinco ficheros y está el formato. Es un trabajo de una tarde, no de semanas.

## Riesgos, dichos antes

* **Es un formato no documentado.** `CEXv2.3` está versionado: una actualización
  de CE3X puede cambiarlo. El generador **tiene que leer la cabecera y negarse**
  si la versión no es una de las probadas, en vez de escribir algo que CE3X abra
  a medias.
* **Nadie da soporte.** Si CE3X rechaza el fichero, no hay a quién preguntar.
* **Más seguro modificar que crear.** Partir de un `.cex` que haya guardado el
  propio certificador —con sus datos administrativos y su zona climática ya
  puestos— y **reescribir solo el pickle de la envolvente**, dejando los otros 14
  byte a byte como estaban. Así no hay que entender el fichero entero.
* **El `.cex` lleva datos personales**: nombre y dirección del titular, y
  teléfono y email del técnico. No se commitean ficheros `.cex` de clientes al
  repositorio. Para el banco de pruebas, uno propio y anonimizado.

## Lo que aún NO se sabe

* Qué campos exactos tiene cada elemento de la envolvente y en qué orden.
* Si CE3X valida algo al abrir (un hash, el pickle 14) que impida modificarlo.
  **Es lo primero que hay que comprobar**: cambiar un número, guardar, abrir.
* Si hay una vía oficial de importación que evite todo esto. Merece 20 minutos
  de mirar los menús de CE3X antes de meterse aquí.
