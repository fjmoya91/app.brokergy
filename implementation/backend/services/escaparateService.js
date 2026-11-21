// ─── El ESCAPARATE del instalador: lo que comparten la app, la revisión y la web ─
//
// Fase 3 de la app del instalador (Fran, 21/11/2026): «Tu página web». El
// instalador PROPONE fotos (de sus obras o sueltas) y textos; BROKERGY los REVISA
// y solo lo aprobado sale en brokergy.es. Aquí vive lo que no puede decidirse en
// dos sitios:
//   1. De qué fase y actuación es una foto de obra y el «publicar» de siempre
//      (`publicarFotoDeObra`): lo usan el botón «Publicar en el escaparate» del
//      gestor (routes/oportunidades.js) y el «Aprobar» de la cola de revisión.
//   2. Qué texto se admite (`validarTextos`): ni teléfonos, ni emails, ni webs, ni
//      precios — el contacto va siempre por BROKERGY.
//   3. Quién sale en la web y con qué SLUG (`redDeInstaladores`): el MISMO criterio
//      que `scripts/red.mjs` del repo brokergy-web, que genera las fichas.
//   4. Los avisos (al equipo cuando entra algo, al instalador cuando se resuelve):
//      detrás de `ESCAPARATE_AVISOS_ENABLED`, APAGADO, y en la fase 3 no se envía
//      ninguno.
//
// REGLA DE ORO del escaparate: en lo público, CERO datos de clientes (ni nombre,
// ni dirección, ni nº de expediente); geografía, solo el municipio; nunca importes
// por obra ni nº de serie. Ver docs/conocimiento/instalador-app/app-del-instalador-fase-3.md.
const crypto = require('crypto');
const supabase = require('./supabaseClient');
const { enLotes } = require('../utils/consultaLotes');

// ── 1. La foto de una obra ───────────────────────────────────────────────────
// Deriva fase y actuación del nombre del slot FOTO_* (movido tal cual de
// routes/oportunidades.js, que lo usaba solo para el botón del gestor).
function faseDeSlot(slot) {
    const s = (slot || '').toUpperCase();
    if (s.includes('DESPUES') || s.startsWith('FOTO_UNIDAD') || s.includes('DESMONTADA') || s.includes('DEPOSITO')) return 'DESPUES';
    return 'ANTES';
}
function actuacionDeSlot(slot) {
    const s = (slot || '').toUpperCase();
    if (s.includes('CALDERA') || s.includes('UNIDAD') || s.includes('ACS')) return 'aerotermia';
    if (s.includes('VENTANA')) return 'ventanas';
    if (s.includes('CUBIERTA')) return 'cubierta';
    if (s.includes('FACHADA')) return 'fachada';
    if (s.includes('SUELO')) return 'suelo';
    return 'obra';
}

/** Instalador + expediente + municipio de una oportunidad (para la foto pública). */
async function escaparateContext(opp) {
    const instalador_id = opp.instalador_asociado_id || opp.prescriptor_id || null;
    const { data: exp } = await supabase.from('expedientes').select('id').eq('oportunidad_id', opp.id).maybeSingle();
    let municipio = (opp.datos_calculo?.inputs?.municipio || opp.municipio || '').trim();
    if (!municipio && opp.cliente_id) {
        const { data: c } = await supabase.from('clientes').select('municipio').eq('id_cliente', opp.cliente_id).maybeSingle();
        municipio = (c?.municipio || '').trim();
    }
    return { instalador_id, expediente_id: exp?.id || null, municipio: municipio || null };
}

/**
 * PUBLICA una foto de una obra (el camino de siempre del botón del gestor).
 * Idempotente por (expediente, drive_id): si la fila existe (también si la propuso
 * el instalador y estaba en revisión), se actualiza y queda PUBLICADA.
 * `revisor` = id_usuario del ADMIN que la publica o aprueba.
 * Devuelve `{ ok, fase, actuacion }` o `{ error, code, status }`.
 */
async function publicarFotoDeObra({ opp, slot, driveId, titulo_publico, actuacion, consentimiento_cliente, revisor = null, ctx = null }) {
    const c = ctx || await escaparateContext(opp);
    if (!c.instalador_id) return { status: 400, error: 'La oportunidad no tiene instalador asignado.', code: 'NO_INSTALADOR' };
    if (!c.expediente_id) return { status: 400, error: 'La oportunidad no tiene expediente; no se puede publicar.', code: 'NO_EXPEDIENTE' };
    const fase = faseDeSlot(slot);
    const act = actuacion || actuacionDeSlot(slot);
    // Empareja ANTES↔DESPUÉS de la misma actuación en el mismo expediente (par_id compartido).
    const { data: pareja } = await supabase.from('instalador_fotos_escaparate')
        .select('par_id').eq('expediente_id', c.expediente_id).eq('actuacion', act)
        .not('par_id', 'is', null).limit(1).maybeSingle();
    const par_id = pareja?.par_id || crypto.randomUUID();
    const { data: exist } = await supabase.from('instalador_fotos_escaparate')
        .select('id').eq('expediente_id', c.expediente_id).eq('drive_id', driveId).maybeSingle();
    const row = {
        instalador_id: c.instalador_id, expediente_id: c.expediente_id, drive_id: driveId,
        fase, actuacion: act, par_id, titulo_publico: (titulo_publico || '').trim() || null,
        municipio: c.municipio, consentimiento_cliente: !!consentimiento_cliente,
        origen: 'OBRA', slot: slot || null,
        estado: 'PUBLICADA', motivo_rechazo: null, revisada_por: revisor, revisada_at: new Date().toISOString(),
    };
    const { error } = exist
        ? await supabase.from('instalador_fotos_escaparate').update(row).eq('id', exist.id)
        : await supabase.from('instalador_fotos_escaparate').insert(row);
    if (error) throw new Error(error.message);
    return { ok: true, fase, actuacion: act };
}

// ── 2. Los textos ────────────────────────────────────────────────────────────
// A qué se dedica: lista CERRADA (los chips del prototipo). `aerotermia` y
// `fotovoltaica` son las que ya usaba la ficha (especialidades de prescriptores).
const ESPECIALIDADES = [
    { id: 'aerotermia', texto: 'Aerotermia' },
    { id: 'suelo_radiante', texto: 'Suelo radiante' },
    { id: 'fotovoltaica', texto: 'Placas solares' },
    { id: 'aire_acondicionado', texto: 'Aire acondicionado' },
    { id: 'calderas', texto: 'Calderas' },
];
const MAX_PRESENTACION = 300;
const MAX_PUEBLOS = 15;
const MAX_PUEBLO = 60;

const PROHIBIDO = [
    // Un teléfono: 9 cifras seguidas que empiezan por 6, 7, 8 o 9 (con espacios, puntos o guiones entre medias), o con +34 / 0034.
    { code: 'TEXTO_CON_TELEFONO', re: /(?:\+|00)\s*34|(?<!\d)[6789](?:[\s.\-/]?\d){8}(?!\d)/, msg: 'Hay un teléfono en tu texto. En tu página el cliente te contacta por BROKERGY: quítalo y vuelve a guardar.' },
    { code: 'TEXTO_CON_EMAIL', re: /[^\s@]+\s*(?:@|\(at\)|\barroba\b)\s*[^\s@]+\.[a-z]{2,}/i, msg: 'Hay un correo electrónico en tu texto. El cliente te contacta por BROKERGY: quítalo y vuelve a guardar.' },
    { code: 'TEXTO_CON_WEB', re: /\bhttps?:\/\/|\bwww\.|\b[a-z0-9][a-z0-9-]*\.(?:es|com|net|org|eu|info|biz|cat|online|site|shop|store|pro|app)\b/i, msg: 'Hay una página web en tu texto. En tu página solo sale BROKERGY: quítala y vuelve a guardar.' },
    { code: 'TEXTO_CON_PRECIO', re: /\d[\d.,\s]*(?:€|euros?\b|eur\b)|€\s*\d|\bprecios?\b|\btarifas?\b/i, msg: 'Hay un precio en tu texto. Los precios no salen en tu página: quítalo y vuelve a guardar.' },
];
/** El primer motivo por el que un texto no se admite, o null. */
function textoProhibido(s) {
    const t = String(s || '');
    for (const p of PROHIBIDO) if (p.re.test(t)) return p;
    return null;
}
const limpio = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Valida lo que propone el instalador. Devuelve `{ ok: true, valores }` o
 * `{ ok: false, code, error, campo }` (el servidor contesta 400 con eso).
 */
function validarTextos(body = {}) {
    const presentacion = limpio(body.presentacion);
    if (presentacion.length > MAX_PRESENTACION) {
        return { ok: false, code: 'TEXTO_LARGO', campo: 'presentacion', error: `La presentación es muy larga: como mucho ${MAX_PRESENTACION} letras (llevas ${presentacion.length}).` };
    }
    const ids = new Set(ESPECIALIDADES.map((e) => e.id));
    const esp = Array.isArray(body.especialidades) ? body.especialidades.map((x) => String(x || '').trim().toLowerCase()) : [];
    const fuera = esp.filter((x) => !ids.has(x));
    if (fuera.length) return { ok: false, code: 'ESPECIALIDAD_NO_VALIDA', campo: 'especialidades', error: 'Elige a qué te dedicas de la lista.' };
    const crudos = Array.isArray(body.pueblos) ? body.pueblos : String(body.pueblos || '').split(/[,;\n]+/);
    const pueblos = [...new Set(crudos.map(limpio).filter(Boolean))];
    if (pueblos.length > MAX_PUEBLOS) return { ok: false, code: 'DEMASIADOS_PUEBLOS', campo: 'pueblos', error: `Pon como mucho ${MAX_PUEBLOS} pueblos: los que más trabajas.` };
    if (pueblos.some((p) => p.length > MAX_PUEBLO || !/^[\p{L}][\p{L}\s'’().\-]*$/u.test(p))) {
        return { ok: false, code: 'PUEBLO_NO_VALIDO', campo: 'pueblos', error: 'Escribe solo el nombre de cada pueblo, separados por comas (por ejemplo: Tomelloso, Socuéllamos).' };
    }
    for (const [campo, v] of [['presentacion', presentacion], ['pueblos', pueblos.join(', ')]]) {
        const p = textoProhibido(v);
        if (p) return { ok: false, code: p.code, campo, error: p.msg };
    }
    if (!presentacion && !esp.length && !pueblos.length) return { ok: false, code: 'TEXTOS_VACIOS', campo: 'presentacion', error: 'Escribe algo antes de guardar.' };
    return { ok: true, valores: { presentacion: presentacion || null, especialidades: [...new Set(esp)], pueblos } };
}

// ── 3. Quién sale en la web y con qué slug (el criterio de brokergy-web/scripts/red.mjs) ──
// red.mjs (08/11/2026): salen TODOS los INSTALADORES con al menos una obra (un
// expediente sin rechazar), salvo BROKERGY, la ficha de prueba y los marcados
// `oculto_web`. La obra es del instalador del expediente o, si no tiene, del de su
// oportunidad o, si no, del prescriptor de la oportunidad cuando es un INSTALADOR.
// Slug: `marketplace_slug` o el de su nombre, con «-2» si se repite.
// Diferencia conocida: red.mjs además salta las obras cuyo municipio no tiene centro
// en `municipio_geo`; aquí no se mira (no cambia ningún slug con marketplace_slug y
// la web solo pide los slugs que ella misma ha generado).
const FUERA_RED = new Set(['BROKERGY', 'INSTALADOR PRUEBA SL']);
const slugDe = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const RED_TTL_MS = 10 * 60 * 1000;
let _red = null; // { at, porSlug: Map, porId: Map }

const okDe = ({ data, error }) => { if (error) throw new Error(error.message); return data || []; };
async function todas(construir) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {
        const filas = okDe(await construir().range(desde, desde + 999));
        out.push(...filas);
        if (filas.length < 1000) return out;
    }
}

async function cargarRed() {
    const presc = await todas(() => supabase.from('prescriptores')
        .select('id_empresa, acronimo, razon_social, marketplace_slug, oculto_web').eq('tipo_empresa', 'INSTALADOR'));
    const instBy = new Map(presc.filter((p) => { const n = (p.acronimo || p.razon_social || '').trim(); return n && !FUERA_RED.has(n.toUpperCase()); }).map((p) => [p.id_empresa, p]));
    const exps = (await todas(() => supabase.from('expedientes').select('id, oportunidad_id, estado, instalador_asociado_id')))
        .filter((e) => !/^RECHAZ/i.test(String(e.estado || '').trim()));
    const ops = await enLotes([...new Set(exps.map((e) => e.oportunidad_id).filter(Boolean))],
        (ids) => supabase.from('oportunidades').select('id, instalador_asociado_id, prescriptor_id').in('id', ids));
    const opBy = new Map(ops.map((o) => [o.id, o]));
    const conObra = new Set();
    for (const e of exps) {
        const o = opBy.get(e.oportunidad_id) || {};
        const quien = [e.instalador_asociado_id, o.instalador_asociado_id, o.prescriptor_id].find((id) => id && instBy.has(id));
        if (quien) conObra.add(quien);
    }
    const usados = new Set();
    const porSlug = new Map();
    const porId = new Map();
    for (const p of instBy.values()) {
        if (!conObra.has(p.id_empresa)) continue;
        const nombre = (p.acronimo || p.razon_social || '').trim();
        let slug = p.marketplace_slug || slugDe(nombre);
        while (usados.has(slug)) slug += '-2';
        usados.add(slug);
        const x = { id: p.id_empresa, slug, nombre, oculto: !!p.oculto_web };
        porSlug.set(slug, x);
        porId.set(p.id_empresa, x);
    }
    return { at: Date.now(), porSlug, porId };
}

/** La red (cacheada 10 min). Lanza si la BD no contesta: la ruta responde 503, nunca «no existe». */
async function redDeInstaladores({ fresca = false } = {}) {
    if (!fresca && _red && Date.now() - _red.at < RED_TTL_MS) return _red;
    _red = await cargarRed();
    return _red;
}
/** Para los tests. */
function _olvidarRed() { _red = null; }

/** El slug y si sale en la web de un instalador (lo que ve en «Tu página web»). */
async function slugDeInstalador(instaladorId) {
    const red = await redDeInstaladores();
    const x = red.porId.get(instaladorId);
    return x ? { slug: x.slug, sale: !x.oculto } : { slug: null, sale: false };
}

// ── 4. Los avisos (APAGADOS en la fase 3) ────────────────────────────────────
const avisosEncendidos = (env = process.env) => String(env.ESCAPARATE_AVISOS_ENABLED || '').toLowerCase() === 'true';
/**
 * El punto donde irá el aviso. `evento`: 'propuesta' (al equipo: algo nuevo en la
 * cola) o 'resuelta' (al instalador: aprobada o «no vale», con su motivo).
 * En la fase 3 NO se envía nada, con el interruptor encendido o apagado: solo se
 * deja el rastro en el log. Cablearlo (WhatsApp por `staffOClaveInterna`, regla 102)
 * es de la fase siguiente, con un «sí» de Fran al texto.
 */
function avisoEscaparate(evento, datos = {}) {
    if (!avisosEncendidos()) return { enviado: false, motivo: 'ESCAPARATE_AVISOS_ENABLED apagado' };
    console.log(`[escaparate] aviso «${evento}» preparado y NO enviado (fase 3): ${JSON.stringify({ instalador: datos.instalador_id, n: datos.n || 1 })}`);
    return { enviado: false, motivo: 'sin canal en la fase 3' };
}

// ── Miniatura de un fichero de Drive (el mismo respaldo que /foto/:id) ───────
async function bytesDeFoto(driveId, size = '800') {
    const axios = require('axios');
    const tryFetch = async (url) => {
        try {
            const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 9000, maxRedirects: 5, validateStatus: (s) => s === 200 });
            return { buf: Buffer.from(r.data), type: r.headers['content-type'] || 'image/jpeg' };
        } catch { return null; }
    };
    let img = await tryFetch(`https://lh3.googleusercontent.com/d/${driveId}=w${size}`);
    if (!img) img = await tryFetch(`https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}`);
    if (!img) {
        const buf = await require('./driveService').getFileContent(driveId);
        if (!buf) return null;
        img = { buf: Buffer.from(buf), type: 'image/jpeg' };
    }
    return img;
}

// ── Tipo de una imagen por sus BYTES (nunca por el nombre ni por lo que diga el navegador) ──
function tipoImagen(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
    if (buf.slice(4, 8).toString('ascii') === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(buf.slice(8, 12).toString('ascii'))) return { mime: 'image/heic', ext: 'heic' };
    return null;
}

module.exports = {
    faseDeSlot, actuacionDeSlot, escaparateContext, publicarFotoDeObra,
    ESPECIALIDADES, MAX_PRESENTACION, MAX_PUEBLOS, validarTextos, textoProhibido,
    redDeInstaladores, slugDeInstalador, slugDe, _olvidarRed,
    avisoEscaparate, avisosEncendidos, bytesDeFoto, tipoImagen,
};
