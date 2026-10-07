<!-- conocimiento · área: seguimiento · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «Parte diario de seguimiento — que no se pierda ningún expediente (2026-08-10)»; la introducción y el resto, en esta misma carpeta.

### Envío en BLOQUE — [seguimientoLote.js](implementation/backend/services/seguimientoLote.js)

`radar.agruparPorDestinatario()` junta lo accionable por **(tipo de acción + persona)**.
Un certificador con 7 CEE sin registrar recibe **UN** mensaje con la lista. Medido:
39 expedientes accionables → 25 mensajes.

**REGLA — la clave de grupo NO lleva el `scope`.** Al mismo certificador se le reclama
de una vez el CEE inicial de una obra y el final de otra: es la misma petición y cada
línea del mensaje lleva su propio enlace. Sí separa por TIPO (registro ≠ emisión).
Como consecuencia, `enviarLote` sella la fase y la clave del recordatorio **por FILA**,
nunca por grupo: con un grupo mezclado, sellar todo con una sola fase deja la mitad
marcada donde no toca.

**REGLA — el envío en bloque NO puede delegar en `notify-certificador`**: esa ruta manda
un mensaje por llamada, así que N llamadas serían N mensajes — justo lo que se evita.
Aquí el mensaje sale UNA vez y luego se sella expediente por expediente (historial +
`markCertContact` + `recordatorios`). Los textos siguen siendo fuente única en
`recordatorios.js`.

**"Ahora no · posponer N días"** (`RADAR_POSPONER_DIAS`, 15) sella el recordatorio con
`pospuesto: true` sin enviar nada. Silencia su propia ventana, más larga que la de
reinsistencia, y el parte lo dice con otras palabras: no es lo mismo haber reclamado
que haber decidido no reclamar todavía. Sin esta salida, la línea que sabes que no toca
reclamar vuelve mañana y todos los días, hasta que dejas de mirar el parte entero.

**REGLA — al CERTIFICADOR se le escribe como a un compañero, no como a un cliente.** Es
un profesional con el que se habla cada semana, que tiene tu número y sabe quién le
escribe. Sus cuatro plantillas (`certRegistro*` / `certEmision*`) se separan del resto en
tres cosas, y ninguna es cosmética:
- **Saludo por su nombre y con coma** — "Hola Luis Alberto," y no
  "¡Hola *LUIS ALBERTO LANUZA PELAYO*!". ⚠️ El nombre sale de `saludoPartner`, que mira
  `prescriptores.nombre_responsable`: **el `select` de `resolverContacto` tiene que
  pedirlo**, o cae al respaldo y saluda con la razón social tal cual está en la BD, en
  mayúsculas. Y en `prepararLote` manda `contacto.nombre` (la PERSONA), nunca
  `grupo.destinatario.nombre` (la EMPRESA, que es lo que trae el radar).
- **Se dice POR QUÉ**, no solo qué: "hasta que no estén registrados no puedo avanzar con
  esos expedientes". Un aviso de estado ("sigue pendiente de registrar") no mueve a nadie
  a sacar un hueco; se pide en tono de favor porque no es un incumplimiento.
- **Primera persona y SIN firma corporativa.** El membrete al pie de un "cuando tengas un
  hueco" convierte el favor en una notificación del sistema. Los mensajes al CLIENTE sí la
  llevan: ahí el número puede no estar agendado.

**REGLA — el plazo frena al AUTOMÁTICO, no a ti.** El popup de envío lista además los
expedientes del MISMO destinatario y la MISMA petición que aún están en plazo
(`grupo.opcionales`), **desmarcados** y bajo el rótulo "Aún en plazo · márcalo para
incluirlo". Al certificador al que hoy le reclamas dos registros puede quedarle un
tercero de ayer, y mandarle los tres juntos es UN mensaje en vez de dos. Nunca crean
grupo por su cuenta —si no hay nada que reclamarle a alguien, no aparece su tarjeta— y
por defecto no van, así que el parte diario de WhatsApp no cambia. `prepararLote` y
`enviarLote` buscan los ids marcados en las DOS listas.

**REGLA — la antigüedad se OMITE cuando es de hoy.** "0 días" no dice nada, y avisar a
alguien de algo que le pediste esta mañana resta urgencia al resto de la lista.

**REGLA — el `detalle` del radar está escrito para TI, no para quien lo recibe.** En el
mensaje al certificador se sustituye por la FASE ("CEE final"): "visto bueno dado, falta
registrar" repite el párrafo de arriba palabra por palabra, y "encargado, sin arrancar"
es un juicio interno que suena a reproche.

**REGLA — el envío NO se implementa en `acciones.js`**: se delega en `notify-certificador`
y `solicitar-faltantes` llamándolas con `x-internal-key` (igual que el MCP), para que el
texto, el sellado del seguimiento y el historial sean los mismos que si hubieras escrito
desde el expediente. Los TEXTOS son fuente única en
[recordatorios.js](implementation/backend/services/recordatorios.js), del que tira
también `notify-certificador`.

**REGLA — `/parte/global` se declara ANTES que `/:tipo/:expId`** o Express lo toma por
un tipo de acción (mismo gotcha que `/fin-obra` en las subidas públicas).

**Anti-insistencia**: al enviar se sella `documentacion.recordatorios` con la RPC de
MERGE `merge_expediente_doc_json`. Mientras esté dentro de la ventana de reinsistencia
del bloque, el parte muestra "avisado hace N días" en vez del botón. Sin esto, el mismo
cliente recibe el mismo mensaje cada mañana. Para el certificador cuenta además
`cee_*_last_contacto_at`, así que escribirle desde la app también silencia el botón.

**WhatsApp y email NO llevan lo mismo**: el WhatsApp lleva el titular por bloque y solo
las 8 primeras acciones (`PARTE_WA_MAX_ACCIONES`); el email lleva el parte entero. Por
eso los tokens se truncan a 32 hex y la caducidad va en minutos epoch: con la URL larga
el mensaje pasaba de 4.000 caracteres y el móvil lo pliega tras un "Leer más".

⚠️ En LOCAL el primer chequeo salta a los 90 s del arranque y **manda avisos de verdad**:
`REVISION_ALERTA_ENABLED=false` en el `.env`.
