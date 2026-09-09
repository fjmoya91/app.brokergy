// ─── recordatorios — los TEXTOS que propone la página de acción del parte diario
//
// Este módulo NO envía nada: redacta. El envío lo siguen haciendo las rutas de
// siempre (`notify-certificador`, `solicitar-faltantes`), que son las que además
// sellan el seguimiento y el historial. Aquí solo vive el texto, por dos motivos:
//
//  1. La página de acción tiene que ENSEÑAR el mensaje antes de mandarlo (es
//     editable), así que necesita el borrador por adelantado.
//  2. Ese borrador tiene que ser EL MISMO que manda la app cuando escribes desde el
//     expediente. Si aquí se redactara aparte, el certificador recibiría dos textos
//     distintos según por dónde le hayas escrito. Por eso `notify-certificador`
//     importa de aquí sus plantillas en vez de tenerlas escritas dentro.

const FIRMA = '*BROKERGY · Ingeniería Energética*';

// ESPEJO de frontend/src/utils/nombres.js. Está duplicado a propósito: este
// módulo es CJS y no tiene ninguna dependencia, que es lo que permite cargarlo
// desde cualquier sitio del backend.

// Partículas en minúscula dentro del nombre ("José de la Torre").
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'van', 'von']);
// Los apellidos con guion llevan las DOS mayúsculas ("Sánchez-Carrillejo").
const mayusInicial = (w) => w.split('-')
    .map(t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)).join('-');

/** Nombre propio en bonito: "JOSE ANTONIO PEREZ" → "Jose Antonio Perez". */
const capitalizar = (s) => (s || '').toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && PARTICULAS.has(w)) ? w : mayusInicial(w)).join(' ');

// Formas societarias: si las lleva, es una EMPRESA y basta la primera palabra.
const SOCIETARIO = /(^|[\s,.])(s\.?\s?l\.?\s?u?|s\.?\s?a\.?\s?u?|s\.?\s?c\.?\s?p?|c\.?\s?b|s\.?\s?coop|slne?|sll)\.?\s*$/i;

/**
 * Nombre para el saludo. Un "¡Hola INSTALACIONES GARCIA SL!" suena a robot, así
 * que de una empresa se toma la primera palabra ("Instalaciones"). El nombre de
 * una PERSONA no se corta: "MARIA JOSÉ" saludada como "Maria" es otra persona, y
 * los compuestos son mayoría aquí.
 */
const nombreSaludo = (s) => {
    const v = (s || '').trim();
    if (!v) return '';
    if (SOCIETARIO.test(v)) return capitalizar(v.split(/\s+/)[0].replace(/,$/, ''));
    return capitalizar(v);
};

/** Solo el primer nombre (donde el texto pida tuteo corto). */
const nombrePila = (s) => {
    const first = (s || '').trim().split(/\s+/)[0] || '';
    return first ? capitalizar(first.replace(/,$/, '')) : '';
};

/**
 * Limpia la dirección de la obra para meterla en un mensaje.
 * Viene compuesta por tramos (calle, CP + municipio, provincia) y en las capitales
 * el municipio y la provincia son lo mismo: "AV PUENTE DE RETAMA 16, 13002 CIUDAD
 * REAL, (CIUDAD REAL)". También llega a veces el código INE entre paréntesis.
 */
const direccionLimpia = (dir) => {
    let d = String(dir || '').trim();
    if (!d) return '';
    d = d.replace(/,?\s*\(\d+\)\s*$/, '');                       // código INE final
    const m = d.match(/^(.*),\s*\(([^)]+)\)\s*$/);               // provincia final
    if (m) {
        const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
        if (norm(m[1]).endsWith(norm(m[2]))) d = m[1].trim();     // ya la nombra el municipio
        else d = `${m[1].trim()} (${m[2].trim()})`;
    }
    return d.replace(/\s*,\s*$/, '').trim();
};

// ─── Certificador ─────────────────────────────────────────────────────────────
//
// REGLA — al certificador se le escribe COMO A UN COMPAÑERO, no como a un cliente.
// Es un profesional con el que se habla cada semana, que tiene tu número y sabe
// perfectamente quién le escribe. De ahí las tres diferencias con el resto de
// plantillas, y ninguna es cosmética:
//
//  · **Se le saluda por su nombre y con coma**: "Hola Luis Alberto," y no
//    "¡Hola *LUIS ALBERTO LANUZA PELAYO*!". Un saludo en negrita con la razón social
//    entera es lo primero que delata que el mensaje lo ha escrito una máquina.
//  · **Se le dice POR QUÉ**, no solo qué. "Hasta que no estén registrados no puedo
//    avanzar con esos expedientes" es lo que mueve a alguien a sacar un hueco; un
//    aviso de estado ("sigue pendiente de registrar") no mueve nada.
//  · **Va en PRIMERA PERSONA**, porque quien pide el favor es una persona concreta.
//    La FIRMA se mantiene igual que en el resto de mensajes ("¡Gracias!" + membrete):
//    se probó a quitarla por sonar a notificación del sistema y se descartó — deja
//    claro de parte de quién va, y es la despedida de siempre en toda la app.
//
// Se pide en tono de FAVOR ("cuando tengas un hueco", "¿me registras…?") a propósito:
// no le estamos reclamando un incumplimiento, le estamos pidiendo que priorice.

/**
 * Recordatorio de REGISTRO: ya tiene nuestro visto bueno y falta que lo presente en
 * Industria. Lleva SIEMPRE el enlace de subida del CEE registrado, porque subirlo es
 * exactamente la acción que le estamos pidiendo.
 */
function certRegistroWa({ certName, phaseLabel, expedienteNum, clienteName, adminMsgWa = '', subirWa = '' }) {
    return `Hola ${certName},\n\nCuando tengas un hueco, ¿me registras en Industria el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${capitalizar(clienteName)})` : ''}? Ya tiene el visto bueno, y hasta que no esté registrado no puedo avanzar con él.\n\nCuando lo presentes, súbeme la etiqueta y el justificante de registro.${adminMsgWa}${subirWa}\n\n¡Gracias!\n${FIRMA}`;
}

/** Recordatorio de EMISIÓN: se le encargó el CEE y todavía no lo ha entregado. */
function certEmisionWa({ certName, phaseLabel, expedienteNum, clienteName, adminMsgWa = '', ceeFolderLink = null, portalLink = null }) {
    // Los enlaces son OPCIONALES: sin ellos, concatenar sus saltos de línea dejaba
    // un hueco en blanco antes del "Gracias" que se ve como un mensaje mal cortado.
    const enlaces = `${ceeFolderLink ? `\n📁 Carpeta: ${ceeFolderLink}` : ''}${portalLink ? `\n🔗 Portal: ${portalLink}` : ''}`;
    return `Hola ${certName},\n\n¿Cómo va el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${capitalizar(clienteName)})` : ''}? Lo tienes encargado y aún no me ha llegado.\n\nSi me dices una fecha aproximada, lo cuadro con el cliente.${adminMsgWa}${enlaces ? `\n${enlaces}` : ''}\n\n¡Gracias!\n${FIRMA}`;
}

// ─── Cliente / instalador ─────────────────────────────────────────────────────

/**
 * Bloque con lo que falta por su parte, sacado de las ACCIONES que calcula
 * `buildSolicitudAcciones` (GET /solicitud-info). Cada acción trae su enlace público
 * correcto — firmar anexos, subir RITE, subir fotos con solo los slots pendientes —,
 * así que no se inventa ninguna URL aquí.
 *
 * `relay` = el mensaje va al instalador pero habla de cosas del cliente: entonces se
 * usa la redacción en tercera persona que ya trae cada acción.
 */
function bloqueAcciones(acciones, { relay = false } = {}) {
    if (!acciones?.length) return '';
    return acciones.map(a => {
        const titulo = (relay && a.tituloRelay) || a.titulo;
        const nota = (relay && a.notaRelay) || a.nota;
        const items = (a.items || []).map(i => `   · ${i}`).join('\n');
        return `📌 *${titulo}*\n${items}${items ? '\n' : ''}${nota ? `   _${nota}_\n` : ''}   ${a.url}`;
    }).join('\n\n');
}

/**
 * "¿Cómo va la obra?" — el CEE inicial está registrado desde hace tiempo y no hay
 * ninguna señal de que la obra se haya hecho.
 *
 * El mensaje NO es solo la pregunta: lleva enganchado lo que falta por su parte y el
 * enlace donde subirlo. Preguntar a secas obliga a un segundo mensaje con las
 * instrucciones, y ese segundo mensaje casi nunca se manda.
 */
function finObraMsg({ destinatario, esInstalador, numExp, obra, dias, acciones, uploadBase }) {
    const hola = nombreSaludo(destinatario) ? `¡Hola ${nombreSaludo(destinatario)}!` : '¡Hola!';
    const dir = direccionLimpia(obra?.direccion);
    const laObra = esInstalador && (obra?.cliente || dir)
        ? `la obra de *${capitalizar(obra.cliente) || 'tu cliente'}*${dir ? ` (${dir})` : ''}`
        : 'tu instalación';

    const pendiente = bloqueAcciones(acciones, { relay: esInstalador });
    const fotos = uploadBase
        ? `\n\n📸 Las fotos de la instalación terminada se suben aquí:\n${uploadBase}`
        : '';

    return `${hola}\n\nTe escribimos por ${laObra} (expediente *${numExp}*).\n\nHace ya *${dias} días* que tenemos registrado el certificado energético inicial y aún no nos consta que la obra esté terminada. ¿Cómo va? ¿Nos puedes decir una fecha aproximada?\n\n*Cuando la termines necesitamos, para tramitar la ayuda:*\n· Las *fotos de la instalación terminada* (equipo instalado, placa de características y unidad interior).\n· La *factura* de la obra.${pendiente ? `\n\n*Además, sigue pendiente por tu parte:*\n\n${pendiente}` : ''}${fotos}\n\nEn esa misma página, cuando esté todo, tienes el botón *"He terminado la obra"* para avisarnos de un clic.\n\n¡Gracias!\n${FIRMA}`;
}

/**
 * "Te falta firmar" — uno o varios documentos salieron a firma y no han vuelto.
 * El enlace es el público de firma, que sirve el borrador vigente de Drive y presenta
 * de una vez todo lo que ese firmante tenga pendiente.
 *
 * `docs` es una LISTA a propósito: al cliente le suelen faltar el Anexo I y la Cesión
 * a la vez. El texto anterior hablaba de un documento y añadía "es el único que nos
 * falta" — con dos pendientes eso era sencillamente falso, y obligaba a un segundo
 * mensaje que se contradecía con el primero.
 */
function firmaMsg({ destinatario, docs = [], numExp, obra, dias, url, esInstalador }) {
    const hola = nombreSaludo(destinatario) ? `¡Hola ${nombreSaludo(destinatario)}!` : '¡Hola!';
    const dir = direccionLimpia(obra?.direccion);
    const laObra = esInstalador && (obra?.cliente || dir)
        ? ` de la obra de *${capitalizar(obra.cliente) || 'tu cliente'}*${dir ? ` (${dir})` : ''}`
        : '';

    const lista = docs.map(d => `· *${d}*`).join('\n');
    const varios = docs.length > 1;
    const cabecera = varios
        ? `Te recordamos que estos documentos del expediente *${numExp}*${laObra} siguen *pendientes de tu firma* (el más antiguo, desde hace ${dias} días):\n\n${lista}`
        : `Te recordamos que el *${docs[0] || 'documento'}* del expediente *${numExp}*${laObra} sigue *pendiente de tu firma* desde hace ${dias} días.`;

    return `${hola}\n\n${cabecera}\n\nEs lo que nos falta para poder seguir con la tramitación de la ayuda.\n\n✍️ ${varios ? 'Fírmalos' : 'Fírmalo'} aquí (se ${varios ? 'hacen' : 'hace'} en 2 minutos desde el móvil):\n${url}\n\nSi tienes cualquier duda, respóndenos por aquí mismo.\n\n¡Gracias!\n${FIRMA}`;
}

// ─── Cliente: le hemos encargado su certificado ───────────────────────────────
//
// REGLA — encargar el CEE es el primer movimiento VISIBLE del expediente, y hasta
// ahora el cliente no se enteraba. Firma la propuesta, se le crea el expediente y
// pasan semanas en las que, desde fuera, no ocurre nada: la primera noticia que
// recibe es la llamada de un técnico que no sabe quién es. Este mensaje sale a la
// vez que el encargo al certificador y cierra ese hueco.
//
// REGLA — no se promete fecha. Depende de la agenda del técnico y de Industria;
// una fecha aquí es una reclamación garantizada dentro de dos semanas. Lo que sí
// se promete —y se cumple— es el AVISO cuando quede registrado.
//
// REGLA — el aviso de "no empieces la obra todavía" solo sale si la obra NO está
// hecha. Las facturas anteriores al registro del CEE inicial son una incidencia
// (facturaIncidencias · FECHA), así que decírselo AHORA le ahorra el problema; pero
// decírselo a quien ya ha terminado es echarle en cara algo que no puede deshacer.

/**
 * @param {object} p
 * @param {string} p.destinatario  nombre del contacto de notificaciones del cliente
 * @param {string} p.numExp
 * @param {'inicial'|'final'} p.fase
 * @param {boolean} [p.obraHecha]  hay factura, CIFO, RITE o fin de obra comunicado
 */
function encargoCeeClienteMsg({ destinatario, numExp, fase, obraHecha = false }) {
    const hola = nombreSaludo(destinatario) ? `¡Hola ${nombreSaludo(destinatario)}!` : '¡Hola!';
    const exp = `*${numExp}*`;

    if (fase === 'final') {
        return `${hola}\n\nYa hemos encargado el *certificado de eficiencia energética final* de tu vivienda (expediente ${exp}): el que recoge la instalación ya terminada y con el que se justifica el ahorro conseguido.\n\nHemos asignado al *técnico certificador* y le hemos enviado toda la documentación de la obra junto con las instrucciones para emitirlo. Se pondrá en contacto contigo para la visita final.\n\nEn cuanto esté registrado te avisamos por aquí. Por tu parte no hace falta nada más de momento.\n\n¡Gracias!\n${FIRMA}`;
    }

    const aviso = obraHecha
        ? ''
        : `\n\n⚠️ *Importante:* no empieces la obra hasta que ese certificado esté registrado. Las facturas de la instalación tienen que ser posteriores a esa fecha; si son anteriores, la ayuda no se puede tramitar.`;

    return `${hola}\n\nYa hemos puesto en marcha tu expediente ${exp}.\n\nHemos asignado al *técnico certificador* y le hemos enviado tu documentación junto con las instrucciones para que emita el *certificado de eficiencia energética inicial* de tu vivienda. Es el primer paso del trámite y se hace sobre la situación de partida, antes de la reforma.\n\nEl técnico se pondrá en contacto contigo para concertar la visita.${aviso}\n\nEn cuanto quede registrado te avisamos por aquí. Por tu parte no tienes que hacer nada más de momento.\n\n¡Gracias!\n${FIRMA}`;
}

// ─── Mensajes de LOTE: un destinatario, varios expedientes ────────────────────
//
// Un certificador con cuatro CEE sin registrar no necesita cuatro mensajes idénticos
// con un número distinto cada uno. Necesita uno con la lista: es más fácil de
// responder, más fácil de trabajar contra ella y deja de invitar a que conteste solo
// al último.
//
// El bloque de la lista es común a todos los tipos; lo que cambia es el encabezado.

/** `items`: [{ numExp, cliente, detalle?, dias?, url?, urlLabel? }] */
function listaExpedientes(items) {
    return items.map(i => {
        const cab = `• *${i.numExp}*${i.cliente ? ` — ${capitalizar(i.cliente)}` : ''}`;
        // La antigüedad se OMITE cuando es de hoy: "0 días" no dice nada, y decirle a
        // alguien que le reclamas algo que le pediste esta mañana resta urgencia a
        // todo lo demás de la lista. Pasa desde que se pueden añadir a mano los que
        // aún están en plazo.
        const det = [i.detalle, i.dias ? `${i.dias} ${i.dias === 1 ? 'día' : 'días'}` : null].filter(Boolean).join(' · ');
        const url = i.url ? `\n  ${i.urlLabel ? i.urlLabel + ' ' : ''}${i.url}` : '';
        return `${cab}${det ? `\n  _${det}_` : ''}${url}`;
    }).join('\n\n');
}

const plural = (n, sing, pl) => (n === 1 ? sing : pl);

/**
 * Varios CEE con visto bueno y sin registrar, del mismo certificador.
 * Mismo tono que `certRegistroWa` (ver la regla del bloque "Certificador"): se pide
 * el favor, se explica qué bloquea, y la lista va al final con su enlace por línea.
 */
function certRegistroLoteWa({ certName, items }) {
    const n = items.length;
    return `Hola ${certName},\n\nCuando tengas un hueco, ¿me registras en Industria ${plural(n, 'este certificado', `estos ${n} certificados`)}? Ya ${plural(n, 'tiene', 'tienen')} el visto bueno, y hasta que no ${plural(n, 'esté registrado', 'estén registrados')} no puedo avanzar con ${plural(n, 'ese expediente', 'esos expedientes')}.\n\n${listaExpedientes(items)}\n\nCuando ${plural(n, 'lo presentes', 'los presentes')}, súbeme la etiqueta y el justificante ${plural(n, 'en ese mismo enlace', 'en el enlace de cada uno')}.\n\n¡Gracias!\n${FIRMA}`;
}

/** Varios encargos del mismo certificador sin entregar. */
function certEmisionLoteWa({ certName, items }) {
    const n = items.length;
    return `Hola ${certName},\n\n¿Cómo ${plural(n, 'va este certificado', `van estos ${n} certificados`)}? ${plural(n, 'Lo tienes encargado', 'Los tienes encargados')} y aún no me ${plural(n, 'ha', 'han')} llegado:\n\n${listaExpedientes(items)}\n\nSi me dices una fecha aproximada, lo cuadro con ${plural(n, 'el cliente', 'los clientes')}.\n\n¡Gracias!\n${FIRMA}`;
}

/** Varias obras del mismo instalador sin terminar. */
function finObraLoteWa({ destinatario, items }) {
    const hola = nombreSaludo(destinatario) ? `¡Hola ${nombreSaludo(destinatario)}!` : '¡Hola!';
    const n = items.length;
    return `${hola}\n\nTenemos *${n} ${plural(n, 'obra tuya', 'obras tuyas')}* con el certificado energético inicial registrado desde hace tiempo y sin constancia de que ${plural(n, 'esté terminada', 'estén terminadas')}:\n\n${listaExpedientes(items)}\n\n¿Cómo ${plural(n, 'va', 'van')}? ¿Nos puedes decir fechas aproximadas?\n\n*De cada una necesitamos, para tramitar la ayuda:*\n· Las *fotos de la instalación terminada* (equipo, placa de características y unidad interior).\n· La *factura* de la obra.\n\nEn el enlace de cada obra puedes subirlo todo y avisarnos con el botón *"He terminado la obra"*.\n\n¡Gracias!\n${FIRMA}`;
}

/** Varios documentos sin firmar, del mismo firmante, en varios expedientes. */
function firmaLoteWa({ destinatario, items, esInstalador }) {
    const hola = nombreSaludo(destinatario) ? `¡Hola ${nombreSaludo(destinatario)}!` : '¡Hola!';
    const n = items.length;
    return `${hola}\n\nTienes documentación *pendiente de firma* en *${n} ${plural(n, 'expediente', 'expedientes')}*${esInstalador ? '' : ''}:\n\n${listaExpedientes(items)}\n\nEs lo que nos falta para poder seguir con la tramitación. Se firma en 2 minutos desde el móvil, en el enlace de cada uno.\n\n¡Gracias!\n${FIRMA}`;
}


/**
 * Confirmación de datos de cobro. Es el mensaje MÁS agradable que le mandamos a
 * un cliente en todo el expediente, así que empieza por la noticia y no por lo
 * que le pedimos: quien lee "tenemos que pedirte una cosa" no llega al final.
 *
 * REGLA — no se promete fecha de ingreso. Depende del pago del Sujeto Obligado;
 * una fecha aquí es una reclamación garantizada dentro de dos semanas.
 */
function cobroLoteWa({ destinatario, items }) {
    const hola = nombreSaludo(destinatario) ? `¡Hola ${nombreSaludo(destinatario)}!` : '¡Hola!';
    const n = items.length;
    const cuerpo = n === 1
        ? `¡Buenas noticias! Ya tenemos concedida la ayuda de tu instalación y estamos preparando el ingreso.`
        : `¡Buenas noticias! Ya tenemos concedidas las ayudas de *${n} instalaciones tuyas* y estamos preparando los ingresos.`;
    return `${hola}\n\n${cuerpo}\n\nAntes de hacer la transferencia necesitamos que *confirmes tus datos de cobro* — sobre todo el número de cuenta, para que el dinero no acabe donde no debe:\n\n${listaExpedientes(items)}\n\nTe llevará menos de un minuto: lo verás casi todo relleno. De paso te hacemos un par de preguntas rápidas por si podemos ahorrarte algo más (la tarifa de la luz suele quedarse desajustada después de poner aerotermia); son opcionales.\n\n¡Gracias!\n${FIRMA}`;
}

module.exports = {
    certRegistroWa, certEmisionWa, encargoCeeClienteMsg,
    finObraMsg, firmaMsg, bloqueAcciones,
    certRegistroLoteWa, certEmisionLoteWa, finObraLoteWa, firmaLoteWa, cobroLoteWa, listaExpedientes,
    capitalizar, nombrePila, nombreSaludo, direccionLimpia, FIRMA,
};
