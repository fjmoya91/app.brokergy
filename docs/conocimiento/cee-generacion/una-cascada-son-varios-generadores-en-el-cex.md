<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## Una CASCADA son VARIOS generadores en el `.cex`, a partes iguales (2026-10-20)

**El caso, 26RES060_226.** Una parcela con DOS viviendas y UNA referencia catastral: el bajo
(Pablo) y el 1º (Joaquina), cada una con su caldera BIASI GTB 30 GTI de gasóleo y con su
presupuesto de Vicente Guerrero. El bajo lleva una SIME SHP PRO de 8 kW y el 1º otra de 10 kW,
y cada uno un aerotermo Johnson de 100 l. La OP257 (solo el bajo) se rechazó, y la OP256 se
aceptó como UN expediente para el edificio entero: 351 m² y 20.328 € (9.861,50 + 10.466,50).

La Instalación declaraba una sola aerotermia, la de 8 kW. Fran: «quiero que sea con las dos
aerotermias; ponle si quieres 50 y 50 de participación a cada una, pero tienen que aparecer
las dos. A efectos reales son dos casos, aunque haya una referencia y nosotros lo tratemos como
un expediente».

**Lo que pasaba con una cascada.** El expediente ya admitía N equipos en cascada desde el
21/07/2026 (`aerotermia_cal.equipos_extra`), pero el `.cex` escribía UN solo generador:
- de nombre, los de todas juntos («AEROTERMIA SIME SHP M PRO 008 + SIME SHP M PRO 010»);
- con la potencia SUMADA;
- con el SCOP del PEOR.

Era un generador que no existe. Lo mismo pasaba en los otros tres expedientes con cascada:
26RES060_198 (dos DAIKIN), 26RES080_90 (cinco splits) y 26RES060_158.

**REGLA — en el `.cex`, cada máquina de una cascada es UN generador con SU SCOP y SU potencia, y
la demanda se reparte a PARTES IGUALES.**
- Dos máquinas van a 50/50, y tres a 34/33/33 (lo que sobra del redondeo, a las primeras).
- Superficie servida y porcentaje, los mismos.
- Si el ACS también va en cascada, un equipo de ACS por máquina, cada uno con SU depósito.
- Lo hace `instalacionNueva` en [fichaCe3x.js](implementation/frontend/src/features/cee-envolvente/logic/fichaCe3x.js),
  con lo de cada unidad que da `resolverCe3x` (`unidadesCal`, `unidadesAcs`,
  [ce3xFinal.js](implementation/frontend/src/features/expedientes/logic/ce3xFinal.js)).
- Vale para la medida de mejora del inicial y para el CEE final, que salen de la misma
  función.

**Por qué a partes iguales, y no por potencia.** Es lo que pidió Fran, y es lo honrado cuando
cada máquina sirve su vivienda: el reparto real lo decide la demanda de cada casa, y esa no se
conoce por separado. Si un día hace falta otro reparto, se cambia en `partesIguales` y en
ningún otro sitio.

**REGLA — el SCOP del AHORRO CAE no se mueve.** `aero.scop` sigue siendo el MENOR de las
unidades (`scopAplicado`, el criterio conservador de la cascada). El `.cex` lleva el de cada
máquina porque describe el edificio, y el ahorro lleva el menor porque es lo que se promete. En
el 226, el SCOP aplicado sigue siendo 4,74 y el bono no cambia.

**REGLA — dos equipos con el MISMO nombre en el `.cex` no se distinguen en el árbol de CE3X**
(como pasó con los puentes, regla 64). El repetido lleva « (2)», « (3)»… (`nombresUnicos`),
igual que ya se escribía una segunda caldera. En el título del conjunto, en cambio, dos iguales
son «… (×2)».

**En una HIBRIDACIÓN no se reparte así**: allí el reparto entre bomba y caldera es el C_b
(regla 48.g), y la cascada sigue como antes.

**Lo medido en el 226.** CE3X 3.2 lo califica G/G, con una demanda de calefacción de 200,76
kWh/m²·año.

| Medida | Calefacción | ACS | Energía primaria no renovable (ahorro) |
|---|---|---|---|
| 1, la aerotermia (una máquina) | 90,1 % | 79,3 % | 88,1 % |
| 1, la aerotermia (las dos) | 90,3 % | 71,2 % | 88,0 % |
| 2, aerotermia + 10,43 kWp | | | 95,6 % |

El ACS baja porque son dos depósitos de 110 l en vez de uno, con sus pérdidas: es lo que hay
instalado.

**Tras tocarlo:** `node implementation/backend/scripts/test_cex_final.mjs` (apartado 7) y
`test_hibridacion.mjs`.
