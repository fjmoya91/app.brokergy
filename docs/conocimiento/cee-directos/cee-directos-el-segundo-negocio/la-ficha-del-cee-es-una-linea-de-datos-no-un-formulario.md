<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### La ficha del CEE es UNA LÍNEA de datos, no un formulario

La pantalla del expediente trata de UNA cosa: el certificado. El cliente, el
partner y la dirección son datos de referencia —se escriben una vez y luego solo
se consultan—, pero en formulario abierto se comían media pantalla y empujaban el
módulo CEE, que es a lo que se entra, por debajo del pliegue. Medido: el módulo
empezaba a ~700 px del borde; ahora, a **217**.

`ResumenDatos` los resume en una cinta de pastillas: cada una dice lo justo para
saber si está bien y se despliega si quieres el detalle (con el teléfono y el
email pulsables, que es para lo que se abre). Editar abre `DatosExpedienteModal`,
que **monta el MISMO formulario** —no una copia— con su autoguardado.

**REGLA — lo que FALTA se ve sin desplegar nada.** Una pastilla en ámbar diciendo
"Falta la dirección" es la mitad del valor de la cinta: es lo que impide
encargarle el CEE al técnico, y esconderlo detrás de un clic sería cambiar
espacio por despistes.

**REGLA — el estado del autoguardado SUBE al contenedor** (`onEstado`). Sin botón
de Guardar, ese "Guardando… / ✓ Guardado" es la única señal de que lo escrito ha
llegado; al meter el formulario en el modal se quedó escondido dentro y hubo que
subirlo a la cabecera. Un autoguardado sin acuse no se distingue de no guardar.

En móvil los desplegables son **hoja inferior a lo ancho**, no popover anclado:
280 px colgando de una pastilla en una pantalla de 375 se sale o queda ilegible.

⚠️ **Gotcha**: `prescriptores` NO tiene columna `telefono` — es `tlf`. Pedirla en
un `select` hacía fallar la consulta ENTERA y el partner llegaba como `null`, así
que la ficha decía "Directo" en un expediente que sí lo tenía.
