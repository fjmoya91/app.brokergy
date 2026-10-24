<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## La seguridad de la app de certificadores, antes de salir (2026-10-24)

Una revisión hecha antes del primer despliegue encontró, entre otros, tres fallos que impedían salir: un
XSS con un SVG subido como foto (servido en el origen de app.brokergy.es, podía llevarse la sesión de un
ADMIN), una forma de sacar CEE ilimitados pagando un solo crédito (cambiando la referencia catastral) y
el formulario de la beta usable para mandar spam desde nuestro buzón (el límite por IP se saltaba con un
`X-Forwarded-For` inventado). Aquí queda lo que se decidió para cerrarlos.

### La envolvente y el generador en el origen `ext` ([routes/ceeEnvolvente.js](implementation/backend/routes/ceeEnvolvente.js))

**REGLA — en una obra `ext` la referencia catastral sale SIEMPRE de `certapp_obras.ref_catastral`**: la
del cuerpo de la petición (y la de 20 caracteres de la vivienda) se ignora en `pedirGeometria`, en `rcDe`
(las imágenes del Catastro) y en las unidades de otra parcela (`ajustes.anexos`, que en `ext` no se miden).
Con una obra pagada no se mide otro edificio.

**REGLA — el `.cex` (y el croquis en PDF) de una obra `ext` solo con la obra PEDIDA**: en BORRADOR o
ARCHIVADA, 409 `OBRA_SIN_PEDIR`; una geometría de otra referencia, 409 `RC_NO_COINCIDE`. El crédito se
consume al pasar de BORRADOR a EN_PREPARACION, así que regenerar el PDF al validar sigue valiendo, siempre
sobre la referencia fijada.

**REGLA — topes por CUENTA para el certificador de la app** (en memoria, 429 `DEMASIADAS` con
`Retry-After`): geometría y croquis 20/h (y una medición en marcha por cuenta, para que a Catastro le
lleguen en serie: reglas 15-17), imágenes 30/h, cartografía 60/h, croquis móvil 20/h, `.cex` 10/h y leer
fotos con Gemini 30/día. El equipo interno y los orígenes cae/cee/op no tienen tope.

**REGLA — el aviso de «la IA ha terminado» pasa por el interruptor `CERTAPP_AVISOS_ENABLED`**
(`terminarExt` de [services/agenteIa.js](implementation/backend/services/agenteIa.js)): apagado va al log
como «[certapp seco]»; si no se puede leer, cuenta como apagado.

Tras tocarlo: `node implementation/backend/scripts/test_origen_ext.mjs`.

### El alta al momento (24/10/2026)

Abrir el alta sin aprobación a mano trae sus riesgos (cuentas con el email de otro, WhatsApp a números
que no ha dado su dueño, saber quién está dado de alta, un usuario de Supabase que intente entrar al
CRM). Lo decidido para cada uno está en
[alta-directa-google-y-email.md](docs/conocimiento/certificadores-app/alta-directa-google-y-email.md):
enlace de un uso, teléfono por confirmar, respuesta pública siempre igual, condiciones obligatorias y el
email de la sesión, nunca el del formulario.

### Fuera de la app

**REGLA — una sesión de Supabase sin fila en `usuarios` no entra en el CRM** y **el CORS de cee.brokergy.es
sale de `CERTAPP_URL`**: ver [desplegar-cee-brokergy-es.md](docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md).
