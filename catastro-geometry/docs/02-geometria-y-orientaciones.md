# Geometría y orientaciones

## El CRS: nunca se miden metros sobre latitud y longitud

Todo el cálculo va en **EPSG:25830** (ETRS89 / UTM 30N), donde `+x` es el Este y
`+y` el Norte **de verdad**, y un metro es un metro. El GML llega en el SRS que
pida el servicio y se reproyecta una sola vez, al entrar.

### El orden de los ejes es una trampa

```
urn:ogc:def:crs:EPSG::4258   → se respeta el orden de la autoridad = lat, lon  → HAY QUE INVERTIR
EPSG:4258                    → forma corta, por convenio = x, y                → no se invierte
```

Si se equivoca, **el edificio aparece en el golfo de Guinea y el CSV no se entera
de nada**: los largos salen iguales. Por eso hay un test que reproyecta el mapa
de vuelta y comprueba que da las mismas longitudes que el CSV.

## La normal exterior, no la dirección de la línea

La orientación de una fachada es la de **hacia dónde mira**, no la de la recta.
Es el error clásico y produce fachadas giradas 90°.

Se normaliza el sentido de giro con `shapely.orient()`:

* anillo **exterior** → antihorario (CCW)
* anillos **interiores** (patios) → horario (CW)

Con ese convenio, para un segmento `p1 → p2` con `d = p2 − p1`, la normal
exterior es **siempre**:

```
n = (dy, −dx)      normalizado
```

y funciona en los dos casos:

* en el perímetro CCW apunta **fuera** del edificio;
* en un hueco CW apunta **hacia el patio**, que es hacia donde mira esa fachada.

El azimut sale de `atan2(nx, ny)` en grados desde el Norte y en sentido horario:

```
normal (0, −1)  → azimut 180  → SUR     (el borde de abajo es la fachada sur)
normal (1,  0)  → azimut  90  → ESTE
```

### Los ocho sectores de CE3X

`N NE E SE S SO O NO`, de 45° cada uno, con los límites **a mitad de sector**:
N es `[337,5 , 22,5)`, NE es `[22,5 , 67,5)`, y así.

## La tolerancia DETECTA el contacto; no lo MIDE

Es el fallo que más caro salía. La cartografía catastral no hace coincidir al
milímetro dos parcelas colindantes, así que hace falta una tolerancia
(`--tolerance`, 0,15 m) para saber que dos edificios se tocan.

**Pero si se dilata al vecino y se mide sobre el dilatado, la medianera crece
`tol` por cada extremo**: una medianera de 6,00 m salía de 6,15 m. Esos 15 cm
viajan a la superficie del muro del certificado.

Lo que se hace:

1. se toma la parte del vecino que cae dentro de una **banda** de `tol` metros
   alrededor de la recta;
2. se **proyecta sobre la recta** esa geometría **sin dilatar**.

Así la tolerancia decide *si* hay contacto, pero no *cuánto* mide.

## Cada trozo se sondea por su cuenta

Con el vecino ocupando 6 de los 10 m de una pared, sondear el punto medio del
segmento **entero** (que cae dentro del vecino) daba los 4 m libres también como
medianera. El segmento se parte primero y cada trozo se clasifica con su propio
punto de sondeo.

Resultado del caso de referencia: **6,00 m de medianera + 4,00 m de fachada**,
exactos.

## Se fusionan los muros colineales del mismo tipo

La unión de dos `BuildingPart` que comparten un lado deja un vértice en mitad de
una pared recta: la fachada de 12 m salía partida en 8 + 4. En CE3X eso son dos
filas donde hay una, y el plano se llena de rótulos.

Se unen **solo** si coinciden el anillo, la clasificación y la orientación. Un
vértice que separa medianera de fachada **no se toca nunca**.

## El `boundedBy` no puede tapar la geometría

`bu-ext2d:Building` trae primero un `gml:Envelope` dentro de `gml:boundedBy` y
**después** su `gml:Surface`. Cogiendo "el primer tag geométrico que aparezca":

* el edificio se quedaba **sin huella** y el modelo caía al respaldo de
  BuildingParts sin que nadie se enterara;
* y si el `Envelope` llegara a aceptarse como geometría sería peor: un
  **rectángulo inventado** con toda la apariencia de una huella buena (254 m²
  frente a los 191,5 reales, en el caso de Pedro Muñoz).

Por eso hay prioridad de tipos, se ignora lo que cuelgue de `boundedBy` y el
`Envelope` **no se acepta como geometría jamás**.
