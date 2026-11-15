/**
 * Expedientes en «¿Misma dirección que el cliente? → Sí» cuyo cliente vive en OTRA
 * casa (2026-10-20). Desde hoy, con «Sí» los documentos imprimen la ficha del
 * cliente (logic/direccionInstalacion.js); a éstos se les pasa a «No» conservando
 * EXACTAMENTE la dirección que imprimían (la de la instalación / el Catastro), para
 * que no empiecen a salir con el domicilio del cliente.
 *
 *   node implementation/backend/scripts/direccion_instalacion_otra_casa.mjs            # en seco
 *   node implementation/backend/scripts/direccion_instalacion_otra_casa.mjs --escribir
 *
 * Solo rellena HUECOS de `instalacion` (no pisa una dirección propia ya escrita).
 * ⚠️ Local escribe en la Supabase de PRODUCCIÓN. Un expediente abierto en pantalla
 * mientras corre puede devolver «Sí» con su autoguardado: que nadie lo tenga abierto.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');

const front = (p) => import(pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href);
const { buildInstalacionAddress } = await front('expedientes/utils/docGenerators.js');
const { usaDireccionCliente, mismaVivienda } = await front('expedientes/logic/direccionInstalacion.js');

const ESCRIBIR = process.argv.includes('--escribir');

// Solo escalares (regla 22): nada de `instalacion` ni `datos_calculo` enteros.
const INST = ['misma_direccion', 'direccion', 'num', 'codigo_postal', 'municipio', 'provincia', 'provincia_cod', 'ccaa'];
const { data: exps, error } = await supabase
    .from('expedientes')
    .select(`id, numero_expediente, estado, ${INST.map(k => `i_${k}:instalacion->>${k}`).join(', ')},
        clientes:clientes!cliente_id(direccion, codigo_postal, municipio, provincia, ccaa),
        oportunidades:oportunidades!oportunidad_id(ref_catastral, d_dir:datos_calculo->inputs->>direccion, d_mun:datos_calculo->inputs->>municipio,
            d_cp:datos_calculo->inputs->>codigo_postal, d_prov:datos_calculo->inputs->>provincia,
            d_dir2:datos_calculo->>direccion, d_addr:datos_calculo->>address, d_ccaa:datos_calculo->>ccaa, d_provn:datos_calculo->>provincia)`)
    .order('numero_expediente');
if (error) { console.error('Error leyendo expedientes:', error.message); process.exit(1); }

const candidatos = [];
for (const e of exps) {
    const inst = Object.fromEntries(INST.map(k => [k, e[`i_${k}`] ?? undefined]).filter(([, v]) => v !== undefined && v !== null));
    if (inst.misma_direccion === 'false') inst.misma_direccion = false;
    if (!usaDireccionCliente(inst)) continue;
    const cli = e.clientes || {};
    if (!String(cli.direccion || '').trim()) continue;
    const o = e.oportunidades || {};
    const exp = {
        instalacion: { ...inst, misma_direccion: false },   // = lo que imprimía hasta hoy, sin el cliente
        clientes: cli,
        oportunidades: { ref_catastral: o.ref_catastral, datos_calculo: {
            direccion: o.d_dir2, address: o.d_addr, ccaa: o.d_ccaa, provincia: o.d_provn,
            inputs: { direccion: o.d_dir, municipio: o.d_mun, codigo_postal: o.d_cp, provincia: o.d_prov },
        } },
    };
    const hoy = buildInstalacionAddress(exp);
    if (!hoy.calle) continue;   // imprimía ya la del cliente: no cambia nada
    if (mismaVivienda({ direccion: cli.direccion, municipio: cli.municipio }, { direccion: hoy.calle, municipio: hoy.municipio }) !== false) continue;
    candidatos.push({ e, inst, cli, hoy });
}

console.log(`${candidatos.length} expedientes en «Sí» cuyo cliente vive en otra casa:\n`);
for (const { e, cli, hoy } of candidatos) {
    console.log(`${e.numero_expediente.padEnd(14)} ${String(e.estado || '').padEnd(30)}`);
    console.log(`   imprime y seguirá imprimiendo: ${hoy.full}`);
    console.log(`   domicilio del cliente:         ${[cli.direccion, cli.municipio].filter(Boolean).join(' · ')}`);
}

if (!ESCRIBIR) console.log('\nEn seco: no se ha escrito nada. Con --escribir se pasan a «No».');

let ok = 0;
for (const { e, hoy } of (ESCRIBIR ? candidatos : [])) {
    const { data: fila, error: errL } = await supabase.from('expedientes').select('instalacion').eq('id', e.id).single();
    if (errL) { console.error(`${e.numero_expediente}: ${errL.message}`); continue; }
    const inst = fila.instalacion || {};
    const hueco = (k, v) => (String(inst[k] ?? '').trim() ? {} : (v ? { [k]: v } : {}));
    const nueva = {
        ...inst,
        misma_direccion: false,
        ...hueco('direccion', hoy.calle),
        ...hueco('codigo_postal', hoy.cp),
        ...hueco('municipio', hoy.municipio),
        ...hueco('provincia', hoy.provincia),
        ...hueco('provincia_cod', hoy.provinciaCod),
        ...hueco('ccaa', hoy.ccaa),
    };
    const { error: errU } = await supabase.from('expedientes').update({ instalacion: nueva }).eq('id', e.id);
    if (errU) { console.error(`${e.numero_expediente}: ${errU.message}`); continue; }
    const despues = buildInstalacionAddress({ ...exp0(e), instalacion: nueva });
    console.log(`✓ ${e.numero_expediente} → «No» · ${despues.full}`);
    ok++;
}
if (ESCRIBIR) console.log(`\n${ok} de ${candidatos.length} escritos.`);

function exp0(e) {
    const o = e.oportunidades || {};
    return { clientes: e.clientes, oportunidades: { ref_catastral: o.ref_catastral, datos_calculo: {
        direccion: o.d_dir2, address: o.d_addr, ccaa: o.d_ccaa, provincia: o.d_provn,
        inputs: { direccion: o.d_dir, municipio: o.d_mun, codigo_postal: o.d_cp, provincia: o.d_prov },
    } } };
}
