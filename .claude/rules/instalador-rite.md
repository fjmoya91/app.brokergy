---
paths:
  - "implementation/backend/services/rite*.js"
  - "implementation/backend/utils/{riteValidation,instaladorFirmante}.js"
  - "implementation/frontend/src/features/expedientes/logic/{instaladorPendientes,localesRite}.js"
  - "implementation/frontend/src/features/expedientes/components/{EnviarBorradorRite*,LocalesRite*,MemoriaRite*}.jsx"
  - "implementation/rite-generator/**"
---
# Instalador y RITE — envío conjunto, re-firma del CIFO, lectura del certificado RITE, memoria y estancias (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/instalador-rite/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

27.b **El Certificado RITE se LEE al subirlo**: de él salen la fecha de PRUEBAS y la de FIRMA —las que fijan el inicio y el fin de actuación del CIFO— y una comprobación del emplazamiento (dirección + referencia catastral) contra el expediente. Solo se mandan a leer las DOS PRIMERAS PÁGINAS (258 tokens/página, y estos PDF llegan con los acuses detrás): ~0,0005 € por lectura. Se rellenan HUECOS, nunca se pisa una fecha ya escrita, y el emplazamiento AVISA pero no bloquea. Fuentes únicas: [riteOcrService.js](implementation/backend/services/riteOcrService.js) (leer) y [riteCertificado.js](implementation/backend/services/riteCertificado.js) (juzgar y escribir). Ver "El Certificado RITE se LEE al subirlo".

27. **Al instalador se le pide TODO de una vez, y un CIFO firmado NO cierra la tarea para siempre**: al enviar el CIFO o la documentación RITE, la app comprueba si el otro también falta y ofrece mandarlo en el MISMO mensaje, con UN enlace (`/instalador/:id`). Reenviarle el CIFO teniendo ya uno firmado (requerimiento) **anula esa firma** (`cert_cifo_refirma_at`), o el enlace de ese mismo correo le dice "todo recibido" y no le deja firmar; la cierran la subida pública y `mergeDocumentacion`, que además sella `cert_cifo_signed_at` y **no deja retroceder ni `_drive_at` ni el propio sello de re-firma** — ese sello lo escribe un endpoint dedicado y el autoguardado siguiente lo borraba con el `null` que traía la copia hidratada (medido en 26RES060_179: el enlace de ese mismo email decía «¡TODO RECIBIDO!»). Fuente única de qué falta y de los textos: [logic/instaladorPendientes.js](implementation/frontend/src/features/expedientes/logic/instaladorPendientes.js); del envío, `POST /api/expedientes/:id/instalador/enviar`. `cert_rite_drive_link` significa CERTIFICADO RITE aportado — la Memoria que generamos nosotros vive en `memoria_rite_docx_link`. Ver "Al instalador se le pide TODO de una vez".

74. **La tabla de CARGAS TÉRMICAS de la Memoria RITE sale de las ESTANCIAS REALES, confirmadas en un popup antes de generar**: era la misma plantilla de doce estancias para todas las casas (una de 70 m² firmaba cuatro dormitorios y un vestidor). Ahora el ÚLTIMO eslabón de la cadena previa a generar (fecha de pruebas → frío → titular → **estancias**) es `LocalesRiteModal`: se abre SIEMPRE, relleno con lo guardado o con una propuesta por tamaño de vivienda y nº de plantas, y se añaden o quitan estancias POR PLANTA (y plantas); los m² se reparten solos por peso y el que se teclea se respeta. **La propuesta NO sale de `cee.num_rooms`** —la app lo rellena con 4 por defecto—. **Fuente única del nombre, la orientación y los m²**: [logic/localesRite.js](implementation/frontend/src/features/expedientes/logic/localesRite.js); se guarda ya resuelto en `documentacion.rite_locales` (`PUT /:id/memoria-rite/locales`, staffOnly, RPC de MERGE, clave en `CLAVES_PROTEGIDAS`) y el generador (`cargas_desde_locales` en `rite-generator/lib/cargas_termicas.py`) solo aplica el factor W/m² de la zona. **ELEMENTOS = ⌈potencia / 100 W⌉ solo con RADIADORES** (aluminio 600 mm a ΔT50 da 119-141 W; 100 W deja margen para la aerotermia); con suelo radiante, splits o conductos la columna va en blanco. Tope **25 estancias** (filas de la plantilla JCCM). Sin `rite_locales` (CLI, antiguos) se cae a la plantilla estimada. ⚠️ PENDIENTE: el botón «enviar al instalador para que lo complete» no está hecho. Tras tocarlo: `node implementation/backend/scripts/test_locales_rite.mjs`.

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/instalador-rite/al-instalador-se-le-pide-todo-de-una-vez.md` — Al instalador se le pide TODO de una vez (2026-08-27) · 9,0 KB
- `docs/conocimiento/instalador-rite/el-certificado-rite-se-lee-al-subirlo.md` — El Certificado RITE se LEE al subirlo (2026-09-03) · 5,5 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/instalador-rite/al-instalador-se-le-pide-todo-de-una-vez.md`
  - **REGLA — el `cert_rite_drive_link` es el CERTIFICADO RITE, no nuestra Memoria.**
  - **REGLA — nada se genera a espaldas de nadie.**
  - **REGLA — el adjunto del CIFO se DESCARGA DE DRIVE, no se vuelve a rasterizar.**
  - **REGLA — todo o nada.**
  - **REGLA — se sella la fecha de envío de CADA documento que ha viajado**
  - **REGLA — reenviarle el CIFO teniendo ya uno firmado ANULA esa firma.**
  - **REGLA — el SELLO DE RE-FIRMA tampoco retrocede, y esa es la parte que faltaba.**
  - **REGLA — el `_drive_at` NUNCA retrocede.**
  - **REGLA — "firmado" y "firmado de ESTA versión" no son lo mismo, y se dice.**
  - **REGLA — el radar cuenta la re-firma como firma pendiente.**
  - **REGLA — la superficie de cada tarea es la MISMA que la de su página suelta.**
- `docs/conocimiento/instalador-rite/el-certificado-rite-se-lee-al-subirlo.md`
  - **REGLA — solo se envían a leer las DOS PRIMERAS PÁGINAS.**
  - **REGLA — el modelo solo LEE; el juicio es del código.**
  - **REGLA — las fechas se piden como TEXTO `dd/mm/aaaa` y las convierte `aISO()`.**
  - **REGLA — se anota la ÚLTIMA de las fechas de pruebas.**
  - **REGLA — se rellenan HUECOS, nunca se pisa lo escrito.**
  - **REGLA — la comprobación del emplazamiento AVISA, no bloquea.**
  - **REGLA — lo leído viaja en el aviso al staff y se queda en el expediente.**
  - **REGLA — un slot validable DECLARA su nombre en `DOCUMENTO_VALIDABLE_LABELS`.**

<!-- generado:fin -->
