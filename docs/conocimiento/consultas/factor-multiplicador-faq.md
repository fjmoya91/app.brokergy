<!-- conocimiento · área: consultas · las rutas de los enlaces son relativas a la raíz del repo -->

## FAQ del FACTOR MULTIPLICADOR (RES060_FM y demás): las dudas de la Resolución publicada (07/11/2026)

Resolución DGPLACE de 3/11/2026, **BOE-A-2026-23367** (BOE núm. 278, 7/11/2026; en vigor el 8/11/2026).
PDF en el Drive: «01. RD 36-2023 (CAES) / 00. NORMATIVA / 00. NORMATIVA NACIONAL / 01. CONSOLIDADA /
07-11-2026 - FACTOR MULTIPLICADOR AEROTERMIA.pdf». El análisis completo (qué cambia respecto al borrador,
documentación, qué tiene que hacer la app) está en
[factor-multiplicador-la-resolucion-publicada-res060-fm.md](docs/conocimiento/calculo/factor-multiplicador-la-resolucion-publicada-res060-fm.md).

**Cómo se lee esta FAQ.** Una entrada por pregunta, con los apartados de siempre de las consultas. Lo que
dice la Resolución se cita por ficha, apartado y página: «p. N» es la página del PDF (1–153) y la del BOE
es 149980 + N. La **interpretación** va aparte, y también **lo que la Resolución no dice**. Si hace falta
preguntar al MITECO, la pregunta está al final, en «Consultas para el MITECO». No se ha enviado ninguna.

---

### 1. ¿La aerotermia tiene que dar también el ACS para ir por FM? (07/11/2026)

**Respuesta corta:** **sí**, según la lectura prudente. Una aerotermia que solo da calefacción, con el
agua caliente en un termo o en la caldera, **no entra en la vía FM**. Va por la RES060 vigente.

**Lo que dice la Resolución:**
- RES060_FM, ap. 1 (p. 6): «La bomba de calor deberá ser hidrónica (aire-agua, agua-agua o tierra-agua),
  para poder satisfacer completamente la demanda de calefacción y el agua caliente sanitaria (ACS)». Lo
  mismo en el ap. 1 de RES090_FM…RES099_FM. La RES062_FM, ap. 2.d (p. 15), lo dice sin rodeos: la
  bomba «debe satisfacer la demanda en calefacción y agua caliente sanitaria de todo el edificio».
- El **borrador** añadía «; o la demanda de uno de estos servicios cuando sean independientes» (ficha
  RES060FC, ap. 1, y también en las hibridaciones). La versión publicada **lo quita en todas las fichas**.
- La fórmula (ap. 4, p. 8) **siempre** suma `D_ACS · (1/η_i − 1/SCOP_dhw)`. No hay ninguna casilla
  para dejarlo fuera. D_ACS = d_ACS · S (Anexo III, p. 12): 11 kWh/m²·año, o 16 en un centralizado.
- Declaración del instalador (ap. 3.1, p. 7): «Piso con sistema individual **de calefacción y ACS**»;
  «Edificio con sistema centralizado **de calefacción y ACS**».
- Para comparar, la RES060 vigente dice «para calefacción **y/o** ACS».

**Interpretación:** se quitó a propósito la frase que admitía un solo servicio. Además, sin ACS no hay
SCOP_dhw y la fórmula no se puede rellenar. La otra lectura es que «para poder satisfacer» solo exige un
equipo *capaz* de dar los dos servicios. Es una lectura débil frente al cambio respecto del borrador y no
conviene apostar un expediente a ella.

**¿Es 100 % obligatorio? No está escrito como tal** (Fran lo preguntó el 07/11/2026). Tres cosas lo dejan
en duda:
- En la RES060_FM la frase está en el **ámbito** (ap. 1). No está en los **Requisitos** (ap. 2) ni en las
  **Exclusiones**. Lo que se exige es que la bomba sea **hidrónica**, y el «para poder satisfacer» es el
  motivo. Lo único que lo dice como obligación expresa es la RES062_FM («debe satisfacer»).
- Las **hibridaciones** (RES09x_FM, ap. 2 y nota 2) admiten literalmente dar ahorro a un solo servicio.
  Dicen «para que puedan asignarse ahorros a los dos servicios… deberá operar en modo bivalente
  paralelo» y hablan de «cada uno de los servicios para los que se consignen ahorros». Esa frase ya
  estaba en el borrador, junto a la de «independientes», y se quedó al quitar la otra.
- La documentación (13 puntos) no pide ninguna prueba específica de que la bomba dé el ACS. Solo pide
  el SCOP_dhw entre las variables del certificado de instalación.

Lo que pesa más es la frase quitada y la fórmula sin opción. Es la lectura más probable, pero quien lo
decide es el verificador y, en último término, la DGPLACE. Por eso va en la consulta 1.

**Decisión de Fran (07/11/2026): «Que sea un aviso».** En la app, una vía FM sin ACS **no se bloquea**.
La cifra sale con el aviso de que hay que añadir el depósito de ACS al presupuesto para ir por esta
vía. Pasado a la sesión del motor.

**Lo que NO dice:** qué η se usa si antes el ACS lo daba un **termo eléctrico** y la caldera solo daba
calefacción. La fórmula tiene un único η_i, el de la caldera sustituida. La nota (9) (p. 9) dice: «En el
caso de que se sustituyan varias calderas, se considerará el de la caldera que tenga un rendimiento más
alto». En la RES062_FM, nota (1) (p. 15), el termo cuenta como «caldera eléctrica» (efecto Joule); en la
RES060_FM no se define así.
- **Lectura prudente:** η_i = el de la caldera de combustión, porque en la RES060_FM el termo no es una
  «caldera». Pero hay que dejarlo dicho en el expediente y preguntarlo (consulta 1). Si el verificador
  aplicara la nota (9) con el termo (η = 1), afectaría también a la calefacción, y el ahorro bajaría mucho.

**Efecto en la app:** la regla 163 (sin ACS declarado, el ACS no se calcula) vale para la vía
**vigente**. En la vía **FM**, el ACS es un **requisito**. Si el presupuesto no trae equipo o depósito
de ACS, Oportunidades tiene que mostrar la vía FM como «no aplica: la aerotermia tiene que dar también el
ACS», o avisar de que hay que añadir el depósito. Esto le toca a la sesión del motor, con el «sí» de Fran.

---

### 2. D_cal del CEE posterior: ¿vale nuestro CEE final (copia del inicial con las instalaciones cambiadas)? (07/11/2026)

**Respuesta corta:** **sí**, siempre que sea un CEE de verdad **posterior a la obra**, con la aerotermia
instalada y **registrado**. Una sustitución de caldera no cambia la demanda de calefacción, así que el
final *tiene* que dar la misma que el inicial. Es lo que ya exigimos (el popup «DEMANDA CEE INICIAL ≠
FINAL»).

**Lo que dice la Resolución:**
- Anexo IV (p. 12): D_cal es «el valor que arroje el certificado de eficiencia energética posterior a la
  actuación, y en concreto en el anexo II de dicho certificado». En **unifamiliar**:
  `D_cal = mín(D_cal CEE ; 2 × tabla)`. En el resto, la del CEE sin tope. Lo mismo en cada hibridación
  (p. 29, 38, 47…).
- Anexo III (p. 12): S, la del CEE posterior.
- Doc. 11 (p. 8): «Copia del certificado de eficiencia energética del edificio posterior a la actuación,
  registrado». La RES060_FM **no pide CEE previo**. La RES080_FM sí (docs. 8 y 9, p. 21).

**Interpretación:**
- La demanda de calefacción (kWh/m²·año) depende de la envolvente y del uso, **no del generador**. En
  una RES060 la envolvente no cambia: un final que se aparte del inicial estaría mal hecho, no «más
  posterior». El «anexo II» del CEE es la página «Calificación energética del edificio», donde va la
  demanda de calefacción en kWh/m²·año.
- Si se va **solo** por FM, el CEE inicial no hace falta registrarlo. Sigue siendo útil como modelo para
  simular y para copiar el final. El final lo firma el técnico como certificado posterior a la obra, con
  su visita.
- En **pisos no hay tope**: el bono depende al 100 % de la D_cal del CEE, y es lo primero que mirará el
  verificador. En unifamiliar, el tope ×2 de la tabla lo acota.
- La D_cal sale del CE3X con el que se haga el final (3.2 vigente), y 2.3 y 3.x dan demandas distintas
  para el mismo edificio.

**Lo que NO dice:** qué pasa si hay un CEE previo con otra demanda (no lo pide, así que no lo compara).

**Efecto en la app:** nada nuevo. Ya estaba previsto: D_cal del CEE final, con el tope ×2 en
unifamiliar. En Oportunidades, sin CEE final, la cifra es provisional y la definitiva la da el final.

---

### 3. ¿Caldera eléctrica o de biomasa por FM? (07/11/2026)

**Respuesta corta:**
- Gas natural, **GLP/propano** y gasóleo: **sí**.
- **Combustible sólido (carbón o biomasa): NO va por FM.** Va **siempre por la RES060 de siempre**.
  Decisión de Fran (07/11/2026): «si es carbon, biomasa, es decir solido, siempre a la normal». Antes, en
  la sesión del carrusel, había dicho que el carbón entraba; esta decisión la sustituye.
- Caldera eléctrica: la ficha **la admite**, pero el cuerpo de la Resolución habla de combustible fósil.
  Hay que **consultarlo antes de prometerla**.

**Lo que dice la Resolución:**
- Primero b) (p. 1): actuaciones en las que «se sustituya la caldera de combustión que utiliza
  **combustible fósil**». Tercero a) (p. 3): «caldera de combustión fósil».
- RES060_FM, ap. 1 (p. 6): «Sustitución de la caldera, **de combustión o eléctrica**».
- Anexo II (p. 11): filas de gas (sin distinguir natural o GLP), de gasóleo y «**Caldera eléctrica
  100 %**». **Ya no hay combustible sólido**: el borrador tenía cuatro filas y la publicada ninguna.
- RES062_FM, nota (1) (p. 15): la eléctrica es la «de efecto Joule. Ejemplos: caldera eléctrica, termo
  eléctrico, hilo radiante, radiadores eléctricos».

**Interpretación:**
- **Biomasa**: no es fósil y el Anexo II no le da rendimiento, así que **no se puede calcular**. Fuera.
- **Carbón**: es fósil, así que cabría en el Primero b). Pero no tiene rendimiento en la ficha:
  - la nota (8) (p. 9) manda «Tomar el valor del anexo II»;
  - el Anexo II publicado no tiene ninguna fila de combustible sólido. El borrador tenía cuatro (55–65 %)
    y las quitaron.

  Sin η que salga de la ficha, el verificador lo puede rechazar. **Fran decide** que todo sólido va por
  la RES060 de siempre, que lo admite («caldera de combustión») con el η de su tabla. No se pregunta al
  MITECO.
- **Eléctrica**: la ficha la nombra y le da η = 1 en su Anexo II. Las fichas son la regla concreta y las
  aprueba la misma Resolución (Quinto, p. 4), así que pesan. Aun así es una contradicción con el
  Primero b), y un verificador la puede discutir.
  - Lo que hay en juego, con un unifamiliar de 100 m², D_cal 100, SCOP 3,2 y SCOP_dhw 2,8:
    `[10.000·(1 − 1/3,2) + 1.100·(1 − 1/2,8)]·2 = [6.875 + 707]·2 = 15.164 kWh`.
  - Con gas al 85 % serían
    `[10.000·(1/0,85 − 1/3,2) + 1.100·(1/0,85 − 1/2,8)]·2 = [8.640 + 901]·2 = 19.082 kWh`.
- **Radiadores eléctricos o acumuladores** (sin caldera): en la RES060_FM no, porque habla de
  «caldera». En la RES062_FM sí (efecto Joule).

**Lo que NO dice:** si la eléctrica cabe pese al Primero b). Consulta 2.

**Efecto en la app:** el motor ya avisa con biomasa o eléctrica (texto del borrador). Con lo publicado
y la decisión de Fran, la vía FM debería salir así:
- **cualquier sólido** (carbón, biomasa, pellet, leña): **no aplica**, por la RES060 vigente;
- eléctrica: con aviso «pendiente de consulta».

El carrusel para instaladores tiene que decir lo mismo: «gas o gasóleo» por FM, y «carbón o biomasa, por
la ficha de siempre».

---

### 4. RES080_FM: ¿la fórmula pondera al revés? (07/11/2026)

**Respuesta corta:** **sí**. Leída al pie de la letra, la parte que **menos** ahorra es la que más se
multiplica. Parece un error de concepto, pero **es la fórmula publicada**: se calcula **literal** y se
pregunta.

**Lo que dice la Resolución** (RES080_FM, ap. 4, p. 22):

`AE = (EF_i − EF_f) · (f_M·EF_simBC + EF_simRest) / (EF_simBC + EF_simRest)`

- EF_simBC = «consumo de energía final del edificio […] considerando **únicamente** la sustitución de la
  caldera por la bomba de calor».
- EF_simRest = el consumo con el resto de actuaciones, «manteniendo la caldera existente».
- Los dos CEE simulados (docs. 10 y 11, p. 21) se hacen con la misma herramienta. A diferencia del
  previo y del posterior (docs. 8 y 9), **no** se pide que estén registrados.

**Interpretación:** el cociente es una media ponderada entre f_M y 1, y el peso de f_M es EF_simBC, que
es un **consumo**. Cuanto más ahorra la bomba, menor es EF_simBC y menos pesa f_M. Lo coherente sería
ponderar con los **ahorros**, (EF_i − EF_simBC) y (EF_i − EF_simRest).

Ejemplo: unifamiliar (f_M = 2), con EF_i 25.000, EF_f 6.000, EF_simBC 9.000 y EF_simRest 17.000 kWh/año.
- **Literal:** `(2·9.000 + 17.000) / (9.000 + 17.000) = 35.000/26.000 = 1,346` →
  `AE = 19.000 · 1,346 = 25.577 kWh`.
- **Ponderando con ahorros** (16.000 de la bomba y 8.000 del resto): `(2·16.000 + 8.000)/24.000 = 1,667`
  → `31.667 kWh`.
- La literal da un **19 % menos** cuando lo que más ahorra es la bomba, que es nuestro caso típico
  (gasóleo → aerotermia + ventanas). Cuando ahorra más la envolvente, la literal da más.

**Lectura prudente:** la **literal**. Es la que aplicará el verificador, nunca pasa de f_M·(EF_i − EF_f)
y nunca baja de (EF_i − EF_f). Consulta 3.

**Lo que NO dice:** si EF incluye todos los usos (calefacción, ACS, refrigeración…). Dice «consumo de
energía final anual del edificio», en kWh/año, así que se entiende que es el total.

**Efecto en la app:** si se implementa la RES080_FM, con la fórmula literal (sesión del motor). Si se
quiere, la ponderada por ahorros puede salir **solo** como referencia.

---

### 5. Erratas del texto publicado (07/11/2026)

**Respuesta corta:** hay varias. Solo dos afectan a qué ficha se usa, y las dos son de hibridación en
**modo alternativo**:
- en **A3/A4** la «alternativa» publicada es en realidad la paralela;
- en **E1**, el código de la alternativa lleva título de «paralelo».

Para nosotros (paralelo en C y D) no cambian nada.

**Lo que dice la Resolución:**

| Dónde | Errata | Qué se entiende |
|---|---|---|
| RES095_FM (p. 68–76) | El título dice «alternativo», pero el código es «**RES095FC**», el ámbito dice «modo **paralelo**», el requisito «bivalente paralelo» y la tabla de C_b es la «paralela» | Es una **copia de la RES090_FM**: en A3/A4 **no hay tabla de modo alternativo** |
| RES099_FM (p. 104–112) | El título dice «modo **paralelo**», pero el cuerpo, el requisito y la tabla son de modo **alternativo** | Es la alternativa de E1; la paralela de E1 es la RES094_FM |
| RES099_FM-S (p. 148–150) | Título «paralelo»; la tabla se rotula «paralela… zona E1 y **E2**», pero remite al anexo V de la RES099_FM | Alternativa de E1 (no existe zona E2) |
| RES080_FM (p. 20–21) | Título «RES080:»; el doc. 2 remite al «anexo I de esta ficha»; el doc. 6.c remite a la fórmula del «apartado 3» | Código RES080_FM; vale el **Anexo A** (Quinto, p. 4: sustituye al anexo I en todas las fichas); la fórmula está en el apartado 4 |
| RES060_FM, doc. 7 (p. 8) / RES062_FM, doc. 8 (p. 16) | «factura justificativa del punto 5» / «del punto 6» | Son el 6 y el 7 |
| RES062_FM, exclusiones (p. 15) | «Las instalaciones realizadas en zonas climáticas» (frase cortada) | Climas α, como en la RES060_FM |
| Segundo b) (p. 2) y RES091_FM_S (p. 124) | «RES060FM», «RES062FM», «RES091_FM_S» | RES060_FM, RES062_FM, RES091_FM-S |

**Interpretación:** en la solicitud se pone la ficha que corresponde **por el contenido** (zona y modo).
El Séptimo (p. 5) dice que se usarán «las fichas habilitadas»: lo que mande la plataforma del MITECO
cuando publique sus formularios resuelve el código. Consulta 4, solo si llega una hibridación
alternativa en A3/A4 o en E1.

**Efecto en la app:** ninguno para nuestros casos. Los códigos de la vía FM del expediente son
RES060_FM y, en hibridación paralela, RES09x_FM de su zona.

---

### 6. Una obra ya presentada con la ficha vigente y sin resolver: ¿se puede retirar y presentar por FM en 2027? (07/11/2026)

**Respuesta corta:** la Resolución **no lo prohíbe** mientras no esté resuelta favorablemente. Pero hay
dos trampas: el **silencio positivo** a los 15 días, y que hace falta un **dictamen nuevo** y toda la
documentación FM. **No se desiste de nada sin respuesta escrita del MITECO.** Y solo sirve para obras con
factura posterior al 22/03/2026.

**Lo que dice la Resolución:**
- Primero f) (p. 2): «Únicamente se podrá solicitar la aplicación del coeficiente […] una vez por cada
  actuación. Las solicitudes de emisión de CAE **ya resueltas favorablemente** desde la publicación del
  Real Decreto-ley 7/2026 […] no se podrán volver a presentar».
- Primero g) (p. 2): solo actuaciones iniciadas desde el 22/03/2026 (vale la factura posterior a esa
  fecha).
- Séptimo (p. 5): se presenta del 15/01/2027 al 31/12/2027, «con las fichas habilitadas» y «toda la
  documentación necesaria».

**Lo que dice el RD 36/2023:**
- Art. 13.1: la solicitud va con el **dictamen favorable del verificador**.
- Art. 13.2: el Gestor Autonómico tiene **15 días** (estandarizadas) y «el silencio administrativo
  tendrá carácter **estimatorio**».

**Lo que NO dice:** nada sobre desistir de una solicitud en trámite.

**Interpretación:**
- Por la letra, solo está vedado lo **resuelto favorablemente**. El solicitante (el **Sujeto Obligado**,
  no nosotros) puede **desistir** de su solicitud (art. 94 Ley 39/2015; desistir no es renunciar al
  derecho) y volver a presentar la actuación por FM desde el 15/01/2027.
- **Primera trampa, el silencio:** si han pasado los 15 días (descontando la suspensión mientras dura un
  requerimiento, art. 22.1.a Ley 39/2015), la solicitud puede estar **estimada por silencio**. Eso
  «tiene a todos los efectos la consideración de acto administrativo finalizador del procedimiento»
  (art. 24.2 Ley 39/2015), y entonces se podría tener por «resuelta favorablemente». Son días
  **hábiles** (art. 30 Ley 39/2015). Los lotes subidos el 09/10/2026, con el requerimiento del 26/10 y
  la subsanación del 27/10 en medio, ya los habrían cumplido a primeros de noviembre. El del 23/10, a
  mediados de noviembre
  ([el registro MITECO](docs/conocimiento/lotes/el-registro-miteco-y-los-requerimientos-del-gestor.md)).
- **Segunda trampa, el coste:** hace falta un dictamen nuevo del verificador con la ficha FM y la
  documentación FM que no se pidió entonces:
  - vivienda habitual (facturas del invierno anterior);
  - oferta de mantenimiento con aceptación o desistimiento;
  - consentimiento del IRPF;
  - certificado de inercia del fabricante…

  Y además hay que entrar en el cupo, que va por **fecha de resolución**.
- Un lote es una sola solicitud con varias actuaciones. Desistir de una actuación suelta dentro de un
  lote no está previsto: habría que preguntarlo.

**Lectura prudente:**
- Para lo **ya presentado**: no tocar nada sin consulta (consulta 5).
- Para lo **no presentado** que cumple FM (factura desde el 22/03/2026, vivienda habitual, ACS por la
  bomba): decidir **antes** de meterlo en un lote, comparando el bono vigente (cobro ya) con el FM (cobro
  en 2027 y con riesgo de cupo).

**Efecto en la app:** ninguno. Es una decisión por expediente. Si Fran quiere, se puede sacar la lista
de los expedientes en lotes presentados con factura posterior al 22/03/2026, que son los únicos
candidatos.

---

### 7. ¿Las fichas FM sustituyen a las de siempre, o con carbón o biomasa se puede seguir por la RES060 de siempre? (07/11/2026, Fran)

**Respuesta corta:** **no las sustituyen; conviven.** La vía FM es **opcional**: es la que hay que usar
para cobrar el factor. La RES060 vigente (y la RES093, la RES080…) sigue en el Catálogo.
- **Carbón y biomasa (todo sólido): siempre por la RES060 de siempre**, que los admite. Decisión de
  Fran, 07/11/2026 (punto 3).

Lo único que cambia en TODAS las fichas es la declaración de ayudas: el **Anexo A** sustituye al
anexo I.

**Lo que dice la Resolución:**
- Segundo (p. 2): «Para que sobre los ahorros […] se puedan aplicar los coeficientes de corrección, será
  necesario: a) Cumplimentar las siguientes fichas». Las FM son el camino para **el factor**, no el
  único para el CAE.
- Quinto (p. 4): aprueba las fichas FM, que «se incluirán en el Catálogo». No deroga ninguna. Lo único
  que sustituye es el anexo I por el **Anexo A**, «que se aplicará a todas las fichas del Catálogo».
- Primero d) y f) (p. 2): cupo limitado (cuando se agota, no hay factor), y lo presentado con la ficha
  vigente y resuelto favorablemente no se puede volver a presentar. Las dos cosas solo tienen sentido si
  la ficha vigente sigue usándose a la vez.
- Séptimo (p. 5): «En la solicitud de emisión de CAE **con coeficiente de corrección** se deberán
  utilizar las fichas habilitadas para ello».
- RES060 vigente (V1.1), ap. 1: «Sustitución de la caldera **de combustión**» por bomba de calor (también
  aire-aire), «para calefacción y/o ACS». No distingue combustibles, así que biomasa y carbón caben.

**Interpretación:** cada actuación elige vía.

| | RES060 vigente | RES060_FM |
|---|---|---|
| Bono | El de siempre | ×2 unifamiliar, ×2,5 piso |
| Cuándo se cobra | Ya | Desde el 15/01/2027, y si queda cupo |
| CEE | Pide el CEE inicial | Pide el CEE posterior (no el inicial) |
| Requisitos de más | — | Vivienda habitual, ACS por la bomba, mantenimiento, consentimiento del IRPF… |
| Biomasa y carbón (sólidos) | **Sí, siempre por aquí**: η de la tabla, 0,60 la automática (regla 169) | **No** (decisión de Fran) |
| Caldera eléctrica | **No** («caldera de combustión») | La ficha la admite, pendiente de consulta (punto 3) |
| Aire-aire | Sí | **No** (solo hidrónica) |

**Lo que NO dice:** si, cuando se agote el cupo o se deniegue el FM, se puede volver a presentar la misma
actuación por la ficha vigente. No lo prohíbe: lo único vetado es lo resuelto favorablemente.

**Efecto en la app:** ninguno nuevo. Ya estaba previsto que Oportunidades enseñe las dos vías para
elegir, y la biomasa sigue calculándose por la vigente como hasta hoy.

---

### 8. ¿Se ha quitado lo de los 15 litros de inercia por kW? (07/11/2026, Fran)

**Respuesta corta:** **sí**. Ya no hay un mínimo fijo de litros por kW. Lo que se pide ahora es un
**certificado de que la inercia es la que exige el fabricante**, con los litros y los L/kW de la
instalación.

- **Borrador:** en la RES060FC, «depósito de inercia cuyo volumen mínimo (externo o incorporado) será al
  menos de 15 litros por cada kW de potencia térmica nominal». En las hibridaciones, lo mismo
  («excepto para instalaciones centralizadas»), además de exigir depósito de inercia o acumulador.
- **Publicada, RES060_FM, documento 3.c (p. 7):** certificado de que la instalación «dispone de la
  inercia hidráulica necesaria para garantizar el correcto funcionamiento de la bomba de calor en todas
  las condiciones de operación previstas, de acuerdo con las especificaciones del fabricante», con el
  volumen de agua total (litros) y el volumen específico (l/kW). **No hay cifra mínima:** manda el
  manual de cada máquina.
- **Hibridaciones publicadas (RES090_FM…RES099_FM):** **no piden nada de inercia**, ni requisito ni
  certificado. Tampoco la RES062_FM ni la RES080_FM.

**Efecto en la app:** el certificado va **dentro del CIFO**. Fran: «así usamos un único documento que
es el CIFO». En un `26RES060FM_N` el CIFO lleva una hoja «Certificado de inercia hidráulica de la
instalación» con:
- los litros que declara el instalador, que se teclean en Instalación;
- la potencia nominal de la bomba;
- el volumen específico, que se calcula.

Solo la RES060_FM: no se pide en hibridación. «Generar CIFO» no deja seguir sin los litros. El
instalador tiene que mirar en el manual de la máquina el volumen mínimo que pide, que cambia de un
fabricante a otro. Si se teclea ese mínimo, la app avisa cuando la instalación no llega. El detalle,
en «La inercia (punto 3.c) va DENTRO del CIFO» de
`docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md`.

---

### Consultas para el MITECO (buzón del sistema CAE) — borrador, sin enviar

1. **ACS.** En la RES060_FM y en las RES09x_FM, ¿es requisito que la bomba de calor dé también el ACS?
   ¿Se puede aplicar el factor a una bomba que solo da calefacción con D_ACS = 0? Si antes del cambio el
   ACS lo daba un termo eléctrico y la caldera solo calefacción, ¿qué η_i se usa? ¿Cuenta el termo como
   «caldera» a efectos de la nota (9)?
2. **Caldera eléctrica.** La RES060_FM (ap. 1 y Anexo II) admite la caldera eléctrica (η = 100 %), y el
   apartado Primero b) de la Resolución habla de calderas de combustible fósil. ¿Se admite la sustitución
   de una caldera eléctrica por bomba de calor en la RES060_FM? (El carbón no se pregunta: por decisión
   de Fran, los sólidos van siempre por la RES060 vigente.)
3. **RES080_FM.** La fórmula pondera con los consumos simulados (EF_simBC, EF_simRest). ¿Es correcta tal
   cual, o la intención era ponderar con los ahorros (EF_i − EF_simBC, EF_i − EF_simRest)? ¿Los dos CEE
   simulados tienen que registrarse?
4. **Códigos.** La RES095_FM se publica con el código «RES095FC» y el contenido de la paralela; la
   RES099_FM, con título de paralelo y contenido alternativo. ¿Qué ficha se usa para una hibridación en
   modo alternativo en A3/A4, y cuál en E1?
5. **Ya presentadas.** Una solicitud de emisión de CAE presentada con la ficha vigente y aún no resuelta
   expresamente, ¿puede el solicitante desistir y volver a presentar la misma actuación por la RES060_FM
   desde el 15/01/2027? ¿Una solicitud estimada por silencio (art. 13.2 RD 36/2023) cuenta como «resuelta
   favorablemente» a efectos del apartado Primero f)?

### Fuentes

- Resolución DGPLACE de 3/11/2026, BOE-A-2026-23367 (Drive, ruta arriba).
- Borrador: «Propuesta de Resolución DGPLACE BOBMAS DE CALOR.pdf» (Drive, 03. CONSULTAS PÚBLICAS).
- Ficha RES060 vigente: «Ficha RES060_actual.pdf» (misma carpeta).
- RD 36/2023 consolidado, art. 13 (Drive, 01. CONSOLIDADA).
- Ley 39/2015, arts. 22, 24 y 94.
