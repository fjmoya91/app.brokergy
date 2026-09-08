/**
 * Repasa las FECHAS DE REGISTRO del CEE ya selladas y las contrasta con lo que dice
 * el justificante que está en Drive.
 *
 *   node scripts/releer_fechas_registro_cee.js              ← simulación (no escribe)
 *   node scripts/releer_fechas_registro_cee.js --execute    ← corrige las que difieren
 *   node scripts/releer_fechas_registro_cee.js --solo=cae   ← 'cae' | 'directos'
 *   node scripts/releer_fechas_registro_cee.js --expte=26RES060_118
 *
 * POR QUÉ EXISTE. Hasta 2026-09-07 la app sellaba `fecha_registro_cee_{fase}` con el
 * día en que se SUBÍA el justificante. Solo es la fecha buena cuando se sube el mismo
 * día: un registro de semanas atrás —lo normal al poner un expediente al día, y en
 * todo lo migrado— quedaba fechado hoy. De esa fecha cuelgan el plazo de la obra, el
 * devengo de la facturación del certificador (que factura por hito de registro) y la
 * comprobación de que las facturas no son anteriores al registro: una fecha inventada
 * marca errores que no lo son y esconde los que sí.
 *
 * REGLA — solo se corrige lo que el papel contradice. Si el justificante no se puede
 * leer, o dice lo mismo que consta, no se toca nada. Lo que cambia queda anotado en
 * el historial con la frase citada del documento, para que se pueda comprobar.
 *
 * Coste: una llamada de lectura por fase registrada (~0,0003 € cada una).
 */
require('dotenv').config();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const ceeUploadService = require('../services/ceeUploadService');
const ceeDirectoUploads = require('../services/ceeDirectoUploadService');
const { resolverFechaRegistro } = require('../services/registroCeeOcrService');

const EXECUTE = process.argv.includes('--execute');
const SOLO = (process.argv.find(a => a.startsWith('--solo=')) || '').split('=')[1] || null;
const EXPTE = (process.argv.find(a => a.startsWith('--expte=')) || '').split('=')[1] || null;
const FASES = ['inicial', 'final'];

const esES = (f) => (f ? String(f).split('-').reverse().join('/') : '—');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function driveIdFromLink(link) {
    const s = String(link || '');
    const m = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
    return m ? m[1] : null;
}

const resumen = { revisados: 0, sin_justificante: 0, ilegibles: 0, coinciden: 0, corregidos: 0, difieren: 0 };

/**
 * Una fase de un expediente. `buscarFichero` devuelve el id de Drive del
 * justificante (cada negocio busca en su carpeta).
 */
async function revisarFase({ etiqueta, fase, actual, buscarFichero, escribir }) {
    resumen.revisados++;
    let fileId = null;
    try { fileId = await buscarFichero(); } catch (e) { /* se trata como sin justificante */ }
    if (!fileId) {
        resumen.sin_justificante++;
        console.log(`  · ${etiqueta} ${fase.padEnd(7)} — sin justificante en Drive (consta ${esES(actual)})`);
        return;
    }

    let pdf;
    try { pdf = await driveService.getFileContent(fileId); } catch (e) { pdf = null; }
    if (!pdf?.length) {
        resumen.ilegibles++;
        console.log(`  · ${etiqueta} ${fase.padEnd(7)} — no se pudo descargar el justificante`);
        return;
    }

    const lectura = await resolverFechaRegistro(pdf);
    if (lectura.origen !== 'justificante') {
        resumen.ilegibles++;
        console.log(`  ? ${etiqueta} ${fase.padEnd(7)} — ilegible: ${lectura.aviso}`);
        return;
    }
    if (lectura.fecha === actual) {
        resumen.coinciden++;
        console.log(`  ✓ ${etiqueta} ${fase.padEnd(7)} — ${esES(actual)} correcta`);
        return;
    }

    resumen.difieren++;
    console.log(`  ⚠ ${etiqueta} ${fase.padEnd(7)} — consta ${esES(actual)} · el justificante dice ${esES(lectura.fecha)}`);
    if (lectura.frase) console.log(`      «${lectura.frase}»`);
    if (!EXECUTE) return;

    await escribir(lectura);
    resumen.corregidos++;
    console.log('      → corregida');
}

async function barrerCae() {
    // Campos CONCRETOS del JSONB (regla 22): `cee` entero trae el XML del certificado.
    let q = supabase
        .from('expedientes')
        .select('id, numero_expediente, oportunidad_id, seguimiento, cee_files:cee->cee_files,'
            + ' f_ini:documentacion->fecha_registro_cee_inicial, f_fin:documentacion->fecha_registro_cee_final')
        .order('numero_expediente');
    if (EXPTE) q = q.eq('numero_expediente', EXPTE);
    const { data, error } = await q;
    if (error) throw error;

    console.log(`\n═══ EXPEDIENTES CAE (${data.length}) ═══`);
    for (const exp of data) {
        const registradas = FASES.filter(f => exp.seguimiento?.[`cee_${f}`] === 'REGISTRADO');
        if (!registradas.length) continue;
        console.log(`\n${exp.numero_expediente}`);
        for (const fase of registradas) {
            const actual = fase === 'final' ? exp.f_fin : exp.f_ini;
            await revisarFase({
                etiqueta: 'CEE', fase, actual,
                buscarFichero: async () => {
                    const link = exp.cee_files?.[fase]?.registro;
                    if (driveIdFromLink(link)) return driveIdFromLink(link);
                    // Drive es la fuente de verdad (regla 20): si el slot está vacío,
                    // el fichero puede estar igualmente en la carpeta de la fase.
                    const folderId = await ceeUploadService.resolveDriveFolderId(exp);
                    const enCarpeta = folderId ? await ceeUploadService.scanCeeSection(folderId, fase) : {};
                    return driveIdFromLink(enCarpeta?.registro?.link);
                },
                escribir: async (lectura) => {
                    // Re-lectura fresca: se escribe `documentacion` entera y no puede
                    // salir de una copia de hace media hora de barrido.
                    const { data: fresh } = await supabase.from('expedientes')
                        .select('documentacion').eq('id', exp.id).single();
                    const doc = { ...(fresh?.documentacion || {}) };
                    doc[`fecha_registro_cee_${fase}`] = lectura.fecha;
                    const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
                    historial.push({
                        id: Date.now().toString() + '_reg_fecha',
                        tipo: 'informativo',
                        texto: `Fecha de registro del CEE ${fase.toUpperCase()} corregida a ${lectura.fecha}`
                            + `${actual ? ` (antes ${actual}, que era el día de la subida)` : ''}`
                            + `${lectura.frase ? `: «${lectura.frase}»` : '.'}`,
                        fecha: new Date().toISOString(),
                        usuario: 'SISTEMA',
                    });
                    doc.historial = historial;
                    const { error: e } = await supabase.from('expedientes')
                        .update({ documentacion: doc }).eq('id', exp.id);
                    if (e) throw e;
                },
            });
            await sleep(300);
        }
    }
}

async function barrerDirectos() {
    let q = supabase
        .from('cee_directos')
        .select('id, numero_expediente, alcance, drive_folder_id, seguimiento, cee_files:cee->cee_files,'
            + ' f_ini:documentacion->fecha_registro_cee_inicial, f_fin:documentacion->fecha_registro_cee_final')
        .order('numero_expediente');
    if (EXPTE) q = q.eq('numero_expediente', EXPTE);
    const { data, error } = await q;
    if (error) throw error;

    console.log(`\n═══ CEE DIRECTOS (${data.length}) ═══`);
    for (const row of data) {
        const registradas = FASES.filter(f => row.seguimiento?.[`cee_${f}`] === 'REGISTRADO');
        if (!registradas.length) continue;
        console.log(`\n${row.numero_expediente}`);
        for (const fase of registradas) {
            const actual = fase === 'final' ? row.f_fin : row.f_ini;
            await revisarFase({
                etiqueta: 'CEE', fase, actual,
                buscarFichero: async () => {
                    const link = row.cee_files?.[fase]?.registro;
                    if (driveIdFromLink(link)) return driveIdFromLink(link);
                    const enCarpeta = await ceeDirectoUploads.scanSection(row, fase);
                    return enCarpeta?.registro?.id || driveIdFromLink(enCarpeta?.registro?.link);
                },
                escribir: async (lectura) => {
                    const { data: fresh } = await supabase.from('cee_directos')
                        .select('documentacion').eq('id', row.id).single();
                    const doc = { ...(fresh?.documentacion || {}) };
                    doc[`fecha_registro_cee_${fase}`] = lectura.fecha;
                    const { error: e } = await supabase.from('cee_directos')
                        .update({ documentacion: doc }).eq('id', row.id);
                    if (e) throw e;
                    await require('../services/ceeDirectoService').anotarHistorial(row.id, {
                        tipo: 'CEE',
                        texto: `FECHA DE REGISTRO DEL ${fase === 'final' ? 'CEE FINAL' : 'CEE'} CORREGIDA A ${lectura.fecha}`
                            + `${actual ? ` (ANTES ${actual}, QUE ERA EL DÍA DE LA SUBIDA)` : ''} LEYÉNDOLA DEL JUSTIFICANTE`,
                        usuario: null,
                    });
                },
            });
            await sleep(300);
        }
    }
}

(async () => {
    console.log(EXECUTE ? '⚠ MODO ESCRITURA' : 'Simulación (no se escribe nada). Añade --execute para corregir.');
    if (SOLO !== 'directos') await barrerCae();
    if (SOLO !== 'cae') await barrerDirectos();

    console.log('\n═══ RESUMEN ═══');
    console.log(`  Fases registradas revisadas : ${resumen.revisados}`);
    console.log(`  Sin justificante en Drive   : ${resumen.sin_justificante}`);
    console.log(`  Justificante ilegible       : ${resumen.ilegibles}`);
    console.log(`  La fecha ya era correcta    : ${resumen.coinciden}`);
    console.log(`  Difieren del justificante   : ${resumen.difieren}${EXECUTE ? ` (corregidas ${resumen.corregidos})` : ' — simulación'}`);
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
