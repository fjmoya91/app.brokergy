/**
 * Quién firma el CIFO cuando la actuación tiene DOS empresas.
 *
 * El certificado ya no dice en el papel quién lo firma —su recuadro va en blanco,
 * porque unas veces lo firma la empresa instaladora y otras el técnico habilitado—,
 * así que lo elige quien envía. Esto vigila las dos mitades de esa elección:
 *
 *   · las OPCIONES y el defecto (`opcionesFirmanteCifo` / `firmanteCifoRol`);
 *   · los DESTINATARIOS, que traen los contactos de las DOS empresas rotulados y
 *     marcan los de quien firma (`contactosDeLaActuacion` /
 *     `defaultContactIdsActuacion`).
 *
 * Lo que más importa vigilar: que SIN delegación nada cambie. Ese es el caso de
 * casi todos los expedientes, y el popup tiene que comportarse exactamente como
 * antes —sin selector, sin prefijos en los ids y con los contactos de siempre—.
 *
 *   node implementation/backend/scripts/test_firmante_cifo.mjs
 */
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => pathToFileURL(path.join(__dirname, '../../frontend/src', p)).href;

const { empresasActuacion } = await import(front('features/expedientes/utils/docGenerators.js'));
const { opcionesFirmanteCifo, firmanteCifoRol } = await import(front('features/expedientes/logic/instaladorPendientes.js'));
const { contactosDeLaActuacion, defaultContactIdsActuacion, instaladorContacts } =
    await import(front('features/expedientes/utils/docContacts.js'));

let fallos = 0;
const ok = (cond, txt, extra = '') => {
    if (cond) { console.log(`   ✓ ${txt}`); return; }
    fallos++; console.log(`   ✗ ${txt}${extra ? ` → ${extra}` : ''}`);
};

// ── Las dos fichas reales (26RES060_113) ────────────────────────────────────
const EJECUTORA = {
    id_empresa: 'mig-1', razon_social: 'CALEFACCIONES MIGUEL GONZALEZ, S.L.U.',
    acronimo: null, cif: 'B13313051', tlf: '661236158', email: 'tienda@ejemplo.es',
    tiene_carnet_rite: false, es_autonomo: false,
    nombre_responsable: 'MIGUEL', apellidos_responsable: 'GONZÁLEZ', nif_responsable: '05123456Z',
};
const HABILITADA = {
    id_empresa: 'isi-1', razon_social: 'ISIDRO CARRASCOSA VELASCO',
    cif: '05636766H', tlf: '926631972', es_autonomo: true,
    tiene_carnet_rite: true, numero_carnet_rite: '08-B-D20-13015402',
    nombre_responsable: 'ISIDRO', apellidos_responsable: 'CARRASCOSA VELASCO', nif_responsable: '05636766H',
    tecnico_firmante_distinto: true, tecnico_firmante_carnet_rite: '130300945',
};

const conDelegacion = { prescriptores: EJECUTORA, prescriptores_firmante: HABILITADA };
const sinDelegacion = { prescriptores: { ...EJECUTORA, tiene_carnet_rite: true, numero_carnet_rite: '08-B-D20-99999999' } };

console.log('\n1) SIN delegación: el popup no cambia en nada');
{
    const emp = empresasActuacion(sinDelegacion);
    ok(emp.delegado === false, 'no hay dos empresas');
    ok(opcionesFirmanteCifo(emp).length === 0, 'no se ofrece elegir firmante');
    ok(firmanteCifoRol(emp, null) === null, 'no hay rol que sellar');
    const ctos = contactosDeLaActuacion(emp);
    const antes = instaladorContacts(sinDelegacion.prescriptores);
    ok(JSON.stringify(ctos) === JSON.stringify(antes), 'los contactos son EXACTAMENTE los de siempre');
    ok(ctos.every(c => !c.id.includes(':')), 'sin prefijos en los ids', ctos.map(c => c.id).join(','));
    ok(ctos.every(c => !c.empresa), 'sin rótulo de empresa');
}

console.log('\n2) CON delegación: se puede elegir, y el defecto no se mueve');
{
    const emp = empresasActuacion(conDelegacion);
    ok(emp.delegado === true, 'la app ve las dos empresas');
    const ops = opcionesFirmanteCifo(emp);
    ok(ops.length === 2, 'se ofrecen las dos');
    ok(ops[0].rol === 'ejecutora' && ops[0].empresa === 'CALEFACCIONES MIGUEL GONZALEZ, S.L.U.',
        'la primera es quien ejecuta y factura', ops[0]?.empresa);
    ok(ops[0].nif === 'B13313051', 'con SU NIF, no el del firmante', ops[0]?.nif);
    ok(ops[1].rol === 'habilitada' && ops[1].empresa === 'ISIDRO CARRASCOSA VELASCO',
        'la segunda es la habilitada ante Industria');
    ok(firmanteCifoRol(emp, null) === 'habilitada',
        'sin nada sellado firma la HABILITADA (lo que la app venía haciendo)');
    ok(firmanteCifoRol(emp, 'ejecutora') === 'ejecutora', 'se respeta lo sellado');
    ok(firmanteCifoRol(emp, 'cualquier-cosa') === 'habilitada',
        'un rol que no existe cae al defecto, no rompe el popup');
}

console.log('\n3) Los destinatarios traen LAS DOS, y cada uno dice de quién es');
{
    const emp = empresasActuacion(conDelegacion);
    const ctos = contactosDeLaActuacion(emp);
    ok(ctos.length >= 2, 'salen contactos de las dos empresas', String(ctos.length));
    ok(ctos.some(c => c.firmanteRol === 'ejecutora') && ctos.some(c => c.firmanteRol === 'habilitada'),
        'los hay de cada una');
    ok(new Set(ctos.map(c => c.id)).size === ctos.length,
        'ningún id repetido (los de `instaladorContacts` se repiten entre fichas)',
        ctos.map(c => c.id).join(','));
    ok(ctos.every(c => c.empresa), 'todos rotulados con su empresa');
    const dosEmpresas = new Set(ctos.map(c => c.empresa));
    ok(dosEmpresas.size === 2, 'dos rótulos distintos', [...dosEmpresas].join(' | '));
}

console.log('\n4) Se marcan los de QUIEN FIRMA');
{
    const emp = empresasActuacion(conDelegacion);
    const ctos = contactosDeLaActuacion(emp);
    for (const rol of ['ejecutora', 'habilitada']) {
        const ids = defaultContactIdsActuacion(emp, rol, 'tecnico');
        ok(ids.length > 0, `${rol}: se marca alguien`);
        ok(ids.every(id => id.startsWith(`${rol}:`)), `${rol}: solo los suyos`, ids.join(','));
        ok(ids.every(id => ctos.some(c => c.id === id)),
            `${rol}: los ids marcados EXISTEN en la lista que se pinta`, ids.join(','));
    }
    const eje = defaultContactIdsActuacion(emp, 'ejecutora', 'tecnico');
    const hab = defaultContactIdsActuacion(emp, 'habilitada', 'tecnico');
    ok(eje.join() !== hab.join(), 'cambiar de firmante cambia a quién se le manda');
    // El teléfono es lo que de verdad viaja: son dos números distintos.
    const tel = (ids) => ids.map(id => (ctos.find(c => c.id === id) || {}).phone).join(',');
    ok(tel(eje) === '661236158', 'al elegir la ejecutora se marca SU teléfono', tel(eje));
    ok(tel(hab) === '926631972', 'al elegir la habilitada, el suyo', tel(hab));
}

console.log(fallos ? `\n❌ ${fallos} fallo(s)\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
