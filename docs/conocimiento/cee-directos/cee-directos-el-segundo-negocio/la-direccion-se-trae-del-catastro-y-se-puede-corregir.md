<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### La dirección se trae del Catastro, y se puede corregir

Botón **"Traer"** junto a la referencia catastral: consulta `/api/catastro/search`
y reparte la respuesta en calle / CP / municipio / provincia.

**REGLA — rellena y se aparta: todo queda EDITABLE.** El Catastro escribe la vía
como la tiene registrada ("AV BARBER (DE) 26"), que a menudo no es como se escribe
la dirección de verdad, y **el piso y la puerta no los da nunca**. Por eso se avisa
en pantalla de que hay que comprobarla, en vez de bloquear los campos.

El troceo de la cadena es **fuente única** en
[utils/direccionCatastral.js](implementation/frontend/src/utils/direccionCatastral.js)
(`parseCatastroAddressFull`). Vivía dentro de `ClienteDetailModal`; se sacó al
necesitarlo la segunda pantalla, porque con dos copias la misma dirección se
rellena distinto según por dónde entres. Sin código postal no reparte nada: vuelca
la cadena entera en la calle y lo dice, antes que inventarse el municipio.

**Y se pregunta al DAR DE ALTA, no solo al corregir** (2026-09-21). En el alta, la
referencia catastral va justo detrás de "¿qué se ha contratado?" — antes que el
cliente — porque de ella sale todo lo demás. El alta usaba además inputs de TEXTO
LIBRE para municipio y provincia mientras la ficha usaba la cascada: el mismo
expediente se escribía de dos maneras según el momento, y de que el municipio case
con el INE depende la **zona climática**, que el servidor deriva de él en el propio
alta. Ahora las dos pantallas montan `DireccionEdit` y llaman a la misma
[traerDireccionCatastral](implementation/frontend/src/utils/traerDireccionCatastral.js),
que consulta, trocea y traduce los errores (el WAF saturado no es "no se ha podido
consultar"). Del modal salen también la comunidad (`ccaa`, que la ruta ya aceptaba)
y la chapa de zona climática.

**REGLA — la ZONA se DERIVA, no se invalida a mano.** Los dos sitios borraban la
zona en el `onChange` de la cascada "porque cambiar de municipio la invalida", y
rellenar la cascada dispara sus propios efectos de normalización, que vuelven a
emitir `municipio` y `provincia`: la zona recién traída se borraba un instante
después de traerla y **en el alta no llegaba a verse nunca** (en la ficha lo tapaba
el respaldo de `expediente.zona_climatica`). Se guarda CON QUÉ municipio se calculó
y se enseña mientras siga siendo ese (`mismoMunicipio`); al cambiar de pueblo
desaparece sola.

**REGLA — si hay que CREAR el cliente, su ficha nace con la dirección del
inmueble** (`ClientePicker`, prop `datosNuevoCliente` → `initialData` de
`ClienteFormModal`, que ya la esparcía en su formulario). En un CEE suelto el
titular vive casi siempre en la vivienda que se certifica, así que volver a teclear
lo que se acaba de traer del Catastro solo sirve para colar una errata; queda
editable, y **se DICE** bajo el botón ("nacerá con la dirección del inmueble ya
puesta"), porque quien da de alta al propietario de un piso alquilado no mira ese
bloque y guardaría una dirección que no es la suya. Vale para las DOS superficies:
el alta y la ficha.
