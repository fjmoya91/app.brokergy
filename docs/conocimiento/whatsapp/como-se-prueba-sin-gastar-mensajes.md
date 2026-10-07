<!-- conocimiento · área: whatsapp · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «La API de Gemini va en NIVEL DE PAGO (2026-09-01)», en el CLAUDE.md antiguo.

### Cómo se prueba SIN gastar mensajes

```bash
node implementation/backend/scripts/probar_bot_whatsapp.js 615492728
```

Construye el dossier de un teléfono real y pide la respuesta, **sin tocar
WhatsApp ni escribir en la bandeja**. Con `VER_DOSSIER=1` enseña el dossier, que
es lo primero que hay que mirar cuando una respuesta no convence: casi siempre
el problema no es cómo redacta, sino que le falta el dato. La misma prueba está
en `POST /api/whatsapp/bot/simular` (adminOnly).
