<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### El formulario se guarda solo, y eso tiene una trampa

`DatosExpediente` **autoguarda** con un freno de 900 ms. El freno no es estética:
cambiar el nombre RENOMBRA la carpeta de Drive, y guardar a cada tecla dispararía
una llamada a Google por letra.

⚠️ **REGLA — el guardián del autoguardado compara VALORES, no "¿es el primer
render?".** La primera versión usaba una bandera de "ya monté" y al abrir el
2026CEE_54 se autoguardó sola y **le borró el `prescriptor_id`**. Dos causas, y
las dos las mata comparar contra lo último persistido:

1. el efecto se re-lanza cuando cambia la identidad de `onGuardado`, y el padre lo
   pasa como flecha en línea (nuevo objeto en cada render), así que la bandera se
   saltaba en la segunda pasada;
2. y como al guardar se refresca el expediente, el padre re-renderiza y vuelve a
   cambiar `onGuardado`: **bucle de guardados**.

Por eso `persistido` guarda el JSON de lo que consta escrito y el efecto sale sin
hacer nada si el formulario coincide, y `onGuardado` viaja por `useRef` para que su
identidad no entre en las dependencias. Verificado: **cero PUT al abrir la ficha**,
**un solo PUT** al teclear cinco letras seguidas.
