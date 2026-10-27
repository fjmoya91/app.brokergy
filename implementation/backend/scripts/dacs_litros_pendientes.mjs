// ============================================================================
// dacs_litros_pendientes.mjs — pone la D_ACS de los expedientes EN MARCHA al
// criterio de los LITROS/DÍA que declara el certificado (modo 'litros'), no de
// su demanda por m² ni de los dormitorios:
//   · 19/10/2026 (verificadores): los que tienen las demandas de ACS del CEE
//     inicial y del final DISTINTAS;
//   · 27/10/2026 (Fran: «siempre con litros día del CEE»): TODOS los que aún no
//     tienen el CIFO generado ni enviado al instalador, aunque coincidan.
//
//   node implementation/backend/scripts/dacs_litros_pendientes.mjs              (en seco)
//   node implementation/backend/scripts/dacs_litros_pendientes.mjs --escribir
//   node implementation/backend/scripts/dacs_litros_pendientes.mjs --escribir --solo 26RES060_144,26RES060_153
//
// EN SECO POR DEFECTO: local escribe en la Supabase de PRODUCCIÓN.
//
// Qué hace, por expediente (los RES080 no: su ahorro no usa la D_ACS del Anejo F):
//   1. RELLENA `cee_{fase}.acsLitrosDia` desde el `.xml` crudo cuando el lector
//      no lo guardó (los cargados antes de que lo leyera). Es un dato del propio
//      certificado y no mueve ninguna cifra en 'xml' ni en 'cte'; se hace en
//      TODOS para que los listados (que no traen el `.xml`) lo tengan.
//   2. En los PENDIENTES —sin llegar al verificador: estado anterior a
//      «ENVIADO A VERIFICADOR» y no rechazado— con el ACS en alcance, pasa a
//      'litros' con los del certificado (`ajusteAcsLitros`, la MISMA función que
//      se aplica al cargar un CEE): sin CIFO generado ni enviado
//      (`documentoAcsHecho`), siempre; con él, solo si las dos demandas difieren,
//      y se listan: su CIFO, su Anexo I y su Convenio hay que regenerarlos y
//      volver a firmarlos.
//   Lo demás (con el verificador o ya cerrado) solo se LISTA: no se toca.
// ============================================================================
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const { ORDEN_ESTADOS } = require('../utils/expedienteEstados');

const F = '../../frontend/src/features/expedientes/logic';
const { ajusteAcsLitros, documentoAcsHecho, baseAcs, litrosDeXmlTexto, dacsLitros, resolveDacs, ACS_METHOD } = await import(`${F}/demandaAcs.js`);
const { ceeBaseDocumento } = await import(`${F}/ceeFases.js`);

const ESCRIBIR = process.argv.includes('--escribir');
const iSolo = process.argv.indexOf('--solo');
const SOLO = iSolo > 0 ? new Set(String(process.argv[iSolo + 1] || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)) : null;

const RANGO_VERIFICADOR = ORDEN_ESTADOS.indexOf('ENVIADO A VERIFICADOR');
const pendiente = (estado) => {
    const i = ORDEN_ESTADOS.indexOf(estado);
    return i >= 0 && i < RANGO_VERIFICADOR;
};
const f2 = (v) => Number(v || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function setCee(id, campo, valor) {
    const { error } = await supabase.rpc('set_expediente_cee_field', { p_expediente_id: id, p_field: campo, p_value: valor });
    if (error) throw new Error(`${campo}: ${error.message}`);
}

// Campos CONCRETOS del JSONB: `cee` entero trae los dos `.xml` crudos (regla 22).
const { data, error } = await supabase
    .from('expedientes')
    .select('id, numero_expediente, estado, lote_id, cee->cee_inicial, cee->cee_final, cee->acs_method,'
        + ' cee->dacs_litros_dia, cee->num_rooms, cee->dacs_manual, cee->is_reforma,'
        + ' instalacion->cambio_acs, documentacion->cert_cifo_signed_link, documentacion->cert_cifo_drive_link,'
        + ' documentacion->cert_cifo_sent_at, documentacion->anexo_i_drive_link, documentacion->anexo_i_signed_link');
if (error) { console.error('No se pudieron leer los expedientes:', error.message); process.exit(1); }

const rellenos = [];   // acsLitrosDia sacado del .xml
const cambian = [];    // pasan a 'litros'
const fuera = [];      // demandas distintas pero ya con el verificador / cerrados
const sinLitros = [];  // demandas distintas y ningún litros/día que leer

for (const e of data || []) {
    const n = e.numero_expediente || '';
    if (/RES080|CEE/i.test(n) || e.is_reforma) continue;
    if (SOLO && !SOLO.has(n.toUpperCase())) continue;

    const cee = {
        cee_inicial: e.cee_inicial, cee_final: e.cee_final, acs_method: e.acs_method,
        dacs_litros_dia: e.dacs_litros_dia, num_rooms: e.num_rooms, dacs_manual: e.dacs_manual,
    };

    // 1. Los litros/día que el lector no guardó: del .xml crudo, uno a uno.
    for (const fase of ['inicial', 'final']) {
        const obj = cee[`cee_${fase}`];
        if (!obj || typeof obj !== 'object' || parseFloat(obj.acsLitrosDia) > 0) continue;
        const { data: x } = await supabase.from('expedientes')
            .select(`xml:cee->>xml_${fase}`).eq('id', e.id).single();
        const litros = litrosDeXmlTexto(x?.xml);
        if (!(litros > 0)) continue;
        cee[`cee_${fase}`] = { ...obj, acsLitrosDia: litros };
        rellenos.push({ id: e.id, n, fase, litros, obj: cee[`cee_${fase}`] });
    }

    const acs = baseAcs(cee, {});
    const hecho = documentoAcsHecho(e);
    if (hecho && !acs.difiere) continue;
    if (!cee.cee_inicial && !cee.cee_final) continue;   // sin CEE: ya enseña lo simulado
    const alcance = String(e.cambio_acs) !== 'false';
    if (!alcance) continue;   // el ACS no entra en su documento («no aplica», regla 12.b)

    const antes = resolveDacs(cee, ceeBaseDocumento(cee).base).value;
    const ajuste = ajusteAcsLitros(cee, { documentoHecho: hecho });
    const fila = {
        id: e.id, n, estado: e.estado, modo: cee.acs_method || 'xml', ini: acs.porM2Ini, fin: acs.porM2Fin,
        hecho, firmado: !!e.cert_cifo_signed_link, loteado: !!e.lote_id, antes, ajuste,
    };
    if (!ajuste) {
        if ((cee.acs_method || 'xml') !== ACS_METHOD.LITROS && (cee.acs_method || 'xml') !== ACS_METHOD.MANUAL) sinLitros.push(fila);
        continue;
    }
    fila.despues = dacsLitros({ ...cee, ...ajuste });
    fila.litros = ajuste.dacs_litros_dia;
    (pendiente(e.estado) ? cambian : fuera).push(fila);
}

console.log(`\n${ESCRIBIR ? 'ESCRIBIENDO' : 'EN SECO (nada se escribe; --escribir para hacerlo)'}\n`);

console.log(`1. litros/día rellenados desde el .xml: ${rellenos.length}`);
for (const r of rellenos) console.log(`   ${r.n.padEnd(14)} ${r.fase.padEnd(7)} ${r.litros} l/día`);

console.log(`\n2. PENDIENTES que pasan a L/D: ${cambian.length}`
    + ` (${cambian.filter(c => !c.hecho).length} sin CIFO generado ni enviado · ${cambian.filter(c => c.hecho).length} con CIFO y demandas distintas)`);
for (const c of cambian) {
    console.log(`   ${c.n.padEnd(14)} ${String(c.estado).padEnd(30)} ${c.modo.toUpperCase().padEnd(4)} `
        + `ACS ${f2(c.ini)} → ${f2(c.fin)} kWh/m²·año · ${c.litros} l/día · D_ACS ${f2(c.antes)} → ${f2(c.despues)} kWh/año`
        + `${c.hecho ? (c.firmado ? '  ⚠ CIFO FIRMADO: regenerar y volver a firmar' : '  ⚠ CIFO GENERADO/ENVIADO: regenerar') : ''}`
        + `${c.loteado ? '  (en lote)' : ''}`);
}

console.log(`\n3. Con el verificador o cerrados (NO se tocan): ${fuera.length}`);
for (const c of fuera) {
    console.log(`   ${c.n.padEnd(14)} ${String(c.estado).padEnd(30)} D_ACS ${f2(c.antes)} → ${f2(c.despues)} con ${c.litros} l/día`);
}

console.log(`\n4. Por pasar a L/D y SIN litros/día que leer (falta el .xml): ${sinLitros.length}`);
for (const c of sinLitros) console.log(`   ${c.n.padEnd(14)} ${c.estado}`);

if (ESCRIBIR) {
    for (const r of rellenos) await setCee(r.id, `cee_${r.fase}`, r.obj);
    for (const c of cambian) {
        for (const [k, v] of Object.entries(c.ajuste)) await setCee(c.id, k, v);
    }
    console.log(`\n✓ Escrito: ${rellenos.length} litros/día rellenados, ${cambian.length} expedientes a L/D.`);
}
