<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## El visto bueno de BROKERGY, dado en la envolvente: listo para firmar (2026-10-30)

Fran, probando 2026EXT_3 (el encargo de 26RES060_254): «¿Cómo podemos solucionar esto? Para que una
vez que le demos el visto bueno, directamente se genere listo para firmar y lo podamos firmar desde
CEE».

### Lo que pasaba

Sobre el mismo certificado había tres pasos seguidos:

1. el PC lo calificaba y al equipo le llegaba «✅ CEE listo para revisar»: había que abrir el admin y
   pulsar **«Entregar»**;
2. el certificador lo firmaba en la app;
3. en un encargo del CRM, firmar mandaba los ficheros al expediente con `notify-review`: **otra
   revisión** en el CRM de un certificado que ya se había mirado en la envolvente.

### Lo que hay ahora — [vistoBueno.js](implementation/backend/services/certapp/vistoBueno.js)

En la ventana de la envolvente de una obra de la app (`?origen=ext`), panel «Generar el .cex», el
EQUIPO tiene el botón **«✓ Visto bueno: listo para firmar»**
([PanelesFicha.jsx](implementation/frontend/src/features/cee-envolvente/components/PanelesFicha.jsx),
`VistoBuenoCex`). Un clic:

1. Si lo que se ve no es lo generado (no hay `.cex`, la huella de la vista no es la del sello, o el
   `.cex` de Drive se guardó a mano o falta), **se genera antes** (`generarCex`, sin el popup de
   «generado»). Si hay preguntas previas o el tipo de edificio sin confirmar, se preguntan y se vuelve
   a pulsar.
2. `POST /api/cee-envolvente/:id/visto-bueno?origen=ext` con la huella de lo que se ve
   (`vistoBueno.dar`):
   - **calificado por CE3X** → se entrega ya (`entrega.entregar(…, { vistoBueno: true, reabrir:
     true })`): obra LISTO, carpeta compartida y aviso al certificador **«Tu certificado … está listo
     para firmar»** («lleva ya el visto bueno de BROKERGY: solo falta que lo firmes»);
   - **por calificar** (lo normal tras generar) → se encarga al PC (`encargarCalificarExt`, la cola
     de siempre; si ya estaba, no se duplica) y, al terminar, **se entrega solo**:
     `/interno/calificada` → `terminarExt` → `entrega.alTerminarIa` → `vistoBueno.alCalificar`. El
     WhatsApp de «listo para revisar» al equipo no sale (ya lo sabe quien lo dio); el email con el
     detalle, sí;
   - **ya firmada esa misma versión** (VALIDADO con la firma posterior al sello) → no se reabre: el
     visto bueno pasa directamente al expediente del CRM (`crm.vistoBuenoAlCrmAsync`).
3. La ventana enseña el estado (`estado-cex` trae `visto_bueno`): dado y por quién (quién, solo al
   equipo), calculándose con CE3X (se vuelve a mirar cada 30 s), entregado, o anulado.

Se guarda en `cee.visto_bueno` de la obra por la RPC de clave (regla 19): `{ at, por, huella,
sello_at, esperando_pc, entregado_at, firmado, anulado_at, anulado_motivo }`. Eventos de la obra:
`VISTO_BUENO`, `VISTO_BUENO_ANULADO` y la `ENTREGA` «con el visto bueno de BROKERGY, listo para
firmar».

**REGLA — el visto bueno lo da el EQUIPO.** La ruta exige `isStaff` (un certificador de la app pasa
el guardián `internoOExtSuyo` por ser su obra, pero aquí recibe 403 `SOLO_EQUIPO`) y solo vale en
`ext` (en el CRM es «Validar»: 400 `SOLO_EXT`).

**REGLA — vale para UNA receta.** Se da sobre el `.cex` sellado (`cee.cex_sello.inicial`) y su
huella: si lo que se ve no es lo generado, 409 `DESFASADO` (la ventana genera antes). Volver a generar
con OTRA receta —desde la ventana o con la skill— lo **anula** al sellar (`cex.sellar` →
`anularSiOtraReceta`; la ventana lo dice en sus avisos y al certificador le queda el evento). La
calificación del PC no lo anula: califica la misma receta, y con la 2.ª medida FV vuelve a medir las
placas y la huella cambia; por eso `vigente` la acepta **solo si el visto bueno la esperaba**
(`esperando_pc`) y es posterior a él.

**REGLA — una versión nueva se firma de nuevo.** Con el visto bueno, una obra VALIDADO se reabre a
LISTO (`reabrir`, `validado_at` a null): la firma anterior era de otro PDF y `elegirFicheros` ya no la
ofrece. `/interno/calificada` deja pasar una VALIDADO solo con el visto bueno vigente; sin él, como
antes, no se avisa.

### Al firmar un encargo del CRM — [crm.js](implementation/backend/services/certapp/crm.js)

`enviarCeeAsync` sube como siempre el PDF firmado, el `.xml` y el `.cex` al expediente, y luego:

- **con el visto bueno vigente y calificado** (`vistoBueno.listoParaFirmar`) → `aprobarEnCrm`:
  `POST /api/expedientes/:id/approve-cee` (o `/api/cee-directos/:id/approve-cee`) con la **clave
  interna** y `{ sendEmail: false, sendWhatsApp: false, adjuntarBorrador: false,
  guardarBorradorDrive: true }`: el visto bueno de «Validar» **sin aviso** (REVISADO, historial con
  la nota «Visto bueno dado en la app de certificadores…», borrador de presentación en Drive y, con
  el certificador de la casa, los nombres definitivos, regla 173). Y el XML firmado se **carga** en
  el expediente (`cargarXmlEnApp` con `forzar`: lo que se firma manda, regla 152). Evento
  `CRM_ENVIADO` «Enviado a BROKERGY, con su visto bueno»;
- **sin él** → `notify-review`, la revisión de siempre.

Para eso las dos rutas `approve-cee` pasan de `staffOnly` a **`staffOClaveInterna`** (y la del CAE
está en `PUBLIC_EXPEDIENTE_ROUTES` para que el guardián del router la deje a su middleware propio).
Un técnico de fuera conserva sus nombres y presenta él (`aCanonico` → `ajeno`).

### Pruebas

- `node implementation/backend/scripts/test_certapp_visto_bueno.js` (37): cuándo vale, `dar` en cada
  estado, la entrega al calificar, la anulación por otra receta (ventana y skill, no el PC), la ruta
  (equipo sí, certificador no, CRM no) y el approve-cee sin aviso con la clave interna.
- Además, las de siempre: `test_certapp_unidad.js`, `test_certapp_rutas.js`, `test_origen_ext.mjs`,
  `test_receta_cex.mjs`, `test_canonico_visto_bueno.js`, `auditar_rutas_sin_guardian.js`.
