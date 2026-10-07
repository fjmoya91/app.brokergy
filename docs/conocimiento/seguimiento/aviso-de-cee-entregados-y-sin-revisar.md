<!-- conocimiento · área: seguimiento · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Estaba escrito dentro de «Facturación del certificador — conciliación mensual (2026-08-03)», en el CLAUDE.md antiguo.

### Aviso de CEE entregados y sin revisar
`services/revisionPendienteNotifier.js`, arrancado desde `server.js` (`setInterval`, mismo patrón que
`marketplaceStatsRefresher`). El certificador **factura al entregar, no al revisar**: un CEE que se
queda en `PRESENTADO`/`PTE_REVISION` se acaba pagando sin validar. Resumen **diario** por WhatsApp
(`WHATSAPP_ADMIN_CHAT`) + email (`ADMIN_EMAIL`) de lo parado más de `REVISION_ALERTA_DIAS` (2).
Comprueba cada 6 h, envía solo entre `REVISION_ALERTA_HORA_MIN` y `_MAX` (8-21 h Madrid) y **una vez
por día natural**, con el guard persistido en `app_settings.revision_pendiente_last_notify` para que un
reinicio no duplique el aviso. Un CEE entregado **sin** fecha se incluye marcado "sin fecha": es más
sospechoso, no menos. Rutas: `GET /api/expedientes/alertas/revision-pendiente` (staff) y
`POST .../enviar` (admin).

⚠️ En LOCAL el primer chequeo salta a los 90 s del arranque y **manda avisos de verdad**. Para
desarrollar: `REVISION_ALERTA_ENABLED=false` en el `.env`.
