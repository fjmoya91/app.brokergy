---
name: enviar-whatsapp
description: >-
  Redacta y envía mensajes de WhatsApp al CLIENTE o al INSTALADOR de un expediente CAE de BROKERGY por la
  sesión de WhatsApp Business, con las salvaguardas de la casa. Úsalo SIEMPRE que el usuario pida "manda
  un WhatsApp a...", "escríbele al cliente/instalador del expediente NNN", "pídele el IBAN / las fotos / la
  factura / el CIFO", "avísale de lo que falta", "recuérdale que suba...", "reenvía el enlace de firma", o
  cualquier comunicación por WhatsApp con un cliente o instalador de un expediente. Consulta lo pendiente
  en vivo con datos_contacto_expediente, distingue el TITULAR legal del DESTINATARIO real (respeta el toggle
  de persona de contacto), usa SOLO los enlaces que devuelve el backend (nunca los inventa), redacta en tono
  BROKERGY y trabaja SIEMPRE en modo borrador hasta tu visto bueno antes de enviar de verdad. NO audita
  (eso es auditar-expediente) ni rellena datos (eso es rellenar-expediente): solo comunica.
---

# Enviar WhatsApp a cliente o instalador (BROKERGY)

Prepara y manda mensajes de WhatsApp por la cuenta de WhatsApp Business de BROKERGY para pedir lo que
falta en un expediente (o dar un aviso), dejándolo registrado en el historial del expediente. El objetivo
es que el mensaje llegue **a la persona correcta**, pida **solo lo que de verdad falta**, con **enlaces
reales**, y **nunca se envíe nada sin tu confirmación**.

**Herramientas (MCP BROKERGY):**
- `datos_contacto_expediente` → a quién y qué pedir, con los enlaces públicos de subida/firma. **No envía nada.**
- `enviar_whatsapp` → manda el mensaje. Modo `borrador` (previsualiza, NO envía) o `enviar` (envía de verdad).
- `search_by_client` / `get_expediente` → localizar el expediente si solo tienes el nombre del cliente.

## Principio rector: el backend decide el número, tú decides el texto

`enviar_whatsapp` **resuelve el teléfono en el backend** desde la ficha del cliente/instalador — tú nunca
manejas el número. Esto tiene dos consecuencias que mandan sobre todo lo demás:

1. **El toggle "enviar a persona de contacto" lo aplica el backend.** Si en la app está activado, `datos_contacto_expediente`
   y `enviar_whatsapp` con `destinatario=CLIENTE` resuelven al contacto (p. ej. el marido que gestiona la obra),
   no al titular. No tienes que hacer nada para "activarlo": solo comprobar a quién resuelve y avisar al usuario.
2. **Titular legal ≠ destinatario real.** `obra.cliente` es el titular/cedente del expediente; `cliente.nombre`
   es a quién llegaría el WhatsApp. Pueden ser personas distintas (caso real: titular *María Antonia*, pero el
   toggle manda el mensaje a *Antonio*, su marido). Enseña siempre ambos y avisa cuando no coincidan, para que
   nadie envíe a ciegas.

## Procedimiento

### 1. Localiza el expediente
Si te dan el número (`26RES080_65`), úsalo. Si te dan solo el nombre, resuélvelo con `search_by_client`;
si hay varios, pregunta cuál. No sigas sin un expediente identificado sin ambigüedad: un enlace o un dato
enviado al expediente equivocado va a parar a otro cliente.

### 2. Consulta lo pendiente EN VIVO (nunca de memoria)
Llama a `datos_contacto_expediente` **cada vez**, justo antes de redactar. La documentación pendiente cambia
según el cliente va subiendo cosas: si trabajas con una lista vieja pedirás algo que ya tienen (le hace perder
tiempo y resta credibilidad). El backend te devuelve, por rol, exactamente qué falta y el `url` para aportarlo.

Si el MCP responde "Session terminated" / "sesión expiró", está caído: avisa de que hay que reconectarlo
(claude.ai → Conectores → MCP BROKERGY → Desconectar → Conectar) y **no reintentes en bucle**. Sin datos en
vivo no se redacta ni se envía.

### 3. Elige el destinatario y comprueba que es alcanzable
- `destinatario=CLIENTE` para pedir lo del titular/contacto (IBAN, firma de anexos, fotos "antes", etc.).
- `destinatario=INSTALADOR` para lo suyo (CIFO firmado, factura, fotos de la instalación terminada).
- **No mezcles roles en un mismo mensaje**: cada rol tiene sus propias tareas y sus propios enlaces (con tokens
  distintos). Si falta cosa de los dos, son dos mensajes.
- Mira `alcanzable_whatsapp`. Si es `false`, no fuerces el envío: avísalo y propón el email (`email_disponible`)
  u otra vía.

### 4. Muestra TITULAR vs DESTINATARIO antes de nada
Con la respuesta del backend, deja claro al usuario:
- **Titular del expediente:** `obra.cliente`.
- **Irá a:** `cliente.nombre` + teléfono enmascarado (`cliente.telefono`), o el del instalador.
- Si **titular ≠ destinatario**, dilo explícitamente ("Ojo: el titular es X, pero por el toggle esto va a Y").
  Así el usuario confirma con conocimiento de causa.

### 4b. Pendientes que quizá ya tenéis fuera de la app
El backend marca como pendiente todo lo que no está **subido a la app**, aunque BROKERGY ya lo tenga por otra
vía (WhatsApp, email, papel). Si entre lo pendiente hay algo típico de "lo tenemos pero sin subir" —**fotos**
(antes/después, placas) o **facturas**— no lo elimines por tu cuenta, pero **avísalo en el borrador**:
"El backend pide también las fotos ANTES; si ya las tenéis, súbelas a la app y las quito del mensaje". Así el
usuario decide entre pedirlas al cliente/instalador o subirlas él, y no se pide dos veces algo que ya existe.
El IBAN, la firma de anexos o el CIFO firmado NO entran aquí: esos sí los aporta siempre el cliente/instalador.

### 5. Redacta el mensaje (tono BROKERGY)
- **Castellano de España**, cercano y claro, sin relleno ni corporativismo artificial. Ve al grano.
- Pide **solo** los `items` que devuelve el `pendiente` del rol elegido, y **pega los `url` TAL CUAL** los da el
  backend. **Nunca inventes, acortes ni reconstruyas un enlace o un token**: los enlaces llevan IDs y tokens
  que solo el backend conoce; uno inventado no funciona o abre el expediente equivocado.
- Formato WhatsApp: `*negrita*` para resaltar lo que se pide; una línea por enlace para que sea clicable.
- Cierra con una firma. Por defecto **"Fran Moya"** (o "Equipo BROKERGY" si el usuario lo prefiere). Si el usuario
  te da un texto ya redactado, respétalo: solo pásalo a formato WhatsApp (`*negrita*`) y asegúrate de que los
  enlaces son los reales del backend.
- Aprovecha `nota`/`notaRelay` del backend como guion de lo que se pide, sin copiarla literal si suena a plantilla.

### 6. SIEMPRE borrador primero
Llama a `enviar_whatsapp` con `modo="borrador"`. Enseña al usuario el destinatario resuelto + el texto completo.
**Espera su visto bueno explícito.** Solo entonces vuelve a llamar con `modo="enviar"`. Nunca uses `enviar`
directo: un WhatsApp no se puede "recuperar", y va a un cliente/instalador real.

Rellena siempre `solicitado` con la lista corta de lo que pides (p. ej. `["IBAN", "Justificante de titularidad"]`):
queda en el historial del expediente para trazabilidad.

### 7. Confirma el envío
Tras `modo="enviar"`, confirma en el chat **a quién** fue (nombre + número enmascarado), **qué** se pidió, y que
quedó registrado. Si procede, apunta el siguiente paso (p. ej. "pendiente de que responda con el IBAN").

## Reglas no negociables
- **Nunca envíes sin visto bueno.** Borrador → el usuario confirma → enviar. `modo="enviar"` solo tras el OK.
- **Datos en vivo siempre.** `datos_contacto_expediente` antes de cada redacción; nunca de memoria ni de una ficha vieja.
- **Enlaces solo del backend, literales.** Prohibido inventar, editar o reconstruir URLs/tokens.
- **Titular ≠ destinatario:** enséñalo y avisa cuando difieran (el toggle de persona de contacto lo aplica el backend).
- **Un rol por mensaje.** CLIENTE e INSTALADOR no se mezclan (enlaces y tareas distintos).
- **Pide solo lo pendiente real.** Si el rol no tiene nada pendiente, no inventes peticiones: dilo y pregunta qué mandar.
- **Pendientes "quizá ya subidos" (fotos/facturas):** no los quites tú, pero avisa en el borrador por si el usuario prefiere subirlos en vez de pedirlos.
- **MCP caído → reconectar, no insistir.** Si la sesión expiró, avisa de reconectar y no reintentes en bucle.
- **Trazabilidad.** Rellena `solicitado`. Esta skill solo comunica: no audita ni rellena datos del expediente.
