<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Los PUENTES TÉRMICOS se miran, ya no se listan (2026-09-19)

Hasta hoy eran una lista fija: por cada fachada un forjado y un pilar en esquina,
y por cada hueco su contorno. Salía igual en una vivienda de una planta que en un
bloque, y dejaba fuera **la mitad de los que CE3X trae marcados por defecto** —la
cubierta, la solera, los pilares integrados y la caja de persiana— porque no los
calculaba nadie.

Ahora se deciden mirando el edificio. Y de paso se cierra el agujero de al lado:
`huecos_defecto` existía en el motor y **no se lo mandaba nadie**, así que los
catorce huecos de un expediente salían todos «Doble + Metálico sin RPT».

| Qué | Dónde |
|---|---|
| Qué puentes tiene el edificio (reglas + ψ + a qué cerramiento cuelga cada uno) | [tools/puentes.py](implementation/cee-engine/tools/puentes.py) |
| Cómo son las ventanas de la vivienda (opciones, U, lo leído de las fotos) | [logic/ventanasVivienda.js](implementation/frontend/src/features/cee-envolvente/logic/ventanasVivienda.js) |
| El popup del arranque | `VentanasViviendaModal.jsx` |
| La estimación de pilares en el navegador | [logic/pilaresFachada.js](implementation/frontend/src/features/cee-envolvente/logic/pilaresFachada.js) |
| Pruebas | `python -m pytest implementation/cee-engine/tests/test_puentes.py` |

**TODO MEDIDO sobre 50 `.cex` de certificadores** (Downloads + Documents/CEX +
ejemplos), **1.733 puentes**. Ninguna de estas reglas es una opinión.

### Los OCHO tipos, y a qué cuelga cada uno

**REGLA — los que se llaman «encuentro de fachada con…» NO van sobre la
fachada.** El de cubierta cuelga de la **CUBIERTA** y los del suelo, del
**SUELO**: medido sobre los 74 encuentros del corpus, sin una sola excepción. No
es nomenclatura — CE3X los enseña bajo el cerramiento que dice
`cerramientoAsociado`, y ahí el certificador no los encontraría.

Su longitud es el **contorno vertical de esa planta, medianeras incluidas**: la
cubierta se apoya igual sobre la medianera del vecino. Contra ese perímetro la
mediana del corpus es **1,00**; contra el de solo las fachadas al aire, 1,19.

⚠️ Faltaba el ψ de `Encuentro de fachada con suelo en contacto con el aire`:
**0,97**, de los 10 casos del corpus, todos iguales. Los otros siete ya estaban y
coinciden valor a valor con el valor dominante del corpus.

### El forjado va SIEMPRE, también con una sola planta

Lo llevan **46 de los 50** ficheros, incluidos los de un solo nivel (CARBON,
GAS_NATURAL, PELLETS, PEDRO MUÑOZ), con longitud = largo del paño; y CE3X lo trae
marcado por defecto. Ahí el forjado es el de la cubierta apoyando en la fachada.
Decisión de 2026-09-19 tras contrastarlo: **no cambia ni un número de lo que la
app ya generaba**.

### Un pilar en esquina es un HECHO GEOMÉTRICO, no una fachada

Antes se escribía uno por cada tramo de fachada —que es lo que hacen los
certificadores a mano—, pero un edificio rectangular tiene cuatro esquinas tenga
sus fachadas partidas en cuatro tramos o en trece. Sobre 26RES060_187 eso son 13
pilares donde el edificio tiene 8. Ahora salen de los puntos donde dos fachadas
concurren **haciendo ángulo**, leyendo el trazado (`geometria_wkt`).

- **Un quiebro de menos de 15° no es una esquina.** Catastro parte una fachada
  cuando cambia el vecino de enfrente, y esos retranqueos no son pilares.
- **Contra una MEDIANERA no hay pilar en esquina.** Lo es por tener DOS caras al
  exterior; donde la fachada muere contra el vecino solo tiene una, y esa ya la
  recoge el pilar integrado.
- **Cada planta tiene las suyas**, aunque las coordenadas coincidan.
- **UNA fila por fachada, con sus esquinas sumadas.** Una fachada puede ser dueña
  de las dos suyas, y entonces salían **dos puentes con el mismo nombre**
  (`PT Pilar en Esquina-FBE1 PATIO` repetido): en el árbol de CE3X son dos
  entradas idénticas sin forma de distinguirlas. Lo destapó escribir un `.cex` de
  verdad y releerlo — no lo veía ningún test de la lista.
- **Sin trazado se cae a uno por paño y SE DICE.** No saber dónde dobla el
  edificio no puede dejar el `.cex` sin pilares, pero entonces el número es una
  aproximación y no una medida.

### Los pilares integrados se PROPONEN y se cuentan a mano

Su número no lo dice Catastro ni una foto: lo cuenta quien tiene la fachada
delante. Se propone **uno cada 3,5 m con mínimo 2** —la separación mediana de los
32 ficheros del corpus que los llevan, y la luz habitual de una vivienda— y se
corrige en el panel de la pared; **a 0 no se escribe el puente**. Su longitud es
siempre **un número entero de pilares × la altura de planta**: es lo que escriben
los 32 ficheros, sin una excepción.

⚠️ **La estimación está en DOS sitios** (`pilares_de` en Python y
`pilaresEstimados` en JS): la pantalla enseña el número y el motor lo escribe, y
si se separan el panel dice 3 y el certificado lleva 4 — no falla, miente. Lo
vigila `test_puentes.py`, que **lee el fichero JS**. Y el redondeo del navegador
replica el BANCARIO de Python (`round(2.5) == 2`), que sobre 8,75 m es un pilar de
diferencia.

### ¿Cómo son las ventanas? — se pregunta al entrar, una vez

Popup al abrir la envolvente de un expediente sin modelar: **vidrio, marco y
persiana**. De ahí sale la transmitancia de cada hueco —lo que más pesa en la
demanda de una vivienda antigua— y el puente de caja de persiana, que llevan 34 de
los 50 `.cex` del corpus y la app no escribía en ninguno.

**REGLA — no se pregunta NADA más.** Todo lo que se puede mirar en el plano o
derivar del expediente ya se deriva; un popup que pregunta de más se responde sin
leer, y entonces deja de servir para lo que sí importa.

**REGLA — no BLOQUEA, y sin contestar sale lo de siempre**
(`VENTANAS_POR_DEFECTO`: Doble + Metálico sin RPT, sin persiana). Un expediente
que no pase por el popup se escribe **exactamente igual que antes**; subir o bajar
ese defecto movería la demanda de partida de todo lo que se regenere, y eso lo
decide una persona. «Lo pongo luego» se sella (`ajustes.ventanas_luego`) para que
el popup no vuelva en el render siguiente.

**REGLA — viene CONTESTADO con lo que dicen las fotos ya leídas.** El lector de
huecos (`paredOcrService`) sacaba el material del marco, el acristalamiento y la
persiana desde hace meses **y se tiraban**: el popup de la lectura decía
literalmente «no se escribe en el .cex». Ahora manda lo más repetido, marcado «de
la foto», y ese texto dice la verdad. Lo que la foto no permite afirmar sale
`null`: un `triple` **no se traduce** —CE3X no lo tiene entre sus tres vidrios
estimados y declararlo como doble bajo emisivo sería escribir otra ventana.

**REGLA — un hueco puede llevar la CONTRARIA, y HEREDA en vez de copiar.** La
cocina ya cambiada, el baño que sigue con vidrio simple. Va plegado en una línea
(`Carpinteria`): en una fachada con seis ventanas, seis formularios abiertos son
un muro que esconde las medidas. Si se guardara una copia, cambiar la respuesta de
la vivienda no movería ningún hueco.

⚠️ La **puerta** conserva su 90 % de marco y su madera: lo que hace puerta a una
puerta es eso, no el tipo (regla del `.cex`).

```bash
python -m pytest implementation/cee-engine/tests/test_puentes.py
```
