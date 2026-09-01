/**
 * Genera los ANEXOS del MITECO de un lote desde la línea de órdenes, con la MISMA
 * lógica que el botón de la app (`POST /api/lotes/:id/anexos-actuacion`):
 * completa lo que falte leyendo el informe y el dictamen que ya están subidos, y
 * sube un anexo por expediente a la carpeta de documentación del lote.
 *
 *   node scripts/generar_anexos_lote.js LOTE-2026-004
 *   node scripts/generar_anexos_lote.js LOTE-2026-004 --dry     (no sube nada)
 *
 * Sirve para regenerarlos en bloque tras un cambio y para diagnosticar por qué un
 * expediente sale incompleto sin tener que ir a la interfaz.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const drive = require('../services/driveService');
const supabase = require('../services/supabaseClient');
const svc = require('../services/anexoActuacionService');
const { leerInformeVerificacion, leerDictamenVerificacion } = require('../services/loteOcrService');
const { casarActuaciones, aplicarOrdenActuacion } = require('../services/loteVerificados');
const { carpetaDeExpediente } = require('../services/expedienteFolderSync');
const { detectPrograma } = require('../utils/fichas');
const { CARPETA_DOCS } = require('../services/loteDocs');

const CODIGO = process.argv[2];
const DRY = process.argv.includes('--dry');

(async () => {
    if (!CODIGO) {
        console.error('Uso: node scripts/generar_anexos_lote.js <CÓDIGO DE LOTE> [--dry]');
        process.exit(1);
    }
    console.log(DRY ? '👀 DRY-RUN — no se sube nada\n' : '⚙  Generando y subiendo a Drive\n');

    const { data: lote } = await supabase.from('lotes').select('*').eq('codigo', CODIGO).maybeSingle();
    if (!lote) { console.error(`No existe el lote ${CODIGO}`); process.exit(1); }

    let { data: exps } = await supabase.from('expedientes')
        .select('id, numero_expediente, instalacion, documentacion').eq('lote_id', lote.id);

    // ── 1. El dictamen (dato del LOTE) ────────────────────────────────────────
    const docD = (lote.documentos_so || []).find(d => d?.key === 'dictamen_favorable');
    let dictamen = docD?.dictamen || {};
    if (!dictamen.numero_dictamen && docD?.draft_file_id) {
      try {
        const buf = await drive.getFileContent(docD.draft_file_id);
        if (buf) {
            const d = await leerDictamenVerificacion(buf);
            dictamen = {
                numero_dictamen: d.numero_dictamen, fecha_emision: d.fecha_emision,
                referencia_informe: d.referencia_informe, decision: d.decision,
                organismo: d.organismo, total_kwh: d.total_kwh,
            };
            if (!DRY) {
                const docs = (lote.documentos_so || []).map(x =>
                    x?.key === 'dictamen_favorable' ? { ...x, dictamen } : x);
                await supabase.from('lotes').update({ documentos_so: docs }).eq('id', lote.id);
            }
            console.log(`dictamen leído: ${dictamen.numero_dictamen} · ${dictamen.fecha_emision}`);
        }
      } catch (e) { console.warn('  ! no se pudo leer el dictamen:', e.message.slice(0, 90)); }
    }
    if (!dictamen.numero_dictamen || !dictamen.fecha_emision) {
        console.error('✗ Sin el nº y la fecha del dictamen no se puede generar ningún anexo.');
        process.exit(1);
    }

    // ── 2. El orden de actuación (lo dice el informe) ──────────────────────────
    const docI = (lote.documentos_so || []).find(d => d?.key === 'informe_verificacion');
    const sinOrden = exps.filter(e => !(Number(e.instalacion?.verificacion?.orden_actuacion) > 0));
    if (sinOrden.length && docI?.draft_file_id) {
      try {
        const buf = await drive.getFileContent(docI.draft_file_id);
        if (buf) {
            const informe = await leerInformeVerificacion(buf);
            const { filas } = casarActuaciones(informe.actuaciones, exps);
            const aplicables = filas.filter(f => f.expediente_id && f.orden)
                .map(f => ({ expediente_id: f.expediente_id, orden: f.orden }));
            if (!DRY) {
                const puestos = await aplicarOrdenActuacion(aplicables);
                console.log('orden de actuación: ' + puestos.map(p => `E${p.orden}=${p.numero_expediente}`).join(' · '));
                ({ data: exps } = await supabase.from('expedientes')
                    .select('id, numero_expediente, instalacion, documentacion').eq('lote_id', lote.id));
            } else {
                console.log('orden de actuación (dry): ' + filas.map(f => `E${f.orden}=${f.numero_expediente}`).join(' · '));
            }
        }
      } catch (e) { console.warn('  ! no se pudo leer el informe:', e.message.slice(0, 90)); }
    }

    // ── 3. Un anexo por expediente, en su carpeta "E{n}" ──────────────────────
    // La carpeta de documentación del LOTE se usa solo para limpiar los anexos que
    // se dejaron ahí antes de que cada uno tuviera su sitio.
    const carpetaLote = await drive.getOrCreateSubfolder(lote.drive_folder_id, CARPETA_DOCS(lote.codigo));
    const ordenados = [...exps].sort((a, b) =>
        (a.instalacion?.verificacion?.orden_actuacion || 99) - (b.instalacion?.verificacion?.orden_actuacion || 99));

    let ok = 0, mal = 0;
    for (const e of ordenados) {
        const ficha = detectPrograma(e);
        const orden = Number(e.instalacion?.verificacion?.orden_actuacion) || null;
        const d = svc.datosDesdeExpediente(e, { orden, ficha, dictamen });
        const faltan = svc.faltantes(d);
        if (faltan.length) {
            console.log(`  ✗ ${e.numero_expediente}: falta ${faltan.join(', ')}`);
            mal++; continue;
        }
        const nombre = svc.nombreAnexo(d);
        const expFolder = await carpetaDeExpediente(e);
        if (!expFolder) { console.log(`  ✗ ${e.numero_expediente}: sin carpeta de Drive`); mal++; continue; }
        console.log(`  ✓ ${nombre}  ·  ${d.ahorro_kwh} kWh  ·  ${d.inversion}  ·  ${ficha} ${d.vida_util} años  →  E${d.n_actuacion}/`);
        if (!DRY) {
            const carpetaE = await drive.getOrCreateSubfolder(expFolder, `E${d.n_actuacion}`);
            const prev = await drive.findFileByName(carpetaE, nombre);
            if (prev) await drive.deleteFile(prev);
            await drive.saveFileToFolder(carpetaE, nombre, 'application/pdf', await svc.generarAnexo(d));
            // El que se dejó en la carpeta del lote antes de tener su sitio: dos
            // copias del mismo anexo en la documentación que se sube no es inocuo.
            const viejo = await drive.findFileByName(carpetaLote, nombre);
            if (viejo) { await drive.deleteFile(viejo); console.log(`      (retirado el que estaba en ${CARPETA_DOCS(lote.codigo)})`); }
        }
        ok++;
    }
    console.log(`\n${ok} generado${ok === 1 ? '' : 's'}${mal ? ` · ${mal} incompleto${mal === 1 ? '' : 's'}` : ''}`);
    if (!DRY && ok) console.log(`Cada anexo, en la carpeta E{n} de su expediente.`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
