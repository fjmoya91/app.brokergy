#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKFILL de timestamps de subestado CEE para expedientes ANTIGUOS.
 *
 * A partir de 2026-06-09 el backend siembra, en cada transición de subestado,
 * los campos paralelos en `expedientes.seguimiento`:
 *   <fase>_ts{ESTADO:iso}, <fase>_desde, <fase>_last_contacto_at
 * (ver services/seguimientoTracking.js).
 *
 * Los expedientes anteriores no los tienen. Este script los RECONSTRUYE leyendo
 * la trazabilidad ya existente en `documentacion.historial`:
 *
 *   - notificacion_certificador (con "(ENCARGO)")  → ts.ASIGNADO   + last_contacto
 *   - notificacion_certificador (cualquiera)        → last_contacto (recordatorios incl.)
 *   - confirmacion_certificador                     → ts.EN_TRABAJO
 *   - notificacion_tecnica                          → ts.PTE_REVISION
 *   - aprobacion_tecnica                            → ts.REVISADO
 *   - documentacion.fecha_registro_cee_<fase>       → ts.REGISTRADO
 *   - <fase>_desde = ts[estado_actual]  (si se pudo derivar)
 *
 * La fase de cada entrada se detecta por el texto ("CEE FINAL" / "CEE INICIAL").
 * El `tipo` y el `texto` pueden venir en MAYÚSCULAS (normalizeData) → todo se
 * compara en minúsculas.
 *
 * SEGURIDAD:
 *   - NO sobrescribe campos *_ts/_desde/_last_contacto_at que ya existan (los del
 *     código nuevo ganan). Solo RELLENA huecos.
 *   - NO toca el string de subestado (cee_inicial/cee_final) ni nada más.
 *   - Dry-run por defecto. Escribe solo con --execute.
 *
 * USO:
 *   node scripts/backfill_seguimiento_timestamps.js                 # dry-run
 *   node scripts/backfill_seguimiento_timestamps.js --execute       # aplica
 *   node scripts/backfill_seguimiento_timestamps.js --filter 123    # subset por nº exp
 *   node scripts/backfill_seguimiento_timestamps.js --verbose       # detalle por exp
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, def) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const OPTS = {
    execute: has('--execute'),
    verbose: has('--verbose'),
    filter: val('--filter', null),
};

const norm = (s) => (typeof s === 'string' ? s.toLowerCase() : '');
const maxIso = (a, b) => (!a ? b : !b ? a : (new Date(a) >= new Date(b) ? a : b));

// 'YYYY-MM-DD' (u otra fecha) → ISO. Devuelve null si no parsea.
function toIso(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Detecta la fase de una entrada de historial por su texto.
function phaseOf(entry) {
    const t = norm(entry.texto);
    if (t.includes('cee final')) return 'final';
    if (t.includes('cee inicial')) return 'inicial';
    return null;
}

/**
 * Reconstruye los campos de tracking para un expediente.
 * Devuelve un objeto `patch` con SOLO los campos a añadir (huecos), o null si nada.
 */
function computeBackfill(exp) {
    const seg = exp.seguimiento || {};
    const hist = (exp.documentacion?.historial) || [];
    const doc = exp.documentacion || {};

    // Acumuladores por fase
    const acc = {
        inicial: { ts: {}, lastContacto: null },
        final:   { ts: {}, lastContacto: null },
    };

    for (const h of hist) {
        const tipo = norm(h.tipo);
        const fecha = h.fecha;
        if (!fecha) continue;
        const ph = phaseOf(h);

        if (tipo === 'notificacion_certificador') {
            if (ph) {
                acc[ph].lastContacto = maxIso(acc[ph].lastContacto, fecha);
                if (norm(h.texto).includes('(encargo)')) {
                    acc[ph].ts.ASIGNADO = maxIso(acc[ph].ts.ASIGNADO, fecha);
                }
            }
        } else if (tipo === 'confirmacion_certificador') {
            if (ph) acc[ph].ts.EN_TRABAJO = maxIso(acc[ph].ts.EN_TRABAJO, fecha);
        } else if (tipo === 'notificacion_tecnica') {
            if (ph) acc[ph].ts.PTE_REVISION = maxIso(acc[ph].ts.PTE_REVISION, fecha);
        } else if (tipo === 'aprobacion_tecnica') {
            if (ph) acc[ph].ts.REVISADO = maxIso(acc[ph].ts.REVISADO, fecha);
        }
    }

    // REGISTRADO desde la fecha de registro guardada en documentacion
    const regIni = toIso(doc.fecha_registro_cee_inicial);
    const regFin = toIso(doc.fecha_registro_cee_final);
    if (regIni) acc.inicial.ts.REGISTRADO = maxIso(acc.inicial.ts.REGISTRADO, regIni);
    if (regFin) acc.final.ts.REGISTRADO = maxIso(acc.final.ts.REGISTRADO, regFin);

    const patch = {};
    let changed = false;

    for (const ph of ['inicial', 'final']) {
        const key = `cee_${ph}`;
        const tsKey = `${key}_ts`;
        const desdeKey = `${key}_desde`;
        const lastKey = `${key}_last_contacto_at`;
        const a = acc[ph];

        // ── ts: fusionar SOLO claves que no existan ya ──
        const existingTs = seg[tsKey] || {};
        const mergedTs = { ...existingTs };
        let tsChanged = false;
        for (const [estado, iso] of Object.entries(a.ts)) {
            if (iso && mergedTs[estado] === undefined) { mergedTs[estado] = iso; tsChanged = true; }
        }
        if (tsChanged) { patch[tsKey] = mergedTs; changed = true; }

        // ── _desde: solo si falta y podemos derivarlo del estado actual ──
        if (seg[desdeKey] === undefined) {
            const current = seg[key];
            const derived = current ? (mergedTs[current] || a.ts[current]) : null;
            if (derived) { patch[desdeKey] = derived; changed = true; }
        }

        // ── _last_contacto_at: solo si falta ──
        if (seg[lastKey] === undefined && a.lastContacto) {
            patch[lastKey] = a.lastContacto;
            changed = true;
        }
    }

    return changed ? patch : null;
}

(async () => {
    console.log(`\n🔧 Backfill timestamps de seguimiento — modo ${OPTS.execute ? 'EJECUCIÓN (escribe)' : 'DRY-RUN (no escribe)'}\n`);

    let query = supabase
        .from('expedientes')
        .select('id, numero_expediente, seguimiento, documentacion');
    const { data: expedientes, error } = await query;
    if (error) { console.error('Error leyendo expedientes:', error.message); process.exitCode = 1; return; }

    let candidatos = expedientes || [];
    if (OPTS.filter) candidatos = candidatos.filter(e => (e.numero_expediente || '').includes(OPTS.filter));

    let conCambios = 0, escritos = 0, errores = 0;

    for (const exp of candidatos) {
        const patch = computeBackfill(exp);
        if (!patch) continue;
        conCambios++;

        const resumen = Object.entries(patch).map(([k, v]) => {
            if (k.endsWith('_ts')) return `${k}={${Object.keys(v).join(',')}}`;
            return `${k}=${typeof v === 'string' ? v.slice(0, 10) : v}`;
        }).join('  ');
        console.log(`• ${exp.numero_expediente || exp.id}`);
        console.log(`    ${resumen}`);
        if (OPTS.verbose) console.log(`    (seguimiento previo: cee_inicial=${exp.seguimiento?.cee_inicial} cee_final=${exp.seguimiento?.cee_final})`);

        if (OPTS.execute) {
            const nuevoSeguimiento = { ...(exp.seguimiento || {}), ...patch };
            const { error: upErr } = await supabase
                .from('expedientes')
                .update({ seguimiento: nuevoSeguimiento })
                .eq('id', exp.id);
            if (upErr) { console.error(`    ❌ Error escribiendo: ${upErr.message}`); errores++; }
            else escritos++;
        }
    }

    console.log(`\n──────────────────────────────────────────────`);
    console.log(`Expedientes evaluados : ${candidatos.length}`);
    console.log(`Con cambios propuestos: ${conCambios}`);
    if (OPTS.execute) console.log(`Escritos OK           : ${escritos}   Errores: ${errores}`);
    else console.log(`(dry-run — vuelve a ejecutar con --execute para aplicar)`);
    console.log(`──────────────────────────────────────────────\n`);
})();
