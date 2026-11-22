// ─── presupuesto.js — el PRESUPUESTO que el instalador hace para SU cliente ──────────────
// Lógica PURA (sin React ni Node): la usan la app (el formulario), el servidor
// (`services/presupuestoInstaladorService.js`, que la importa con `import()`) y el agente del
// grupo de WhatsApp. Aquí viven el TEXTO PREDEFINIDO de los conceptos y las CUENTAS, para que
// lo que se ve al teclear, lo que se guarda y lo que sale en el PDF sean lo mismo.
//
// 22/11/2026, Fran (beta RCA): «que el texto salga predefinido y si es necesario se pueda
// editar… tipo los conceptos que tenemos». La 1.ª línea lleva la MISMA redacción que el consejo
// de factura (`utils/consejoFactura.js`), sin nº de serie —en un presupuesto aún no existe—,
// para que la factura de después case con lo presupuestado. Los extras salen de los
// presupuestos reales de RCA (depósito de inercia, vasos, limpieza, grúa…).

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Como `num` de facturaInstaladorService: con coma, coma decimal; «6.000» son miles; «6000.5», decimal. */
export function leerNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const t = String(v).trim().replace(/\s|€/g, '');
    if (!t) return null;
    const norm = /,/.test(t) ? t.replace(/\./g, '').replace(',', '.')
        : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
    const n = Number(norm);
    return Number.isFinite(n) ? n : NaN;
}

/** 6300.5 → «6.300,50 €». */
export function eur(x, simbolo = true) {
    const [ent, dec] = Math.abs(r2(x)).toFixed(2).split('.');
    const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${x < 0 ? '-' : ''}${miles},${dec}${simbolo ? ' €' : ''}`;
}

const limpio = (v) => (v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim());
const MAYUS = (v) => limpio(v).toUpperCase();

// ── Qué obra es ───────────────────────────────────────────────────────────────────────

export const TIPOS_OBRA = [
    { clave: 'aerotermia', texto: 'Cambio de caldera por aerotermia' },
    { clave: 'acs', texto: 'Bomba de calor solo para agua caliente' },
    { clave: 'aire', texto: 'Aire acondicionado' },
    { clave: 'otro', texto: 'Otra obra' },
];

/** La caldera que se quita: `de` es como se dice en el concepto. `ninguna` = no sustituye nada. */
export const COMBUSTIBLES = [
    { clave: 'gasoleo', texto: 'Gasóleo', de: 'DE GASÓLEO' },
    { clave: 'gas', texto: 'Gas natural', de: 'DE GAS' },
    { clave: 'glp', texto: 'Propano o butano', de: 'DE GAS PROPANO' },
    { clave: 'electrica', texto: 'Eléctrica', de: 'ELÉCTRICA' },
    { clave: 'lena', texto: 'Leña', de: 'DE LEÑA' },
    { clave: 'pellets', texto: 'Pellets', de: 'DE PELLETS' },
    { clave: 'carbon', texto: 'Carbón', de: 'DE CARBÓN' },
    { clave: 'ninguna', texto: 'No hay caldera', de: '' },
];

export const EMISORES = [
    { clave: 'radiadores', texto: 'Radiadores', frase: 'LOS RADIADORES EXISTENTES' },
    { clave: 'suelo', texto: 'Suelo radiante', frase: 'EL SUELO RADIANTE EXISTENTE' },
    { clave: 'fancoils', texto: 'Fancoils', frase: 'LOS FANCOILS EXISTENTES' },
];

/**
 * Las líneas opcionales, en el orden en que salen. `litros` = lleva una cifra de litros editable.
 * `tipos` = en qué obras se ofrece (sin ella, en todas menos «otra»).
 */
export const EXTRAS = [
    { clave: 'deposito_inercia', etiqueta: 'Depósito de inercia', litros: 100, tipos: ['aerotermia'], texto: (l) => `DEPÓSITO DE INERCIA DE ${l} LITROS` },
    { clave: 'deposito_acs', etiqueta: 'Depósito de agua caliente', litros: 200, tipos: ['aerotermia'], texto: (l) => `DEPÓSITO INTERACUMULADOR DE AGUA CALIENTE SANITARIA DE ${l} LITROS` },
    { clave: 'bomba_impulsion', etiqueta: 'Bomba de impulsión', tipos: ['aerotermia'], texto: () => 'BOMBA DE IMPULSIÓN A RADIADORES' },
    { clave: 'vaso_calefaccion', etiqueta: 'Vaso de expansión (calefacción)', litros: 18, tipos: ['aerotermia'], texto: (l) => `VASO DE EXPANSIÓN DE ${l} LITROS PARA CALEFACCIÓN` },
    { clave: 'vaso_acs', etiqueta: 'Vaso de expansión (agua caliente)', litros: 8, tipos: ['aerotermia', 'acs'], texto: (l) => `VASO DE EXPANSIÓN DE ${l} LITROS PARA AGUA CALIENTE SANITARIA` },
    { clave: 'desfangador', etiqueta: 'Desfangador', tipos: ['aerotermia'], texto: () => 'DESFANGADOR MAGNÉTICO' },
    { clave: 'conexiones', etiqueta: 'Conexiones hidráulicas', tipos: ['aerotermia'], texto: () => 'CONEXIONES HIDRÁULICAS ENTRE EL DEPÓSITO, LA AEROTERMIA Y LOS RADIADORES' },
    { clave: 'limpieza', etiqueta: 'Limpieza del circuito', tipos: ['aerotermia'], texto: () => 'LIMPIEZA DEL CIRCUITO DE CALEFACCIÓN ANTES DE LA INSTALACIÓN' },
    { clave: 'llenado', etiqueta: 'Llenado y purgado', tipos: ['aerotermia'], texto: () => 'LLENADO Y PURGADO DE LA INSTALACIÓN' },
    { clave: 'termo', etiqueta: 'Termo eléctrico', litros: 100, tipos: ['aerotermia'], texto: (l) => `TERMO ELÉCTRICO DE ${l} LITROS PARA AGUA CALIENTE SANITARIA` },
    { clave: 'mando_wifi', etiqueta: 'Mando con wifi', tipos: ['aerotermia', 'aire'], texto: () => 'MANDO DE PARED CON CONTROL POR WIFI' },
    { clave: 'grua', etiqueta: 'Grúa', texto: () => 'GRÚA PARA SUBIR LA UNIDAD EXTERIOR A LA CUBIERTA' },
    { clave: 'retirada_caldera', etiqueta: 'Retirar la caldera vieja', tipos: ['aerotermia'], texto: () => 'DESMONTAJE Y RETIRADA DE LA CALDERA EXISTENTE' },
    { clave: 'retirada_equipo', etiqueta: 'Retirar el equipo viejo', tipos: ['acs', 'aire'], texto: () => 'DESMONTAJE Y RETIRADA DEL EQUIPO EXISTENTE' },
    { clave: 'legalizacion', etiqueta: 'Legalización (RITE)', texto: () => 'LEGALIZACIÓN DE LA INSTALACIÓN (CERTIFICADO RITE)' },
];

const FINAL = 'MATERIAL AUXILIAR, CONEXIONADO HIDRÁULICO Y ELÉCTRICO, PUESTA EN MARCHA Y PRUEBAS';

/** `aerotermia_acs` (como lo dice quien lo pide) = aerotermia que además da el agua caliente. */
export function tipoDe(obra) {
    const t = limpio(obra?.tipo).toLowerCase();
    if (t === 'aerotermia_acs') return 'aerotermia';
    return TIPOS_OBRA.some((x) => x.clave === t) ? t : 'aerotermia';
}
const conAcs = (obra) => obra?.acs === true || limpio(obra?.tipo).toLowerCase() === 'aerotermia_acs';

/** Los extras que se ofrecen en ese tipo de obra. */
export const extrasDe = (tipo) => (tipo === 'otro' ? [] : EXTRAS.filter((e) => !e.tipos || e.tipos.includes(tipo)));

/** Lo que va marcado al empezar: en una sustitución, retirar la caldera. */
export function extrasPorDefecto(obra) {
    const tipo = tipoDe(obra);
    if (tipo === 'aerotermia' && limpio(obra?.caldera?.combustible) !== 'ninguna') return [{ clave: 'retirada_caldera' }];
    return [];
}

function lineaExtra(x) {
    const def = EXTRAS.find((e) => e.clave === x?.clave);
    if (!def) return MAYUS(x?.texto);
    const l = Math.round(Number(x.litros)) > 0 ? Math.round(Number(x.litros)) : def.litros;
    return def.texto(l);
}

const kw = (v) => {
    const n = leerNum(v);
    return Number.isFinite(n) && n > 0 ? `${String(r2(n)).replace('.', ',')} KW` : '';
};

/** La línea del equipo, según la obra. */
function lineaEquipo(obra) {
    const tipo = tipoDe(obra);
    const eq = obra?.equipo || {};
    const marca = MAYUS(eq.marca);
    const modelo = MAYUS(eq.modelo);
    const quien = `${marca ? ` MARCA ${marca}` : ''}${modelo ? `${marca ? ',' : ''} MODELO ${modelo}` : ''}`;
    const pot = kw(eq.potencia_kw);
    if (tipo === 'acs') {
        const l = Math.round(Number(eq.litros)) > 0 ? `, DE ${Math.round(Number(eq.litros))} LITROS` : '';
        return `SUMINISTRO E INSTALACIÓN DE BOMBA DE CALOR PARA AGUA CALIENTE SANITARIA${quien}${l}`;
    }
    if (tipo === 'aire') {
        return `SUMINISTRO E INSTALACIÓN DE EQUIPO DE AIRE ACONDICIONADO CON BOMBA DE CALOR (AIRE-AIRE)${quien}${pot ? `, DE ${pot}` : ''}`;
    }
    const comb = COMBUSTIBLES.find((c) => c.clave === limpio(obra?.caldera?.combustible).toLowerCase());
    const sustituye = comb?.clave === 'ninguna' ? ''
        : `, EN SUSTITUCIÓN DE LA CALDERA ${comb?.de ? `${comb.de} ` : ''}EXISTENTE`;
    const emisor = EMISORES.find((e) => e.clave === limpio(obra?.emisor).toLowerCase()) || EMISORES[0];
    return `SUMINISTRO E INSTALACIÓN DE BOMBA DE CALOR AIRE-AGUA (AEROTERMIA)${quien}${pot ? `, DE ${pot}` : ''}`
        + `, PARA CALEFACCIÓN${conAcs(obra) ? ' Y AGUA CALIENTE SANITARIA' : ''}${sustituye}`
        + `, CONECTADA A ${emisor.frase} DE LA VIVIENDA`;
}

/**
 * El texto predefinido del presupuesto: el equipo, los extras marcados y el remate.
 * EN MAYÚSCULAS y sin punto final, como sus facturas. En «otra obra», lo que haya escrito.
 * @returns {string[]}
 */
export function conceptosDe(obra) {
    const tipo = tipoDe(obra);
    if (tipo === 'otro') {
        return String(obra?.descripcion || '').split(/\r?\n+/).map(MAYUS).filter(Boolean);
    }
    const pedidos = Array.isArray(obra?.extras) ? obra.extras.filter(Boolean) : [];
    // Cada extra, una vez y en el orden del catálogo (lo marque en el orden que lo marque);
    // detrás, lo que venga escrito a mano (`{ texto }`, sin clave del catálogo).
    const delCatalogo = EXTRAS
        .map((e) => pedidos.find((x) => x.clave === e.clave))
        .filter(Boolean).map(lineaExtra);
    const aMano = pedidos.filter((x) => !EXTRAS.some((e) => e.clave === x.clave)).map(lineaExtra).filter(Boolean);
    return [lineaEquipo(obra), ...new Set([...delCatalogo, ...aMano]), FINAL];
}

/** «Aerotermia Panasonic WH-WXG09ME5»: para los listados y los mensajes. */
export function resumenObra(obra) {
    const tipo = tipoDe(obra);
    const eq = obra?.equipo || {};
    const titulo = (s) => limpio(s).toLowerCase().replace(/(^|[\s-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase());
    const equipo = [titulo(eq.marca), MAYUS(eq.modelo)].filter(Boolean).join(' ');
    if (tipo === 'otro') {
        const d = limpio(obra?.descripcion);
        return d ? (d.length > 60 ? `${d.slice(0, 57)}…` : d) : 'Obra';
    }
    const que = tipo === 'acs' ? 'Agua caliente' : tipo === 'aire' ? 'Aire acondicionado' : 'Aerotermia';
    return equipo ? `${que} ${equipo}` : que;
}

// ── Las cuentas ───────────────────────────────────────────────────────────────────────

export const MAX_LINEAS = 14;
export const MAX_CONCEPTO = 700;

/**
 * Comprueba lo tecleado y calcula líneas y totales.
 *   `modo: 'total'` (lo normal): UN precio para toda la obra; va en la 1.ª línea con cantidad 1 y
 *   las demás salen sin importe (así presupuesta RCA). `modo: 'partidas'`: precio por línea.
 *   `con_iva: true`: el importe que se ha dicho ya lleva el IVA (se saca la base).
 * @returns {{ errores: string[], lineas: [{texto, cantidad, precio, importe}], modo, base, iva_pct, iva, total }}
 */
export function calcularPresupuesto({ conceptos, modo, total, partidas, iva_pct, con_iva } = {}) {
    const errores = [];
    const pct = Number.isFinite(leerNum(iva_pct)) && leerNum(iva_pct) >= 0 && leerNum(iva_pct) <= 21 ? leerNum(iva_pct) : 21;
    const sinIva = (x) => (con_iva ? r2(x / (1 + pct / 100)) : r2(x));
    const crudos = Array.isArray(conceptos) ? conceptos : [];
    if (crudos.length > MAX_LINEAS) errores.push(`Como mucho ${MAX_LINEAS} líneas.`);
    const filas = crudos.slice(0, MAX_LINEAS)
        .map((c, idx) => ({ texto: limpio(c), idx }))
        .filter((l) => l.texto);
    filas.forEach((l, i) => {
        if (l.texto.length > MAX_CONCEPTO) errores.push(`Línea ${i + 1}: el texto es demasiado largo (máximo ${MAX_CONCEPTO} caracteres).`);
    });
    if (!filas.length) errores.push('Escribe al menos una línea con lo que incluye el presupuesto.');

    const m = modo === 'partidas' ? 'partidas' : 'total';
    let lineas;
    let dicho = null; // el importe tal como se dijo, para que el total con IVA no baile un céntimo
    if (m === 'total') {
        const t = leerNum(total);
        if (Number.isNaN(t) || (t !== null && t < 0)) errores.push('El precio no es válido.');
        const ok = Number.isFinite(t) && t > 0;
        if (!ok) errores.push('Pon el precio de la obra.');
        if (ok) dicho = r2(t);
        lineas = filas.map((l, i) => (i === 0 && ok
            ? { texto: l.texto.slice(0, MAX_CONCEPTO), cantidad: 1, precio: sinIva(t), importe: sinIva(t) }
            : { texto: l.texto.slice(0, MAX_CONCEPTO), cantidad: null, precio: null, importe: 0 }));
    } else {
        const ent = Array.isArray(partidas) ? partidas : [];
        lineas = filas.map((l, i) => {
            const e = ent[l.idx] || {};
            const c = leerNum(e.cantidad);
            const p = leerNum(e.precio);
            if (Number.isNaN(c) || (c !== null && c <= 0)) errores.push(`Línea ${i + 1}: la cantidad no es válida.`);
            if (Number.isNaN(p) || (p !== null && p < 0)) errores.push(`Línea ${i + 1}: el precio no es válido.`);
            const ok = Number.isFinite(p) && p > 0;
            const cantidad = ok ? (Number.isFinite(c) && c > 0 ? c : 1) : null;
            const precio = ok ? sinIva(p) : null;
            return { texto: l.texto.slice(0, MAX_CONCEPTO), cantidad, precio, importe: ok ? r2(cantidad * precio) : 0 };
        });
        if (filas.length && !lineas.some((l) => l.importe > 0)) errores.push('Pon el precio de al menos una línea.');
    }
    const base = r2(lineas.reduce((s, l) => s + l.importe, 0));
    // round(base × pct) / 100, igual que la factura (regla del céntimo de facturaInstaladorService).
    let iva = Math.round(base * pct) / 100;
    let tot = r2(base + iva);
    if (con_iva && dicho !== null) { tot = dicho; iva = r2(tot - base); }
    return { errores: [...new Set(errores)], lineas, modo: m, base, iva_pct: pct, iva, total: tot };
}

// ── El número ─────────────────────────────────────────────────────────────────────────

/**
 * El siguiente nº de presupuesto. RCA numera «39/26»: de los de ESTE año, el mayor + 1.
 * Sin ninguno con esa forma, se sigue el último que haya (`ultimo`: «P-014» → «P-015») y,
 * si tampoco, «1/26».
 */
export function siguienteNumero(numeros, anio2, { ultimo = null } = {}) {
    const aa = String(anio2).slice(-2);
    let max = 0;
    for (const n of Array.isArray(numeros) ? numeros : []) {
        const m = /^\s*(\d{1,5})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(String(n ?? ''));
        if (m && m[2].slice(-2) === aa) max = Math.max(max, Number(m[1]));
    }
    if (max > 0) return `${max + 1}/${aa}`;
    const u = /^(.*?)(\d+)\s*$/.exec(limpio(ultimo));
    if (u && !/\/\d{2,4}$/.test(limpio(ultimo))) {
        return `${u[1]}${String(Number(u[2]) + 1).padStart(u[2].length, '0')}`;
    }
    return `1/${aa}`;
}

// ── El mensaje para el cliente ────────────────────────────────────────────────────────

/** «ANTONIO GONZÁLEZ CARRETERO» → «Antonio». */
export function nombreDePila(nombre) {
    const p = limpio(nombre).split(' ')[0] || '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

/**
 * El texto que el instalador REENVÍA a su cliente con el PDF. Lo firma él, no BROKERGY:
 * corto, de tú y sin emojis.
 */
export function mensajeParaCliente({ cliente, obra, total, emisor } = {}) {
    const pila = nombreDePila(cliente?.nombre);
    const tipo = tipoDe(obra);
    const de = tipo === 'acs' ? 'del equipo de agua caliente' : tipo === 'aire' ? 'del aire acondicionado'
        : tipo === 'otro' ? 'que me pediste' : 'de la aerotermia';
    return [
        `Hola${pila ? ` ${pila}` : ''}, te paso el presupuesto ${de}: ${eur(total)} con el IVA incluido.`,
        'Cualquier duda me dices.',
        limpio(emisor) ? `Un saludo, ${limpio(emisor)}` : 'Un saludo',
    ].join('\n');
}
