# CLAUDE.md — BROKERGY

CRM interno de BROKERGY para rehabilitación energética y Certificados de Ahorro Energético (CAE) en
España: oportunidad → propuesta → expediente (CEE inicial y final, documentos, CIFO) → lote al Sujeto
Obligado → cobro; y, aparte, los **CEE directos** (certificados sueltos). Stack: React + Vite
(`implementation/frontend`), Node/Express (`implementation/backend`), Supabase (BD + auth), Google Drive
(carpetas de los expedientes) y un motor CE3X en Python (`implementation/cee-engine`). Producción: VPS
propio `187.77.93.213` con Docker Compose, dominio `app.brokergy.es`. **No** usamos Vercel ni Railway.

## Este fichero es corto a propósito

Se carga en CADA sesión y en CADA subagente. Hasta el 07/10/2026 pesaba 1,1 MB (~490.000 tokens): cada
sesión arrancaba con medio contexto gastado y los subagentes no podían ni arrancar. El conocimiento está
ahora en tres niveles (el porqué y las reglas de mantenimiento: [docs/conocimiento/README.md](docs/conocimiento/README.md)):

| Nivel | Dónde | Cuándo se carga |
|---|---|---|
| 1 | este `CLAUDE.md` | siempre |
| 2 | `.claude/rules/<área>.md` | **solo**, al leer o editar con Read/Edit/Write un fichero de esa área |
| 3 | `docs/conocimiento/<área>/*.md` | cuando se lee: el detalle íntegro, el porqué y lo medido |

**No se añaden secciones aquí.** Ver «Cómo se documenta», al final.

## Regla de oro: local primero, luego deploy

**SIEMPRE trabajamos contra `localhost` primero.** Solo cuando el cambio está validado en local se hace
`git push` y luego deploy al VPS. Prohibido pushear "a ver si funciona en producción".

1. Cambio en local.
2. Probar en `localhost` (frontend `npm run dev` + backend `npm start`).
3. Si OK → `git push origin main`.
4. SSH al VPS (`ssh root@187.77.93.213`) → `cd /opt/brokergy && bash scripts/deploy.sh`.
5. Verificar en `https://app.brokergy.es`.

Si el usuario dice "no veo el cambio", lo primero es: **¿hemos hecho el deploy al VPS?**

## Cómo trabaja Claude aquí (obligatorio)

1. **El código se lee con Read y se edita con Edit/Write**, no con `cat`/`sed`: así se cargan solas las
   reglas del área (nivel 2). Los ficheros grandes (`routes/expedientes.js`, `routes/public.js`…) se leen
   por rangos, nunca enteros.
2. **Antes de cambiar el comportamiento de algo, o de explicar cómo funciona, mira qué se decidió**:
   `grep -rn "<fichero|función|ruta|campo>" docs/conocimiento .claude/rules` y lee lo que salga. Al abrir
   un fichero, un hook dice qué documentos hablan de él: léelos antes de tocarlo. Sobre una regla de
   negocio no se contesta de memoria.
3. Una «regla N» que cite el código: `grep -rnE "^N(\.[a-z])?\.? " .claude/rules`. Índice completo:
   [docs/conocimiento/INDICE.md](docs/conocimiento/INDICE.md).
4. Tras tocar algo, se pasan las comprobaciones que diga su regla («Tras tocarlo: …»).
5. Si un documento ya no dice la verdad, se corrige en el mismo cambio.
6. Si la app ya calcula lo que se pregunta (el radar del parte diario, una vista SQL, un listado), se
   usa **su** criterio, se dice cuál, y se aprovecha lo que ese criterio ya trae. Los totales de un
   resumen se cuentan sobre la propia tabla antes de escribirlos.

## Por dónde empezar según la pregunta

| Si la pregunta es sobre… | El criterio está en |
|---|---|
| Lo pendiente o atascado, «qué hago hoy»: sin encargar, sin revisar, sin registrar, firmas, sin lotear… | El radar del parte diario: `docs/conocimiento/seguimiento/` y `seguimientoRadar.js` (los once bloques, con el material para el CEE en los sin encargar) |
| En qué estado está un expediente y qué le falta | `docs/conocimiento/expedientes/` (ciclo de vida, `v_expedientes_pendientes`) y el estado visible de `oportunidades/` |
| Un CEE entregado por un técnico, su revisión o su presentación | `docs/conocimiento/cee/` |
| Ahorro, bono, SCOP, C_b, D_ACS, precio CAE | `docs/conocimiento/calculo/` |
| Fotos o documentación que falta | `docs/conocimiento/documentacion-fotos/` |
| Lotes, verificación, Sujeto Obligado, pago al cliente | `docs/conocimiento/lotes/` y `clientes/` |
| Un CEE suelto, no CAE | `docs/conocimiento/cee-directos/` |

## Cómo se piden las cosas (texto o audio)

Resumen de [docs/conocimiento/COMO-TRABAJAMOS.md](docs/conocimiento/COMO-TRABAJAMOS.md):

- Muchas peticiones llegan **dictadas**: se interpreta la intención; los números y nombres se normalizan
  («veintiséis RES cero sesenta, ciento ochenta y siete» → `26RES060_187`) y se **comprueban contra la
  BD** antes de escribir o enviar nada. Si solo hay que mirar, se busca y se dice cuál se ha encontrado.
  Si el audio se corrige a sí mismo («no, perdón, el 188»), manda lo último.
- De cada petición se saca: **sobre qué** (obra, área), **qué resultado**, **hasta dónde**, **qué no se
  toca** y **qué tareas son independientes**. Se pregunta UNA vez, con opciones, y solo lo que falta y
  cambia el resultado; lo demás se resuelve con los valores por defecto, diciéndolo en una línea.
- **Hasta dónde, si no se dice**: se hace en local, se verifica y se enseña. **Sin** commit, push ni
  deploy. **Nada** sale a terceros (WhatsApp, email, Sujeto Obligado) sin un «sí» para ESE envío. Los
  scripts que escriben van primero en seco: **local escribe en la Supabase y el Drive de PRODUCCIÓN**.
- Palabras que cambian el alcance: «mira / analiza / en seco» → solo leer · «hazlo / arréglalo» → cambio
  local verificado · «súbelo / haz commit» → commit · «despliega / a producción» → push + `deploy.sh` ·
  «mándalo / envíalo» → envío, tras enseñar el borrador.
- Título de la sesión, por obra: «{nº} - {CLIENTE}».

## Subagentes y tareas en paralelo

- **Sí** para: búsquedas amplias (**Explore**: no carga las instrucciones del proyecto, solo busca y lee),
  tareas independientes en paralelo (**general-purpose**: carga este fichero y las reglas de los ficheros
  que abra) y revisiones. **No** para lo que se resuelve con dos lecturas, ni para enviar o desplegar: eso
  lo hace la sesión principal, y con el «sí».
- El encargo de un subagente lleva: objetivo y resultado esperado · **qué documentos de
  `docs/conocimiento` leer primero** (la tabla de arriba dice cuáles; el subagente no ha visto esta
  conversación) · qué puede tocar y qué no · qué comprobaciones pasar · y que devuelva **conclusiones y
  ficheros cambiados**, no volcados.
- Dos subagentes no editan los mismos ficheros a la vez (si hay riesgo: `isolation: "worktree"`).

## Lo que no se rompe nunca (vale para todo el código)

- **Rutas**: todas llevan guardián (`enforceAuth`, `staffOnly`, `adminOnly`, `internalOnly`,
  `…OClaveInterna`); `requireAuth` **no** exige sesión. Un partner solo toca lo suyo; importes y margen,
  solo ADMIN. (reglas 6 y 102)
- **Supabase**: nada de ficheros en base64 dentro de un JSONB; los listados nunca traen un JSONB entero;
  `reforma_uploads` y `documentacion` se escriben con sus RPC de merge, nunca leyendo y reescribiendo todo.
  (19, 21, 22)
- `normalizeData` pasa a MAYÚSCULAS: un JSONB con enums en minúscula va en su BLACKLIST. Lo que escribe
  una ruta dedicada va en `CLAVES_PROTEGIDAS` de `mergeDocumentacion`, o el autoguardado lo borra.
- Con la BD caída se responde **503**, nunca una cifra a cero. (38)
- **Local = datos de producción**. En el `.env` local, apagados: `REVISION_ALERTA_ENABLED`,
  `CEE_ENTREGA_AUTO`, `BOT_WHATSAPP_ENABLED`, `PROPUESTA_PROGRAMADA_ENABLED`, `WA_SYNC_INSTALADORES`.
- **WhatsApp**: un mensaje con el reloj no está enviado (manda el ACK); nunca `getChatById` ni `sendSeen`
  en el camino de envío. (39)
- **Drive**: los enlaces, solo para ADMIN; la carpeta de cada expediente la decide `driveFolders.js`. (1)
- **Catastro**: nunca `axios`, nunca peticiones en paralelo, solo los WCF JSON. (15–17)
- **Documentos generados**: las hojas son de alto fijo y se miden con los `check_*.mjs`; las tipografías,
  auto-alojadas. (25.b)
- **Frontend**: ningún hook debajo de un `return` condicional (lo para el build); overlays con
  `createPortal` a `body`; los envíos, con `SendActionOverlay`. (62, 29.b)
- **Skills**: una sola fuente, `skills/`; tras editar una, `node scripts/skills.mjs empaquetar` y
  publicarla (lo recuerda un hook). El repo es público: nada de DNI, IBAN, teléfonos ni claves en una skill.

## Áreas

Cada una tiene su regla `.claude/rules/<área>.md` y su carpeta `docs/conocimiento/<área>/`.

| Área | Qué cubre |
|---|---|
| `oportunidades` | Estados, IDs, funnel, nueva simulación, aceptación, alta desde WhatsApp |
| `propuesta` | Versiones, envío programado, presupuesto estimado/leído, portada, comisión, enlace de aceptación |
| `calculo` | RES060/080/093, TER100/173, SCOP, C_b, D_ACS, el CEE que manda, precio CAE, bloques |
| `expedientes` | Ciclo de vida, listado y columnas, rechazo, carpetas de Drive por estado |
| `documentos` | CIFO, fichas e impresos oficiales, Anexo I, Convenio de Cesión, hitos, rechazo y re-firma |
| `documentacion-fotos` | DocsManager, alcance documental, subida en tanda, buzón, ventanas, Anexo Fotográfico |
| `firma` | Autofirma, firma a mano con el móvil, QR, integridad de la firma |
| `instalador-rite` | Envío conjunto al instalador, re-firma del CIFO, certificado y memoria RITE |
| `placas-catalogos` | Lectura de placas, nº de serie, catálogo de aerotermia (EPREL, conjuntos) y ventanas |
| `cee` | Encargo al técnico, subida, revisión, visto bueno, presentación en el Registro, IRPF, Agente IA |
| `envolvente-ce3x` | Plano, motor, `.cex` inicial/final, medidas de mejora, croquis, CE3X 2.3/3.1, PVGIS |
| `cee-directos` | El segundo negocio: alta, encargo, entrega, oferta y factura |
| `lotes` | Verificación, OCR de sus PDF, anexos MITECO, paquete ZIP, firmados del S.O., factura |
| `seguimiento` | Parte diario, radar, enlaces de acción, envío en bloque |
| `clientes` | Fichas, propietarios y cedentes, contactos comercial/técnico, cobro y venta cruzada |
| `facturas` | OCR e incidencias de las facturas de obra, facturación del certificador |
| `whatsapp` | Sesión, entrega (ACK), adjuntos, etiquetas, agenda, bot |
| `catastro` | WAF, endpoints WCF JSON, búsqueda por coordenadas, OCR de la referencia, fachada |
| `claude-automatizacion` | Asistente por WhatsApp, llave de Claude, hooks y scripts de mantenimiento |
| `infra` | Gemini (nivel de pago), lectores con IA, servidor |
| `transversal-backend` · `transversal-frontend` | Lo que vale para cualquier ruta / cualquier pantalla |
| `general` | Estado, skills, arquitectura de ficheros, variables de entorno (solo documentos) |

## Cómo se documenta (para que esto no vuelva a crecer)

- Decisiones, lo medido y los casos: en `docs/conocimiento/<área>/<tema>.md`, un fichero por tema, con
  fecha y el porqué, como se ha hecho siempre.
- Lo que no se puede romper: además, una entrada numerada en `.claude/rules/<área>.md`
  (`node scripts/conocimiento.mjs siguiente` da el número).
- Área nueva: carpeta + regla con `paths:` + fila en la tabla de arriba.
- Aquí solo se toca el protocolo, la tabla de áreas o una regla que valga para TODO el código.
  Límite: 20 KB (un hook avisa).
- Antes del commit: `node scripts/conocimiento.mjs comprobar`.
