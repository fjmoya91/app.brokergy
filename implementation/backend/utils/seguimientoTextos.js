// ============================================================================
// seguimientoTextos.js — LO QUE SE LE DICE en cada toque del seguimiento
// (fuente única, sin IA; puro: se prueba sin red).
//
// Fran (15/11/2026): «los mensajes deben ser cordiales, nada pesado, pero para
// que vean que nos preocupamos y que es importante que el CEE inicial se quede
// registrado antes de las facturas». Así que:
//   · de tú, por el nombre de pila, sin emojis y sin disculparse (feedback de
//     Fran: los WhatsApp que no son plantilla de la app, sin emojis);
//   · corto, con UNA pregunta clara y, si hace falta, UN enlace por obra;
//   · siempre una salida fácil («si no es el momento, dímelo», «si ya lo has
//     mandado por otro lado, dímelo y lo busco»), que es lo que más se contesta;
//   · al INSTALADOR, de qué cliente y de qué pueblo es, y varias obras en UN
//     mensaje (35 instaladores tenían 86 propuestas abiertas el 15/11/2026);
//   · el enlace lo pone el CÓDIGO, nunca un modelo.
// ============================================================================

const { FIRMA, nombreSaludo, nombrePila, capitalizar } = require('../services/recordatorios');

const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long' }) : null);

/** «Hola Ana, ¿qué tal?» — nombre de pila de una persona; una empresa sin persona, «Hola, ¿qué tal?». */
function hola(nombre) {
    const completo = nombreSaludo(nombre || '');
    if (!completo) return 'Hola, ¿qué tal?';
    const n = completo.split(/\s+/).length >= 3 ? nombrePila(completo) : completo;
    return `Hola ${n}, ¿qué tal?`;
}

/**
 * El cliente de una obra para el instalador: «Cristóbal Delgado (La Solana)». `it.ref`: no hay
 * ficha de cliente y lo que hay es la REFERENCIA que puso el instalador («Rufino SH - Greco, 8 El
 * Bonillo»): va entera, que es como él la reconoce, y sin repetir el pueblo si ya lo lleva.
 */
function deQuien(it) {
    const pueblo = capitalizar(it.municipio || '');
    if (it.ref) {
        const r = capitalizar(String(it.cliente || '').replace(/\s+/g, ' ').trim())
            .replace(/\((\p{Ll})/gu, (_, c) => `(${c.toUpperCase()}`); // «(infantes)» → «(Infantes)»
        // «Cl Goya 15 - Motilla del Palancar» o «Cl Cuesta del Jardin 9 (Infantes)» ya dicen el pueblo.
        const yaLoLleva = pueblo && (r.toLowerCase().includes(pueblo.toLowerCase()) || /\)$/.test(r));
        return `${r || it.numero}${pueblo && !yaLoLleva ? ` (${pueblo})` : ''}`;
    }
    const partes = capitalizar(it.cliente || '').split(/\s+/).filter(Boolean);
    // Nombre y primer apellido: con los dos apellidos y un compuesto la línea no cabe.
    const corto = partes.length > 3 ? partes.slice(0, partes.length - 1).join(' ') : partes.join(' ');
    return `${corto || it.numero}${pueblo ? ` (${pueblo})` : ''}`;
}
/** Una ficha del TERCIARIO (TER100, TER173) no es una vivienda: es la instalación de un local. */
const queEs = (it) => (/TER\d/i.test(String(it?.numero || '')) ? 'instalación' : 'vivienda');
const tuVivienda = (it, { tu = true } = {}) => {
    const pueblo = capitalizar(it.municipio || '');
    return `${tu ? 'tu' : 'la'} ${queEs(it)}${pueblo ? ` de ${pueblo}` : ''}`;
};

const cierre = (txt) => `${txt}\n\n¡Gracias!\n${FIRMA}`;

// ─── PROPUESTA ───────────────────────────────────────────────────────────────
/**
 * @param {string} fase       PRIMERO · SEGUNDO · PREGUNTA · CIERRE · REPASO · ACEPTAR · RETOMAR
 * @param {{quien: string, nombre?: string, titular?: string}} dest
 * @param {Array<{numero, cliente, municipio, enviadaAt, enlace}>} items  (enlace = el de aceptar)
 * @param {{ contestado?: boolean }} o  `contestado`: nos ha escrito (el cierre no dice «no he sabido nada»)
 */
function textoPropuesta(fase, dest, items, { contestado = false } = {}) {
    const its = (items || []).filter(Boolean);
    if (!its.length) return '';
    return dest.quien === 'INSTALADOR' ? propuestaInstalador(fase, dest, its, contestado) : propuestaCliente(fase, dest, its, contestado);
}

function propuestaCliente(fase, dest, its, contestado) {
    // Con la persona de contacto (desvío de avisos) se habla «de la vivienda de X».
    const tu = dest.quien !== 'CONTACTO';
    const it = its[0];
    const deLa = tu ? tuVivienda(it) : `la ${queEs(it)} de ${capitalizar(dest.titular || it.cliente || '')}${it.municipio ? ` en ${capitalizar(it.municipio)}` : ''}`;
    const enlace = it.enlace ? `\n${it.enlace}` : '';
    const h = hola(dest.nombre);
    switch (fase) {
        case 'PRIMERO':
            return cierre(`${h}\n\nTe escribo por la propuesta de la ayuda para ${deLa}${it.enviadaAt ? ` que te mandamos el ${fechaCorta(it.enviadaAt)}` : ''}. ¿Has podido verla?\n\nSi te ha surgido alguna duda, dímela por aquí y te la resuelvo. Y si quieres seguir adelante, se acepta desde este enlace:${enlace}`);
        case 'SEGUNDO':
            return cierre(`${h}\n\n¿Cómo lo ves? Te escribo otra vez por la propuesta de ${deLa}, por si se te quedó alguna duda o necesitas que te aclare algo.\n\nSi te encaja, se acepta aquí y nos ponemos con el certificado energético:${enlace}\n\nY si ahora no es buen momento, dímelo también, sin problema.`);
        case 'PREGUNTA':
            return cierre(`${h}\n\nAl final, ¿cómo lo ves lo de la propuesta de ${deLa}? ¿Sigues adelante o la dejamos aparcada por ahora?\n\nSi sigues, se acepta aquí:${enlace}`);
        case 'CIERRE':
            return `${h}\n\nComo no he ${contestado ? 'vuelto a saber' : 'sabido'} nada, voy a dejar aparcada la propuesta de ${deLa} para no molestarte más.\n\nSi más adelante quieres retomarla, escríbeme por aquí y la ponemos en marcha.\n\n¡Un saludo!\n${FIRMA}`;
        case 'REPASO':
            return cierre(`${h}\n\nEstoy repasando las propuestas que tenemos abiertas y tengo la de ${deLa}${it.enviadaAt ? `, que te mandamos el ${fechaCorta(it.enviadaAt)}` : ''}. ¿Sigues pensando en hacerlo?\n\nSi quieres seguir adelante, se acepta aquí:${enlace}\n\nY si al final no lo vas a hacer, dímelo y la cierro.`);
        case 'ACEPTAR':
            return cierre(`${h}\n\nPara ponernos con ${tu ? 'tu expediente' : 'el expediente'} solo falta aceptar la propuesta en este enlace (son un par de minutos desde el móvil):${enlace}\n\nEn cuanto esté aceptada te digo qué necesitamos para el certificado energético.`);
        case 'RETOMAR':
            return cierre(`${h}\n\nQuedamos en retomarlo por estas fechas: ¿cómo lo ves ahora lo de la propuesta de ${deLa}?\n\nSi quieres seguir adelante, se acepta aquí:${enlace}`);
        default:
            return '';
    }
}

function propuestaInstalador(fase, dest, its, contestado) {
    const h = hola(dest.nombre);
    const uno = its.length === 1;
    const lista = its.map(it => `· ${deQuien(it)}${it.enviadaAt && ['PRIMERO', 'REPASO'].includes(fase) ? `, ${fase === 'REPASO' ? 'del' : 'el'} ${fechaCorta(it.enviadaAt)}` : ''}`).join('\n');
    const d = uno ? deQuien(its[0]) : null;
    switch (fase) {
        case 'PRIMERO':
            return cierre(uno
                ? `${h}\n\nTe escribo por la propuesta que te pasé de ${d}${its[0].enviadaAt ? ` el ${fechaCorta(its[0].enviadaAt)}` : ''}. ¿Se la has podido enseñar? Si le surge cualquier duda, me dices y se la resuelvo.`
                : `${h}\n\nTe escribo por las propuestas que te pasé estos días:\n${lista}\n\n¿Se las has podido enseñar? Si les surge cualquier duda, me dices y se la resuelvo.`);
        case 'SEGUNDO':
            return cierre(uno
                ? `${h}\n\n¿Sabes algo de la propuesta de ${d}? ¿Va a seguir adelante? Si tiene alguna duda, me dices y lo vemos.`
                : `${h}\n\n¿Sabes algo de estas propuestas?\n${lista}\n\n¿Alguno va a seguir adelante? Si tienen dudas, me dices y lo vemos.`);
        case 'PREGUNTA':
            return cierre(uno
                ? `${h}\n\nAl final, ¿sabes si ${d} va a seguir adelante? Si no, la dejo aparcada por ahora.`
                : `${h}\n\nAl final, ¿sabes si estos van a seguir adelante?\n${lista}\n\nLas que no, las dejo aparcadas por ahora.`);
        case 'CIERRE': {
            const nada = contestado ? 'no he vuelto a saber nada' : 'no he sabido nada';
            return `${h}\n\n${uno
                ? `Como ${nada}, voy a dejar aparcada la propuesta de ${d}. Si más adelante quiere hacerlo, me dices y la reactivamos.`
                : `Como ${nada}, voy a dejar aparcadas estas propuestas:\n${lista}\n\nSi alguno quiere retomarla más adelante, me dices y la reactivamos.`}\n\n¡Un saludo!\n${FIRMA}`;
        }
        case 'REPASO':
            return cierre(`${h}\n\nEstoy repasando las propuestas que tengo abiertas contigo y no quiero dejar ninguna colgada:\n${lista}\n\n¿Sabes si ${uno ? 'va a seguir adelante' : 'alguno va a seguir adelante'}? ${uno ? 'Si no, la cierro' : 'Las que no, las cierro'}, y si más adelante se anima, se reactiva sin problema.`);
        case 'ACEPTAR': {
            const conEnlace = its.map(it => `· ${deQuien(it)}${it.enlace ? `\n${it.enlace}` : ''}`).join('\n\n');
            return cierre(uno
                ? `${h}\n\n${d} quiere seguir adelante: para empezar solo le falta aceptar la propuesta. ¿Le puedes pasar este enlace?${its[0].enlace ? `\n${its[0].enlace}` : ''}`
                : `${h}\n\nEstos clientes quieren seguir adelante y solo les falta aceptar la propuesta. ¿Les puedes pasar su enlace?\n\n${conEnlace}`);
        }
        case 'RETOMAR':
            return cierre(uno
                ? `${h}\n\nQuedamos en retomar por estas fechas lo de ${d}: ¿sabes cómo lo ve?`
                : `${h}\n\nQuedamos en retomar por estas fechas estas propuestas:\n${lista}\n\n¿Sabes cómo lo ven?`);
        default:
            return '';
    }
}

// ─── CEE INICIAL ─────────────────────────────────────────────────────────────
// Lo que falta, en lenguaje de casa (criterio de utils/materialCee.js: la vivienda por
// fuera —vídeo, o fachadas y patios— y la caldera en su sala con su placa).
const LINEA = {
    vivienda: 'Un vídeo dando la vuelta a la casa por fuera (o fotos de las fachadas y de las paredes que dan a patios)',
    caldera: 'Una foto de la caldera en su cuarto, que se vea entera',
    // Calefacción que no es una caldera (eléctrica, bomba de calor vieja…): el apartado lo dice.
    generador: 'Una foto del aparato de calefacción que se va a cambiar, en su sitio y que se vea entero',
    placa: 'Una foto de la placa de la caldera (la pegatina con la marca, el modelo y la potencia)',
};
const POR_QUE = 'el certificado energético inicial tiene que quedar registrado antes de que se haga la obra y su factura';

/**
 * @param {string} fase   PEDIDO · R1 · R2 · R3 · R4 · FRAN
 * @param {{quien, nombre?, titular?}} dest
 * @param {Array<{numero, cliente, municipio, lineas: string[], enlace}>} items
 * @param {{ otroLado?: boolean }} o  `otroLado`: es el R3, al que NO se le pidió (ayuda)
 */
function textoCee(fase, dest, items, { otroLado = false } = {}) {
    const its = (items || []).filter(it => it?.lineas?.length);
    if (!its.length) return '';
    const h = hola(dest.nombre);
    const inst = dest.quien === 'INSTALADOR';
    const tu = dest.quien === 'CLIENTE';
    const lista = (it) => it.lineas.map(l => `· ${l}`).join('\n');
    const enl = (it) => (it.enlace ? `\n${it.enlace}` : '');

    // Varias obras (solo al instalador): un bloque por obra, con su enlace.
    if (inst && its.length > 1) {
        const bloques = its.map(it => `*${deQuien(it)}*\n${lista(it)}${enl(it)}`).join('\n\n');
        const extra = ['R2', 'R4', 'FRAN'].includes(fase)
            ? `\n\nTe lo recuerdo porque es importante: ${POR_QUE}. En cuanto cada uno esté registrado, te aviso para que podáis facturar.`
            : '';
        return cierre(`${h}\n\nTe escribo por lo que nos falta para los certificados energéticos iniciales de tus obras:\n\n${bloques}${extra}\n\nSi ya lo has mandado por otro lado, dímelo y lo busco.`);
    }

    const it = its[0];
    const deLa = inst
        ? `de ${deQuien(it)}, expediente *${it.numero}*`
        : tu ? `de ${tuVivienda(it)}` : `de la ${queEs(it)} de ${capitalizar(dest.titular || it.cliente || '')} (expediente *${it.numero}*)`;

    // R3: al otro lado, pidiendo ayuda.
    if (otroLado) {
        return inst
            ? cierre(`${h}\n\nPara el certificado energético inicial ${deLa} nos falta:\n${lista(it)}\n\nSe lo hemos pedido al cliente y todavía no lo tenemos. Si lo tienes tú, o puedes hacerlo cuando pases por la obra, se sube aquí:${enl(it)}\n\nY recuerda que la factura de la instalación tiene que ser posterior al registro del certificado: en cuanto esté registrado, te aviso.`)
            : cierre(`${h}\n\nPara el certificado energético inicial ${deLa} nos falta:\n${lista(it)}\n\nSe lo hemos pedido a tu instalador; si lo tienes tú más a mano, se sube desde el móvil aquí:${enl(it)}`);
    }

    switch (fase) {
        case 'PEDIDO':
            return cierre(`${h}\n\nPara hacer el certificado energético inicial ${deLa}${inst || !tu ? '' : ` (expediente *${it.numero}*)`} nos falta:\n${lista(it)}\n\nSe sube desde el móvil aquí:${enl(it)}`);
        case 'R1':
            return cierre(`${h}\n\nTe escribo por lo que nos falta para el certificado energético inicial ${deLa}:\n${lista(it)}\n\nCuando lo tengas, se sube desde el móvil aquí:${enl(it)}\n\nSi ya lo has mandado por otro lado, dímelo y lo busco.`);
        case 'R2':
            return cierre(`${h}\n\nTe lo recuerdo porque es importante para ${inst ? 'la ayuda de tu cliente' : tu ? 'tu ayuda' : 'la ayuda'}: ${POR_QUE}. Para hacerlo nos falta:\n${lista(it)}\n\nSe sube aquí, desde el móvil:${enl(it)}\n\nSi necesitas que te ayude con algo, dímelo.`);
        case 'R3':   // sin otro lado a quien pedírselo: el mismo, ofreciendo ayuda
            return cierre(`${h}\n\nSigo sin tener lo del certificado energético inicial ${deLa}:\n${lista(it)}\n\nSi tienes cualquier problema para hacer las fotos, dímelo y lo vemos. Se suben aquí:${enl(it)}`);
        case 'R4':
        case 'FRAN':
            return cierre(`${h}\n\nSigo pendiente de lo del certificado energético inicial ${deLa}:\n${lista(it)}${enl(it)}\n\nMientras no lo tengamos no se puede registrar, y hasta entonces no conviene empezar la obra ni hacer la factura.`);
        default:
            return '';
    }
}

module.exports = { textoPropuesta, textoCee, hola, deQuien, LINEA, POR_QUE, fechaCorta };
