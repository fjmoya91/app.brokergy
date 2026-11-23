<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## RES060: la caldera del CEE INICIAL da SIEMPRE el ACS, y el termo es su depósito (2026-11-08)

**El caso, 26RES060_275** (Cedillo del Condado). Caldera ROCA LAIA 25 GT de gasóleo para la
calefacción y un termo eléctrico THERMOR para el agua caliente; la obra, una aerotermia monobloc con
el ACS en el presupuesto. La skill hizo el inicial como decía su punto 18 y la regla 163 («en el
INICIAL da igual que el ACS lo dé la caldera o un termo; por defecto el termo»): la caldera como
«Equipo de sólo calefacción» y el termo aparte, de efecto Joule. Fran lo rehízo a mano en CE3X —la
caldera como «Equipo mixto de calefacción y ACS», «Con acumulación», 150 l, UA por defecto, y el
termo fuera del árbol— y lo dejó «grabado a fuego».

**REGLA — en el CEE INICIAL de un RES060, la caldera que se cambia da SIEMPRE calefacción Y ACS.**
La misma caldera de gasóleo o de gas, aunque hoy el agua la caliente un termo. **El termo no se
declara como equipo independiente**: sus litros son la **acumulación** de la caldera mixta («Con
acumulación», el volumen del termo; si no se lee en la foto, 150 l y se dice) y el termo se queda
fuera del `.cex`. Sustituye a «da igual, por defecto el termo».

**REGLA — en la MEDIDA DE MEJORA lo decide el presupuesto.**
- **Sin nada de ACS en el presupuesto** (`instalacion.cambio_acs: false`): el ACS pasa a un **termo
  eléctrico de efecto Joule** y la aerotermia (monobloc) da **solo la calefacción**.
- **Con ACS en el presupuesto**: la aerotermia (o el aerotermo) da el ACS con su depósito.

### El porqué

El ahorro CAE de la ficha RES060 calcula el ACS de antes con el rendimiento de **la caldera**
(`calculateSavings`: `dacs / boilerEff`). El inicial tiene que contar lo mismo que el expediente:
si declara el termo aparte, el CEE dice que el agua se calienta con electricidad y no con la
caldera que se retira.

### Cómo lo hace el código

- [scripts/cee_inicial.js](implementation/backend/scripts/cee_inicial.js) `aplicar`: en un RES060,
  si el plan trae `acs_aparte` o `caldera.da_acs: false`, los quita, pasa los litros del termo
  (o 150 l) a `ajustes.acumulacion_litros`, retira el equipo de ACS de `ajustes.equipos_extra` y lo
  DICE en los avisos. `"acs_independiente": true` en el plan lo salta, solo con el «sí» de Fran.
- [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js)
  `instalacionExistente`: la caldera da ACS por defecto (`misma_caldera_acs !== false`) y su depósito
  es el de la medida si lo hay (`litrosDeLaMedida`), si no `acumulacion_litros` (ver «La caldera
  EXISTENTE según la ficha, y el depósito de la MEDIDA»).
- `instalacionNueva` con `termoSiRetira: true`: con `cambio_acs === false` y la caldera mixta, la
  medida añade el TERMO ELÉCTRICO para el ACS. Esto **prevalece** sobre lo de la regla 72 («lo que el
  equipo nuevo no asume se queda: la caldera mixta con la calefacción a 0 y el ACS como estaba») en
  la medida del inicial de un RES060; la regla 72 sigue valiendo donde no hay termo que poner. El
  CEE final, igual (regla 127, `termoDeclarado`).

### Lo medido (en seco, 26RES060_275, CE3X 3.2)

| | ACS del CEE (kWh/m²·año) | Calificación (emisiones / energía primaria) |
|---|---|---|
| Termo aparte (lo firmado) | 18,66 | — |
| Caldera mixta + 150 l | **30,68** | G / G (129,73 / 499,53) |

La medida conserva el depósito de 150 l («se conserva el depósito de ACS del `.cex` que se copia»).
El depósito sube la demanda de ACS del CEE por sus pérdidas; el ahorro CAE no se mueve por eso, porque
la D_ACS del expediente va por litros/día.

Pendiente: el CEE de 26RES060_275 que está firmado y con visto bueno lleva todavía el termo aparte;
rehacerlo, refirmarlo y revalidarlo lo decide Fran.
