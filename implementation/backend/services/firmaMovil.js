// ─── Firmar desde el MÓVIL lo que se está tramitando en el ORDENADOR ─────────
//
// Port del planteamiento de `ScannerApp/src/main/signServer.ts`, adaptado a que
// aquí SÍ hay un servidor: el PC pide un enlace, enseña su QR, el teléfono abre
// la hoja de firma y devuelve el PNG. El PC lo recoge y sigue por donde iba.
//
// **El documento NO viaja al teléfono.** Igual que en ScannerApp, al móvil solo
// se le manda una hoja en blanco y el nombre de lo que se firma; de vuelta llega
// la firma. Ni el PDF ni un solo dato del cliente salen de la sesión del PC, que
// es lo que hace razonable pasar por aquí un enlace que se abre con una cámara.
//
// Vive en MEMORIA a propósito: una sesión de firma dura minutos y con el usuario
// delante. Una tabla obligaría a limpiar filas muertas para siempre a cambio de
// sobrevivir a un reinicio que, si ocurre, se resuelve pidiendo otro enlace.

const { randomBytes } = require('crypto');
const { networkInterfaces } = require('os');

/** Minutos que vive un enlace. Corto: es una firma, no una sesión. */
const VIDA_MINUTOS = 10;
/** Una firma son ~200 KB; esto es techo de sobra y freno de lo que no lo sea. */
const MAX_FIRMA_BYTES = 8 * 1024 * 1024;
/** Tope de enlaces vivos: nadie infla la memoria del proceso pidiendo enlaces. */
const MAX_SESIONES = 200;

/** token → { caduca, usada, firma, etiqueta, expedienteId, doc } */
const sesiones = new Map();

function limpiar() {
    const ahora = Date.now();
    for (const [token, s] of sesiones) {
        if (s.caduca < ahora) sesiones.delete(token);
    }
}

/**
 * Direcciones IPv4 del equipo en su red local, la más probable primero.
 *
 * Solo hace falta EN DESARROLLO: en producción el enlace es `app.brokergy.es` y
 * el teléfono llega por internet. Pero en local el PC se ve a sí mismo como
 * `localhost`, que en el móvil no es este ordenador sino el propio teléfono —
 * así que sin esto no hay forma de probar la firma con el móvil.
 *
 * Se ordenan porque un portátil normal tiene varias —Wi-Fi, cable, adaptadores
 * de VPN o de máquinas virtuales— y a las de VirtualBox o Docker no llega ningún
 * teléfono. Mismos pesos que en ScannerApp, que están medidos contra equipos
 * reales.
 */
function direccionesLan() {
    const encontradas = [];
    for (const [nombre, lista] of Object.entries(networkInterfaces())) {
        for (const dir of lista || []) {
            if (dir.family !== 'IPv4' || dir.internal) continue;
            const bajo = nombre.toLowerCase();
            let peso = 0;
            if (dir.address.startsWith('192.168.')) peso += 3;
            else if (/^10\./.test(dir.address)) peso += 2;
            else if (/^172\.(1[6-9]|2\d|3[01])\./.test(dir.address)) peso += 2;
            if (/wi-?fi|wlan|inalámbric|wireless/.test(bajo)) peso += 2;
            if (/ethernet|lan/.test(bajo)) peso += 1;
            if (/virtualbox|vmware|hyper-v|docker|wsl|loopback|tailscale|zerotier/.test(bajo)) peso -= 6;
            encontradas.push({ ip: dir.address, peso });
        }
    }
    return encontradas.sort((a, b) => b.peso - a.peso).map(d => d.ip);
}

/**
 * Las bases desde las que el TELÉFONO puede abrir la app, la mejor primero.
 *
 * @param {string} origen  el `Origin` del navegador que pide el enlace (el PC).
 */
function basesParaMovil(origen) {
    const publica = process.env.VITE_APP_URL || process.env.APP_URL || 'https://app.brokergy.es';
    let url = null;
    try { url = origen ? new URL(origen) : null; } catch { url = null; }
    const esLocal = !!url && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);

    if (!esLocal) {
        // Producción: el propio origen si nos consta, y si no, la pública. El
        // enlace TIENE que llevar al mismo sitio donde está trabajando el PC.
        return [url ? url.origin : publica];
    }
    // Desarrollo: la misma app, pero por la IP de la red local y CONSERVANDO el
    // puerto del que vino la petición (5173 en `vite dev`, otro si se cambió).
    const puerto = url.port ? `:${url.port}` : '';
    const bases = direccionesLan().map(ip => `http://${ip}${puerto}`);
    return bases.length ? bases : [publica];
}

/**
 * Abre un enlace de firma. Un enlace vale para UNA firma y caduca a los 10 min.
 *
 * @param {object} opts
 *   - etiqueta {string}  qué se firma, para que el móvil lo diga ("Convenio de
 *     Cesión de Ahorros"). Es lo ÚNICO del expediente que viaja al teléfono.
 *   - origen {string}    el Origin del PC que lo pide.
 */
function abrir({ etiqueta, origen } = {}) {
    limpiar();
    if (sesiones.size >= MAX_SESIONES) {
        throw new Error('Hay demasiados enlaces de firma abiertos. Inténtalo en unos minutos.');
    }
    const token = randomBytes(16).toString('hex');
    const caduca = Date.now() + VIDA_MINUTOS * 60_000;
    sesiones.set(token, {
        caduca,
        usada: false,
        firma: null,
        etiqueta: String(etiqueta || 'documento').slice(0, 80),
    });
    const bases = basesParaMovil(origen);
    const enlace = base => `${base}/firma-movil/${token}`;
    return {
        token,
        url: enlace(bases[0]),
        alternativas: bases.slice(1).map(enlace),
        caducaEn: caduca,
    };
}

/** Lo que el TELÉFONO necesita saber al abrir el enlace. No consume nada. */
function info(token) {
    limpiar();
    const s = sesiones.get(token);
    if (!s) return null;
    return { etiqueta: s.etiqueta, caducaEn: s.caduca, yaFirmada: !!s.firma };
}

/**
 * El teléfono manda la firma.
 *
 * Se marca ANTES de nada: si el móvil reintenta por un timeout de red, no puede
 * colar una segunda firma con el mismo enlace (mismo criterio que ScannerApp).
 */
function recibir(token, dataUrl) {
    limpiar();
    const s = sesiones.get(token);
    if (!s) return { ok: false, motivo: 'caducado' };
    if (s.usada) return { ok: false, motivo: 'usado' };
    if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,/.test(dataUrl)) {
        return { ok: false, motivo: 'formato' };
    }
    if (dataUrl.length > MAX_FIRMA_BYTES) return { ok: false, motivo: 'tamaño' };
    s.usada = true;
    s.firma = dataUrl;
    return { ok: true };
}

/**
 * El PC recoge la firma. Al entregarla, el enlace se cierra: una firma, un uso.
 *
 * Devuelve `esperando` mientras no haya llegado; el PC pregunta cada pocos
 * segundos, que es más simple y más robusto que un websocket para algo que dura
 * un minuto — y sobrevive a que el PC recargue la página.
 */
function recoger(token) {
    limpiar();
    const s = sesiones.get(token);
    if (!s) return { estado: 'caducado' };
    if (!s.firma) return { estado: 'esperando', caducaEn: s.caduca };
    sesiones.delete(token);
    return { estado: 'firmada', firma: s.firma };
}

function cerrar(token) {
    sesiones.delete(token);
}

module.exports = {
    VIDA_MINUTOS,
    MAX_FIRMA_BYTES,
    direccionesLan,
    basesParaMovil,
    abrir,
    info,
    recibir,
    recoger,
    cerrar,
};
