<!-- conocimiento · área: documentacion-fotos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «El gestor de FOTOGRAFÍAS: subir en tanda, pegar y repartir (2026-09-21)»; la introducción y el resto, en esta misma carpeta.

### Dos huecos del alcance

**La HIBRIDACIÓN no tenía foto propia.** Lo que hay que acreditar en un RES093 o un
TER173 es que las dos máquinas trabajan JUNTAS, y eso no lo cubre ninguna otra: la
de la unidad exterior enseña la bomba sola y la de "caldera desmontada" describe lo
contrario de lo que pasa ahí (la caldera se conserva). Se colaba reetiquetando
aquella, así que de la actuación que DEFINE la ficha no quedaba una imagen propia.
`FOTO_HIBRIDACION` sale sola con `alcance.hibridacion`, está en `ADDABLE_CONCEPTS`
para activarla a mano y **entra en el mapa del Anexo Fotográfico** — ese mapa es
explícito (`ANEXO_ACTUACIONES`) y un slot que no esté en él cae en "Otras
fotografías".

**El DEPÓSITO DE ACS cuando va DENTRO de la unidad interior.** Un conjunto es UNA
máquina: "la unidad interior" y "el depósito" eran dos fotos del mismo aparato, así
que la segunda casilla se quedaba siempre vacía — al cliente le pedía una foto que
ya había hecho y al admin le dejaba el apartado en rojo para siempre. Lo decide
`acsEquipoPropio` ([docsAlcance.js](implementation/backend/services/docsAlcance.js))
por la MÁQUINA y no por el flag `misma_aerotermia_acs` (regla 12.c), y el apartado
se retira **solo si el expediente lo afirma y solo si está VACÍO**: lo ya subido no
se esconde nunca (mismo criterio que `emisorDesencaja`). Entonces la etiqueta de la
unidad interior lo dice, o el cliente busca un depósito aparte que no existe.

⚠️ `acsEsOtraMaquina` responde **true con los dos nodos en blanco**, y hace bien
(dos huecos no son "el mismo equipo"). Pero eso no es una declaración: para afirmar
que son dos aparatos hay que tener IDENTIFICADO el de ACS, o un expediente sin
rellenar diría "dos" con la misma autoridad que uno comprobado.
