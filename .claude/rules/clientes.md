---
paths:
  - "implementation/frontend/src/features/{clientes,cobro}/**"
  - "implementation/frontend/src/features/admin/views/{PrescriptoresList,PrescriptorDetailModal}.jsx"
  - "implementation/backend/routes/{clientes,prescriptores}.js"
  - "implementation/backend/services/{notifyContacts,cobroService,clientesRelaciones,whatsappClientesSync}.js"
  - "implementation/backend/utils/{normalization,justificanteBancario}.js"
  - "implementation/frontend/src/features/expedientes/utils/docContacts.js"
  - "implementation/frontend/src/features/expedientes/components/ContactoPickRow.jsx"
  - "implementation/frontend/src/utils/{tiposEmpresa,contactoCliente}.js"
  - "implementation/frontend/src/features/expedientes/logic/cedentes.js"
---
# Clientes y partners — fichas, propietarios y cedentes, contactos comercial/técnico, cobro y venta cruzada (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/clientes/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

9. **DNI único**: La columna `clientes.dni` tiene constraint `UNIQUE`.

10. **Modales de Clientes / Partners**: Nunca cerrar al clicar fuera. Solo "X" o "Cancelar".

36. **La CONFIRMACIÓN DE COBRO es un formulario de la app, no de Tally**: `/cobro/:id?token=` cualifica al cliente (tarifa · fotovoltaica · IRPF) y confirma sus datos de pago cuando el S.O. ya nos ha pagado (lote en "PTE. PAGO BROKERGY A CLIENTE"). Se manda desde la **fase 7 del lote, "Pago a los clientes"**, con un WhatsApp de enhorabuena que lleva la cuenta que tenemos **enmascarada** (nunca entera en un mensaje), y en el formulario la cuenta se confirma con dos botones («Sí, es correcta» / «No, es otra»). `/cobro/demo` lo enseña sin tocar nada. Lo obligatorio va AL FINAL y lo comercial delante, y **nunca retiene el cobro**. La forma de pago solo se pregunta a quien asume el coste (`discountCertificates` la calla, porque su convenio no la menciona), y las dos opciones NO cuestan lo mismo: el descuento va sobre la BASE sin IVA y la factura lo repercute, así que sale marcada `desaconsejada` con lo que cuesta de más y el retraso del cobro. **Cambiar de IBAN exige justificante NUEVO** —el anterior acredita la cuenta vieja— y el cambio va lo primero en el aviso al staff. Los datos van a `clientes` y el justificante a su slot de siempre; en `documentacion.cobro`, solo metadatos con RPC de MERGE. Fuentes únicas: [logic/cobroForm.js](implementation/frontend/src/features/cobro/logic/cobroForm.js) (qué se pregunta) y [cobroService.js](implementation/backend/services/cobroService.js) (a quién y con qué datos). Ver "Confirmación de cobro".

44. **Cada aviso va al COMERCIAL o al TÉCNICO del partner, no "al instalador"**: cada persona de `contactos_notificacion` lleva `roles: ['comercial'|'tecnico']` y quien envía pide el suyo — fuente única [notifyContacts.js](implementation/backend/services/notifyContacts.js) (`partnerNotifyTarget(p, rol)`, `rolDeDocumento`) y su espejo [docContacts.js](implementation/frontend/src/features/expedientes/utils/docContacts.js). El RITE, el CIFO y sus rechazos son del TÉCNICO; propuestas, fotos y seguimiento, del COMERCIAL. **El representante legal NO es un buzón**: su nombre es el que firma el CIFO, y ofrecerlo como destinatario era el fallo — 67 de 70 fichas no tienen `tlf_responsable`, así que su nombre salía pegado al teléfono de la EMPRESA ("Jesús · 654547040", el número de Carlos). Sin nadie marcado se envía al canal GENERAL, rotulado como tal y avisado en ámbar; a una empresa se le saluda en genérico y a un autónomo por su nombre; al CERTIFICADOR no se le aplica el reparto (sus plantillas no admiten nombre vacío). Un contacto sin roles se comporta como hasta ahora y **no se le adivina** el suyo. En el CIFO no va ningún teléfono. ⚠️ Y al CLIENTE se le saluda por **quien RECIBE el mensaje**: con el desvío activo (`notificaciones_contacto_activas`) el aviso sale al teléfono de su persona de contacto, y saludar al titular delata la plantilla — medido en 26RES060_187, el aviso de CEE presentado llegaba al WhatsApp de JUAN ANTONIO empezando por «¡Hola MARIA TERESA!». `nombreParaSaludo` en `routes/expedientes.js` lo resuelve en los tres avisos de CEE registrado; el del ENCARGO ya lo hacía bien porque pasa por `resolveSolicitudContacto`. Solo cambia el SALUDO: en los mensajes a staff y al partner el cliente sigue siendo el titular («Obra: …»). Tras tocarlo: `node implementation/backend/scripts/test_reparto_contactos.js`. Ver "El aviso lo recibe el COMERCIAL o el TÉCNICO".

73. **El listado de CLIENTES lleva etiquetas de TIPO y un ESTADO, y se filtra por los dos**: el tipo (RES060 · RES080 · RES093 · TER100 · TER173 · CEE) sale del nº de sus expedientes, de sus oportunidades sin expediente —chip a trazos: solo presupuestado— y de sus CEE directos; el estado es el de lo MÁS VIVO (**En curso** > **Propuesta** > **Cerrado** > Rechazado > Sin asignar), con "cerrado" = `FINALIZADO`, el único estado terminal de las dos tablas. Una función para pintar y filtrar ([logic/clientesEtiquetas.js](implementation/frontend/src/features/clientes/logic/clientesEtiquetas.js)), o el filtro traería filas que dicen otra cosa. `GET /api/clientes` trae ya los CEE directos del cliente (solo staff, solo escalares) y el estado de expedientes y oportunidades (`estado:datos_calculo->>estado`, nunca el JSONB entero). Un cliente de CEE directo tiene sus tres accesos (app · Drive · carpeta local) con `ExpedienteAccesos apiBase="/api/cee-directos"` — ruta nueva `GET /api/cee-directos/:id/drive-link` (staffOnly) — y se abre con `onNavigate('cee-directos', { cee_id })`. ⚠️ **54 de los 59 CEE directos NO tienen `cliente_id`** (el histórico importado): no salen en ningún cliente hasta vincularlos. `scripts/vincular_cee_directos_clientes.js` (en seco sin `--execute`) lee el `.xml` de su carpeta —**solo el bloque `<IdentificacionEdificio>`**: antes viene la dirección del CERTIFICADOR y a pelo todos salían "Tomelloso"— y propone el cliente por la REFERENCIA CATASTRAL (confianza ALTA) o por el nombre de la carpeta con al menos un APELLIDO en común (MEDIA, solo con `--incluir-media`); de paso rellena los huecos de dirección. Ejecutado el 25/09/2026: **2** vinculados por la RC (2024CEE_03, 2026CEE_47) y **29** con la dirección rellenada; los otros 52 se vinculan a mano desde la ficha del CEE. Un `.xml` de varios inmuebles declara varias RC y se guarda la primera (el campo es de 25). Junto al estado del cliente se pinta **el del expediente abierto más reciente** (`puntoCliente`: "EN CURSO · PTE. FIN OBRA", o el de la oportunidad en una propuesta). Además, el listado filtra por **PARTNER**, **recuerda los filtros** en el navegador (`brokergy.clientes.filtros`, con try/catch) y **exporta a CSV lo que se está viendo**. Y el panel de WhatsApp **etiqueta el chat de cada cliente** con su tipo y su estado ([whatsappClientesSync.js](implementation/backend/services/whatsappClientesSync.js), `POST /api/whatsapp/etiquetas/sincronizar-clientes`, adminOnly, en seco por defecto y a trozos): los datos salen de [clientesRelaciones.js](implementation/backend/services/clientesRelaciones.js), la MISMA carga que el listado. **El tipo se añade y nunca se quita; el estado es exclusivo** (se quitan solo los otros estados gestionados). **Solo etiquetas que YA existen**, **solo chats que ya existen** (`chatAbierto`, no se crean chats vacíos) y **nunca un teléfono de partner o compartido por varios clientes** (hay fichas de cliente con el móvil del instalador). Solo el TITULAR, no la persona de contacto.

59. **Una vivienda puede tener DOS propietarios, y el segundo es un DESTINATARIO — no un firmante.** La ficha solo tenía sitio para uno, así que se metían los dos en los campos del titular (medido: nombre «CARLOS MÓNICA», apellidos «POVEDA OCHOA CASTELLANOS SÁNCHEZ»), lo que deja un nombre que no es el de nadie —y que es el que imprimen el Anexo I y el Convenio— y **un solo teléfono y un solo correo**. Botón **«+ Añadir nuevo propietario»** en la ficha, con los mismos campos del titular. El Anexo I y el Convenio **siguen saliendo a nombre del titular y con su único recuadro de firma** (decisión 2026-09-17): no se ha tocado ningún documento, y la ficha lo dice en sus dos caras. El **destinatario automático tampoco cambia** —`resolveSolicitudContacto` sigue devolviendo el titular, que es de quien tiran el parte diario y los avisos que salen solos—: a un copropietario se le escribe porque alguien lo marca, o dar de alta al segundo duplicaría todos los avisos de ese expediente. Vive en `clientes.copropietarios` (JSONB, tope de 5) y el saneado es de `normalizeCliente`, no de la ruta: en `clientes` escriben también el funnel, la aceptación de la propuesta y el cobro. Los dos ESPEJOS —`clienteContacts` (lo que se enseña) y `contactosDeCliente` (lo que se manda)— tienen que coincidir **hasta en los ids** (`cli` · `cop0`… · `cli_contacto`): si divergen no falla nada, simplemente el mensaje sale a quien no era. ⚠️ El índice del id es el de la LISTA ORIGINAL y no el de los ofrecidos — quien no tiene ni teléfono ni email no se enseña pero **no corre a los demás**. **Desde 2026-10-06 se puede preguntar también AL ACEPTAR, pero SOLO si el equipo lo habilita** desde la ficha del cliente (`clientes.aceptacion_varios_propietarios`, casilla «Permitir varios propietarios al aceptar la propuesta», solo staff) o si la ficha ya tiene copropietarios — la pregunta generaba demasiadas dudas al aceptar, así que por defecto la aceptación es de UNA sola persona y el backend ignora los copropietarios que lleguen sin habilitar (`/aceptar` y `PATCH /datos`); `/firma/demo?varios` lo enseña habilitado. Habilitado: `/firma/:id`: «¿La vivienda tiene más de un propietario?», obligatoria y en neutro; nombre y DNI obligatorios, para la deducción del IRPF) **y cada uno puede llevar SU CUENTA** (`copropietarios[].iban` + `justificante_link`, subido a Drive como «justificante de titularidad bancaria - {NOMBRE}.pdf»), por si el bono se ingresa en partidas separadas; vacía = cobra en la del titular. El justificante lo escribe el SERVIDOR y `fundirCopropietarios` lo conserva por id mientras la cuenta no cambie. La ruta de aceptación usa `uploadAceptacionAny` (`justificante` + `justificante_cop_<id>`) y el aviso al equipo dice quién cobra aparte. Lógica del formulario: [logic/propietariosAceptacion.js](implementation/frontend/src/features/public/logic/propietariosAceptacion.js). ⚠️ El pago del lote (fase 7) aún NO reparte el bono entre cuentas: lo dice la ficha y lo resuelve una persona. Tras tocarlo: `node implementation/backend/scripts/test_copropietarios.mjs`. Ver "Una vivienda puede tener DOS propietarios".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/clientes/confirmacion-de-cobro-el-formulario-del-final.md` — Confirmación de cobro — el formulario del final (2026-09-07) · 12,0 KB
- `docs/conocimiento/clientes/el-aviso-lo-recibe-el-comercial-o-el-tecnico.md` — El aviso lo recibe el COMERCIAL o el TÉCNICO (2026-09-09) · 13,6 KB
- `docs/conocimiento/clientes/modulo-prescriptores-novedades.md` — Módulo Prescriptores — Novedades (2026-03-26) · 1,1 KB
- `docs/conocimiento/clientes/patron-de-modales-clientes-y-prescriptores.md` — Patrón de Modales (Clientes y Prescriptores) · 0,5 KB
- `docs/conocimiento/clientes/una-vivienda-puede-tener-dos-propietarios.md` — Una vivienda puede tener DOS propietarios (2026-09-17) · 4,2 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/clientes/confirmacion-de-cobro-el-formulario-del-final.md`
  - **REGLA — el formulario NUNCA retiene el cobro.**
  - **REGLA — lo obligatorio va AL FINAL y lo opcional delante.**
  - **REGLA — la forma de pago SOLO se le pregunta a quien asume el coste de gestión.**
  - **REGLA — las dos opciones NO cuestan lo mismo, y se dice ANTES de elegir.**
  - **REGLA — cambiar de IBAN exige justificante NUEVO.**
  - **REGLA — el IBAN nuevo no se pisa en silencio.**
  - **REGLA — no se promete fecha de ingreso.**
  - **REGLA — el bloque de placas llega PRECONTESTADO**
  - **REGLA — los datos van a `clientes`, no a una tabla de datos bancarios.**
  - **REGLA — el momento es "PTE. PAGO BROKERGY A CLIENTE"**
  - **REGLA — el mensaje dice la NOTICIA, el MOTIVO (la seguridad) y la cuenta que
tenemos ENMASCARADA**
  - **REGLA — el mensaje y la portada dicen LO QUE SE LE INGRESA, y solo con el ahorro
VERIFICADO**
  - **REGLA — el ESFUERZO se cuenta con lo que DE VERDAD pasó**
  - **REGLA — en el formulario la cuenta se CONFIRMA con dos botones**
  - **REGLA — quién asume la gestión lo dice el EXPEDIENTE antes que la simulación**
  - **REGLA — pestaña PROPIA, no un rincón de otra.**
  - **REGLA — arranca en los INTERESADOS y el resto se pide.**
  - **REGLA — el CSV exporta lo que estás VIENDO**
- `docs/conocimiento/clientes/el-aviso-lo-recibe-el-comercial-o-el-tecnico.md`
  - **REGLA — el ROL del contacto decide, y el ASUNTO pide un rol.**
  - **REGLA — el REPRESENTANTE LEGAL no es un buzón.**
  - **REGLA — sin nadie marcado se envía igual, pero SE DICE.**
  - **REGLA — al canal general de una EMPRESA se saluda en genérico.**
  - **REGLA — un contacto SIN roles se comporta como hasta ahora, y no se le adivina.**
  - **REGLA — en el CIFO no va ningún teléfono.**
  - **REGLA — el `to` es el del ROL, no el primero que se marcó**
  - **REGLA — el instalador asociado solo es OTRA fila si es OTRA empresa.**
  - **REGLA — la propuesta es asunto COMERCIAL**
  - **REGLA — un modo marcado sin nadie detrás no existe.**
  - **REGLA — dos personas de la MISMA empresa reciben UN correo con copia real.**
  - **REGLA — el mensaje saluda a quien va en el "Para".**
  - **REGLA — el CANAL se elige POR DESTINATARIO, no solo para el envío entero.**
- `docs/conocimiento/clientes/una-vivienda-puede-tener-dos-propietarios.md`
  - **REGLA — un copropietario es DESTINATARIO, no FIRMANTE.**
  - **REGLA — el destinatario AUTOMÁTICO no cambia.**
  - **REGLA — los dos ESPEJOS tienen que decir lo mismo, ids incluidos.**
  - **REGLA — la lista se guarda ENTERA, nunca por partes.**

<!-- generado:fin -->
