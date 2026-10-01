// ─── Pintar el CROQUIS desde el MÓVIL, y verlo en el ordenador según se pinta ─
//
// El croquis a mano alzada (ver `gis/croquis.py` en el motor) se pinta mejor con
// el dedo que con el ratón: es un gesto de rotulador, y quien lo sabe —dónde
// está el garaje, por dónde se entra al porche— muchas veces está delante del
// edificio con el teléfono en la mano. Así que el ordenador enseña un QR, el
// teléfono abre la planta y lo que se pinta allí aparece AQUÍ al momento.
//
// Mismo planteamiento que `firmaMovil.js` (del que se reutilizan las direcciones
// de la red local), con dos diferencias:
//
//  1. Esto NO es de un solo uso: el croquis se pinta, se corrige y se ajusta
//     varias veces. El enlace vive mientras se use (se renueva con cada trazo) y
//     caduca a los 30 minutos de silencio.
//  2. Va en TIEMPO REAL: el ordenador hace una petición LARGA (`esperar`) que el
//     servidor contesta en cuanto el teléfono manda algo — no una encuesta cada
//     dos segundos, que se vería a saltos justo mientras se pinta.
//
// **Al teléfono solo viaja la GEOMETRÍA de la planta**: las paredes, el lienzo,
// la cartografía del Catastro (pública) y los m² que Catastro declara por uso.
// Ni el titular, ni la dirección, ni un dato del expediente. Con el token en la
// mano, lo único que se puede hacer es pintar manchas sobre un plano.
//
// Vive en MEMORIA a propósito (igual que la firma): dura minutos, con el
// usuario delante, y un reinicio se resuelve pidiendo otro QR.
//
// ── Y las FOTOS de las fachadas (2026-09-30) ─────────────────────────────────
// Con la planta en el teléfono, el técnico está delante de cada pared: la toca,
// le hace la foto, y la foto queda pegada a ESA pared (`paredFotoService`, lo
// mismo que desde el ordenador) y se leen sus huecos (`paredOcrService`). Lo
// leído se REVISA en el teléfono —quien tiene la fachada delante— y, al
// confirmarlo, lo pone en el plano el ORDENADOR (`pedirHuecos` → su espera
// larga → `aplicaHuecosLeidos`), igual que el ajuste del croquis: el ordenador
// es quien tiene el trabajo del plano y lo guarda.
//
// Con esto el token deja hacer algo más que pintar manchas: SUBIR fotos a las
// paredes de ESA planta, ver las que ya tienen y pedir que se lean. Nada fuera
// de esas paredes, con tope de subidas y de lecturas por sesión (cada lectura
// es una llamada de pago).
//
// ── Y SIN COBERTURA (2026-09-30) ─────────────────────────────────────────────
// En un sótano o en un pueblo la señal va y viene: el teléfono guarda lo
// pintado y las fotos y los manda al volver la red (`logic/bandejaMovil.js`).
// Eso pide tres cosas de aquí:
//
//  1. Que el enlace NO caduque mientras el ORDENADOR lo esté mirando: el
//     teléfono puede pasar media hora sin poder decir nada, y lo que haya
//     pintado en ese rato tiene que tener a dónde llegar. Su espera larga
//     renueva la vida, con un TOPE absoluto (`VIDA_MAXIMA_HORAS`): el token es
//     toda la autorización y no puede ser eterno.
//  2. Que un reenvío NO haga las cosas dos veces. Sin cobertura se pierde
//     también la RESPUESTA: el teléfono reintenta algo que sí llegó. Cada
//     petición que cambia algo lleva su `id_local` y aquí se recuerda
//     (`yaHecho` / `apuntarHecho`): la foto no se sube dos veces, la lectura
//     (de pago) no se repite y los huecos no se ponen por duplicado.
//  3. Una `clave` estable de ESA planta y el `marco` de su lienzo, para que lo
//     que se pintó con un enlace que caducó se pueda recuperar con el siguiente
//     QR (trasladado al lienzo nuevo). La clave es un resumen: no dice de qué
//     expediente es.

const { randomBytes, createHash } = require('crypto');
const { basesParaMovil } = require('./firmaMovil');

/** Minutos de SILENCIO tras los que el enlace deja de valer. */
const VIDA_MINUTOS = 30;
/**
 * Horas tras las que el enlace deja de valer PASE LO QUE PASE, aunque el
 * ordenador siga mirándolo: el token es toda la autorización para subir fotos a
 * un expediente real.
 */
const VIDA_MAXIMA_HORAS = 12;
/** Cuántas peticiones «ya hechas» se recuerdan por sesión (ver `yaHecho`). */
const MAX_HECHOS = 200;
//: El id que el teléfono pone a lo que manda (`nuevoIdLocal`): no es un secreto,
//: solo tiene que ser único.
const RE_ID_LOCAL = /^[A-Za-z0-9_-]{6,48}$/;
/** Tope de sesiones vivas: nadie infla la memoria del proceso pidiendo QR. */
const MAX_SESIONES = 60;
/** Lo que se sostiene abierta la petición del ordenador antes de contestar «nada nuevo». */
const ESPERA_MAX_MS = 20_000;

const USOS = ['GARAJE', 'ALMACEN', 'ESPACIO NO HABITABLE', 'PORCHE'];
//: Topes por sesión de lo que cuesta algo: una subida ocupa Drive y una lectura
//: es una llamada de pago al modelo.
const MAX_SUBIDAS = Number(process.env.CROQUIS_MOVIL_MAX_SUBIDAS) || 60;
const MAX_LECTURAS = Number(process.env.CROQUIS_MOVIL_MAX_LECTURAS) || 40;
const MAX_HUECOS = 40;
//: El id de una pared: el de Catastro (`FBS3`). El mismo patrón que la clave de
//: `paredFotoService`, porque acaba siendo esa clave.
const RE_ID = /^[A-Za-z0-9_-]{1,40}$/;
//: Un id de Drive (una foto de la pared).
const RE_DRIVE = /^[A-Za-z0-9_-]{10,100}$/;
const MAX_TRAZOS = 20;
const MAX_PUNTOS = 400;

/** token → sesión */
const sesiones = new Map();

function limpiar() {
    const ahora = Date.now();
    for (const [token, s] of sesiones) {
        if (s.caduca < ahora) {
            despertar(s);
            sesiones.delete(token);
        }
    }
}

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/** Una lista de puntos [x, y] limpia, o null. Llega de un teléfono: no se guarda tal cual. */
function puntos(pts, { min = 2, max = MAX_PUNTOS } = {}) {
    if (!Array.isArray(pts)) return null;
    const out = [];
    for (const p of pts.slice(0, max)) {
        if (!Array.isArray(p)) return null;
        const x = num(p[0]), y = num(p[1]);
        if (x === null || y === null) return null;
        out.push([x, y]);
    }
    return out.length >= min ? out : null;
}

function uso(u) {
    const v = String(u || '').toUpperCase();
    return USOS.includes(v) ? v : 'ESPACIO NO HABITABLE';
}

/**
 * Las paredes de una planta, EN EL LIENZO del teléfono, con lo que el teléfono
 * necesita para hacerles la foto: su id (la clave de sus fotos), su nombre, sus
 * medidas —de ellas sale la escala al leer la foto— y si admiten huecos.
 */
function murosLimpios(lista) {
    return (Array.isArray(lista) ? lista : []).slice(0, 600)
        .map(m => ({
            svg: puntos(m?.svg, { min: 2, max: 80 }),
            tipo: String(m?.tipo || '').slice(0, 40),
            ...metaLimpia(m),
        }))
        .filter(m => m.svg);
}

/** Lo que se dice de una pared además de su trazo. */
function metaLimpia(m) {
    const o = {};
    if (RE_ID.test(String(m?.id || ''))) o.id = String(m.id);
    if (m?.nombre) o.nombre = String(m.nombre).slice(0, 60);
    const largo = num(m?.largo), alto = num(m?.alto);
    if (largo > 0) o.largo = largo;
    if (alto > 0) o.alto = alto;
    if (m?.orientacion) o.orientacion = String(m.orientacion).slice(0, 8);
    if (typeof m?.admite === 'boolean') o.admite = m.admite;
    if (Number.isInteger(m?.huecos)) o.huecos = Math.max(0, Math.min(999, m.huecos));
    return o;
}

function zonasLimpias(lista) {
    return (Array.isArray(lista) ? lista : []).slice(0, 20)
        .map(z => ({ uso: uso(z?.uso), lienzo: puntos(z?.lienzo, { min: 3 }) }))
        .filter(z => z.lienzo);
}

function trazosLimpios(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.slice(0, MAX_TRAZOS)
        .map(t => ({ uso: uso(t?.uso), pts: puntos(t?.pts, { min: 3 }) }))
        .filter(t => t.pts);
}

/** La PROPUESTA de croquis del motor: manchas con su uso y el motivo. */
function propuestaLimpia(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.slice(0, MAX_TRAZOS)
        .map(t => ({ uso: uso(t?.uso), pts: puntos(t?.pts, { min: 3 }),
                     por_que: t?.por_que ? String(t.por_que).slice(0, 200) : null }))
        .filter(t => t.pts);
}

function enCursoLimpio(t) {
    if (!t) return null;
    const pts = puntos(t.pts, { min: 2 });
    return pts ? { uso: uso(t.uso), pts } : null;
}

/** Despierta a los que esperan en el ordenador: ha pasado algo. */
function despertar(s) {
    const esperas = [...s.esperas];
    s.esperas.clear();
    for (const fn of esperas) {
        try { fn(); } catch { /* una espera que ya se cerró */ }
    }
}

/**
 * Renueva la vida del enlace: 30 minutos más desde ahora, sin pasar nunca del
 * tope absoluto desde que se abrió (`VIDA_MAXIMA_HORAS`).
 */
function renovar(s, ahora = Date.now()) {
    const tope = (s.nace || ahora) + VIDA_MAXIMA_HORAS * 3600_000;
    s.caduca = Math.min(tope, Math.max(s.caduca || 0, ahora + VIDA_MINUTOS * 60_000));
}

/** Algo ha cambiado: sube la versión, renueva la vida y avisa al ordenador. */
function tocar(s) {
    s.version += 1;
    renovar(s);
    despertar(s);
}

/**
 * ¿Esta petición del teléfono ya se hizo? Sin cobertura se pierde también la
 * RESPUESTA, y el teléfono reintenta algo que sí había llegado: con su
 * `id_local` se devuelve lo de entonces en vez de hacerlo dos veces (subir la
 * misma foto, pagar otra lectura, poner los huecos por duplicado).
 * `undefined` si no se hizo (o si no trae id: entonces no hay forma de saberlo).
 */
function yaHecho(token, tipo, id) {
    const s = sesiones.get(token);
    if (!s || !RE_ID_LOCAL.test(String(id || ''))) return undefined;
    return s.hechos.get(`${tipo}:${id}`);
}

/** Recuerda lo que se contestó a una petición con `id_local` (ver `yaHecho`). */
function apuntarHecho(token, tipo, id, valor) {
    const s = sesiones.get(token);
    if (!s || !RE_ID_LOCAL.test(String(id || ''))) return false;
    s.hechos.set(`${tipo}:${id}`, valor);
    while (s.hechos.size > MAX_HECHOS) s.hechos.delete(s.hechos.keys().next().value);
    return true;
}

/** El `marco` del lienzo (lo mismo que `lienzoAMundo` en el plano), o null. */
function marcoDe(georef) {
    const b = georef?.bbox, en = georef?.en_el_lienzo;
    if (!Array.isArray(b) || b.length < 4 || !en) return null;
    const dx = Number(b[0]) - Number(en.x || 0), y0 = Number(b[3]) + Number(en.y || 0);
    return Number.isFinite(dx) && Number.isFinite(y0) ? { dx, y0 } : null;
}

/** Una clave ESTABLE de una planta de un expediente, que no dice cuál es. */
function claveDe(negocio, expediente, planta) {
    return createHash('sha256')
        .update(`${negocio}|${expediente}|${planta.id}|${planta.nivel}`)
        .digest('hex').slice(0, 20);
}

/**
 * El ordenador abre una sesión para UNA planta.
 *
 * @param {object} o
 *   - expediente {string}  el id de la ventana que lo pide: la sesión solo se
 *                          puede leer desde ese mismo expediente.
 *   - planta {id, nombre, nivel}
 *   - muros [{svg, tipo}]  las paredes EN EL LIENZO (lo mismo que dibuja el plano)
 *   - lienzo {ancho, alto}
 *   - zonas [{uso, lienzo}] las zonas ya restadas en esa planta, para verlas
 *   - catastro [{uso, superficie}] lo que Catastro declara que NO es vivienda ahí
 *   - trazos               lo que ya estaba pintado en el ordenador
 *   - cartografia          { imagen, tipo, en_el_lienzo } si se tiene
 *   - origen               el Origin del ordenador (para componer el enlace)
 *   - georef               la georreferencia del plano: de ella sale el `marco`
 *                          del lienzo, para recuperar lo pintado con otro enlace
 */
function abrir(o = {}) {
    limpiar();
    if (sesiones.size >= MAX_SESIONES) {
        throw new Error('Hay demasiados croquis abiertos desde el móvil. Inténtalo en unos minutos.');
    }
    const planta = {
        id: String(o.planta?.id ?? '').slice(0, 20),
        nombre: String(o.planta?.nombre ?? 'Planta').slice(0, 60),
        nivel: Number.isInteger(Number(o.planta?.nivel)) ? Number(o.planta.nivel) : 0,
    };
    const muros = murosLimpios(o.muros);
    if (!muros.length) throw Object.assign(new Error('Esa planta no tiene paredes que enseñar.'), { status: 400 });
    const lienzo = { ancho: num(o.lienzo?.ancho) || 0, alto: num(o.lienzo?.alto) || 0 };
    const zonas = zonasLimpias(o.zonas);
    const catastro = (Array.isArray(o.catastro) ? o.catastro : []).slice(0, 12)
        .map(c => ({ uso: String(c?.uso || '').slice(0, 40), superficie: num(c?.superficie) }))
        .filter(c => c.uso && c.superficie);
    const r = o.cartografia?.en_el_lienzo;
    const cartografia = o.cartografia?.imagen && r && [r.x, r.y, r.ancho, r.alto].every(v => num(v) !== null)
        ? { imagen: String(o.cartografia.imagen), tipo: String(o.cartografia.tipo || 'image/png'),
            en_el_lienzo: { x: num(r.x), y: num(r.y), ancho: num(r.ancho), alto: num(r.alto) } }
        : null;

    const token = randomBytes(16).toString('hex');
    const negocio = ['cae', 'cee', 'op'].includes(o.negocio) ? o.negocio : 'cae';
    const expediente = String(o.expediente || '');
    const ahora = Date.now();
    const s = {
        expediente,
        //: De qué negocio es (`cae` · `cee` · `op`): las fotos se escriben en la
        //: tabla que toque, igual que desde la ventana del ordenador.
        negocio,
        //: Para recuperar en el teléfono lo pintado con un enlace anterior de
        //: ESTA planta (ver cabecera): una clave estable y el marco del lienzo.
        clave: claveDe(negocio, expediente, planta),
        marco: marcoDe(o.georef),
        nace: ahora,
        hechos: new Map(),
        planta, plano: { muros, lienzo, zonas, cartografia }, catastro,
        trazos: trazosLimpios(o.trazos),
        //: Dónde está, probablemente, lo que no es vivienda (la propuesta del
        //: motor). El teléfono la ofrece; se descarta en cuanto se ajusta.
        propuesta: propuestaLimpia(o.propuesta),
        enCurso: null,
        version: 1,
        movilVisto: null,
        pedido: null,      // { n, ajustar } — el teléfono pide ajustar
        resultado: null,   // { n, ok, texto, lineas } — lo que contestó el ordenador
        cerrada: false,
        ordenadorVisto: ahora,
        caduca: ahora + VIDA_MINUTOS * 60_000,
        esperas: new Set(),
        //: Las FOTOS: cuántas veces han cambiado (el ordenador refresca las
        //: suyas al verlo), lo que se lleva gastado, y el encargo de poner
        //: huecos en el plano que espera a que lo atienda el ordenador.
        fotos: 0, subidas: 0, lecturas: 0,
        pedidoHuecos: null,     // { n, pared, huecos, reemplaza, drive_id }
        resultadoHuecos: null,  // { serial, n, ok, texto, pared, total }
        respuestasHuecos: 0,
        //: Cambia cuando el ordenador cuenta algo nuevo de las paredes (sus
        //: huecos, un nombre, una reclasificación): el teléfono las vuelve a pedir.
        paredesV: 0,
    };
    sesiones.set(token, s);
    const bases = basesParaMovil(o.origen);
    const enlace = base => `${base}/croquis-movil/${token}`;
    return { token, url: enlace(bases[0]), alternativas: bases.slice(1).map(enlace) };
}

// ── Lo que hace el TELÉFONO ──────────────────────────────────────────────────

/** Lo que el teléfono necesita para pintar. Marca que ya se ha conectado. */
function paraMovil(token) {
    limpiar();
    const s = sesiones.get(token);
    if (!s || s.cerrada) return null;
    if (!s.movilVisto) { s.movilVisto = Date.now(); tocar(s); }
    return {
        planta: s.planta, plano: s.plano, catastro: s.catastro, usos: USOS,
        trazos: s.trazos, version: s.version, resultado: s.resultado,
        propuesta: s.propuesta,
        clave: s.clave, marco: s.marco,
    };
}

/** El estado LIGERO que el teléfono consulta mientras espera (sin la geometría). */
function estadoMovil(token) {
    limpiar();
    const s = sesiones.get(token);
    if (!s || s.cerrada) return { estado: 'cerrada' };
    // El ordenador pregunta sin parar (su espera larga vuelve a los 20 s): si
    // lleva más de 45 s sin hacerlo, se ha cerrado la ventana o se ha caído la
    // red, y lo que se pinte aquí no lo está recogiendo nadie. Se dice.
    const ordenadorAusente = Date.now() - (s.ordenadorVisto || 0) > 45_000;
    return { estado: 'abierta', resultado: s.resultado, pedido: s.pedido, ordenadorAusente,
             resultadoHuecos: s.resultadoHuecos, huecosPendientes: !!s.pedidoHuecos,
             paredesV: s.paredesV };
}

/**
 * El teléfono manda lo que hay pintado: los trazos TERMINADOS y el que está a
 * medias. Siempre el estado ENTERO, nunca un «añade este»: si se pierde un
 * mensaje por el camino, el siguiente lo corrige solo.
 */
function actualizar(token, { trazos, enCurso } = {}) {
    limpiar();
    const s = sesiones.get(token);
    if (!s || s.cerrada) return { ok: false, motivo: 'cerrada' };
    if (trazos !== undefined) s.trazos = trazosLimpios(trazos);
    s.enCurso = enCursoLimpio(enCurso);
    s.movilVisto = s.movilVisto || Date.now();
    tocar(s);
    return { ok: true, version: s.version };
}

/**
 * El teléfono pide que se ajuste (o que se aplique tal cual). Lo hace el ORDENADOR.
 * Con `id_local`, un reenvío (la respuesta se perdió sin cobertura) devuelve el
 * pedido de entonces en vez de pedir otro ajuste.
 */
function pedirAjuste(token, { ajustar = true, trazos, id_local: idLocal } = {}) {
    limpiar();
    const s = sesiones.get(token);
    if (!s || s.cerrada) return { ok: false, motivo: 'cerrada' };
    const antes = yaHecho(token, 'ajuste', idLocal);
    if (antes) return antes;
    if (trazos !== undefined) s.trazos = trazosLimpios(trazos);
    if (!s.trazos.length) return { ok: false, motivo: 'vacio' };
    s.enCurso = null;
    s.pedido = { n: (s.pedido?.n || 0) + 1, ajustar: ajustar !== false };
    s.resultado = null;
    tocar(s);
    const r = { ok: true, n: s.pedido.n };
    apuntarHecho(token, 'ajuste', idLocal, r);
    return r;
}

// ── Lo que hace el ORDENADOR ─────────────────────────────────────────────────

function deEse(token, expediente) {
    limpiar();
    const s = sesiones.get(token);
    if (!s) return null;
    // La sesión es de UN expediente: con el token de otro no se lee nada.
    if (s.expediente !== String(expediente || '')) return null;
    return s;
}

function foto(s) {
    return {
        estado: s.cerrada ? 'cerrada' : 'abierta',
        version: s.version, trazos: s.trazos, enCurso: s.enCurso,
        movilVisto: s.movilVisto, pedido: s.pedido, caducaEn: s.caduca,
        fotos: s.fotos, pedidoHuecos: s.pedidoHuecos,
    };
}

/**
 * La petición LARGA del ordenador: contesta en cuanto hay una versión más nueva
 * que `desde`, o a los 20 s con lo que haya (y el ordenador vuelve a preguntar).
 *
 * @param {Function} alCerrarse  engancha la limpieza si la conexión se corta
 */
function esperar(token, expediente, desde, alCerrarse) {
    const s = deEse(token, expediente);
    if (!s) return Promise.resolve({ estado: 'caducada' });
    s.ordenadorVisto = Date.now();
    // El ordenador lo está mirando: el enlace sigue vivo aunque el teléfono
    // lleve un rato sin poder decir nada (sin cobertura). Ver cabecera.
    if (!s.cerrada) renovar(s);
    const v = Number(desde) || 0;
    if (s.version > v || s.cerrada) return Promise.resolve(foto(s));
    return new Promise((resolve) => {
        let hecho = false;
        const fin = () => {
            if (hecho) return;
            hecho = true;
            clearTimeout(t);
            s.esperas.delete(fin);
            s.ordenadorVisto = Date.now();
            resolve(sesiones.has(token) ? foto(s) : { estado: 'caducada' });
        };
        const t = setTimeout(fin, ESPERA_MAX_MS);
        s.esperas.add(fin);
        alCerrarse?.(() => { hecho = true; clearTimeout(t); s.esperas.delete(fin); });
    });
}

/**
 * El ordenador cuenta al teléfono cómo ha ido el ajuste que pidió.
 *
 * `remedido` dice que el ordenador ha VUELTO A MEDIR la planta: entonces
 * `zonas` es lo que ha quedado (puede estar vacío) y `muros` son las paredes
 * NUEVAS, ya en el lienzo del teléfono. Se guardan en la sesión —no en el
 * resultado, que el teléfono consulta cada 2,5 s— y el teléfono vuelve a pedir
 * la planta al ver `remedido`: sin eso seguía pintando las zonas nuevas sobre
 * las paredes de antes, una combinación que no existe.
 */
function responder(token, expediente, { n, ok, texto, lineas, zonas, muros, remedido } = {}) {
    const s = deEse(token, expediente);
    if (!s) return false;
    s.respuestas = (s.respuestas || 0) + 1;
    s.resultado = {
        // `serial` distingue una respuesta de la anterior aunque digan lo mismo:
        // es lo que mira el teléfono para saber que ha llegado una nueva.
        serial: s.respuestas,
        n: Number(n) || s.pedido?.n || 0,
        ok: !!ok,
        texto: String(texto || '').slice(0, 400),
        lineas: (Array.isArray(lineas) ? lineas : []).slice(0, 10).map(l => String(l).slice(0, 120)),
        // Las zonas que han salido, en el lienzo del teléfono: para que las vea.
        zonas: zonasLimpias(zonas),
        remedido: !!remedido,
    };
    if (remedido) {
        // La planta ya tiene sus zonas: la propuesta de antes ya no es de nada.
        s.propuesta = [];
        const nuevos = murosLimpios(muros);
        s.plano = { ...s.plano, zonas: s.resultado.zonas, ...(nuevos.length ? { muros: nuevos } : {}) };
    } else if (ok && s.resultado.zonas.length) {
        s.plano = { ...s.plano, zonas: s.resultado.zonas };
    }
    // El croquis ya está aplicado: lo pintado pasa a ser zonas. El teléfono
    // arranca limpio si quiere corregir algo.
    if (ok) { s.trazos = []; s.enCurso = null; }
    tocar(s);
    return true;
}

// ── Las FOTOS de las paredes ─────────────────────────────────────────────────

/** La sesión viva de un token, para las rutas de fotos del teléfono. */
function viva(token) {
    limpiar();
    const s = sesiones.get(token);
    return s && !s.cerrada ? s : null;
}

/** Lo que las rutas de fotos necesitan saber: de qué expediente y qué paredes. */
function paraFotos(token) {
    const s = viva(token);
    if (!s) return null;
    return { expediente: s.expediente, negocio: s.negocio,
             paredes: s.plano.muros.filter(m => m.id) };
}

/** Una pared de ESTA planta, o null. Nada fuera de ella se puede tocar. */
function pared(token, id) {
    const s = viva(token);
    if (!s || !RE_ID.test(String(id || ''))) return null;
    return s.plano.muros.find(m => m.id === id) || null;
}

/** Se va a subir una foto: ¿queda cupo? */
function puedeSubir(token) {
    const s = viva(token);
    return !!s && s.subidas < MAX_SUBIDAS;
}

/** Se va a leer una foto (llamada de pago): ¿queda cupo? Si queda, se gasta. */
function gastaLectura(token) {
    const s = viva(token);
    if (!s || s.lecturas >= MAX_LECTURAS) return false;
    s.lecturas += 1;
    return true;
}

/**
 * Algo ha cambiado en las fotos (una subida, una lectura sellada): el ordenador,
 * que está en su espera larga, se despierta y refresca las suyas.
 */
function apuntarFoto(token, { subida = false } = {}) {
    const s = viva(token);
    if (!s) return false;
    s.fotos += 1;
    if (subida) s.subidas += 1;
    tocar(s);
    return true;
}

/** Un hueco leído de una foto, tal y como se le manda poner al ordenador. */
function huecoLimpio(h) {
    if (!RE_ID.test(String(h?.uid || ''))) return null;
    const ancho = num(h?.ancho), alto = num(h?.alto);
    const b = h?.box;
    const caja = b && ['x', 'y', 'ancho', 'alto'].every(k => Number.isFinite(Number(b[k])))
        ? { x: Number(b.x), y: Number(b.y), ancho: Number(b.ancho), alto: Number(b.alto) } : null;
    const texto = (v, n) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, n));
    return {
        uid: String(h.uid),
        tipo: h?.tipo === 'puerta' ? 'puerta' : 'ventana',
        ancho: ancho > 0 ? ancho : null,
        alto: alto > 0 ? alto : null,
        box: caja,
        material_marco: texto(h?.material_marco, 40),
        acristalamiento: texto(h?.acristalamiento, 40),
        persiana: typeof h?.persiana === 'boolean' ? h.persiana : null,
        descripcion: texto(h?.descripcion, 160),
        planta: Number.isInteger(h?.planta) ? h.planta : null,
    };
}

/**
 * El teléfono ha revisado lo leído y pide que se PONGA en el plano. Lo pone el
 * ordenador (su espera larga lo ve), que es quien tiene el trabajo del plano.
 *
 * Uno cada vez: si el anterior aún no se ha puesto, se espera. Dos pedidos
 * seguidos sobre la misma pared se pisarían el «ya tiene N huecos».
 */
function pedirHuecos(token, { pared: id, huecos, reemplaza = false, drive_id: driveId, id_local: idLocal } = {}) {
    const s = viva(token);
    if (!s) return { ok: false, motivo: 'cerrada' };
    // Un reenvío de un pedido que SÍ llegó (se perdió la respuesta): lo de
    // entonces. Va antes que «pendiente», que es justo lo que contestaría.
    const antes = yaHecho(token, 'huecos', idLocal);
    if (antes) return antes;
    const m = s.plano.muros.find(x => x.id === id);
    if (!m) return { ok: false, motivo: 'pared' };
    if (m.admite === false) return { ok: false, motivo: 'no_admite' };
    const lista = (Array.isArray(huecos) ? huecos : []).slice(0, MAX_HUECOS).map(huecoLimpio).filter(Boolean);
    if (!lista.length) return { ok: false, motivo: 'vacio' };
    if (s.pedidoHuecos) return { ok: false, motivo: 'pendiente' };
    s.pedidoHuecos = {
        n: (s.respuestasHuecos || 0) + 1,
        pared: id, huecos: lista, reemplaza: !!reemplaza,
        drive_id: RE_DRIVE.test(String(driveId || '')) ? String(driveId) : null,
    };
    s.resultadoHuecos = null;
    tocar(s);
    const r = { ok: true, n: s.pedidoHuecos.n };
    apuntarHecho(token, 'huecos', idLocal, r);
    return r;
}

/**
 * El ordenador cuenta cómo ha ido. El pedido se RETIRA al contestar: si la
 * ventana se recarga, no lo vuelve a ver y no duplica los huecos de la pared.
 */
function responderHuecos(token, expediente, { n, ok, texto, pared: id, total } = {}) {
    const s = deEse(token, expediente);
    if (!s) return false;
    s.respuestasHuecos = (s.respuestasHuecos || 0) + 1;
    s.resultadoHuecos = {
        serial: s.respuestasHuecos,
        n: Number(n) || s.pedidoHuecos?.n || 0,
        ok: !!ok,
        texto: String(texto || '').slice(0, 300),
        pared: RE_ID.test(String(id || '')) ? String(id) : (s.pedidoHuecos?.pared || null),
        total: Number.isInteger(total) ? total : null,
    };
    s.pedidoHuecos = null;
    tocar(s);
    return true;
}

/**
 * El ordenador cuenta cómo están las paredes AHORA (sus huecos, su nombre, si
 * admiten ventanas): lo que se cambia en el plano del ordenador —o lo que acaba
 * de poner a petición del teléfono— se ve también en el teléfono.
 */
function actualizarParedes(token, expediente, paredes = {}) {
    const s = deEse(token, expediente);
    if (!s || !paredes || typeof paredes !== 'object') return false;
    let cambia = false;
    s.plano = {
        ...s.plano,
        muros: s.plano.muros.map((m) => {
            const p = m.id && paredes[m.id];
            if (!p) return m;
            const meta = metaLimpia({ ...p, id: m.id });
            const nuevo = { ...m, ...meta };
            if (JSON.stringify(nuevo) !== JSON.stringify(m)) cambia = true;
            return nuevo;
        }),
    };
    if (cambia) {
        s.paredesV += 1;
        renovar(s);
    }
    return true;
}

/** Las paredes tal y como están ahora, sin la geometría (lo ligero). */
function paredesMovil(token) {
    const s = viva(token);
    if (!s) return null;
    const salida = {};
    for (const m of s.plano.muros) {
        if (!m.id) continue;
        const { svg, ...meta } = m;
        salida[m.id] = meta;
    }
    return { paredes: salida, paredesV: s.paredesV };
}

/** El ordenador cierra (el teléfono lo verá como «cerrada»). */
function cerrar(token, expediente) {
    const s = deEse(token, expediente);
    if (!s) return false;
    s.cerrada = true;
    despertar(s);
    // Se deja un rato para que el teléfono llegue a ver que se ha cerrado.
    s.caduca = Math.min(s.caduca, Date.now() + 60_000);
    return true;
}

module.exports = {
    VIDA_MINUTOS, VIDA_MAXIMA_HORAS, USOS,
    yaHecho, apuntarHecho,
    abrir, paraMovil, estadoMovil, actualizar, pedirAjuste,
    esperar, responder, cerrar,
    paraFotos, pared, puedeSubir, gastaLectura, apuntarFoto,
    pedirHuecos, responderHuecos, actualizarParedes, paredesMovil,
    MAX_SUBIDAS, MAX_LECTURAS,
    _sesiones: sesiones, // para las pruebas
};
