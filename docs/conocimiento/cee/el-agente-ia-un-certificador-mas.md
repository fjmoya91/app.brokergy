<!-- conocimiento · área: cee · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## El AGENTE IA, un certificador más (2026-10-01)

Los CEE que prepara Claude con las skills (`generar-cee-inicial`, `generar-cee-final`) se perdían
de vista: se le pedían y después nadie sabía si estaban hechos o no. Ahora el agente es un
**CERTIFICADOR de la tabla de siempre** —la ficha «AGENTE IA» de `prescriptores`, marcada con
`es_agente_ia`— y recorre las mismas fases que un técnico:

```
encargado (ASIGNADO) → la skill empieza (EN_TRABAJO) → deja el .cex y AVISA (PTE_REVISION)
```

| Qué | Dónde |
|---|---|
| La ficha y la marca | `scripts/agente_ia_certificador.sql` (ya en producción: id `91693e92-…`) |
| Empezar · terminar · cola (fuente única) | [services/agenteIa.js](implementation/backend/services/agenteIa.js) |
| Lo que llaman las skills | [scripts/agente_ia.js](implementation/backend/scripts/agente_ia.js) (`cola` · `empezar` · `terminar` · `estado`) |
| Avisan solos al escribir | `cee_inicial.js aplicar --escribir` y `cee_final.js --escribir` (`--sin-aviso` lo calla) |
| Encargarlo desde la app | `EncargoAgenteIaModal` (lo elige `EncargoCertificadorModal` sin hooks de por medio) |
| En qué va, en el módulo CEE | `AgenteIaEstado` (encargado · en ello · borrador listo con su .cex) |
| Pruebas | `node implementation/backend/scripts/test_agente_ia.js` · `test_agente_ia_flujo.js` · `test_solo_asignar_cert.js` |

**REGLA — se reconoce por la MARCA, nunca por el nombre** (`esAgenteIa`, en backend y frontend):
el nombre se edita desde Prescriptores.

**REGLA — asignar al agente ES el encargo** (como el certificador de la casa, regla 80): no tiene
email ni teléfono, así que `notify-certificador` sin canales lo deja ASIGNADO y no «pendiente de
enviar», en el CAE y en los CEE directos; pedirle canales → 400. Lo que lo pone a trabajar es
pedírselo a Claude: el popup enseña la frase para copiar («Genera el CEE inicial de X») y no ofrece
mensaje, canales ni aviso al cliente (le anunciaría la llamada de un técnico que no va a llamar).

**REGLA — solo mueve la fase si el encargo es SUYO.** `empezar` pone al agente en la barra si no hay
técnico; si lo hay, NO se lo quita (le prepara el borrador) salvo `--reasignar`, que pide una
persona. Lo normal en el CEE FINAL es que el técnico del inicial siga asignado: el agente avisa y no
toca ni el técnico ni la fase. Nunca hacia atrás: no rebaja un REVISADO ni toca un REGISTRADO.

**REGLA — al terminar AVISA, como un técnico que sube su .cex**: WhatsApp (`WHATSAPP_ADMIN_CHAT`) +
email (`ADMIN_EMAIL`, buzón secundario), con el `.cex`, la carpeta, la ventana de la envolvente y lo
que queda por hacer. El aviso sale desde el PC: el WhatsApp entra en `whatsapp_queue` y lo manda el
VPS (no hace falta desplegar nada para avisar). Un fallo del aviso **nunca deshace** el `.cex`: se
dice y se reintenta con `agente_ia.js terminar`. **El email va con la identidad de marca**: el MISMO
`brandEmailShell` y las mismas piezas que «Revisión solicitada» (`componerHtml`), que `emailService`
exporta para esto — nunca un diseño propio, que es el que se queda atrás al tocar la marca. Su acción
principal es **abrir la carpeta LOCAL del CEE** (`1. CEE / CEE INICIAL`, donde está el `.cex` para
CE3X): `GET /api/expedientes/:id/open-local-folder?folder=` con la firma HMAC de **id + carpeta**
([utils/carpetaLocalEnlace.js](implementation/backend/utils/carpetaLocalEnlace.js)), así que no se le
puede cambiar la carpeta al enlace y vale para los tres negocios; sin `folder`, la raíz del expediente
como siempre (los enlaces ya enviados siguen valiendo).

**REGLA — el agente NO FIRMA**: `tecnicoCe3x` devuelve null con él (el `.cex` va sin técnico y la ficha
lo dice), el radar no le «reclama» nada (bloque propio `AGENTE_IA`, pelota de BROKERGY, sin botón de
envío; con el visto bueno dado, «asigna el técnico que lo registra») y el popup del visto bueno avisa
en ámbar. `sugerirCertificadores` no lo ofrece.

**REGLA — el sello `cee.agente_ia[fase]`** (`estado`, `empezado_at`, `terminado_at`, `fichero`,
`fichero_link`, `carpeta_link`, `delAgente`) lo escribe SOLO la skill (RPC `set_*_cee_field`), y los
dos PUT lo PRESERVAN — la ficha abierta reenvía `cee` desde su copia y se lo llevaría por delante.

⚠️ El `TecnicoPicker` del MÓVIL usaba `permiteVaciar` sin recibirlo y la hoja se caía al abrirla;
corregido de paso.
