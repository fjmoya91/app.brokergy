<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Qué PLANTAS se miden lo marcó una persona, no Catastro (2026-09-14)»; la introducción y el resto, en esta misma carpeta.

### La CARTOGRAFÍA del Catastro, debajo del plano (2026-09-14)

Una medianera lo es por lo que hay AL OTRO LADO. El plano ya dibujaba los
colindantes, pero con la cartografía de verdad debajo el certificador deja de
tener que fiarse de cómo la clasificó Catastro: lo está viendo. Botón **▦
Catastro** en la barra del plano.

**REGLA — encaja porque se pide el MISMO rectángulo, no porque se ajuste a ojo.**
El plano es la coordenada UTM trasladada (`x − minx + margen`, con la Y
invertida), así que el motor devuelve `georef` con el rectángulo del lienzo en
EPSG:25830 y al WMS del Catastro se le pide **ese**: la imagen cae píxel a
píxel. Cualquier otro camino —una imagen centrada en la parcela y encajada a
mano— se descoloca en cuanto el edificio esté en otra esquina.

**REGLA — el ancho y el alto en píxeles guardan la proporción del bbox.** El WMS
no la corrige: estira la imagen para llenar lo que se le pida, y un plano
estirado miente sobre las medidas que enseña. ⚠️ El croquis del `.cex`
(`getParcelImage`) sigue pidiendo **800×600 forzados** aunque su bbox sea
cuadrado: lleva así desde siempre y está verificado contra un fichero real, así
que no cambia de tamaño por pasar ahora por el helper común.

Se pide del rectángulo del **ENTORNO**, que contiene al de la casa: la misma
imagen sirve para los dos encuadres y no son dos peticiones. El backend la
cachea por rectángulo — al otro lado está el mismo WMS del que depende el
buscador de la app, así que encender y apagar el fondo no puede ser una petición
cada vez. Un WMS contesta sus errores con un XML y status 200: si lo que vuelve
no es una imagen, se dice.

**Sale ENCENDIDA por defecto**: comprobar contra qué da cada pared es el trabajo,
no un extra. Se separan la INTENCIÓN (`quiereCatastro`) y los datos (`catastro`)
para que apagarla no la vuelva a pedir en bucle, y **un fallo no se reintenta ni
sale por el aviso de error de la pantalla**: el plano funciona igual sin fondo, y
un error rojo por algo accesorio tapa los que sí hay que leer — se marca en el
propio botón (`▦ Catastro ⚠`) y volver a pulsarlo reintenta.

⚠️ **El filtro que la oscurece vive en `index.css`, no en el componente.** Es
papel blanco: sobre el papel oscuro del plano hay que invertirla (`invert(1)
hue-rotate(180deg)` — el giro de tono evita que los colores de Catastro, que su
usuario reconoce, salgan los complementarios). Leyendo la clase del tema en JS se
calcula UNA vez y al cambiar a tema claro el plano se quedaba invertido sobre
papel blanco.

**El lienzo del plano creció a `clamp(360px, 68vh, 900px)`** (era 46vh): es a lo
que se entra y donde se pasa el rato.

**El selector de tema va en la cabecera de esta ventana.** No es el
`DashboardLayout` —es propia—, así que no heredaba el del sidebar y para ver la
app en claro había que salir. Es el MISMO `ThemeToggle` (`collapsed`), no una
copia. ⚠️ Fuera del `ThemeProvider` `useTheme` cae a un no-op silencioso: un banco
de pruebas que monte esta ventana suelta tiene que envolverla, o el botón parece
roto sin serlo.
