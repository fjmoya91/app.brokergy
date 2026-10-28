<!-- conocimiento · área: envolvente-ce3x · las rutas de los enlaces son relativas a la raíz del repo -->

## Una ventana en una MEDIANERA la pasa a exterior, y las ventanas se ARRASTRAN a su pared (2026-10-28)

**Lo que pasó (2026EXT_1, 28/10/2026).** Fran no pudo añadir ventanas a FBE3 ni desde el plano ni por
audio: «NO ME HA DEJADO AÑADIR VENTANAS A FBE3». FBE3 estaba «Al vecino», o sea MEDIANERA, y en todos
los caminos un hueco en una medianera o una partición daba error. En la pizarra salía «solo van en
muros exteriores». El asistente (Haiku) pedía aclaración en vez de hacerlo. Y además había que saber
que el fallo venía del tipo de la pared. Fran: «tenemos que mejorar la usabilidad de la interfaz… que
sea súper fácil añadir ventanas, incluso con drag and drop».

**REGLA — poner una ventana o una puerta en una medianera o una partición la PASA A MURO EXTERIOR, y
se dice.** Si la pared tiene una ventana, da a la calle: quien la dibuja sabe más que la clasificación
de Catastro. Vale en los cuatro caminos, todos por la MISMA función (`ponHuecoEnPared` en
[usePlanoEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/usePlanoEnvolvente.js)):

- la pizarra (`interpretarTrazo` devuelve `aExterior: true, antes: 'MEDIANERA'`);
- los botones «+ Ventana / + Puerta» del panel de una pared sin huecos;
- arrastrar y soltar;
- el asistente (`pasaAExterior` en [asistenteEnvolvente.js](implementation/frontend/src/features/cee-envolvente/logic/asistenteEnvolvente.js)).

La pared pasa a FACHADA, con su nombre de fachada (`inicialDe`) si no lo tenía puesto a mano y con el
**rumbo hacia fuera** (`rumboHaciaFuera` desde el centro de la planta) si no tenía rumbo. El texto lo
dice todo: «+ V3 ventana en FBE3 de ≈1,3 m (medida por confirmar) · FBE3 pasa de medianera a muro
exterior · mira al E». El hueco nace **dudoso**: la medida real se confirma después.

**La excepción: una pared APARTADA** (fuera de la envolvente) sigue sin admitir huecos, porque no se
escribe en el `.cex`. El error dice cómo volver a tenerla en cuenta («desde su panel»).

### Arrastrar y soltar

Arriba del panel de la pared hay una **paleta**: «▭ Ventana» y «▯ Puerta».

- **Se arrastran** al plano. Mientras se arrastra, la pared más cercana se resalta y abajo sale «Suelta
  para poner la ventana en FBE3». Al soltar, el hueco va a esa pared, en el punto donde se suelta.
  Usa la misma tolerancia que un toque de la pizarra (`paredMasCercana` + `tolerancias`).
- **Con un clic**, el hueco va a la pared que está abierta.

El tipo de hueco va en el **nombre del tipo de dato** (`application/x-brokergy-hueco-ventana`): durante
`dragover` el navegador solo deja leer los tipos, no los valores, y hace falta saber qué se arrastra
para resaltar la pared antes de soltar. El resultado sale 4,5 s en verde si ha ido bien, o 7 s en
ámbar si no (por ejemplo, si se suelta lejos de cualquier pared).

### El asistente, sin preguntar lo obvio

[services/asistenteEnvolvente.js](implementation/backend/services/asistenteEnvolvente.js) (INSTRUCCIONES):

- «E3», «N1», «la este tres» es la única pared que acaba así (FBE3, FBN1). Si hay varias, se pregunta.
  `buscaPared` hace lo mismo en el navegador.
- **NUNCA** pregunta las medidas, el marco ni el vidrio de un hueco nuevo: van a `0`/`"igual"` y la
  pantalla los deja «por confirmar».
- Una ventana o una puerta en una medianera o una partición genera primero `cambiar_pared {FACHADA,
  rumbo igual}` y después los `anadir_hueco`. Si el rumbo falta, lo pone el navegador.
- `cambiar_pared` se aplica sobre el mapa al validarse, para que el `mover_hueco` o `anadir_hueco`
  siguiente no vuelva a convertir la pared.

### El popup «Antes de generar» se leía negro sobre negro

`PreguntasPrevias` (EnvolventeView) y `LecturaFotoModal` tenían el fondo fijo (`#141414`, `#111`), y
en el tema claro el texto oscuro del tema quedaba encima («CUANDO PULSO GENERAR NO SE VE LAS LETRAS»).
Ahora usan `bg-bkg-surface`, el fondo del tema. Un popup nunca lleva un fondo fijo.

Tras tocarlo: `node implementation/backend/scripts/test_pizarra.mjs` y
`node implementation/backend/scripts/test_asistente_envolvente.mjs`.
