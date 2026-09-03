// ─────────────────────────────────────────────────────────────────────────────
// instaladorPendientes.js — QUÉ le falta al INSTALADOR de este expediente.
//
// Al instalador se le piden dos cosas distintas y en momentos distintos:
//   · el CERTIFICADO CIFO, que tiene que FIRMAR con su certificado electrónico;
//   · la LEGALIZACIÓN RITE, que tiene que REGISTRAR ante Industria y devolvernos
//     (memoria firmada + certificado tramitado).
//
// Se pedían por separado, cada uno desde su popup y con su enlace, así que al
// mismo instalador le llegaban dos mensajes distintos con dos enlaces distintos
// para dos tareas que hace del tirón. Esta es la fuente ÚNICA de:
//   1. si YA lo tenemos (para saber qué ofrecer al enviar),
//   2. cómo se llama cada cosa de cara al instalador,
//   3. el TEXTO del mensaje, que cambia según se mande uno, otro o los dos.
//
// La usan las CUATRO superficies: el popup del CIFO, el popup del RITE, la ruta
// de envío del backend y la página pública del instalador. Si esta decisión se
// duplicara, el mensaje prometería un documento que la página no pide (o al revés).
//
// Módulo ESM PURO (sin React, sin axios): el backend lo importa por import()
// dinámico, igual que hace cifoService con cifoDoc.js.
// ─────────────────────────────────────────────────────────────────────────────

const present = (v) => v != null && String(v).trim() !== '' && !String(v).includes('___');
const _ts = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

/** Cómo se llama cada tarea de cara al instalador (y de cara a nosotros). */
export const DOCS_INSTALADOR = {
    cifo: {
        key: 'cifo',
        label: 'Certificado CIFO',
        sublabel: 'Lo firmas tú con certificado',
        accion: 'firmar',
        verbo: 'firmar el Certificado CIFO',
    },
    rite: {
        key: 'rite',
        label: 'Legalización RITE',
        sublabel: 'Memoria + certificado tramitado',
        accion: 'registrar',
        verbo: 'registrar el RITE y devolvernos el certificado',
    },
};

// ─── El enlace de la Memoria RITE vive en un campo AJENO (deuda heredada) ─────
// `/memoria-rite/generate` guardaba la Memoria (Word) que generamos NOSOTROS en
// `cert_rite_drive_link`, que es justo el campo donde la subida pública deja el
// CERTIFICADO RITE que nos devuelve el instalador. Consecuencia medida: generar
// la memoria dejaba el expediente diciendo que el RITE ya estaba aportado — y esa
// misma regla es la que deja emitir el CIFO ("el CIFO no se emite sin RITE").
//
// Desde 2026-08-27 la memoria va a `memoria_rite_docx_link` y `cert_rite_drive_link`
// significa SOLO "certificado RITE aportado". Para los expedientes anteriores no
// hay forma de distinguirlos por el enlace, así que se aplica la heurística: si
// hay borrador del certificado generado y NO hay `memoria_rite_docx_link`, ese
// enlace es la memoria de antes del cambio. Ante la duda se asume que NO tenemos
// el RITE: ofrecer pedirlo de más lo corrige una persona con un clic; darlo por
// recibido de menos deja el expediente parado sin que nadie se entere.
// El script `scripts/separar_memoria_rite_de_certificado.js` deshace la ambigüedad
// mirando el NOMBRE del fichero en Drive.
//
// `cert_rite_aportado_at` MATA la heurística, y por eso va primero: lo sella quien
// archiva el certificado de su puño y letra —la subida del instalador desde su
// enlace y la del admin en Documentación—, así que ahí no hay nada que adivinar.
// Sin él, un expediente cuya Memoria se generó ANTES del 27/08/2026 (no tiene
// `memoria_rite_docx_link`, sí `borrador_cert_rite_link`) se tragaba el certificado
// recién subido: la fila seguía diciendo "Enlace" y el CIFO, que no se emite sin
// RITE, seguía bloqueado. Medido en 26RES060_127 el 03/09/2026.
export function esMemoriaRiteEnDriveLink(doc = {}) {
    if (!present(doc.cert_rite_drive_link)) return false;
    if (present(doc.cert_rite_aportado_at)) return false;
    if (present(doc.memoria_rite_docx_link)) return doc.cert_rite_drive_link === doc.memoria_rite_docx_link;
    return present(doc.borrador_cert_rite_link);
}

/** El enlace a la Memoria RITE (Word) que generamos, viva donde viva. */
export function memoriaRiteDocxLink(doc = {}) {
    if (present(doc.memoria_rite_docx_link)) return doc.memoria_rite_docx_link;
    return esMemoriaRiteEnDriveLink(doc) ? doc.cert_rite_drive_link : null;
}

/**
 * Estado de las dos tareas del instalador a partir de `expedientes.documentacion`.
 *
 * cifo.recibido  → hay CIFO firmado, NO está rechazado a la espera de corrección
 *                  y NO le hemos vuelto a pedir la firma. Un firmado rechazado no
 *                  cuenta: lo que tenemos no vale y hay que volver a pedirlo.
 * rite.recibido  → nos ha llegado el certificado tramitado o la memoria firmada
 *                  (mismo criterio que el barrido de "qué falta").
 */
export function estadoInstalador(documentacion = {}) {
    const doc = documentacion || {};

    const cifoFirmado = present(doc.cert_cifo_signed_link);
    const rechazoCifo = doc.docs_rechazados?.cert_cifo_signed_link || null;
    // Borrador obsoleto: el rechazo es posterior a la última vez que se regeneró o
    // se envió (mismo cálculo que `rechazoBorrador` en backend/utils/docValidacion).
    const cifoBloqueado = !!(rechazoCifo?.at &&
        _ts(rechazoCifo.at) > Math.max(_ts(doc.cert_cifo_sent_at), _ts(doc.cert_cifo_drive_at)));

    // ── VOLVER A PEDIR LA FIRMA (requerimiento / corrección) ──────────────────
    // Un CIFO firmado NO cierra la tarea para siempre: tras un requerimiento se
    // corrige el certificado y hay que firmarlo otra vez. Hasta ahora el firmado
    // que ya teníamos hacía `recibido: true` pasara lo que pasara, así que el
    // enlace del mensaje —el mismo `/instalador/:id` que va en ese correo— le
    // decía al instalador "¡todo recibido, no queda nada por tu parte!" y no le
    // ofrecía firmar nada. Medido en 26RES060_127 el 03/09/2026.
    //
    // `cert_cifo_refirma_at` lo sella el envío del CIFO cuando ya había un firmado
    // (POST /:id/instalador/enviar) y lo limpia la llegada del firmado nuevo. La
    // comparación con `cert_cifo_signed_at` es el cinturón por si alguna vía
    // escribe el firmado sin limpiar la marca.
    const refirmaPendiente = !!(doc.cert_cifo_refirma_at &&
        _ts(doc.cert_cifo_refirma_at) > _ts(doc.cert_cifo_signed_at));

    // El borrador se ha regenerado DESPUÉS de recibir la firma: lo que tenemos
    // firmado es una versión anterior del documento. No decide nada (hay motivos
    // legítimos para regenerar un borrador ya firmado), pero se dice: es lo que
    // explica un "me lo han firmado con la versión mal". Sin `cert_cifo_signed_at`
    // —expedientes anteriores a este sello— no se puede comparar y no se afirma.
    const firmaDesfasada = !!(cifoFirmado && doc.cert_cifo_signed_at &&
        _ts(doc.cert_cifo_drive_at) > _ts(doc.cert_cifo_signed_at));

    const memoriaRecibida = present(doc.cert_rite_signed_link);
    const certificadoRecibido = present(doc.cert_rite_drive_link) && !esMemoriaRiteEnDriveLink(doc);

    const cifo = {
        key: 'cifo',
        borrador: present(doc.cert_cifo_drive_link) ? doc.cert_cifo_drive_link : null,
        firmado: cifoFirmado ? doc.cert_cifo_signed_link : null,
        // Un CIFO rechazado sin corregir NO está recibido: hay que rehacerlo y
        // volver a pedir la firma. Tampoco lo está si se la hemos vuelto a pedir.
        recibido: cifoFirmado && !cifoBloqueado && !refirmaPendiente,
        bloqueado: cifoBloqueado,
        motivoRechazo: cifoBloqueado ? (rechazoCifo.motivo || '') : null,
        // Ya nos firmó una versión y le hemos pedido la firma otra vez.
        refirma: cifoFirmado && !cifoBloqueado && refirmaPendiente,
        refirmaAt: refirmaPendiente ? doc.cert_cifo_refirma_at : null,
        firmaDesfasada,
        signedAt: doc.cert_cifo_signed_at || null,
        sentAt: doc.cert_cifo_sent_at || null,
    };

    const rite = {
        key: 'rite',
        memoriaGenerada: !!memoriaRiteDocxLink(doc) || present(doc.borrador_cert_rite_link),
        memoriaRecibida,
        certificadoRecibido,
        recibido: memoriaRecibida || certificadoRecibido,
        sentAt: doc.borrador_cert_sent_at || null,
    };

    const pendientes = [!cifo.recibido && 'cifo', !rite.recibido && 'rite'].filter(Boolean);
    return { cifo, rite, pendientes, recibidos: ['cifo', 'rite'].filter(k => !pendientes.includes(k)) };
}

/**
 * ¿Merece la pena ofrecer el envío conjunto al abrir el popup de `doc`?
 * Solo si el OTRO documento también está pendiente. Es la comprobación que
 * dispara el aviso "tampoco tenemos lo otro".
 */
/**
 * QUIÉN firma la Memoria RITE y el Certificado de Instalación Térmica.
 *
 * ESPEJO de la cascada de `rite-generator/lib/supabase_client.py` (y hermana de
 * la del CIFO en `cifoDoc.js`): si divergieran, el popup diría un nombre y el
 * documento saldría con otro.
 *
 *   1. Técnico firmante de memorias  → firma él, con su DNI y su carné.
 *   2. Autónomo                      → firma el propio profesional.
 *   3. Representante legal distinto  → firma el representante legal.
 *   4. Si no                         → la persona de contacto de la ficha.
 *
 * El caso 4 es el único que NO está declarado por nadie: se asume. Por eso
 * devuelve `declarado: false` — la memoria se manda a firmar a nombre de quien
 * figure de persona de contacto, que puede no ser quien puede firmarla. Esa es
 * la comprobación que hay que hacer ANTES de mandársela al instalador.
 *
 * Ojo: si el instalador delega en otra empresa habilitada (`instalador_rite_id`),
 * `pres` ya es la ficha de ESA empresa (lo resuelve instaladorFirmante.js), así
 * que la cascada se aplica igual sobre quien de verdad firma.
 */
export function firmanteMemoriaRite(pres = {}) {
    const nom = (a, b) => [a, b].filter(Boolean).join(' ').trim();

    if (pres.tecnico_firmante_distinto) {
        return {
            origen: 'tecnico',
            etiqueta: 'Técnico firmante de memorias',
            nombre: nom(pres.tecnico_firmante_nombre, pres.tecnico_firmante_apellidos),
            dni: pres.tecnico_firmante_dni || '',
            carnet: pres.tecnico_firmante_carnet_rite || '',
            declarado: true,
        };
    }
    if (pres.es_autonomo) {
        return {
            origen: 'autonomo',
            etiqueta: 'Profesional autónomo',
            nombre: nom(pres.nombre_responsable, pres.apellidos_responsable),
            dni: pres.nif_responsable || '',
            carnet: pres.numero_carnet_rite || '',
            declarado: true,
        };
    }
    if (pres.representante_distinto) {
        return {
            origen: 'representante',
            etiqueta: 'Representante legal',
            nombre: nom(pres.representante_nombre, pres.representante_apellidos),
            dni: pres.representante_dni || '',
            carnet: '',
            declarado: true,
        };
    }
    return {
        origen: 'contacto',
        etiqueta: 'Persona de contacto',
        nombre: nom(pres.nombre_responsable, pres.apellidos_responsable),
        dni: pres.nif_responsable || '',
        carnet: '',
        declarado: false,
    };
}

/** ¿Se puede mandar la memoria a firmar? Falta el nombre o el DNI del firmante. */
export function firmanteIncompleto(f) {
    return !present(f?.nombre) || !present(f?.dni);
}

export function otroPendiente(documentacion, doc) {
    const est = estadoInstalador(documentacion);
    const otro = doc === 'cifo' ? 'rite' : 'cifo';
    return est.pendientes.includes(otro) ? otro : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL MENSAJE — fuente única de los tres textos (solo CIFO · solo RITE · los dos)
// ─────────────────────────────────────────────────────────────────────────────
// El asterisco es negrita tanto en WhatsApp como en nuestra plantilla de email.
// El enlace es SIEMPRE uno: `/instalador/:id` enseña las tareas que quedan. Con
// dos enlaces distintos para dos tareas de la misma obra, la mitad de los
// instaladores solo abrían el primero.

// "Otro contacto…" es el rótulo del BOTÓN, no el nombre de nadie: si se marca sin
// escribir un nombre, el saludo salía literalmente "Hola Otro,". Con un nombre que
// no lo es, se saluda en genérico.
const NOMBRE_GENERICO = /^(otro|otro contacto|contacto|destinatario)$/i;
const primerNombre = (s) => {
    const v = String(s || '').trim();
    if (!v || NOMBRE_GENERICO.test(v)) return '';
    // Se capitaliza: en la ficha los nombres se guardan en MAYÚSCULAS porque el
    // formulario las fuerza, y "Hola JAVIER," se lee como un grito. Misma regla
    // que `capitalizar`/`nombrePila` en services/recordatorios.js.
    const w = v.split(/\s+/)[0] || '';
    return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
};

/**
 * @param {object} o
 * @param {string[]} o.docs        ['cifo'] | ['rite'] | ['cifo','rite']
 * @param {string} o.saludo        nombre del/los contacto(s) marcados
 * @param {string} o.numexpte
 * @param {string} o.clienteNombre
 * @param {string} o.direccion     dirección de la INSTALACIÓN (no la del cliente)
 * @param {string} o.enlace        {origin}/instalador/{id}
 * @param {string} [o.plantilla]   'primera' | 'requerimiento' | 'correccion'
 * @param {string} [o.motivo]      motivo del rechazo (plantilla 'correccion')
 */
export function mensajeInstalador({ docs = [], saludo = '', numexpte = '', clienteNombre = '', direccion = '', enlace = '', plantilla = 'primera', motivo = '' } = {}) {
    const hola = primerNombre(saludo) || 'compañeros';
    const expteB = `*${numexpte}*`;
    const obra = `${clienteNombre ? ` de ${clienteNombre}` : ''}${direccion ? ` (instalación en ${direccion})` : ''}`;
    const cifo = docs.includes('cifo');
    const rite = docs.includes('rite');
    const firma = 'Debe firmarlo el representante legal de la empresa instaladora.';

    // Bloque del CIFO. En la plantilla de corrección explica por qué llega otra vez.
    const bloqueCifo = plantilla === 'correccion'
        ? `🖊️ *Certificado CIFO — corregido, hay que volver a firmarlo*\n`
          + `Habíamos detectado un error y lo hemos corregido por nuestra parte.\n`
          + `*Motivo de la corrección:* ${motivo || '—'}\n`
          + `La versión anterior queda anulada: la buena es la que sale en el enlace.`
        : plantilla === 'requerimiento'
            ? `🖊️ *Certificado CIFO — hay que volver a firmarlo*\n`
              + `Hemos recibido un requerimiento sobre el expediente y necesitamos la firma otra vez.`
            : `🖊️ *Certificado CIFO — para firmar*\n`
              + `Se firma en el propio enlace con tu certificado electrónico (Autofirma), sin descargar ni volver a subir nada. Nos llega firmado automáticamente.`;

    // El trabajo que le ahorramos se DICE. La memoria la preparamos nosotros: si el
    // mensaje se limita a anunciar los adjuntos, el instalador lee una tarea más y
    // no lo que ya lleva medio resuelto.
    const bloqueRite = `📄 *Legalización RITE — para registrar*\n`
        + `Para ayudaros con el papeleo, os hemos preparado la *Memoria Técnica RITE* (Word y PDF), ya rellena con los datos del proyecto, y el *Borrador del Certificado de Instalación Térmica*, listo para copiar y pegar en la plataforma de tramitación (JE6).\n`
        + `Cuando tengas la memoria firmada y el certificado tramitado, se suben en el mismo enlace.`;

    if (cifo && rite) {
        return `Hola ${hola},\n\n`
            + `Te escribimos por el expediente ${expteB}${obra}.\n`
            + `Quedan *dos cosas* pendientes por tu parte, y las dos se resuelven desde el mismo sitio:\n\n`
            + `${bloqueCifo}\n\n`
            + `${bloqueRite}\n\n`
            + `👉 *Todo aquí, en un solo enlace:*\n${enlace}\n\n`
            + `${firma} Si prefieres firmar con otra herramienta, desde ese mismo enlace puedes subir el PDF ya firmado.\n\n`
            + `Cualquier duda, aquí estamos 🤝\n\n*BROKERGY · Ingeniería Energética*`;
    }

    if (cifo) {
        return `Hola ${hola},\n\n`
            + `Te adjuntamos el *Certificado CIFO* del expediente ${expteB}${obra}.\n\n`
            + `${bloqueCifo}\n\n`
            + `👉 *Fírmalo aquí:*\n${enlace}\n\n`
            + `${firma} Si lo prefieres, desde ese mismo enlace también puedes subir el PDF ya firmado.\n\n`
            + `Un saludo,\n*BROKERGY · Ingeniería Energética*`;
    }

    return `Hola ${hola},\n\n`
        + `Desde *Brokergy* os lo ponemos fácil 🚀\n\n`
        + `Para agilizar la legalización térmica del expediente ${expteB}${obra} os adjuntamos, ya preparados con los datos del proyecto:\n\n`
        + `📄 *Memoria Técnica RITE* (Word) — prácticamente rellena: revisar y firmar.\n`
        + `📕 *Memoria Técnica RITE* (PDF) — por si no necesitáis hacer cambios.\n`
        + `📋 *Borrador del Certificado de Instalación Térmica* (PDF) — listo para *copiar y pegar* en la plataforma de tramitación (JE6).\n\n`
        + `Lo hemos rellenado por vosotros para ahorraros tiempo y evitar errores. Revisad que todo sea correcto antes de presentar.\n\n`
        + `✅ *Cuando tengáis la memoria firmada y el certificado RITE tramitado*, subidlos aquí en 1 clic:\n${enlace}\n\n`
        + `¿Cualquier duda? El equipo de Brokergy está aquí para ayudaros 💪`;
}

/** Asunto del email, coherente con el mensaje. */
export function asuntoInstalador({ docs = [], numexpte = '', clienteNombre = '', plantilla = 'primera' } = {}) {
    const cifo = docs.includes('cifo');
    const rite = docs.includes('rite');
    if (cifo && rite) return `${numexpte} — Firmar el CIFO y registrar el RITE`;
    if (cifo) {
        if (plantilla === 'correccion') return `${numexpte} - Certificado CIFO corregido: firmar de nuevo`;
        if (plantilla === 'requerimiento') return `${numexpte} - Requerimiento: firmar de nuevo el Certificado CIFO`;
        return `${numexpte} - Firmar Certificado CIFO${clienteNombre ? ` de ${clienteNombre}` : ''}`;
    }
    return `Documentación RITE — Expediente ${numexpte}`;
}

/** Enlace ÚNICO del instalador. Enseña solo las tareas que le quedan. */
export function enlaceInstalador(origin, expedienteId) {
    return `${origin}/instalador/${expedienteId}`;
}
