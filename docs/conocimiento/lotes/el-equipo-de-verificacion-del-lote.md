<!-- conocimiento · área: lotes · las rutas de los enlaces son relativas a la raíz del repo -->

## El EQUIPO de verificación del lote: quién verifica y cómo se le contacta (2026-11-12)

Fran, 12/11/2026: «quiero saber quién es el verificador, incluso si es posible el teléfono
de contacto si aparece en algún sitio y el email de contacto también».

El Resumen del lote enseña, DENTRO de la tarjeta del Verificador, el bloque **«Equipo de
verificación»** ([EquipoVerificacion.jsx](implementation/frontend/src/features/lotes/components/EquipoVerificacion.jsx)):
el **verificador jefe** y el **revisor técnico**, cada uno con su email (enlace `mailto:`) y su
teléfono (`tel:`), y de dónde se ha leído. Con «Volver a leer» se busca otra vez. (Desde el
mismo día, en crema: ver "La ficha del lote, en crema".)

### De dónde sale (medido sobre los 19 planes de Marwen, jul.–nov. 2026)

1. **El PDF del plan de verificación** (slot `plan_verificacion`, fase 4). Su apartado «2.
   Equipo de verificación» trae al **verificador jefe con nombre, email y teléfono** y al
   **revisor técnico solo con el nombre**. Lo lee `leerPlanVerificacion`
   ([loteOcrService.js](implementation/backend/services/loteOcrService.js)), 2,8 s.
2. **El correo con el que llega** («Plan de verificacion CAE-1991 (LOTE-2026-014)», de
   cae@marwen.es): «Soy Laura Gómez Ruiz, verificador jefe…», «Correo de contacto:
   lgomez@marwen.es» y, **en copia, el email de cada miembro del equipo**. El del revisor
   técnico solo está ahí.

Lo junta `componerEquipo` de
[equipoVerificacion.js](implementation/backend/services/equipoVerificacion.js), y se guarda en
la entrada del documento: `documentos_so[plan_verificacion].equipo` = `{ verificador_jefe,
revisor_tecnico, organismo, expediente_cae, fuentes, actualizado_at }`. Identifica al papel,
como los códigos del certificado CAE. Si el lote no tenía el nº de expediente del
verificador, se rellena con el del plan.

**REGLA — un email solo se le pone a una persona si está escrito junto a ella o si su
dirección CASA con su nombre.** `psanz` es de Francisco Jesús CHARRIEL Fernández
(inicial del nombre + un apellido). Nunca se compone un email a partir de un nombre: sin
correo, el revisor se queda «sin email».

**REGLA — lo ya guardado solo rellena huecos, y no se arrastra a otra persona.** Releer el
PDF no pierde el email del revisor que trajo el correo. Pero si el plan nuevo trae OTRO
revisor (las «Adendas» cambian el equipo), el email del anterior no pasa al nuevo.

**REGLA — manda el ÚLTIMO plan.** Marwen manda «Modificación Plan de verificación_v2» y
«Adenda y nuevo Plan de Verificación_v1» cuando cambia el equipo o el alcance. De cada lote
se toma el correo más reciente, y no se contestan los «Re:».

### Cuándo se lee

- **Al subir el plan a mano** a la fase 4 (`POST /:id/documentos/plan_verificacion`).
- **«⌕ Leer del plan» / «↻ Volver a leer»** (`POST /:id/plan-verificacion/leer`, staff):
  busca el correo del plan de ESE lote en el buzón, y si no lo hay, lee el PDF ya subido.
- **Solo, desde el buzón** (`PLAN_VERIFICACION_CORREO_ENABLED=true`, cada 30 min, últimos 30
  días): el mismo buzón que los firmados del S.O. (`LOTE_SO_SMTP_*`), en solo lectura. Si el
  lote no tiene el plan, **archiva el PDF** en su carpeta de documentación como
  `4.0 Plan de verificación {LOTE}.pdf` (con `origen: correo del verificador del …`). **Nace
  APAGADO**: local escribe en producción, así que en el `.env` local no se pone. **Encendido en
  el VPS el 13/11/2026** (Fran: «sí, enciéndela»), en `implementation/backend/.env`, con copia
  previa en `.env.bak-20261113-planverif`. Un lote cuyo equipo ya salió del correo no se vuelve
  a mirar.

El plan **no mueve el estado del lote** (`estadoSegunDocs` no lo mira), así que archivarlo
no sincroniza nada más.

Relleno inicial, 12/11/2026 (`scripts/importar_planes_verificacion.js --escribir`): 19 lotes
con su equipo; en 11 se archivó además el PDF del plan, que no estaba en la app
(LOTE-2025-001, -002, -003, LOTE-2026-004, -013, -014, -016, -017, -018 y -019).

Tras tocarlo: `node implementation/backend/scripts/test_equipo_verificacion.js` y, en seco
contra el buzón, `node implementation/backend/scripts/importar_planes_verificacion.js`.
