<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## La «Vista S.O.»: su obligación del año y cómo vamos con ella (2026-10-28)

Fran (28/10/2026): «quiero una vista como si yo fuera Interalco», para saber cuánto
tiene que cubrir, cuánto ya tiene, cómo van nuestros lotes con él y cuánto le puedo
ofrecer. De la Orden de obligaciones 2026 (Anexo II) INTERALCO tiene **20,03 GWh** de
cuota, de los que el **8 %** va obligatoriamente al Fondo (1,60 GWh) y **18,43 GWh**
los puede cubrir con CAE; de esos, **9 GWh** dice que ya los tiene comprados a otros
agentes.

| Qué | Dónde |
|---|---|
| Las cuentas (función pura, también la usa el backend) | [logic/obligacionSo.js](implementation/frontend/src/features/lotes/logic/obligacionSo.js) |
| El panel (conmutador «Lotes / Vista S.O.» de la pestaña Lotes) | [SujetoObligadoPanel.jsx](implementation/frontend/src/features/lotes/components/SujetoObligadoPanel.jsx) |
| Guardar la obligación y calcular lo disponible | [services/obligacionSo.js](implementation/backend/services/obligacionSo.js) |
| Rutas | `GET /api/lotes/obligacion-so/:soId` (staff) · `PUT` (adminOnly) · `GET /api/lotes/disponible` (staff) |
| Prueba | `node implementation/backend/scripts/test_obligacion_so.mjs` |

**REGLA — la obligación la TECLEAMOS, por S.O. y año.** Va en `app_settings` como
`obligacion_so:{id}` (mismo patrón que las tarifas del verificador, sin migración):
cuota en GWh, % mínimo al Fondo (8 por defecto), lo comprado a otros, equivalencia
financiera (198,62 €/MWh por defecto; la del Anexo II de 2026 es 198,624), ventas
computables (informativo), fuente y notas. Un año sin cuota no se guarda. Lo ve todo
el staff (son GWh y cifras públicas del Anexo II); solo el ADMIN la edita. Los GWh
se aceptan con coma («20,03»), con punto («20.03») o con millar («1.496,94»).

**REGLA — lo que le falta = cubrible con CAE − lo comprado a otros − TODO lo nuestro
para ese año**, nunca negativo (si se pasa, «le sobra»). Es lo que le faltaría aunque
se emitiera todo lo que tenemos en curso; aparte va lo **asegurado hoy** (otros +
nuestro ya emitido), que es lo único seguro.

**REGLA — lo nuestro, por ETAPAS vistas desde el S.O.**, no por los 14 estados del
lote: **CAE emitidos** (estado de cobro/finalizado, o con la resolución de emisión
subida aunque el estado no se haya movido), **en la Administración** (pte. subida,
subido a MITECO, requerimiento G.A.), **en verificación** (enviado, requerimiento,
verificado) y **en preparación** (borrador, firmas del S.O., oferta del verificador).
Cada lote con su cifra más firme: los CAE de la resolución → las unidades de nuestra
factura → el ahorro verificado de TODOS sus expedientes → el estimado. Medido el
28/10/2026: INTERALCO, 15 lotes, 4,72 GWh (1,17 emitidos · 2,30 en la Administración ·
0,78 en verificación · 0,47 en preparación) → le faltan **4,71 GWh** (≈ 935.000 € al
Fondo); asegurado hoy, el 55 % de lo cubrible.

**REGLA — cada lote cuenta para UN año de obligación**: un CAE emitido, el de su
resolución (o, sin ella, el de nuestra factura); uno sin emitir, el año en curso.
El ADMIN lo cambia lote a lote («2025», «2027», «No cuenta»), y solo se guardan las
excepciones (`asignacion`). Los que cuentan para otro año salen plegados debajo.

**REGLA — lo disponible es lo que tenemos SIN lote y sin rechazar**, en kWh (sin
importes), por cercanía al CAE: **listo para lotear** (DOC. COMPLETA), **obra
terminada** (CEE final y papeles), **en obra** (PTE. FIN OBRA) y **antes de la obra**.
Se acumula en ese orden frente a lo que le falta («con lo listo, el 39 %; sumando lo
que cierra papeles, el 76 %»). Lo que ya pasó por verificación SIN lote (53
FINALIZADO y 2 en pago el 28/10/2026) se vendió antes de la app y no cuenta. La cifra
de cada expediente es la de `economiaCae.economiaDe` (verificado si lo hay; si no, la
del CEE o la de la propuesta). **Es el mismo volumen para cualquier S.O.**: si se
ofrece a dos, se cuenta dos veces. Medido el 28/10/2026: 1,85 GWh listos (31) · 1,72
cerrando (31) · 6,23 en obra (111) · 1,80 antes (39) = 11,60 GWh; la consulta tarda ~3 s.

**La de INTERALCO 2026 está GUARDADA** (28/10/2026, con el «sí» de Fran): 20,03 GWh, 8 % al Fondo,
9 GWh de otros, 198,624 €/MWh y 1.496,94 GWh de ventas computables.

**El aspecto es el de Facturación** (Fran, 28/10/2026: «que se parezca a Facturación - carta de
pago»; regla 164): papel crema a todo el ancho, con su propia cabecera y el conmutador dentro; la
lista de lotes sigue oscura. La cifra protagonista es **lo que le falta**; debajo, las seis cuentas,
la cuota tramo a tramo (las etapas, ordinales, en un solo tono verde de oscuro a claro; lo que
falta, rayado en ámbar, nunca rojo), los lotes por etapa y lo disponible (el naranja ordinal del
embudo de Facturación). Las piezas son las `.fx-` de `facturacion/estilo.jsx` (`DialogoFx` para
editar, `ErrorApi` con la BD caída, el aviso flotante al guardar).

`loteEco.js` importa ahora con extensión `.js` (Vite lo resuelve igual) para que el
backend y las pruebas lo puedan importar desde Node.
