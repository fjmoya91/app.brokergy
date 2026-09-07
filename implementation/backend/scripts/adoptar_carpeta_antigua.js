#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ADOPCIÓN de la carpeta antigua como carpeta del expediente.
 *
 * Para los expedientes que se importaron de AppSheet SIN carpeta en el árbol
 * nuevo (`AS_*`: fila en Supabase y poco más) pero que SÍ tienen su carpeta viva
 * en el Drive antiguo, con todo dentro.
 *
 * ADOPTAR, no copiar: crear una carpeta nueva y duplicar 80 ficheros dejaría dos
 * copias del mismo expediente en el mismo Drive, y a la semana nadie sabría cuál
 * es la buena. Aquí la carpeta vieja PASA A SER la del expediente: se renumera,
 * se mueve a la carpeta de su estado y se apunta su id en la oportunidad. Cero
 * copias, cero duplicados.
 *
 * QUÉ HACE, por par (expediente, carpeta):
 *   1. Renombra a "{nº real} - {resto del nombre viejo}" — la carpeta se llama
 *      "26RES060_XX - DANIEL (POBLETE)" y el expediente es 26RES060_109.
 *   2. La mueve a la carpeta de su estado (services/driveFolders, regla 2).
 *   3. Crea las subcarpetas 0–12 que le falten.
 *   4. Apunta el id y el enlace en la oportunidad.
 *
 * Después conviene lanzar `reconciliar_migrados.js --solo-enlaces` para enlazar
 * los documentos de esa carpeta en sus slots.
 *
 * LOS PARES LOS DAS TÚ: no se adivina. El emparejamiento por número falla justo
 * en estos (se llaman "_XX"), y por nombre de cliente sería una conjetura — y
 * adoptar la carpeta equivocada mete los papeles de otro en el expediente.
 *
 * USO:
 *   node scripts/adoptar_carpeta_antigua.js --pares scripts/adopciones.csv
 *   node scripts/adoptar_carpeta_antigua.js --pares … --execute
 *   node scripts/adoptar_carpeta_antigua.js --exp 26RES060_109 --folder <id> --execute
 *   node scripts/adoptar_carpeta_antigua.js --pares … --execute --no-renombrar
 *
 * FORMATO del CSV (';', con o sin cabecera): expediente;folder_id_o_enlace[;nota]
 * ─────────────────────────────────────────────────────────────────────────────
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { carpetaObjetivoExpediente, nombreCarpeta } = require('../services/driveFolders');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

const EXECUTE = flag('--execute') || flag('--apply');
const RENOMBRAR = !flag('--no-renombrar');
const FORZAR = flag('--forzar');   // adoptar aunque el expediente ya tenga carpeta

const SUBCARPETAS = [
    '0. PRESUPUESTO', '1. CEE', '2. FOTOS Y VIDEOS', '3. FICHAS TÉCNICAS Y CERTIFICACIONES',
    '4. OTRA DOCUMENTACION', '5. FACTURAS', '6. ANEXOS CAE', '7. LEGALIZACION RITE',
    '8. RESOLUCION', '9. PAGO A CLIENTE', '10. EXPEDIENTE CAE', '11. REQUERIMIENTO',
    '12. DOCUMENTOS PARA CEE',
];

// Acepta el id pelado o cualquier enlace de Drive pegado del navegador.
const idDeCarpeta = (v) => {
    const s = String(v || '').trim();
    const m = s.match(/(?:folders\/|[?&]id=)([A-Za-z0-9_-]{20,})/);
    return m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null);
};

function leerPares() {
    if (opt('--exp') && opt('--folder')) {
        return [{ exp: opt('--exp').trim(), folder: idDeCarpeta(opt('--folder')) }];
    }
    const ruta = opt('--pares');
    if (!ruta) return null;
    const texto = fs.readFileSync(path.resolve(ruta), 'utf8').replace(/^﻿/, '');
    return texto.split(/\r?\n/)
        .map(l => l.split(';'))
        .filter(c => c.length >= 2 && c[0].trim() && !/^expediente$/i.test(c[0].trim()))
        .map(c => ({ exp: c[0].trim(), folder: idDeCarpeta(c[1]) }));
}

(async function main() {
    const pares = leerPares();
    if (!pares || !pares.length) {
        console.error('✗ Hacen falta los pares: --pares <csv>  o  --exp <nº> --folder <id|enlace>');
        process.exit(1);
    }
    const invalidos = pares.filter(p => !p.folder);
    if (invalidos.length) {
        console.error('✗ Estos pares no traen un id de carpeta reconocible:', invalidos.map(p => p.exp).join(', '));
        process.exit(1);
    }
    console.log(EXECUTE
        ? '⚠️  MODO EJECUCIÓN: se renombrarán y MOVERÁN carpetas en Drive.\n'
        : '🔍 DRY-RUN: no se toca nada. Añade --execute cuando la tabla te convenza.\n');

    const adoptados = [];

    for (const { exp: num, folder } of pares) {
        const { data: e } = await supabase.from('expedientes')
            .select('id, numero_expediente, estado, oportunidad_id, cee, lote_id')
            .eq('numero_expediente', num).maybeSingle();
        if (!e) { console.log(`· ${num.padEnd(14)} ✗ no existe ese expediente`); continue; }

        const { data: op } = await supabase.from('oportunidades')
            .select('id, folder:datos_calculo->>drive_folder_id, folder_inputs:datos_calculo->inputs->>drive_folder_id')
            .eq('id', e.oportunidad_id).maybeSingle();
        const yaTiene = op?.folder || op?.folder_inputs || null;
        if (yaTiene && !FORZAR) {
            console.log(`· ${num.padEnd(14)} ✗ ya tiene carpeta (${yaTiene}). Usa --forzar si de verdad quieres cambiarla.`);
            continue;
        }

        const meta = await driveService.getFileMetadata(folder).catch(() => null);
        if (!meta) { console.log(`· ${num.padEnd(14)} ✗ la carpeta ${folder} no existe o no es accesible`); continue; }

        // El destino lo decide el ESTADO, igual que el sincronizador (regla 2). Si
        // el estado no da un destino claro (p. ej. un expediente ya loteado), no se
        // mueve: mejor dejarla donde está que llevarla a la carpeta equivocada.
        const destino = carpetaObjetivoExpediente(e);
        const nombreNuevo = RENOMBRAR
            ? `${num} - ${String(meta.name || '').replace(/^\s*\d{0,3}(RES\d{3}|TER\d{3})[_\s-]*(\d+|XX|00)?\s*-?\s*/i, '').trim()}`.trim()
            : null;

        console.log(`· ${num.padEnd(14)} ${meta.name}`);
        console.log(`    renombrar → ${nombreNuevo || '(no)'}`);
        console.log(`    mover a   → ${destino ? nombreCarpeta(destino) : '(su estado no decide destino: se queda donde está)'}`);
        if (!EXECUTE) { console.log('    (simulado)\n'); continue; }

        if (nombreNuevo && nombreNuevo !== meta.name) await driveService.renameFolder(folder, nombreNuevo);
        if (destino) await driveService.moveFolder(folder, destino);
        for (const sub of SUBCARPETAS) await driveService.getOrCreateSubfolderNormalized(folder, sub);

        // El id de la carpeta se escribe en `datos_calculo.inputs` con la RPC
        // oportunidad_merge_inputs (jsonb_set sobre esa rama). Un update del
        // datos_calculo entero sería un leer-modificar-escribir sobre un JSONB que
        // llega a 5 MB y que escriben otros endpoints (regla 19). La app lee
        // `datos_calculo.drive_folder_id || datos_calculo.inputs.drive_folder_id`,
        // así que este sitio vale igual.
        const link = await driveService.getWebViewLink(folder);
        const { error: err } = await supabase.rpc('oportunidad_merge_inputs', {
            p_id: e.oportunidad_id,
            p_patch: { drive_folder_id: folder, drive_folder_link: link },
        });
        console.log(err ? `    ✗ Supabase: ${err.message}\n` : `    ✓ adoptada\n`);
        if (!err) adoptados.push({ num, folder });
    }

    // Enlazar los documentos en sus slots es un paso APARTE, y hay que decir CÓMO:
    // al adoptar, la carpeta SALE del árbol viejo, así que `--solo-enlaces` a secas
    // ya no le encuentra origen y no enlaza nada (se queda en "sin carpeta origen").
    // Hay que pasarle la carpeta adoptada como `--origen`: origen == destino ⇒ cero
    // copias, solo los enlaces.
    if (!EXECUTE) {
        console.log('Repite con --execute cuando los pares te convenzan.');
    } else if (!adoptados.length) {
        console.log('Hecho. No se adoptó ninguna carpeta.');
    } else {
        console.log('Hecho. Enlaza ahora sus documentos en los slots (una línea por expediente):\n');
        for (const a of adoptados) {
            console.log(`  node scripts/reconciliar_migrados.js --exp ${a.num} --origen ${a.folder} --solo-enlaces --execute`);
        }
        console.log('\n(`--solo-enlaces` SIN `--origen` no vale: la carpeta ya no está en el árbol viejo.)');
    }
})().catch(err => { console.error('\n✗ Fallo:', err); process.exit(1); });
