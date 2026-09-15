#!/usr/bin/env node
/**
 * Prueba el lector de las TRES placas SIN escribir nada.
 *
 *   node scripts/probar_placas.js 26RES080_79
 *   node scripts/probar_placas.js 26RES080_66 26RES080_63   (varios seguidos)
 *
 * Enseña lo que se lee de cada placa, con qué equipo del catálogo casa y —lo
 * importante cuando el expediente YA tiene los datos tecleados a mano— si lo
 * leído COINCIDE con lo escrito. Ese contraste es la mejor prueba que hay de
 * que el lector funciona: una persona miró la misma foto y escribió lo mismo.
 *
 * No toca ni Supabase ni Drive: solo lee. Cada expediente cuesta unas dos
 * llamadas a Gemini (~0,002 €).
 */
require('dotenv').config();

const placaOcr = require('../services/placaOcrService');
const placaEquipoOcr = require('../services/placaEquipoOcrService');
const supabase = require('../services/supabaseClient');
const { carpetaDeExpediente } = require('../services/expedienteFolderSync');

const nums = process.argv.slice(2);
if (!nums.length) {
    console.error('Uso: node scripts/probar_placas.js <nº expediente> [más…]');
    process.exit(1);
}

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const pinta = (v) => (v == null || v === '' ? '—' : String(v));

/** ¿Lo leído cuadra con lo que ya consta escrito? */
function contraste(etiqueta, escrito, leido) {
    if (!escrito) return `    ${etiqueta}: leído ${pinta(leido)}  (no constaba nada)`;
    if (!leido) return `    ${etiqueta}: consta ${pinta(escrito)}  · ⚠ no se ha leído`;
    const igual = norm(escrito) === norm(leido);
    return `    ${etiqueta}: ${igual ? '✓ COINCIDE' : '✗ DIFIERE'}  consta «${escrito}» · leído «${leido}»`;
}

(async () => {
    for (const numero of nums) {
        console.log(`\n${'═'.repeat(70)}\n  ${numero}\n${'═'.repeat(70)}`);

        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, numero_expediente, instalacion')
            .eq('numero_expediente', numero).maybeSingle();
        if (!exp) { console.error('  No existe ese expediente.'); continue; }

        const folderId = await carpetaDeExpediente(exp);
        if (!folderId) { console.error('  Sin carpeta de Drive.'); continue; }

        let fuelType = null;
        if (exp.oportunidad_id) {
            const { data: op } = await supabase.from('oportunidades')
                .select('fuel:datos_calculo->inputs->>fuelType').eq('id', exp.oportunidad_id).maybeSingle();
            fuelType = op?.fuel || null;
        }

        const t0 = Date.now();
        const [caldera, equipos] = await Promise.all([
            placaOcr.leerPlacaCaldera({ datos_calculo: { drive_folder_id: folderId } },
                { combustible: placaOcr.combustibleDeclarado(exp.instalacion, { fuelType }) })
                .catch((e) => ({ leido: null, sin_fotos: true, avisos: [`caldera: ${e.message}`] })),
            placaEquipoOcr.leerPlacasAerotermia(folderId)
                .catch((e) => ({ unidades: {}, sin_fotos: true, avisos: [`equipos: ${e.message}`] })),
        ]);
        const segs = ((Date.now() - t0) / 1000).toFixed(1);

        const inst = exp.instalacion || {};
        const cal = inst.caldera_antigua_cal || {};
        const aero = inst.aerotermia_cal || {};
        const ext = equipos.unidades?.exterior || null;
        const int = equipos.unidades?.interior || null;

        console.log(`\n  CALDERA que se retira  (${segs}s las dos lecturas)`);
        if (caldera.sin_fotos) console.log('    (sin fotos)');
        else {
            console.log(contraste('Marca    ', cal.marca, caldera.leido?.marca));
            console.log(contraste('Modelo   ', cal.modelo, caldera.leido?.modelo));
            console.log(contraste('Nº serie ', cal.numero_serie, caldera.leido?.numero_serie));
            const potEsc = [inst.potencia_caldera_kw, inst.potencia_caldera].map(Number).find((n) => n > 0) || null;
            console.log(contraste('Potencia ', potEsc, caldera.potencia_kw));
            if (caldera.leido?.potencia_texto) console.log(`    de la línea: «${caldera.leido.potencia_texto}»`);
        }

        console.log('\n  UNIDAD EXTERIOR');
        if (!ext) console.log('    (sin fotos)');
        else {
            console.log(contraste('Marca    ', aero.marca, ext.marca));
            console.log(contraste('Modelo   ', aero.modelo_ud_exterior, ext.modelo));
            console.log(contraste('Nº serie ', aero.numero_serie, ext.numero_serie));
            if (ext.refrigerante) console.log(`    Refrigerante: ${ext.refrigerante}`);
        }

        console.log('\n  UNIDAD INTERIOR');
        if (!int) console.log('    (sin fotos)');
        else {
            console.log(contraste('Modelo   ', aero.modelo_ud_interior, int.modelo));
            console.log(`    Nº serie : leído ${pinta(int.numero_serie)}  (el expediente no tiene campo para el de la interior)`);
        }

        if (ext || int) {
            const c = await placaEquipoOcr.casarConCatalogo(ext, int).catch((e) => ({ modelo: null, aviso: e.message }));
            console.log('\n  CATÁLOGO');
            if (c.modelo) {
                const mismo = String(aero.aerotermia_db_id || '') === String(c.modelo.id);
                console.log(`    ✓ ${c.modelo.marca} ${c.modelo.modelo_comercial}  (id ${c.modelo.id})`);
                console.log(`      por ${c.por}`);
                console.log(`      ${mismo ? '✓ es el que YA consta en el expediente' : `⚠ el expediente tiene «${aero.modelo || '—'}»`}`);
            } else {
                console.log(`    ✗ sin equipo: ${c.aviso || 'no casa con ninguno'}`);
            }
        }

        const avisos = [...(caldera.avisos || []), ...(equipos.avisos || [])];
        if (avisos.length) {
            console.log('\n  AVISOS');
            avisos.forEach((a) => console.log(`    ⚠ ${a}`));
        }
    }
    console.log('');
})().catch((e) => { console.error('\n✗', e.message); process.exit(1); });
