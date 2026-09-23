// ============================================================================
// sellar_temporada_scop.js — sella la TEMPORADA del SCOP donde hay equipo del
// catálogo y nadie la escribió.
// ----------------------------------------------------------------------------
// Las horas equivalentes del C_b (RES093/TER173) son las de la MISMA temporada en
// la que se declara el SCOP aplicado:
//
//     zona cálida + el equipo PUBLICA SCOP cálido   → horas de clima cálido (1.336)
//     zona cálida y NO lo publica (se aplica el medio) → horas de clima medio (2.066)
//
// Eso lo decide `getScopSeason` mirando las columnas del catálogo, y se SELLA en
// `aerotermia_cal.scop_temporada` (expediente) / `inputs.scopTemporada`
// (oportunidad) al elegir el equipo. Lo guardado ANTES de que existiera el sello
// —y lo que rellena una skill— se queda sin él, y entonces la cascada no puede
// afirmar nada y declara 'medio'. Este script lo resuelve con el catálogo real.
//
// REGLA — un sello que YA existe no se toca. Es el dato con el que se calculó el
// expediente y puede estar ya certificado: 26RES093_3 está SUBIDO A MITECO con la
// temporada en MEDIO pese a estar en D3, y así se queda.
//
// REGLA — solo se sella lo que se puede AFIRMAR. Dos cosas quedan fuera:
//   · Sin equipo del catálogo (SCOP tecleado a mano) no hay ficha que consultar:
//     ahí manda la zona y se resuelve en cada lectura. Sellarlo convertiría una
//     deducción en un dato.
//   · Si el SCOP GUARDADO no es el que hoy da el catálogo para esa zona y esa
//     impulsión, no consta de qué columna salió —lo pudo teclear una persona
//     encima, o el catálogo se corrigió después—: se avisa y NO se sella.
//
// REGLA — se sella solo donde la temporada PESA, o sea donde hay hibridación
// (el C_b es lo único que usa las horas equivalentes). En un RES060 corriente el
// sello no cambiaría una sola cifra, y `instalacion` se reescribe entera: no se
// tocan 120 expedientes para arreglar los que hibridan.
//
//   node implementation/backend/scripts/sellar_temporada_scop.js            (en seco)
//   node implementation/backend/scripts/sellar_temporada_scop.js --execute
//   …--expediente=26RES093_1   ó   --oportunidad=26RES060_OP3   (uno solo)
// ============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('../services/supabaseClient');

const EXECUTE = process.argv.includes('--execute');
const soloExp = (process.argv.find(a => a.startsWith('--expediente=')) || '').split('=')[1];
const soloOp = (process.argv.find(a => a.startsWith('--oportunidad=')) || '').split('=')[1];

// La MISMA decisión que el desplegable: el valor del SCOP y su temporada salen de
// `resolveScop`. Importar la fuente única es lo que impide que este script invente
// su propio criterio y selle algo que la app leería distinto.
const calcPath = path.resolve(__dirname, '../../frontend/src/features/calculator/logic/calculation.js');

// Temperatura de impulsión por emisor — el mismo mapeo que `getEmitterTemp`
// (cifoDoc.js). No se importa de ahí porque arrastraría el documento entero.
const TEMP_EMISOR = { suelo_radiante: 35, radiadores_baja_temp: 45, radiadores_convencionales: 55 };
const tempDe = (emisor) => TEMP_EMISOR[String(emisor || '').toLowerCase()] ?? 55;

// El sello describe de qué columna sale el SCOP APLICADO. Si el guardado no es el
// que hoy da el catálogo, no consta de cuál salió: se avisa y no se sella.
const coincideScop = (c) => c.scopGuardado != null
    && Math.abs(parseFloat(c.scopGuardado) - c.scopCatalogo) < 0.011;

(async () => {
    const { getScopSeason, getScopFromModel } = await import(pathToFileURL(calcPath).href);

    const { data: catalogo, error: eCat } = await supabase.from('aerotermia').select('*');
    if (eCat) throw eCat;
    const porId = new Map(catalogo.map(m => [String(m.id), m]));
    console.log(`Catálogo: ${catalogo.length} equipos\n`);

    const cambios = [];

    // ── EXPEDIENTES ──────────────────────────────────────────────────────────
    let qExp = supabase.from('expedientes').select('id, numero_expediente, estado, instalacion, oportunidad_id');
    if (soloExp) qExp = qExp.eq('numero_expediente', soloExp);
    const { data: expedientes, error: eExp } = await qExp;
    if (eExp) throw eExp;

    // La zona vive en la OPORTUNIDAD, no en el expediente (ver regla 48).
    const opIds = [...new Set(expedientes.map(e => e.oportunidad_id).filter(Boolean))];
    const datosDeOp = new Map();
    for (let i = 0; i < opIds.length; i += 100) {           // .in() por lotes (regla del repo)
        const { data, error } = await supabase
            .from('oportunidades').select('id, datos_calculo').in('id', opIds.slice(i, i + 100));
        if (error) throw error;
        for (const o of data) {
            const dc = o.datos_calculo || {};
            datosDeOp.set(o.id, { zona: dc.inputs?.zona || dc.zona || null, inputs: dc.inputs || {} });
        }
    }

    const dudosos = [];
    for (const e of expedientes) {
        const inst = e.instalacion || {};
        const aero = inst.aerotermia_cal || {};
        const op = datosDeOp.get(e.oportunidad_id) || { inputs: {} };

        // El MISMO criterio que `expedienteFinancials`: el toggle explícito manda y,
        // sin él, la ficha RES093 hibrida por defecto.
        const hibrida = (inst.hibridacion ?? op.inputs.hibridacion)
            ?? /RES093|TER173/.test(e.numero_expediente || '');
        if (!hibrida) continue;                              // la temporada no pesa aquí
        if (aero.scop_temporada) continue;                   // ya sellado: no se toca
        const modelo = porId.get(String(aero.aerotermia_db_id ?? ''));
        if (!modelo) continue;                               // sin equipo: manda la zona
        if (!op.zona) continue;                              // sin zona no se afirma nada

        const temp = tempDe(inst.tipo_emisor);
        const metodo = aero.metodo_scop || 'ficha';
        const season = getScopSeason(modelo, op.zona, temp, metodo);
        const scopCatalogo = getScopFromModel(modelo, op.zona, temp, metodo);
        const fila = {
            tabla: 'expedientes', id: e.id, ref: e.numero_expediente, estado: e.estado,
            equipo: `${modelo.marca} ${modelo.modelo_comercial || ''}`.trim(),
            zona: op.zona, temp, season, scopCatalogo, scopGuardado: aero.scop,
            // El sello se escribe DENTRO de aerotermia_cal, sin tocar nada más.
            patch: { instalacion: { ...inst, aerotermia_cal: { ...aero, scop_temporada: season } } },
        };
        (coincideScop(fila) ? cambios : dudosos).push(fila);
    }

    // ── OPORTUNIDADES ────────────────────────────────────────────────────────
    let qOp = supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo');
    if (soloOp) qOp = qOp.eq('id_oportunidad', soloOp);
    const { data: oportunidades, error: eOp } = await qOp;
    if (eOp) throw eOp;

    for (const o of oportunidades) {
        const dc = o.datos_calculo || {};
        const inputs = dc.inputs || {};
        if (!inputs.hibridacion) continue;                   // la temporada solo pesa en el C_b
        if (inputs.scopTemporada) continue;                  // ya sellada
        const modelo = porId.get(String(inputs.aerothermiaModel ?? ''));
        if (!modelo) continue;
        const zona = inputs.zona || dc.zona;
        if (!zona) continue;

        const temp = tempDe(inputs.emitterType);
        const season = getScopSeason(modelo, zona, temp, 'ficha');
        const scopCatalogo = getScopFromModel(modelo, zona, temp, 'ficha');
        const fila = {
            tabla: 'oportunidades', id: o.id, ref: o.id_oportunidad, estado: dc.estado,
            equipo: `${modelo.marca} ${modelo.modelo_comercial || ''}`.trim(),
            zona, temp, season, scopCatalogo, scopGuardado: inputs.scopHeating,
            patch: { datos_calculo: { ...dc, inputs: { ...inputs, scopTemporada: season } } },
        };
        (coincideScop(fila) ? cambios : dudosos).push(fila);
    }

    // ── Informe ──────────────────────────────────────────────────────────────
    if (!cambios.length) { console.log('Nada que sellar.'); return; }

    console.log(`${cambios.length} a sellar${EXECUTE ? '' : '  (EN SECO — nada se escribe)'}\n`);
    console.log('tabla         referencia        equipo                              zona  imp.  SCOP cat.  guardado  →');
    for (const c of cambios) {
        const coincide = c.scopGuardado != null && Math.abs(parseFloat(c.scopGuardado) - c.scopCatalogo) < 0.011;
        console.log(
            `${c.tabla.padEnd(13)} ${String(c.ref).padEnd(17)} ${c.equipo.slice(0, 35).padEnd(35)} ` +
            `${String(c.zona).padEnd(5)} ${String(c.temp).padEnd(5)} ` +
            `${String(c.scopCatalogo).padEnd(10)} ${String(c.scopGuardado ?? '—').padEnd(9)} ${c.season.toUpperCase()}` +
            // Si el SCOP guardado no es el que hoy da el catálogo, el sello describe
            // el equipo pero quizá no el número con el que se calculó: se avisa.
            (coincide ? '' : '   ⚠ el SCOP guardado no coincide con el del catálogo')
        );
    }

    const resumen = cambios.reduce((a, c) => ({ ...a, [c.season]: (a[c.season] || 0) + 1 }), {});
    console.log(`\nResumen: ${Object.entries(resumen).map(([k, v]) => `${v} ${k}`).join(' · ')}`);

    if (!EXECUTE) { console.log('\nRepite con --execute para escribirlo.'); return; }

    let ok = 0;
    for (const c of cambios) {
        const { error } = await supabase.from(c.tabla).update(c.patch).eq('id', c.id);
        if (error) { console.log(`  ✗ ${c.ref}: ${error.message}`); continue; }
        ok++;
    }
    console.log(`\n✅ ${ok}/${cambios.length} sellados.`);
})().catch(e => { console.error(e); process.exit(1); });
