<!-- conocimiento · área: cee · las rutas de los enlaces son relativas a la raíz del repo -->

## El certificador POR DEFECTO de todo CEE es Fran, y el AGENTE IA trabaja sin figurar en la barra (2026-10-26)

Fran: «excepto que yo diga lo contrario, todos los CEE me ponen a mí como certificador». Hasta ahora
solo el `.cex` que escribe el agente llevaba a Fran por defecto (2026-10-06, `cee_inicial.js`); en la
app, un expediente o un CEE directo nacía **sin** certificador, y el CEE que hacía el agente quedaba
con el **AGENTE IA** en la barra, que no firma: con el visto bueno dado, el radar pedía «asigna el
técnico que lo registra» y el borrador de presentación tenía que poner a Fran en el 02 por su cuenta.
El 26/10/2026 había **78** expedientes vivos con Fran, **31** con el agente y **80** vacíos.

**Fuente única:** [utils/certificadorCasa.js](implementation/backend/utils/certificadorCasa.js)
(`certificadorCasaId`, `esCertificadorCasa`, `normalizarCertificador`). `CEE_TECNICO_POR_DEFECTO` lo
cambia sin tocar código. La usan también `borradorCeeService` (el 02) y `cee_inicial.js` (el técnico del
`.cex`), que tenían el id copiado.

**REGLA — todo expediente CAE y todo CEE directo NACE con Fran de certificador**, salvo que se diga
otro (`createExpediente` y `ceeDirectoService.crear`). **Tenerlo puesto no es haberlo encargado**: el
subestado sigue en `PTE_ENVIO_CERT` y el radar lo saca en «sin encargar» como «A tu nombre por
defecto, sin empezar», con «Encargar el CEE inicial». Un **MIGRADO** no lo lleva
(`migrateExpedienteFromXml` lo deja vacío): sus CEE los hizo quien los hizo en el sistema antiguo.

**REGLA — el AGENTE IA nunca se GUARDA como certificador.** Elegirlo en el selector es
**encargárselo**: `notify-certificador` (CAE y CEE directos) guarda a Fran y escribe el sello
`cee.agente_ia[fase] = { estado: 'encargado', encargado_at }`; y los dos PUT convierten el id del agente
en el de la casa (`normalizarCertificador`), para que el autoguardado de la ficha, que lleva lo elegido
en el selector, no lo vuelva a poner.

**REGLA — el encargo del agente se lee de su SELLO, no de la barra.** `esEncargoDelAgente` (en
[agenteIa.js](implementation/backend/services/agenteIa.js)): con el agente en la barra, todas las fases
(lo de antes); con Fran, las que tienen sello `encargado`, `trabajando` o `terminado`. Lo usan la
`cola()` del agente y el radar (`agente_fase`, bloque `AGENTE_IA` y el «borrador del Agente IA» de
REVISIÓN). El aviso de «el Agente IA no firma: asigna el técnico» queda solo para lo que aún tenga al
agente en la barra.

**REGLA — con Fran en la barra el agente MUEVE la fase** (`decidirCertificador`): sin técnico o con el
agente, `empezar`/`terminar` ponen a Fran; con Fran, se queda; con un técnico de fuera, no se le quita
(le prepara el borrador) salvo `--reasignar`, que ahora pasa a Fran. Ya no lleva «asigna el técnico
que lo firma»: lo firma Fran al dar el visto bueno.

**Lo que ya existía, de una vez:** `scripts/certificador_casa_pendientes.js` (en seco; `--escribir`) pone
a Fran en los vivos **vacíos o con el agente** que aún tienen algún certificado sin registrar. Deja
fuera a los técnicos de fuera, los FINALIZADO/RECHAZADO, los migrados (`PENDIENTE REVISAR EXPTE`), el
histórico importado de CEE directos (`origen = 'HISTORICO'`) y los CAE que ya pasaron la fase del CEE
(después de «REVISADO Y LISTO (FINAL)»), cuyo CEE está hecho aunque la app no tenga la fecha. El
26/10/2026, en seco: 52 CAE (31 del agente, 21 vacíos) y 2 CEE directos. **Se ejecuta junto al deploy**:
con el código anterior, la cola del agente en producción se quedaría vacía.

Pruebas: `node implementation/backend/scripts/test_agente_ia.js`, `test_agente_ia_flujo.js` y
`test_solo_asignar_cert.js`.
