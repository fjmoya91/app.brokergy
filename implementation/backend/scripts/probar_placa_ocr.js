#!/usr/bin/env node
/**
 * Prueba el lector de la PLACA de la caldera SIN escribir nada.
 *
 *   node scripts/probar_placa_ocr.js 26RES060_186        (las fotos que ya hay en Drive)
 *   node scripts/probar_placa_ocr.js ./placa.jpg [...]   (una foto suelta del disco)
 *
 * Enseña lo leído, la LÍNEA LITERAL de donde sale la potencia y qué se escribiría
 * en el expediente. No toca ni Supabase ni Drive: solo lee.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const placaOcr = require('../services/placaOcrService');
const supabase = require('../services/supabaseClient');

const arg = process.argv[2];
if (!arg) {
    console.error('Uso: node scripts/probar_placa_ocr.js <nº expediente | ruta a una foto> [más fotos…]');
    process.exit(1);
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

(async () => {
    let lectura, inst = null, numero = null, combustible = null;

    if (fs.existsSync(arg)) {
        const files = process.argv.slice(2).map((p) => ({
            buffer: fs.readFileSync(p),
            mimetype: MIME[path.extname(p).toLowerCase()] || 'image/jpeg',
            originalname: path.basename(p),
        }));
        console.log(`Leyendo ${files.length} foto(s) del disco…\n`);
        lectura = await placaOcr.leerPlacaCaldera(files, { combustible: process.env.COMBUSTIBLE || null });
    } else {
        const { data: exp, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, instalacion, oportunidad_id')
            .eq('numero_expediente', arg)
            .maybeSingle();
        if (error || !exp) { console.error(`No existe el expediente «${arg}».`); process.exit(1); }
        numero = exp.numero_expediente;
        inst = exp.instalacion || {};

        const { carpetaDeExpediente } = require('../services/expedienteFolderSync');
        const folderId = await carpetaDeExpediente(exp);
        if (!folderId) { console.error('El expediente no tiene carpeta de Drive.'); process.exit(1); }

        const { data: op } = exp.oportunidad_id
            ? await supabase.from('oportunidades')
                .select('fuel:datos_calculo->inputs->>fuelType')
                .eq('id', exp.oportunidad_id).maybeSingle()
            : { data: null };
        combustible = placaOcr.combustibleDeclarado(inst, { fuelType: op?.fuel || null });

        console.log(`${numero} · carpeta ${folderId}`);
        console.log(`Combustible declarado: ${combustible || '(ninguno)'} (fuelType: ${op?.fuel || '—'})`);
        console.log('Buscando fotos de la caldera…\n');
        lectura = await placaOcr.leerPlacaCaldera(
            { datos_calculo: { drive_folder_id: folderId } }, { combustible });
    }

    if (lectura.sin_fotos) {
        console.log('SIN FOTOS.');
        (lectura.avisos || []).forEach((a) => console.log('  ·', a));
        process.exit(0);
    }

    const l = lectura.leido || {};
    console.log('FOTOS LEÍDAS');
    (lectura.fotos || []).forEach((f) => console.log(`  · ${f.name}${f.slot ? `  [${f.slot}]` : ''}`));

    console.log('\nLO QUE DICE LA PLACA');
    console.log('  Marca        ', l.marca || '—');
    console.log('  Modelo       ', l.modelo || '—');
    console.log('  Nº de serie  ', l.numero_serie || '—');
    console.log('  Combustible  ', l.combustible || '—');
    console.log('  ACS          ', l.acs === null ? '—' : (l.acs ? 'sí (mixta)' : 'no'));
    console.log('  Año          ', l.anio || '—');
    console.log('\nPOTENCIA');
    console.log('  Línea literal:', l.potencia_texto ? `«${l.potencia_texto}»` : '—');
    console.log('  Transcritas  :', (l.potencias || []).map(x => `${x.etiqueta || '(sin rótulo)'} ${x.valor}`).join(' · ') || '—');
    console.log('  Candidatos   :', (lectura.potencia_candidatos || []).join(', ') || '—');
    console.log('  Se escribe   :', lectura.potencia_kw ? `${lectura.potencia_kw} kW (${lectura.potencia_base})` : '—');

    if (inst) {
        const cal = inst.caldera_antigua_cal || {};
        console.log('\nEN EL EXPEDIENTE AHORA');
        console.log('  Marca        ', cal.marca || '(vacío)');
        console.log('  Modelo       ', cal.modelo || '(vacío)');
        console.log('  Nº de serie  ', cal.numero_serie || '(vacío)');
        console.log('  Potencia     ', inst.potencia_caldera_kw || inst.potencia_caldera || '(vacío)');
        console.log('  Rendimiento  ', cal.rendimiento_id || '(sin declarar)');
    }

    if (lectura.avisos?.length) {
        console.log('\nAVISOS');
        lectura.avisos.forEach((a) => console.log('  ·', a));
    }
    console.log('\n(no se ha escrito nada)');
})().catch((e) => { console.error('\nFalló:', e.message); process.exit(1); });
