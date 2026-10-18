<!-- conocimiento · área: placas-catalogos · las rutas de los enlaces son relativas a la raíz del repo -->

## AEROSUN: la ADVANCED es la serie HM; la CONFORT PLUS, la HL (2026-10-14)

Detectado por Fran en 26RES060_OP293 (Miguel Martín, Instalaciones Miguelturra): en el catálogo
las cuatro **ADVANCED** (ids 164 · 163 · 92 · 165) estaban DUPLICANDO a las **CONFORT PLUS**
(506-509): los mismos códigos `HL…HG05`, los mismos SCOP y la misma ficha
(«AEROSUN - FT CONFORT PLUS R290.pdf»). La Advanced es OTRA máquina, la serie **HM** de
Warmhouse («Hellas R290 monobloc»):

| Comercial | Ud. exterior | SCOP 35 °C medio / cálido | SCOP 55 °C medio / cálido | η 35 °C medio / cálido | η 55 °C medio / cálido |
|---|---|---|---|---|---|
| ADVANCED 8 (id 164) | HM-M0-A5 | 4,73 / 6,53 | 3,55 / 4,65 | 186 / 258 | 139 / 183 |
| ADVANCED 12 (id 163) | HM-M1-A5 | 5,00 / 7,03 | 3,90 / 4,90 | 197 / 278 | 153 / 193 |
| ADVANCED 16 (id 92) | HM-M2-A5 | 5,08 / 6,90 | 3,88 / 4,93 | 200 / 275 | 152 / 194 |
| ADVANCED 19 (no está) | HM-M3-A5 | 5,05 / 6,85 | 4,00 / 4,85 | 199 / 271 | 157 / 191 |
| ADVANCED 20 (id 165) | HM-M4-A5 | 5,15 / 6,85 | 3,98 / 4,88 | 203 / 271 | 156 / 192 |

Fuentes, en Drive «13. AEROSUN / AEROSUN 16 R290 HM»: la ficha de la serie
(«AEROTERMIA ADVANCED R290_SCOP MEDIO CALIDO_DEF.pdf», página 3, con la equivalencia
comercial ↔ HM) y la tabla original del fabricante («technical data-Hellas R290 monobloc
average&warm climate.pdf», con las η). Cuadran entre sí (SCOP = 2,5·(η+3)/100; la 16 a 35 °C
cálido da 6,95 por la η y la ficha dice 6,90: se ha puesto el de la ficha) y con el informe
TÜV de la HM-M0 (CN26GU2T 001: η 186 / 139 en clima medio) y EPREL 2865852, que **solo**
declaran el clima medio — por eso Aurelio creía que «no hay ensayos de clima cálido».

**REGLA — una Aerosun se identifica por el CÓDIGO de la placa, no por el nombre comercial.**
`HL…` es Confort Plus; `HM-M…` es Advanced. En 26RES060_195 estaba elegida la ADVANCED 12 con
SCOP 6,75 (el de la HL12) y la placa dice HM-M1-A5 (7,03).

Corregido el 14/10/2026 en las filas 164, 163, 92 y 165 (códigos, SCOP, η, refrigerante R290,
COP A7/W55 = el MÍNIMO del rango de la ficha, ficha → la de la serie Advanced). El **SEER se
ha dejado vacío**: la ficha solo da EER, y lo que había era el EER de otro modelo (columna
corrida). **El 16/10/2026 la ADVANCED 8 (164) lleva SEER = 2,82**: el EER de SU columna de la
ficha (2,82-3,23, aire a 35 °C y agua a 12/7), el mínimo del rango como el COP, porque con suelo
radiante la medida del CEE declara el frío y sin él el XML sale con «SEER de ___» (regla 127:
sin SEER, el EER de la ficha). La placa de 26RES060_236 dice 2,95-2,97. Las 12, 16 y 20 siguen
vacías. La copia de las filas tal como estaban, en el scratchpad de la sesión
«26RES060_OP293 - MIGUEL MARTIN». Expedientes y oportunidades que ya las tenían elegidas
(guardan su SCOP copiado, no lo recalculan solos): 26RES060_195 (163), 25RES060_67 y
26RES060_190 (92); oportunidades 26RES060_OP152, _OP200 (163), _OP183, _OP79, _OP86 y
AS_26RES060_96 (92). Falta dar de alta la ADVANCED 19 (HM-M3-A5).
