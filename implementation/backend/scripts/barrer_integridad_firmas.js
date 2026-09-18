#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ¿Cuántos de los documentos firmados que hay en producción tienen la firma ROTA?
 *
 *   node scripts/barrer_integridad_firmas.js [--max=N] [--slot=cert_cifo_signed_link]
 *
 * SOLO LEE. Baja cada PDF firmado de Drive y le pasa la comprobación de
 * `leerFirmasPdf` — la MISMA que va a usar el botón de validar, así que lo que
 * imprime aquí es exactamente lo que se va a encontrar el usuario.
 *
 * Existe porque una comprobación nueva que marque como rotos documentos que están
 * bien es peor que no tenerla: el aviso que sale siempre es el que enseña a
 * ignorar los avisos. El listado de abajo es el que dice si se puede BLOQUEAR con
 * ella o solo avisar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { leerFirmasPdf } = require('../utils/firmasPdf');
const { DOCUMENTO_VALIDABLE_LABELS } = require('../utils/docValidacion');

const SLOTS = Object.keys(DOCUMENTO_VALIDABLE_LABELS);

const arg = (k, def) => {
    const m = process.argv.find(a => a.startsWith(`--${k}=`));
    return m ? m.split('=')[1] : def;
};
const driveIdDe = (link) => {
    const s = String(link || '');
    const m = s.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
};

(async () => {
    const soloSlot = arg('slot', null);
    const max = parseInt(arg('max', '0'), 10) || 0;
    const slots = soloSlot ? [soloSlot] : SLOTS;

    const { data: exps, error } = await supabase
        .from('expedientes')
        .select('numero_expediente, documentacion')
        .order('numero_expediente');
    if (error) throw error;

    const tareas = [];
    for (const e of exps || []) {
        const doc = e.documentacion || {};
        for (const slot of slots) {
            const id = driveIdDe(doc[slot]);
            if (id) tareas.push({ expte: e.numero_expediente, slot, id });
        }
    }
    const lista = max ? tareas.slice(0, max) : tareas;
    console.log(`Documentos firmados registrados: ${tareas.length}${max ? ` (se miran ${lista.length})` : ''}\n`);

    const cuenta = { ok: 0, rota: 0, sinComprobar: 0, sinFirma: 0, noBaja: 0, noPdf: 0 };
    const rotos = [];
    const dudosos = [];

    for (const [i, t] of lista.entries()) {
        let buf = null;
        try { buf = await driveService.getFileContent(t.id); }
        catch (err) { cuenta.noBaja++; continue; }

        const r = leerFirmasPdf(buf);
        const etiqueta = `${t.expte} · ${DOCUMENTO_VALIDABLE_LABELS[t.slot] || t.slot}`;
        if (!r.esPdf) { cuenta.noPdf++; continue; }
        if (!r.firmada) { cuenta.sinFirma++; continue; }

        if (r.integridad.rota) {
            cuenta.rota++;
            rotos.push({ etiqueta, kb: Math.round(buf.length / 1024), problemas: r.integridad.problemas });
            console.log(`⛔ ${etiqueta}\n   ${r.integridad.problemas.join('\n   ')}`);
        } else if (r.integridad.ok === true) {
            cuenta.ok++;
        } else {
            cuenta.sinComprobar++;
            dudosos.push({ etiqueta, problemas: r.integridad.problemas });
        }
        if ((i + 1) % 25 === 0) process.stdout.write(`   …${i + 1}/${lista.length}\n`);
    }

    console.log('\n─────────────── RESUMEN ───────────────');
    console.log(`  Firma comprobada y CORRECTA : ${cuenta.ok}`);
    console.log(`  Firma ROTA                  : ${cuenta.rota}`);
    console.log(`  No se ha podido comprobar   : ${cuenta.sinComprobar}`);
    console.log(`  Sin firma electrónica       : ${cuenta.sinFirma}  (manuscritas/escaneos)`);
    console.log(`  No se pudo bajar de Drive   : ${cuenta.noBaja}`);
    console.log(`  No es un PDF                : ${cuenta.noPdf}`);

    if (dudosos.length) {
        console.log('\nSin comprobar (no cuentan como rotas):');
        const porMotivo = {};
        for (const d of dudosos) {
            const k = d.problemas.join(' · ') || '(sin messageDigest legible)';
            (porMotivo[k] = porMotivo[k] || []).push(d.etiqueta);
        }
        for (const [motivo, quienes] of Object.entries(porMotivo)) {
            console.log(`  · ${motivo} — ${quienes.length}: ${quienes.slice(0, 5).join(', ')}${quienes.length > 5 ? '…' : ''}`);
        }
    }
    if (rotos.length) {
        console.log('\nROTOS:');
        rotos.forEach(r => console.log(`  · ${r.etiqueta} (${r.kb} KB) — ${r.problemas.join(' · ')}`));
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
