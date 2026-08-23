# Fotos de ejemplo del recorrido guiado

Cada paso del enlace de subida (`/subir-docs`) enseña una foto de ejemplo.
El mapa apartado → fichero es **explícito** y vive en `SLOT_FOTO`, dentro de
[SlotIlustracion.jsx](../../src/features/docs/SlotIlustracion.jsx). Un apartado
que no esté en ese mapa cae al pictograma SVG, así que nunca se queda sin nada.

## Ficheros actuales

| Fichero                 | Qué enseña                                            | Apartados que lo usan                        |
|-------------------------|-------------------------------------------------------|----------------------------------------------|
| `caldera.jpg`           | Caldera antigua instalada en su sala                   | Caldera actual                               |
| `placa_caldera.jpg`     | Placa de la caldera, legible                           | Placa de la caldera                          |
| `hueco.jpg`             | Sala con la caldera ya desmontada                      | Caldera antigua desmontada                   |
| `unidad_exterior.jpg`   | Unidad exterior de aerotermia instalada                | Unidad exterior · Bomba de calor de piscina  |
| `placa_aerotermia.jpg`  | Placa de la unidad exterior, legible                   | Placa unidad exterior · Placa unidad interior|
| `unidad_interior.jpg`   | Unidad interior / hidrokit instalado                   | Unidad interior · Depósito de ACS            |
| `fachada.jpg`           | Fachada antigua completa desde la calle                | Fachada de la calle · Fachada a aislar       |
| `fachada_despues.jpg`   | Aislamiento interior instalado, antes del acabado      | Aislamiento de fachada terminado             |
| `cubierta.jpg`          | Cubierta antigua completa                              | Cubierta / tejado (antes)                    |
| `cubierta_despues.jpg`  | Cubierta rehabilitada y aislada                        | Cubierta terminada                           |
| `suelo_radiante.jpg`    | Armario de colectores abierto, con los circuitos       | Armario del suelo radiante                   |
| `patios.jpg`            | Patio interior antiguo, completo                       | Patios interiores                            |
| `patios_despues.jpg`    | Patio interior rehabilitado — **de reserva**           | (ninguno, aún)                               |
| `cee.jpg`               | Etiqueta de calificación energética                    | Certificado energético existente             |
| `ventana.jpg`           | Ventana antigua abierta, completa                      | Ventanas a sustituir                         |
| `vivienda_despues.jpg`  | Vivienda rehabilitada (cubierta, fachada y ventanas)   | Ventanas nuevas                              |
| `ventana_alt.jpg`       | Ventana antigua con contraventana — **de reserva**     | (ninguno, aún)                               |

## Cómo se preparan

Las originales (1254 × 1254 PNG, ~2 MB) están fuera del sitio web, en
`implementation/frontend/tutorial-originales/`, y **no se despliegan ni se
commitean**. Lo que se sirve es la versión procesada: 900 px de ancho, JPEG
progresivo al 84 %, ~120 KB.

**Se recorta el titular incrustado.** Las originales llevan arriba un
"FOTO DE LA PLACA DE LA CALDERA" con su subtítulo. Ese texto sobra: la app ya
pone el título en lenguaje de cliente ("La pegatina de la caldera") y verlo dos
veces —una en llano y otra en jerga— es la confusión que se está quitando.
Además, en un móvil de 375 px esa franja se renderiza a ~7 px y no se lee.
Lo que sí se conserva es el **encuadre verde** y el **distintivo**, que es lo
que de verdad enseña qué tiene que salir en la foto.

## Para añadir una foto nueva

1. Déjala en esta carpeta con un nombre corto en minúsculas.
2. Añade la línea al mapa `SLOT_FOTO` de `SlotIlustracion.jsx`.

Requisitos: **apaisada o casi cuadrada, ~900 px de ancho, JPEG por debajo de
150 KB**, bien iluminada y **sin nada identificable** — ni caras, ni números de
portal, ni nombres de calle, ni datos de un cliente. Si se reutiliza material de
Drive de un cliente hace falta su consentimiento, igual que para el escaparate.
