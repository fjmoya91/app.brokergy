<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Introducción de «CEE directos — el segundo negocio (2026-08-24)»; cada subsección está en su propio fichero de esta carpeta.

## CEE directos — el segundo negocio (2026-08-24)

Certificados de eficiencia energética que nos contratan **SUELTOS**: compraventa,
alquiler, obra particular. **No hay ficha, ni ahorro, ni CAE, ni lote, ni CIFO.**
Nos contratan el certificado y ahí se acaba.

Pestaña propia (**CEE directos**), tabla propia (`cee_directos`), rutas propias
(`/api/cee-directos`) — pero **dentro de la misma app y el mismo despliegue**.

**REGLA — NO va en `expedientes`.** Esa tabla exige `oportunidad_id NOT NULL`, así
que meterlo ahí obligaría a fabricar una oportunidad sintética por encargo, y esas
contaminan el embudo del cuadro de mando, `v_expedientes_lifecycle`, los lotes, el
radar del parte diario, el MCP y las skills: ~15 consultas que habría que filtrar
una a una. Un proyecto SEPARADO tampoco: tendría que duplicar auth, el OAuth de
Drive, clientes, certificadores y el envío de email — y la sesión de WhatsApp es un
**singleton atado a un teléfono**, que dos procesos no pueden compartir.
