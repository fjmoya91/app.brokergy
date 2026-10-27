<!-- conocimiento · área: documentacion-fotos · las rutas de los enlaces son relativas a la raíz del repo -->

## Sin la foto de la caldera EN SU SALA y la de su PLACA, no hay CEE inicial ni expediente (2026-10-23)

**Decisión de Fran (23/10/2026)**, «muy importante»: «la foto de la caldera se debe ver en la sala de
calderas instalada, que sea clara, no excesivamente cerca para que se vea el emplazamiento. Y también
la placa de la caldera. Sin eso no se puede generar un expediente, y de hecho sin eso no podríamos
generar un certificado de eficiencia energética inicial».

**El porqué.** Es lo que demuestra la situación de partida: que esa caldera existe, que está
INSTALADA (conectada, en servicio, en su sitio de esa vivienda) y cuál es. La placa da la marca, el
modelo, la potencia útil, el combustible y el año, de los que sale la fila de rendimiento (η) y con
ella el ahorro; el verificador la exige (sin ella el η no se sostiene: ERROR en `auditar-expediente`)
y el CEE inicial declara ese generador. Una caldera fotografiada de cerca, sin la sala, no prueba
que esté montada ni dónde: puede ser una caldera de exposición, de otra casa o ya desmontada.

**REGLA — dos fotos IMPRESCINDIBLES de la caldera que se sustituye (o se hibrida):**

1. **`FOTO_CALDERA_ANTES` — la caldera INSTALADA en su sala de calderas** (cuarto de calderas,
   cocina, garaje, galería: donde esté). **Clara** (enfocada, con luz, sin reflejos que la tapen) y
   **no demasiado cerca**: tiene que verse la caldera ENTERA y su EMPLAZAMIENTO —el cuarto, las
   tuberías y la salida de humos, lo que la rodea—. Un primer plano del frontal o del quemador NO
   vale como esta foto.
2. **`FOTO_PLACA_CALDERA_ANTES` — la placa de características LEGIBLE**: marca, modelo y potencia
   (y, si los tiene, combustible, año y nº de serie). Una etiqueta con solo el código de artículo,
   el esquema eléctrico de la tapa o una placa borrosa o cortada NO valen (26RES060_245, 22/10/2026).

**Sin las dos válidas:**

- **No se genera el CEE INICIAL** (skill `generar-cee-inicial`, el botón CE3X con IA) **ni se
  encarga a un técnico**: se piden primero.
- **El expediente no avanza**: al aceptar, el agente (regla 158) las pide antes que nada; ni
  `justificar-expediente` ni `rellenar-expediente` dan por buena una caldera sin ellas, y
  `auditar-expediente` lo marca como ERROR.
- **En el ALTA de la oportunidad** la simulación se hace igual (para eso basta con lo que diga el
  instalador), pero el informe y el aviso a Fran dicen que FALTAN y se prepara el WhatsApp que las pide
  (en borrador). **El CEE por bono bajo (regla 161) SÍ se hace sin ellas**: es un borrador `_REVISAR`
  para la simulación, para saber cuánto sale (Fran, el mismo 23/10/2026, al pedir los de 26RES060_OP335
  y OP336). El que se FIRMA y el expediente siguen necesitándolas.

**Lo que no se puede dar por bueno solo porque haya una foto en el apartado**: se MIRA cada foto.
El criterio del parte (`reforma_uploads`) cuenta ficheros, no los ve.

**Cuando no aplica**: una vivienda sin calefacción (`caldera: null`), o una caldera eléctrica o un
equipo que NO se retira ni se hibrida.

**REGLA — calefacción COMUNITARIA que se individualiza: el desmontaje se justifica con los
RADIADORES desmontados** (Fran, 25/10/2026, 26RES080_90: caldera comunitaria de gasóleo → 5 splits).
La caldera es del edificio, no está en la vivienda y no se desmonta, así que no hay foto de «caldera
antigua desmontada / hueco». En `FOTO_CALDERA_DESMONTADA` van los radiadores ya quitados (apilados
fuera) y las paredes con los soportes y las tomas taponadas donde estaban. Lo que prueba la baja de la
vivienda de la instalación comunitaria es que sus emisores ya no están.

**REGLA — el EQUIPO NUEVO puesto en el sitio de la caldera justifica que se ha desmontado** (Fran,
27/10/2026, 26RES060_221). Si la foto del después enseña el mismo rincón que la de la caldera del
antes —mismas paredes y franjas, sin la caldera ni su chimenea— con el equipo nuevo en su lugar (allí,
el aerotermo de ACS), esa foto vale para `FOTO_CALDERA_DESMONTADA` y no se pide otra, aunque sea la
misma que la del equipo nuevo: excepción a «cada imagen, una vez». Lleva un comentario del apartado en
el Anexo Fotográfico que lo explique. Junto con la caldera ya DESCONECTADA (Fran, 26/10/2026), son las
tres fotos que valen: el hueco, la caldera desconectada o el equipo nuevo en su sitio.

**Cómo se pide** (texto para el cliente o el instalador): «una foto de la caldera en su sitio, desde
un par de metros, que se vea entera y el cuarto donde está, y otra de cerca de la etiqueta con sus
datos (marca, modelo y potencia), que se lea bien».

Pendiente en la app (23/10/2026): el parte (`CEE_SIN_MATERIAL`) y el destino de los apartados siguen
tratando caldera y placa como fotos del EXPEDIENTE, no del certificado; ver
[para el certificado o para el expediente](docs/conocimiento/documentacion-fotos/para-el-certificado-o-para-el-expediente-no-es-lo-mismo.md).
