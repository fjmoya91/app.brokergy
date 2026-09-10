# Clasificación de cerramientos

Contra qué da cada muro. Todo sale de operaciones geométricas; no hay heurística
visual ni umbral escondido.

## El árbol de decisión

Para cada segmento del perímetro de **una planta**:

```
1. ¿Coincide con la huella de un edificio COLINDANTE a ESTA altura?
      → sí, en parte  → se parte: esa parte es MEDIANERA
      → el resto sigue bajando

2. ¿Coincide con un espacio NO HABITABLE de la misma parcela? (solo con DXF)
      → PARTICIÓN INTERIOR VERTICAL

3. Del resto, se sondea un punto al otro lado del muro (0,35 m en la dirección
   de su normal exterior) y se mira DÓNDE cae:

      ¿es el borde de un hueco de la huella?      → FACHADA A PATIO
      ¿cae dentro de la propia huella?            → DESCONOCIDO (esquina cóncava, revisar)
      ¿cae dentro de un vecino a esta altura?     → MEDIANERA (confianza 0,70)
      ¿cae sobre la cubierta de la planta de abajo? → FACHADA SOBRE CUBIERTA INFERIOR
      ¿cae sobre la cubierta de un COLINDANTE?    → FACHADA SOBRE CUBIERTA DEL COLINDANTE
      ¿cae en un espacio libre de la parcela?     → PATIO o RETRANQUEO, según lo cerrado que esté
      en cualquier otro caso                      → FACHADA A CALLE
```

## La vecindad se resuelve POR PLANTA

Un muro de la primera planta **no es medianera porque el vecino tenga planta
baja**: lo es si el vecino **llega a esa altura**. Por eso se piden también los
`BuildingPart` de las parcelas colindantes, que traen su `numberOfFloorsAboveGround`.

Medido en Pedro Muñoz: los dos colindantes que tocan la casa tienen **una
planta** y la casa tiene dos, así que M01, M02 y M03 (17,57 m en total) son
medianera abajo y fachada arriba. Declararlas adiabáticas en las dos plantas
sería inventar 47 m² de envolvente.

Si Catastro no da las partes del colindante, **se asume que llega** y esas
medianeras salen con la confianza rebajada y la nota puesta. Asumir lo contrario
declararía muro exterior donde puede haber medianera, que es el error caro.

## Fachada sobre cubierta del colindante

Cuando el vecino existe pero no llega a esa planta, el muro da al aire — pero
**no a la calle**: da sobre su cubierta. Se dice, por dos razones:

* térmicamente hay un edificio debajo (sombras, protección);
* y explica por qué ahí NO hay medianera aunque el plano catastral lo parezca,
  lo que impide que alguien lo "corrija" de vuelta.

## Patio vs retranqueo

Un jardín delantero de 1 m es fachada exterior. Un patio es un hueco **rodeado**
de edificación. La diferencia no es el tamaño: es cuánto lo cierran los edificios.

```
cerramiento = longitud del borde del espacio libre pegada a edificios
              ─────────────────────────────────────────────────────────
                          longitud total de su borde
```

Por encima de `patio_enclosure_ratio` (0,60) es patio. La fracción **se imprime
en la nota** para poder discutirla: *"patio: el 79 % de su borde lo forman
edificios"*.

### Un patio lo es del EDIFICIO, no de la planta

Calculando el cerramiento sobre la huella de cada planta, los mismos dos patios
de Pedro Muñoz salían PATIO desde la baja y RETRANQUEO desde la primera: al
encoger la planta, el hueco se hace mayor y su borde deja de estar rodeado. Se
mide siempre sobre la huella **global** del edificio.

## Los dos tipos de patio

| | |
|---|---|
| `PATIO_EDIFICIO` | hueco interior de la propia huella (un anillo interior del polígono) |
| `PATIO_PARCELA` | espacio libre de la parcela suficientemente cerrado |

Para CE3X los dos son **fachada**, subtipo `PATIO`. La distinción se conserva
porque cambia el estudio de sombras.

## Qué es cada cosa en CE3X

| Contacto geométrico | Tipo CE3X | Subtipo |
|---|---|---|
| `OTHER_BUILDING` | MEDIANERA | `EDIFICIO_COLINDANTE` |
| `PATIO_EDIFICIO` / `PATIO_PARCELA` | FACHADA | `PATIO` |
| `EXTERIOR_CALLE` | FACHADA | `CALLE` |
| `EXTERIOR_RETRANQUEO` | FACHADA | `ESPACIO_LIBRE_PARCELA` |
| `EXTERIOR_SOBRE_CUBIERTA` | FACHADA | `SOBRE_CUBIERTA_INFERIOR` |
| `EXTERIOR_SOBRE_VECINO` | FACHADA | `SOBRE_CUBIERTA_COLINDANTE` |
| `NO_HABITABLE` | PARTICIÓN INTERIOR VERTICAL | `ESPACIO_NO_HABITABLE` |
| `DESCONOCIDO` | FACHADA | `SIN_DETERMINAR` — **siempre marcado para revisión** |
