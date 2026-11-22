// =============================================================================
// viviendaCandidata — ¿QUÉ casa es? La vivienda del Catastro que corresponde a la
// dirección que da un instalador (22/11/2026, agente de presupuestos del grupo).
//
// La dirección que da el cliente y la del Catastro suelen bailar de número, así que
// esto NO decide: propone la vivienda candidata (o la lista de viviendas de la
// parcela) para que el instalador la CONFIRME con la foto de la fachada.
//
// REGLAS (15-17 del Catastro): TODO EN SERIE, nunca `Promise.all`; solo por las
// funciones de `catastroService` (WCF JSON, su cliente HTTP y su caché). Google solo
// geocodifica la dirección (`googleService.searchAddress`).
// =============================================================================

const limpio = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const titulo = (s) => limpio(s).toLowerCase().replace(/(^|[\s-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());

/**
 * La misma dirección con OTRO número de portal. Pura.
 * «CL MURCIA 2, Tomelloso» + «4» → «CL MURCIA 4, Tomelloso». Sin número, se añade tras la calle.
 */
function cambiarNumero(direccion, numero) {
    const d = limpio(direccion);
    const n = limpio(numero);
    if (!n) return d;
    const [calle, ...resto] = d.split(',');
    // El primer número de la calle que no sea un código postal (5 cifras).
    const re = /(\b(?:n[ºo°]\.?\s*)?)(\d{1,4}[a-z]?)(?!\d)\b/i;
    const nueva = re.test(calle) ? calle.replace(re, (m, pre) => `${pre}${n}`) : `${calle.trim()} ${n}`;
    return [nueva.trim(), ...resto.map(s => s.trim())].filter(Boolean).join(', ');
}

/** Planta y puerta legibles: «planta 1, puerta A». Pura. */
function plantaPuerta(v) {
    const pt = limpio(v.floor).replace(/^0+(?=\d)/, '');
    const pu = limpio(v.door).replace(/^0+(?=\d)/, '');
    const p = [];
    if (pt) p.push(/^(BJ|BA|00|0)$/i.test(pt) ? 'bajo' : `planta ${pt}`);
    if (pu) p.push(`puerta ${pu}`);
    return p.join(', ') || 'sin planta ni puerta';
}

/** Un inmueble de `getByRC` (una vivienda) → lo que se enseña. Pura. */
function deFicha(d) {
    return {
        rc: limpio(d.rc).toUpperCase(),
        direccion: limpio(d.street) || limpio(d.address).replace(/\s+\d{5}\b.*$/, ''),
        municipio: titulo(d.municipality) || null,
        provincia: titulo(d.province) || null,
        codigo_postal: d.postalCode || null,
        superficie: Number(d.totalSurface) || null,
        anio: Number(d.yearBuilt) || null,
        uso: d.use || null,
    };
}

/** Un inmueble de la lista de una parcela → lo que se enseña. Pura. */
function deInmueble(i, parcela) {
    return {
        rc: limpio(i.rc).toUpperCase(),
        direccion: limpio(i.address).replace(/\s+\d{5}\b.*$/, '') || limpio(parcela?.address),
        municipio: titulo(parcela?.municipality) || null,
        provincia: titulo(parcela?.province) || null,
        codigo_postal: parcela?.postalCode || null,
        superficie: Number(i.surface) || null,
        anio: Number(i.yearBuilt) || Number(parcela?.yearBuilt) || null,
        planta: plantaPuerta(i),
    };
}

/** Lo que devuelve el Catastro de UNA referencia → candidata(s). */
async function deReferencia(rc, cat) {
    const d = await cat.getByRC(rc);
    if (!d) return { tipo: 'ninguna' };
    if (d.isParcela) {
        let inm = (d.dwellings || []).filter(i => i.isResidential !== false);
        if (!inm.length && cat.getDwellingsByParcel) {
            const todas = await cat.getDwellingsByParcel(String(rc).slice(0, 14));
            inm = (todas || []).filter(i => i.isResidential !== false);
        }
        const viviendas = inm.slice(0, 30).map(i => deInmueble(i, d));
        if (!viviendas.length) return { tipo: 'ninguna' };
        if (viviendas.length === 1) return { tipo: 'una', vivienda: viviendas[0], rcFachada: viviendas[0].rc };
        return { tipo: 'varias', viviendas, total: viviendas.length, direccion: limpio(d.address), rcFachada: limpio(rc).slice(0, 14) };
    }
    const v = deFicha(d);
    return { tipo: 'una', vivienda: v, rcFachada: v.rc };
}

/**
 * La(s) vivienda(s) del Catastro para una dirección: Google → coordenadas → RC → ficha.
 * @param {{ direccion, municipio?, provincia?, numero? }} q
 * @param {{ google, catastro }} deps
 * @returns {Promise<{ tipo: 'una'|'varias'|'ninguna', vivienda?, viviendas?, rcFachada? }>}
 * Un Catastro bloqueado o caído LANZA (lo decide quien llama: es un «ahora no puedo»,
 * no un «esa casa no existe»).
 */
async function candidatos(q, deps = {}) {
    const google = deps.google || require('./googleService');
    const cat = deps.catastro || require('./catastroService');
    const consulta = [q.direccion, q.municipio, q.provincia].map(limpio).filter(Boolean).join(', ');
    if (!consulta) return { tipo: 'ninguna' };
    const res = await google.searchAddress(consulta);
    const loc = (res || [])[0]?.location;
    if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) return { tipo: 'ninguna' };
    const num = (/(\d{1,4})[a-z]?\b/i.exec(limpio(q.direccion).split(',')[0]) || [])[1] || q.numero || null;
    const r = await cat.getRCByCoords(Number(loc.lat), Number(loc.lng), num);
    if (!r?.rc) return { tipo: 'ninguna' };
    await new Promise(ok => setTimeout(ok, deps.pausaMs ?? 400));      // en serie y sin ráfaga (regla 17)
    return deReferencia(r.rc, cat);
}

/** Por referencia catastral (dictada o escrita). Mismo resultado que `candidatos`. */
async function porRc(rc, deps = {}) {
    const cat = deps.catastro || require('./catastroService');
    const r = limpio(rc).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (r.length < 14) return { tipo: 'ninguna' };
    try {
        return await deReferencia(r, cat);
    } catch (e) {
        if (/^RC_/.test(String(e.code || ''))) return { tipo: 'ninguna' };
        throw e;
    }
}

/**
 * La foto de la fachada (la misma que sirve /api/catastro/image/:rc): una foto rota se
 * cambia por su miniatura EXIF y, sin ninguna de las dos, null. Nunca lanza.
 * @returns {Promise<{ buffer: Buffer, mimetype: string } | null>}
 */
async function fachada(rc, deps = {}) {
    const cat = deps.catastro || require('./catastroService');
    try {
        const img = await cat.getFacadeImage(rc);
        if (!img?.data) return null;
        let cuerpo = img.data;
        if (cat.fachadaCompleta && !cat.fachadaCompleta(cuerpo)) {
            if (!img.miniatura) return null;
            cuerpo = img.miniatura;
        }
        return { buffer: Buffer.from(cuerpo), mimetype: String(img.contentType || 'image/jpeg').split(';')[0] };
    } catch {
        return null;
    }
}

/** «CL MURCIA 2, Tomelloso · vivienda de 145 m², año 1978». Pura. */
function describir(v) {
    const donde = [limpio(v.direccion), v.municipio].filter(Boolean).join(', ');
    const que = [v.superficie ? `vivienda de ${v.superficie} m²` : 'vivienda', v.anio ? `año ${v.anio}` : null].filter(Boolean).join(', ');
    return `${donde} · ${que}`;
}

module.exports = { candidatos, porRc, fachada, describir, cambiarNumero, plantaPuerta, deFicha, deInmueble };
