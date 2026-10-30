// App de certificadores — el VISTO BUENO de BROKERGY dado en la envolvente
// (services/certapp/vistoBueno.js). Sin BD ni red: Supabase, el PC, la entrega
// y el CRM son dobles que apuntan lo que se pide. No sale nada.
//   node scripts/test_certapp_visto_bueno.js   (desde implementation/backend)
//
// Lo que vigila:
//   1. Cuándo vale (`vigente`, `listoParaFirmar`): la MISMA receta; la del PC
//      solo si el visto bueno la esperaba; anulado, nunca.
//   2. `dar`: calificado → entrega «listo para firmar» (reabre una VALIDADO); por
//      calificar → al PC; ya firmada esa versión → al CRM; lo desfasado, sin
//      .cex o en BORRADOR → 409.
//   3. Al calificar el PC: con el visto bueno vigente se entrega solo
//      (`alCalificar`, `entrega.alTerminarIa`); sin él, el camino de siempre.
//   4. Otra receta (ventana o skill) lo anula al sellar; la del PC no.
//   5. La ruta: solo el equipo y solo `ext`.
//   6. Al firmar un encargo del CRM con visto bueno: approve-cee SIN aviso, con
//      la clave interna, y las dos rutas lo admiten.
// docs/conocimiento/certificadores-app/visto-bueno-desde-la-envolvente.md
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { EventEmitter } = require('events');
const B = path.join(__dirname, '..');
Object.assign(process.env, {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba',
    WHATSAPP_ENABLED: 'false', CERTAPP_AVISOS_ENABLED: 'false', CERTAPP_ENTREGA_AUTO: 'false',
    INTERNAL_API_KEY: 'clave-interna-de-prueba',
});

let fallos = 0;
let total = 0;
function ok(cond, texto) {
    total++;
    if (!cond) fallos++;
    console.log(`${cond ? '✓' : '✗'} ${texto}`);
}

// El PC: nada sale, se apunta.
const PC = [];
function moduloFalso(rel, propios) {
    const p = require.resolve(path.join(B, rel));
    const m = new Module(p);
    m.filename = p;
    m.loaded = true;
    m.exports = propios;
    require.cache[p] = m;
}
moduloFalso('services/asistenteCanal', {
    encargarCalificarExt: async (o) => { PC.push(o); return { ok: true }; },
});

// ── Supabase en memoria: UNA obra ───────────────────────────────────────────
const OBRA = 'b0000000-0000-4000-8000-0000000000vb';
let obra;
let eventos;
const supabase = require(path.join(B, 'services/supabaseClient'));
supabase.rpc = async (nombre, args) => {
    if (nombre !== 'set_certapp_obra_cee_field') return { data: null, error: { message: `rpc inesperada ${nombre}` } };
    obra.cee = { ...(obra.cee || {}), [args.p_field]: args.p_value };
    return { data: null, error: null };
};
supabase.from = (tabla) => {
    let sel = '*';
    const q = {
        select: (s) => { sel = s || '*'; return q; },
        eq: () => q, or: () => q,
        insert: async (fila) => { if (tabla === 'certapp_eventos') eventos.push(fila); return { data: null, error: null }; },
        update: (cambios) => ({ eq: () => ({ eq: () => ({ select: async () => { Object.assign(obra, cambios); return { data: [obra], error: null }; } }),
                                             select: () => ({ single: async () => { Object.assign(obra, cambios); return { data: obra, error: null }; } }) }) }),
        maybeSingle: async () => {
            if (tabla !== 'certapp_obras') return { data: null, error: null };
            if (sel.includes('vb:')) {
                return { data: { id: obra.id, estado: obra.estado, cuenta_id: obra.cuenta_id, numero_expediente: obra.numero_expediente,
                                 vb: obra.cee?.visto_bueno ?? null, sello: obra.cee?.cex_sello?.inicial ?? null, firma: obra.cee?.firma ?? null },
                         error: null };
            }
            if (sel.startsWith('s:')) return { data: { s: obra.cee?.cex_sello ?? null }, error: null };
            return { data: obra, error: null };
        },
    };
    return q;
};

const vb = require(path.join(B, 'services/certapp/vistoBueno'));
const entrega = require(path.join(B, 'services/certapp/entrega'));
const crm = require(path.join(B, 'services/certapp/crm'));
const cex = require(path.join(B, 'services/ceeEnvolventeCex'));

// La entrega de verdad toca Drive y avisa: aquí se apunta (vistoBueno la llama por el módulo).
const ENTREGAS = [];
const entregarDeVerdad = entrega.entregar;
entrega.entregar = async (id, o) => { ENTREGAS.push({ id, ...o }); obra.estado = 'LISTO'; return { obra, aviso: { seco: true }, compartida: { ok: true } }; };
const AL_CRM = [];
crm.vistoBuenoAlCrmAsync = (id) => { AL_CRM.push(id); };

const hace = (min) => new Date(Date.now() - min * 60_000).toISOString();
const sello = (o = {}) => ({ huella: 'H1', at: hace(30), por: 'pc', por_calificar: false, calificacion: { epnr: 100 }, ...o });
function reiniciar(o = {}) {
    obra = { id: OBRA, cuenta_id: 'c-1', numero_expediente: '2026EXT_9', estado: 'EN_PREPARACION', cee: {}, ...o };
    eventos = []; ENTREGAS.length = 0; PC.length = 0; AL_CRM.length = 0;
}
async function codigo(p) { try { await p; return null; } catch (e) { return `${e.status} ${e.code}`; } }

(async () => {
    // ── 1. Cuándo vale ─────────────────────────────────────────────────────
    const dado = { at: hace(10), huella: 'H1' };
    ok(!vb.vigente({}) && !vb.vigente({ visto_bueno: dado }), 'sin visto bueno, o sin .cex sellado, no vale');
    ok(vb.vigente({ visto_bueno: dado, cex_sello: { inicial: sello() } }), 'misma receta (huella) → vale');
    ok(!vb.vigente({ visto_bueno: { ...dado, anulado_at: hace(1) }, cex_sello: { inicial: sello() } }), 'anulado → no vale');
    ok(!vb.vigente({ visto_bueno: dado, cex_sello: { inicial: sello({ huella: 'H2', por: 'ventana', at: hace(1) }) } }),
        'otra receta generada después → no vale');
    ok(vb.vigente({ visto_bueno: { ...dado, esperando_pc: true }, cex_sello: { inicial: sello({ huella: 'H1b', at: hace(1) }) } }),
        'lo esperaba el PC y el PC lo ha calificado después (otra huella: placas de la 2.ª medida) → vale');
    ok(!vb.vigente({ visto_bueno: dado, cex_sello: { inicial: sello({ huella: 'H1b', at: hace(1) }) } }),
        'una calificación del PC con otra huella que NO esperaba → no vale');
    ok(!vb.vigente({ visto_bueno: { ...dado, esperando_pc: true }, cex_sello: { inicial: sello({ huella: 'H1b', at: hace(20) }) } }),
        'una calificación del PC ANTERIOR al visto bueno no cuenta');
    ok(vb.vigente({ visto_bueno: dado, cex_sello: { inicial: sello({ por_calificar: true, por: 'ventana' }) } })
        && !vb.listoParaFirmar({ visto_bueno: dado, cex_sello: { inicial: sello({ por_calificar: true, por: 'ventana' }) } }),
        'por calificar: vale, pero aún no está listo para firmar');
    const r = vb.resumen({ visto_bueno: { ...dado, por: 'Fran', esperando_pc: true }, cex_sello: { inicial: sello({ por_calificar: true }) } });
    ok(r.vigente && !r.listo && r.esperando_pc && r.por === 'Fran', 'el resumen de la ventana: vigente, esperando al PC, quién');

    // ── 2. dar ─────────────────────────────────────────────────────────────
    reiniciar({ estado: 'BORRADOR', cee: { cex_sello: { inicial: sello() } } });
    ok(await codigo(vb.dar(OBRA, { quien: 'Fran' })) === '409 ESTADO_SIN_VISTO_BUENO', 'una obra en BORRADOR → 409 (no está pedida)');
    reiniciar();
    ok(await codigo(vb.dar(OBRA, { quien: 'Fran' })) === '409 SIN_CEX', 'sin .cex generado → 409 SIN_CEX');
    reiniciar({ cee: { cex_sello: { inicial: sello() } } });
    ok(await codigo(vb.dar(OBRA, { quien: 'Fran', huella: 'OTRA' })) === '409 DESFASADO' && !obra.cee.visto_bueno,
        'lo que se ve no es lo generado → 409 DESFASADO y no se apunta nada');

    reiniciar({ cee: { cex_sello: { inicial: sello() } } });
    let d = await vb.dar(OBRA, { quien: 'Fran', huella: 'H1' });
    ok(d.que === 'ENTREGADO' && ENTREGAS.length === 1 && ENTREGAS[0].vistoBueno === true && ENTREGAS[0].reabrir === true
        && ENTREGAS[0].por === 'BROKERGY' && ENTREGAS[0].porDetalle === 'Fran',
        'calificado → se entrega ya, «listo para firmar», por BROKERGY');
    ok(obra.cee.visto_bueno?.huella === 'H1' && obra.cee.visto_bueno.entregado_at && obra.cee.visto_bueno.por === 'Fran'
        && !obra.cee.visto_bueno.esperando_pc, 'queda apuntado: quién, la receta y cuándo se entregó');
    ok(eventos.some(e => e.tipo === 'VISTO_BUENO' && e.por_detalle === 'Fran'), 'evento VISTO_BUENO (quién, solo en el detalle del equipo)');
    ok(PC.length === 0, 'calificado: no se encarga nada al PC');

    reiniciar({ cee: { cex_sello: { inicial: sello({ por: 'ventana', por_calificar: true, at: hace(1) }) } } });
    d = await vb.dar(OBRA, { quien: 'Fran', huella: 'H1' });
    ok(d.que === 'CALCULANDO' && ENTREGAS.length === 0 && PC.length === 1 && PC[0].numero === '2026EXT_9',
        'por calificar → al PC (idempotente), sin entregar todavía');
    ok(obra.cee.visto_bueno?.esperando_pc === true && obra.estado === 'EN_PREPARACION', 'apunta que espera al PC; la obra sigue en preparación');

    // ── 3. Al calificar el PC ──────────────────────────────────────────────
    obra.cee.cex_sello = { inicial: sello({ huella: 'H1pc', at: new Date(Date.now() + 60_000).toISOString() }) };
    const ent = await entrega.alTerminarIa(OBRA);
    ok(ent.auto === true && ent.porVistoBueno === true && ENTREGAS.length === 1 && ENTREGAS[0].vistoBueno === true,
        'el PC lo califica → alTerminarIa entrega SOLA con el visto bueno');
    ok(obra.cee.visto_bueno.huella === 'H1pc' && obra.cee.visto_bueno.esperando_pc === false && obra.cee.visto_bueno.entregado_at,
        'el visto bueno pasa a la receta calificada y deja de esperar');

    reiniciar({ cee: { cex_sello: { inicial: sello() } } });
    const sinVb = await entrega.alTerminarIa(OBRA);
    ok(sinVb.auto === false && ENTREGAS.length === 0, 'sin visto bueno: el camino de siempre (aviso al equipo, sin entregar)');

    // Una VALIDADO (firmada la versión ANTERIOR) con la versión nueva calificada → se reabre.
    reiniciar({ estado: 'VALIDADO', cee: { firma: { at: hace(60) }, cex_sello: { inicial: sello({ at: hace(5) }) } } });
    d = await vb.dar(OBRA, { quien: 'Fran', huella: 'H1' });
    ok(d.que === 'ENTREGADO' && ENTREGAS[0]?.reabrir === true, 'VALIDADO con una versión nueva → se entrega otra vez (firma nueva)');
    // Firmada ESTA versión → no se reabre: su visto bueno va al CRM.
    reiniciar({ estado: 'VALIDADO', cee: { firma: { at: hace(1) }, cex_sello: { inicial: sello({ at: hace(5) }) } } });
    d = await vb.dar(OBRA, { quien: 'Fran', huella: 'H1' });
    ok(d.que === 'FIRMADO' && ENTREGAS.length === 0 && AL_CRM[0] === OBRA && obra.cee.visto_bueno.firmado === true,
        'ya firmada esta versión → no se reabre; el visto bueno pasa al expediente del CRM');

    // ── 4. Otra receta lo anula ────────────────────────────────────────────
    const ctx = { expediente: cex.expedienteStub('ext', OBRA) };
    reiniciar({ cee: { cex_sello: { inicial: sello() }, visto_bueno: { at: hace(10), huella: 'H1' } } });
    let s = await cex.sellar(ctx, 'inicial', { huella: 'H1', por: 'ventana', por_calificar: true });
    ok(!s.visto_bueno_anulado && !obra.cee.visto_bueno.anulado_at, 'regenerar con la MISMA receta no lo anula');
    s = await cex.sellar(ctx, 'inicial', { huella: 'H9', por: 'pc', por_calificar: false });
    ok(!s.visto_bueno_anulado && !obra.cee.visto_bueno.anulado_at, 'lo que sella el PC no lo anula (califica la misma receta)');
    s = await cex.sellar(ctx, 'inicial', { huella: 'H2', por: 'ventana', por_calificar: true });
    ok(s.visto_bueno_anulado === true && obra.cee.visto_bueno.anulado_at && !vb.vigente(obra.cee)
        && eventos.some(e => e.tipo === 'VISTO_BUENO_ANULADO'), 'otra receta desde la ventana → anulado (y se dice)');
    reiniciar({ cee: { cex_sello: { inicial: sello() }, visto_bueno: { at: hace(10), huella: 'H1' } } });
    s = await cex.sellar(ctx, 'inicial', { huella: 'H3', por: 'skill', por_calificar: true });
    ok(s.visto_bueno_anulado === true, 'otra receta desde la skill → anulado también');
    ok(!Object.prototype.hasOwnProperty.call(obra.cee.cex_sello.inicial, 'visto_bueno_anulado'),
        'la marca de anulado no se guarda en el sello');

    // ── 5. La ruta ─────────────────────────────────────────────────────────
    const rutaEnv = require(path.join(B, 'routes/ceeEnvolvente'));
    const capa = rutaEnv.stack.find(l => l.route?.path === '/:expedienteId/visto-bueno' && l.route.methods.post);
    ok(!!capa && capa.route.stack.length >= 2 && capa.route.stack[0].name === 'internoOExtSuyo',
        'POST /:id/visto-bueno existe y pasa por el guardián internoOExtSuyo');
    const h = capa.route.stack[capa.route.stack.length - 1].handle;
    const resFalsa = () => {
        const x = new EventEmitter();
        return Object.assign(x, { statusCode: 200, body: undefined,
            status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });
    };
    reiniciar({ cee: { cex_sello: { inicial: sello() } } });
    let res = resFalsa();
    await h({ params: { expedienteId: OBRA }, query: { origen: 'ext' }, body: {}, _origenEnvolvente: 'ext',
              user: null, certapp: { cuenta: { id: 'c-1' } } }, res);
    ok(res.statusCode === 403 && res.body.code === 'SOLO_EQUIPO' && !obra.cee.visto_bueno, 'el certificador de la app no se lo da a sí mismo → 403');
    res = resFalsa();
    await h({ params: { expedienteId: OBRA }, query: {}, body: {}, _origenEnvolvente: 'cae', user: { rol_nombre: 'ADMIN' } }, res);
    ok(res.statusCode === 400 && res.body.code === 'SOLO_EXT', 'en un expediente del CRM no: allí es «Validar» → 400');
    res = resFalsa();
    await h({ params: { expedienteId: OBRA }, query: { origen: 'ext' }, body: { huella: 'H1' }, _origenEnvolvente: 'ext',
              user: { rol_nombre: 'TRABAJADOR', nombre: 'Equipo' } }, res);
    ok(res.statusCode === 200 && res.body.que === 'ENTREGADO', 'el equipo lo da → 200 y entregado');

    // ── 6. Al firmar en la app: el CRM, sin revisión ni aviso ──────────────
    const axios = require('axios');
    const llamadas = [];
    const postAntes = axios.post;
    axios.post = async (url, body, o) => { llamadas.push({ url, body, headers: o?.headers || {} }); return { data: { ok: true } }; };
    try {
        await crm.aprobarEnCrm({ negocio: 'cae', id: 'exp-1', fase: 'inicial' }, { numero_expediente: '2026EXT_9' });
        await crm.aprobarEnCrm({ negocio: 'cee', id: 'cee-1', fase: 'inicial' }, { numero_expediente: '2026EXT_9' });
    } finally { axios.post = postAntes; }
    ok(/\/expedientes\/exp-1\/approve-cee$/.test(llamadas[0]?.url) && /\/cee-directos\/cee-1\/approve-cee$/.test(llamadas[1]?.url),
        'approve-cee del CAE y del CEE directo');
    ok(llamadas.every(l => l.body.sendEmail === false && l.body.sendWhatsApp === false && l.body.adjuntarBorrador === false
        && l.body.phase === 'inicial' && l.headers['x-internal-key'] === process.env.INTERNAL_API_KEY),
        'sin email ni WhatsApp al técnico, con la clave interna');
    const leer = (rel) => fs.readFileSync(path.join(B, rel), 'utf8');
    const rExp = leer('routes/expedientes.js');
    ok(/router\.post\('\/:id\/approve-cee', staffOClaveInterna,/.test(rExp) && /re: \/\^\\\/\[\^\/\]\+\\\/approve-cee\\\/\?\$\//.test(rExp),
        'CAE: approve-cee admite la clave interna (y está en PUBLIC_EXPEDIENTE_ROUTES para su guardián propio)');
    ok(/router\.post\('\/:id\/approve-cee', staffOClaveInterna,/.test(leer('routes/ceeDirectos.js')), 'CEE directo: approve-cee admite la clave interna');
    const rCrm = leer('services/certapp/crm.js');
    ok(/if \(conVistoBueno\) \{\s*await aprobarEnCrm\(crm, obra\);/.test(rCrm) && /await pedirRevision\(crm, cuenta, obra\);/.test(rCrm),
        'firmar con visto bueno → approve-cee; sin él → la revisión de siempre');

    entrega.entregar = entregarDeVerdad;
    console.log(`\n${total - fallos}/${total} correctas`);
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
