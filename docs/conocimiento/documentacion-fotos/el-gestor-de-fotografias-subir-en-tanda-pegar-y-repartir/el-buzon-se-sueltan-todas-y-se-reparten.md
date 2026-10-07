<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### El BUZÓN: se sueltan todas y se reparten

Soltar ficheros **fuera** de una casilla abre el repartidor (las tarjetas cortan la
propagación, así que soltar sobre una sigue subiendo ahí). Un modelo propone el
apartado de cada foto y dice qué ha visto ("caldera mural de gas"); quien mira
confirma o corrige con un desplegable. Solo ADMIN: detrás hay una llamada de pago,
y el cliente va guiado apartado por apartado.

**REGLA — el modelo mira, el código valida y la persona confirma.** El prompt
lleva dentro el checklist REAL de ese expediente (con su alcance ya podado) y la
clave propuesta tiene que estar en él: cualquier otra cosa se descarta y la foto
queda "sin clasificar". Lo que no encaja se deja sin destino a propósito — quien
revisa detecta antes un hueco que un acierto falso — y lo que no tiene destino NO
se sube. El cajón "Otros" no se propone nunca: es donde va lo que no encaja, y eso
es una decisión de la persona, no del modelo.

**REGLA — a clasificar se manda una copia MUY reducida** (`miniaturaParaMirar`,
768 px): lo que hay que reconocer es qué aparato sale, no leer su nº de serie. Es
lo contrario del lector de placas, que las manda intactas. Después se sube el
fichero de verdad, por el camino de siempre.

**REGLA — aquí SÍ se piensa** (`pensar: true`). Los demás lectores de la casa
transcriben y van con `thinkingBudget: 0`; reconocer un aparato en su contexto no
es transcribir. Se trocea en tandas de 12 por llamada: con más, el modelo empieza a
confundir el orden de las imágenes con el de las respuestas, que es el único hilo
que las ata — por eso el índice se valida contra el tramo de su tanda.

Una tanda que falle deja sus fotos **sin clasificar**, no tumba la pantalla: se
colocan a mano, que es lo que se hacía antes. Coste estimado sobre el tamaño de
entrada medido en los otros lectores: unos **0,0005 € por foto**.
