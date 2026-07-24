#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * RECOLOCACIÓN de las carpetas de Drive según el estado (expedientes y lotes).
 *
 * Hasta ahora la carpeta de un expediente se quedaba en "03. ACEPTADO" para
 * siempre: nadie la movía al avanzar el estado. Desde 2026-07-24 manda el estado
 * (ver services/driveFolders.js). Este script recoloca lo que ya existe.
 *
 * ORDEN Y REGLAS:
 *   1. LOTES: la carpeta del lote va a la carpeta de su estado (BORRADOR → "06.
 *      REVISADO LISTO PARA VERIFICAR", enviado → "07", requerimiento → "10",
 *      CAE → "08"/"09", finalizado → "11") y ABSORBE las carpetas de sus
 *      expedientes. Un expediente loteado NO se mueve por su cuenta nunca más.
 *   2. EXPEDIENTES SIN LOTE: a la carpeta de su estado
 *      (PTE. CEE INICIAL sin certificador → "03. ACEPTADO"; resto de la zona en
 *      curso → "04. EN CURSO"; DOC. COMPLETA → "05"; DOC. COMPLETA APPSHEET → "13").
 *   3. OPORTUNIDADES SIN EXPEDIENTE: no enviada → "01", enviada → "02",
 *      aceptada → "03".
 *
 * SEGURO E IDEMPOTENTE: mover una carpeta en Drive no cambia su id ni su enlace,
 * así que NO se toca la BD. driveService.moveFolder no escribe si ya está en el
 * destino → volver a lanzarlo debe dar 0 movimientos.
 *
 * USO:
 *   node scripts/recolocar_carpetas_drive.js                # dry-run (no toca Drive)
 *   node scripts/recolocar_carpetas_drive.js --execute      # mueve de verdad
 *   node scripts/recolocar_carpetas_drive.js --solo-expedientes
 *   node scripts/recolocar_carpetas_drive.js --solo-lotes
 *   node scripts/recolocar_carpetas_drive.js --solo-oportunidades
 *   node scripts/recolocar_carpetas_drive.js --limit 10     # primeros N de cada bloque
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const {
    carpetaObjetivoExpediente, carpetaObjetivoLote, carpetaObjetivoOportunidad, nombreCarpeta,
} = require('../services/driveFolders');

const argv = process.argv.slice(2);
const EXECUTE = argv.includes('--execute') || argv.includes('--apply');
const LIMIT = (() => {
    const i = argv.indexOf('--limit');
    return i >= 0 ? parseInt(argv[i + 1], 10) || null : null;
})();
const SOLO = {
    lotes: argv.includes('--solo-lotes'),
    expedientes: argv.includes('--solo-expedientes'),
    oportunidades: argv.includes('--solo-oportunidades'),
};
const HAY_FILTRO = SOLO.lotes || SOLO.expedientes || SOLO.oportunidades;
const hacer = (bloque) => !HAY_FILTRO || SOLO[bloque];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const filas = [];   // para el CSV
let movidos = 0, yaOk = 0, sinCarpeta = 0, fallos = 0;

// Padre actual de una carpeta (para saber de dónde sale y no mover lo que ya está).
async function padreActual(folderId) {
    try {
        const meta = await driveService.getFileMetadata(folderId, 'id, name, parents, trashed');
        if (!meta) return null;
        if (meta.trashed) return 'PAPELERA';
        return (meta.parents && meta.parents[0]) || null;
    } catch (err) {
        return null;
    }
}

async function recolocar({ tipo, ref, estado, folderId, destino, destinoLabel }) {
    const etiqueta = (id) => (id === destino && destinoLabel ? destinoLabel : nombreCarpeta(id));
    if (!folderId) {
        sinCarpeta++;
        filas.push([tipo, ref, estado, '', '', 'SIN CARPETA']);
        return;
    }
    if (!destino) {
        filas.push([tipo, ref, estado, '', '', 'SIN DESTINO (estado desconocido)']);
        return;
    }
    const actual = await padreActual(folderId);
    if (actual === destino) {
        yaOk++;
        filas.push([tipo, ref, estado, etiqueta(actual), etiqueta(destino), 'YA OK']);
        return;
    }
    const origen = actual === 'PAPELERA' ? 'PAPELERA' : etiqueta(actual);
    if (!EXECUTE) {
        movidos++;
        filas.push([tipo, ref, estado, origen, etiqueta(destino), 'MOVERÍA']);
        console.log(`  ${ref.padEnd(26)} ${String(estado).padEnd(32)} ${origen} → ${etiqueta(destino)}`);
        return;
    }
    const ok = await driveService.moveFolder(folderId, destino);
    if (ok) movidos++; else fallos++;
    filas.push([tipo, ref, estado, origen, etiqueta(destino), ok ? 'MOVIDO' : 'FALLO']);
    await sleep(150); // no castigar la cuota de Drive
}

async function carpetasDeOportunidades(ids) {
    // Proyección JSONB: pedir `datos_calculo` entero de muchas filas descomprime
    // megas por fila (ver regla 22 de CLAUDE.md).
    const mapa = {};
    for (let i = 0; i < ids.length; i += 200) {
        const trozo = ids.slice(i, i + 200);
        const { data, error } = await supabase
            .from('oportunidades')
            .select('id, folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id, link:datos_calculo->>drive_folder_link')
            .in('id', trozo);
        if (error) throw error;
        for (const o of (data || [])) {
            let f = o.folder || o.folder_inputs || null;
            if (!f && o.link) {
                const m = String(o.link).match(/folders\/([A-Za-z0-9_-]+)/);
                if (m) f = m[1];
            }
            mapa[o.id] = f;
        }
    }
    return mapa;
}

// ─── 1. Lotes ─────────────────────────────────────────────────────────────────
async function procesarLotes() {
    console.log('\n═══ LOTES ═══');
    const { data: lotes, error } = await supabase
        .from('lotes').select('id, codigo, estado, drive_folder_id').order('created_at', { ascending: true });
    if (error) throw error;
    const lista = LIMIT ? (lotes || []).slice(0, LIMIT) : (lotes || []);
    console.log(`${lista.length} lote(s)`);

    for (const lote of lista) {
        const ref = lote.codigo || `LOTE-${String(lote.id).slice(0, 8)}`;
        // 1.a La carpeta del lote a la carpeta de su estado.
        await recolocar({
            tipo: 'LOTE', ref, estado: lote.estado,
            folderId: lote.drive_folder_id,
            destino: carpetaObjetivoLote(lote.estado),
        });
        if (!lote.drive_folder_id) continue;

        // 1.b Las carpetas de sus expedientes, dentro de la del lote.
        const { data: miembros } = await supabase
            .from('expedientes').select('id, numero_expediente, estado, oportunidad_id').eq('lote_id', lote.id);
        if (!(miembros || []).length) continue;
        const carpetas = await carpetasDeOportunidades(miembros.map(m => m.oportunidad_id).filter(Boolean));
        for (const m of miembros) {
            await recolocar({
                tipo: 'EXP-LOTE', ref: m.numero_expediente || m.id, estado: m.estado,
                folderId: carpetas[m.oportunidad_id],
                destino: lote.drive_folder_id,
                destinoLabel: `carpeta del lote ${ref}`,
            });
        }
    }
}

// ─── 2. Expedientes sin lote ──────────────────────────────────────────────────
async function procesarExpedientes() {
    console.log('\n═══ EXPEDIENTES SIN LOTE ═══');
    const { data: exps, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, estado, lote_id, oportunidad_id, certificador_id:cee->>certificador_id')
        .is('lote_id', null)
        .order('numero_expediente', { ascending: true });
    if (error) throw error;
    const lista = LIMIT ? (exps || []).slice(0, LIMIT) : (exps || []);
    console.log(`${lista.length} expediente(s)`);

    const carpetas = await carpetasDeOportunidades(lista.map(e => e.oportunidad_id).filter(Boolean));
    for (const e of lista) {
        const destino = carpetaObjetivoExpediente({
            estado: e.estado, lote_id: null, cee: { certificador_id: e.certificador_id },
        });
        await recolocar({
            tipo: 'EXPEDIENTE', ref: e.numero_expediente || e.id, estado: e.estado,
            folderId: carpetas[e.oportunidad_id], destino,
        });
    }
}

// ─── 3. Oportunidades sin expediente ──────────────────────────────────────────
async function procesarOportunidades() {
    console.log('\n═══ OPORTUNIDADES SIN EXPEDIENTE ═══');
    const { data: conExp } = await supabase.from('expedientes').select('oportunidad_id');
    const yaExpediente = new Set((conExp || []).map(r => r.oportunidad_id));

    const { data: ops, error } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, estado:datos_calculo->>estado, folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id')
        .order('created_at', { ascending: true });
    if (error) throw error;

    const pendientes = (ops || []).filter(o => !yaExpediente.has(o.id));
    const lista = LIMIT ? pendientes.slice(0, LIMIT) : pendientes;
    console.log(`${lista.length} oportunidad(es)`);

    for (const o of lista) {
        const estado = o.estado || 'PTE ENVIAR';
        await recolocar({
            tipo: 'OPORTUNIDAD', ref: o.id_oportunidad || o.id, estado,
            folderId: o.folder || o.folder_inputs || null,
            destino: carpetaObjetivoOportunidad(estado),
        });
    }
}

(async () => {
    console.log(EXECUTE
        ? '⚠️  MODO REAL: se van a mover carpetas en Drive.'
        : '🔍 DRY-RUN: no se toca Drive. Añade --execute para aplicar.');

    try {
        if (hacer('lotes'))         await procesarLotes();
        if (hacer('expedientes'))   await procesarExpedientes();
        if (hacer('oportunidades')) await procesarOportunidades();
    } catch (err) {
        console.error('\n❌ Error:', err.message);
        process.exitCode = 1;
    }

    const csv = ['tipo;referencia;estado;carpeta_actual;carpeta_destino;accion']
        .concat(filas.map(f => f.map(c => String(c ?? '').replace(/;/g, ',')).join(';')))
        .join('\n');
    const salida = path.join(__dirname, `recolocacion_carpetas${EXECUTE ? '' : '_dryrun'}.csv`);
    fs.writeFileSync(salida, csv, 'utf8');

    console.log('\n─── RESUMEN ───');
    console.log(`${EXECUTE ? 'Movidas' : 'Se moverían'}: ${movidos}`);
    console.log(`Ya estaban bien:  ${yaOk}`);
    console.log(`Sin carpeta:      ${sinCarpeta}`);
    if (fallos) console.log(`Fallos:           ${fallos}`);
    console.log(`Detalle: ${salida}`);
    process.exit(process.exitCode || 0);
})();
