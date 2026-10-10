#!/usr/bin/env node
// ============================================================================
// alta_oportunidad.js — DAR DE ALTA una oportunidad con lo que el instalador
// mandó por WhatsApp (referencia catastral, foto de la caldera y su placa, a
// veces un croquis o el presupuesto, el nombre y el DNI del cliente).
//
// Lo usa la skill `alta-oportunidad` (skills/alta-oportunidad).
//
//   node scripts/alta_oportunidad.js chats "<nombre del chat>"
//   node scripts/alta_oportunidad.js chat <telefono|chatId> [--dias 14]
//            [--desde "AAAA-MM-DD HH:MM"] [--bajar bloque|todo|no] [--out DIR]
//   node scripts/alta_oportunidad.js escuchar <audio.ogg> [...]
//   node scripts/alta_oportunidad.js catastro <RC> [--dni X]
//   node scripts/alta_oportunidad.js leer --placa a.jpg[,b.jpg] [--combustible gasoleo]
//   node scripts/alta_oportunidad.js leer --presupuesto p.pdf
//   node scripts/alta_oportunidad.js leer --rc fichero.pdf|foto.jpg
//   node scripts/alta_oportunidad.js aerotermia "<marca> <modelo>"
//   node scripts/alta_oportunidad.js crear --plan plan.json [--escribir]
//   node scripts/alta_oportunidad.js obra <26RES080_OP52|26RES080_87>
//   node scripts/alta_oportunidad.js documentar --op <nº> --plan docs.json [--escribir]
//   node scripts/alta_oportunidad.js renombrar --op <nº> --tel <tel> [--anteponer] [--nombre "Nombre (Partner)"] [--escribir]
//
// REGLAS (ver skills/alta-oportunidad/SKILL.md):
//   · El chat se LEE en el servidor (la sesión de WhatsApp vive en el VPS) por
//     `/api/whatsapp/conversacion` con la clave interna. Solo lectura: no se
//     envía nada, no se marca como leído, no se crea ningún chat.
//   · El alta sale por las MISMAS funciones que el funnel interno («Nueva
//     simulación»): `funnelToCalculatorInputs`, `computeFullCalculatorResult`,
//     `createLead` y `subirFicherosASlot`. La oportunidad de la skill y la del
//     formulario no pueden diferir.
//   · El modelo solo LEE; el plan lo escribe quien ha mirado las fotos.
//   · El CEE que aporta el cliente (`cee` del plan) entra como en la calculadora:
//     `comparativa` → `ceeParaComparativa` (sigue estimada; la propuesta ofrece
//     «con tu CEE / CEE nuevo BROKERGY»); `cee` → `seedInputsFromCees`.
//   · Sin --escribir no se toca nada.
// ============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { registerHooks } = require('node:module');

// Los módulos del funnel importan sin extensión (`'./boilerMapping'`), que es lo
// que hace Vite y Node no. Solo se toca lo relativo que no se resuelve tal cual.
registerHooks({
    resolve(specifier, context, nextResolve) {
        try { return nextResolve(specifier, context); } catch (e) {
            if (!/^\.\.?\//.test(specifier) || /\.[cm]?jsx?$/.test(specifier)) throw e;
            for (const suf of ['.js', '.jsx', '/index.js']) {
                try { return nextResolve(specifier + suf, context); } catch { /* siguiente */ }
            }
            throw e;
        }
    },
});

const supabase = require('../services/supabaseClient');
const alta = require('../utils/altaOportunidad');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const SCRATCH = path.join(__dirname, '..', 'scratch', 'alta-oportunidad');
const API = String(process.env.BROKERGY_API_URL || 'https://app.brokergy.es').replace(/\/+$/, '');

const esm = f => import(pathToFileURL(path.join(FRONT, f)).href);

/** `parseCeeXml` usa el DOMParser del navegador: en Node, @xmldom (como test_xml_cee_v30). */
function instalarDomParser() {
    if (globalThis.DOMParser) return;
    const xmldom = require(path.join(FRONT, '..', 'node_modules', '@xmldom', 'xmldom'));
    const conQuery = (doc) => {
        doc.querySelector = (sel) => (sel === 'parsererror' ? (doc.getElementsByTagName('parsererror')[0] || null) : null);
        return doc;
    };
    globalThis.DOMParser = class {
        parseFromString(s, tipo) {
            const p = new xmldom.DOMParser({ onError: () => {} });
            try { return conQuery(p.parseFromString(s, tipo)); }
            catch { return conQuery(p.parseFromString('<parsererror>XML mal formado</parsererror>', 'text/xml')); }
        }
    };
}
// `toLocaleString('es-ES')` no agrupa los números de cuatro cifras («8126,84 €»).
const miles = (n, dec = 0) => {
    const [ent, frac] = Math.abs(Number(n)).toFixed(dec).split('.');
    return `${Number(n) < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${frac ? `,${frac}` : ''}`;
};
const eur = n => (n === null || n === undefined || n === '' ? '—' : `${miles(n, 2)} €`);
const dosDec = n => (n === null || n === undefined || n === '' ? '—' : Number(n).toFixed(2).replace('.', ','));

// ─── Argumentos ─────────────────────────────────────────────────────────────

const [, , ORDEN, ...RESTO] = process.argv;
// Lo posicional, sin los VALORES de las opciones (`--dias 14` no es un fichero).
const SIN_VALOR = new Set(['--escribir', '--anteponer', '--forzar-ficha']);
const POS = [];
for (let i = 0; i < RESTO.length; i++) {
    const a = RESTO[i];
    if (a.startsWith('--')) {
        if (!a.includes('=') && !SIN_VALOR.has(a) && RESTO[i + 1] && !RESTO[i + 1].startsWith('--')) i += 1;
        continue;
    }
    POS.push(a);
}
function opt(nombre) {
    const i = RESTO.findIndex(a => a === `--${nombre}` || a.startsWith(`--${nombre}=`));
    if (i < 0) return null;
    const a = RESTO[i];
    if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
    const sig = RESTO[i + 1];
    return sig && !sig.startsWith('--') ? sig : true;
}
const ESCRIBIR = RESTO.includes('--escribir');

// ─── La API del servidor (la sesión de WhatsApp vive en el VPS) ─────────────

async function api(ruta, { method = 'GET', body = null, binario = false, ms = 150_000 } = {}) {
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
        throw new Error(`No se ha podido hablar con ${API}: ${e.message}`);
    }
    const tipo = r.headers.get('content-type') || '';
    if (!r.ok) {
        if (/text\/html/.test(tipo) || r.status === 404 && !/json/.test(tipo)) {
            throw new Error(`${API}${ruta} → ${r.status}. ¿Está desplegada la ruta de conversaciones `
                + '(routes/whatsapp.js · /conversacion) en el servidor?');
        }
        let msg = `${r.status}`;
        try { msg = (await r.json()).error || msg; } catch { /* sin cuerpo */ }
        const e = new Error(msg);
        e.status = r.status;
        throw e;
    }
    if (binario) {
        const nombre = decodeURIComponent(r.headers.get('x-nombre-archivo') || '');
        return { buffer: Buffer.from(await r.arrayBuffer()), mimetype: tipo, nombre };
    }
    return r.json();
}

// ─── chats / chat ───────────────────────────────────────────────────────────

const hora = t => new Date(t * 1000).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

async function chats() {
    const q = POS.join(' ').trim();
    if (!q) throw new Error('Uso: chats "<parte del nombre del chat>"');
    const { chats: lista } = await api(`/api/whatsapp/conversacion/chats?q=${encodeURIComponent(q)}`);
    if (!lista.length) { console.log(`Ningún chat contiene «${q}» en su nombre.`); return; }
    for (const c of lista) {
        console.log(`${c.grupo ? '[grupo] ' : ''}${c.nombre || '—'}  ·  ${c.telefono || c.chatId}  ·  último: ${c.t ? hora(c.t) : '—'}`
            + (c.telefono ? '' : `  (chatId ${c.chatId})`));
    }
}

async function chat() {
    const quien = POS[0];
    if (!quien) throw new Error('Uso: chat <telefono|chatId> [--dias 14] [--desde "AAAA-MM-DD HH:MM"] [--bajar bloque|todo|no]');
    const dias = Number(opt('dias')) || 14;
    const cuerpo = /@/.test(quien) ? { chatId: quien, dias } : { telefono: quien, dias };
    const conv = await api('/api/whatsapp/conversacion', { method: 'POST', body: cuerpo });

    const desde = opt('desde');
    const bloque = alta.bloquePeticion(conv.mensajes, {
        desdeSeg: desde && desde !== true ? alta.segundosMadrid(desde) : null,
    });
    const enBloque = new Set(bloque.mensajes.map(m => m.id));

    const sufijo = String(conv.telefono || conv.chatId).replace(/\D/g, '').slice(-9);
    const out = opt('out') && opt('out') !== true
        ? path.resolve(opt('out'))
        : path.join(SCRATCH, `${sufijo}-${new Date().toISOString().slice(0, 10)}`);
    fs.mkdirSync(out, { recursive: true });

    console.log(`\nCHAT  ${conv.nombre || '—'}  ·  ${conv.telefono || conv.chatId}  ·  últimos ${conv.dias} días`
        + (conv.incompleto ? '  ⚠ no se ha podido cargar todo el periodo' : ''));
    console.log('─'.repeat(100));
    for (const m of conv.mensajes) {
        const marca = enBloque.has(m.id) ? '▶' : ' ';
        console.log(`${marca} ${hora(m.t)}  ${m.de_mi ? 'NOSOTROS' : 'ELLOS   '}  ${alta.resumenMensaje(m)}`);
    }

    // Lo que se baja: por defecto lo que mandaron ELLOS en el bloque de la petición.
    const modo = opt('bajar') && opt('bajar') !== true ? opt('bajar') : 'bloque';
    const aBajar = modo === 'no' ? []
        : (modo === 'todo' ? conv.mensajes : bloque.mensajes).filter(m => !m.de_mi && m.descargable);
    let n = 0;
    for (const m of aBajar) {
        n += 1;
        try {
            // eslint-disable-next-line no-await-in-loop
            const f = await api(`/api/whatsapp/conversacion/adjunto?msg=${encodeURIComponent(m.id)}`, { binario: true });
            const nombre = `${String(n).padStart(2, '0')}_${(f.nombre || m.nombre_archivo || 'adjunto').replace(/[\\/:*?"<>|]+/g, '_')}`;
            const ruta = path.join(out, nombre);
            fs.writeFileSync(ruta, f.buffer);
            m.fichero = ruta;
        } catch (e) {
            m.error_bajada = e.message;
        }
    }

    fs.writeFileSync(path.join(out, 'conversacion.json'), JSON.stringify({ ...conv, bloque: {
        desde: bloque.desde, hasta: bloque.hasta, ids: bloque.mensajes.map(m => m.id), motivo: bloque.motivo,
    } }, null, 1));

    console.log('─'.repeat(100));
    console.log(`\nBLOQUE DE LA PETICIÓN (▶): ${bloque.mensajes.length} mensajes, ${hora(bloque.desde)} → ${hora(bloque.hasta)}`
        + `  ·  ${bloque.motivo}`);
    console.log('  Si no es ese, vuelve a lanzarlo con --desde "AAAA-MM-DD HH:MM".');
    const bajados = aBajar.filter(m => m.fichero);
    if (bajados.length) {
        console.log(`\nBAJADOS en ${out}:`);
        for (const m of bajados) console.log(`  ${path.basename(m.fichero)}   (${m.tipo}${m.texto ? ` · «${m.texto.slice(0, 60)}»` : ''})  wa=${m.id}`);
    }
    for (const m of aBajar.filter(x => x.error_bajada)) console.log(`  ✗ ${m.tipo} ${hora(m.t)}: ${m.error_bajada}`);
    const contactos = bloque.mensajes.flatMap(m => m.contactos || []);
    for (const c of contactos) console.log(`\nTARJETA DE CONTACTO: ${c.nombre || '—'} · ${c.telefonos.join(', ') || 'sin teléfono'}`);
    console.log(`\nconversacion.json → ${path.join(out, 'conversacion.json')}`);
}

// ─── escuchar (notas de voz) ────────────────────────────────────────────────

async function escuchar() {
    if (!POS.length) throw new Error('Uso: escuchar <audio.ogg> [...]');
    const { llamarGemini } = require('../services/placaOcrService');
    for (const f of POS) {
        const buffer = fs.readFileSync(f);
        const mimeType = alta.mimeDeFichero(f);
        // eslint-disable-next-line no-await-in-loop
        const r = await llamarGemini([{ buffer, mimeType }], {
            prompt: 'Transcribe literalmente esta nota de voz en español (de un instalador de calefacción). '
                + 'No resumas ni corrijas: copia lo que dice. Si algo no se entiende, escribe [inaudible].',
            schema: { type: 'object', properties: { transcripcion: { type: 'string' } }, required: ['transcripcion'] },
            etiqueta: 'audioWa', maxTokens: 4096,
        });
        console.log(`\n${path.basename(f)}:\n  «${r.transcripcion}»`);
    }
}

// ─── catastro ───────────────────────────────────────────────────────────────

async function catastro() {
    const rc = String(POS[0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rc.length !== 14 && rc.length !== 20) throw new Error('Uso: catastro <referencia catastral de 14 o 20 caracteres>');
    const cat = require('../services/catastroService');
    const d = await cat.getByRC(rc);
    if (!d) throw new Error(`El Catastro no devuelve nada para ${rc}.`);
    if (d.tipo === 'RC_PARCELA' || d.inmuebles) {
        console.log(`\n${rc} es una PARCELA con varios inmuebles: hay que elegir la vivienda (RC de 20).`);
        for (const i of (d.inmuebles || []).slice(0, 40)) console.log(`  ${i.rc || i.referencia}  ${i.uso || ''}  ${i.direccion || ''}`);
        return;
    }
    console.log(`\n${d.rc} · ${d.address}`);
    console.log(`  ${d.use || '—'} · año ${d.yearBuilt || '—'} · ${d.totalSurface || '—'} m² construidos · `
        + `zona ${d.climateInfo?.climateZone || '—'} · participación ${d.participation || '—'} % · ${d.typeCatastro || ''}`);
    console.log('  CONSTRUCCIONES (código · uso · planta · m²):');
    for (const c of d.constructions || []) console.log(`    ${c.code}  ${c.originalType || c.type}  planta ${c.floor}  ${c.surface} m²`);
    const prev = await alta.oportunidadesDeLaRc(supabase, d.rc);
    if (prev.length) {
        console.log('\n  ⚠ ESTA VIVIENDA YA TIENE OPORTUNIDAD:');
        for (const o of prev) console.log(`    ${o.id_oportunidad} · ${o.estado || '?'} · ${o.referencia_cliente || ''} · ${new Date(o.created_at).toLocaleDateString('es-ES')}`);
    } else console.log('\n  Sin oportunidades previas con esta referencia.');
    const dni = opt('dni');
    if (dni && dni !== true) {
        const { data } = await supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos, tlf, email')
            .ilike('dni', String(dni).trim()).limit(3);
        console.log(data?.length ? `\n  El DNI ya es de: ${data.map(c => `${c.nombre_razon_social} ${c.apellidos || ''}`).join(' · ')}`
            : '\n  Ese DNI no está en clientes (se dará de alta).');
    }
}

// ─── leer (placa · presupuesto · referencia catastral) ──────────────────────

function ficherosDe(lista) {
    return String(lista).split(',').map(s => s.trim()).filter(Boolean).map(f => ({
        originalname: path.basename(f), mimetype: alta.mimeDeFichero(f), buffer: fs.readFileSync(f),
    }));
}

async function leer() {
    if (opt('placa')) {
        const { leerPlacaCaldera } = require('../services/placaOcrService');
        const comb = opt('combustible');
        const r = await leerPlacaCaldera(ficherosDe(opt('placa')), { combustible: comb && comb !== true ? comb : null });
        console.log(JSON.stringify({ leido: r.leido, potencia_kw: r.potencia_kw, potencia_base: r.potencia_base, avisos: r.avisos }, null, 1));
        return;
    }
    if (opt('presupuesto')) {
        const { extraerDocumentoObra } = require('../routes/facturaOcr');
        const r = await extraerDocumentoObra(ficherosDe(opt('presupuesto')), 'presupuesto');
        console.log(JSON.stringify({ doc: r.doc, equipos: r.equipos }, null, 1));
        const { casarConCatalogo } = require('../services/placaEquipoOcrService');
        for (const e of r.equipos.filter(x => ['AEROTERMIA', 'ACS'].includes(x.partida) && x.modelo)) {
            // eslint-disable-next-line no-await-in-loop
            const c = await casarConCatalogo({ marca: e.marca, modelo: e.modelo }, null);
            console.log(`\n${e.partida} «${e.marca || ''} ${e.modelo}» → `
                + (c.modelo ? `catálogo id ${c.modelo.id} (${c.modelo.marca} ${c.modelo.modelo_comercial}) por ${c.por}`
                    : (c.candidatos.length ? `${c.candidatos.length} candidatos: ${c.candidatos.map(x => `${x.id} ${x.modelo_comercial}`).join(' · ')}`
                        : 'NO está en el catálogo')));
            if (c.aviso) console.log(`  ${c.aviso}`);
        }
        return;
    }
    if (opt('rc')) {
        const { leerReferencias } = require('../services/catastroOcrService');
        const r = await leerReferencias(ficherosDe(opt('rc')));
        console.log(JSON.stringify(r, null, 1));
        return;
    }
    throw new Error('Uso: leer --placa a.jpg[,b.jpg] | --presupuesto p.pdf | --rc f');
}

async function aerotermia() {
    const texto = POS.join(' ').trim();
    if (!texto) throw new Error('Uso: aerotermia "<marca> <modelo>"');
    const [marca, ...resto] = texto.split(/\s+/);
    const { casarConCatalogo } = require('../services/placaEquipoOcrService');
    let c = await casarConCatalogo({ marca, modelo: resto.join(' ') }, null);
    if (!c.modelo && !c.candidatos.length) c = await casarConCatalogo({ marca: null, modelo: texto }, null);
    console.log(c.modelo ? `id ${c.modelo.id} · ${c.modelo.marca} ${c.modelo.modelo_comercial} (${c.modelo.potencia_calefaccion} kW) por ${c.por}`
        : (c.candidatos.length ? c.candidatos.map(x => `${x.id} · ${x.marca} ${x.modelo_comercial}`).join('\n') : c.aviso || 'Nada.'));
}

// ─── crear ──────────────────────────────────────────────────────────────────

async function crear() {
    const fPlan = opt('plan');
    if (!fPlan || fPlan === true) throw new Error('Uso: crear --plan plan.json [--escribir]');
    const base = path.dirname(path.resolve(fPlan));
    const plan = JSON.parse(fs.readFileSync(fPlan, 'utf8'));
    const avisos = [];

    // 1. Lo que no depende de nada: partner, Catastro, cliente previo.
    const partner = await alta.resolverPartner(supabase, plan.prescriptor);
    const cat = require('../services/catastroService');
    const rc = String(plan.rc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rc.length !== 20) throw new Error('El plan necesita la referencia catastral de la VIVIENDA (20 caracteres).');
    const raw = await cat.getByRC(rc);
    if (!raw?.constructions) throw new Error(`El Catastro no devuelve el inmueble ${rc}.`);

    // Una construcción que solo se calienta EN PARTE (la mitad del sótano): se
    // cuenta con los m² que dice el plan y se añade a `construcciones`. Se
    // escribe sobre la construcción misma para que la selección, el desglose
    // guardado y la calculadora al abrirse sumen lo mismo.
    const parciales = plan.construcciones_parciales || {};
    for (const [codigo, m2] of Object.entries(parciales)) {
        const c = (raw.constructions || []).find(x => String(x.code || '').trim() === codigo);
        if (!c) throw new Error(`construcciones_parciales: el Catastro no tiene ${codigo}.`);
        if (!(Number(m2) > 0) || Number(m2) > Number(c.surface)) throw new Error(`construcciones_parciales: ${codigo} admite de 0 a ${c.surface} m².`);
        avisos.push(`De ${codigo} (${c.originalType || c.type}, ${c.surface} m² en el Catastro) se cuentan solo ${m2} m² calefactados.`);
        c.surface = Number(m2);
        plan.construcciones = [...new Set([...(plan.construcciones || []), codigo])];
    }

    const { desgloseConstrucciones } = await esm('utils/construcciones.js');
    const sel = alta.seleccionConstrucciones(raw.constructions, plan.construcciones, plan.vivienda_construcciones);
    avisos.push(...sel.avisos);
    const desglose = desgloseConstrucciones(raw.constructions, sel.indices);
    const catastroFunnel = {
        ...raw,
        superficieCalefactable: sel.superficie,
        selectedConstructions: sel.indices,
        construcciones: desglose.construcciones,
        construcciones_elegidas: desglose.construcciones_elegidas,
    };

    // 2. Las respuestas del funnel → los inputs, por la MISMA función del formulario.
    const funnel = alta.funnelDesdePlan(plan);
    const { funnelToCalculatorInputs } = await esm('features/landing/data/funnelToInputs.js');
    const { computeFullCalculatorResult } = await esm('features/landing/data/landingCalculation.js');
    const calc = await esm('features/calculator/logic/calculation.js');
    const inputs = funnelToCalculatorInputs(funnel, catastroFunnel, { mode: 'internal' });

    // Lo que la calculadora recalcula al abrirse (CalculatorForm): las U y la
    // ventilación con la ZONA. Si no se hace aquí, el resultado guardado y el
    // que ve el técnico al abrirla no coinciden.
    const u = calc.getUByYear(inputs.anio, inputs.zona, inputs);
    const va = calc.getVentanaYACHByYear(inputs.anio, inputs.zona);
    Object.assign(inputs, { uMuro: u.wall, uCubierta: u.roof, ventanaU: va.ventanaU, ach: va.ach });
    // Orientación de la fachada principal y patios interiores (del croquis o las fotos).
    Object.assign(inputs, alta.ajustesEdificio(plan));

    // 3. La caldera que hay: la fila de la tabla la decide la PLACA (año) o el
    //    plan, no el «más de 20 años» del funnel — que en gasóleo cae en «anterior
    //    a 1985» aunque la caldera sea de 2005.
    if (plan.caldera?.rendimiento_id) {
        const fila = calc.BOILER_EFFICIENCIES.find(b => b.id === plan.caldera.rendimiento_id);
        if (!fila) throw new Error(`rendimiento_id «${plan.caldera.rendimiento_id}» no está en BOILER_EFFICIENCIES.`);
        inputs.boilerId = fila.id;
        inputs.boilerEff = fila.value;
    }
    if (Number(plan.caldera?.potencia_kw) > 0) inputs.potenciaCaldera = Number(plan.caldera.potencia_kw);
    if (plan.caldera?.marca || plan.caldera?.modelo || plan.caldera?.potencia_kw) {
        inputs.placa_caldera = {
            at: new Date().toISOString(),
            marca: plan.caldera.marca || null,
            modelo: plan.caldera.modelo || null,
            numero_serie: plan.caldera.numero_serie || null,
            serie_dudosa: !!plan.caldera.serie_dudosa,
            potencia_kw: Number(plan.caldera.potencia_kw) || null,
            combustible: plan.caldera.combustible || null,
            origen: 'whatsapp',
        };
    }

    // 4. La aerotermia: con los MISMOS campos que «Leer la placa» de la calculadora.
    const temp = inputs.emitterType === 'radiadores_convencionales' ? 55 : (inputs.emitterType === 'radiadores_baja_temp' ? 45 : 35);
    const aero = await alta.modeloAerotermia(supabase, plan.aerotermia);
    if (aero.modelo) {
        Object.assign(inputs, {
            aerothermiaModel: String(aero.modelo.id), customModelName: '',
            scopHeating: calc.getScopFromModel(aero.modelo, inputs.zona, temp),
            scopTemporada: calc.getScopSeason(aero.modelo, inputs.zona, temp),
            scopAcs: calc.getScopAcsFromModel(aero.modelo, inputs.zona),
            potenciaBomba: Number(aero.modelo.potencia_calefaccion) || inputs.potenciaBomba || 0,
        });
    } else if (aero.custom) {
        Object.assign(inputs, { aerothermiaModel: 'custom', customBrandName: aero.custom.marca, customModelName: aero.custom.modelo });
        if (Number(plan.aerotermia?.scop) > 0) inputs.scopHeating = Number(plan.aerotermia.scop);
        if (Number(plan.aerotermia?.potencia_kw) > 0) inputs.potenciaBomba = Number(plan.aerotermia.potencia_kw);
        avisos.push(`La aerotermia «${aero.custom.marca} ${aero.custom.modelo}» no está en el catálogo: SCOP ${dosDec(inputs.scopHeating)}`
            + `${Number(plan.aerotermia?.scop) > 0 ? ' (del plan)' : ' (el genérico del emisor)'} hasta darla de alta.`);
    } else {
        avisos.push(`Sin aerotermia elegida: la simulación usa el SCOP genérico del emisor (${dosDec(inputs.scopHeating)}).`);
    }

    // 5. ACS con OTRA máquina (bomba de calor de ACS aparte).
    if (funnel.incluir_acs && plan.acs?.equipo) {
        const acs = await alta.modeloAerotermia(supabase, plan.acs.equipo);
        if (acs.modelo) {
            inputs.aerothermiaModelAcs = String(acs.modelo.id);
            inputs.customModelAcsName = '';
            inputs.scopAcs = calc.getScopAcsFromModel(acs.modelo, inputs.zona);
        } else if (acs.custom) {
            Object.assign(inputs, { aerothermiaModelAcs: 'custom', customBrandAcsName: acs.custom.marca, customModelAcsName: acs.custom.modelo });
            if (Number(plan.acs.equipo.scop) > 0) inputs.scopAcs = Number(plan.acs.equipo.scop);
            avisos.push(`El equipo de ACS «${acs.custom.marca} ${acs.custom.modelo}» no está en el catálogo: SCOP_dhw ${dosDec(inputs.scopAcs)}`
                + `${Number(plan.acs.equipo.scop) > 0 ? ' (del plan)' : ' (el genérico)'} hasta darlo de alta.`);
        }
    }

    // 6. El presupuesto: se LEE (mismo lector que «docs_obra» del funnel) y manda
    //    el total CON IVA en la economía; la fila completa va a docs_ocr.
    let docsOcr = null;
    const docPresu = alta.documentoPresupuesto(plan);
    if (docPresu?.fichero) {
        const { extraerDocumentoObra } = require('../routes/facturaOcr');
        const fpath = path.resolve(base, docPresu.fichero);
        const r = await extraerDocumentoObra(ficherosDe(fpath), 'presupuesto');
        const conIva = Number(r.doc.importe_total) || 0;
        if (conIva > 0) {
            funnel.presupuesto_modo = 'documento';
            funnel.presupuesto_eur = Math.round(conIva);
            inputs.presupuesto = Math.round(conIva);
            inputs.presupuestoEstimado = false;
        }
        if (r.doc.iva_estimado) avisos.push('El presupuesto no declara el IVA: se ha supuesto el 21 %.');
        docsOcr = {
            documentos: [{ ...r.doc, slot: 'DOC_PRESUPUESTO', files_count: 1 }],
            equipos: r.equipos || [],
            leido_at: new Date().toISOString(),
        };
        console.log(`\nPRESUPUESTO leído: ${r.doc.numero_factura || 's/n'} · ${eur(r.doc.importe_sin_iva)} + IVA ${dosDec(r.doc.iva_pct)} % = ${eur(conIva)}`
            + ` · emisor ${r.doc.emisor_nombre || '—'} · cliente ${r.doc.cliente_nombre || '—'}`);
    } else if (Number(plan.presupuesto?.importe_con_iva) > 0) {
        funnel.presupuesto_modo = 'tengo';
        funnel.presupuesto_eur = Math.round(Number(plan.presupuesto.importe_con_iva));
        inputs.presupuesto = funnel.presupuesto_eur;
        inputs.presupuestoEstimado = false;
    } else {
        avisos.push(`Sin presupuesto: la propuesta irá con el ESTIMADO de ${eur(inputs.presupuesto)} (y lo dirá).`);
    }

    // 6b. El CEE que aporta el cliente (el más reciente). Se LEE con el mismo OCR que
    //     «Nueva simulación» y entra por las MISMAS funciones de la calculadora:
    //     comparativa → `ceeParaComparativa` (sigue estimada); cee → `seedInputsFromCees`.
    const ceePlan = alta.ceeDelPlan(plan);
    let ceeLeido = null;
    if (ceePlan) {
        const ceeOcr = require('../services/ceeOcrService');
        const { ceeFromOcr } = await esm('features/cee/ceeExtract.js');
        const seed = await esm('features/calculator/logic/ceeSeed.js');
        const { pdf } = await ceeOcr.normalizeToPdf(ficherosDe(ceePlan.ficheros.map(f => path.resolve(base, f)).join(',')));
        ceeLeido = ceeFromOcr(await ceeOcr.extractCeeFromPdf(pdf), null);
        if (ceePlan.modo === 'cee') {
            Object.assign(inputs, seed.seedInputsFromCees({ inicial: ceeLeido, inputs }));
        } else {
            Object.assign(inputs, seed.ceeParaComparativa(ceeLeido), { demandMode: 'estimated' });
        }
        const rcCee = String(ceeLeido.referencia_catastral || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!rcCee) avisos.push('El CEE no deja leer su referencia catastral: comprueba que es de esta vivienda.');
        else if (rcCee.slice(0, 14) !== rc.slice(0, 14)) avisos.push(`El CEE es de OTRA referencia catastral (${rcCee}), no de ${rc}.`);
        if (!(Number(ceeLeido.demandas?.calefaccion_kwh_m2_ano) > 0)) avisos.push('El CEE no deja leer la demanda de calefacción: sin ella no hay comparativa.');
    }

    // 6c. RES080 con los DOS certificados en .xml (`cee_xml: { inicial, final }`): el
    //     inicial y el PREVISTO (o el final) ya calificados por CE3X. Entran como en la
    //     calculadora con los dos .xml cargados —modo «real», ahorro por VECTOR con la
    //     energía final que DECLARA cada certificado— y la superficie es la del
    //     certificado: la energía final del .xml es por m² de SU superficie.
    let ceeXml = null;
    if (plan.cee_xml) {
        if (!funnel.isReforma) throw new Error('cee_xml es para un RES080: pon también "reforma" en el plan.');
        instalarDomParser();
        const { parseCeeXml } = await esm('features/calculator/logic/xmlCeeParser.js');
        const { ceeFromXml } = await esm('features/cee/ceeExtract.js');
        const leerXml = (f) => {
            const buf = fs.readFileSync(path.resolve(base, f));
            try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return buf.toString('latin1'); }
        };
        const tIni = leerXml(plan.cee_xml.inicial);
        const tFin = leerXml(plan.cee_xml.final);
        const xIni = parseCeeXml(tIni);
        const xFin = parseCeeXml(tFin);
        if (!xIni?.energiaFinalVectores || !xFin?.energiaFinalVectores) {
            throw new Error('cee_xml: los dos .xml tienen que declarar <EnergiaFinalVectores> (CE3X 3.1/3.2).');
        }
        const sup = Number(xIni.superficieHabitable) || inputs.superficieCalefactable;
        if (Math.abs(sup - inputs.superficieCalefactable) > 0.5) {
            avisos.push(`Superficie: la del CEE (${dosDec(sup)} m²), no la de vivienda del Catastro (${dosDec(inputs.superficieCalefactable)} m²) — la energía final del .xml es por m² del certificado.`);
        }
        Object.assign(inputs, {
            // Con los dos certificados el ahorro es el MEDIDO: la opción «solo
            // aerotermia» (RES060 estimado) no se ofrece al lado (avisoFc → dosOpciones).
            comparativaReforma: false,
            demandMode: 'real', metodoAhorroRes080: 'simplificado',
            xmlDemandData: xIni, xmlDemandDataFinal: xFin,
            // Sin `cee_previo`: con él la propuesta ofrece la comparativa «con tu CEE /
            // CEE nuevo BROKERGY» (ProposalModal → computeCeeComparison), que con el
            // ahorro ya MEDIDO entre los dos certificados no tiene sentido (26RES080_OP70).
            cee_final: ceeFromXml(xFin), cee_ahorro_origen: 'medido',
            superficieCalefactable: sup, manualSuperficie: sup, manualSupInicial: sup, manualSupFinal: sup,
        });
        ceeXml = { tIni, tFin, xIni, xFin };
        const rcXml = String(xIni.identificacion?.refCatastral || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (rcXml && rcXml.slice(0, 14) !== rc.slice(0, 14)) avisos.push(`El CEE inicial es de OTRA referencia catastral (${rcXml}), no de ${rc}.`);
    }
    if (Number(plan.presupuesto?.envolvente_con_iva) > 0) {
        inputs.presupuestoEnvolvente = Math.round(Number(plan.presupuesto.envolvente_con_iva));
    }
    // La deducción del IRPF se puede dejar fuera de la propuesta (la obra ya tuvo otra
    // ayuda, o ya se la aplicó): `"incluir_irpf": false`.
    if (plan.incluir_irpf === false) inputs.includeIrpf = false;

    // 6.b La comisión por defecto del partner, como la aplica la calculadora al
    //     elegirlo (CalculatorForm): descontada del CLIENTE y, si se pactó en %,
    //     sobre lo que se le ofrece al cliente (logic/comisionPartner.js).
    let comisionPartner = null;
    if (partner?.comision_activa && (parseFloat(partner.comision_valor) || 0) > 0) {
        const { comisionDePct } = await esm('features/calculator/logic/comisionPartner.js');
        const valor = parseFloat(partner.comision_valor);
        const eurMwh = partner.comision_tipo === 'pct' ? comisionDePct(valor, inputs.caePriceClient) : valor;
        if (eurMwh > 0) {
            Object.assign(inputs, { includeCommission: true, caePricePrescriptor: eurMwh, prescriptorMode: 'client' });
            comisionPartner = partner.comision_tipo === 'pct' ? `${valor} % → ${dosDec(eurMwh)} €/MWh` : `${dosDec(eurMwh)} €/MWh`;
        }
    }

    // 7. El resultado, con la MISMA función que guarda el formulario.
    const result = computeFullCalculatorResult(inputs);
    if (ceeXml && result) {
        // Con los dos .xml manda la rama de la calculadora (CalculatorView, modo «real»
        // + simplificado): `computeFullCalculatorResult` solo sabe la estimada.
        result.res080 = calc.calculateRes080SimplificadoFromXml({
            xmlInicial: ceeXml.xIni, xmlFinal: ceeXml.xFin,
            xmlTextoInicial: ceeXml.tIni, xmlTextoFinal: ceeXml.tFin,
            superficieCustom: inputs.superficieCalefactable,
        });
        result.financialsRes080 = result.res080 ? calc.calculateFinancials({
            presupuesto: (inputs.presupuesto || 0) + (inputs.presupuestoEnvolvente || 0),
            presupuestoFotovoltaica: inputs.presupuestoFotovoltaica,
            savingsKwh: result.res080.ahorroEnergiaFinalTotal,
            caePriceClient: inputs.caePriceClient, caePriceSO: inputs.caePriceSO,
            costeVerificacion: inputs.costeVerificacion,
            caePricePrescriptor: inputs.includeCommission ? inputs.caePricePrescriptor : 0,
            prescriptorMode: inputs.prescriptorMode, tipo: inputs.tipo, participation: inputs.participation,
            numOwners: inputs.numOwners, discountCertificates: inputs.discountCertificates,
            includeLegalization: inputs.includeLegalization, installerNoCard: inputs.installerNoCard,
            legalizationPrice: inputs.legalizationPrice, itpPercent: inputs.itpPercent,
            includeIrpf: inputs.includeIrpf, titularType: inputs.titularType || 'particular',
            aplicarIrpfCae: inputs.aplicarIrpfCae === true || inputs.aplicarIrpfCae === 'true',
            includeIVA: inputs.includeIVA === true || inputs.includeIVA === 'true',
        }) : null;
    }
    let comparativa = null;
    if (ceePlan) {
        const { computeCeeComparison } = await esm('features/calculator/logic/ceeComparison.js');
        comparativa = computeCeeComparison(inputs);
    }
    const contacto = alta.contactoDesdePlan(plan);
    const docs = alta.documentosDelPlan(plan, base);
    for (const d of docs) if (!fs.existsSync(d.ruta)) throw new Error(`No existe el fichero ${d.ruta}.`);

    const previas = await alta.oportunidadesDeLaRc(supabase, rc);
    let clientePrevio = null;
    if (contacto.dni) {
        const { data } = await supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos')
            .ilike('dni', contacto.dni).limit(1);
        clientePrevio = data?.[0] || null;
    }

    // ── Lo que se va a hacer ──
    const sav = result?.savings || {};
    const fin = result?.financials || {};
    console.log('\n══════════ ALTA DE OPORTUNIDAD (' + (ESCRIBIR ? 'SE ESCRIBE' : 'EN SECO — no se toca nada') + ') ══════════');
    console.log(`Partner:      ${partner ? `${partner.acronimo || partner.razon_social} (${partner.tipo_empresa})` : 'BROKERGY (sin partner)'}`
        + (comisionPartner ? ` · comisión ${comisionPartner}` : ''));
    console.log(`Cliente:      ${contacto.nombre} ${contacto.apellidos || ''}${contacto.dni ? ' · DNI ✓' : ' · sin DNI'}${contacto.tlf ? ` · ${contacto.tlf}` : ' · sin teléfono'}`
        + (clientePrevio ? `  → ya existe (${clientePrevio.nombre_razon_social} ${clientePrevio.apellidos || ''}): se reutiliza` : '  → cliente nuevo'));
    console.log(`Vivienda:     ${raw.rc} · ${raw.address}`);
    console.log(`              año ${inputs.anio} · zona ${inputs.zona} · ${inputs.tipo} · calefactable ${inputs.superficieCalefactable} m²`
        + ` (${desglose.construcciones.map(c => `${c.codigo} ${c.uso} P${c.planta} ${c.superficie}m²${c.cuenta ? ' ✓' : ' ✗'}`).join(' · ')})`);
    console.log(`Edificio:     fachada principal ${inputs.orientacion === 'media' ? 'sin orientación (media)' : `al ${inputs.orientacion}`} · `
        + `${inputs.patios || 0} patio(s) interior(es) · ${inputs.fachadas} fachada(s) al exterior · ${inputs.plantas} planta(s)`);
    console.log(`Caldera:      ${funnel.combustible_actual || 'sin calefacción'} · ${inputs.boilerId} (η ${inputs.boilerEff})`
        + `${inputs.placa_caldera ? ` · ${inputs.placa_caldera.marca || ''} ${inputs.placa_caldera.modelo || ''} ${inputs.placa_caldera.potencia_kw || '?'} kW` : ''}`);
    console.log(`Emisor:       ${inputs.emitterType} (${temp} °C)`);
    console.log(`ACS:          actual ${funnel.boiler_acs_type || '—'} → ${inputs.boilerAcsType} · se cambia: ${inputs.changeAcs ? 'SÍ' : 'no'}`
        + (inputs.changeAcs ? ` · equipo ${inputs.aerothermiaModelAcs === 'custom' ? `${inputs.customBrandAcsName} ${inputs.customModelAcsName}` : (inputs.aerothermiaModelAcs || 'el mismo')} · SCOP_dhw ${dosDec(inputs.scopAcs)}` : ''));
    console.log(`Aerotermia:   ${aero.modelo ? `${aero.modelo.marca} ${aero.modelo.modelo_comercial} (id ${aero.modelo.id}, ${aero.modelo.potencia_calefaccion} kW)` : (aero.custom ? `${aero.custom.marca} ${aero.custom.modelo} (fuera de catálogo)` : 'genérica')}`
        + ` · SCOP ${dosDec(inputs.scopHeating)} (${inputs.scopTemporada || '—'})`);
    console.log(`Placas FV:    ${inputs.fotovoltaica?.estado || 'sin declarar'}`);
    console.log(`Presupuesto:  ${eur(inputs.presupuesto)}${inputs.presupuestoEstimado ? ' (ESTIMADO)' : ''}`);
    console.log(`RESULTADO:    demanda ${dosDec(result?.q_net)} kWh/m²·año · ahorro ${miles(sav.savingsKwh || 0)} kWh/año`
        + ` · bono CAE ${eur(fin.caeBonus)} · IRPF ${eur(fin.irpfDeduction)} · ayuda total ${eur(fin.totalAyuda)}`);
    if (ceeLeido) {
        const ep = ceeLeido.energia_primaria_no_renovable || {};
        console.log(`CEE cliente:  ${ceeLeido.fecha_certificado || 's/f'} · RC ${ceeLeido.referencia_catastral || '?'} · ${dosDec(ceeLeido.superficie_habitable_m2)} m²`
            + ` · calefacción ${dosDec(ceeLeido.demandas?.calefaccion_kwh_m2_ano)} kWh/m²·año`
            + `${ep.consumo_global_kwh_m2_ano ? ` · EPNR ${dosDec(ep.consumo_global_kwh_m2_ano)} ${ep.calificacion_global || ''}` : ''}`
            + ` · modo ${ceePlan.modo === 'cee' ? 'la simulación USA el CEE' : 'COMPARATIVA (la simulación sigue estimada)'}`);
        if (comparativa) {
            const c = comparativa;
            console.log(`COMPARATIVA:  con su CEE ${miles(c.conCee.ahorroKwh || 0)} kWh → bono ${eur(c.conCee.cae)} (ayuda ${eur(c.conCee.total)})`
                + ` · CEE nuevo BROKERGY ${miles(c.ceeNuevo.ahorroKwh || 0)} kWh → bono ${eur(c.ceeNuevo.cae)} (ayuda ${eur(c.ceeNuevo.total)})`);
            if (Math.round(c.conCee.cae) === Math.round(c.ceeNuevo.cae)) {
                avisos.push('Las dos cifras de la comparativa coinciden: la propuesta NO la enseñará'
                    + (ceePlan.modo === 'cee' ? ' (en modo «cee» la simulación ya usa el certificado).' : '.'));
            }
        } else {
            avisos.push('No se ha podido calcular la comparativa con el CEE (¿falta su demanda de calefacción?).');
        }
    }
    console.log(`Ficha:        ${funnel.isReforma ? 'RES080' : 'RES060'}`);
    if (funnel.isReforma && result?.res080) {
        const r8 = result.res080;
        const f8 = result.financialsRes080 || {};
        console.log(`RES080:       ${r8.metodoAhorro || 'detallado'} · ${r8.fuenteDatos || 'estimado'} · E. final ${dosDec(r8.totalEnergiaInicialM2)} → ${dosDec(r8.totalEnergiaFinalM2)} kWh/m²`
            + ` × ${dosDec(r8.superficieAplicada)} m² · ahorro ${miles(r8.ahorroEnergiaFinalTotal || 0)} kWh/año`
            + ` · bono CAE ${eur(f8.caeBonus)} · IRPF ${eur(f8.irpfDeduction)} · ayuda total ${eur(f8.totalAyuda)}`
            + ` · presupuesto ${eur((inputs.presupuesto || 0) + (inputs.presupuestoEnvolvente || 0))}`);
    }
    // Los apartados que tendrá la oportunidad, con la MISMA función que valida la
    // subida (sin expediente detrás, el alcance es el de la simulación).
    const reformaUpload = require('../services/reformaUploadService');
    const slotsDisponibles = new Set(reformaUpload.buildDocChecklist({ inputs, landing_funnel: funnel, estado: 'PTE ENVIAR' })
        .map(x => x.key));
    console.log('Documentos:');
    for (const d of docs) {
        const ok = slotsDisponibles.has(d.slot);
        console.log(`  ${ok ? '✓' : '✗'} ${d.slot.padEnd(26)} ← ${path.basename(d.ruta)}${d.wa_msg_id ? ' (WhatsApp)' : ''}`
            + (ok ? '' : '   ⚠ ese apartado no existe para esta oportunidad: no se subirá'));
    }
    // REGLA — una vivienda que ya tiene oportunidad PARA: casi siempre es un
    // cambio (otro presupuesto) de una simulación ya hecha, no un alta. Solo se
    // sigue si el plan lo dice a sabiendas (otro titular, la anterior rechazada).
    if (previas.length) {
        const lista = previas.map(o => `${o.id_oportunidad} (${o.estado || '?'})`).join(' · ');
        if (!plan.permitir_duplicado) {
            console.log(`
✗ ESTA VIVIENDA YA TIENE OPORTUNIDAD: ${lista}.`);
            console.log('  No se da de alta otra: pregunta si es un cambio de la existente. Si de verdad es un alta '
                + 'nueva (otro titular, la anterior rechazada), pon "permitir_duplicado": true en el plan y dilo en decisiones.');
            if (ESCRIBIR) throw new Error('Vivienda con oportunidad previa: alta bloqueada.');
        } else {
            console.log(`⚠ ESTA VIVIENDA YA TIENE OPORTUNIDAD: ${lista} — se crea igual (permitir_duplicado) y queda anotado en el historial.`);
        }
    }
    for (const a of avisos) console.log(`⚠ ${a}`);

    if (!ESCRIBIR) {
        console.log('\nEN SECO. Revisa lo de arriba y vuelve a lanzarlo con --escribir.');
        return;
    }

    // ── Escribir ──
    const { createLead } = require('../services/leadService');
    const { getProvinceInfo, normalizeProvinceCode } = require('../data/allowedProvinces');
    const provCode = normalizeProvinceCode(raw.provinceCode);
    const provInfo = (provCode && getProvinceInfo(provCode)) || { provincia: null, ccaa: null };
    const creado = await createLead({
        contacto: { ...contacto },
        catastro: {
            // La dirección del CLIENTE: la que dio el instalador si la dio (el
            // Catastro puede tener otro número de portal), o la del Catastro.
            ref_catastral: raw.rc, address: plan.cliente?.direccion || raw.address,
            municipio: raw.municipality || null, codigo_postal: raw.postalCode || null,
            provinceCode: raw.provinceCode,
        },
        funnel,
        calculatorInputs: inputs,
        precomputedResult: result,
        demandaCalefaccionPorM2: result?.q_net || null,
        // El route lo leía de `catastro.provinceCode` y el formulario lo mandaba
        // fuera: aquí se pasa bien, con la provincia de Catastro como respaldo
        // (`getProvinceInfo` solo conoce las provincias atendidas).
        geoContext: {
            provinceCode: provCode || String(raw.provinceCode || '00').padStart(2, '0'),
            provincia: provInfo.provincia || (raw.province ? alta.capitaliza(raw.province) : null),
            ccaa: provInfo.ccaa || null,
        },
        partnerSlug: null,
        prescriptorId: partner?.id_empresa || null,
        mode: 'internal',
        creatorUser: { rol_nombre: 'ADMIN', acronimo: 'ADMINISTRADOR', id_usuario: await alta.idAdmin(supabase) },
        docsOcr,
    });
    console.log(`\n✓ Creada ${creado.id_oportunidad} (cliente ${creado.cliente_created ? 'nuevo' : 'reutilizado'})`);

    // El rastro: de dónde salió y qué decidió quien la dio de alta.
    await alta.anotarAlta(supabase, creado.oportunidad_uuid, {
        texto: alta.textoHistorial(plan, { avisos }),
        meta: plan.chat ? {
            chat_id: plan.chat.chatId || null, chat_nombre: plan.chat.nombre || null,
            mensajes: (plan.chat.mensajes || []).slice(0, 60), at: new Date().toISOString(),
        } : null,
    });

    // El enlace de subida (y con él `reforma_uploads`) antes de subir nada.
    const enlace = await reformaUpload.ensureUploadLink(creado.oportunidad_uuid);

    // Los documentos, slot a slot y EN SERIE (un slot múltiple numera contando
    // lo que ya hay en Drive). La primera subida crea la carpeta de Drive.
    const colocadas = [];
    const porSlot = new Map();
    for (const d of docs) { if (!porSlot.has(d.slot)) porSlot.set(d.slot, []); porSlot.get(d.slot).push(d); }
    for (const [slot, lista] of porSlot) {
        // eslint-disable-next-line no-await-in-loop
        const { data: opp } = await supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo')
            .eq('id', creado.oportunidad_uuid).single();
        // eslint-disable-next-line no-await-in-loop
        const checklist = await reformaUpload.checklistForOportunidad(opp);
        const slotDef = checklist.find(s => s.key === slot);
        if (!slotDef) { console.log(`  ✗ ${slot}: ese apartado no existe para esta oportunidad (no se sube).`); continue; }
        try {
            // eslint-disable-next-line no-await-in-loop
            const { subidas, fallidas } = await reformaUpload.subirFicherosASlot({
                oportunidadUuid: opp.id, datosCalculo: opp.datos_calculo || {}, slotDef,
                archivos: lista.map(d => ({ originalname: path.basename(d.ruta), mimetype: alta.mimeDeFichero(d.ruta), buffer: fs.readFileSync(d.ruta) })),
                label: lista[0].label || null, subidoPor: 'admin',
            });
            for (const s of subidas) console.log(`  ✓ ${slot} → ${s.name}`);
            for (const f of fallidas) console.log(`  ✗ ${slot}: ${f.error}`);
            lista.filter(d => d.wa_msg_id).forEach(d => colocadas.push({ waMsgId: d.wa_msg_id, slot, tipo: alta.tipoMedia(d.ruta), t: d.t || null }));
        } catch (e) {
            console.log(`  ✗ ${slot}: ${e.message}`);
        }
    }
    if (colocadas.length) {
        const whatsappMedia = require('../services/whatsappMedia');
        const r = await whatsappMedia.registrarColocadas({ id: creado.oportunidad_uuid }, colocadas, 'skill alta-oportunidad');
        console.log(`  (${r.registradas} adjuntos de WhatsApp apuntados como colocados)`);
    }

    const { data: fin2 } = await supabase.from('oportunidades')
        .select('drive:datos_calculo->>drive_folder_link').eq('id', creado.oportunidad_uuid).single();
    console.log(`\nApp:        https://app.brokergy.es/?op=${creado.id_oportunidad}`);
    if (fin2?.drive) console.log(`Drive:      ${fin2.drive}`);
    console.log(`Subida:     ${enlace}`);
    console.log('\nLa oportunidad queda en PTE ENVIAR. La propuesta (PDF) se revisa y se envía desde la app.');
}

// ─── obra · documentar · renombrar (una oportunidad o expediente que YA existe) ─
//
// El cliente sigue mandando cosas por WhatsApp cuando la oportunidad ya está
// creada (fotos de la vivienda, el vídeo, su CEE). `documentar` las coloca en los
// apartados de documentación —carpeta «12. DOCUMENTOS PARA CEE» de Drive— por la
// MISMA `subirFicherosASlot` del gestor de la app, validando contra el checklist
// REAL de esa obra (`checklistForOportunidad`, que ya poda por el alcance del
// expediente). Y `renombrar` pone el nº de la obra en el nombre del chat.

/** «26RES080_OP52» o «26RES080_87» → { opp, expediente, codigo, cliente }. */
async function resolverObra(id) {
    const codigo = String(id || '').trim().toUpperCase();
    if (!codigo) throw new Error('Falta --op <nº de oportunidad o de expediente>.');
    let expediente = null;
    let { data: opp } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, cliente_id, datos_calculo').eq('id_oportunidad', codigo).maybeSingle();
    if (!opp) {
        const { data: ex } = await supabase.from('expedientes')
            .select('id, numero_expediente, oportunidad_id, estado').eq('numero_expediente', codigo).maybeSingle();
        if (!ex) throw new Error(`No hay ninguna oportunidad ni expediente «${codigo}».`);
        expediente = ex;
        ({ data: opp } = await supabase.from('oportunidades')
            .select('id, id_oportunidad, cliente_id, datos_calculo').eq('id', ex.oportunidad_id).maybeSingle());
        if (!opp) throw new Error(`El expediente ${codigo} no tiene oportunidad detrás.`);
    } else {
        const { data: ex } = await supabase.from('expedientes')
            .select('id, numero_expediente, estado').eq('oportunidad_id', opp.id).maybeSingle();
        expediente = ex || null;
    }
    let cliente = null;
    if (opp.cliente_id) {
        const { data } = await supabase.from('clientes')
            .select('nombre_razon_social, apellidos, tlf, persona_contacto_tlf').eq('id_cliente', opp.cliente_id).maybeSingle();
        cliente = data || null;
    }
    // Con expediente, el nº de obra es el del EXPEDIENTE (igual que el lote de la agenda).
    return { opp, expediente, codigo: expediente?.numero_expediente || opp.id_oportunidad, cliente };
}

async function obra() {
    const reformaUpload = require('../services/reformaUploadService');
    const o = await resolverObra(POS[0] || opt('op'));
    const dc = o.opp.datos_calculo || {};
    console.log(`\n${o.opp.id_oportunidad}${o.expediente ? ` · expediente ${o.expediente.numero_expediente} (${o.expediente.estado})` : ''}`
        + ` · ${dc.estado || '—'} · ${o.cliente ? `${o.cliente.nombre_razon_social || ''} ${o.cliente.apellidos || ''}`.trim() : 'sin cliente'}`
        + (o.cliente?.tlf ? ` · tlf ${o.cliente.tlf}` : ' · la ficha no tiene teléfono'));
    console.log(`  Nº de obra para el chat: ${require('../utils/nombreContactoCliente').codigoCorto(o.codigo)}`);
    if (dc.drive_folder_link) console.log(`  Drive: ${dc.drive_folder_link}`);
    const checklist = await reformaUpload.checklistForOportunidad(o.opp);
    const subidas = dc.reforma_uploads || {};
    console.log('  APARTADOS (clave · fase · ya subidas):');
    for (const s of checklist) {
        const n = Array.isArray(subidas[s.key]) ? subidas[s.key].length : 0;
        console.log(`    ${s.key.padEnd(30)} ${String(s.fase || '').padEnd(8)} ${n ? `${n} subida${n > 1 ? 's' : ''}` : '—'}   ${s.label}`);
    }
}

async function documentar() {
    const fPlan = opt('plan');
    if (!fPlan || fPlan === true) throw new Error('Uso: documentar --op <nº> --plan docs.json [--escribir]');
    const base = path.dirname(path.resolve(fPlan));
    const plan = JSON.parse(fs.readFileSync(fPlan, 'utf8'));
    const o = await resolverObra(opt('op') || plan.obra);
    const reformaUpload = require('../services/reformaUploadService');
    const checklist = await reformaUpload.checklistForOportunidad(o.opp);
    const porKey = new Map(checklist.map(s => [s.key, s]));

    // Las ventanas «nueva» se numeran DETRÁS de las que ya tienen foto (el id no
    // se reutiliza: la 3 sigue siendo la 3 aunque se borre la 2).
    const vo = await esm('features/docs/logic/ventanasObra.js');
    const up = o.opp.datos_calculo?.reforma_uploads || {};
    const { ventanas } = vo.ventanasDe(up.FOTO_VENTANAS_ANTES || [], up.FOTO_VENTANAS_DESPUES || []);
    let ultima = ventanas.reduce((m, v) => Math.max(m, v.n || 0), 0);

    const docs = [];
    for (const d of plan.documentos || []) {
        if (!d?.fichero || !d?.slot) throw new Error('Cada documento necesita «fichero» y «slot».');
        const slot = String(d.slot).toUpperCase();
        const def = porKey.get(slot);
        if (!def) throw new Error(`«${slot}» no es un apartado de ${o.opp.id_oportunidad}. Lánzalo con «obra» para ver los que tiene.`);
        const ruta = path.resolve(base, d.fichero);
        if (!fs.existsSync(ruta)) throw new Error(`No existe ${ruta}`);
        let ventana = null;
        if (d.ventana && vo.esPorVentana(slot)) {
            const id = String(d.ventana).toLowerCase() === 'nueva' ? `V${++ultima}` : d.ventana;
            ventana = vo.sanearVentana(id, d.ventana_nombre || null);
            if (!ventana) throw new Error(`Ventana «${d.ventana}» no válida (V1…V99 o «nueva»).`);
        }
        docs.push({ ruta, slot, def, ventana, wa_msg_id: d.wa_msg_id || null, t: d.t || null });
    }
    if (!docs.length) throw new Error('El plan no trae documentos.');

    console.log(`\n${o.opp.id_oportunidad}${o.expediente ? ` (expediente ${o.expediente.numero_expediente})` : ''} — ${docs.length} ficheros a «12. DOCUMENTOS PARA CEE»:`);
    for (const d of docs) {
        const mb = (fs.statSync(d.ruta).size / 1048576).toFixed(1);
        console.log(`  ${path.basename(d.ruta).slice(0, 48).padEnd(48)} → ${d.slot}${d.ventana ? ` · ${vo.rotuloVentana(d.ventana.ventana, d.ventana.ventana_nombre)}` : ''}  (${mb} MB)`);
    }
    for (const x of plan.decisiones || []) console.log(`  · ${x}`);
    if (!ESCRIBIR) {
        console.log('\nEN SECO. Revisa lo de arriba y vuelve a lanzarlo con --escribir.');
        return;
    }

    // En SERIE, un grupo por apartado y ventana: un slot múltiple numera contando
    // lo que ya hay en Drive, y dos subidas a la vez calcularían el mismo índice.
    const grupos = new Map();
    for (const d of docs) {
        const k = `${d.slot}|${d.ventana?.ventana || ''}`;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(d);
    }
    const colocadas = [];
    const resumen = [];
    for (const lista of grupos.values()) {
        const { slot, def, ventana } = lista[0];
        // eslint-disable-next-line no-await-in-loop
        const { data: opp } = await supabase.from('oportunidades').select('id, datos_calculo').eq('id', o.opp.id).single();
        try {
            // eslint-disable-next-line no-await-in-loop
            const { subidas, fallidas } = await reformaUpload.subirFicherosASlot({
                oportunidadUuid: opp.id, datosCalculo: opp.datos_calculo || {}, slotDef: def,
                archivos: lista.map(d => ({ originalname: path.basename(d.ruta), mimetype: alta.mimeDeFichero(d.ruta), buffer: fs.readFileSync(d.ruta) })),
                subidoPor: 'admin',
                ventana: ventana ? { ventana: ventana.ventana, nombre: ventana.ventana_nombre } : null,
            });
            for (const s of subidas) console.log(`  ✓ ${slot}${ventana ? ` (${ventana.ventana})` : ''} → ${s.name}`);
            for (const f of fallidas) console.log(`  ✗ ${slot}: ${f.error}`);
            if (subidas.length) resumen.push(`${subidas.length} en «${def.label}»${ventana ? ` (${vo.rotuloVentana(ventana.ventana, ventana.ventana_nombre)})` : ''}`);
            lista.filter(d => d.wa_msg_id).slice(0, subidas.length)
                .forEach(d => colocadas.push({ waMsgId: d.wa_msg_id, slot, tipo: alta.tipoMedia(d.ruta), t: d.t || null }));
        } catch (e) {
            console.log(`  ✗ ${slot}: ${e.message}`);
        }
    }
    if (colocadas.length) {
        const whatsappMedia = require('../services/whatsappMedia');
        const r = await whatsappMedia.registrarColocadas({ id: o.opp.id }, colocadas, 'skill alta-oportunidad');
        console.log(`  (${r.registradas} adjuntos de WhatsApp apuntados como colocados)`);
    }
    if (resumen.length) {
        const chat = plan.chat?.nombre ? `chat «${plan.chat.nombre}»` : 'WhatsApp';
        await alta.anotarAlta(supabase, o.opp.id, {
            texto: [`📲 Documentación recibida por ${chat}${plan.chat?.cuando ? ` (${plan.chat.cuando})` : ''} colocada por la skill alta-oportunidad: ${resumen.join(' · ')}.`,
                ...(plan.decisiones?.length ? [`Notas: ${plan.decisiones.join(' · ')}`] : [])].join('\n'),
            meta: null,
        });
    }
    const { data: fin } = await supabase.from('oportunidades')
        .select('drive:datos_calculo->>drive_folder_link').eq('id', o.opp.id).single();
    console.log(`\nApp:    https://app.brokergy.es/?op=${o.opp.id_oportunidad}`);
    if (fin?.drive) console.log(`Drive:  ${fin.drive}`);
}

async function renombrar() {
    const tel = opt('tel');
    if (!tel || tel === true) throw new Error('Uso: renombrar --op <nº> --tel <teléfono del chat> [--anteponer] [--escribir]');
    const o = await resolverObra(opt('op'));
    const r = await api('/api/whatsapp/contactos/renombrar', {
        method: 'POST',
        body: { telefono: tel, codigo: o.codigo, dryRun: !ESCRIBIR, anteponer: RESTO.includes('--anteponer'),
            forzarFicha: RESTO.includes('--forzar-ficha'),
            nombre: (opt('nombre') && opt('nombre') !== true) ? opt('nombre') : null },
    });
    const nombre = r.despues || r.propuesto || r.antes;
    const linea = {
        seco: `«${r.antes}» → «${r.despues}» (en seco: repítelo con --escribir)`,
        renombrado: `✓ «${r.antes}» → «${r.despues}»`,
        ya_al_dia: `Ya se llama «${r.antes}».`,
        revisar: `NO se toca: ${r.motivo} (propuesto «${r.propuesto}»; con --forzar-ficha si es correcto)`,
        sin_prefijo: `NO se toca: ${r.motivo} (propuesto «${r.propuesto}»)`,
        seco_nuevo: `no está en la agenda: se guardaría como «${r.despues}» (en seco: repítelo con --escribir)`,
        guardado: `✓ guardado en la agenda como «${r.despues}»`,
        sin_agenda: `NO se toca: ${r.motivo}${r.pushname ? ` (en su WhatsApp se llama «${r.pushname}»)` : ''} — para guardarlo: --nombre "Nombre Apellido (Partner)"`,
    }[r.accion] || JSON.stringify(r);
    console.log(`\nWhatsApp ${r.telefono}: ${linea}`);
    if (nombre && ['seco', 'renombrado', 'ya_al_dia', 'seco_nuevo', 'guardado'].includes(r.accion)) {
        console.log(`\nTÍTULO DE LA SESIÓN DE CLAUDE: ${nombre}`);
    }
}

// ─── main ───────────────────────────────────────────────────────────────────

const ORDENES = { chats, chat, escuchar, catastro, leer, aerotermia, crear, obra, documentar, renombrar };

// Se sale DEJANDO que el proceso acabe solo: en Windows (Node 25) un
// `process.exit` con conexiones de fetch todavía abiertas aborta con «Assertion
// failed … async.c» y código 127, aunque todo haya ido bien. Si algún servicio
// deja un temporizador vivo, el respaldo corta a los 4 s.
function salir(codigo) {
    process.exitCode = codigo;
    setTimeout(() => process.exit(codigo), 4000).unref();
}

(async () => {
    const f = ORDENES[ORDEN];
    if (!f) {
        console.log(`Órdenes: ${Object.keys(ORDENES).join(' · ')}
Ver la cabecera de este fichero y skills/alta-oportunidad/SKILL.md`);
        return salir(1);
    }
    await f();
    return salir(0);
})().catch((e) => {
    console.error(`
✗ ${e.message}`);
    salir(1);
});
