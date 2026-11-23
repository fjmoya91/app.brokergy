# Una planta CONSTRUIDA en la que no cuenta nada es espacio NO HABITABLE (2026-11-23)

**El caso — 26TER100_4 (Autoservicio Rodríguez, 6025509VH6962N).** Pequeño terciario: se certifican
las oficinas y la exposición de la planta 1 (Catastro 1/01/02 OFICINA, 441 m²). La planta baja es
la exposición y la nave (1/00/01 INDUSTRIAL y 1/00/02 COMERCIO), sin calefacción salvo un fancoil en
el mostrador (José Carlos, WhatsApp del 10/11). Fran abrió el `.cex` en CE3X y la planta 1 no tenía
suelo: «no has tenido en cuenta el suelo de la planta baja… ni el de la planta primera».

## Por qué salía sin suelo

Catastro llama «LOCAL» a la oficina, al comercio y a lo industrial (`alphanumeric.py`). Para el
motor las dos plantas tenían el mismo uso, así que el forjado entre ellas era `ENTRE_PLANTAS` con
`relevante_ce3x = false` («forjado entre plantas del mismo uso») y `generar_cex.py` no lo escribía.
Esa regla está pensada para el forjado entre dos plantas de la MISMA vivienda (regla 48.j). Aquí la
planta de abajo está construida, pero no cuenta nada en ella: no está acondicionada.

**REGLA — un nivel CONSTRUIDO en el que NADA cuenta no está acondicionado: el forjado entre él y una
planta que SÍ se mide es una partición con espacio NO HABITABLE**, se llame como se llame su uso en
Catastro. Lo aplica `elementos_horizontales` ([gis/floors.py](../../../implementation/cee-engine/src/gis/floors.py),
`sin_acondicionar`) con tres límites:

- solo si alguna planta se mide (`uso_medido`: lo marcó una persona o el uso por defecto); sin
  `marcar_usos_medidos` se queda el criterio de siempre;
- **nunca contra VIVIENDA**: otra vivienda del bloque, de otro propietario, está acondicionada y ese
  forjado no es de la envolvente;
- nunca contra un uso que no se conoce (`uso_dominante` vacío).

El forjado sale como `ESPACIO_NO_HABITABLE_INFERIOR` (o `_SUPERIOR` si la planta sin uso está
encima), con confianza 0,7 y la nota «en PB no cuenta nada (LOCAL sin acondicionar): espacio no
habitable». En el `.cex` es `PH11 SUELO SOBRE ESPACIO NO HABITABLE`, «horizontal inferior», con la U
de `particion_inferior` de la Guía: en el 26TER100_4, 432,03 m² y U 1,2.

Verificado sobre el edificio real con el motor arreglado (en seco): el `.cex` lleva ya el PH11, y
CE3X 3.2 lo califica con emisiones E (74) y EPNR D (308,82).

## Lo que Fran cambió a mano en el mismo `.cex`

- Demanda de ACS: 20 → **30 l/día**.
- Masa de las particiones: Pesada → **Ligera**.

En un terciario estos dos datos no salen de ningún dato. La skill `generar-cee-inicial` (punto 22)
los propone así y dice en el informe que son decisiones.

## Y lo que rompió el cambio de número

Al renombrar 26RES060_OP389 a 26TER100, `cee_inicial.js aplicar` dejó de imponer que la caldera del
inicial da también el ACS (regla 201 de `cee-generacion`). La regla miraba solo «RES060» en el
número. La caldera pasó a «sólo calefacción», el ACS quedó sin cubrir y CE3X no calificaba («El
porcentaje de demanda cubierta debe ser el 100 %»). Un TER100 es la misma sustitución en el
terciario, y la regla mira ya `RES060|TER100`.

Tras tocarlo: `python -m pytest implementation/cee-engine/tests/test_planta_mixta.py` (tres casos:
oficina sobre un local sin uso y al revés, otra vivienda que no se escribe, y sin nada medido no
cambia nada).
