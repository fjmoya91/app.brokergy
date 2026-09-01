// ─────────────────────────────────────────────────────────────────────────────
// Reorganiza en Drive el papeleo de los lotes YA existentes: mueve los PDF sueltos
// de la raíz de la carpeta del lote a su subcarpeta "{codigo} - DOC. VERIFICACIÓN"
// y los renombra con el prefijo numérico del proceso (ver services/loteDocs.js).
//
// Mover un fichero en Drive NO le cambia el ID, y en `lotes.documentos_so` guardamos
// `draft_file_id` / `signed_file_id` (no la ruta), así que no hay que tocar la BD:
// los enlaces de la app siguen funcionando. Sí se actualiza `file_name` para que la
// ficha del lote muestre el nombre real del fichero.
//
//   node scripts/reorganizar_docs_lote.js              → DRY-RUN (no toca nada)
//   node scripts/reorganizar_docs_lote.js --execute    → mueve y renombra de verdad
//   node scripts/reorganizar_docs_lote.js --lote LOTE-2026-004   → solo ese lote
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { CARPETA_DOCS, nombreDocLote, slotDeKey } = require('../services/loteDocs');

const EXECUTE = process.argv.includes('--execute');
const soloLote = (() => {
    const i = process.argv.indexOf('--lote');
    return i >= 0 ? process.argv[i + 1] : null;
})();

const pdfName = (base) => {
    const clean = String(base || 'Documento').replace(/[\\/<>:"|?*]/g, '_').trim();
    return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
};

// Nombre canónico que le toca a una entrada de documentos_so. Lleva el CÓDIGO DEL
// LOTE: fuera de su carpeta, "4.2 Informe de Verificación.pdf" no dice de qué lote
// es, y todos los lotes generan un fichero con ese mismo nombre. Pasar este script
// sobre los lotes antiguos es lo que los renombra.
function nombreDestino(entry, firmado, codigo) {
    const slot = slotDeKey(entry.key);
    if (!slot) return null;
    const n = /_\d+$/.test(entry.key) ? entry.key.split('_').pop() : null;
    const base = nombreDocLote(slot, { n, codigo });
    return pdfName(firmado ? `${base}_fdo` : base);
}

(async () => {
    console.log(EXECUTE ? '⚙  MODO EJECUCIÓN — se mueven ficheros\n' : '👀 DRY-RUN — no se toca nada (usa --execute para aplicar)\n');

    let q = supabase.from('lotes').select('id, codigo, drive_folder_id, documentos_so');
    if (soloLote) q = q.eq('codigo', soloLote);
    const { data: lotes, error } = await q.order('codigo');
    if (error) throw error;

    // La factura al S.O. vive en su propia tabla (el JSONB `lotes.factura_so` es
    // vestigial y está vacío), así que se busca aparte y se indexa por lote.
    const { data: facturas } = await supabase.from('facturas_so').select('lote_id, numero, drive_file_id');
    const facturaDe = new Map((facturas || []).filter(f => f.drive_file_id).map(f => [f.lote_id, f]));

    let totalMovidos = 0, totalOmitidos = 0;

    for (const lote of lotes || []) {
        const docs = Array.isArray(lote.documentos_so) ? lote.documentos_so : [];
        // Solo los documentos de NIVEL LOTE: las fichas viven en la carpeta de su
        // expediente y no se tocan.
        const deLote = docs.filter(d => d && !d.expediente_id && !d.exp_folder_id && slotDeKey(d.key));
        const factura = facturaDe.get(lote.id) || null;
        if (!lote.drive_folder_id || (!deLote.length && !factura)) {
            console.log(`— ${lote.codigo}: nada que mover`);
            continue;
        }

        console.log(`\n▸ ${lote.codigo}`);
        let destino = null;
        const nombreCarpeta = CARPETA_DOCS(lote.codigo);
        if (EXECUTE) {
            destino = await driveService.getOrCreateSubfolder(lote.drive_folder_id, nombreCarpeta);
            if (!destino) { console.log('  ✕ no se pudo crear la carpeta destino'); continue; }
        }
        console.log(`  carpeta: ${nombreCarpeta}${EXECUTE ? ` (${destino})` : ' [se crearía]'}`);

        // Cada entrada puede tener borrador y firmado, cada uno su fichero.
        const piezas = [];
        for (const d of deLote) {
            if (d.draft_file_id) piezas.push({ entry: d, fileId: d.draft_file_id, firmado: false });
            if (d.signed_file_id) piezas.push({ entry: d, fileId: d.signed_file_id, firmado: true });
        }
        if (factura) {
            piezas.push({
                entry: { key: 'factura_so', label: `Factura al S.O. ${factura.numero}` },
                fileId: factura.drive_file_id, firmado: false, factura: true,
            });
        }

        const docsNuevos = docs.map(d => ({ ...d }));
        for (const p of piezas) {
            const nombre = p.factura
                ? pdfName(nombreDocLote('factura_so', { label: `${factura.numero} - ${lote.codigo}` }))
                : nombreDestino(p.entry, p.firmado, lote.codigo);
            if (!nombre) { totalOmitidos++; continue; }
            console.log(`  · ${p.entry.label || p.entry.key}${p.firmado ? ' (firmado)' : ''} → ${nombre}`);
            if (!EXECUTE) { totalMovidos++; continue; }
            try {
                // moveFolder/renameFolder valen igual para ficheros: en Drive todo es
                // un `file` y solo cambia el mimeType.
                await driveService.renameFolder(p.fileId, nombre);
                await driveService.moveFolder(p.fileId, destino);
                if (!p.factura && !p.firmado) {
                    const i = docsNuevos.findIndex(x => x.key === p.entry.key);
                    if (i >= 0) docsNuevos[i].file_name = nombre;
                }
                totalMovidos++;
            } catch (e) {
                console.log(`    ✕ ${e.message}`);
                totalOmitidos++;
            }
        }

        if (EXECUTE && deLote.length) {
            await supabase.from('lotes').update({ documentos_so: docsNuevos }).eq('id', lote.id);
        }
    }

    console.log(`\n${EXECUTE ? 'Movidos' : 'Se moverían'}: ${totalMovidos} · omitidos: ${totalOmitidos}`);
    process.exit(0);
})().catch(e => { console.error('✕', e.message); process.exit(1); });
