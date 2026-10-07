<!-- conocimiento · área: envolvente-ce3x · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «La medida de mejora de una HIBRIDACIÓN (2026-09-16)»; la introducción y el resto, en esta misma carpeta.

### Y el CEE FINAL, igual (2026-09-16)

El final tampoco se generaba: respondía «móntalo a mano». Ahora sale con los dos
generadores — pero por otro camino, porque el final **se COPIA del inicial**.

**REGLA — la caldera del CEE final es la del FICHERO, no una recompuesta.** No
viaja en la ficha: se conserva su registro del `.cex` que se está copiando y solo
se le cambia el bloque `[5]`, que es donde van la superficie servida y el
porcentaje de cada servicio. Verificado campo a campo contra el `.cex` real de
26RES093_8: de sus diez campos **solo cambia el 5**, y sus rendimientos, su
generador, su combustible, su cola de estimación (`Sin aislamiento · 79 · 0.2 ·
27.8`) y su depósito de 100 l salen byte a byte como estaban. Recomponerla desde
el expediente desharía lo que el certificador haya corregido dentro de CE3X, que
es justo lo que no puede pasar al copiar un fichero suyo.

Así que la ficha solo declara **cuánto** se queda —`hibridacion:
{ pct_generador_previo: 21 }`—, que es lo único que el motor no puede saber
mirando el fichero; y `construir_instalaciones` recibe `conservar`, que es el
contrario de `retirar`: lo que habría que quitar se queda con ese porcentaje.

**REGLA — el porcentaje se ESCALA sobre el que ya tenía, no lo sustituye.** Con
el 100 % de siempre queda en 21 exacto; y si ese generador ya compartía un
servicio con otro (una caldera al 50 % del ACS y un termo al otro 50 %), los dos
se reparten proporcionalmente lo que la bomba les deja y la suma sigue dando 100.
Lo comprueba `_reparto`, que ya estaba.

⚠️ **Lo tecleado en Instalaciones era UNA sola cosa para las DOS fases.** Esa
pestaña tiene dos caras («CEE inicial · caldera» y «CEE final · aerotermia») y
`ajustes.instalacion` era compartido, así que lo tecleado para la caldera se
escribía **encima de la aerotermia**: el CEE final salía con su generador llamado
«CALDERA DOMUSA CLIMA MIX 20 GE», con su potencia y su rendimiento de combustión
— o sea, declarando que la obra instaló otra caldera. Comprobado antes de tocar
nada. Ahora cada fase guarda lo suyo (`claveInstalacion`), y el INICIAL conserva
la clave de siempre para no perder lo ya guardado. **El depósito no se pierde al
separarlas**: al final le llega del propio `.cex` que copia
(`_heredar_acumulacion`), que es una fuente mejor que un ajuste de pantalla.

⚠️ En el mensaje de WhatsApp se escribe **«Cb»** sin guion bajo: `_texto_` es la
cursiva de WhatsApp, y un `C_b` dentro la cierra a media frase.
