// ¿La Memoria RITE declara ACS? Comprueba que el backend (`acsEnAlcanceRite`) y el
// generador (`_acs_en_alcance` de rite-generator) dicen lo MISMO, caso a caso.
// Caso real: 26RES080_41 (cambio_acs vacío + bomba de calor de ACS) salía SIN ACS.
//   node implementation/backend/scripts/test_acs_alcance_rite.js
const path = require('path');
const { execFileSync } = require('child_process');
const { acsEnAlcanceRite } = require('../utils/riteValidation');

const BDC = { marca: 'MUNDOCLIMA', modelo: 'MUACS-190-H14', aerotermia_db_id: 582 };
const CASOS = [
    ['vacío + bomba de calor de ACS (26RES080_41)', { cambio_acs: null, aerotermia_acs: BDC }, true],
    ['sin la clave + bomba de calor de ACS', { aerotermia_acs: BDC }, true],
    ['vacío y sin equipo de ACS (migrados)', { cambio_acs: null }, false],
    ['vacío, nodo de ACS vacío', { cambio_acs: null, aerotermia_acs: { marca: '', modelo: '' } }, false],
    ['true', { cambio_acs: true, aerotermia_acs: BDC }, true],
    ['true sin equipo', { cambio_acs: true }, true],
    ['false con equipo declarado', { cambio_acs: false, aerotermia_acs: BDC }, false],
    ["'SI' (normalizeData)", { cambio_acs: 'SI' }, true],
    ["'NO'", { cambio_acs: 'NO', aerotermia_acs: BDC }, false],
    ["'' con equipo", { cambio_acs: '', aerotermia_acs: BDC }, true],
    ['solo la ficha del catálogo', { cambio_acs: null, aerotermia_acs: { aerotermia_db_id: 12 } }, true],
];

const py = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', '..', 'rite-generator').replace(/\\/g, '/'))})
from lib.supabase_client import _acs_en_alcance
print(json.dumps([_acs_en_alcance(c) for c in json.loads(sys.stdin.read())]))
`;
let pyRes;
try {
    pyRes = JSON.parse(execFileSync('python', ['-c', py], { input: JSON.stringify(CASOS.map(c => c[1])), encoding: 'utf8' }));
} catch (e) { console.error('No se pudo ejecutar el generador en Python:', e.message); process.exit(1); }

let fallos = 0;
CASOS.forEach(([nombre, inst, esperado], i) => {
    const js = acsEnAlcanceRite(inst), p = pyRes[i];
    const ok = js === esperado && p === esperado;
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✗'} ${nombre}: esperado ${esperado} · backend ${js} · generador ${p}`);
});
// Litros deducidos del NOMBRE del modelo (sin campo de litros): solo lo que parece un volumen.
const LITROS = [
    ['TRADETERMIA ACS 110', '110'], ['BOMBA CALOR ACS EXOMAXI VA 200', '200'],
    ['Aquarea High Performance All in One 185L Bizona 9 kW (WH-ADC0309K3E5B + WH-UDZ09KE5)', '185'],
    ['AQUAREA SERIE M R290 ALL IN ONE', ''], ['CONFORT 12', ''], ['ALFEA EXTENSA AI 16', ''],
    ['AUREA DUO 8 55', ''], ['ecoAIR+ 3-12 PRO con Radiadores y/o fancoils', ''],
    ['WH-ADC0309K3E5B', ''], ['GENIA AIR MAX 15', ''], ['Termo 80 litros', '80'],
    ['MANANTIAL150RPLUSB', '150'], ['HP200M7-F9', '200'], ['HTW-AT-V160MR290A', '160'],
    ['RSJ-15/190RDN3-F1 (ACS 190 L)', '190'], ['EPGA16DAV37 + EAVX16S18DJ6V7', ''],
    ['IXCR-HL1008BARS', ''], ['AEROMAX VM R290 100L', '100'], ['30AWH 10M', ''],
];
const pyL = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(__dirname, '..', '..', 'rite-generator').replace(/\\/g, '/'))})
from lib.supabase_client import _acumulacion
print(json.dumps([_acumulacion({"modelo": m}) for m in json.loads(sys.stdin.read())]))
`;
const resL = JSON.parse(execFileSync('python', ['-c', pyL], { input: JSON.stringify(LITROS.map(c => c[0])), encoding: 'utf8' }));
LITROS.forEach(([modelo, esperado], i) => {
    const ok = resL[i] === esperado;
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✗'} litros de «${modelo}»: esperado «${esperado}» · generador «${resL[i]}»`);
});

console.log(fallos ? `\n${fallos} FALLO(S)` : `\nOK: ${CASOS.length} casos de alcance (backend = generador) y ${LITROS.length} de litros.`);
process.exit(fallos ? 1 : 0);
