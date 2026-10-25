<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## Las fotos opcionales («Ahora no») y el equipo genérico con su antigüedad (2026-10-25)

Lo pidió Fran probando la 2026EXT_1: «que las fotos que sean opcionales quede claro y se pueda marcar
un *Ahora no*», y «en aire acondicionado, si se pone usar un equipo genérico, que permita seleccionar
la antigüedad con el mismo patrón que lo hace en CE3X».

### Qué es opcional

`opcional: true` en `SLOTS` ([cuestionario.js](implementation/frontend/src/certificadores/logic/cuestionario.js)):
el vídeo, las ventanas por dentro, la cubierta, los planos, el certificado anterior, «Otros» y **la
foto del equipo entero** (caldera, aerotermia, termo, unidad exterior del aire). Del equipo lo que
cuenta es **la placa**. No son opcionales las fachadas, los patios, las placas ni la foto de las
placas solares (es la única de ese equipo).

En pantalla ([Fotos.jsx](implementation/frontend/src/certificadores/obra/Fotos.jsx), `SlotFoto`): chip
gris «Opcional» y, mientras está vacío, un botón **«Ahora no»** a todo lo ancho. Al pulsarlo el
apartado se pliega («Ahora no. No hace falta para pedir el certificado.») con **«Subirla»** para
volver. Se guarda en `cuestionario.fotos_omitidas` (solo ids de apartados opcionales, sin repetir: lo
sanea `sanearCuestionario`; `omitirFoto` no deja omitir una placa).

La placa que falta sigue con su pregunta («¿No puedes subir ahora la placa del aire acondicionado?»):
«La subo ahora · **Ahora no, la subo luego** · Usar un equipo genérico» (`fotos_decision`).

**REGLA — la visita guiada se salta lo aparcado**: `siguienteDeLaVisita` no marca en naranja un
opcional con «Ahora no» ni la placa de un equipo que se sube luego o va con un genérico.

**REGLA — ninguna foto bloquea** (como antes): «Ahora no» solo pliega; el barrido no lo mira.

### El equipo genérico de una bomba de calor: la antigüedad de CE3X

Con «Usar un equipo genérico» en el **aire acondicionado** o la **aerotermia**
(`EQUIPOS_CON_ANTIGUEDAD`) sale «Antigüedad del equipo» con las tres opciones que da CE3X en
*Rendimiento estacional: Estimado según instalación* (`ANTIGUEDAD_EQUIPO`): **Posterior a 2013 ·
Entre 1994 y 2013 · Anterior a 1994**. Se guarda en `cuestionario.fotos_antiguedad[equipo]`. Sin
marcar, se pone la de la época de la vivienda.

Al generador y al equipo les llega en el resumen (`genericosDe`): «Equipo genérico (sin placa): el
aire acondicionado (antigüedad en CE3X: entre 1994 y 2013)». El admin lo enseña igual.

La caldera y el termo no la llevan: en CE3X su estimado no va por esas tres antigüedades (la caldera
ya tiene el año en `anio_calefaccion`).

### De paso

- «la placa **de el** aire acondicionado» → `placaDe(equipo)` contrae el artículo («del aire
  acondicionado») en la pregunta y en el aviso del barrido.
- Las placas solares no tienen apartado de placa: `estadoEquipos` las daba siempre por incompletas
  («Falta la placa de las placas solares»). Ahora un equipo sin apartado de placa queda completo con
  cualquier foto suya.

Tras tocarlo: `test_certapp_unidad.js` (saneado de `fotos_omitidas` y `fotos_antiguedad`,
`omitirFoto`, `placaDe`, `genericosDe`, la visita guiada y las placas solares) y
`test_certapp_rutas.js`.
