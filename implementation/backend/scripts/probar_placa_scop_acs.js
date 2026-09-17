/**
 * Qué placa se imprimiría HOY en el certificado de un expediente — o de todos los
 * que van por el Anexo VI. Solo LEE: no escribe en el expediente ni en Drive.
 *
 *   node implementation/backend/scripts/probar_placa_scop_acs.js 25RES060_76
 *   node implementation/backend/scripts/probar_placa_scop_acs.js --todos
 *
 * Ejerce `placaDeExpediente`, que es lo MISMO que llama la ruta (el `select`
 * incluido). Ese detalle no es cosmético: el 17/09/2026 la ruta pedía
 * `drive_folder_id`, que no es una columna de `expedientes`, y la consulta entera
 * fallaba → 404 sobre un expediente que sí existe. En pantalla eso no se ve como
 * un error: se ve como que el botón no hace nada.
 */
const supabase = require('../services/supabaseClient');
const { placaDeExpediente } = require('../services/placaScopAcs');

(async () => {
    const arg = process.argv[2];
    const todos = arg === '--todos' || !arg;

    let filas;
    if (todos) {
        const { data, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, metodo:instalacion->aerotermia_acs->>metodo_scop')
            .limit(2000);
        if (error) throw error;
        filas = data.filter((e) => e.metodo === 'independiente');
        console.log(`\n${filas.length} expedientes justifican su SCOP_dhw por el Anexo VI.\n`);
    } else {
        const { data, error } = await supabase
            .from('expedientes').select('id, numero_expediente').eq('numero_expediente', arg).maybeSingle();
        if (error) throw error;
        if (!data) { console.error(`No hay ningún expediente ${arg}.`); process.exit(1); }
        filas = [data];
    }

    let con = 0, sin = 0, noAplica = 0;
    for (const f of filas) {
        // eslint-disable-next-line no-await-in-loop
        const { exp, placa } = await placaDeExpediente(f.id, { conImagen: !todos });
        if (!exp) { console.log(`✘ ${f.numero_expediente}  el expediente no se ha podido leer`); sin++; continue; }
        if (!placa.aplica) { console.log(`·  ${f.numero_expediente}  no va por el Anexo VI`); noAplica++; continue; }
        if (!placa.elegida) { console.log(`✘ ${f.numero_expediente}  SIN foto de placa`); sin++; continue; }
        con++;
        const kb = placa.src ? ` · ${Math.round(placa.src.length / 1024)} KB` : '';
        console.log(`✔ ${f.numero_expediente}  ${placa.elegida.name}  (${placa.candidatas.length} en el slot)${kb}`);
        if (placa.aviso) console.log(`   ⚠ ${placa.aviso}`);
    }
    if (filas.length > 1) console.log(`\n${con} con placa · ${sin} sin ella · ${noAplica} no aplican.`);
    process.exit(0);
})().catch((e) => { console.error('FALLO:', e.message); process.exit(1); });
