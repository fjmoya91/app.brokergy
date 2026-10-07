<!-- conocimiento · área: clientes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El aviso lo recibe el COMERCIAL o el TÉCNICO (2026-09-09)

Un instalador no tiene UN interlocutor: tiene el **comercial**, con el que se habla de
la obra, y el **técnico**, que firma. La app no lo distinguía —había un solo interruptor,
`contacto_notificaciones_activas`, que decía "manda a los contactos alternativos o al
representante" sin saber DE QUÉ se estaba escribiendo—, así que la Memoria RITE y "¿cómo
va la obra?" salían por el mismo sitio a la fuerza.

Medido en INSTOTERMA SL: la documentación RITE, que firma Jesús (654547042), salía al
**654547040 — el móvil de Carlos, el comercial**.

| Qué | Dónde |
|---|---|
| El reparto (roles, respaldo, saludo) | [notifyContacts.js](implementation/backend/services/notifyContacts.js) — `partnerNotifyTarget(p, rol)`, `contactosDePartner`, `rolDeDocumento` |
| Su espejo en el navegador | [docContacts.js](implementation/frontend/src/features/expedientes/utils/docContacts.js) — `contactosPara`, `defaultContactIds`, `avisoReparto` |
| El formulario | `PrescriptorDetailModal.jsx` — bloque **"Avisos y contactos"** |
| Prueba sin BD y sin enviar nada | `node implementation/backend/scripts/test_reparto_contactos.js` |

**REGLA — el ROL del contacto decide, y el ASUNTO pide un rol.** Cada persona de
`contactos_notificacion` lleva `roles: ['comercial'|'tecnico']` y quien envía pide
`partnerNotifyTargets(p, 'tecnico')`. Si lo decidiera cada pantalla, el parte diario y el
popup mandarían la misma cosa a personas distintas — el mismo motivo por el que los
textos son fuente única en `recordatorios.js`.

| Asunto | Rol | Dónde |
|---|---|---|
| Memoria RITE · borrador del certificado · CIFO para firmar | `tecnico` | `/instalador/enviar`, `CertificadoCifoModal`, `EnviarBorradorRiteModal`, `recordar-firma` del parte |
| Propuestas · fotos y documentación · "¿cómo va la obra?" · rechazo de una foto | `comercial` | `solicitar-faltantes`, `EnviarAnexosModal`, `reformaUploadService`, `fin-obra` del parte |

**REGLA — el REPRESENTANTE LEGAL no es un buzón.** `nombre_responsable` es quien FIRMA
(`firmanteCifo`): es una identidad documental —a quien se le manda a firmar el CIFO y, por
la otra cascada, la Memoria RITE, donde sí sale impreso—. Usarlo además como destinatario por defecto es lo que producía el fallo,
porque **67 de los 70 instaladores no tienen `tlf_responsable`** y su nombre acababa
pegado al teléfono de la empresa: la lista del popup decía *"Jesús · 654547040"* y ese
número era de Carlos. Ya no se ofrece como contacto.

**REGLA — sin nadie marcado se envía igual, pero SE DICE.** 51 instaladores no tienen un
técnico marcado, así que no puede bloquear nada: se cae al canal **general** de la
empresa, rotulado *"Teléfono y email generales de la empresa"*, y el popup lo avisa en
ámbar con el nombre del partner delante (`avisoReparto`). Un desvío silencioso es
exactamente el fallo que esto arregla.

**REGLA — al canal general de una EMPRESA se saluda en genérico.** Las plantillas ya
hacen `nombreSaludo(destinatario) ? '¡Hola X!' : '¡Hola!'` (y `mensajeInstalador` cae en
"Hola compañeros"), así que basta con NO inventar un nombre: "¡Hola Jesús!" en un número
que coge otra persona es peor que no saludar. En un **autónomo** sí se saluda por su
nombre — ahí la persona SÍ es la empresa. Al **CERTIFICADOR** no se le aplica el reparto:
sus plantillas escriben `Hola ${certName},` y no admiten un nombre vacío.

**REGLA — un contacto SIN roles se comporta como hasta ahora, y no se le adivina.** Los
~20 partners que ya tenían contactos son anteriores al reparto: marcarles un rol a ojo
cambiaría a quién le escribimos sin que nadie lo revise. Valen para todo, pero **solo si
su ficha tenía el desvío activo** — hay 3 con un contacto dado de alta y el interruptor
apagado a propósito (Esther, David, Pedro), y encenderlos de rebote sería empezar a
escribir a tres personas que hoy no reciben nada. Marcar un rol sí manda siempre: marcarlo
ES la decisión.

**REGLA — en el CIFO no va ningún teléfono.** El documento identifica a la empresa por su
razón social, CIF, domicilio y nº RITE, y a la persona por el **nombre de quien firma**.
La portada imprimía `Tel {pres.tlf}`, que es el mismo número de una persona concreta: el
móvil del comercial salía impreso en la carátula de todos los CIFO.

### En el popup se puede cambiar y poner a otro en copia

Por defecto viene marcado el del rol, pero **la lista enseña a TODOS los contactos de
la empresa** (más el canal general y "otro contacto…"), cada uno con su chapa de rol, y
se pueden marcar varios: para poner al comercial en copia de una firma, o para cambiar
un envío puntual. Fila compartida por los cuatro popups:
[ContactoPickRow.jsx](implementation/frontend/src/features/expedientes/components/ContactoPickRow.jsx)
— estaba copiada en los cuatro con diferencias de forma, y es la fila donde se comete el
error, porque es lo último que se mira antes de pulsar.

- El del asunto va resaltado y rotulado **"· le toca"**; los demás en gris.
- El canal general se rotula **"Empresa · teléfono y email generales"**, nunca con el
  nombre de una persona.
- El **cargo se calla cuando repite la chapa** ("CARLOS · Comercial · COMERCIAL"): solo
  aparece si añade algo ("JEFE DE OBRA").
- **El email va con COPIA REAL**: sale UNA vez, con el del rol en el `to` y los demás en
  `cc` (`sendMail` ya limpiaba vacíos y repetidos; `sendDocumentEmail`, `sendAnnexEmail`
  y `solicitar-faltantes` lo pasan). Dos correos idénticos por separado no son una copia:
  quien tiene que firmar no ve que su comercial lo tiene y se contesta por duplicado.
  **WhatsApp no tiene copia**, así que ahí sí va un mensaje a cada uno — y la nota del
  popup lo dice canal por canal ("Email: a JESÚS, con CARLOS en copia · WhatsApp:
  recibirá un mensaje cada uno").
- **REGLA — el `to` es el del ROL, no el primero que se marcó** (`priorizarPorRol`). La
  lista se recorre de arriba abajo, así que marcar al comercial "para que se entere"
  dejaba al técnico en copia de su propia tarea. Se aplica en los cuatro popups **y** en
  el historial, que anota quién iba en copia — si no, dentro de tres meses nadie sabe que
  el comercial también lo recibió.
- En `SolicitarFaltantesModal` la preselección pasó a ser **por rol**: buscaba el contacto
  cuyo teléfono coincidiera con el del destinatario por defecto, y el del contacto y el de
  la empresa son el MISMO en la mayoría de fichas.

### Y se le llama por lo que ES (2026-09-13)

El popup de **Enviar propuesta** rotulaba al partner con la palabra "Distribuidor"
**escrita a mano**, en sus tres listas (el popup unificado, el de WhatsApp y el de
email). Medido el 13/09/2026: de las 202 oportunidades con prescriptor, **179 son de un
INSTALADOR** y solo 20 de un distribuidor — el rótulo estaba mal el 89 % de las veces.
Visto en 26RES060_OP191: FONCAMAN CRIPTANA, SL figura en su ficha como INSTALADOR y la
chapa decía DISTRIBUIDOR.

El dato ya estaba cargado (`partnerInfo.tipo`, de `prescriptores.tipo_empresa`) y ya lo
miraba el **co-branding** de la propia propuesta, con esta misma razón escrita al lado:
*"llamar instalador a quien no lo es queda mal delante del cliente"*. Lo que faltaba era
aplicarlo a los rótulos. Fuente única:
[utils/tiposEmpresa.js](implementation/frontend/src/utils/tiposEmpresa.js) —
`tipoEmpresaLabel(tipo)`, que ante un tipo que no consta dice **"Partner"** en vez de
afirmar uno sin comprobar.

**REGLA — el instalador asociado solo es OTRA fila si es OTRA empresa.** En **32
oportunidades** `prescriptor_id` e `instalador_asociado_id` son el MISMO id, y la lista
pintaba dos tarjetas con el mismo nombre, el mismo teléfono y el mismo email: marcar las
dos le mandaba la propuesta por duplicado a la misma persona
(`mismoPartnerEInstalador`).

### Y a la propuesta se ELIGE quién de la empresa la recibe (2026-09-15)

El popup de **Enviar propuesta** ofrecía UNA persona por partner: la que resolvía el
desvío de notificaciones (`contacto_notificaciones_activas`), o el canal general si no
había. O sea, exactamente el fallo de la regla del reparto pero en el otro extremo del
proceso: en INSTALACIONES MIGUELTURRA se leía "TERE · 926241611", que es el nombre de una
persona sobre el teléfono de la centralita, y **AURELIO —comercial, con su propio móvil—
no se podía elegir sin salir a su ficha**. Ahora la tarjeta del partner es la EMPRESA y
debajo van sus personas con la MISMA fila que los popups del expediente
(`ContactoPickRow`), marcadas por defecto las que le tocan.

**REGLA — la propuesta es asunto COMERCIAL** (`ROL_PROPUESTA`), igual que lo dice
`rolDeDocumento` en el backend: la recibe quien lleva la obra con el cliente, no quien
firma los certificados. Las personas y el marcado por defecto salen de
[docContacts.js](implementation/frontend/src/features/expedientes/utils/docContacts.js)
(`instaladorContacts` + `defaultContactIds`), que es la misma fuente que el CIFO, el RITE
y "solicitar lo que falta" — no hay una segunda lista que pueda decir otra cosa.

**REGLA — un modo marcado sin nadie detrás no existe.** Desmarcar la última persona
desmarca la empresa entera, y volver a marcarla restaura las que le tocan. Y si lo único
marcado es el canal general se **DICE** (`avisoReparto`), con el nombre del partner
delante: un desvío silencioso a la centralita es justo lo que esto viene a evitar.

**REGLA — dos personas de la MISMA empresa reciben UN correo con copia real.** El bucle
de envío pasa a ir por GRUPO (empresa) y no por contacto: el `to` es el del rol
(`priorizarPorRol`) y el resto va en `cc` — `POST /api/pdf/send-proposal` y
`sendProposalEmail` lo aceptan. Dos correos idénticos por separado no son una copia:
quien tiene que contestar no ve que su compañero lo tiene, y se contesta por duplicado.
**WhatsApp no tiene copia**, así que ahí sí sale un mensaje a cada uno, y cada uno con su
propio saludo.

**REGLA — el mensaje saluda a quien va en el "Para".** El texto de la caja es el del
principal del modo principal; cambiar de persona marcada lo rehace (si no se ha editado a
mano). Marcar al compañero "para que se entere" no puede cambiar el saludo.

**REGLA — el CANAL se elige POR DESTINATARIO, no solo para el envío entero.** Cada fila
marcada lleva sus dos botones (`CanalMiniChip`, el mismo glifo y el mismo color que el de
la barra: es la misma decisión a otra escala). Al comercial se le manda por WhatsApp, que
es donde lee, y a administración por email — sin esto había que **enviar dos veces**, una
con cada canal marcado, y en la segunda vuelta el otro destinatario lo recibía repetido.
El chip de la barra sigue siendo el **interruptor maestro**: apagado ahí, no sale por ese
canal aunque una fila lo tenga encendido.

- Lo que se cuenta en la barra es lo que va a salir DE VERDAD ("a 2 destinatarios"), no
  cuántos tienen el dato: "2 con email" cuando a uno le has quitado el correo es un
  recuento falso, y es el número que se mira antes de pulsar.
- Un canal sin dato (una persona sin teléfono) sale **deshabilitado con su motivo**, no
  apagado: no es una decisión, es que no se puede.
- **Marcado y sin ningún canal se DICE** ("⚠ TERE no recibirá la propuesta: sin canal
  marcado"). No se le desmarca solo —la marca la puso una persona— pero callarlo sería
  enviar creyendo que le llega.
- La nota de copia cuenta los canales de cada uno: a quien le has quitado el correo no
  puede aparecer "en copia", y la línea de WhatsApp solo sale si de verdad lo reciben dos.

⚠️ `ContactoPickRow` es un `<button>` y los chips son botones: van **fuera** de la fila,
en un contenedor flex, nunca dentro del componente compartido con los popups del
expediente. Por el mismo motivo la tarjeta de "Otro contacto…" pasó de ser un botón raíz
a un div con el botón dentro.

### El formulario: una sola pregunta y CERO interruptores

Eran dos toggles anidados ("desviar a otros contactos" + "enviar notificaciones a estos
contactos") y una lista: había que abrir los dos para descubrir a quién le llegaba nada.
Ahora los dos se **derivan** de si hay personas dadas de alta (las columnas siguen ahí por
compatibilidad) y lo único que se contesta es qué recibe cada persona.

- **El resumen va ARRIBA y también en el `summary` plegado**: "Comercial: CARLOS ·
  Técnico: JESÚS", o en ámbar "Nadie marcado · irá al teléfono general (654547040)". Es la
  única pregunta que contesta el bloque y se responde sin desplegarlo. Es **derivado** de
  los roles: dos sitios donde declarar lo mismo acaban diciendo cosas distintas.
- **El resumen se calcula con lo que se VA A GUARDAR**, no con lo que hay en la BD — si no,
  en esas 3 fichas la pantalla diría "nadie marcado" y el guardado haría lo contrario.
- **Chips de rol** con lo que recibe cada uno en el `title`, y un "recibe todo" para el
  caso de una sola persona (25 de 70 son autónomos).
- **Atajo "Usar a Jesús"**: copia al representante legal como contacto con su teléfono
  PROPIO (nunca el de la empresa, que es la confusión que causó todo). En 51 fichas no hay
  ni un contacto, y teclear otra vez lo que está tres campos más arriba es la razón.
- **Sugerencia por el cargo**: si ya pone "COMERCIAL" o "TÉCNICO", se ofrece marcarlo de un
  clic. Lo marca una PERSONA — deducirlo cambiaría destinatarios sin que nadie lo revise.
- **Se avisa si una persona con rol no tiene teléfono**: solo le llegará el email, y casi
  todos los avisos salen por WhatsApp.
- El aviso de "sin repartir" solo aparece con **dos o más** personas: con una, o recibe
  ella o recibe la empresa, y pedir una decisión que no cambia nada es lo que hace que se
  ignoren los avisos que sí importan.
