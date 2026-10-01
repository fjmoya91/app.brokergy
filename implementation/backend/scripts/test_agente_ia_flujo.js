#!/usr/bin/env node
// test_agente_ia_flujo.js — empezar → terminar del AGENTE IA, de punta a punta,
// con Supabase, WhatsApp, email y Drive sustituidos por dobles: no toca
// producción ni manda un solo aviso de verdad.
//
//   node implementation/backend/scripts/test_agente_ia_flujo.js
//
// Comprueba lo que se ve en la app: quién queda en la barra de certificadores,
// en qué fase queda el CEE, qué dice el historial, qué sello queda en
// `cee.agente_ia` y que el aviso sale (o no) por los dos canales.
const path = require('path');

// ── Dobles ──────────────────────────────────────────────────────────────────
const AGENTE = { id_empresa: 'AG', razon_social: 'AGENTE IA', es_agente_ia: true };
const RAQUEL = { id_empresa: 'RAQ', razon_social: 'RAQUEL MONCAYO TERRIZA' };
let exp;                 // fila de expedientes (con `cee` y `documentacion` completos)
const rpcs = [];
const wa = [];
const mails = [];
const carpetas = [];

function nuevo(extra = {}) {
    return {
        id: 'EXP1', numero_expediente: '26RES060_999', estado: 'PTE. CEE INICIAL', oportunidad_id: 'OP1',
        seguimiento: { cee_inicial: 'PTE_ENVIO_CERT', cee_final: 'PTE_ENVIO_CERT' },
        cee: { cee_folder_link: 'https://drive/cee' }, documentacion: { historial: [] },
        clientes: { nombre_razon_social: 'CLIENTE', apellidos: 'PRUEBA' },
        ...extra,
    };
}

// Proyección mínima de lo que pide agenteIa.js con alias de JSONB.
function proyectar(fila) {
    return {
        ...fila,
        cert: fila.cee?.certificador_id || null,
        agente_ia: fila.cee?.agente_ia || null,
        cee_folder_link: fila.cee?.cee_folder_link || null,
        reg_ini: fila.documentacion?.fecha_registro_cee_inicial || null,
        reg_fin: fila.documentacion?.fecha_registro_cee_final || null,
    };
}

function builder(tabla) {
    const q = { filtros: {}, patch: null };
    const b = {
        select() { return b; }, not() { return b; }, neq() { return b; }, in() { return b; },
        eq(k, v) { q.filtros[k] = v; return b; },
        update(p) { q.patch = p; return b; },
        async maybeSingle() { return resolver(); },
        async single() { return resolver(); },
        then(ok, ko) { return Promise.resolve(resolver(true)).then(ok, ko); },
    };
    function resolver(lista = false) {
        if (q.patch) {
            if (tabla === 'expedientes') exp = { ...exp, ...q.patch };
            return { data: null, error: null };
        }
        if (tabla === 'prescriptores') {
            if (q.filtros.es_agente_ia) return { data: AGENTE, error: null };
            const p = [AGENTE, RAQUEL].find(x => x.id_empresa === q.filtros.id_empresa) || null;
            return { data: p, error: null };
        }
        if (tabla === 'expedientes') {
            if (lista) {
                const mio = String(exp.cee?.certificador_id || '') === String(q.filtros['cee->>certificador_id']);
                return { data: mio ? [proyectar(exp)] : [], error: null };
            }
            return { data: proyectar(exp), error: null };
        }
        if (tabla === 'cee_directos') return { data: lista ? [] : null, error: null };
        return { data: null, error: null };
    }
    return b;
}
const supabaseDoble = {
    from: (t) => builder(t),
    async rpc(nombre, args) {
        rpcs.push({ nombre, args });
        if (nombre === 'set_expediente_cee_field') {
            exp = { ...exp, cee: { ...(exp.cee || {}), [args.p_field]: args.p_value } };
        }
        return { error: null };
    },
};
const req = (rel) => require.resolve(path.join(__dirname, '..', rel));
const doble = (rel, exports) => { require.cache[req(rel)] = { id: rel, filename: rel, loaded: true, exports }; };
doble('services/supabaseClient.js', supabaseDoble);
doble('services/whatsappService.js', { async sendText(tel, msg) { wa.push({ tel, msg }); return { ok: true }; } });
doble('services/emailService.js', {
    async sendMail(m) { mails.push(m); return true; },
    getFallbackSender() { return null; },
});
doble('services/expedienteFolderSync.js', { async syncExpedienteFolder(id) { carpetas.push(id); return {}; } });

const agenteIa = require('../services/agenteIa');

let fallos = 0;
const ok = (c, txt, det) => { if (c) console.log(`  ✓ ${txt}`); else { fallos++; console.log(`  ✗ ${txt}${det !== undefined ? `\n      ${JSON.stringify(det)}` : ''}`); } };
const ultimo = () => (exp.documentacion.historial || []).filter(h => h.texto).slice(-1)[0] || {};
const reset = (extra) => { exp = nuevo(extra); rpcs.length = 0; wa.length = 0; mails.length = 0; carpetas.length = 0; };

(async () => {
    console.log('\n1. Sin técnico: EMPEZAR pone al agente en la barra y la fase «en trabajo»');
    reset();
    let r = await agenteIa.empezar({ negocio: 'cae', clave: '26RES060_999', fase: 'inicial' });
    ok(exp.cee.certificador_id === 'AG', 'el certificador pasa a ser el AGENTE IA', exp.cee.certificador_id);
    ok(exp.seguimiento.cee_inicial === 'EN_TRABAJO', 'la fase pasa a EN_TRABAJO', exp.seguimiento.cee_inicial);
    ok(!!exp.seguimiento.cee_inicial_ts?.EN_TRABAJO, 'se sella cuándo (para el parte)');
    ok(exp.estado === 'EN CERTIFICADOR CEE INICIAL', 'el estado avanza', exp.estado);
    ok(exp.cee.agente_ia?.inicial?.estado === 'trabajando', 'sello: trabajando', exp.cee.agente_ia);
    ok(/ha empezado el CEE INICIAL/.test(ultimo().texto || ''), 'queda en el historial', ultimo().texto);
    ok(carpetas.length === 1, 'la carpeta se recoloca (03 ACEPTADO → 04 EN CURSO)');
    ok(wa.length === 0 && mails.length === 0, 'empezar NO avisa a nadie');

    console.log('\n2. Relanzar EMPEZAR no cambia nada ni anota dos veces');
    const n = exp.documentacion.historial.length;
    r = await agenteIa.empezar({ negocio: 'cae', clave: '26RES060_999', fase: 'inicial' });
    ok(r.cambios.length === 0, 'sin cambios', r.cambios);
    ok(exp.documentacion.historial.length === n, 'el historial no crece');

    console.log('\n3. TERMINAR: «pendiente de revisión» y aviso por los dos canales');
    r = await agenteIa.terminar({ negocio: 'cae', clave: '26RES060_999', fase: 'inicial',
        fichero: { nombre: '26RES060_999 - CEE INICIAL_REVISAR.cex', link: 'https://drive/f', carpeta_link: 'https://drive/c' },
        avisos: ['un aviso'] });
    ok(exp.seguimiento.cee_inicial === 'PTE_REVISION', 'la fase pasa a PTE_REVISION', exp.seguimiento.cee_inicial);
    ok(exp.estado === 'PENDIENTE REVISIÓN (INICIAL)', 'el estado avanza a PENDIENTE REVISIÓN (INICIAL)', exp.estado);
    ok(exp.cee.estado === 'PENDIENTE REVISIÓN (INICIAL)', 'cee.estado lo escribe el servidor (como notify-review)', exp.cee.estado);
    const s = exp.cee.agente_ia?.inicial || {};
    ok(s.estado === 'terminado' && s.fichero_link === 'https://drive/f' && s.carpeta_link === 'https://drive/c',
       'sello: terminado, con el .cex y la carpeta', s);
    ok(!!s.empezado_at && !!s.terminado_at, 'conserva cuándo empezó y sella cuándo terminó');
    ok(wa.length === 1 && /CEE INICIAL LISTO · AGENTE IA/.test(wa[0].msg), 'sale el WhatsApp al equipo');
    ok(mails.length === 1 && /Agente IA/.test(mails[0].subject), 'sale el email al equipo', mails[0]?.subject);
    ok(r.canales.join('+') === 'WhatsApp+Email' && !r.fallos.length, 'la respuesta dice por dónde salió', r);
    ok(/PENDIENTE DE REVISIÓN/.test(ultimo().texto || ''), 'historial: pendiente de revisión', ultimo().texto);

    console.log('\n4. Relanzar TERMINAR con --sin-aviso: no avisa y se marca como versión nueva');
    wa.length = 0; mails.length = 0;
    r = await agenteIa.terminar({ negocio: 'cae', clave: '26RES060_999', fase: 'inicial', aviso: false });
    ok(wa.length === 0 && mails.length === 0, 'no sale nada');
    ok(r.reenvio === true, 'se reconoce como versión nueva');
    ok(exp.seguimiento.cee_inicial === 'PTE_REVISION', 'la fase no se mueve');

    console.log('\n5. Con un TÉCNICO asignado: el agente le prepara el borrador y no toca nada suyo');
    reset({ cee: { certificador_id: 'RAQ' }, seguimiento: { cee_inicial: 'REGISTRADO', cee_final: 'ASIGNADO' }, estado: 'PTE. CEE FINAL' });
    r = await agenteIa.empezar({ negocio: 'cae', clave: '26RES060_999', fase: 'final' });
    ok(exp.cee.certificador_id === 'RAQ', 'Raquel sigue en la barra', exp.cee.certificador_id);
    ok(exp.seguimiento.cee_final === 'ASIGNADO', 'la fase no cambia', exp.seguimiento.cee_final);
    ok(r.delAgente === false && r.humano === 'RAQUEL MONCAYO TERRIZA', 'lo dice', r);
    r = await agenteIa.terminar({ negocio: 'cae', clave: '26RES060_999', fase: 'final', fichero: { nombre: 'x.cex' } });
    ok(exp.seguimiento.cee_final === 'ASIGNADO' && exp.estado === 'PTE. CEE FINAL', 'al terminar tampoco cambia de fase',
       [exp.seguimiento.cee_final, exp.estado]);
    ok(wa.length === 1 && /sigue siendo \*RAQUEL/.test(wa[0].msg), 'el aviso sale y dice para quién es');
    ok(exp.cee.agente_ia?.final?.delAgente === false, 'sello: preparado para el técnico');

    console.log('\n6. …y con --reasignar pasa a ser del agente');
    reset({ cee: { certificador_id: 'RAQ' }, seguimiento: { cee_inicial: 'ASIGNADO' } });
    r = await agenteIa.empezar({ negocio: 'cae', clave: '26RES060_999', fase: 'inicial', reasignar: true });
    ok(exp.cee.certificador_id === 'AG' && exp.seguimiento.cee_inicial === 'EN_TRABAJO', 'agente + en trabajo',
       [exp.cee.certificador_id, exp.seguimiento.cee_inicial]);
    ok(r.cambios.some(c => /RAQUEL.*AGENTE IA/.test(c)), 'dice a quién se lo ha quitado', r.cambios);

    console.log('\n7. Nunca hacia atrás: un CEE ya REVISADO no vuelve a «pendiente de revisión»');
    reset({ cee: { certificador_id: 'AG' }, seguimiento: { cee_inicial: 'REVISADO' }, estado: 'REVISADO Y LISTO (INICIAL)' });
    await agenteIa.terminar({ negocio: 'cae', clave: '26RES060_999', fase: 'inicial', aviso: false });
    ok(exp.seguimiento.cee_inicial === 'REVISADO' && exp.estado === 'REVISADO Y LISTO (INICIAL)', 'se queda como estaba',
       [exp.seguimiento.cee_inicial, exp.estado]);

    console.log('\n8. La COLA: lo encargado al agente y sin terminar');
    reset({ cee: { certificador_id: 'AG' }, seguimiento: { cee_inicial: 'ASIGNADO' } });
    let c = await agenteIa.cola();
    ok(c.length === 1 && c[0].situacion === 'encargado, sin empezar' && c[0].fase === 'inicial', 'encargado, sin empezar', c);
    await agenteIa.empezar({ negocio: 'cae', clave: '26RES060_999' });
    c = await agenteIa.cola();
    ok(c[0]?.situacion === 'en trabajo', 'en trabajo', c);
    await agenteIa.terminar({ negocio: 'cae', clave: '26RES060_999', aviso: false });
    c = await agenteIa.cola();
    ok(c[0]?.situacion === 'terminado · pendiente de revisar', 'terminado · pendiente de revisar', c);
    ok(c.length === 1, 'la fase final no sale (el inicial aún no está registrado)', c.length);

    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallida(s)` : '\n✓ Todo en orden');
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
