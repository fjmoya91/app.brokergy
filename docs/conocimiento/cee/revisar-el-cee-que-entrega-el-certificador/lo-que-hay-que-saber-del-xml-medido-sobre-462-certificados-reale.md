<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «REVISAR el CEE que entrega el certificador (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### Lo que hay que saber del `.xml` (MEDIDO sobre 462 certificados reales)

**LA ACUMULACIÓN DE ACS NO ESTÁ EN EL `.xml`.** Buscado en los 462 cualquier nodo con «acumul»,
«volum», «deposit» o «inercia»: el único que aparece es `<VolumenEspacioHabitable>`, que es el de la
vivienda. Así que «¿la caldera tiene depósito de ACS?» —uno de los puntos que se revisan a ojo— solo
se puede contestar con el **`.cex`**, donde sí vive (regla 48.b). Sale siempre marcado como no
comprobable, nunca callado.

**En un RES080, qué se sustituye NO se lee del texto de la medida de mejora.** Su `<Nombre>` es texto
libre: en el corpus dice cosas como «CEE FINAL.cex», «MAE 1» o «PLACAS SOLARES». Lo que sí lo prueba
—y es lo que el verificador puede reproducir— es comparar los DOS certificados **cerramiento a
cerramiento**, casándolos por su `<Nombre>`: la ventana que se cambia es la que baja de transmitancia
(holgura del 2 %). Con un solo `.xml` ese punto NO se afirma. El `<Tipo>` viaja con cada cambio
(`Fachada` · `Cubierta` · `Suelo` · `Lucernario`), que es lo que lo cruza con `documentacion.envolvente`.

**El combustible se compara por FAMILIA, no letra por letra.** La tabla del Anexo VIII no distingue
dentro de la familia: `gas_*` cubre gas natural y GLP con la MISMA fila y el mismo η, y `solid_*`
cubre carbón y biomasa. Un vector distinto de la misma familia no mueve el ahorro → **aviso**; cambiar
de familia sí cambia la fila → **falla**. Medido sobre los 115 expedientes con `.xml` en la BD: de las
4 discrepancias, 2 son de la misma familia (25RES060_67, 26RES060_181) y 2 cambian de fila
(26RES080_41, 26RES080_83 — éste declara una caldera de GASÓLEO al 30 % donde el expediente dice gas
natural al 73 %).

**«Conocido» NO existe en el `.xml`: se escribe `Usuario`.** Los tres valores de
`<ModoDeObtencion>` son `PorDefecto`, `Estimado` y `Usuario`, y ese último ES el «Conocido
(Ensayado/justificado)» de CE3X. Verificado por contraste: las bombas de calor —que en el `.cex` se
declaran «Conocido», 132 de 138 (regla 48.b)— llevan `Usuario` en 618 de 769, y las calderas
estándar `Estimado` en 392 de 394. Buscar la palabra «Conocido» en el XML no encuentra nada, y de
ahí a concluir que ningún certificado justifica sus transmitancias hay un paso.

**Que las transmitancias estén JUSTIFICADAS es un aviso, no un fallo.** Un CEE con transmitancias
por defecto es válido; lo que pasa es que son el caso más desfavorable —dan más demanda y con ella
más ahorro— y es de lo primero que mira el verificador. Medido con el propio lector sobre los 115
expedientes con `.xml` en la BD: **65 de 115** tienen todas sus fachadas y cubiertas justificadas,
así que el criterio discrimina de verdad, pero como fallo dejaría fuera a media cartera.

⚠️ **El SUELO queda FUERA de la cuenta a propósito**: solo el **11 %** lo justifica (frente al 63 %
de las fachadas, el 72 % de las cubiertas y el 66 %/56 % de las particiones), así que incluyéndolo
el aviso saltaría en casi los 115 y dejaría de leerse. Cuando va por defecto se DICE en el detalle,
sin disparar nada. Los ADIABÁTICOS tampoco cuentan: su U no describe nada y están al 0 %.

⚠️ Esas cifras se midieron **con el lector**, no con una consulta SQL: una regex que dé por hecho
que `<ModoDeObtencion>` va pegado a `<Tipo>` cuenta mal, porque el orden de los hijos de
`<Elemento>` cambia entre ficheros. La primera medición por SQL dijo «68 y 45» y era un artefacto. En un RES080 se señala aparte si el
cerramiento sin justificar es de los que se REHABILITAN: ahí su U de partida es la base del ahorro.
⚠️ Un HUECO no lleva `<ModoDeObtencion>` sino `<ModoDeObtencionTransmitancia>`; y los PUENTES
TÉRMICOS no cuentan —van por defecto en 19.999 de las 29.780 apariciones del corpus y ahogarían el
recuento—, ni los adiabáticos, cuya U no describe nada.

**La fecha que se le pide firmar es la del EXPEDIENTE.** El visto bueno le dice «fírmalo con fecha
X, la misma con la que se emitió el certificado», y esa X sale de `fechaFirmaCee`
([utils/ceeFechas.js](implementation/backend/utils/ceeFechas.js)): si el `.xml` declara otra, se le
pedirá una fecha que no es la de su certificado → aviso. Se comprueban además que la fecha no sea
futura (falla), que la VISITA sea anterior al certificado (falla: no se puede certificar una
vivienda antes de verla), que la visita exista (aviso — `//` es «no consta», 18 de los 462) y, con
los dos certificados, que el final vaya después del inicial. ⚠️ `<FechaGeneracion>` NO es la del
certificado: es cuándo se guardó el fichero, y difieren en 115 de los 462. Lo que **no** se
comprueba aquí es la fecha con la que se firma el PDF: de eso ya se ocupa
`ceeFirmaService.comprobarFirmaCee` al recibirlo.

**Quién firma el certificado se compara con el técnico ASIGNADO.** `<DatosDelCertificador>` trae
`<NIF>`, `<NIFEntidad>` y `<NombreyApellidos>`; vale cualquiera de los dos NIF, porque un técnico
puede ejercer en una empresa y firmar con su NIF personal mientras el expediente guarda el CIF de la
sociedad (regla 48.f). **Aviso, no fallo**: puede haberlo firmado un compañero de su despacho, pero
conviene saberlo antes de dar el visto bueno.

**Sin generador de calefacción NO es lo mismo en un RES080.** Allí la actuación es la envolvente, así
que una vivienda sin calefacción es un caso legítimo → aviso, no fallo. Los 3 certificados del corpus
de producción sin generador son RES080; dos de ellos (26RES080_67 y _77) declaran además
`rendimiento_id: 'default'` (η 0,92), o sea que el expediente SÍ supone una caldera que el certificado
no reconoce — eso es lo que el aviso saca.

**⚠️ Un `<Tipo>` o un `<VectorEnergetico>` que no esté en las tablas NO se clasifica.** Se devuelve
`null` y el informe lo dice: adivinar si un generador desconocido quema combustible es justo lo que no
puede hacer una comprobación que da o quita el visto bueno. Las tablas salen de contar el corpus (11
tipos y 6 vectores), no de deducirlas.

**⚠️ `99999999.99` significa «no consta»**, no un valor — sale en casi todos los
`<RendimientoNominal>` y en `<NumeroDePlantasSobreRasante>`. Tomarlo por bueno daría una caldera de
cien millones de kW.

**⚠️ Varios ficheros DECLARAN `encoding="UTF-8"` y están en ISO-8859-1.** Leídos como UTF-8, «Caldera
Estándar» sale con un carácter de reemplazo y deja de casar con el enum.
