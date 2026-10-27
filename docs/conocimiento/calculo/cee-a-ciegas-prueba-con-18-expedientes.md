<!-- conocimiento · área: calculo · las rutas de los enlaces son relativas a la raíz del repo -->

## El CEE «a ciegas»: prueba con 18 expedientes y Fase 0 con 120 (2026-10-26)

**Pregunta de Fran (26/10/2026)**: ¿se puede estimar la oportunidad haciendo el CEE por programa, sin
IA y sin fotos, para que lo ofrecido se parezca a lo que da después el CEE inicial, sin ofrecer nunca de
más? Esto es lo MEDIDO; no hay nada en producción.

**Cómo se hizo** (solo lectura de la BD; nada a Drive): con la referencia catastral, el motor mide la
geometría (`/envolvente`), la ficha se compone con `componerFicha` (Guía CE3X 3.2, caldera de la
oportunidad), cada fachada al aire lleva un 12 % de huecos, el `.cex` lo escribe el motor y lo califica
CE3X 3.2 en el PC (`calificarCex`, carpeta temporal). Se compara la demanda de calefacción TOTAL
(kWh/m²·año × m²) con la del CEE inicial del expediente. Ratio = CEE real ÷ estimación (por debajo de 1 =
se habría ofrecido de más). Muestra: 21 elegidos, a propósito con los PEORES de la calculadora (OP290,
OP80, OP117, OP33…); 18 calificados (dos sin huella en Catastro, uno con un aviso de fechas de CE3X).

**Dos pasadas**:

- **v1** — el plano tal cual sale: el edificio entero de Catastro en las plantas que se miden.
- **v2** — aceptando SOLAS las dos propuestas que el motor ya hace a una persona: quitar los cuerpos
  casados con una construcción NO vivienda (`cuerpos`) y el `croquis_propuesto` (garaje, porche, almacén
  dentro de la planta, ya ajustado a los m² de Catastro).

| En los 13 con la superficie de Catastro = la del CEE | min | P10 | mediana | P90 | max | por debajo de 1 |
|---|---|---|---|---|---|---|
| Calculadora (lo que se ofreció) | 0,84 | 0,89 | 1,29 | 1,79 | 5,09 | 5 |
| Ciego v1 | 0,59 | 0,67 | 0,92 | 1,05 | 1,07 | 8 |
| **Ciego v2** | **0,79** | 0,88 | **0,96** | 1,05 | 1,38 | 8 |
| Ciego v2 × 0,78 | 1,01 | 1,13 | 1,23 | 1,35 | 1,77 | **0** |

**Lo que dice**:

1. **Las U no son el problema**: los `.cex` de los técnicos llevan las mismas de la Guía. La diferencia es
   la GEOMETRÍA — qué es vivienda. En v1 el ciego metía como envolvente el porche, el garaje o el almacén
   que el técnico deja como partición (26RES060_245: 198 m² de fachada frente a 98 + 42 de partición).
   Con las propuestas del motor (v2) la horquilla pasa de 0,59–1,07 a 0,79–1,05.
2. **El ciego v2 se equivoca POCO pero hacia ARRIBA** (mediana 0,96): para no ofrecer nunca de más hay que
   ofrecer su ~78 %. Con eso, en esta muestra, nadie por debajo y la mediana deja un 23 % sin ofrecer —
   parecido a la calculadora (30 %) pero sin su cola: la calculadora va de 0,84 a 5,09.
3. **La SUPERFICIE sigue mandando**: en 5 de 18 Catastro da más m² que el CEE (26RES060_134: 1.037 frente
   a 314; _242: 270 frente a 220; _153: 123 frente a 91; _182: 229 frente a 195; 26RES093_14: 363 frente
   a 280). Ahí el ciego falla IGUAL que la calculadora (0,48–0,76), porque parte de la misma superficie.
   Ningún coeficiente lo arregla: hace falta que una persona confirme los m² (o la selección de
   construcciones) antes de ofrecer.
4. El ciego **solo se puede calificar en el PC** (CE3X es de Windows): ~1-2 min por vivienda. En el VPS se
   escribe el `.cex`, la calificación tendría que ir por la cola del PC, como el `POR CALIFICAR`.

**Cautelas**: 13 casos (18 con los de superficie); muchos CEE de los técnicos son de antes del 08/10 (otra
Guía); 26RES060_244 (2015) da 1,38. El 0,78 NO es una regla: es lo que dio esta muestra.

### Fase 0: todos los expedientes con CEE (2026-10-26)

Misma prueba (v2, y con **imagen neutra** en vez de las del Catastro: misma demanda, cero peticiones de
imágenes) sobre los 132 expedientes de la medición: **120 calificados**. Los 12 que no: 4 sin geometría
del Catastro, 6 que CE3X no califica (5 por «el ACS debe cubrir el 100 %», ver más abajo), 2 cortes del motor.

| | n | P5 | P10 | mediana | P90 | max | por debajo de 1 |
|---|---|---|---|---|---|---|---|
| Calculadora (lo que se ofreció), superficie OK | 91 | 0,93 | 1,01 | 1,29 | 2,23 | 5,09 | 7 |
| **A ciegas**, superficie OK | 91 | 0,81 | 0,88 | **1,09** | **1,45** | 1,71 | 27 |
| A ciegas, unifamiliares con CEE del técnico | 81 | 0,82 | 0,88 | 1,07 | 1,48 | 1,71 | 26 |
| A ciegas frente a NUESTROS CEE (con fotos) | 9 | 1,05 | 1,06 | 1,13 | 1,31 | 1,32 | 0 |
| Superficie de Catastro ≠ la del CEE (> 5 %) | 29 | — | — | — | — | — | — |

**Lo que cambia respecto a la muestra de 18** (que se eligió con los peores casos de la calculadora):

1. **La cifra a ciegas acierta más en el centro y en lo alto**: la dispersión (desviación típica del
   logaritmo) baja de 0,34 a 0,22, y sobre todo desaparecen los casos en que la calculadora se quedaba
   muy corta (P90 2,23 → 1,45; máximo 5,09 → 1,71). Por épocas, el salto está en 2008 en adelante
   (mediana de la calculadora 1,88, a ciegas 1,08).
2. **Por abajo NO es más prudente que la calculadora**: su P5 es 0,81 frente a 0,93. Para no ofrecer nunca
   de más habría que ofrecer ~el 80 % de la cifra a ciegas, y entonces la mediana que se deja sin ofrecer
   (1,36) es la misma que con la calculadora. **Como sustituto, no gana; como señal, sí** (punto 3).
3. **Como SEGUNDA OPINIÓN acierta casi siempre en la dirección que importa para no perder obras**: cuando
   la cifra a ciegas sale **más de 1,3 veces** la de la calculadora (37 de 90 unifamiliares), en **36** el
   CEE real dio también más de 1,17 veces lo ofrecido (mediana 1,73). Son las propuestas que salieron
   cortas. La señal contraria («a ciegas da menos») es floja: caza 2 a 4 de las 7 sobreofertas, y eran
   pequeñas (0,84–0,97).
4. **La superficie descuadra en 1 de cada 4** (29 de 120), en los dos sentidos: Catastro da más m² que el
   CEE en 13 y menos en 16. Cuando da más, las dos cifras se pasan igual (26RES060_134: 1.037 m² frente a
   314). Sigue haciendo falta que una persona mire los m².
5. Fallo a corregir si se construye: en 5 viviendas CE3X no califica porque el equipo de ACS que pone la
   ficha cubre otra superficie que la medida (el caso de 2026CEE_61); a ciegas no hay ACS que respetar y
   debería ir el termo por defecto.

Cautelas: la calculadora de la tabla es la de entonces (antes de la Guía y del ×1,25 de 2008+), así que hoy
la diferencia en 2008+ es menor; los CEE de los técnicos anteriores al 08/10 llevan otra Guía; los 9
«nuestros» los hizo el mismo motor con fotos.

Cómo meterlo en la oportunidad (propuesta, sin construir): [cee-a-ciegas-diseno-para-la-oportunidad.md](docs/conocimiento/calculo/cee-a-ciegas-diseno-para-la-oportunidad.md).

Relacionado: [calibracion-por-epoca-unifamiliar-2008-en-adelante.md](docs/conocimiento/calculo/calibracion-por-epoca-unifamiliar-2008-en-adelante.md)
(la mejora que sí se aplicó el mismo día).
