# Dos fotos que el verificador mira con lupa: la UNIDAD EXTERIOR, sola, y la CALDERA DESMONTADA, sin dudas

**Origen:** informe de inexactitudes del LOTE-2026-015 (Marwen, CAE-2035, 09/11/2026). Las dos son
«inexactitud importante»:

- **nº1 (26RES060_117, _156 y _176): «No queda suficientemente acreditada la inhabilitación de la
  caldera de combustión».** Las fotos de «caldera desmontada / hueco» no dejaban claro que fuera el
  mismo sitio de la caldera, ni que ya no estuviera.
- **nº5 (26RES060_157): «No queda justificada la situación anterior a la actuación».** En la foto de
  la unidad exterior salían **dos splits de aire acondicionado** junto a la bomba de calor, y el CEE
  inicial tenía un 0 % de superficie refrigerada. El verificador entendió que la situación inicial
  estaba incompleta. Eran de la cochera y de una cocinilla, fuera de la superficie habitable del CEE,
  y hubo que explicarlo en un escrito.

## 1. La unidad exterior, SOLA en la foto

- `FOTO_UNIDAD_EXTERIOR` se encuadra para que salga **solo la bomba de calor**: ni splits ni otras
  unidades exteriores al lado. Mira la foto; que haya un fichero en el apartado no basta.
- Si sale otro aparato, primero se pide otra foto encuadrada. Si no se puede (están en el mismo
  soporte), hay que saber a qué dan servicio:
  - **A la vivienda** → tienen que estar en el CEE inicial y en el final (máquina frigorífica, 3 kW cada
    una salvo que la placa diga otra cosa). Si el CEE tiene un 0 % de superficie refrigerada → **ERROR**:
    se corrige el CEE antes de presentar.
  - **A un espacio no habitable** (cochera, almacén, cocinilla, trastero) que el CEE deja fuera →
    **comentario** en el Anexo Fotográfico que lo diga. Comprueba antes que el CEE trata ese espacio como
    no habitable (p. ej. una «partición» con el garaje) y que la superficie habitable no lo incluye.

## 2. La caldera desmontada, sin dudas

Valen, y cuantas más mejor:

1. **El hueco, desde el mismo ángulo que `FOTO_CALDERA_ANTES`**, con referencias que se reconozcan:
   la misma pared, azulejo, cenefa, suelo u objetos, y lo que queda de la caldera (el soporte, las
   tomas taponadas, la salida de humos tapada). Un trozo de pared sin referencias no prueba nada.
2. **El equipo nuevo puesto en el mismo sitio** (Fran, 27/10/2026), con esas mismas referencias.
3. **La caldera ya desmontada, fuera** (en el almacén del instalador, en el contenedor) **con su placa
   legible**. Si el nº de fabricación es el de la placa del antes, es la misma caldera, retirada:
   26RES060_156, Ferroli Silent R K 25, nº 1203GC00601 en las dos placas.
4. **Refuerzo, no sustituto:** la baja del suministro de gas de la vivienda (la comunicación de la
   comercializadora). 26RES060_117: baja efectiva el 15/03/2026.

No vale: la caldera aún montada y conectada, otro cuarto que no se reconoce o una foto de la zona sin
ninguna referencia del antes.

**Siempre con un comentario** en el apartado del Anexo Fotográfico
(`documentacion.anexo_comentarios.FOTO_CALDERA_DESMONTADA`). Dice qué se ve y con qué foto del antes
se compara, citando los números del anexo, que vuelven a empezar en cada fase: «fotografía 03 de la
situación inicial», «fotografías 06 y 07 de este apartado». El verificador dijo que **indicándolo es
suficiente**.

**Cuidado con la palabra «reforma».** Si el cuarto de la caldera se rehízo (azulejo nuevo, tabique
movido), se dice que **se reformó el cuarto de calderas**. **Nunca** «se reformó la vivienda por
completo»: el verificador puede leer una rehabilitación integral y pedir un RES080 (Fran, 10/11/2026,
26RES060_176).

## 3. Cómo se piden

Sin emojis y sin presentarse; se lee antes el chat.

- **Al instalador** (lo hace él al terminar la obra):
  «Para el expediente necesitamos dos fotos más: *la unidad exterior sola*, encuadrada para que no
  salgan los aires acondicionados que pueda haber al lado, y *el sitio donde estaba la caldera*, desde
  el mismo sitio que la foto de antes, en la que se vea que ya no está (el hueco con las tomas
  taponadas o el equipo nuevo en su lugar). Si os habéis llevado la caldera, una foto de ella ya
  desmontada con la placa que se lea.»
- **Al cliente:** lo mismo en lenguaje de casa («la máquina nueva de fuera, que salga sola»; «el
  sitio donde estaba la caldera, desde donde hicisteis la foto de antes»).

Lo mismo dicen las ayudas de esos dos apartados en la app (`reformaUploadService.js`, `help` y
`LABEL_CLIENTE`).

## 4. Cuándo se mira

- Al **recibir** las fotos de fin de obra (`justificar-expediente`, `alta-oportunidad`): se miran y,
  si fallan, se piden en ese momento, no cuando lo levante el verificador.
- Al **generar el Anexo Fotográfico** (`generar-anexo-fotografico`): sin el comentario del apartado de
  la caldera desmontada no se da por listo.
- Al **auditar** (`auditar-expediente`, patrones 18 y 19).
