<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «La API de Gemini va en NIVEL DE PAGO (2026-09-01)», en el CLAUDE.md antiguo.

### Rutas y esquema

```
GET  /api/whatsapp/bot/status             → activo, etiqueta, chats, contadores de hoy
GET  /api/whatsapp/bot/mensajes           → el log de conversaciones
POST /api/whatsapp/bot/refrescar-etiqueta → releer la etiqueta al momento
POST /api/whatsapp/bot/simular            → probar una respuesta sin enviarla
```

Tabla `whatsapp_bot_mensajes` (`scripts/bot_whatsapp_schema.sql`, RLS deny-all).
El log completo —pregunta, respuesta y con qué contexto— es innegociable: aquí
una máquina le habla a clientes reales en nombre de BROKERGY.

⚠️ **En LOCAL déjalo apagado** (`BOT_WHATSAPP_ENABLED=false`, que es el valor por
defecto). Encendido responde a CLIENTES REALES, igual que `CEE_ENTREGA_AUTO`.
