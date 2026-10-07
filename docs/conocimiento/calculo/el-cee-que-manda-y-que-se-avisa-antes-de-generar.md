<!-- conocimiento · área: calculo · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El CEE que MANDA, y qué se avisa antes de generar (2026-09-03)

La demanda de calefacción y la superficie de todo documento del expediente salen de
UNA regla: **si hay CEE FINAL cargado manda el final; si no, el inicial**. Fuente
única: [ceeFases.js](implementation/frontend/src/features/expedientes/logic/ceeFases.js)
(`ceeBaseDocumento`), que consumen el CIFO, las cuatro fichas, el panel económico
y el detalle del expediente.

### La DEMANDA DE ACS es la EXCEPCIÓN: manda la del INICIAL (2026-09-17)

**REGLA — la demanda de ACS tiene que ser LA MISMA en los dos certificados, y si no
lo es, se usa la del CEE INICIAL.** Es el criterio del verificador, y tiene su razón:
la demanda de ACS es una propiedad del USO del edificio —cuánta agua caliente se
consume— y no de la envolvente ni del generador, así que **la actuación no la mueve**.
Cuando los dos certificados no dicen lo mismo, la diferencia no describe una mejora:
describe un criterio distinto del técnico que levantó el segundo. El de partida es el
que el verificador toma como bueno.

Fuente única: **`baseAcs`** en [demandaAcs.js](implementation/frontend/src/features/expedientes/logic/demandaAcs.js),
que aplica `resolveDacs` en modo `xml` — así se corrigen **de una vez** las doce
superficies que la piden (CIFO, las cuatro fichas y sus dos modales, el panel
económico, su gemelo de Node, el listado, el detalle y `cifoService`). Ninguna
decide por su cuenta de qué certificado sale la cifra.

**REGLA — solo la D_ACS; la CALEFACCIÓN y la SUPERFICIE siguen saliendo del que
manda.** Ahí el final SÍ recoge el resultado de la obra, y en un RES080 la diferencia
entre los dos ES el ahorro que se justifica.

**REGLA — el inicial manda SIEMPRE QUE DECLARE la cifra.** Un CEE inicial leído por
OCR **no la trae** —el PDF del certificado no imprime esa tabla, solo está en el
`.xml`—, así que exigir el inicial a ciegas dejaría esos expedientes con D_ACS = 0 y
el AE_ACS del documento se iría a cero sin que nada lo delatara. Cuando hay DOS
cifras manda la del inicial; cuando solo hay una se usa esa y **se avisa** de que
falta el `.xml` del inicial, que es la única forma de saber que ahí hay un hueco.

**REGLA — el CIFO imprime los factores de ESE certificado y lo NOMBRA.** El párrafo
de justificación cogía `demandaACS` y `superficieHabitable` del CEE que manda: con la
cifra saliendo del inicial, el documento enseñaría una multiplicación cuyo producto
**no es** el D_ACS que declara su propia tabla de variables — y rehacer esa cuenta es
lo primero que hace quien lo revisa. Los dos factores se leen ahora del resultado de
`resolveDacs`, y cuando el expediente tiene los dos certificados el párrafo dice de
cuál se ha copiado ("…del certificado de eficiencia energética **inicial**"). Con uno
solo no se nombra: ahí no hay ambigüedad que aclarar.

⚠️ **Los documentos YA EMITIDOS no se reescriben, y regenerarlos SÍ cambia la cifra.**
Medido el 17/09/2026: **49 expedientes** tienen las dos demandas de ACS distintas, y en
ellos la del inicial es de media un **~55 % más alta** que la del final. De esos, **17
son RES060/RES093 con el ACS en alcance y el CIFO ya FIRMADO** (7 loteados): su
documento declara la del final, así que volver a generarlo hoy subiría su D_ACS —y con
ella su AE_ACS— entre un 38 % y un 81 %. No es un descuido: la puerta lo avisa antes de
generar y la decisión es de una persona. Los otros 28 no cambian de documento (RES080,
que justifica el ahorro por energía final, o ACS fuera de alcance). Para verlos:

```bash
node implementation/backend/scripts/revisar_dacs_fases.js   # SOLO LEE
```

**REGLA — la regla estaba escrita cuatro veces, y en otras cuatro NO estaba.** Las
fichas RES060 y RES093 (y sus dos modales, que duplican el HTML) leían
`cee.cee_final` a secas: un expediente con la obra sin terminar —el caso normal—
imprimía **D_CAL = 0,00 y D_ACS = 0,00** mientras el CIFO del MISMO expediente
salía con los del inicial. Dos documentos del mismo expediente contradiciéndose.

**Y en el panel de HIBRIDACIÓN tampoco estaba** (2026-09-16). `InstalacionModule`
leía `cee.cee_final` a pelo, así que con solo el CEE inicial cargado —lo normal
mientras la obra no termina— caía a la oportunidad y, si aquella no traía `Q_net`
(las que se guardaron sin CEE, o las migradas), enseñaba **DEMANDA ANUAL = 0 kWh**.
Y esa cifra no es decorativa: de ella sale la cobertura de la bomba, y con demanda
cero la cobertura es 0 % y **el C_b sale 100 %**, o sea el ahorro SIN ponderar — más
alto que el real, en la ficha que define la actuación de un RES093/TER173. Medido:
con el inicial (86,40 kWh/m²·año × 120 m²) la demanda pasa de 0 a 10.368 kWh y el
C_b de 100 % a lo que toque. La chapa dice además **de qué certificado** sale
("Certificado CEE inicial" · "… final"): no es lo mismo la demanda de antes de la
obra que la de después, y con la del inicial el C_b es provisional.

### Retirar un CEE lo retira DE VERDAD

El fichero vive en Drive y la cifra en Supabase (`cee.cee_final`), así que borrar el
`.xml` del slot **no tocaba la demanda**: medido en 26RES060_177, el certificador
subió un CEE final, el admin borró el fichero, y el CIFO se seguía calculando con
aquellos 241,28 kWh/m²·año. Lo mismo la economía del expediente y la ficha.

**REGLA — no se borra en silencio: se PREGUNTA, y solo al ADMIN.** La demanda entra
también por "Cargar CEE" (PDF/fotos con OCR) y a mano, casos en los que ese slot
está vacío y el dato es bueno; un borrado automático destruiría lo que nadie subió
como `.xml`. Al borrar el `.xml` se ofrece vaciar también los datos, con las cifras
a la vista, y hay un botón suelto junto a la demanda para lo YA borrado — sin él, el
único camino era el SQL (el recuadro de la rejilla es de solo lectura).

**REGLA — se vacía la fase ENTERA** (`patchVaciarCee`): el objeto parseado, el XML
crudo y las fechas de visita y firma que el certificado sembró. Todo a `null`, nunca
con `delete`: el PUT funde `{ ...existing.cee, ...cee }` y una clave ausente conserva
el valor viejo. **No se toca `emisiones_manual`, `superficie_manual_*` ni
`dacs_manual`**: eso lo tecleó una persona y no lo puso ningún certificado.

### Antes de generar, la puerta AVISA

`avisosCeeDocumento(expediente)` alimenta el gate previo al CIFO, al certificado
RES080 y a la ficha oficial (`ValidationModal`, que ahora separa lo que FALTA —rojo—
de lo que hay que REVISAR —ámbar—):

| Situación | Qué dice |
|---|---|
| Sin CEE final | Se genera con el INICIAL, y con qué demanda y superficie |
| Sin CEE final **y ACS en alcance** | Nota: la D_ACS sale del inicial, que es **la que manda también cuando se registre el final** — no cambiará |
| Sin CEE final **y RES080** | El ahorro se justifica comparando los dos: el que se imprima no es el definitivo |
| Los dos, D_ACS distinta | **Debería ser la misma**: se usa la del INICIAL (criterio del verificador) — compruébalo |
| Los dos, pero el inicial **no declara D_ACS** | Sale la del FINAL por necesidad, no por criterio: carga el `.xml` del inicial |
| Los dos, D_CAL distinta (no RES080) | La actuación no toca la envolvente: debería ser la misma |
| ACS fuera de alcance | Nota informativa: D_ACS y SCOP_dhw salen como "no aplica" (regla 12.b) |
| ACS en alcance pero **sin equipo identificado** | El documento imprime su D_ACS y su SCOP_dhw, pero el ahorro NO lo cuenta |

**REGLA — un dato que FALTA y un dato que hay que REVISAR no son lo mismo.** La
validación pedía `cee.cee_final.demandaCalefaccion` y cantaba "Datos faltantes:
Demanda Calefacción (CEE Final)" en un expediente que sí la tiene y que iba a
imprimir la del inicial. Un rojo que no significa nada se ignora al tercer día.

**REGLA — los avisos de ACS solo salen si el ACS ENTRA en el documento**: si se actúa
sobre él (`acsEnAlcance`, ahora fuente única en `aerotermiaUnits.js` — estaba copiada
en cinco sitios) y si la D_ACS sale del certificado (`acs_method === 'xml'`; en modo
CTE o manual no depende de qué CEE mande). Fuera de alcance no se avisa de nada: el
documento ya imprime "no aplica".

**REGLA — un aviso `info` acompaña, pero no interrumpe.** Si lo único que hay que
decir es que el ACS sale como "no aplica", el documento se genera sin puerta: una
puerta que se abre siempre deja de leerse. Por eso el de "sin CEE final, la D_ACS
sale del inicial" pasó de `warn` a `info` el 2026-09-17: pedía revisarla "cuando se
registre el final" y con el criterio nuevo eso es mandar a rehacer algo que ya está
bien — un aviso que no hay que atender enseña a no leer los avisos.

```bash
node implementation/backend/scripts/test_dacs_fase_inicial.mjs
node implementation/backend/scripts/check_cifo_paginas.mjs
```
