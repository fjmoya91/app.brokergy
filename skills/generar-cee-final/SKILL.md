---
name: generar-cee-final
description: 'GENERA el CEE FINAL (.cex de CE3X 3.2, con su XML y su PDF) de un expediente CAE. RES060 (sustitución): COPIA el CEE inicial del técnico, le cambia las instalaciones por las INSTALADAS (las del expediente) y, si no hay placas, le pone como medida de mejora el AUTOCONSUMO máximo mes a mes sacado del XML del propio final (PVGIS, fotovoltaica a 1.000 €/kWp). RES093 (hibridación): desde la MEDIDA DE MEJORA del inicial, retirando la caldera que quedó en apoyo. RES080 (reforma): el final lleva TODO lo que ha cambiado (ventanas, aislamientos, instalaciones), por el camino del PREVISTO. Deja `{nº} - CEE FINAL_REVISAR.cex/.xml/.pdf` en «1. CEE / CEE FINAL». Úsalo cuando el usuario diga "haz / genera el CEE final de NNN", "prepárame el CEE final para visto bueno y firmar".'
---

# Generar el CEE final

## RES060: se COPIA el inicial (decisión del usuario, 08/10/2026 — «grabado a fuego»)

Cuando el usuario pide el CEE final de un **RES060**, el procedimiento es SIEMPRE este, sin
preguntarlo (solo se preguntan las fechas de visita y emisión):

1. **Se copia el CEE INICIAL del técnico** (el `.cex` de «1. CEE / CEE INICIAL» sin `_REVISAR`): su
   envolvente, sus datos, su técnico y sus imágenes, tal cual.
2. **Se cambian las INSTALACIONES por las que se han INSTALADO de verdad**: las del expediente, ya
   corregidas por placas y facturas (no las de la medida de mejora que tecleó el técnico). El
   generador viejo se retira; el ACS de otra máquina va como segundo equipo con el depósito.
3. **Si la vivienda no tiene placas, la medida de mejora es el AUTOCONSUMO, el MÁXIMO que se permite
   MES A MES**: primero se califica el final SIN medida para tener SU XML; de ese XML sale el consumo
   eléctrico de cada mes (no del inicial: con una caldera de gasóleo casi no hay electricidad y la
   potencia sale ridícula); los kWp, con PVGIS, para el 90 % del consumo eléctrico anual del final;
   y cada mes se declara lo menor entre producción y consumo. Al calificar, CE3X recorta los meses
   que aún se pasen de SU consumo y ese `.cex` ajustado es el que se sube (regla 126).
4. **Inversión del autoconsumo: 1.000 € por kWp** (con 25 años de vida útil).
5. **Si el catálogo no tiene el SEER de la bomba, se pone el EER de su ficha técnica** (en
   `PATCH /api/aerotermia/:id/datos-rite`, campo `seer`): con suelo radiante o splits la bomba da
   frío y sin SEER saldría sin refrigeración (regla 72).
6. **En la versión vigente de CE3X (3.2)**. Un inicial de la 2.3 o la 3.1 se convierte al copiarlo.

```bash
# desde implementation/backend · motor levantado · CE3X 3.2 en el PC
node scripts/cee_final_copiando.js 26RES060_178 --fecha=2026-10-08            # en seco (califica, no sube)
node scripts/cee_final_copiando.js 26RES060_178 --fecha=2026-10-08 --escribir # .cex/.xml/.pdf a Drive + aviso
```

`node scripts/cee_final.js <RES060>` lleva aquí solo (con los mismos argumentos); `--desde-medida`
fuerza el camino viejo. Opciones: `--fecha-visita=`, `--version=` (3.2 por defecto), `--base=ruta.cex`
(copiar otro inicial), `--guardar=ruta.cex` (copia local), `--sin-aviso`. Fuente única:
`services/cee/ceeFinalCopiando.js` (encadena `componerFicha` → motor `/cex/instalaciones` →
`cexAPdf.calificarCex`, dos vueltas). Las fechas del informe son las del FINAL (las del inicial no
pasan; sin fecha, en blanco y avisado) y el texto de las pruebas del técnico se respeta.

El informe dice: de qué inicial parte, las instalaciones escritas (con sus %), la calificación SIN
medida (es la del certificado), los kWp, los kWh declarados mes a mes, cuántos meses ajustó CE3X
(antes → después), la inversión y los enlaces. Caso: **26RES060_178** (08/10/2026) — Extensa S 10
(453 % cal. · 280 % ref. con el EER de la FT) + Aeromax ACS → B (19,3) / C (113,92); autoconsumo
10,61 kWp · 10.610 € · 12.074 → ~12.012 kWh (CE3X ajustó mayo, junio y octubre).

## RES080 (reforma): el final lleva TODO lo que ha cambiado

En un RES080 la obra toca la envolvente, así que el final no es «el inicial con otra máquina»: es la
vivienda con **toda** la reforma hecha. Es el mismo camino que el **PREVISTO** (regla 117, skill
`generar-cee-inicial`, bloque `previsto` del plan, motor `/cex/previsto`), pero con lo que se ha
hecho DE VERDAD:

- **Qué cambia** lo dicen las marcas «- CAMBIA» del plano (regla 66): ventanas, paredes que se
  aíslan, la parte de la cubierta que se rehace. Compruébalo contra las FACTURAS y las fotos del
  después: si se cambiaron más o menos ventanas que las presupuestadas, se corrige antes.
- **Ventanas nuevas** a «Conocidas», con los datos de SU ficha o factura (U marco, U vidrio, g,
  % de marco, permeabilidad); sin datos, U marco 1,3 · U vidrio 1,3 · g 0,43 · 20 % · clase 3. Una
  puerta conserva su % de marco.
- **Lo aislado** con su U nueva en «Conocidas» — **la U se PREGUNTA (o λ y espesor), nunca se
  supone**; una medianera no se aísla y un suelo contra el terreno no admite U conocida.
- **Ventilación 0,53** y **masa «Ligera»**, siempre.
- **Instalaciones**: las INSTALADAS (como en el RES060), con el SEER ← EER de la FT si falta.
- **Fechas de visita y emisión del final** y, si no hay placas, **la medida de AUTOCONSUMO máximo mes
  a mes** con el XML de ese final, a 1.000 €/kWp, como en el RES060. En CE3X 3.2.

Hoy no hay un comando único para el final de un RES080: se hace el previsto con los datos reales
sobre el inicial REVISADO del técnico (ver `generar-cee-inicial`, «RES080: el INICIAL y el
PREVISTO»), y las fechas y la medida de autoconsumo se ponen después. **Dilo** en el informe y
pregunta antes de improvisar otro camino.

## RES093 (hibridación): desde la medida de mejora del inicial

El CEE final no se levanta de cero: se abre el **CEE inicial que entregó el certificador** (el que ya
pasó la revisión, con su medida de mejora **calculada** por CE3X) y su «edificio mejorado» pasa a ser
el final. Es como se hace a mano, y la app lo hace igual:

- **Todo sale por la MISMA función que el botón** «Generar» de la fila del CEE final
  (`services/cee/ceeFinalDesdeMedida.js` → motor `/cex/final-desde-medida` →
  `cee-engine/tools/cee_final.py`). El `.cex` de la skill y el del botón no pueden diferir.
- **La instalación del final es la de la medida del técnico, tal cual**, equipo a equipo, con sus
  porcentajes y superficies. No se recompone desde el expediente (otro C_b, otro slot, otro reparto
  del frío darían un final distinto del que se revisó).
- **SALVO LA MÁQUINA: manda el EXPEDIENTE** (decisión del usuario, 2026-09-30). Si el técnico
  tecleó en su medida otro modelo u otro SCOP del que consta en el expediente, se escribe el del
  expediente — nombre y rendimiento de ese servicio, nada más (`equiposDelExpediente` en
  `fichaCe3x.js` → `corregir_equipos` en `cee_final.py`). El análisis lo enseña con «⚠ … — manda
  el EXPEDIENTE» y avisa de que los resultados esperados **ya no valen**. Medido en
  26RES060_184/185: el técnico puso una JOHNSON MANANTIAL150RPLUSB (402 %) donde se instaló una
  MANANTIAL110RPLUSV (374 %), y en el 184 una SIME SHP M PRO 010 (491 %) donde va la 012 (455 %).
- **El DEPÓSITO de ACS del inicial pasa al equipo que da el ACS en el final** (decisión del usuario,
  2026-10-01). La demanda de ACS del final tiene que ser la MISMA que la del inicial, y CE3X la
  calcula con las pérdidas del depósito: sin «Con acumulación» sale otra. Se copia el bloque tal
  cual (litros, UA, Tª alta/baja, multiplicador) en el equipo del final que cubre ACS y no declara
  depósito (`heredar_deposito` en `cee_final.py`); si ya hay uno con depósito no se añade otro.
  Medido en 26RES060_185: inicial con caldera mixta y 150 l (UA por defecto 4,7, 80/60 °C), medida
  del técnico con la bomba de ACS sin depósito → con el depósito, D_ACS 22,04 en las dos fases.
  **Al calificar, comprueba que la demanda de ACS del final coincide con la del inicial**; si no, mira
  la acumulación del equipo de ACS.
- **Si hay duda de cuál es la buena, se mira la PLACA**: `node scripts/probar_placas.js <nº>` (en
  seco, no escribe) o `instalacion.placas_ocr` si ya se leyó. Así se confirmaron los dos de arriba.
- **Solo cambian cuatro pickles** (instalación, medidas, resumen e informe); la envolvente, los datos
  administrativos y generales, el técnico, las imágenes y el texto de las pruebas son los suyos, byte a
  byte.
- **Lo CALCULA CE3X, y ya sin abrir su ventana**: con `--escribir`, el script lo califica con el
  motor de CE3X 3.2 instalado en el PC (`services/cee/cexAPdf.js`, ≈1 min; lo arranca oculto) y deja
  al lado del `.cex` su **`.xml` y su `.pdf` oficial** (`… CEE FINAL_REVISAR.xml/.pdf`), con las
  medidas calculadas (en la 3.2 van en el Anexo III del propio certificado, no en un PDF aparte). Si
  no hay CE3X en el equipo, lo dice y el `.cex` se queda igual.
- **Sale en CE3X 3.2** (la vigente desde el 08/10/2026; la 2.3 solo si el usuario la pide). Un inicial
  del técnico hecho en la 3.1 o la 2.3 se convierte al copiarlo: de la 3.1 solo cambia la cabecera y
  calcula igual. Todo lleva `_REVISAR` (la rejilla no
  lo toma por la entrega del técnico) y nunca se dice «listo» a secas: falta revisarlo y firmarlo.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`. Motor (cee-engine) levantado en
  `CEE_ENGINE_URL` (local: `http://127.0.0.1:8090`, `preview_start cee-engine`).
- **Lo hace el «AGENTE IA», un certificador más** (`scripts/agente_ia.js`). Al empezar se marca y
  al escribir **avisa al equipo** (WhatsApp + email) como un técnico que sube su archivo. Pero aquí lo
  normal es que el expediente YA tenga su técnico (el que hizo el inicial y firmará el final): el
  agente le prepara el borrador y **no le quita el expediente ni cambia la fase**. Solo si el CEE
  final está encargado al agente pasa a «pendiente de revisión».
- **Dónde se ejecuta — Claude Code o Cowork:** los comandos son los MISMOS y van SIEMPRE en el PC
  (repo + `.env` + motor). En Code, por la shell; en **Cowork, por Desktop Commander, nunca en el
  sandbox**. Rutas, motor y qué hacer si no hay PC: [comun/entorno.md](comun/entorno.md).
- **El título de la sesión, LO PRIMERO: `{nº} - {CLIENTE}`** — p. ej. `26RES093_11 - NOMBRE DEL
  CLIENTE` (decisión del usuario, 2026-10-02), nunca una descripción de la tarea. En Claude Code,
  `set_session_title` con `session_id: "self"`; en Cowork se le dice al usuario para que lo ponga.

## La herramienta

Desde `implementation/backend`:

```bash
node scripts/cee_final.js 26RES093_11                              # análisis, NO escribe
node scripts/cee_final.js 26RES093_11 --fecha=2026-09-30 --escribir
node scripts/cee_final.js 26RES093_11 --fecha=2026-09-30 --escribir \
     --guardar="C:/Users/Usuario/Downloads/26RES093_11 - CEE FINAL_REVISAR.cex"
```

| Opción | Qué hace |
|---|---|
| `--fecha=AAAA-MM-DD` | Fecha de emisión (y de visita, si no se da otra). Se imprime en el certificado |
| `--fecha-visita=AAAA-MM-DD` | Fecha de visita, si es otra |
| `--medidas=retirada,autoconsumo,aislamiento_cubierta,aislamiento_fachada` | Qué medidas lleva el final (sin ella, las de por defecto; `ninguna` = sin medida). Cada una es un CONJUNTO aparte en CE3X |
| `--cubierta=SOLUCION[:CM]` | Aislamiento de cubierta: `lana_forjado` (por defecto, 12 cm) · `xps_invertida` (8) · `insuflado_cubierta` (10) |
| `--fachada=SOLUCION[:CM]` | Aislamiento de fachada: `sate` (por defecto, 8 cm) · `insuflado_camara` (5) · `trasdosado` (5) |
| `--nombre="…"` `--caracteristicas="…"` | Reescribe el texto de la medida de retirada |
| `--escribir` | Lo deja en «1. CEE / CEE FINAL» como `{nº} - CEE FINAL_REVISAR.cex` (el anterior va a OLD) **y avisa** al equipo |
| `--sin-aviso` | Con `--escribir`, no avisa (al relanzar en la misma sesión) |
| `--sin-pdf` | Con `--escribir`, no lo califica ni deja su `.xml`/`.pdf` |
| `--calificar` | Sin `--escribir`: lo califica igual y dice si cuadra (con `--guardar`, deja el `.xml` y el `.pdf` junto a la copia local) |
| `--guardar=ruta.cex` | Una copia local (sin `--escribir`, SOLO la copia local) |
| `--json` | El análisis en JSON |
| `--version=2.3\|3.1\|3.2` | Versión de CE3X del final. Sin ella, la **3.2** (la vigente); la 2.3 solo si el usuario la pide expresamente |
| `--base=ruta.cex` | Parte de ESE `.cex` local y no del que entregó el técnico en Drive (lo dice en los avisos). Para cuando el técnico calculó su medida pero guardó el `.cex` ANTES de añadirla («no tiene medida de mejora» y su `.xml` sí la trae): se le pone la del expediente con las funciones de `revisionCex.ponerMedida` sin subirla, y el final sale de esa copia |
| `--desde-medida` | En un RES060, usa ESTE camino y no el de copiar el inicial (solo si el usuario lo pide) |

**Sin `--escribir` ni `--guardar` no se toca nada.** Siempre primero en seco.

## El recorrido

0. **Márcalo**: `node scripts/agente_ia.js empezar <nº> --fase final`. Si el expediente tiene técnico
   (lo normal), no se le quita: el agente le prepara el borrador. **No uses `--reasignar` aquí** salvo
   que el usuario lo pida: ese técnico es quien firma y registra el final.
1. **En seco**: `node scripts/cee_final.js <nº>`. Lee:
   - de qué `.cex` del técnico parte (el de «1. CEE / CEE INICIAL», nunca el `_REVISAR` de la app);
   - la **medida del inicial** que se usa y si está **calculada** (sin calcular o **desfasada** se
     avisa: el final lleva sus equipos, pero no hay resultados fiables con los que comparar);
   - la **instalación del final** (la de esa medida) con el reparto de cada equipo, y los equipos
     **corregidos por el expediente** (si los hay, dilo al usuario: el técnico declaró otra máquina);
   - **lo que debe dar al calificarlo en CE3X** (emisiones, EPNR, demanda) — es la foto del edificio
     mejorado que guardó CE3X al calcular la medida del inicial;
   - la **medida del final** propuesta y por qué la otra no.
2. **Pregunta lo que no se puede deducir, antes de escribir**:
   - las **fechas de emisión y visita** del final — nunca se inventan ni se copian las del inicial
     (sin fecha, salen en blanco y hay que ponerlas en CE3X);
   - **quién lo calcula en CE3X** (el usuario en su PC o el técnico);
   - si el nombre de la medida le vale.
3. **`--escribir`** (y `--guardar` en Descargas si lo va a abrir el usuario en su PC: Drive para
   escritorio a veces tarda en bajar la carpeta del expediente).
4. **Informe final** (ver abajo).

## La medida del final

| Ficha | Por defecto | Por qué |
|---|---|---|
| **RES093** (hibridación) | **Retirar el generador en apoyo**: la bomba de calor asume el 100 % de lo que compartía con la caldera | Es lo que queda por hacer: la caldera sigue dando servicio |
| **RES060** (sustitución) | **Autoconsumo fotovoltaico** máximo mes a mes, si la vivienda no tiene ya placas — por el camino de COPIAR el inicial (arriba) | La aerotermia ya está puesta: proponerla describiría otra vivienda (regla de `medidasCe3x`) |
| **Con placas ya instaladas** (cualquier ficha) | Además, **aislamiento de cubierta** | El autoconsumo no cabe y el final necesita una medida que proponer |

### Las medidas de ENVOLVENTE: aislamiento de cubierta y de fachada

Se ofrecen siempre que el edificio tenga ese cerramiento (una medianera nunca se aísla). Cada una
lleva una **solución constructiva** con su material, su conductividad térmica y un espesor
propuesto; el texto de «Características» sale de ahí con sus cifras (U antes y después) y se puede
reescribir. Fuente única del texto: `frontend/.../cee-envolvente/logic/medidasAislamiento.js` (el
popup y el backend usan el mismo). Se escribe como el diálogo «Medida de mejora en el aislamiento
térmico» de CE3X en modo **características del aislamiento añadido** (λ + espesor): CE3X calcula la
U de cada cerramiento con `U' = 1/(1/U + e/λ)`. Comprobado campo a campo contra la medida de
cubierta que guardó CE3X para 26RES093_11.

- El texto va a un `.cex` (latin-1): **nada de «λ» ni rayas largas** en él. Lo vigila
  `test_medidas_aislamiento.mjs`.
- Los espesores son una PROPUESTA: si el usuario sabe qué se va a poner, se cambia.
- El plazo de amortización NO se escribe: sin la inversión no hay forma de calcularlo; si el usuario
  lo quiere, que lo diga y va en «Otros datos».

- La retirada **no se decide por la ficha sino mirando el fichero**: un equipo del inicial cuya parte
  de un servicio BAJA en la medida es el generador en apoyo; el equipo nuevo que comparte ese servicio
  con él es la bomba. Una caldera **mixta** que sigue con el ACS se queda, con la calefacción a 0.
- Si el `.cex` del técnico ya declara **placas existentes** (como «Generación renovable eléctrica» o
  como contribución), el autoconsumo no se ofrece.
- Un RES060 con placas sale **sin medida de mejora**, y se dice: hay que definirla en CE3X.

### La medida de AUTOCONSUMO en la 3.2

- **Va SIEMPRE en «Generación renovable eléctrica»**: potencia pico (de PVGIS) y autoconsumo MES A
  MES (manual de la 3.2, 7.1); nunca en «Contribuciones energéticas». Sin los doce meses (PVGIS no
  responde) el motor no escribe la medida y lo dice: se vuelve a generar.
- **Cada mes se declara lo MENOR entre la producción de PVGIS de ese mes y el consumo eléctrico de
  calefacción + refrigeración + ACS** (y la iluminación fuera del residencial privado) **de ese
  mes** (decisión del usuario, 2026-10-08). La app lo saca del XML del CEE que manda (el final si
  está, si no el inicial) con el reparto mensual de CE3X (`autoconsumoMensual.js`). CE3X 3.2 solo
  calcula con el TOTAL anual, pero avisa de cada mes que se pasa. El 90 % del máximo declarable
  sigue valiendo para DIMENSIONAR los kWp. Medido en 2026CEE_58 (5 kWp): de 8.170 kWh de PVGIS
  quedan ~5.717 y el ahorro de la medida baja del 52,8 % al 45,9 %.
- **Al calificar lo AJUSTA CE3X** (`--escribir` o `--calificar`): cada mes avisado se recorta al
  consumo EXACTO que calcula CE3X, se recalcula y se guarda el `.cex` con CE3X. **Ese `.cex` ajustado
  es el que se sube** a «1. CEE / CEE FINAL» (sustituye al otro, que va a OLD) junto a su XML y su
  PDF, y es el que deja `--guardar`. El script lo dice: «Autoconsumo de la medida «…»: en N meses
  (…) pasaba del consumo … se ha ajustado cada uno a su consumo (X → Y kWh)». Llévalo al informe.

## Reglas que no se rompen

- **RES060 → copiando el inicial** (`cee_final_copiando.js`); **RES093 → desde la medida**
  (`cee_final.js`); **RES080 → el previsto con lo que se ha hecho de verdad** (arriba). El camino
  «desde la medida» se niega en un RES080 y el motor también (si la medida cambia la envolvente, no
  escribe).
- **Solo sobre el `.cex` del TÉCNICO**, con medida. Sin él → 409. El borrador `_REVISAR` de la app no
  vale: no está calculado. La única salida es `--base`: SU `.cex` con la medida del expediente puesta
  por la app (sin calcular, y se avisa), cuando él la calculó pero guardó el fichero antes.
- **Con varias medidas manda la que imprime su informe**; si no se sabe cuál, se pregunta.
- **No se genera sobre un CEE final ya REGISTRADO.**
- **Al escribir, avisa al equipo** (WhatsApp + email, como un técnico que sube su archivo) y lo anota
  en el historial. **La fase solo cambia si el CEE final está encargado al AGENTE IA**; con un técnico
  asignado, no se toca. `--sin-aviso` lo calla al relanzar.

## Lo que queda por hacer (el informe final lo dice SIEMPRE)

1. **La calificación** ya la ha hecho el script con CE3X 3.2 (línea «CE3X lo califica: …») y dice si
   **coincide** con lo que CE3X calculó para la medida del inicial. Si NO coincide, **no se emite**:
   algo no es el edificio de la medida. **Salvo si se corrigieron equipos**: entonces sale otra cifra
   (con el rendimiento real) y es la buena. Sin CE3X en el PC: abrir el `.cex` en CE3X → Calificar.
2. Comprobar que la **demanda de ACS** del final es **la misma que la del inicial** (lo garantiza el
   depósito heredado; si no coincide, revisa «Con acumulación» del equipo de ACS).
   Y que **cada equipo de cada medida lleva su POTENCIA** (CE3X 3.x la pide por servicio y sin ella no
   escribe el XML): el motor se la pone desde 2026-10-05 (`medidas_equipos_a_31`) — la del técnico si
   ya la tenía, la del expediente si consta, o por defecto y avisado. Lo que salga por defecto, dilo.
   Con **autoconsumo**: cuántos meses ajustó CE3X, los kWh declarados (antes → después) y el ahorro
   que queda.
3. Revisar el **`.pdf` `_REVISAR`** que ha dejado el script (lleva las medidas ya calculadas, en su
   Anexo III). Si se corrige algo en CE3X, regenerar el PDF: `node scripts/cex_a_pdf.js "<ruta del
   .cex>"` (también ajusta el autoconsumo y deja el `.cex` ajustado; `--sin-ajustar` solo avisa) o,
   desde el Explorador, botón derecho sobre el `.xml` → Enviar a → «PDF del CEE (CE3X 3.2)».
4. Guardar los tres como `{nº} – CEE FINAL.*` (sin `_REVISAR`: es lo que los hace entrega).
5. Subirlos a la fila del **CEE final** del expediente → revisión (lupa) → visto bueno → el técnico
   firma y registra.

## Pruebas

```bash
node implementation/backend/scripts/test_agente_ia.js
python -m pytest implementation/cee-engine/tests/test_cee_final.py
node implementation/backend/scripts/test_medidas_aislamiento.mjs
node implementation/backend/scripts/cee_final.js 26RES093_11      # caso real, en seco
```

Casos de referencia: **26RES060_178** (08/10/2026, el RES060 copiando el inicial: arriba),
**26RES060_184 y 26RES060_185** (equipos corregidos por el expediente, por el camino viejo) y
**26RES093_11** (30/09/2026) — el `.cex` que sale por aquí es idéntico byte a
byte al montado a mano (caldera 3 % + aerotermia 97 % → medida: aerotermia 100 %, caldera fuera).
