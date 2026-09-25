// Estancias de la vivienda para la tabla «RESUMEN DE CARGAS TÉRMICAS POR LOCAL Y
// ELEMENTO INSTALADO» de la Memoria RITE.
//
// La tabla salía siempre IGUAL —doce estancias fijas repartiendo la superficie con
// los mismos porcentajes—, así que una vivienda de 70 m² y dos dormitorios firmaba
// cuatro dormitorios y un vestidor. Ahora, antes de generar, un popup PROPONE las
// estancias por planta y se añaden o quitan a mano.
//
// REGLA — esta es la FUENTE ÚNICA del nombre, la orientación y los m² de cada
// estancia. Lo que se guarda en `documentacion.rite_locales` ya lleva todo eso
// resuelto, y el generador (rite-generator/lib/cargas_termicas.py) solo multiplica
// por el factor de la zona. Si el nombre o el reparto se decidieran también allí,
// la pantalla enseñaría una tabla y el documento llevaría otra.
//
// REGLA — la propuesta NO sale de `cee.num_rooms`: la app lo rellena con 4 por
// defecto, así que no dice cuántos dormitorios tiene la casa. Sale del tamaño de la
// vivienda y SIEMPRE se enseña para confirmarla.
//
// Puro (sin React): se prueba desde Node.

// peso = parte relativa de la superficie; se normaliza entre las estancias que haya.
export const TIPOS_LOCAL = [
    { id: 'salon',        label: 'Salón-comedor',        nombre: 'SALON-COMEDOR',     peso: 0.200, orient: 'S' },
    { id: 'cocina',       label: 'Cocina',               nombre: 'COCINA',            peso: 0.100, orient: 'E' },
    { id: 'dormitorio',   label: 'Dormitorio',           nombre: 'DORMITORIO',        peso: 0.090, orient: 'O' },
    { id: 'bano',         label: 'Baño',                 nombre: 'BAÑO',              peso: 0.040, orient: 'N' },
    { id: 'aseo',         label: 'Aseo',                 nombre: 'ASEO',              peso: 0.025, orient: 'N' },
    { id: 'recibidor',    label: 'Recibidor / hall',     nombre: 'HALL-RECIBIDOR',    peso: 0.040, orient: '-' },
    { id: 'distribuidor', label: 'Distribuidor',         nombre: 'DISTRIBUIDOR',      peso: 0.060, orient: '-' },
    { id: 'despacho',     label: 'Despacho / estudio',   nombre: 'DESPACHO',          peso: 0.070, orient: 'E' },
    { id: 'vestidor',     label: 'Vestidor',             nombre: 'VESTIDOR',          peso: 0.040, orient: '-' },
    { id: 'lavadero',     label: 'Lavadero',             nombre: 'LAVADERO',          peso: 0.030, orient: 'N' },
];
const POR_ID = Object.fromEntries(TIPOS_LOCAL.map(t => [t.id, t]));

// La tabla de la plantilla oficial de la JCCM tiene 25 filas: una estancia más no
// cabría en el documento y se perdería sin decirlo.
export const MAX_LOCALES = 25;

// Orientaciones con las que se van alternando las piezas habitables repetidas
// (dos dormitorios con la misma fachada no es lo normal).
const ROTACION = ['S', 'E', 'O', 'N'];

// Lo guardado puede venir en MAYÚSCULAS si alguna vez pasó por normalizeData.
const tipoDe = (l) => POR_ID[String(l?.tipo || '').toLowerCase()] || null;

export function etiquetaPlanta(planta) {
    const n = parseInt(planta, 10);
    if (!Number.isFinite(n) || n === 0) return 'Planta baja';
    if (n < 0) return `Sótano ${-n}`;
    return `Planta ${n}ª`;
}

const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

// Cuántas estancias de cada clase se proponen, según el tamaño de la vivienda.
function composicion(sup) {
    const s = num(sup) || 90;
    return {
        dormitorios: s < 60 ? 1 : s < 85 ? 2 : s < 130 ? 3 : 4,
        banos: s < 100 ? 1 : 2,
    };
}

/**
 * Propuesta de partida: `{ plantas: [{ planta:'0', locales:[{tipo}] }] }`.
 * Con una planta, todo abajo. Con dos, la zona de día abajo (salón, cocina,
 * recibidor y aseo) y los dormitorios y baños arriba — dejando un dormitorio
 * abajo cuando hay cuatro o más. Con más plantas, los dormitorios y baños se
 * reparten entre las de arriba, cada una con su distribuidor.
 */
export function proponerLocales({ superficie, plantas } = {}) {
    const nPlantas = Math.max(1, Math.min(4, parseInt(plantas, 10) || 1));
    const { dormitorios, banos } = composicion(superficie);
    const L = (tipo) => ({ tipo });
    const rep = (tipo, n) => Array.from({ length: n }, () => L(tipo));

    if (nPlantas === 1) {
        const aseo = (num(superficie) || 0) >= 110 ? 1 : 0;
        return {
            plantas: [{
                planta: '0',
                locales: [
                    L('salon'), L('cocina'), L('recibidor'), L('distribuidor'),
                    ...rep('dormitorio', dormitorios), ...rep('bano', banos), ...rep('aseo', aseo),
                ],
            }],
        };
    }

    const abajoDorm = dormitorios >= 4 ? 1 : 0;
    const baja = {
        planta: '0',
        locales: [L('salon'), L('cocina'), L('recibidor'), L('aseo'), ...rep('dormitorio', abajoDorm)],
    };
    const arriba = Array.from({ length: nPlantas - 1 }, (_, i) => ({
        planta: String(i + 1), locales: [L('distribuidor')],
    }));
    for (let i = 0; i < dormitorios - abajoDorm; i++) arriba[i % arriba.length].locales.push(L('dormitorio'));
    for (let i = 0; i < banos; i++) arriba[i % arriba.length].locales.push(L('bano'));
    return { plantas: [baja, ...arriba] };
}

/**
 * Pone NOMBRE, ORIENTACIÓN y m² a cada estancia. Los m² tecleados a mano
 * (`manual`) se respetan; el resto de la superficie se reparte entre las demás
 * por su peso, en enteros, y la última absorbe el redondeo.
 *
 * Devuelve `{ plantas, total, asignado, avisos }` sin mutar la entrada.
 */
export function resolverLocales(estado, superficie) {
    const sup = Math.max(0, num(superficie) || 0);
    const avisos = [];
    const plantas = (estado?.plantas || []).map(p => ({
        planta: String(p.planta ?? '0'),
        locales: (p.locales || []).filter(l => tipoDe(l)).map(l => ({
            tipo: tipoDe(l).id,
            manual: !!l.manual,
            m2: l.manual ? Math.max(0, num(l.m2) || 0) : null,
        })),
    }));
    const todos = plantas.flatMap(p => p.locales);

    // ── Nombre: se numera solo lo que se repite en la casa (DORMITORIO 1, 2…).
    const cuenta = {};
    todos.forEach(l => { cuenta[l.tipo] = (cuenta[l.tipo] || 0) + 1; });
    const visto = {};
    const girado = {};
    todos.forEach(l => {
        const t = POR_ID[l.tipo];
        visto[l.tipo] = (visto[l.tipo] || 0) + 1;
        l.nombre = cuenta[l.tipo] > 1 ? `${t.nombre} ${visto[l.tipo]}` : t.nombre;
        if (t.orient === '-' || t.orient === 'N') {
            l.orientacion = t.orient;
        } else {
            const k = girado[l.tipo] || 0;
            girado[l.tipo] = k + 1;
            const base = ROTACION.indexOf(t.orient);
            l.orientacion = ROTACION[(base + k) % ROTACION.length];
        }
    });

    // ── m²: primero lo tecleado; lo que queda, por peso.
    const fijo = todos.filter(l => l.manual).reduce((s, l) => s + l.m2, 0);
    const auto = todos.filter(l => !l.manual);
    const resto = Math.round(sup - fijo);
    if (sup && fijo > sup + 0.5) {
        avisos.push(`Las superficies escritas a mano suman ${fmt(fijo)} m², más que la vivienda (${fmt(sup)} m²).`);
    }
    const pesoTotal = auto.reduce((s, l) => s + POR_ID[l.tipo].peso, 0);
    let acc = 0;
    auto.forEach((l, i) => {
        if (resto <= 0 || !pesoTotal) { l.m2 = 0; return; }
        if (i === auto.length - 1) { l.m2 = Math.max(0, resto - acc); return; }
        l.m2 = Math.round(resto * POR_ID[l.tipo].peso / pesoTotal);
        acc += l.m2;
    });

    if (todos.length > MAX_LOCALES) {
        avisos.push(`La tabla de la memoria admite ${MAX_LOCALES} estancias y hay ${todos.length}.`);
    }
    if (!todos.length) avisos.push('No hay ninguna estancia.');

    const asignado = todos.reduce((s, l) => s + (l.m2 || 0), 0);
    return { plantas, total: sup, asignado, avisos };
}

// Lo que se guarda en `documentacion.rite_locales` (y lee el generador).
export function paraGuardar(resuelto) {
    return {
        superficie: resuelto.total,
        plantas: resuelto.plantas.map(p => ({
            planta: p.planta,
            locales: p.locales.map(l => ({
                tipo: l.tipo, nombre: l.nombre, orientacion: l.orientacion,
                m2: l.m2, manual: l.manual,
            })),
        })),
    };
}

/**
 * Estado con el que se abre el popup: lo guardado si lo hay (con sus m² manuales),
 * y si no la propuesta. Los m² automáticos se recalculan siempre con la superficie
 * de hoy, por si ha cambiado desde la última vez.
 */
export function estadoInicial({ guardado, superficie, plantas }) {
    const g = guardado?.plantas;
    if (Array.isArray(g) && g.some(p => (p.locales || []).length)) {
        return {
            plantas: g.map(p => ({
                planta: String(p.planta ?? '0'),
                locales: (p.locales || []).filter(l => tipoDe(l)).map(l => ({
                    tipo: tipoDe(l).id, manual: !!l.manual, m2: l.manual ? num(l.m2) : null,
                })),
            })),
        };
    }
    return proponerLocales({ superficie, plantas });
}

// ── Operaciones del popup (devuelven estado nuevo) ─────────────────────────────

export function contar(planta, tipo) {
    return (planta?.locales || []).filter(l => l.tipo === tipo).length;
}

export function sumarLocal(estado, iPlanta, tipo) {
    return {
        plantas: estado.plantas.map((p, i) => i !== iPlanta ? p
            : { ...p, locales: [...p.locales, { tipo, manual: false, m2: null }] }),
    };
}

// Quita la ÚLTIMA estancia de ese tipo de la planta.
export function restarLocal(estado, iPlanta, tipo) {
    return {
        plantas: estado.plantas.map((p, i) => {
            if (i !== iPlanta) return p;
            const idx = p.locales.map(l => l.tipo).lastIndexOf(tipo);
            if (idx < 0) return p;
            return { ...p, locales: p.locales.filter((_, j) => j !== idx) };
        }),
    };
}

// `m2` vacío o null devuelve la estancia al reparto automático.
export function fijarM2(estado, iPlanta, iLocal, m2) {
    const v = num(m2);
    return {
        plantas: estado.plantas.map((p, i) => i !== iPlanta ? p : {
            ...p,
            locales: p.locales.map((l, j) => j !== iLocal ? l
                : (v == null ? { ...l, manual: false, m2: null } : { ...l, manual: true, m2: v })),
        }),
    };
}

export function anadirPlanta(estado) {
    const usadas = estado.plantas.map(p => parseInt(p.planta, 10)).filter(Number.isFinite);
    const sig = usadas.length ? Math.max(...usadas) + 1 : 0;
    return { plantas: [...estado.plantas, { planta: String(sig), locales: [] }] };
}

export function quitarPlanta(estado, iPlanta) {
    return { plantas: estado.plantas.filter((_, i) => i !== iPlanta) };
}

function fmt(n) {
    return (Math.round(n * 10) / 10).toLocaleString('es-ES');
}
