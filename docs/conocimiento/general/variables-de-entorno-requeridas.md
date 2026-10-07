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
```
