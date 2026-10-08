<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->
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

Medido en **26RES060_178** (08/10/2026): inicial del técnico en la 2.3 con caldera de gasóleo →
ALFEA EXTENSA S 10 (453 % calefacción, 280 % refrigeración con el EER 2,8 de la FT, suelo radiante)
+ AEROMAX VS R290 200 de ACS (354 %, 200 l). Sin medida: **B (19,3 kgCO₂/m²) / C (113,92 kWh/m²)**.
Consumo eléctrico del final 19.704 kWh/año → techo 17.734 → **10,61 kWp** (PVGIS 1.672 kWh/kWp);
mes a mes 12.074 kWh y CE3X recortó mayo, junio y octubre (2.087 → 2.025): ~12.012 kWh declarados,
**10.610 €**. Antes, «desde la medida» con el consumo del inicial, había salido 1,84 kWp, sin frío y
sin inversión: el usuario lo rechazó.

**Pendiente**: el botón «Generar» de la fila del CEE final sigue usando el camino «desde la medida»
también en un RES060. Y un RES080 no tiene aún comando único: su final es el PREVISTO (regla 117)
con lo que se ha hecho de verdad, más las fechas y el autoconsumo (skill `generar-cee-final`).

Tras tocarlo: `node implementation/backend/scripts/cee_final_copiando.js 26RES060_178 --fecha=2026-10-08`
(en seco; necesita el motor y CE3X 3.2) y `python -m pytest implementation/cee-engine/tests/test_cee_final.py`.
