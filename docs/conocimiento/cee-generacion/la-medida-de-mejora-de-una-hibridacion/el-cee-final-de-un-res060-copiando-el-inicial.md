<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «La medida de mejora de una HIBRIDACIÓN (2026-09-16)»; la introducción y el resto, en esta misma carpeta.

### El CEE FINAL de un RES060: se COPIA el inicial (2026-10-08)

Decisión del usuario el 08/10/2026, tras 26RES060_178, dicha «para grabarla a fuego»: cuando se pide
el CEE final de un **RES060**, se hace así y no se pregunta (solo las fechas de visita y emisión).

| Qué | Dónde |
|---|---|
| El procedimiento (dos vueltas) | [services/cee/ceeFinalCopiando.js](implementation/backend/services/cee/ceeFinalCopiando.js) |
| Comando | `node implementation/backend/scripts/cee_final_copiando.js <nº> --fecha=AAAA-MM-DD [--escribir]` (y `cee_final.js` con un RES060 lleva ahí) |
| Copiar y cambiar instalaciones | motor `POST /cex/instalaciones` (el de la regla 48.b) |
| Dimensionar el autoconsumo | `medidasCe3x` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js) + `autoconsumoMensual.js` |
| Calificar y ajustar los meses | [services/cee/cexAPdf.js](implementation/backend/services/cee/cexAPdf.js) (CE3X 3.2 en el PC) |

**REGLA — se COPIA el CEE INICIAL del técnico** (el `.cex` de «1. CEE / CEE INICIAL» sin
`_REVISAR`; sin él, el borrador de la app y se dice): su envolvente, datos, técnico e imágenes.

**REGLA — las instalaciones del final son las INSTALADAS, no las de la medida del técnico.** Salen
del expediente (ya corregido con placas y facturas) por `componerFicha(fase: 'final')`, la misma
función que el botón de la envolvente. El generador viejo se retira; un ACS de otra máquina va como
segundo equipo con el depósito (48.e).

**REGLA — sin placas, la medida es el AUTOCONSUMO MÁXIMO MES A MES, dimensionado con el XML del
PROPIO final.** Primera vuelta: el final SIN medida se califica con CE3X para tener SU XML. Segunda:
ese XML entra EN MEMORIA como `cee.xml_final` y `medidasCe3x` saca de él el techo (90 % del consumo
eléctrico anual) y el consumo de cada mes; los kWp salen de PVGIS y cada mes se declara lo menor
entre producción y consumo (regla 126). Al calificar, CE3X recorta los meses que aún se pasen de SU
consumo y ese `.cex` ajustado es el que se sube, una sola vez, con su XML y su PDF. Con el consumo
del INICIAL no vale: con una caldera de gasóleo casi no hay electricidad (en el 178 daba 1,84 kWp).

**REGLA — inversión del autoconsumo: 1.000 € por kWp** (`EUR_POR_KWP`), con la vida útil de la
fotovoltaica (25 años). Sin inversión CE3X da la medida por gratis («<500 €»).

**REGLA — sin SEER en el catálogo, el EER de la ficha técnica.** El catálogo no tiene casilla de
EER: se guarda como `seer` del modelo (`PATCH /api/aerotermia/:id/datos-rite`) antes de generar. Con
una unidad terminal que da frío, sin SEER la bomba sale sin refrigeración (regla 72) y la letra
empeora.

**REGLA — en la versión vigente de CE3X (3.2).** Un inicial de la 2.3 o la 3.1 se convierte al
copiarlo (`a_version` rellena lo que pide la 3.2 y se avisa).

**REGLA — las fechas del informe son las del FINAL.** `/cex/instalaciones` las pone desde
`ficha.informe` (en memoria: `fecha_firma_cee_final` / `fecha_visita_cee_final`); sin fecha, en
blanco y se avisa — nunca las del inicial. El texto de las pruebas del técnico se respeta; si lo
dejó vacío, va el de la app.

**REGLA — la DEMANDA del final es la del inicial, en kWh/año: calefacción Y ACS** (usuario,
09/10/2026, «la demanda de calefacción no puede variar»). La app la compara al cargar el XML del
final (popup «DEMANDA CEE INICIAL ≠ FINAL», incidencia GRAVE). Dos cosas la movían al copiar:

| Qué | Antes | Ahora |
|---|---|---|
| Superficie útil de la 3.x (`[22]` de generales) al convertir un inicial de la 2.3 | La de la ficha (`ce3x31.superficie_util`) | La que tecleó el técnico en el fichero (`extra_de_cex`); la de la ficha solo si el fichero no la trae |
| Depósito de ACS cuando la obra declara otros litros | El de la obra | El del fichero, con su UA y temperaturas (`_heredar_acumulacion`), y se avisa |
| El inicial NO tiene depósito (caldera mixta instantánea) y la obra sí (18/10/2026) | El de la obra | Ninguno: el final sale sin acumulación (`_heredar_sin_deposito`, solo en `/cex/instalaciones`), y se avisa |

Medido en **26RES060_202**: inicial de Raquel en la 2.3 con 240 m² y caldera de gasóleo con 230 l
(80/60 °C, UA 5,4); la ficha decía 330 m² y la obra, la Daikin con el integrado de 180 l. El final
salió con 209,36 kWh/m² × 330 = **69.089 kWh/año** frente a 50.246, y ACS 18,92 frente a 20,02.
Rehecho: 240 m², calefacción 209,36 y ACS 20,02, C (20,73) / C (122,35). En 26RES060_198 (343 m²
en el fichero, 214 en la ficha) pasaba lo mismo con la superficie; su depósito ya coincidía.

**Y sin depósito en el inicial, el final tampoco lo lleva** (18/10/2026, **26RES060_195**). El
inicial del técnico (CE3X 2.3) era una caldera mixta de gas natural INSTANTÁNEA (sin acumulación) y la obra, la
AEROSUN de climatización + una bomba de calor de ACS **HTW de 100 l** aparte
(`instalacion.aerotermia_acs.litros`). `_heredar_acumulacion` solo actuaba si el fichero traía un
depósito, así que el `{ volumen: 100 }` que pone `equipoDeAcs` (fichaCe3x.js) llegaba al `.cex`:
ACS **18,09 kWh/m²·año frente a 11,00**. Se esquivó a mano pasando el expediente sin litros.
El arreglo va en el MOTOR y no en la ficha porque solo el motor ve el fichero que se copia —la ficha
no sabe si el inicial tiene depósito— y es el mismo sitio que ya decide «lo del fichero manda». Va
con `heredar_del_base(..., sin_deposito_manda=True)` y **solo** desde `/cex/instalaciones` (el final
copiado y sus medidas): la medida de mejora de un inicial (`/cex`, `/cex/medida`), el PREVISTO del
RES080 (`/cex/previsto`) y el final desde la medida no cambian. Solo actúa si el fichero tiene un
equipo que da ACS y ninguno con depósito; sin ningún equipo de ACS en el fichero, manda la obra.
Con depósito en el inicial nada cambia (26RES060_196: sus 100 l pasan al termo). Rehecho en seco:
ACS **11,00**, calefacción 175,36, refrigeración 10,35 y 251 m², igual que el inicial; A (10,63) /
B (62,78). ⚠️ El aviso de la ficha («… y depósito de 100 l») sigue saliendo, porque la ficha no
conoce el fichero; el del motor, justo debajo, dice que sale sin él.
**Tras generar, se mira en el XML del final `<SuperficieUtil>` y `<Demanda>` contra el inicial.**

**REGLA — sobre el inicial de la 2.3 se hace el final de la 3.2 SIN cambiar nada de la envolvente:
solo las instalaciones** (usuario, 20/10/2026, 26RES060_186: «se debe trabajar sobre el 2.3 y que no
cambie nada en el 3.2, para que no cambie la demanda; solo se cambian instalaciones. Eso es muy
importante»). Medido: el MISMO inicial del técnico, sin tocar nada y solo convertido, daba en la 3.2
**196,84** kWh/m² de calefacción frente a los **215,19** registrados con la 2.3. No era la conversión
(cerramientos, huecos, U, ψ y datos generales idénticos): **la 2.3 añade al CALCULAR puentes térmicos
«por defecto» que no van en el fichero** —pilares integrados, encuentro con la solera, con la
cubierta y cajas de persiana: 18 en el 186, 40 en su XML frente a 22 en el `.cex`— y **la 3.2 no**.
Ahora `ceeFinalCopiando.js` saca los puentes del XML del inicial (`puentesDelXml23`; el
`cee.xml_inicial` de la BD llega en MAYÚSCULAS) y el motor escribe los que faltan con SU ψ y SU
longitud (`completar_puentes_23` en `tools/convertir_cex.py`, solo si el inicial es de la 2.3 y el
final de la 3.x, solo por nombre y sobre un cerramiento que exista). Sin XML se avisa con ⛔. Y la
comparación ya no es a ojo: `compararDemanda` califica el final sin medida, compara calefacción y ACS
(kWh/m²) con `cee.cee_inicial` y, si no cuadra (> 0,5 %), **con `--escribir` no se sube** (422) y en
seco sale ⛔. Rehecho el 186: 40 puentes, calefacción 215,19, ACS 27,52, refrigeración 16,80, igual
que el inicial; C (22,23) / C (131,22), autoconsumo 5,96 kWp.

**REGLA — un TERMO ELÉCTRICO que declara el expediente para el ACS entra en el final, aunque el ACS
esté fuera del alcance CAE** (26/10/2026, 26RES060_186). La obra cambió el ACS de la caldera de carbón
por un termo (`cambio_acs: false` + `aerotermia_acs.tipo_equipo_nuevo: 'termo_electrico'`): no computa
en el ahorro, pero en la casa ya no hay caldera. La ficha solo añadía el termo si el inicial traía un
mixto que se retiraba, así que el final CONSERVABA la caldera de carbón para el ACS y salía **E/E**.
Ahora `instalacionNueva` (fichaCe3x.js), en el final copiado (`delFichero`) y fuera de una hibridación,
pone el **TERMO ELÉCTRICO** en el slot `ACS` al 100 % cuando el expediente lo declara, con su aviso «lo
declara el expediente». Sin termo declarado no se inventa nada. Rehecho el 186 (CE3X 3.2, fecha
26/10/2026): demanda 215,19 / 27,52 igual que el inicial, **C (28,3) / D (167,07)**, autoconsumo
7,59 kWp. Tras tocarlo: `node implementation/backend/scripts/test_cex_final.mjs`.

Medido en **26RES060_178** (08/10/2026): inicial del técnico en la 2.3 con caldera de gasóleo →
ALFEA EXTENSA S 10 (453 % calefacción, 280 % refrigeración con el EER 2,8 de la FT, suelo radiante)
+ AEROMAX VS R290 200 de ACS (354 %, 200 l). Sin medida: **B (19,3 kgCO₂/m²) / C (113,92 kWh/m²)**.
Consumo eléctrico del final 19.704 kWh/año → techo 17.734 → **10,61 kWp** (PVGIS 1.672 kWh/kWp);
mes a mes 12.074 kWh y CE3X recortó mayo, junio y octubre (2.087 → 2.025): ~12.012 kWh declarados,
**10.610 €**. Antes, «desde la medida» con el consumo del inicial, había salido 1,84 kWp, sin frío y
sin inversión: el usuario lo rechazó.

### Un RES093 también se hace COPIANDO el inicial, con la medida de RETIRAR la caldera (2026-10-22)

Caso 26RES093_16 (antes 26RES060_122, renumerado ese día). El camino de un RES093 es «desde la medida»
del inicial del técnico, y aquí la medida del CEE inicial **registrado** era la de OTRO edificio («CEE
FINAL CL ZAPATEROS 2.cex»: almacén y cubiertas que esta casa no tiene, y más demanda de calefacción
que la real, 302,7 frente a 260,5 kWh/m²): el motor se negaba («la medida cambia la ENVOLVENTE»), con
razón. Fran: «tienes que hacer el CEE final manteniendo toda la demanda del CEE INICIAL, pero la nueva
medida de mejora puede ser eliminar por completo la caldera o cambiar las ventanas».

**REGLA — un RES093 se puede hacer COPIANDO el inicial, y entonces su medida es RETIRAR la caldera en
apoyo.** `cee_final_copiando.js <nº> --fecha=… [--medida=retirada|autoconsumo]` (por defecto `retirada`
en un RES093 y `autoconsumo` en un RES060). La copia ya conserva la caldera con su parte del C_b
(regla 48.g); la medida «retirada» de `medidasCe3x` es la instalación nueva SIN hibridación (la bomba
al 100 % + el equipo de ACS), compuesta sobre una COPIA del expediente con `hibridacion: false`, y sus
textos calcan `texto_retirada` de `cee_final.py`. No depende de PVGIS. Se usa cuando la medida del
técnico no vale; si vale, el camino de siempre (`cee_final.js`) sigue siendo el del RES093.

**REGLA — la caldera que se conserva y deja el ACS deja también su DEPÓSITO.** La bomba de ACS heredaba
el depósito del fichero (100 l, UA 4,3) y la caldera se lo quedaba TAMBIÉN: CE3X contaba dos y la
demanda de ACS del final salía 33,41 frente a 24,47 kWh/m² (≈ 1.620 kWh/año de pérdidas de más). Ahora
`construir_instalaciones` le pone `[False]` en la casilla [8] (`_sin_deposito`) cuando su ACS pasa a 0
y un equipo nuevo hereda el depósito; y el aviso del reparto cuenta la parte de la caldera conservada
(decía que el 18 % «no lo da ninguno»). Test: `test_la_caldera_que_deja_el_ACS_deja_tambien_su_DEPOSITO`.

Resultado en 26RES093_16: copia de «26RES060_122 – CEE INICIAL.cex» (2.3 → 3.2), AEROTERMIA SH MASTER 14
al 82 % + caldera de gasóleo SH 40 S al 18 % + Haier HP200M7-F9 para el ACS; demanda 260,51 / 24,47 =
la del inicial; **E (45,35 kgCO₂/m²) / E (218,67 kWh/m²)** frente a G / G del inicial; medida «RETIRADA
CALDERA GASÓLEO: AEROTERMIA SH MASTER 14 AL 100 %» calculada por CE3X. Ahorro y bono de la app sin
cambios (42.709 kWh/año, 5.125,11 €). ⚠️ La medida del CEE inicial REGISTRADO sigue siendo la de otro
edificio: eso no lo arregla el final.

**Pendiente**: el botón «Generar» de la fila del CEE final sigue usando el camino «desde la medida»
también en un RES060. Y un RES080 no tiene aún comando único: su final es el PREVISTO (regla 117)
con lo que se ha hecho de verdad, más las fechas y el autoconsumo (skill `generar-cee-final`).

Tras tocarlo: `node implementation/backend/scripts/cee_final_copiando.js 26RES060_178 --fecha=2026-10-08`
(en seco; necesita el motor y CE3X 3.2) y `python -m pytest implementation/cee-engine/tests/test_cee_final.py`.
