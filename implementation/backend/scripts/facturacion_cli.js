// ─── facturacion_cli.js ──────────────────────────────────────────────────────
// PRESUPUESTOS y FACTURAS desde la terminal, para el asistente de Fran por
// WhatsApp («BROKERGY - CHAT»): lo mismo que el MCP (`crear_presupuesto`,
// `crear_factura`…), con el mismo criterio y por la MISMA API (/api/facturacion,
// `x-internal-key`). El cálculo es el de la app (`logic/presupuesto.js` y
// `logic/factura.js`, por import() ESM, como el backend): este script no calcula
// a su manera ni compone mensajes propios.
//
//   articulos [texto] [--ids]                     el catálogo, con precio y variantes
//   cliente <texto>                               fichas por nombre, teléfono, NIF o email
//
//   presupuesto preparar --json <f|-|{…}>         EN SECO: el borrador entero, sin escribir nada
//   presupuesto crear    --json … [--a-fran]      BORRADOR (gasta el nº P-26ING) + su PDF
//   presupuesto cambiar  <nº> --json … [--a-fran] cambia un BORRADOR (mismo nº) + PDF nuevo
//   presupuesto ver      <nº> [--pdf] [--a-fran]
//   presupuesto mensaje  <nº> [--canal whatsapp,email] [--mensaje-fichero f]   lo que recibiría
//   presupuesto enviar   <nº> --canal whatsapp|email [--mensaje-fichero f]      en seco
//   presupuesto enviar   <nº> --canal … --enviar --si "<lo que contestó Fran>"  lo manda
//
//   factura preparar --json …                     EN SECO (serie ING o FML)
//   factura crear    --json … [--a-fran]          BORRADOR (sin número) + PDF de borrador
//   factura ver      <nº|id> [--pdf] [--a-fran]
//   factura revisar  <id> [--a-fran]              el nº que le tocaría, errores y avisos
//   factura emitir   <id> --emitir --si "…"       le da el NÚMERO (ya no se borra: se rectifica)
//   factura mensaje  <nº> [--canal …]             lo que recibiría el cliente
//   factura enviar   <nº> --canal … [--enviar --si "…"]
//
//   mensual-fml [--crear] [--a-fran] [--otra]     la FML del mes: copia la última con el mes
//                                                 avanzado (en seco; --crear la deja en BORRADOR)
//
// REGLAS (las del MCP, regla 165/166 y el asistente):
// - Preparar no escribe. Crear un presupuesto GASTA un número de la serie P-26ING
//   aunque no se envíe: por eso «preparar» primero, y `cambiar` para corregir el
//   mismo borrador en vez de crear otro. Un precio que no está en el catálogo (o
//   que está a 0 €) NO se pone solo: la línea se para y se le pregunta a Fran.
// - Enviar al cliente y EMITIR una factura son «sí» distintos y explícitos: sin
//   `--enviar`/`--emitir` no sale nada; con ellos hace falta haber sacado antes ESE
//   mensaje (o esa revisión) en las últimas 24 h y `--si` con la respuesta LITERAL
//   de Fran, que queda apuntada en scratch/asistente/facturacion/registro.jsonl.
// - Teléfonos, emails y DNI salen ENMASCARADOS: el destinatario es el de la ficha.
// - Contra producción por defecto (BROKERGY_API_URL; en el contenedor del asistente,
//   http://backend:3000). Para probar en local: BROKERGY_API_URL=http://localhost:3030.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));

const API = String(process.env.FACTURACION_API_URL || process.env.BROKERGY_API_URL || 'https://app.brokergy.es').replace(/\/+$/, '');
const DIR = path.join(__dirname, '..', 'scratch', 'asistente', 'facturacion');
const VISTOS = path.join(DIR, 'vistos.json');
const REGISTRO = path.join(DIR, 'registro.jsonl');
const VIGENCIA_MS = 24 * 3600 * 1000;          // lo enseñado vale 24 h para el «sí»
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ── Argumentos ──────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const CON_VALOR = new Set(['json', 'canal', 'mensaje-fichero', 'si']);
const POS = [];
const OPT = {};
for (let i = 0; i < ARGS.length; i++) {
    const a = ARGS[i];
    if (a.startsWith('--')) {
        const k = a.slice(2);
        if (CON_VALOR.has(k)) { OPT[k] = ARGS[i + 1] ?? ''; i++; } else OPT[k] = true;
    } else POS.push(a);
}

// ── La lógica de la app (fuente única) ──────────────────────────────────────
const FRONT = path.join(__dirname, '../../frontend/src/features');
const _mod = {};
const cargar = (rel) => (_mod[rel] ||= import(pathToFileURL(path.join(FRONT, rel)).href));
const logica = () => cargar('facturacion/logic/presupuesto.js');
const plantilla = () => cargar('cee-directo/logic/ofertaCee.js');
const logicaFactura = () => cargar('facturacion/logic/factura.js');

// ── API ─────────────────────────────────────────────────────────────────────
async function api(ruta, { method = 'GET', body = null, binario = false, ms = 120_000 } = {}) {
    const key = process.env.INTERNAL_API_KEY;
    if (!key) throw new Error('Falta INTERNAL_API_KEY en el .env del backend.');
    let r;
    try {
        r = await fetch(`${API}${ruta}`, {
            method,
            headers: { 'x-internal-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(ms),
        });
    } catch (e) {
        throw Object.assign(new Error(`No contesta el backend (${API}): ${e.message}`), { status: 0 });
    }
    if (!r.ok) {
        let data = {};
        try { data = await r.json(); } catch { /* sin cuerpo */ }
        const msg = r.status === 404 && !data.error ? `${ruta} no existe en el backend (¿falta desplegar la facturación?)`
            : r.status === 503 ? (data.error || 'La base de datos no responde ahora mismo (503)')
                : (data.error || `Error ${r.status}`);
        throw Object.assign(new Error(msg), { status: r.status, data });
    }
    if (binario) return { buffer: Buffer.from(await r.arrayBuffer()) };
    return r.json();
}

// ── Formato (para pegar en un WhatsApp) ─────────────────────────────────────
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const miles = (n, dec = 2) => {
    const v = num(n);
    const [e, f] = Math.abs(v).toFixed(dec).split('.');
    return `${v < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${f ? `,${f}` : ''}`;
};
const eur = (n) => `${miles(n)} €`;
const uds = (n) => (Number.isInteger(num(n)) ? String(num(n)) : miles(n, 2));
const maskTel = (t) => { const s = String(t || '').replace(/\s+/g, ''); return !s ? null : s.length <= 4 ? s : `${s[0]}····${s.slice(-3)}`; };
const maskEmail = (e) => { if (!e) return null; const [u, d] = String(e).trim().split('@'); return d ? `${(u || '')[0] || ''}····@${d}` : '····'; };
const maskDni = (d) => { if (!d) return null; const s = String(d).replace(/\s+/g, ''); return s.length <= 4 ? '····' : `····${s.slice(-4)}`; };
const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const fechaEs = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEP = '─'.repeat(40);

class Parada extends Error { }            // falta algo que solo puede decir Fran: sale con código 2
const parar = (texto) => { throw new Parada(texto); };

// ── Lo que se ha ENSEÑADO (para que «enviar» y «emitir» exijan haberlo visto) ─
const hash = (s) => crypto.createHash('sha256').update(String(s ?? '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 20);
function leerVistos() {
    try { return JSON.parse(fs.readFileSync(VISTOS, 'utf8')); } catch { return {}; }
}
function guardarVistos(v) {
    const ahora = Date.now();
    for (const k of ['mensajes', 'revisadas', 'creados']) {
        v[k] = Object.fromEntries(Object.entries(v[k] || {}).filter(([, x]) => ahora - (x.t || 0) < VIGENCIA_MS));
    }
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(`${VISTOS}.tmp`, JSON.stringify(v, null, 1));
    fs.renameSync(`${VISTOS}.tmp`, VISTOS);
}
function marcarMensaje(clave, texto) {
    const v = leerVistos();
    v.mensajes = v.mensajes || {};
    v.mensajes[`${clave}:${hash(texto)}`] = { t: Date.now() };
    guardarVistos(v);
}
const mensajeVisto = (clave, texto) => {
    const x = (leerVistos().mensajes || {})[`${clave}:${hash(texto)}`];
    return !!x && Date.now() - x.t < VIGENCIA_MS;
};
function olvidarMensajes(clave) {
    const v = leerVistos();
    v.mensajes = Object.fromEntries(Object.entries(v.mensajes || {}).filter(([k]) => !k.startsWith(`${clave}:`)));
    guardarVistos(v);
}
function apuntar(accion, datos) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(REGISTRO, `${JSON.stringify({ t: new Date().toISOString(), accion, ...datos })}\n`);
}

// ── El dictado → el catálogo (copia del criterio del MCP, mcp-brokergy/server.js) ─
function sinTildes(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'e', 'un', 'una', 'unos', 'unas',
    'para', 'por', 'con', 'a', 'al', 'o', 'u', 'su', 'sus', 'le', 'lo']);
// Lo que se dicta no es lo que pone el catálogo: «placas» es «FV», «CEE» es «Certificado…».
const SINONIMOS = {
    placas: ['fv', 'fotovoltaic', 'solar', 'paneles'],
    paneles: ['fv', 'fotovoltaic', 'solar', 'placas'],
    solar: ['fv', 'fotovoltaic', 'placas'],
    fv: ['fotovoltaic', 'placas', 'solar'],
    fotovoltaica: ['fv', 'placas', 'solar'],
    fotovoltaico: ['fv', 'placas', 'solar'],
    cee: ['certificado de eficiencia', 'certificado energetico', 'eficiencia energetica'],
    certificado: ['cee'],
    legalizar: ['legaliz'],
    legalizacion: ['legaliz'],
    casa: ['vivienda', 'unifamiliar', 'chalet'],
    chalet: ['unifamiliar'],
};
const terminos = (texto) => sinTildes(texto).split(/[^a-z0-9]+/).filter(t => t && !PALABRAS_VACIAS.has(t));
function formasDe(termino) {
    const out = new Set([termino]);
    if (termino.length > 4 && termino.endsWith('es')) out.add(termino.slice(0, -2));
    if (termino.length > 3 && termino.endsWith('s')) out.add(termino.slice(0, -1));
    for (const f of [...out]) if (f.length > 5 && /[aeo]$/.test(f)) out.add(f.slice(0, -1));
    for (const f of [...out]) for (const s of (SINONIMOS[f] || [])) out.add(s);
    return [...out];
}
const casa = (termino, pajar) => formasDe(termino).some(f => pajar.includes(f));
function pajarArticulo(a) {
    const nombre = sinTildes(a.nombre);
    const siglas = nombre.split(/[^a-z0-9]+/).filter(p => p && !PALABRAS_VACIAS.has(p)).map(p => p[0]).join('');
    return ` ${nombre} ${sinTildes(a.familia)} ${siglas} `;
}
const opcionArticulo = (a) => `${a.nombre}${a.variantes?.length ? ` (${a.variantes.map(v => `${v.nombre} ${eur(v.precio)}`).join(' / ')})` : ` · ${eur(a.precio)}`} [${a.id}]`;

/** { articulo, sobrantes } | { ambiguo, opciones } | { noEncontrado, opciones }. Nunca elige entre empatados. */
function resolverArticulo(catalogo, ref) {
    const raw = String(ref ?? '').trim();
    const porId = catalogo.find(a => a.id === raw || (a.appsheet_id && String(a.appsheet_id) === raw));
    if (porId) return { articulo: porId, sobrantes: [] };
    const q = sinTildes(raw);
    const exactos = catalogo.filter(a => sinTildes(a.nombre) === q);
    if (exactos.length === 1) return { articulo: exactos[0], sobrantes: [] };
    const ts = terminos(raw);
    if (!ts.length) return { noEncontrado: true, opciones: [] };
    const puntuados = catalogo.map(a => {
        const pajar = pajarArticulo(a);
        const pajarVar = (a.variantes || []).map(v => ` ${sinTildes(v.nombre)} `).join('|');
        const enBase = ts.filter(t => casa(t, pajar));
        const enVariante = ts.filter(t => !casa(t, pajar) && casa(t, pajarVar));
        return { a, enBase: enBase.length, cubre: enBase.length + enVariante.length, sobrantes: ts.filter(t => !casa(t, pajar)) };
    });
    let completos = puntuados.filter(p => p.enBase > 0 && p.cubre === ts.length);
    // Las tasas las arrastra el artículo solo: en un empate cuentan si se ha dicho «tasa».
    const pideSuplido = ts.some(t => /^(tasa|tasas|suplido|suplidos)$/.test(t));
    if (!pideSuplido && completos.some(p => !p.a.suplido)) completos = completos.filter(p => !p.a.suplido);
    if (completos.length) {
        const max = Math.max(...completos.map(p => p.enBase));
        const mejores = completos.filter(p => p.enBase === max);
        if (mejores.length === 1) return { articulo: mejores[0].a, sobrantes: mejores[0].sobrantes };
        return { ambiguo: true, opciones: mejores.map(p => opcionArticulo(p.a)) };
    }
    const parecidos = puntuados.filter(p => p.enBase > 0).sort((x, y) => y.cubre - x.cubre || y.enBase - x.enBase).slice(0, 8);
    return { noEncontrado: true, opciones: parecidos.map(p => opcionArticulo(p.a)) };
}

/** La variante dicha o la que señalen sin duda las palabras sobrantes; si no, las opciones. */
function resolverVariante(articulo, ref, sobrantes = []) {
    const vars = Array.isArray(articulo.variantes) ? articulo.variantes : [];
    const raw = String(ref ?? '').trim();
    const opciones = vars.map(v => `${v.nombre} · ${eur(v.precio)} [${v.id}]`);
    if (!vars.length) {
        if (raw) return { error: `«${articulo.nombre}» no tiene variantes: quita «${raw}» (si es una aclaración, va en "detalle").` };
        return { variante: null };
    }
    const pajarDe = v => ` ${sinTildes(v.nombre)} `;
    if (raw) {
        const porId = vars.find(v => String(v.id) === raw);
        if (porId) return { variante: porId };
        const exactas = vars.filter(v => sinTildes(v.nombre) === sinTildes(raw));
        if (exactas.length === 1) return { variante: exactas[0] };
        const ts = terminos(raw);
        const hits = ts.length ? vars.filter(v => ts.every(t => casa(t, pajarDe(v)))) : [];
        if (hits.length === 1) return { variante: hits[0] };
        return { error: hits.length > 1 ? `«${raw}» encaja con varias variantes de «${articulo.nombre}».` : `«${articulo.nombre}» no tiene ninguna variante «${raw}».`, opciones };
    }
    if (sobrantes.length) {
        const hits = vars.filter(v => sobrantes.every(t => casa(t, pajarDe(v))));
        if (hits.length === 1) return { variante: hits[0] };
    }
    if (vars.length === 1) return { variante: vars[0] };
    return { error: `«${articulo.nombre}» tiene variantes: hay que decir cuál.`, opciones };
}

let _catalogo = null;
async function catalogo() {
    if (!_catalogo) {
        const d = await api('/api/facturacion/articulos?todos=1');
        _catalogo = (Array.isArray(d) ? d : d?.articulos || []).map(a => ({ ...a, precio: num(a.precio), iva_pct: num(a.iva_pct) }));
    }
    return _catalogo;
}

// ── Clientes (lectura directa, solo columnas ligeras: como el MCP; no hay ruta con clave interna) ─
const CLIENTE_FIELDS = 'id_cliente, nombre_razon_social, apellidos, dni, tlf, email, direccion, codigo_postal, municipio, provincia, es_empresa, notificaciones_contacto_activas, persona_contacto_nombre, persona_contacto_tlf, persona_contacto_email, prescriptor_id, prescriptores (razon_social, acronimo)';
const nombreDe = (c) => [c?.nombre_razon_social, c?.apellidos].filter(Boolean).join(' ').trim();
/** A quién le llega (el mismo criterio que `ceeOfertaService.destinoDe`: el desvío a la persona de contacto). */
function destinoDe(c) {
    if (!c) return { email: '', tlf: '', nombre: '' };
    if (c.notificaciones_contacto_activas && (c.persona_contacto_tlf || c.persona_contacto_email)) {
        return { email: c.persona_contacto_email || c.email || '', tlf: c.persona_contacto_tlf || c.tlf || '', nombre: c.persona_contacto_nombre || nombreDe(c), desvio: true };
    }
    return { email: c.email || '', tlf: c.tlf || '', nombre: nombreDe(c) };
}

/** Por nombre (todas las palabras, sin tildes), DNI, email o teléfono (los 9 últimos dígitos). */
async function buscarClientes(texto, limite = 15) {
    const raw = String(texto ?? '').trim();
    if (!raw) parar('Dime un nombre, teléfono, DNI o email.');
    const digitos = raw.replace(/\D/g, '');
    const esTelefono = digitos.length >= 6 && digitos.length >= raw.replace(/[\s+().-]/g, '').length - 1;
    let q = sb.from('clientes').select(CLIENTE_FIELDS).order('created_at', { ascending: false }).limit(1000);
    let ts = [];
    if (esTelefono) {
        const cola = digitos.slice(-9);
        q = q.or(`tlf.ilike.%${cola}%,dni.ilike.%${cola}%,persona_contacto_tlf.ilike.%${cola}%`);
    } else {
        ts = terminos(raw);
        if (!ts.length) parar('Dime un nombre, teléfono, DNI o email.');
        const patron = t => t.replace(/[aeioun]/g, '_');
        const fijo = t => patron(t).replace(/_/g, '').length;
        const mejor = [...ts].sort((a, b) => fijo(b) - fijo(a) || b.length - a.length)[0];
        const p = `%${patron(mejor)}%`;
        q = q.or(`nombre_razon_social.ilike.${p},apellidos.ilike.${p},dni.ilike.${p},email.ilike.${p}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`Clientes: ${error.message}`);
    let filas = data || [];
    if (!esTelefono) {
        filas = filas.filter(c => ts.every(t => ` ${sinTildes([c.nombre_razon_social, c.apellidos, c.dni, c.email].filter(Boolean).join(' '))} `.includes(t)));
        const qn = sinTildes(raw);
        filas.sort((x, y) => (sinTildes(nombreDe(y)) === qn) - (sinTildes(nombreDe(x)) === qn) || sinTildes(nombreDe(y)).startsWith(qn) - sinTildes(nombreDe(x)).startsWith(qn));
    }
    return { total: filas.length, clientes: filas.slice(0, limite) };
}
const lineaCliente = (c) => {
    const p = c.prescriptores;
    return `• *${nombreDe(c)}*${c.dni ? ` · ${maskDni(c.dni)}` : ''}${c.tlf ? ` · ${maskTel(c.tlf)}` : ' · sin teléfono'}${c.email ? ` · ${maskEmail(c.email)}` : ''}`
        + `${c.municipio ? ` · ${c.municipio}` : ''}${p ? ` · partner ${p.acronimo || p.razon_social}` : ''}\n  id: ${c.id_cliente}`;
};

async function fichaCliente(id) {
    const { data, error } = await sb.from('clientes').select(CLIENTE_FIELDS).eq('id_cliente', id).maybeSingle();
    if (error) throw new Error(`Clientes: ${error.message}`);
    return data || null;
}

async function resolverPrescriptor(ref) {
    const raw = String(ref ?? '').trim();
    if (!raw) return { id: null };
    if (UUID_RE.test(raw)) return { id: raw, nombre: raw };
    const { data, error } = await sb.from('prescriptores').select('id_empresa, razon_social, acronimo');
    if (error) throw new Error(error.message);
    const q = sinTildes(raw);
    const exactos = (data || []).filter(p => sinTildes(p.acronimo) === q || sinTildes(p.razon_social) === q);
    if (exactos.length === 1) return { id: exactos[0].id_empresa, nombre: exactos[0].acronimo || exactos[0].razon_social };
    const ts = terminos(raw);
    const hits = ts.length ? (data || []).filter(p => ts.every(t => ` ${sinTildes(`${p.razon_social || ''} ${p.acronimo || ''}`)} `.includes(t))) : [];
    if (hits.length === 1) return { id: hits[0].id_empresa, nombre: hits[0].acronimo || hits[0].razon_social };
    return { error: hits.length > 1 ? `El partner «${raw}» encaja con varios: ${hits.slice(0, 8).map(p => p.acronimo || p.razon_social).join(', ')}.` : `No encuentro ningún partner «${raw}».` };
}

// ── Leer el JSON del borrador ───────────────────────────────────────────────
function leerJson() {
    const v = OPT.json;
    if (!v || v === true) parar('Falta --json <fichero | - | {…}> con el borrador (formato: ver asistente_instrucciones.md, «PRESUPUESTOS Y FACTURAS»).');
    let txt;
    if (v === '-') txt = fs.readFileSync(0, 'utf8');
    else if (String(v).trim().startsWith('{')) txt = v;
    else txt = fs.readFileSync(path.resolve(v), 'utf8');
    try { return JSON.parse(txt); } catch (e) { throw new Error(`El JSON no se lee: ${e.message}`); }
}

// ── Las partidas dichas → el cuerpo de la API (artículo + variante o concepto libre) ─
async function resolverLineas(dichas = []) {
    if (!Array.isArray(dichas) || !dichas.length) parar('El borrador no tiene ninguna partida ("lineas").');
    if (dichas.length > 30) parar('Como mucho 30 partidas.');
    const cat = await catalogo();
    const activos = cat.filter(a => a.activo !== false);
    const cuerpo = [];
    const preguntas = [];
    const avisos = [];
    dichas.forEach((l, k) => {
        const n = k + 1;
        const u = l.uds == null || l.uds === '' ? 1 : Number(l.uds);
        const dto = Number(l.dto ?? l.dto_pct ?? 0);
        const detalle = String(l.detalle || '').trim() || undefined;
        if (!(u > 0)) { preguntas.push(`Partida ${n}: las unidades tienen que ser más de 0.`); return; }
        if (!(dto >= 0 && dto <= 100)) { preguntas.push(`Partida ${n}: el descuento va de 0 a 100 %.`); return; }
        if (!l.articulo) {
            const concepto = String(l.concepto || l.descripcion || '').trim();
            if (!concepto) { preguntas.push(`Partida ${n}: sin artículo ni concepto.`); return; }
            const precio = numOrNull(l.precio);
            if (precio == null) { preguntas.push(`Partida ${n} «${concepto}»: es una partida LIBRE (no está en el catálogo) y no tiene precio. ¿Cuánto, sin IVA?`); return; }
            const suplido = !!l.suplido;
            const ivaPct = suplido ? 0 : numOrNull(l.iva_pct) ?? 21;
            cuerpo.push({ descripcion: concepto, uds: u, precio, ivaPct, dtoPct: suplido ? 0 : dto, detalle, suplido });
            avisos.push(`Partida ${n} «${concepto}»: FUERA del catálogo, a ${eur(precio)}${suplido ? ' (suplido, sin IVA)' : ` + IVA ${ivaPct} %`}, precio dicho por ti.`);
            return;
        }
        const r = resolverArticulo(activos, l.articulo);
        if (!r.articulo) {
            preguntas.push(`Partida ${n} «${l.articulo}»: ${r.ambiguo ? 'encaja con varios artículos, ¿cuál?' : 'no está en el catálogo.'}`
                + `${r.opciones?.length ? `\n${r.opciones.map(o => `   - ${o}`).join('\n')}` : ''}`
                + `${r.ambiguo ? '' : '\n   (Si es una partida libre, va con "concepto" y su "precio", que lo dice Fran.)'}`);
            return;
        }
        const a = r.articulo;
        const va = resolverVariante(a, l.variante, r.sobrantes);
        if (va.error) { preguntas.push(`Partida ${n}: ${va.error}${va.opciones?.length ? `\n${va.opciones.map(o => `   - ${o}`).join('\n')}` : ''}`); return; }
        const v = va.variante;
        const nombre = v ? `${a.nombre} — ${v.nombre}` : a.nombre;
        const delCatalogo = numOrNull(v?.precio) ?? numOrNull(a.precio) ?? 0;
        const dado = numOrNull(l.precio);
        if (l.precio != null && l.precio !== '' && dado == null) { preguntas.push(`Partida ${n}: el precio «${l.precio}» no es un número.`); return; }
        if (dado == null && !(delCatalogo > 0) && !a.suplido) {
            preguntas.push(`Partida ${n} «${nombre}»: está a 0 € en el catálogo (sin precio todavía). ¿Cuánto, sin IVA? (Y si es el de siempre, ponlo en Facturación → Artículos.)`);
            return;
        }
        if (dado != null && Math.abs(dado - delCatalogo) > 0.004) avisos.push(`Partida ${n} «${nombre}»: ${eur(dado)} puesto a mano (catálogo: ${eur(delCatalogo)}).`);
        cuerpo.push({ articulo_id: a.id, variante_id: v ? v.id : null, uds: u, precio: dado ?? delCatalogo, dtoPct: dto, detalle, ...(l.sin_arrastre ? { sin_arrastre: true } : {}) });
    });
    return { cuerpo, preguntas, avisos };
}

/** Las líneas que GUARDARÁ el servidor (la misma cuenta que `presupuestoService.construirLineas` con `expandir_arrastre`). */
async function lineasComoElServidor(cuerpo) {
    const L = await logica();
    const cat = await catalogo();
    const out = [];
    for (const l of cuerpo) {
        const art = l.articulo_id ? cat.find(a => String(a.id) === String(l.articulo_id)) : null;
        if (!art) {
            if (String(l.descripcion || '').trim()) out.push(L.lineaDeArticulo({ nombre: l.descripcion, precio: l.precio, iva_pct: l.ivaPct ?? 21, suplido: !!l.suplido }, { uds: l.uds, dtoPct: l.dtoPct, detalle: l.detalle }));
            continue;
        }
        out.push(...L.lineasDeArticulo(art, cat, { varianteId: l.variante_id || null, uds: l.uds ?? 1, precio: l.precio, dtoPct: l.dtoPct ?? 0, detalle: l.detalle || '', sinArrastre: !!l.sin_arrastre }));
    }
    return L.sanearLineas(out);
}

/** Las partidas, una por renglón (las arrastradas, colgadas de la suya). */
async function textoLineas(lineas) {
    const L = await logica();
    let k = 0;
    return lineas.map(L.calcularLinea).map(l => {
        const pre = l.arrastrada_de ? '   ↳ ' : `${++k}. `;
        const precio = `${uds(l.uds)} × ${eur(l.precio)}${l.dtoPct ? ` −${miles(l.dtoPct, 0)} %` : ''}`;
        const cola = (l.suplido || (/^tasa\b/i.test(l.descripcion) && !num(l.ivaPct))) ? `${precio} (tasa, sin IVA)` : `${precio} + IVA ${miles(l.ivaPct, 0)} %`;
        return `${pre}${l.descripcion} — ${cola}${l.detalle ? `\n      _${l.detalle}_` : ''}`;
    }).join('\n');
}
const textoTotales = (t) => `Base ${eur(t.neto - (t.suplidos || 0))} · IVA ${eur(t.iva)}${t.suplidos ? ` · Tasas ${eur(t.suplidos)}` : ''} · *TOTAL ${eur(t.total)}*`;
const textoDestino = (d, canales = null) => {
    const por = [d.tlf ? `WhatsApp ${maskTel(d.tlf)}` : null, d.email ? `email ${maskEmail(d.email)}` : null].filter(Boolean);
    const quiere = canales ? ` · por ${canales.join(' y ')}` : '';
    return `Para: *${d.nombre || '¿?'}*${d.desvio ? ' (su persona de contacto)' : ''}${quiere} · ${por.length ? por.join(' · ') : '⚠️ sin teléfono ni email en la ficha: no se le puede enviar'}`;
};

// ═════════════════════════════════════════════════════════════════════════════
// PRESUPUESTOS
// ═════════════════════════════════════════════════════════════════════════════

/** El cliente del borrador: su ficha, una nueva (sin duplicados a la vista) o nada. */
async function clienteDelBorrador(d, { paraCambiar = false } = {}) {
    if (d.cliente_id) {
        if (!UUID_RE.test(String(d.cliente_id).trim())) parar('"cliente_id" es el id de la ficha (lo da `cliente <texto>`), no un nombre.');
        const c = await fichaCliente(String(d.cliente_id).trim());
        if (!c) parar(`No existe ninguna ficha con id ${d.cliente_id}.`);
        return { ficha: c, destino: destinoDe(c), body: { cliente_id: c.id_cliente }, etiqueta: '' };
    }
    const n = d.cliente_nuevo;
    if (n?.nombre?.trim()) {
        if (paraCambiar) parar('Para cambiar el cliente de un borrador, búscalo con `cliente <texto>` y pon su "cliente_id" (no se da de alta otra ficha desde aquí).');
        const nombre = n.nombre.trim();
        const tlf = n.telefono || n.tlf ? String(n.telefono || n.tlf).replace(/[^\d+]/g, '') : null;
        if (tlf && tlf.replace(/\D/g, '').length < 9) parar(`El teléfono de ${nombre} tiene menos de 9 cifras: compruébalo con Fran.`);
        const email = n.email ? String(n.email).trim().toLowerCase() : null;
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) parar(`El email de ${nombre} no parece válido.`);
        if (!d.forzar_cliente_nuevo) {
            // ¿Ya existe? Un duplicado deja al cliente partido en dos fichas. Se enseñan, no se casan solos.
            const vistos = new Map();
            for (const c of (await buscarClientes(nombre, 8)).clientes) vistos.set(c.id_cliente, c);
            if (tlf) for (const c of (await buscarClientes(tlf, 8)).clientes) vistos.set(c.id_cliente, c);
            if (vistos.size) {
                parar(`Ya hay ${vistos.size} ficha(s) con un nombre o teléfono parecido a «${nombre}». ¿Es una de estas (pon su "cliente_id") o es otra persona (entonces "forzar_cliente_nuevo": true)?\n${[...vistos.values()].map(lineaCliente).join('\n')}`);
            }
        }
        return { ficha: null, destino: { nombre, tlf: tlf || '', email: email || '' }, body: { cliente_nuevo: { nombre, tlf, email } }, etiqueta: ' (ficha NUEVA: se da de alta al crearlo)' };
    }
    parar('Falta el cliente: "cliente_id" (búscalo con `cliente <texto>`) o "cliente_nuevo" con nombre y teléfono.');
}

const inmuebleDe = (i = {}) => Object.fromEntries(Object.entries({
    direccion: i.direccion?.trim(), municipio: i.municipio?.trim(), provincia: i.provincia?.trim(), ccaa: i.ccaa?.trim(),
    codigo_postal: i.codigo_postal ? String(i.codigo_postal).trim() : undefined,
    ref_catastral: i.ref_catastral ? String(i.ref_catastral).replace(/\s+/g, '').toUpperCase() : undefined,
}).filter(([, v]) => v));

/** EN SECO: todo lo que tendría el presupuesto. No escribe nada. */
async function prepararPresupuesto(d, opts = {}) {
    const L = await logica();
    const O = await plantilla();
    const cli = await clienteDelBorrador(d, opts);
    let prescriptor = null;
    if (d.prescriptor) {
        const rp = await resolverPrescriptor(d.prescriptor);
        if (rp.error) parar(rp.error);
        prescriptor = rp;
    }
    const { cuerpo, preguntas, avisos } = await resolverLineas(d.lineas);
    if (preguntas.length) parar(`No se puede preparar sin preguntarle a Fran:\n${preguntas.map(p => `• ${p}`).join('\n')}`);
    const lineas = await lineasComoElServidor(cuerpo);
    const t = L.totalesLineas(lineas);
    const alcance = L.alcanceDeLineas(lineas);
    const inmueble = inmuebleDe(d.inmueble || {});
    const observaciones = d.observaciones != null ? String(d.observaciones) : undefined;
    if (observaciones && observaciones.length > L.MAX_OBSERVACIONES) parar(`Las observaciones pasan de ${L.MAX_OBSERVACIONES} caracteres.`);
    if (!(t.total > 0)) avisos.push('El total es 0 €.');
    const mensaje = O.mensajeOferta({
        nombre: cli.destino.nombre, numero: '(nº de presupuesto)', alcance, total: t.total, url: '(enlace para aceptar)',
        inmueble: O.direccionInmueble(inmueble), tasas: t.suplidos, partidas: L.partidasDe(lineas), abreCee: !!alcance,
    });
    const body = {
        ...cli.body, lineas: cuerpo, expandir_arrastre: true, ...inmueble,
        ...(observaciones !== undefined ? { observaciones } : {}),
        ...(prescriptor?.id ? { prescriptor_id: prescriptor.id } : {}),
    };
    return { cli, prescriptor, lineas, t, alcance, mensaje, avisos, body, inmueble };
}

async function textoBorrador(p, { numero = null, estado = 'BORRADOR' } = {}) {
    return [
        `*Presupuesto ${numero || '(sin crear)'}* · ${estado}`,
        `${textoDestino(p.cli.destino)}${p.cli.etiqueta || ''}`,
        p.prescriptor ? `Partner: ${p.prescriptor.nombre}` : null,
        Object.keys(p.inmueble).length ? `Inmueble: ${(await plantilla()).direccionInmueble(p.inmueble) || p.inmueble.ref_catastral}` : null,
        '',
        await textoLineas(p.lineas),
        '',
        textoTotales(p.t),
        p.alcance ? `Al aceptarlo se abre un expediente de CEE (${p.alcance === 'DOBLE' ? 'inicial + final' : 'un certificado'}).` : 'Al aceptarlo NO se abre expediente (no lleva certificado).',
        ...(p.avisos.length ? ['', ...p.avisos.map(a => `⚠️ ${a}`)] : []),
    ].filter(x => x !== null).join('\n');
}

async function presupuestoPreparar() {
    const p = await prepararPresupuesto(leerJson());
    console.log([
        'EN SECO: no se ha creado nada (crearlo gasta el siguiente nº P-26ING).', SEP,
        await textoBorrador(p), '',
        '*Lo que le llegaría al cliente* (con el PDF):', p.mensaje, SEP,
        'Si está bien: `presupuesto crear` con el MISMO JSON (y --a-fran para enseñárselo con el PDF).',
    ].join('\n'));
}

/** Nº dictado («P-26ING_40», «26ING_40», «40») o id → fila del listado. */
async function resolverPresupuesto(ref) {
    const s = String(ref ?? '').trim();
    if (!s) parar('Dime el nº del presupuesto (ej. P-26ING_41).');
    if (UUID_RE.test(s)) return { id: s, numero: s };
    const filas = await api(`/api/facturacion/presupuestos?q=${encodeURIComponent(s)}`);
    const norm = x => sinTildes(x).replace(/[\s_-]+/g, '');
    const q = norm(s);
    const exactos = filas.filter(p => norm(p.numero) === q);
    if (exactos.length === 1) return exactos[0];
    const finales = filas.filter(p => { const n = norm(p.numero); return n.endsWith(q) && !/\d/.test(n.charAt(n.length - q.length - 1) || ''); });
    if (finales.length === 1) return finales[0];
    const cand = finales.length ? finales : filas;
    if (!cand.length) parar(`No encuentro ningún presupuesto «${s}».`);
    parar(`Hay ${cand.length} presupuestos que encajan con «${s}»: ${cand.slice(0, 8).map(p => `${p.numero} (${p.cliente_nombre || '¿?'}, ${p.estado})`).join(' · ')}. Dime el nº completo.`);
}

const nombreFichero = (s) => String(s).replace(/[\\/<>:"|?*\n\r]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
async function bajarPdf(ruta, nombre) {
    const { buffer } = await api(ruta, { binario: true, ms: 180_000 });
    fs.mkdirSync(DIR, { recursive: true });
    const f = path.join(DIR, nombreFichero(nombre));
    fs.writeFileSync(f, buffer);
    return f;
}

/** El presupuesto ya creado, contado con lo que dice el servidor. */
async function textoPresupuesto(d) {
    const dest = d.destino || {};
    const envios = Array.isArray(d.envios) ? d.envios : [];
    const ult = envios[envios.length - 1];
    const lineas = Array.isArray(d.lineas) ? d.lineas : (d.lineas_calculadas || []);
    return [
        `*Presupuesto ${d.numero}* · ${d.estado}${d.created_at ? ` · ${fechaEs(d.created_at)}` : ''}`,
        textoDestino(dest),
        d.numero_expediente ? `Expediente: ${d.numero_expediente}` : null,
        '',
        await textoLineas(lineas),
        '',
        textoTotales({ neto: d.neto, iva: d.iva, suplidos: d.suplidos, total: d.total }),
        d.alcance ? `Al aceptarlo se abre un expediente de CEE (${d.alcance === 'DOBLE' ? 'inicial + final' : 'un certificado'}).` : 'Al aceptarlo NO se abre expediente.',
        ult ? `Último envío: ${fechaEs(ult.at)} por ${(ult.canales || []).join(' y ')}${d.visto_at ? ` · lo ABRIÓ el ${fechaEs(d.visto_at)}` : d.aceptada_at ? '' : ' · aún no lo ha abierto'}` : null,
        d.aceptada_at ? `✅ Aceptado el ${fechaEs(d.aceptada_at)}` : null,
        d.estado === 'ENVIADA' && d.url_aceptacion ? `Enlace para aceptar: ${d.url_aceptacion}` : null,
    ].filter(x => x !== null).join('\n');
}

/** Texto + PDF + pregunta al grupo de Fran (por el buzón si el WhatsApp está caído). */
async function aFran(pdf, texto, pregunta) {
    const wa = require('./asistente_whatsapp');
    const r = await wa.mandarFicheroOGuardar(pdf, texto, pregunta);
    if (r.enviado) return '✓ Enseñado a Fran en el grupo (texto + PDF + pregunta).';
    if (r.guardado) return `⏳ El WhatsApp no responde (${r.motivo}): queda GUARDADO en el buzón y le llegará al volver. No lo repitas.`;
    return `✗ No le ha llegado a Fran (${r.motivo}).${r.dudoso ? ' Puede que el texto sí: mira el chat antes de repetirlo.' : ''}`;
}

const preguntaPresupuesto = (d) => {
    const dest = d.destino || {};
    const canal = dest.tlf ? 'por WhatsApp' : dest.email ? 'por email' : null;
    return canal
        ? `¿Se lo mando a ${dest.nombre || 'el cliente'} ${canal}? Contesta *mándalo* o dime qué cambio.`
        : 'La ficha no tiene teléfono ni email: dime cómo se lo hago llegar, o qué cambio.';
};

async function despuesDeEscribir(id, { titulo, avisos = [] }) {
    const d = await api(`/api/facturacion/presupuestos/${id}`);
    const prev = await api(`/api/facturacion/presupuestos/${id}/mensaje`);
    marcarMensaje(`P:${id}`, prev.mensaje);       // el texto por defecto, ya enseñado (como el MCP)
    const pdf = await bajarPdf(`/api/facturacion/presupuestos/${id}/pdf`, `Presupuesto ${d.numero} - ${nombreDe({ nombre_razon_social: d.destino?.nombre })}.pdf`);
    const resumen = [await textoPresupuesto(d), ...(avisos.length ? ['', ...avisos.map(a => `⚠️ ${a}`)] : [])].join('\n');
    const paraFran = `${resumen}\n\n*Lo que le llegaría:*\n${prev.mensaje}`;
    const salida = [titulo, SEP, paraFran, SEP, `PDF: ${pdf}`];
    if (OPT['a-fran']) salida.push(await aFran(pdf, paraFran, preguntaPresupuesto(d)));
    else salida.push(`Para enseñárselo: node scripts/asistente_whatsapp.js enviar-fichero "${pdf}" "<el texto de arriba>" --despues "${preguntaPresupuesto(d)}" --enviar`);
    console.log(salida.join('\n'));
    return d;
}

async function presupuestoCrear() {
    const datos = leerJson();
    const p = await prepararPresupuesto(datos);
    // El mismo borrador dos veces (un reintento tras un plazo) gastaría dos números.
    const huella = hash(JSON.stringify(p.body));
    const previo = (leerVistos().creados || {})[huella];
    if (previo && !OPT.otra) parar(`Ese mismo presupuesto ya se creó hace ${Math.round((Date.now() - previo.t) / 60000)} min: ${previo.numero}. Míralo con \`presupuesto ver ${previo.numero}\` (o --otra si de verdad es otro).`);
    const r = await api('/api/facturacion/presupuestos', { method: 'POST', body: p.body });
    const creado = r.presupuesto || r;
    const v = leerVistos(); v.creados = { ...(v.creados || {}), [huella]: { t: Date.now(), numero: creado.numero, id: creado.id } }; guardarVistos(v);
    apuntar('presupuesto_crear', { numero: creado.numero, id: creado.id, total: creado.total });
    const avisos = [...p.avisos];
    if (Math.abs(num(creado.total) - p.t.total) > 0.004) avisos.push(`El servidor da ${eur(creado.total)} y aquí salía ${eur(p.t.total)}: revísalo antes de enviarlo.`);
    await despuesDeEscribir(creado.id, { titulo: `✓ Creado en BORRADOR: *${creado.numero}*. No se ha enviado nada.`, avisos });
}

async function presupuestoCambiar() {
    const fila = await resolverPresupuesto(POS[2]);
    const actual = await api(`/api/facturacion/presupuestos/${fila.id}`);
    if (actual.estado !== 'BORRADOR') parar(`${actual.numero} está ${actual.estado}: desde aquí solo se cambia un BORRADOR (lo enviado se duplica o se cambia en la app).`);
    const datos = leerJson();
    const cuerpo = {};
    const avisos = [];
    if (datos.cliente_id || datos.cliente_nuevo) Object.assign(cuerpo, (await clienteDelBorrador(datos, { paraCambiar: true })).body);
    if (datos.lineas) {
        const r = await resolverLineas(datos.lineas);
        if (r.preguntas.length) parar(`No se puede cambiar sin preguntarle a Fran:\n${r.preguntas.map(x => `• ${x}`).join('\n')}`);
        Object.assign(cuerpo, { lineas: r.cuerpo, expandir_arrastre: true });
        avisos.push(...r.avisos);
    }
    if (datos.inmueble) Object.assign(cuerpo, inmuebleDe(datos.inmueble));
    if (datos.observaciones !== undefined) cuerpo.observaciones = datos.observaciones;
    if (datos.prescriptor) {
        const rp = await resolverPrescriptor(datos.prescriptor);
        if (rp.error) parar(rp.error);
        cuerpo.prescriptor_id = rp.id;
    }
    if (!Object.keys(cuerpo).length) parar('El JSON no cambia nada (lineas, cliente_id, inmueble, observaciones o prescriptor).');
    await api(`/api/facturacion/presupuestos/${fila.id}`, { method: 'PUT', body: cuerpo });
    olvidarMensajes(`P:${fila.id}`);
    apuntar('presupuesto_cambiar', { numero: actual.numero, id: fila.id });
    await despuesDeEscribir(fila.id, { titulo: `✓ Cambiado el borrador *${actual.numero}* (mismo número). No se ha enviado nada.`, avisos });
}

async function presupuestoVer() {
    const fila = await resolverPresupuesto(POS[2]);
    const d = await api(`/api/facturacion/presupuestos/${fila.id}`);
    const salida = [await textoPresupuesto(d)];
    if (OPT.pdf || OPT['a-fran']) {
        const pdf = await bajarPdf(`/api/facturacion/presupuestos/${fila.id}/pdf`, `Presupuesto ${d.numero} - ${d.destino?.nombre || ''}.pdf`);
        salida.push(`PDF: ${pdf}`);
        if (OPT['a-fran']) salida.push(await aFran(pdf, salida[0], d.estado === 'BORRADOR' ? preguntaPresupuesto(d) : ''));
    }
    console.log(salida.join('\n'));
}

const canalesPedidos = (porDefecto = ['whatsapp']) => {
    const c = OPT.canal && OPT.canal !== true ? String(OPT.canal).toLowerCase().split(/[,\s]+/).filter(Boolean) : porDefecto;
    const malos = c.filter(x => !['whatsapp', 'email'].includes(x));
    if (malos.length) parar(`Canal «${malos.join(', ')}»: solo whatsapp o email.`);
    return [...new Set(c)];
};
const mensajePropio = () => (OPT['mensaje-fichero'] && OPT['mensaje-fichero'] !== true ? fs.readFileSync(path.resolve(OPT['mensaje-fichero']), 'utf8').trim() : null);

/**
 * El envío de un presupuesto o una factura: en seco enseña el mensaje y lo apunta como visto;
 * con --enviar exige ese mismo texto visto (24 h) y el «sí» literal de Fran.
 */
async function enviarComun({ tipo, id, numero, estado, destino, mensajeDefecto, rutaEnviar, sePuede }) {
    const canales = canalesPedidos(destino.tlf ? ['whatsapp'] : destino.email ? ['email'] : ['whatsapp']);
    const propio = mensajePropio();
    const texto = propio || mensajeDefecto;
    const clave = `${tipo}:${id}`;
    const sinDestino = canales.filter(c => (c === 'whatsapp' ? !destino.tlf : !destino.email));
    const cabecera = [textoDestino(destino, canales), ...sinDestino.map(c => `⚠️ ${c === 'whatsapp' ? 'Sin teléfono en la ficha: por WhatsApp no sale.' : 'Sin email en la ficha: por email no sale.'}`)];
    if (!OPT.enviar) {
        if (sePuede) parar(sePuede);
        marcarMensaje(clave, texto);
        console.log([`EN SECO: *${numero}* (${estado}) no se ha enviado.`, ...cabecera, `Adjunto: el PDF de ${numero}`, SEP, texto, SEP,
            `Para mandarlo, SOLO con el «sí» de Fran a ESTE mensaje: node scripts/facturacion_cli.js ${tipo === 'P' ? 'presupuesto' : 'factura'} enviar ${numero} --canal ${canales.join(',')}${propio ? ` --mensaje-fichero "${OPT['mensaje-fichero']}"` : ''} --enviar --si "<su respuesta literal>"`].join('\n'));
        return;
    }
    if (sePuede) parar(sePuede);
    const si = OPT.si && OPT.si !== true ? String(OPT.si).trim() : '';
    if (!si) parar('Falta --si "<la respuesta LITERAL de Fran a ese borrador>": sin su «sí» no sale nada.');
    if (!mensajeVisto(clave, texto)) parar('Este texto no se ha sacado como borrador en las últimas 24 h (o ha cambiado). Sácalo en seco, enséñaselo ENTERO a Fran y espera su «sí».');
    if (sinDestino.length === canales.length) parar(`No hay a dónde mandarlo: ${sinDestino.map(c => (c === 'whatsapp' ? 'sin teléfono' : 'sin email')).join(' y ')} en la ficha. Que lo complete en la app.`);
    let r;
    try {
        r = await api(rutaEnviar, { method: 'POST', body: { canales, ...(propio ? { mensaje: propio } : {}) }, ms: 240_000 });
    } catch (e) {
        apuntar(`${tipo === 'P' ? 'presupuesto' : 'factura'}_enviar_fallo`, { numero, canales, si, error: e.message });
        throw e;
    }
    olvidarMensajes(clave);                         // otro envío, otro borrador y otro «sí»
    const res = r.resultados || {};
    const ok = r.canalesOk || Object.keys(res).filter(k => res[k]?.ok);
    apuntar(`${tipo === 'P' ? 'presupuesto' : 'factura'}_enviar`, { numero, id, canales: ok, si, fallos: Object.entries(res).filter(([, x]) => !x?.ok).map(([k, x]) => `${k}: ${x?.error}`) });
    console.log([
        `✓ *${numero}* enviado por ${ok.join(' y ')} a ${destino.nombre || 'el cliente'}.`,
        ...Object.entries(res).map(([k, x]) => `  ${x?.ok ? '✓' : '✗'} ${k}${x?.to ? ` → ${k === 'whatsapp' ? maskTel(x.to) : maskEmail(x.to)}` : ''}${x?.error ? `: ${x.error}` : ''}`),
    ].join('\n'));
}

async function presupuestoMensajeOEnviar() {
    const fila = await resolverPresupuesto(POS[2]);
    const prev = await api(`/api/facturacion/presupuestos/${fila.id}/mensaje`);
    if (POS[1] === 'mensaje') delete OPT.enviar;
    await enviarComun({
        tipo: 'P', id: fila.id, numero: prev.numero, estado: prev.estado, destino: prev.destino || {},
        mensajeDefecto: prev.mensaje, rutaEnviar: `/api/facturacion/presupuestos/${fila.id}/enviar`,
        sePuede: ['BORRADOR', 'ENVIADA'].includes(prev.estado) ? null : `${prev.numero} está ${prev.estado}: ya no se envía.`,
    });
}

// ═════════════════════════════════════════════════════════════════════════════
// FACTURAS
// ═════════════════════════════════════════════════════════════════════════════

/** La ficha como va a la factura (el mismo criterio que `facturaService.clienteDeFicha`). */
const clienteDeFicha = (c) => ({
    razon_social: `${c.nombre_razon_social || ''} ${c.es_empresa ? '' : (c.apellidos || '')}`.trim(),
    cif: c.dni, direccion: c.direccion, cp: c.codigo_postal, municipio: c.municipio, provincia: c.provincia,
    tlf: c.tlf, email: c.email, es_empresa: !!c.es_empresa,
});

let _emisores = null;
async function emisorDe(serie) {
    if (!_emisores) _emisores = await api('/api/facturacion/emisores');
    return (_emisores || []).find(e => e.serie === serie) || null;
}

async function prepararFactura(d) {
    const F = await logicaFactura();
    const L = await logica();
    const serie = String(d.serie || 'ING').toUpperCase();
    if (!F.serieValida(serie)) parar(`La serie «${d.serie}» no existe: ING (BROKERGY) o FML (Fran, con IRPF).`);
    const em = await emisorDe(serie);
    const avisos = [];
    if (!em) avisos.push(`Faltan los datos del emisor de la serie ${serie}: el borrador se puede hacer, pero no se podrá EMITIR hasta darlos de alta (Facturación → Emisores).`);

    let body; let cliente; let destino; let etiqueta = '';
    if (d.cliente_id) {
        if (!UUID_RE.test(String(d.cliente_id).trim())) parar('"cliente_id" es el id de la ficha (lo da `cliente <texto>`).');
        const c = await fichaCliente(String(d.cliente_id).trim());
        if (!c) parar(`No existe ninguna ficha con id ${d.cliente_id}.`);
        body = { cliente_id: c.id_cliente };
        cliente = clienteDeFicha(c);
        destino = destinoDe(c);
    } else if (d.cliente_fiscal?.razon_social?.trim()) {
        const c = d.cliente_fiscal;
        body = { cliente: { razon_social: c.razon_social.trim().toUpperCase(), cif: String(c.nif || '').replace(/[\s.-]/g, '').toUpperCase(), direccion: c.direccion, cp: c.cp, municipio: c.municipio, provincia: c.provincia, email: c.email } };
        cliente = body.cliente;
        destino = { nombre: cliente.razon_social, email: c.email || '', tlf: '' };
        etiqueta = ' (sin ficha: datos tecleados)';
    } else if (d.cliente_nuevo?.nombre?.trim()) {
        const p = await clienteDelBorrador({ cliente_nuevo: d.cliente_nuevo, forzar_cliente_nuevo: d.forzar_cliente_nuevo });
        body = { cliente_nuevo: p.body.cliente_nuevo };
        cliente = { razon_social: p.body.cliente_nuevo.nombre.toUpperCase() };
        destino = p.destino;
        etiqueta = p.etiqueta;
    } else parar('Falta a quién se factura: "cliente_id", "cliente_fiscal" (razón social + NIF…) o "cliente_nuevo".');

    const { cuerpo, preguntas, avisos: avL } = await resolverLineas(d.lineas);
    if (preguntas.length) parar(`No se puede preparar sin preguntarle a Fran:\n${preguntas.map(p => `• ${p}`).join('\n')}`);
    avisos.push(...avL);
    const lineas = await lineasComoElServidor(cuerpo);
    const irpfPct = numOrNull(d.irpf_pct) ?? numOrNull(em?.irpf_pct) ?? F.SERIES[serie].irpfPct;
    const fecha = d.fecha || hoyMadrid();
    const s = F.sanearFactura({ serie, lineas, irpf_pct: irpfPct, fecha, fecha_operacion: d.fecha_operacion, observaciones: d.observaciones ?? em?.observaciones ?? null, expediente: d.expediente, cliente });
    const c = F.calcularFactura({ lineas: s.lineas, irpfPct: s.irpf_pct });
    const revision = F.revisarParaEmitir({ ...s, tipo: 'F1' });
    const mensaje = F.mensajeFacturaGeneral({ nombre: destino.nombre, esEmpresa: !!s.cliente.es_empresa, numero: '(nº de factura)', total: c.total, vencimiento: s.vencimiento, lineas: s.lineas, emisor: em, serie });
    body = {
        serie, ...body, lineas: cuerpo, expandir_arrastre: true,
        ...(d.irpf_pct != null ? { irpf_pct: Number(d.irpf_pct) } : {}),
        ...(d.fecha ? { fecha: d.fecha } : {}), ...(d.fecha_operacion ? { fecha_operacion: d.fecha_operacion } : {}),
        ...(d.expediente ? { expediente: String(d.expediente).trim().toUpperCase() } : {}),
        ...(d.observaciones != null ? { observaciones: d.observaciones } : {}),
    };
    return { serie, s, c, revision, mensaje, avisos, body, destino, etiqueta, L };
}

function textoTotalesFactura(c, irpfPct) {
    return [
        `Base ${eur(c.neto - (c.suplidos || 0))} · IVA ${eur(c.iva)}${c.suplidos ? ` · Suplidos ${eur(c.suplidos)}` : ''}`,
        c.irpf ? `Retención IRPF (${miles(irpfPct, 0)} %): -${eur(Math.abs(c.irpf))}` : null,
        `*TOTAL A PAGAR ${eur(c.total)}*`,
    ].filter(Boolean).join(' · ');
}

async function facturaPreparar() {
    const p = await prepararFactura(leerJson());
    console.log([
        'EN SECO: no se ha creado nada.', SEP,
        `*Factura ${p.serie}* (borrador sin crear) · fecha ${fechaEs(p.s.fecha)} · vence ${fechaEs(p.s.vencimiento)}${p.s.fecha_operacion ? ` · operación: ${p.s.fecha_operacion}` : ''}`,
        `${textoDestino(p.destino)}${p.etiqueta}`,
        p.s.cliente?.cif ? `NIF ${maskDni(p.s.cliente.cif)}` : '⚠️ Sin NIF todavía',
        '', await textoLineas(p.s.lineas), '',
        textoTotalesFactura(p.c, p.s.irpf_pct),
        ...(p.revision.errores.length ? ['', '*Para EMITIRLA faltará:*', ...p.revision.errores.map(e => `• ${e}`)] : []),
        ...([...p.avisos, ...p.revision.avisos].length ? ['', ...[...p.avisos, ...p.revision.avisos].map(a => `⚠️ ${a}`)] : []),
        '', '*Lo que le llegaría al cliente* (con el PDF, una vez EMITIDA):', p.mensaje, SEP,
        'Si está bien: `factura crear` con el MISMO JSON (borrador: no gasta número; el número lo da EMITIR).',
    ].join('\n'));
}

async function resolverFactura(ref) {
    const s = String(ref ?? '').trim();
    if (!s) parar('Dime la factura: su nº (ej. 26ING_59) o, si es un borrador, su id.');
    if (UUID_RE.test(s)) return { id: s };
    const { facturas = [] } = await api(`/api/facturacion/facturas?q=${encodeURIComponent(s)}`);
    const filas = facturas.filter(f => f.numero);
    const norm = x => sinTildes(x).replace(/[\s_-]+/g, '');
    const q = norm(s);
    const exactos = filas.filter(f => norm(f.numero) === q);
    if (exactos.length === 1) return exactos[0];
    const finales = filas.filter(f => { const n = norm(f.numero); return n.endsWith(q) && !/\d/.test(n.charAt(n.length - q.length - 1) || ''); });
    if (finales.length === 1) return finales[0];
    const cand = finales.length ? finales : filas;
    if (!cand.length) parar(`No encuentro ninguna factura «${s}».`);
    parar(`Hay ${cand.length} facturas que encajan con «${s}»: ${cand.slice(0, 8).map(f => `${f.numero} (${f.cliente_nombre || '¿?'})`).join(' · ')}. Dime el nº completo.`);
}

async function textoFactura(f) {
    const c = f.calculo || {};
    return [
        `*Factura ${f.numero || 'BORRADOR (sin número)'}* · ${f.serie} · ${f.visible?.texto || f.estado}${f.tipo && f.tipo !== 'F1' ? ` · rectificativa ${f.tipo} de ${f.rectifica_numero || '¿?'}` : ''}`,
        `${f.cliente?.razon_social || f.cliente_nombre || '¿?'}${f.cliente?.cif ? ` · NIF ${maskDni(f.cliente.cif)}` : ' · ⚠️ sin NIF'}`,
        `Fecha ${fechaEs(f.fecha)} · vence ${fechaEs(f.vencimiento)}${f.fecha_operacion ? ` · operación: ${f.fecha_operacion}` : ''}${f.expediente ? ` · ${f.expediente}` : ''}`,
        f.estado === 'BORRADOR' ? `id del borrador: ${f.id}` : null,
        '', await textoLineas(f.lineas || []), '',
        textoTotalesFactura({ neto: f.neto, iva: f.iva, suplidos: c.suplidos, irpf: f.irpf, total: f.total }, f.irpf_pct),
        f.enviada_at ? `Enviada el ${fechaEs(f.enviada_at)}` : null,
        f.fecha_pago ? `Cobrada el ${fechaEs(f.fecha_pago)}` : null,
    ].filter(x => x !== null).join('\n');
}

/** El nº que le tocaría, errores y avisos; queda apuntada como REVISADA (lo exige `emitir`). */
async function revisionFactura(f) {
    let proximo = null;
    try {
        const qs = new URLSearchParams({ serie: f.serie, ...(f.tipo && f.tipo !== 'F1' ? { tipo: f.tipo, fecha: f.fecha || hoyMadrid() } : {}) });
        proximo = (await api(`/api/facturacion/facturas/proximo?${qs}`)).numero || null;
    } catch (e) { proximo = `¿? (${e.message})`; }
    const rev = f.revision || { errores: [], avisos: [] };
    if (!rev.errores.length) {
        const v = leerVistos(); v.revisadas = { ...(v.revisadas || {}), [f.id]: { t: Date.now(), numero: proximo } }; guardarVistos(v);
    }
    return {
        proximo, rev,
        texto: [
            `Al EMITIRLA le tocará el nº *${proximo || '¿?'}* (es el previsto: se reserva al emitir) y desde ahí ya no se borra ni se cambia: se rectifica.`,
            ...(rev.errores.length ? ['*No se puede emitir todavía:*', ...rev.errores.map(e => `• ${e}`)] : []),
            ...rev.avisos.map(a => `⚠️ ${a}`),
        ].join('\n'),
    };
}

const preguntaEmitir = (f, rev) => (rev.errores.length
    ? 'Corrige lo de arriba (en la app o dime qué pongo) y la vuelvo a preparar.'
    : `¿La emito? Contesta *emítela* (o dime qué cambio). Mandársela a ${f.cliente?.razon_social || 'el cliente'} es otro «sí» después.`);

async function facturaCrear() {
    const datos = leerJson();
    const p = await prepararFactura(datos);
    const huella = hash(JSON.stringify(p.body));
    const previo = (leerVistos().creados || {})[huella];
    if (previo && !OPT.otra) parar(`Ese mismo borrador de factura ya se creó hace ${Math.round((Date.now() - previo.t) / 60000)} min (id ${previo.id}). Míralo con \`factura ver ${previo.id}\` (o --otra si es otra).`);
    const r = await api('/api/facturacion/facturas', { method: 'POST', body: p.body });
    const f = r.factura || {};
    const v = leerVistos(); v.creados = { ...(v.creados || {}), [huella]: { t: Date.now(), id: f.id } }; guardarVistos(v);
    apuntar('factura_crear', { id: f.id, serie: f.serie, total: f.total });
    await mostrarFacturaBorrador(f.id, { titulo: `✓ Factura en BORRADOR (sin número, sin enviar). id: ${f.id}`, avisos: p.avisos });
}

async function mostrarFacturaBorrador(id, { titulo, avisos = [] }) {
    const f = await api(`/api/facturacion/facturas/${id}`);
    const { rev, texto: tRev } = await revisionFactura(f);
    const pdf = await bajarPdf(`/api/facturacion/facturas/${id}/pdf`, `Factura BORRADOR ${String(id).slice(0, 8)} - ${f.cliente?.razon_social || ''}.pdf`);
    const paraFran = [await textoFactura(f), '', tRev, ...avisos.map(a => `⚠️ ${a}`)].join('\n');
    const salida = [titulo, SEP, paraFran, SEP, `PDF (borrador): ${pdf}`];
    if (OPT['a-fran']) salida.push(await aFran(pdf, paraFran, preguntaEmitir(f, rev)));
    else salida.push(`Para enseñárselo: node scripts/asistente_whatsapp.js enviar-fichero "${pdf}" "<el texto de arriba>" --despues "${preguntaEmitir(f, rev)}" --enviar`);
    console.log(salida.join('\n'));
}

async function facturaVer() {
    const fila = await resolverFactura(POS[2]);
    const f = await api(`/api/facturacion/facturas/${fila.id}`);
    const salida = [await textoFactura(f)];
    if (OPT.pdf || OPT['a-fran']) {
        const pdf = await bajarPdf(`/api/facturacion/facturas/${fila.id}/pdf`, f.numero ? `${f.numero} - ${f.cliente?.razon_social || ''}.pdf` : `Factura BORRADOR ${String(f.id).slice(0, 8)}.pdf`);
        salida.push(`PDF: ${pdf}`);
        if (OPT['a-fran']) salida.push(await aFran(pdf, salida[0], ''));
    }
    console.log(salida.join('\n'));
}

async function facturaRevisar() {
    const fila = await resolverFactura(POS[2]);
    const f = await api(`/api/facturacion/facturas/${fila.id}`);
    if (f.estado !== 'BORRADOR') parar(`La factura ya está emitida (${f.numero}).`);
    await mostrarFacturaBorrador(f.id, { titulo: 'Revisión para EMITIR (no se ha emitido nada):' });
}

async function facturaEmitir() {
    const fila = await resolverFactura(POS[2]);
    const f = await api(`/api/facturacion/facturas/${fila.id}`);
    if (f.estado !== 'BORRADOR') parar(`La factura ya está emitida (${f.numero}).`);
    if (!OPT.emitir) return facturaRevisar();
    const si = OPT.si && OPT.si !== true ? String(OPT.si).trim() : '';
    if (!si) parar('Falta --si "<la respuesta LITERAL de Fran>": emitir da el número legal y no tiene vuelta atrás.');
    const rev = (leerVistos().revisadas || {})[f.id];
    if (!rev || Date.now() - rev.t > VIGENCIA_MS) parar('Esta factura no se ha revisado en las últimas 24 h: `factura revisar <id>`, enséñasela a Fran (con el nº que le tocará) y espera su «sí».');
    if (f.revision?.errores?.length) parar(`No se puede emitir:\n${f.revision.errores.map(e => `• ${e}`).join('\n')}`);
    let e;
    try {
        e = await api(`/api/facturacion/facturas/${f.id}/emitir`, { method: 'POST', body: {}, ms: 240_000 });
    } catch (err) {
        apuntar('factura_emitir_fallo', { id: f.id, si, error: err.message, errores: err.data?.errores });
        if (err.data?.errores?.length) parar(`No se ha emitido:\n${err.data.errores.map(x => `• ${x}`).join('\n')}`);
        throw err;
    }
    const v = leerVistos(); delete (v.revisadas || {})[f.id]; guardarVistos(v);
    apuntar('factura_emitir', { id: f.id, numero: e.numero, previsto: rev.numero, total: e.total, si });
    const salida = [
        `✓ Factura *${e.numero}* EMITIDA (${eur(e.total)}). NO se ha enviado a nadie.`,
        rev.numero && e.numero !== rev.numero ? `⚠️ Se anunció ${rev.numero} y ha salido ${e.numero} (alguien emitió entre medias): díselo a Fran.` : null,
        ...(e.avisos || []).map(a => `⚠️ ${a}`),
        e.pdf ? null : `⚠️ El PDF no se ha generado (${e.errorPdf || 'error'}): la factura SÍ está emitida; se rehace desde la app.`,
    ].filter(Boolean);
    if (e.pdf) {
        try {
            const pdf = await bajarPdf(`/api/facturacion/facturas/${f.id}/pdf`, `${e.numero} - ${f.cliente?.razon_social || ''}.pdf`);
            salida.push(`PDF: ${pdf}`);
            if (OPT['a-fran']) salida.push(await aFran(pdf, salida[0], `¿Se la mando a ${f.cliente?.razon_social || 'el cliente'}? Es otro «sí»: te enseño antes el mensaje.`));
        } catch (err) { salida.push(`(No he podido bajar el PDF: ${err.message})`); }
    }
    console.log(salida.join('\n'));
}

async function facturaMensajeOEnviar() {
    const fila = await resolverFactura(POS[2]);
    const prev = await api(`/api/facturacion/facturas/${fila.id}/mensaje`);
    if (POS[1] === 'mensaje') delete OPT.enviar;
    await enviarComun({
        tipo: 'F', id: fila.id, numero: prev.numero || 'BORRADOR', estado: prev.estado, destino: prev.destino || {},
        mensajeDefecto: prev.mensaje, rutaEnviar: `/api/facturacion/facturas/${fila.id}/enviar`,
        sePuede: prev.estado === 'BORRADOR' ? 'Es un borrador: primero hay que EMITIRLA (`factura revisar`, el «sí» de Fran y `factura emitir`).' : null,
    });
}

// ── La FML del mes ──────────────────────────────────────────────────────────
async function mensualFml() {
    const F = await logicaFactura();
    const L = await logica();
    const { facturas = [] } = await api('/api/facturacion/facturas?serie=FML');
    const corr = (n) => Number(String(n).match(/_(\d+)$/)?.[1] || 0);
    const emitidas = facturas.filter(f => f.numero && F.RE_ORDINARIA.test(f.numero))
        .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || corr(b.numero) - corr(a.numero));
    if (!emitidas.length) parar('No hay ninguna FML emitida de la que partir.');
    const ult = await api(`/api/facturacion/facturas/${emitidas[0].id}`);
    const lineas = (ult.lineas || []).map(l => ({ ...l, uds: Math.abs(num(l.uds) || 1), descripcion: F.avanzarMes(l.descripcion), detalle: F.avanzarMes(l.detalle) }));
    const c = F.calcularFactura({ lineas, irpfPct: ult.irpf_pct });
    const concepto = L.conceptoDeLineas(lineas);
    const fechaOp = ult.fecha_operacion ? F.avanzarMes(ult.fecha_operacion) : null;
    // La FML es UNA al mes y casi siempre con el mismo concepto: lo que se vigila es que
    // no haya ya un borrador ni una emitida con fecha de ESTE mes (no el concepto repetido).
    const mes = hoyMadrid().slice(0, 7);
    const borrador = facturas.find(f => f.estado === 'BORRADOR');
    const delMes = facturas.find(f => f.numero && F.RE_ORDINARIA.test(f.numero) && String(f.fecha || '').slice(0, 7) === mes);
    const sinCambio = concepto === L.conceptoDeLineas(ult.lineas || []) && fechaOp === (ult.fecha_operacion || null);
    const bloqueo = [
        borrador ? `Ya hay una FML en BORRADOR (id ${borrador.id}): revísala o emítela en vez de hacer otra.` : null,
        delMes ? `La de este mes ya está emitida: ${delMes.numero} (${fechaEs(delMes.fecha)}).` : null,
    ].filter(Boolean);
    const avisos = [
        ...bloqueo,
        sinCambio ? 'El concepto no lleva mes («… octubre 2026»): sale con el MISMO texto que la anterior (lo normal si siempre es igual).' : null,
    ].filter(Boolean);
    if (!OPT.crear) {
        console.log([
            `EN SECO: la FML de este mes sería la copia de *${ult.numero}* (${fechaEs(ult.fecha)}) con el mes avanzado:`, SEP,
            `Fecha ${fechaEs(hoyMadrid())}${fechaOp ? ` · operación: ${fechaOp}` : ''} · a ${ult.cliente?.razon_social || '¿?'}`,
            await textoLineas(lineas), '', textoTotalesFactura(c, ult.irpf_pct),
            ...avisos.map(a => `⚠️ ${a}`), SEP,
            'Para dejarla en BORRADOR (sin número): mensual-fml --crear [--a-fran]. Emitirla es otro «sí».',
        ].join('\n'));
        return;
    }
    if (bloqueo.length && !OPT.otra) parar(`${bloqueo.join(' ')} No hago otra (--otra si de verdad hace falta).`);
    const r = await api(`/api/facturacion/facturas/${ult.id}/duplicar`, { method: 'POST', body: {} });
    const f = r.factura || {};
    apuntar('fml_mensual', { id: f.id, copia_de: ult.numero });
    await mostrarFacturaBorrador(f.id, { titulo: `✓ FML del mes en BORRADOR (copia de ${ult.numero}, sin número). id: ${f.id}` });
}

// ═════════════════════════════════════════════════════════════════════════════
// CATÁLOGO Y CLIENTES
// ═════════════════════════════════════════════════════════════════════════════

async function articulos() {
    const cat = await catalogo();
    const activos = cat.filter(a => a.activo !== false);
    const porId = new Map(cat.map(a => [a.id, a]));
    const texto = POS.slice(1).join(' ');
    const ts = terminos(texto);
    let filas = activos;
    if (ts.length) {
        filas = activos.map(a => ({ a, n: ts.filter(t => casa(t, pajarArticulo(a) + (a.variantes || []).map(v => ` ${sinTildes(v.nombre)} `).join('|'))).length }))
            .filter(x => x.n > 0).sort((x, y) => y.n - x.n || (y.a.usos || 0) - (x.a.usos || 0)).map(x => x.a);
    }
    if (!filas.length) { console.log(`Nada en el catálogo con «${texto}».`); return; }
    const ver = (a) => {
        const precio = a.variantes?.length
            ? a.variantes.map(v => `${v.nombre} ${v.precio > 0 ? eur(v.precio) : '⚠️ sin precio'}`).join(' · ')
            : a.precio > 0 ? eur(a.precio) : '⚠️ sin precio';
        const arr = (a.arrastra || []).map(x => { const t = porId.get(x.articulo_id); return t ? `${uds(x.uds)} × ${t.nombre} (${eur(t.precio)})` : null; }).filter(Boolean);
        return `• *${a.nombre}* — ${precio}${a.suplido ? ' (tasa: sin IVA)' : a.iva_pct !== 21 ? ` · IVA ${a.iva_pct} %` : ''}`
            + `${arr.length ? `\n   lleva: ${arr.join(', ')}` : ''}${a.genera ? `\n   al aceptarlo abre expediente de CEE (${a.genera === 'CEE_DOBLE' ? 'inicial + final' : 'uno'})` : ''}`
            + `${OPT.ids ? `\n   id: ${a.id}` : ''}`;
    };
    // Por familia, como la pantalla; las tasas al final (las añade su artículo).
    const familias = [...new Set(filas.map(a => a.familia || 'OTROS'))].sort((x, y) => (x === 'TASAS') - (y === 'TASAS'));
    console.log([`*Catálogo*${texto ? ` («${texto}»)` : ''} · precios SIN IVA`,
        ...familias.map(fam => `\n_${fam}_\n${filas.filter(a => (a.familia || 'OTROS') === fam).map(ver).join('\n')}`)].join('\n'));
}

async function clienteOrden() {
    const texto = POS.slice(1).join(' ');
    const r = await buscarClientes(texto, 15);
    if (!r.total) { console.log(`Ninguna ficha con «${texto}». Si es nuevo: "cliente_nuevo" con nombre y teléfono.`); return; }
    console.log([`${r.total} ficha(s) con «${texto}»${r.total > r.clientes.length ? ` (enseño ${r.clientes.length})` : ''}:`, ...r.clientes.map(lineaCliente),
        r.total > 1 ? 'Varias: pregúntale a Fran cuál (por municipio, DNI o partner).' : ''].filter(Boolean).join('\n'));
}

// ── Arranque ────────────────────────────────────────────────────────────────
const ORDENES = {
    articulos: () => articulos(),
    cliente: () => clienteOrden(),
    presupuesto: {
        preparar: presupuestoPreparar, crear: presupuestoCrear, cambiar: presupuestoCambiar, ver: presupuestoVer,
        mensaje: presupuestoMensajeOEnviar, enviar: presupuestoMensajeOEnviar,
    },
    factura: {
        preparar: facturaPreparar, crear: facturaCrear, ver: facturaVer, revisar: facturaRevisar, emitir: facturaEmitir,
        mensaje: facturaMensajeOEnviar, enviar: facturaMensajeOEnviar,
    },
    'mensual-fml': () => mensualFml(),
};

if (require.main === module) (async () => {
    const o = ORDENES[POS[0]];
    const f = typeof o === 'function' ? o : o?.[POS[1]];
    if (!f) {
        console.log('Órdenes: articulos [texto] · cliente <texto> · presupuesto preparar|crear|cambiar|ver|mensaje|enviar · '
            + 'factura preparar|crear|ver|revisar|emitir|mensaje|enviar · mensual-fml   (ver la cabecera del fichero)');
        process.exitCode = 1;
        return;
    }
    try { await f(); } catch (e) {
        if (e instanceof Parada) { console.log(`✋ ${e.message}`); process.exitCode = 2; return; }
        console.error(`✗ ${e.message}`); process.exitCode = 1;
    }
})();

module.exports = { resolverArticulo, resolverVariante, prepararPresupuesto, prepararFactura };
