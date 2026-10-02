// ============================================================================
// revisionTecnico.js — la REVISIÓN PREVIA que ve el CERTIFICADOR al subir.
//
// El juicio es el MISMO de siempre (`revisionCee.js`, el que abre Fran con la
// lupa). Esto solo decide QUÉ PARTE de ese juicio se le enseña al técnico y con
// qué palabras, para que corrija lo suyo ANTES de que llegue a Brokergy y no
// haya ida y vuelta. El visto bueno sigue siendo de una persona.
//
// REGLA — la DEMANDA y la SUPERFICIE frente a la simulación SÍ se le enseñan
// (decisión del usuario, 2026-09-30, que revierte lo que había): de ellas sale
// el ahorro en MWh que se puede certificar, y el email del encargo ya se las da
// como «objetivo de seguridad». Pero al técnico le salen como algo que REVISAR,
// nunca como algo que «corregir» (salvo el CEE final de un RES080 cuya demanda
// no baja: ahí el certificado no recoge la obra), y con un consejo que le pide
// COMPROBAR su modelo y decirlo si la vivienda es así — no mover una cifra
// hasta que cuadre. Sin simulación detrás no se le enseña nada: no puede hacer
// nada con ello. Lo meramente informativo (cómo se estimó la caldera, los datos
// generales) sigue sin enseñarse.
//
// REGLA — al técnico se le habla en SEGUNDA PERSONA y de SU trabajo. Los textos
// de la revisión están escritos para Brokergy ("Pídeselo al certificador", "la
// app puede ponerla"); donde no le sirven, se sustituyen aquí. La evidencia
// (`dice` / `esperado`) es la misma que ve Fran, salvo la que habla del técnico
// en tercera persona (`DICE_TECNICO`).
//
// REGLA — nunca se le dice "APTO". Lo que ve es "no hemos visto nada que
// corregir": el visto bueno no es suyo ni de la máquina, y hay comprobaciones
// que él no ve.
// ============================================================================

/** Comprobaciones que el técnico NO ve (ver cabecera). */
const OCULTOS_TECNICO = new Set([
    'rendimiento',   // estacional del .xml frente a la casilla del Anexo VIII (informativo)
]);

/** Sin simulación detrás no hay objetivo que comparar: el técnico no puede hacer nada con eso. */
const OCULTOS_SIN_COMPROBAR = new Set(['demanda', 'superficie']);

/**
 * Lo que para Brokergy es un fallo y al técnico se le enseña como algo que
 * REVISAR: la demanda y la superficie por debajo de la simulada no son un
 * error suyo, son una cifra que hay que comprobar. La excepción es el CEE final
 * de un RES080 cuya demanda no baja, que sí es un certificado que no recoge la obra.
 */
const esperaQueBaje = (p) => p.id === 'demanda' && /TIENE que bajar/i.test(p.detalle || '');
function estadoTecnico(p) {
    if (p.estado === 'falla' && (p.id === 'demanda' || p.id === 'superficie') && !esperaQueBaje(p)) return 'aviso';
    return p.estado;
}

/**
 * Lo que se le dice al técnico donde el texto de la revisión está escrito para
 * Brokergy. Solo `detalle`: la evidencia no se reescribe. Un texto por ESTADO
 * cuando el consejo cambia (no es lo mismo «no hay medida» que «sin el .cex no
 * se puede mirar la medida»); una cadena suelta vale para cualquier estado que
 * no sea `ok`.
 */
const TEXTO_TECNICO = {
    xml: 'Súbelo también: es el fichero que se presenta en el Registro, y sin él no se puede revisar la demanda, las fechas ni la calificación.',
    medida: {
        falla: 'Añade en CE3X la medida de mejora con el equipo del encargo y pulsa «Actualizar» (Medidas de mejora) antes de guardar el .cex.',
        aviso: 'Si la actuación lleva equipo nuevo, añádelo como medida de mejora en CE3X y pulsa «Actualizar».',
        no_comprobable: 'Sube también el .cex: la medida de mejora solo se puede comprobar con él.',
    },
    medida_calculada: 'Abre el .cex en CE3X → Medidas de mejora → «Actualizar», y vuelve a guardarlo y subirlo.',
    medida_desfase: 'Cambiaste el edificio después de calcular la medida: vuelve a pulsar «Actualizar» en Medidas de mejora y sube el .cex otra vez.',
    generador_combustion: 'Ese tipo de generador no lo reconoce la revisión automática: lo mirará Brokergy.',
    acumulacion_acs: 'Este dato solo está en el .cex: súbelo para que se pueda comprobar.',
    anio: 'Del año de construcción salen las transmitancias y la ventilación de la guía: comprueba cuál es el bueno.',
    transmitancias: {
        aviso: 'No coinciden con la Guía de Transmitancias de Brokergy para ese año y zona. Si hay motivo (proyecto, muro de piedra, cubierta rehecha), dilo en el mensaje a Brokergy; si no, pon las de la guía.',
    },
    ventilacion: { aviso: 'No es la de la guía de Brokergy para ese año: si no hay motivo, pon la de la guía.' },
    version_ce3x: (p) => (/^CE3X 3\.1/.test(p.dice || '')
        ? 'Abre el .cex con CE3X 3.1, completa esos datos en Datos generales y vuelve a guardarlo y subirlo.'
        : 'Desde el 01/10/2026 se certifica con CE3X 3.1: ábrelo con la 3.1, completa lo que pide (Datos generales y la potencia de cada equipo), vuelve a calcular y sube el .cex y el .xml nuevos.'),
    // Del objetivo del certificado (el mismo del email del encargo).
    demanda: (p) => (esperaQueBaje(p)
        ? 'En el CEE final de un RES080 la demanda de calefacción tiene que bajar: es el ahorro de la reforma. Comprueba que el certificado recoge las mejoras de la envolvente.'
        : 'Queda por debajo de la de la simulación, y de ella sale el ahorro en MWh que se puede certificar. Comprueba que están todas las zonas calefactadas de todas las plantas y que las transmitancias y la ventilación son las de la guía. Si la vivienda es así, dilo en el mensaje a Brokergy.'),
    superficie: 'Queda por debajo de la de la simulación, y el ahorro se multiplica por ella. Comprueba que están todas las estancias habitables de todas las plantas. Si la vivienda es así, dilo en el mensaje a Brokergy.',
    combustible: {
        aviso: 'El combustible del certificado no es el que consta en el expediente, aunque son de la misma familia: comprueba cuál es el de la caldera que hay.',
        falla: 'El combustible del certificado no es el de la caldera que consta en el expediente: compruébalo en su placa o en una factura.',
    },
};

/**
 * La EVIDENCIA no se reescribe (es la misma que ve Fran), salvo donde está
 * escrita hablando del técnico en tercera persona: a él se le dice de tú.
 */
const DICE_TECNICO = {
    xml: 'has subido el .cex, pero no el .xml',
};

function textoTecnico(p) {
    if (p.estado === 'ok') return p.detalle ?? null;
    const t = TEXTO_TECNICO[p.id];
    if (typeof t === 'function') return t(p);
    if (typeof t === 'string') return t;
    if (t && t[p.estado]) return t[p.estado];
    return p.detalle ?? null;
}

const TITULO_ESTADO = { falla: 'corregir', aviso: 'revisar', no_comprobable: 'sinComprobar' };

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Un punto tal y como se le enseña al técnico: sin `accion` (es un botón de Brokergy). */
function puntoTecnico(p) {
    return {
        id: p.id,
        titulo: p.titulo,
        estado: estadoTecnico(p),
        dice: (p.estado !== 'ok' && DICE_TECNICO[p.id]) || (p.dice ?? null),
        esperado: p.esperado ?? null,
        detalle: textoTecnico(p),
    };
}

/**
 * La vista del técnico a partir de los puntos de una revisión: los del informe
 * entero (`comprobaciones`, con los correctos) o los GUARDADOS en
 * `cee.revision_{fase}` (solo los que no están en verde).
 *
 * @param {Array} puntos
 * @param {{conCorrectos?: boolean}} [o]  si la lista trae los correctos (informe
 *        entero) se cuentan; los guardados no los traen y entonces `correctos` es null.
 * @returns {{estado: 'corregir'|'revisar'|'bien', titular: string,
 *            corregir: Array, revisar: Array, sinComprobar: Array, correctos: number|null}}
 */
function vistaTecnico(puntos = [], { conCorrectos = false } = {}) {
    const visibles = (puntos || []).filter((p) => p && !OCULTOS_TECNICO.has(p.id) && p.estado !== 'info'
        && !(p.estado === 'no_comprobable' && OCULTOS_SIN_COMPROBAR.has(p.id)));
    const out = { corregir: [], revisar: [], sinComprobar: [] };
    for (const p of visibles) {
        const pt = puntoTecnico(p);
        const k = TITULO_ESTADO[pt.estado];
        if (k) out[k].push(pt);
    }
    const correctos = conCorrectos ? visibles.filter((p) => p.estado === 'ok').length : null;
    const estado = out.corregir.length ? 'corregir' : out.revisar.length ? 'revisar' : 'bien';
    const titular = estado === 'corregir'
        ? `Hay ${plural(out.corregir.length, 'cosa que corregir', 'cosas que corregir')} antes de enviarlo`
        : estado === 'revisar'
            ? `Hay ${plural(out.revisar.length, 'cosa que conviene revisar', 'cosas que conviene revisar')}`
            : 'No hemos visto nada que corregir';
    return { estado, titular, ...out, correctos };
}

/**
 * Lo que se guarda en `cee.revision_{fase}` convertido para el técnico: el
 * detalle de un expediente que abre un CERTIFICADOR lleva SU vista, no los puntos
 * de Brokergy (su veredicto, sus fallos, sus botones). Se conserva CUÁNDO y por DÓNDE
 * se revisó; el veredicto y el recuento de Brokergy, no.
 */
function guardadaParaTecnico(guardada) {
    if (!guardada || typeof guardada !== 'object') return guardada;
    return {
        at: guardada.at || null,
        origen: guardada.origen || null,
        fuentes: guardada.fuentes ? { xml: guardada.fuentes.xml || null, cex: guardada.fuentes.cex || null } : null,
        tecnico: vistaTecnico(guardada.puntos || []),
    };
}

/**
 * Una línea para el aviso a Fran (WhatsApp y email) con el veredicto COMPLETO
 * —el suyo, con lo que el técnico no ve— y los títulos de lo que falla.
 * `null` si no hay revisión.
 */
function lineaParaStaff(guardada) {
    if (!guardada?.veredicto) return null;
    const r = guardada.resumen || {};
    const fallan = (guardada.puntos || []).filter((p) => p.estado === 'falla').map((p) => p.titulo);
    const partes = [guardada.veredicto];
    if (r.fallas) partes.push(`${plural(r.fallas, 'fallo', 'fallos')}${fallan.length ? ` (${fallan.slice(0, 4).join(', ')})` : ''}`);
    if (r.avisos) partes.push(plural(r.avisos, 'aviso', 'avisos'));
    if (r.no_comprobables) partes.push(`${r.no_comprobables} sin comprobar`);
    return partes.join(' · ');
}

// ─── Freno para la ruta PÚBLICA ──────────────────────────────────────────────
// El enlace del técnico no caduca y cada revisión baja ficheros de Drive y
// llama al motor. Dentro de la ventana se devuelve la última en vez de rehacerla.
const ESPERA_MS = Number(process.env.CEE_PREREVISION_ESPERA_MS) || 20000;
const ultimas = new Map();   // `${id}:${fase}` → { t, valor }

function recienteDe(clave, ahora = Date.now()) {
    const u = ultimas.get(clave);
    return u && ahora - u.t < ESPERA_MS ? u.valor : null;
}
/** Un fichero NUEVO invalida la última: si no, subir el .cex a los pocos
 *  segundos del .xml devolvería la revisión de cuando aún no estaba. */
function olvidar(id, fase) {
    ultimas.delete(`${id}:${fase}`);
}
function recordar(clave, valor, ahora = Date.now()) {
    ultimas.set(clave, { t: ahora, valor });
    if (ultimas.size > 500) {
        for (const [k, v] of ultimas) if (ahora - v.t >= ESPERA_MS) ultimas.delete(k);
    }
}

/**
 * Revisa y GUARDA (lo ve Fran con la lupa) y devuelve la vista del técnico.
 * El `.xml` se lee del que ACABA de subir a Drive y no del de la BD: el que
 * guarda la app se escribe un instante después (lo hace el navegador), y por
 * el enlace público ni siquiera se escribe — revisar el de la BD sería
 * revisarle el fichero anterior.
 */
async function preRevisar({ id, fase = 'inicial', usuario = null, frenar = false }) {
    const clave = `${id}:${fase}`;
    if (frenar) {
        const r = recienteDe(clave);
        if (r) return r;
    }
    const { revisarYGuardar } = require('./cargarRevision');
    let out;
    try {
        out = await revisarYGuardar({ id, fase, usuario, xmlDeDrive: true, origen: 'subida' });
    } catch (e) {
        //: El texto de la ruta de Fran habla del técnico en tercera persona.
        if (e.status === 409) {
            const x = new Error(`Todavía no hay ni el .xml ni el .cex del CEE ${fase} en su carpeta: súbelos y se revisan solos.`);
            x.status = 409;
            throw x;
        }
        throw e;
    }
    const valor = {
        fase,
        at: out.guardado?.at || new Date().toISOString(),
        fuentes: { xml: out.fuentes?.xml || null, cex: out.fuentes?.cex || null, cex_error: out.fuentes?.cex_error || null },
        tecnico: vistaTecnico(out.comprobaciones, { conCorrectos: true }),
    };
    recordar(clave, valor);
    return valor;
}

module.exports = {
    OCULTOS_TECNICO,
    TEXTO_TECNICO,
    vistaTecnico,
    guardadaParaTecnico,
    lineaParaStaff,
    preRevisar,
    olvidar,
    // para las pruebas
    _freno: { recienteDe, recordar, ESPERA_MS, ultimas },
};
