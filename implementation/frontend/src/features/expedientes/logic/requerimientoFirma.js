// ─────────────────────────────────────────────────────────────────────────────
// REQUERIMIENTO — volver a pedirle al cliente la firma del Anexo I y del Convenio
// de Cesión cuando el importe de la ayuda cambia.
//
// Un requerimiento del verificador NO es un rechazo: el cliente no hizo nada mal y
// el documento que firmó tampoco tenía un error nuestro. Lo que ha pasado es que la
// cifra sobre la que firmó ya no es la que se va a tramitar, así que el convenio que
// tenemos en el expediente dice un importe distinto del que se va a solicitar, y eso
// es justo lo que compara quien lo revisa.
//
// Este fichero es la FUENTE ÚNICA de las tres cosas que hay que decir igual en todas
// partes: qué importes (el de antes y el de ahora), qué plazo, y con qué palabras se
// le cuenta. Lo consumen el popup de requerimiento (DocumentacionModule), el popup de
// envío de anexos (EnviarAnexosModal) y el aviso de la página pública de firma.
//
// REGLA — el importe nuevo sale del ahorro VERIFICADO del expediente, no de un campo
// tecleado en el mensaje. Es el mismo número con el que se le va a pagar y el que
// imprime el convenio que va adjunto: si lo escribiera a mano quien redacta el aviso,
// el mensaje y el PDF podrían decir cosas distintas y el cliente firmaría el que no
// es. Por eso `importesRequerimiento` lee `results.caeBonusVerificado`, que ya calcula
// `calculateFinancials` con las tarifas del expediente.
// ─────────────────────────────────────────────────────────────────────────────

/** Plazo estándar para contestar un requerimiento (días naturales). */
export const PLAZO_REQUERIMIENTO_DIAS = 10;

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

export const eur = (v) => {
    const n = num(v);
    return n == null ? null : `${Math.round(n).toLocaleString('es-ES', { useGrouping: true })} €`;
};

export const kwh = (v) => {
    const n = num(v);
    return n == null ? null : `${Math.round(n).toLocaleString('es-ES', { useGrouping: true })} kWh`;
};

/** Fecha límite = hoy + plazo, en días NATURALES (es como cuenta el organismo). */
export const fechaLimite = (dias = PLAZO_REQUERIMIENTO_DIAS, desde = new Date()) => {
    const d = new Date(desde);
    d.setDate(d.getDate() + (parseInt(dias, 10) || PLAZO_REQUERIMIENTO_DIAS));
    return d;
};

export const fechaLarga = (d) => {
    const f = d instanceof Date ? d : new Date(d);
    return Number.isNaN(f.getTime()) ? '' : f.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Los dos importes del requerimiento y los ahorros de los que salen.
 *
 * `anterior` es lo que decía el documento que el cliente ya firmó (el estimado del
 * expediente) y `nuevo` lo que dice el ahorro verificado. Si el expediente todavía no
 * tiene ahorro verificado registrado, `nuevo` viene a null: no se inventa, porque de
 * ese número cuelgan el convenio, el pago al cliente y lo que se le promete por
 * escrito.
 */
export function importesRequerimiento(results, opts = {}) {
    const anterior = num(opts.importeAnterior ?? results?.caeBonus);
    const nuevo = num(opts.importeNuevo ?? results?.caeBonusVerificado);
    const ahorroAnterior = num(opts.ahorroAnterior ?? results?.savingsKwh);
    const ahorroNuevo = num(opts.ahorroNuevo ?? results?.savingsKwhVerificado);
    const hayCambio = anterior != null && nuevo != null && Math.round(anterior) !== Math.round(nuevo);
    return {
        anterior, nuevo, ahorroAnterior, ahorroNuevo,
        hayCambio,
        // El sentido del cambio se dice tal cual: al cliente le importa, y esconderlo
        // cuando baja es lo que convierte un trámite en una discusión.
        baja: hayCambio && nuevo < anterior,
        sube: hayCambio && nuevo > anterior,
    };
}

/** Etiquetas de los documentos, como se nombran al cliente. */
export const DOC_LABEL = {
    anexo1: 'Anexo I — Declaración Responsable',
    cesion: 'Anexo de Cesión de Ahorros — Convenio de Cesión CAE',
};

const listaDocs = (docKeys) => (docKeys || []).map(k => `• *${DOC_LABEL[k] || k}*`).join('\n');

const nombraDocs = (docKeys) => {
    const n = (docKeys || []).map(k => (k === 'anexo1' ? 'el *Anexo I*' : 'el *Anexo de Cesión de Ahorros*'));
    if (!n.length) return 'los anexos';
    if (n.length === 1) return n[0];
    return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
};

/**
 * El mensaje que acompaña a los documentos que se vuelven a mandar.
 *
 * Dice, en este orden: qué ha pasado (requerimiento), QUÉ HEMOS HECHO con él, cómo
 * queda el expediente, qué necesitamos y en qué plazo, y que la versión anterior queda
 * anulada. Ese orden no es decorativo — es la secuencia de preguntas de quien lo lee:
 * "¿qué pasa con mi ayuda?", "¿por qué me lo mandáis otra vez si ya lo firmé?".
 *
 * REGLA — un importe que BAJA se cuenta con lo que ha costado sostenerlo. Un
 * requerimiento no es una carta que llega y se traslada: es un expediente que podía
 * decaer entero y que se ha defendido documento a documento hasta dejarlo aprobable.
 * Anunciar la cifra a secas convierte una gestión ganada en una mala noticia, y quien
 * la recibe cree que le hemos recortado la ayuda — cuando lo que se ha evitado es
 * perderla. Por eso el mensaje dice primero qué se ha hecho y termina en que el
 * expediente SIGUE ADELANTE; la cifra va dentro de esa frase, no antes.
 *
 * REGLA — eso solo se dice cuando el importe BAJA. Si sube, o si no hay cifra nueva,
 * hablar de "haberlo salvado" es adornar algo que no ha pasado: se cuenta el trabajo
 * hecho, sin más.
 */
export function mensajeRequerimiento({
    saludo = '',
    numexpte = '',
    clienteNombre = '',
    docs = ['anexo1', 'cesion'],
    importeAnterior = null,
    importeNuevo = null,
    plazoDias = PLAZO_REQUERIMIENTO_DIAS,
    limite = null,
    motivo = '',
    target = 'cliente',
    footer = '',
} = {}) {
    const dias = parseInt(plazoDias, 10) || PLAZO_REQUERIMIENTO_DIAS;
    const fLim = limite ? fechaLarga(limite) : fechaLarga(fechaLimite(dias));
    const anteriorStr = eur(importeAnterior);
    const nuevoStr = eur(importeNuevo);
    const nA = num(importeAnterior), nN = num(importeNuevo);
    const baja = nA != null && nN != null && Math.round(nN) < Math.round(nA);

    // Qué hemos hecho con el requerimiento. Es el corazón del mensaje: sin esto, lo
    // único que se lee es que la ayuda ha bajado.
    const gestion = target === 'instalador'
        ? 'Lo hemos trabajado a fondo: hemos revisado punto por punto lo que se cuestionaba y hemos defendido la actuación con la documentación del expediente.'
        : 'Nos hemos puesto con él de inmediato: hemos revisado punto por punto lo que se cuestionaba y hemos defendido la actuación con toda la documentación del expediente.';

    // Cómo queda. Sin importe nuevo no se afirma ninguna cifra: es peor anunciar un
    // número equivocado que no anunciar ninguno.
    const resultado = baja
        ? `El resultado es que *el expediente sigue adelante*: en lugar de decaer por completo, hemos conseguido ajustarlo y mantener la ayuda en *${nuevoStr}*${anteriorStr ? ` (frente a los *${anteriorStr}* previstos inicialmente)` : ''}.`
        : nuevoStr
            ? `El resultado es que *el expediente sigue adelante*, con el importe de la ayuda${anteriorStr ? ` ajustado de *${anteriorStr}* a *${nuevoStr}*` : ` fijado en *${nuevoStr}*`}.`
            : `El resultado es que *el expediente sigue adelante*, con un ajuste en la documentación presentada.`;

    const plazoTxt = `Para poder contestar en plazo (tenemos *${dias} días naturales*, hasta el *${fLim}*)`;

    if (target === 'instalador') {
        return `¡Hola${saludo ? ` ${saludo}` : ''}!\n\n`
            + `Os escribimos en relación con el expediente *${numexpte}*${clienteNombre ? ` (cliente: *${clienteNombre}*)` : ''}.\n\n`
            + `Tras la revisión del expediente hemos recibido un *requerimiento*. ${gestion} ${resultado}\n\n`
            + (motivo ? `*Qué se cuestionaba:* ${motivo}\n\n` : '')
            + `${plazoTxt}, necesitamos que el titular nos devuelva *firmados de nuevo* ${nombraDocs(docs)}, ya actualizados:\n\n`
            + `${listaDocs(docs)}\n\n`
            + `Los tenéis adjuntos. *La versión anterior queda anulada*: solo es válida la que os enviamos ahora.\n\n`
            + `Es el último paso para cerrar la contestación; de todo lo demás nos encargamos nosotros. Gracias por la ayuda.\n\n`
            + `Un saludo,\n*Brokergy · Ingeniería energética.*`
            + footer;
    }

    return `Hola ${saludo}:\n\n`
        + `Te escribimos en relación con tu expediente *${numexpte}*.\n\n`
        + `Tras la revisión del expediente hemos recibido un *requerimiento*. ${gestion} ${resultado}\n\n`
        + (motivo ? `*Qué se cuestionaba:* ${motivo}\n\n` : '')
        + `${plazoTxt}, necesitamos que nos devuelvas *firmados de nuevo* estos dos documentos, ya actualizados con el importe definitivo:\n\n`
        + `${listaDocs(docs)}\n\n`
        + `Los tienes adjuntos a este mensaje. *La versión anterior queda anulada*: solo es válida la que te enviamos ahora.\n\n`
        + `Sentimos pedirte otra firma; es lo único que necesitamos de ti para cerrar la contestación dentro del plazo. Del resto nos ocupamos nosotros.\n\n`
        + `Un saludo,\n*Brokergy · Ingeniería energética.*`
        + footer;
}

/**
 * La misma noticia en UNA línea, para el asiento del email (preheader), la página de
 * firma y el aviso previo. Vive aquí y no en cada superficie porque es exactamente el
 * punto en el que dos redacciones distintas se contradicen: una diciendo que hemos
 * salvado el expediente y otra que la ayuda ha bajado.
 */
export function tituloRequerimiento({ importeAnterior = null, importeNuevo = null } = {}) {
    const nA = num(importeAnterior), nN = num(importeNuevo);
    const baja = nA != null && nN != null && Math.round(nN) < Math.round(nA);
    if (nN == null) return 'Hemos contestado a un requerimiento y el expediente sigue adelante: necesitamos los anexos firmados de nuevo.';
    return baja
        ? `Hemos conseguido que el expediente siga adelante con la ayuda ajustada a ${eur(importeNuevo)}: necesitamos los anexos firmados de nuevo.`
        : `El expediente sigue adelante con la ayuda en ${eur(importeNuevo)}: necesitamos los anexos firmados de nuevo.`;
}

/** Asunto del email. Dice ya lo urgente: hay plazo. */
export function asuntoRequerimiento({ numexpte = '', plazoDias = PLAZO_REQUERIMIENTO_DIAS } = {}) {
    const dias = parseInt(plazoDias, 10) || PLAZO_REQUERIMIENTO_DIAS;
    return `Requerimiento expediente ${numexpte} · firma de nuevo los anexos (plazo ${dias} días)`.trim();
}

/** Resumen de una línea para el historial y para la cabecera de los popups. */
export function resumenRequerimiento({ importeAnterior, importeNuevo, plazoDias = PLAZO_REQUERIMIENTO_DIAS } = {}) {
    const a = eur(importeAnterior), n = eur(importeNuevo);
    const imp = n ? (a ? `la ayuda pasa de ${a} a ${n}` : `la ayuda queda en ${n}`) : 'cambia la documentación presentada';
    return `Requerimiento: ${imp} · plazo de ${parseInt(plazoDias, 10) || PLAZO_REQUERIMIENTO_DIAS} días`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado "pendiente de volver a firmar" en el navegador.
//
// Espejo de `refirmaPendiente` (backend/utils/docValidacion.js), que es CommonJS y no
// se puede importar desde aquí. Misma regla: un `{doc}_refirma_at` POSTERIOR al último
// firmado recibido significa que el fichero que tenemos es de una versión anterior —
// existe, pero no cuenta. Si las dos se separan, el expediente diría en pantalla lo
// contrario de lo que vigila el parte diario.
// ─────────────────────────────────────────────────────────────────────────────
export const REFIRMA_CAMPOS = {
    anexo_i_signed_link:      { refirma: 'anexo_i_refirma_at',      signedAt: 'anexo_i_signed_at',      label: 'Anexo I' },
    anexo_cesion_signed_link: { refirma: 'anexo_cesion_refirma_at', signedAt: 'anexo_cesion_signed_at', label: 'Anexo de Cesión de Ahorros' },
    cert_cifo_signed_link:    { refirma: 'cert_cifo_refirma_at',    signedAt: 'cert_cifo_signed_at',    label: 'Certificado CIFO' },
};

const ts = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

/** ¿Se ha vuelto a pedir la firma de este slot y aún no ha llegado? */
export function refirmaPendienteDoc(documentacion, field) {
    const spec = REFIRMA_CAMPOS[field];
    if (!spec) return null;
    const doc = documentacion || {};
    if (!doc[spec.refirma] || !doc[field]) return null;
    if (ts(doc[spec.refirma]) <= ts(doc[spec.signedAt])) return null;
    const req = doc.requerimiento_firma || null;
    return { field, label: spec.label, at: doc[spec.refirma], requerimiento: req };
}

/**
 * `results` con el que hay que GENERAR los anexos del cliente.
 *
 * Mientras haya una re-firma pendiente por requerimiento, el documento correcto es el
 * que lleva el importe NUEVO: es el que se le ha anunciado y el que va a firmar. Si el
 * borrador se regenerase con el estimado de siempre —basta con pulsar "Generar" en la
 * fila— machacaría en Drive el bueno, y el enlace de firma serviría otra vez el
 * documento que el requerimiento ha invalidado, sin que nadie lo note.
 */
export function resultsParaDocumento(results, documentacion, campos = ['anexo_i_signed_link', 'anexo_cesion_signed_link']) {
    const hayRefirma = campos.some(f => !!refirmaPendienteDoc(documentacion, f));
    if (!hayRefirma) return results;
    const imp = importesRequerimiento(results);
    if (imp.nuevo == null) return results;
    return { ...results, savingsKwh: imp.ahorroNuevo ?? results?.savingsKwh, caeBonus: imp.nuevo };
}

/** El requerimiento vivo del expediente (el que provocó la re-firma pendiente). */
export function requerimientoPendiente(documentacion, campos = ['anexo_i_signed_link', 'anexo_cesion_signed_link']) {
    const r = campos.map(f => refirmaPendienteDoc(documentacion, f)).find(Boolean);
    if (!r) return null;
    const req = r.requerimiento || {};
    return {
        motivo: req.motivo || '',
        plazoDias: req.plazo_dias || PLAZO_REQUERIMIENTO_DIAS,
        fechaLimite: req.fecha_limite || null,
        importeAnterior: req.importe_anterior ?? null,
        ahorroAnterior: req.ahorro_anterior_kwh ?? null,
    };
}
