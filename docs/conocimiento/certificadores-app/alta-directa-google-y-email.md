<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## El alta: al momento, con Google o con el email (2026-10-24)

Lo pidió Fran: «registro lo más fácil posible, incluido con Google», el primer certificado gratis en la
beta y que el formulario de la beta (las preguntas) no se pierda. Decidido con él: **alta al momento,
con las preguntas** (antes era una lista de espera que BROKERGY aprobaba a mano). La lista de espera
sigue en el código: `CERTAPP_ALTA_DIRECTA=false` la vuelve a poner tal cual.

### Los dos caminos

| | Con Google | Con el email |
|---|---|---|
| Empieza en | «Continuar con Google» en `/entrar` o en `/beta` | el formulario de `/beta` sin sesión |
| Sesión | `signInWithOAuth` → vuelve a `/beta?con=google` (o `/entrar?con=google`) | ninguna hasta abrir el email |
| Formulario | el mismo, con el nombre y el email de Google puestos (el email, bloqueado) | el mismo |
| Crea la cuenta | `POST /api/certapp/alta` (guardián `certappSesion`) → `cuentas.altaConSesion` | `POST /api/public/certapp/beta` → `cuentas.altaDirecta` |
| Estado | ACTIVA, vinculada a ese usuario de Auth | PENDIENTE (pasa a ACTIVA en el primer acceso) |
| Teléfono | se copia | **no** se copia: queda en `prefs.telefono_por_confirmar` |
| Después | `/panel?bienvenida=1` | «Mira tu email» → `/entrar?t=e.…` (7 días, un uso) → `/panel?bienvenida=1` |

En los dos: `CERTAPP_CREDITOS_BETA` certificados (1), su **ALTA en Mis gastos**, la solicitud de la beta
guardada y marcada **INVITADA**, las condiciones aceptadas en `prefs.condiciones {version, at}`, las
comunidades y los programas en `prefs.perfil`, y el nombre partido en nombre y apellidos
(`cuentas.partirNombre`: los dos últimos, con sus partículas; él lo corrige en el perfil). Aviso al
equipo como antes (agrupado pasadas `CERTAPP_BETA_AVISOS_DIA` altas).

Una sesión de Google SIN cuenta en la app: `GET /me` → 403 `CERTAPP_SIN_CUENTA` y el frontend la manda al
formulario (`sinCuenta`). Así entrar con Google la primera vez ES darse de alta.

### El enlace para entrar (`e`)

`/entrar` ya no pide contraseña de entrada: «Mándame un enlace» (`POST /api/public/certapp/enlace`,
1 hora) o Google. La contraseña sigue (`Entrar con contraseña`, `/recuperar`) para quien la tenga.
El token es nuestro, firmado con `CERTAPP_TOKEN_SECRET` (tipo `e` en `services/certapp/tokens.js`); al
abrirlo, `POST /enlace/canjear` lo cambia por el `hashed_token` de un `generateLink('magiclink')` de
Supabase y el navegador abre la sesión con `verifyOtp({ token_hash, type: 'magiclink' })`. Así **no hace
falta tocar las URL de redirección de Supabase** para el email, y el correo sale con nuestra plantilla y
nuestro remitente, no con el de Supabase.

**REGLA — el enlace para entrar sirve UNA vez**: canjearlo rota `prefs.pwd_nonce`, que invalida también
los de activar y recuperar emitidos antes. Un token `e` no sirve para poner contraseña (`activar` solo
admite `a` y `r`), ni uno `a`/`r` para entrar.

**REGLA — el alta por email no copia el teléfono**: cualquiera puede escribir el email de otro en el
formulario; la cuenta queda PENDIENTE hasta que alguien abre ese email, y sin teléfono confirmado no se
manda ningún WhatsApp a un número que no ha dado su dueño. El perfil lo enseña escrito con «¿Es este tu
teléfono?» y se guarda cuando él pulsa Guardar (`actualizarPerfil` limpia `telefono_por_confirmar`).

**REGLA — la respuesta pública es siempre la misma**: `POST /beta` y `POST /enlace` contestan `{ ok:
true }` haya o no cuenta con ese email (no se puede usar para saber quién está dado de alta). Un email
que ya tenía cuenta no recibe nada nuevo ni cambia nada.

**REGLA — sin aceptar las condiciones no hay alta** (400 `FALTA_CONDICIONES`, comprobado en el servidor
en `beta.filaDe`); la versión aceptada se guarda con su fecha. Las condiciones están en
`/condiciones` ([Condiciones.jsx](implementation/frontend/src/certificadores/publico/Condiciones.jsx), versión
`CONDICIONES_VERSION` en `cuentas.js`, la misma fecha en las dos). Si se cambian, se sube la versión.

**REGLA — el alta con sesión toma el email de la SESIÓN, nunca el del formulario**, y exige el email
confirmado en Auth (403 `EMAIL_SIN_CONFIRMAR`). Un email que ya es de otra cuenta: 409
`CUENTA_YA_EXISTE` (que entre con el enlace del email).

### Lo que hay que configurar en Supabase (una vez, persona en el panel)

- **Authentication → Providers → Google**: activado, con el Client ID y el secreto de un cliente OAuth
  de Google Cloud (tipo «Aplicación web», URI de redirección
  `https://okfeopwetlxdffrsbfqw.supabase.co/auth/v1/callback`). El secreto lo pega Fran: no se escribe en
  el repo ni lo teclea Claude.
- **Authentication → URL Configuration → Redirect URLs**: `https://cee.brokergy.es/**` y, para probar en
  local, `http://cee.localhost:5195/**`. Sin ellas, Google vuelve a la Site URL (el CRM).
- **«Allow new users to sign up»** encendido (Google crea el usuario al primer acceso) y **«Confirm
  email»** encendido. Es seguro para el CRM: una sesión sin fila en `usuarios` recibe 403
  `SIN_PERFIL_CRM` ([desplegar-cee-brokergy-es.md](docs/conocimiento/certificadores-app/desplegar-cee-brokergy-es.md)).

### Medido (24/10/2026)

- `test_certapp_bd.js` contra la Supabase de producción: alta directa, dos veces el mismo email, sin
  condiciones, canje del enlace y segundo canje, alta con sesión (usuario creado con `email_confirm`),
  409 con un email ajeno, y los movimientos ALTA/GASTO/DEVOLUCION. 51/51 con `--con-obra`, todo borrado.
- Prueba en local de punta a punta (navegador → backend local → Supabase de producción, emails en seco):
  formulario → cuenta PENDIENTE → enlace del log → `verifyOtp` → panel con 1 crédito y ACTIVA; perfil
  con el teléfono por confirmar y guardado; una incidencia; y esa sesión contra el CRM: 403
  `SIN_PERFIL_CRM` en expedientes, oportunidades, clientes y el admin de la app.
- Ojo en local: la copia del frontend necesita su `.env.local` (`VITE_SUPABASE_URL`/`ANON_KEY`); sin él,
  `verifyOtp` va a `placeholder.supabase.co` y sale «No hemos podido abrir la sesión con este enlace».

Tras tocarlo: `test_certapp_unidad.js`, `test_certapp_rutas.js`, `auditar_rutas_sin_guardian.js` y, con
permiso (escribe en producción), `test_certapp_bd.js`.
