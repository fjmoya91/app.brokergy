/**
 * El mensaje de envío de la propuesta cuando NO hay deducción del IRPF: una
 * EMPRESA, el sector TERCIARIO (TER100 / TER173) o cualquier caso en que la
 * deducción salga a 0 €.
 *
 * Fran, 10/11/2026, 26TER100_OP389 (AUTOSERVICIO RODRIGUEZ SL): «cuando es una
 * empresa, no tiene sentido que se haga lo de ambas opciones, deducciones IRPF,
 * etcétera. El mensaje debe ser más escueto […] tienen que tener sentido». El
 * texto general decía «si eres propietario y tienes retenciones… *0 €*» y
 * «*5.027 €* combinando ambas opciones»: a una empresa le hablaba de una
 * deducción que no tiene y sumaba dos «opciones» que eran el bono y un cero.
 *
 * REGLA — sin IRPF, el mensaje es el BONO y los pasos. Ni el párrafo del IRPF, ni
 * el «resumen total», ni «Opción 1» cuando hay una sola opción. Si la propuesta
 * lleva de verdad dos opciones (aerotermia / aerotermia + envolvente, o CEE
 * aportado / CEE nuevo), se dan las dos cifras, una por línea.
 *
 * REGLA — se decide por las CIFRAS (`irpfDeduction` de las opciones que se
 * presentan), no por el rótulo del cliente: si la deducción sale a 0 €, mencionarla
 * es ruido, sea quien sea el titular.
 *
 * Las notas fijas del final (CEE inicial, presupuesto estimado, comisión del
 * partner) las sigue pegando `buildCaption`; el enlace para aceptar va aparte.
 */
const fmt = (n) => new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true,
}).format(Math.round(Number(n) || 0));

/** ¿Ninguna de las opciones que se presentan lleva deducción del IRPF? */
export function propuestaSinIrpf(irpfs = []) {
    return irpfs.every((v) => !(Math.round(Number(v) || 0) > 0));
}

/**
 * @param {object} o
 * @param {boolean} o.b2b            Al partner / instalador (tercera persona).
 * @param {'aero'|'reforma'|'dos'|'cee'} o.caso
 * @param {string} o.saludo          «¡Hola X!» ya resuelto.
 * @param {string} o.apertura        «Tal y como acordamos, te adjunto» / «En colaboración con…».
 * @param {string} o.numero          Nº de la oportunidad.
 * @param {string} o.cliente         Nombre del cliente (solo b2b).
 * @param {number} o.bono            Bono de la única opción (aero / reforma).
 * @param {number} o.bonoAero        Opción 1 (dos).
 * @param {number} o.bonoReforma     Opción 2 (dos).
 * @param {number} o.conCee          Opción A (cee).
 * @param {number} o.ceeNuevo        Opción B (cee).
 * @param {string} o.hib             Párrafo de la hibridación ('' si no hay), con sus saltos.
 * @param {string} o.enlaceDebajo    La línea que avisa del enlace.
 * @param {boolean} o.terciario      Edificio del sector terciario (no «vivienda»).
 */
export function mensajeSinIrpf({
    b2b = false, caso = 'aero', saludo = '¡Hola!', apertura = 'Tal y como acordamos, te adjunto',
    numero = '', cliente = 'el cliente', bono = 0, bonoAero = 0, bonoReforma = 0,
    conCee = 0, ceeNuevo = 0, hib = '', enlaceDebajo = '', terciario = false,
} = {}) {
    const inmueble = terciario ? 'el edificio' : 'la vivienda';
    const que = caso === 'reforma' ? 'la reforma energética' : 'la instalación de aerotermia';

    let cifras;
    if (caso === 'dos') {
        cifras = [
            `${b2b ? 'Hay dos opciones para el cliente' : 'Te presento dos opciones'}, con la ayuda del Bono Energético CAE que gestiona BROKERGY:`,
            '',
            `💰 *Opción 1 — Solo aerotermia: ${fmt(bonoAero)} €*`,
            `💰 *Opción 2 — Aerotermia y mejora de la envolvente (ventanas y/o aislamiento): ${fmt(bonoReforma)} €*`,
        ].join('\n');
    } else if (caso === 'cee') {
        cifras = [
            `Como ${b2b ? 'el cliente ya cuenta' : 'ya cuentas'} con un Certificado de Eficiencia Energética (CEE) inicial, hay dos opciones para el Bono Energético CAE:`,
            '',
            `💰 *Opción A — Con el CEE ${b2b ? 'aportado' : 'que nos has aportado'}: ${fmt(conCee)} €*`,
            `💰 *Opción B — Emitiendo nosotros un CEE inicial nuevo: ${fmt(ceeNuevo)} €*`,
            '',
            `_¿Por qué la diferencia?_ El bono se calcula sobre el ahorro que refleja el CEE inicial. Uno nuevo, hecho antes de la obra, recoge el estado real de partida de ${inmueble}, y eso puede aumentar el ahorro certificado.`,
        ].join('\n');
    } else {
        // La ayuda, en su propia línea y en negrita entera (Fran, 10/11/2026: «la ayuda
        // en negrita, que destaque»): es lo único que el cliente tiene que retener.
        cifras = [
            `Con el ahorro de energía que se certifica tras la obra, ${b2b ? 'el cliente podría obtener' : 'podrías obtener'} esta ayuda, gestionada por BROKERGY:`,
            '',
            `💰 *BONO ENERGÉTICO CAE: ${fmt(bono)} €*`,
        ].join('\n');
    }

    const pasos = [
        b2b ? '• Aceptar vuestro presupuesto de instalación.' : '• Aceptar el presupuesto del instalador (si no lo has aceptado ya).',
        ...(caso === 'cee' ? [b2b ? '• Indicarnos si usamos el CEE aportado o hacemos uno nuevo.' : '• Indicarnos si usamos tu CEE o hacemos uno nuevo.'] : []),
        b2b ? '• Aceptar la propuesta adjunta en PDF.' : '• Aceptar la propuesta que te adjuntamos en PDF.',
    ].join('\n');

    if (b2b) {
        return `${saludo}\n\nTe adjunto la propuesta de ayudas de ${cliente} para ${que} (Exp. ${numero}).\n\n${cifras}${hib}\n\nPara avanzar:\n\n${pasos}\n\n${enlaceDebajo}\n\nQuedo a vuestra disposición para cualquier duda.\n\nUn saludo,\nFran Moya · BROKERGY`;
    }
    return `${saludo}\n\n${apertura} la propuesta de ayudas para ${que} (Nº ${numero}).\n\n${cifras}${hib}\n\nPara avanzar:\n\n${pasos}\n\n${enlaceDebajo}\n\nQuedo a tu disposición para cualquier duda.\n\nUn saludo, Fran Moya\n\nBROKERGY — Especialistas en Eficiencia Energética\n\n\ninfo@brokergy.es · 623 926 179`;
}
