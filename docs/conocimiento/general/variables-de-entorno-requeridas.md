<!-- conocimiento · área: general · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Variables de Entorno Requeridas

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN
DRIVE_ROOT_FOLDER_ID               ← Carpeta raíz donde van las oportunidades "PTE ENVIAR"
GOOGLE_MAPS_API_KEY

# WhatsApp Business (whatsapp-web.js)
WHATSAPP_ENABLED=true              ← Habilitar/deshabilitar servicio (default: true)
WWA_MIN_DELAY_MS=2500              ← Delay mínimo entre mensajes (ms)
WWA_MAX_DELAY_MS=6000              ← Delay máximo entre mensajes (ms)
WWA_RATE_PER_MIN=10                ← Mensajes/minuto en cola

# Entrega de WhatsApp (ver "Un mensaje con el RELOJ no está enviado")
WWA_TYPING=false                   ← "escribiendo…": ROMPE la entrega en 2.3000.x. No encender
WWA_SEND_SEEN=false                ← marcar leído antes de enviar: misma tabla de chats, mismo efecto
WWA_VERIFICAR_ACK=true             ← no dar por enviado lo que no tiene ACK
WWA_ACK_ESPERA_MS=25000            ← cuánto se espera al ACK antes de darlo por fallido
WWA_WEB_VERSION=                   ← vacío = la última que sirva Meta. Fijarla NO arregla nada (se auto-actualiza)

# Instaladores ⇄ etiqueta de WhatsApp (ver "La cartera de instaladores, etiquetada sola")
WA_SYNC_INSTALADORES=false         ← enganche automático al alta/edición. En LOCAL, APAGADO: escribe en la agenda real
WA_SYNC_ETIQUETA_INSTALADORES=INSTALADORES
WA_SYNC_PAUSA_MS=1500              ← pausa entre chats (no hacerle ráfagas a ese Chrome)
WA_SYNC_FALLOS_MAX=3               ← tiempos de espera seguidos tras los que se corta el repaso

# Propuestas con el envío PROGRAMADO (ver "PROGRAMAR el envío de una propuesta")
PROPUESTA_PROGRAMADA_ENABLED=false ← en LOCAL, APAGADO: saldría a un cliente REAL
PROPUESTA_PROGRAMADA_INTERVALO_MS=60000
PROPUESTA_PROGRAMADA_MAX_DIAS=90   ← hasta cuándo se admite programar

# Pago a los clientes del lote (ver "Confirmación de cobro" → "Después de confirmar")
SEPA_ORDENANTE_IBAN=ES1001820394300201753286   ← cuenta de CARGO de la remesa (BBVA, la de las facturas)
SEPA_ORDENANTE_BIC=BBVAESMMXXX
SEPA_ORDENANTE_NIF=B19350222
SEPA_ORDENANTE_SUFIJO=000          ← sufijo del ordenante (el de la remesa que BBVA aceptó el 02/10/2026)
SEPA_ORDENANTE_NOMBRE=SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGETICA SL
GOOGLE_RESENA_URL=                 ← enlace «escribir una reseña» de la ficha de Google. Sin él, el de la carta de pago
                                     (placeid ChIJW00n1QqKXGMRLwQXmfKJU-U, cartaPagoService.RESENA_URL_DEFECTO)
RESENA_PROGRAMADA_ENABLED=false    ← despachador de reseñas. En LOCAL, APAGADO: saldría a un cliente REAL
CARTA_PAGO_ASSETS_URL=https://app.brokergy.es/email/carta-pago  ← dónde están las imágenes del email (por defecto, esa)
CARTA_PAGO_ENVIO_AUTO=false        ← la carta de pago sale SOLA al subir el justificante. Apagado = se revisa en el popup.
                                     En LOCAL, siempre APAGADO: saldría a un cliente REAL
RESENA_DIAS_HABILES=2              ← cuándo se propone pedirla: N días hábiles tras transferir, a las 11:00

# Ronda nocturna de WhatsApp (ver "La RONDA NOCTURNA de WhatsApp")
WA_RONDA_ENABLED=false             ← solo true en el VPS. En LOCAL, APAGADA: misma cuenta de WhatsApp y BD de producción
WA_RONDA_HORA=5                    ← desde qué hora (Madrid) se leen los chats
WA_RONDA_HORA_AVISO=9              ← desde qué hora se le manda a Fran (email + chat del asistente)
WA_RONDA_DESTINO=                  ← opcional; si no, ASISTENTE_WHATSAPP_GRUPO y si no WHATSAPP_ADMIN_CHAT
WA_RONDA_MAX_CHATS=300             ← tope de chats con mensajes nuevos por ronda
WA_RONDA_MAX_ADJUNTOS=30           ← tope de adjuntos por chat
WA_RONDA_MODELO=                   ← modelo del análisis; vacío = GEMINI_MODEL. Cambiarlo solo tras comparar_rondas.js
WA_RONDA_MODELO_BORRADOR=          ← modelo de los borradores; vacío = el de arriba

# Firmados del S.O. que llegan por CORREO (ver "Los FIRMADOS del S.O. llegan por correo")
FIRMADOS_SO_CORREO_ENABLED=false   ← lector del buzón. Solo true en el VPS: en LOCAL registraría en la Supabase y el Drive de producción
LOTE_SO_IMAP_HOST=imap.hostinger.com ← opcional (y LOTE_SO_IMAP_PORT=993); la cuenta es la de LOTE_SO_SMTP_USER/PASS
```
