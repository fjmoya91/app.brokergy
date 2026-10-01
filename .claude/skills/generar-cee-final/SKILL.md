---
name: generar-cee-final
description: >-
  GENERA el CEE FINAL (.cex de CE3X) de un expediente CAE RES060 o RES093 a partir de la MEDIDA DE
  MEJORA del CEE inicial que ya entregó el técnico: el «edificio mejorado» de esa medida pasa a ser el
  certificado final (misma envolvente, mismos datos, mismo técnico, mismas imágenes; la instalación,
  la de la medida TAL CUAL). En una HIBRIDACIÓN (RES093) le pone como medida de mejora retirar la
  caldera que quedó en apoyo, con la bomba de calor al 100 %; en una sustitución (RES060), el
  autoconsumo si procede; y, sobre todo si ya hay placas, medidas de AISLAMIENTO de cubierta o fachada
  con su solución constructiva (lana mineral, XPS, SATE…) y un texto profesional. Deja `{nº} - CEE FINAL_REVISAR.cex` en «1. CEE / CEE FINAL» y dice qué tiene
  que dar al calificarlo en CE3X. Úsalo cuando el usuario diga "genera el CEE final de NNN", "el final
  como aparece en la medida de mejora", "prepárame el CEE final para visto bueno y firmar". Es el mismo
  camino que el botón «Generar» de la fila del CEE final en la app. RES080 NO (segunda fase).
---

# Generar el CEE final desde la medida de mejora del inicial

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
- **Lo que CALCULA CE3X no está aquí**: el `.xml` y el `.pdf` del certificado, y el ahorro de la medida
  nueva, salen de CE3X al calificar. Por eso el fichero lleva `_REVISAR` y nunca se dice «listo» a
  secas.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`. Motor (cee-engine) levantado en
  `CEE_ENGINE_URL` (local: `http://127.0.0.1:8090`, `preview_start cee-engine`).

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
| `--escribir` | Lo deja en «1. CEE / CEE FINAL» como `{nº} - CEE FINAL_REVISAR.cex` (el anterior va a OLD) |
| `--guardar=ruta.cex` | Una copia local (sin `--escribir`, SOLO la copia local) |
| `--json` | El análisis en JSON |

**Sin `--escribir` ni `--guardar` no se toca nada.** Siempre primero en seco.

## El recorrido

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
| **RES060** (sustitución) | **Autoconsumo fotovoltaico**, si la vivienda no tiene ya placas | La aerotermia ya está puesta: proponerla describiría otra vivienda (regla de `medidasCe3x`) |
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
- Si el `.cex` del técnico ya declara **placas existentes**, el autoconsumo no se ofrece.
- Un RES060 con placas sale **sin medida de mejora**, y se dice: hay que definirla en CE3X.

## Reglas que no se rompen

- **Solo RES060 y RES093.** En un RES080 la medida del inicial toca la envolvente y el final tiene que
  llevar esa obra: es la segunda fase. El servicio se niega y el motor también (si la medida cambia la
  envolvente, no escribe).
- **Solo sobre el `.cex` del TÉCNICO**, con medida. Sin él → 409. El borrador `_REVISAR` de la app no
  vale: no está calculado.
- **Con varias medidas manda la que imprime su informe**; si no se sabe cuál, se pregunta.
- **No se genera sobre un CEE final ya REGISTRADO.**
- **No se cambia ningún estado ni se avisa a nadie.** El rastro es el fichero.

## Lo que queda por hacer (el informe final lo dice SIEMPRE)

1. Abrir el `.cex` en CE3X → **Calificar**. Tiene que dar lo que dijo el análisis (emisiones y EPNR
   con su letra). Si sale otra cosa, **no se emite**: algo no es el edificio de la medida. **Salvo si
   se corrigieron equipos**: entonces sale otra cifra (con el rendimiento real) y es la buena.
2. Comprobar que la **demanda de ACS** del final es **la misma que la del inicial** (lo garantiza el
   depósito heredado; si no coincide, revisa «Con acumulación» del equipo de ACS).
3. **Medidas de mejora → «Actualizar»** la medida nueva (va sin calcular).
4. Exportar el **`.xml`** y el **`.pdf`** y guardar los tres como `{nº} – CEE FINAL.*`.
5. Subirlos a la fila del **CEE final** del expediente → revisión (lupa) → visto bueno → el técnico
   firma y registra.

## Pruebas

```bash
python -m pytest implementation/cee-engine/tests/test_cee_final.py
node implementation/backend/scripts/test_medidas_aislamiento.mjs
node implementation/backend/scripts/cee_final.js 26RES093_11      # caso real, en seco
```

Casos de referencia: **26RES060_184 y 26RES060_185** (equipos corregidos por el expediente) y
**26RES093_11** (30/09/2026) — el `.cex` que sale por aquí es idéntico byte a
byte al montado a mano (caldera 3 % + aerotermia 97 % → medida: aerotermia 100 %, caldera fuera).
