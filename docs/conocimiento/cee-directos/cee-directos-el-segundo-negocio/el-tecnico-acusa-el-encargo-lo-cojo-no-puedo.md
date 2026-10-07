<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### El técnico ACUSA el encargo: lo cojo / no puedo

El CAE solo tiene "aceptar" (`cert-ack`). Aquí hacen falta las dos respuestas, y
**la de rechazo es la que más valor tiene**: hasta ahora, que un técnico no
pudiera se sabía llamándole por teléfono a los diez días, con el expediente
parado y nadie enterado.

**REGLA — el gesto es el MISMO que en el CAE.** Al certificador le llegan los dos
tipos de encargo y no puede tener que aprender dos procesos. En el CAE
(`CertAckView`) el enlace "Aceptar encargo" **acepta al abrirse**, sin preguntar
nada, y a los 2,5 s te deja dentro del expediente. Aquí igual: el email lleva
**"✅ Acepto el encargo"** en verde (`?r=si`, acepta sola y redirige a
`/?cee=<id>`) y **"No puedo cogerlo"** discreto debajo (`?r=no`).

La primera versión ponía UN botón "Lo cojo / No puedo" que abría una página a
preguntar. Sobraba: al abrir el correo ya has decidido, y esa pantalla de más es
justo lo que hacía el proceso distinto del CAE.

**REGLA — aceptar es automático; RECHAZAR nunca.** Aceptar de más no rompe nada
(sigues siendo el técnico); rechazar te retira del expediente y lo devuelve a la
cola, así que un pulgar despistado sobre el enlace equivocado no puede
provocarlo. La pantalla de rechazo pide confirmación, ofrece motivo y lleva
salida ("me he equivocado, sí me encargo").

**No se puede resolver DENTRO del email**: los clientes de correo no ejecutan
JavaScript y Gmail elimina los formularios, así que lo único pulsable es un
enlace. Es la misma razón por la que el CAE abre una página.

**REGLA — al rechazar se RETIRA el certificador** (`cee.certificador_id = null`) y
la fase vuelve a `PTE_ENVIO_CERT`. Si se quedara puesto, la ficha seguiría
enseñando como responsable a quien acaba de decir que no. Queda anotado en
`cee.rechazos[]` con quién, por qué y cuándo.

**El token es de UN SOLO USO** (`cee.ack_token`) y se regenera en cada encargo:
el enlace de un encargo viejo —o el del técnico al que ya se le retiró— deja de
valer solo. Pulsar dos veces responde *"ya nos lo dijiste"*, no un error que haga
pensar que la respuesta no llegó.

**El aviso del rechazo lleva CANDIDATOS**, no solo la noticia:
`sugerirCertificadores()` excluye a los que ya dijeron que no a ESE expediente y
ordena por quién tiene menos trabajo abierto. Sin eso hay que entrar, abrir el
desplegable y acordarse de a quién no ofrecérselo.
