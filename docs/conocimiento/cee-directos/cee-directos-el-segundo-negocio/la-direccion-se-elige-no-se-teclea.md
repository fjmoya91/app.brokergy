<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### La dirección se ELIGE, no se teclea

**REGLA — comunidad, provincia y municipio van por SELECTOR en cascada.** Es lo
que impide que el mismo municipio acabe escrito de siete maneras y luego no case
con nada. A mano solo se escriben el **código postal** y la **calle**.

Fuente única: [components/DireccionEdit.jsx](implementation/frontend/src/components/DireccionEdit.jsx),
que lo comparten la ficha de cliente y el expediente de CEE directo. Vivía dentro
de `ClienteDetailModal`; se sacó al necesitarlo la segunda pantalla, porque con
dos copias la dirección del cliente y la del inmueble se normalizarían distinto y
dejarían de casar. Sus siete efectos de normalización no sobran: los datos llegan
de la BD en MAYÚSCULAS, del Catastro con la provincia pegada al municipio, y a
veces solo hay un CP del que deducir provincia y comunidad.

⚠️ **Gotcha corregido**: al elegir la opción vacía de un `<select>`, `opt.text` es
el RÓTULO del desplegable. Sin guarda, vaciar la provincia guardaba
`"— Selecciona provincia —"` como provincia. Afectaba también a la ficha de
cliente.
