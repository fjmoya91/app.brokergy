/**
 * justificanteBancario — el JUICIO sobre lo leído de un justificante de titularidad.
 *
 * El modelo solo LEE (justificanteOcrService); qué es un IBAN, si cuadra con el
 * que consta y si el titular es el cliente lo decide este módulo, determinista y
 * probado (scripts/test_justificante_bancario.js). Mismo reparto que
 * facturaOcrService ↔ facturaIncidencias.
 *
 * El IBAN llega de mil formas —«ES12 3456 …», «ES12-3456-…», con puntos—, así que
 * se compara SIEMPRE normalizado a letras y cifras. Un IBAN enmascarado
 * («ES12 **** **** 1234», lo habitual en capturas de la banca online) no se puede
 * usar para RELLENAR, pero sí para comprobar lo que se ve.
 */

/** Solo letras, cifras y asteriscos (los dígitos ocultos), en mayúsculas. */
function normalizarIban(v) {
    return String(v || '').toUpperCase().replace(/[•●·]/g, '*').replace(/[^A-Z0-9*]/g, '');
}

/** ¿Pasa el dígito de control ISO 13616 (mod 97)? Solo para IBAN completos. */
function ibanValido(v) {
    const s = normalizarIban(v);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    if (s.startsWith('ES') && s.length !== 24) return false;
    const reord = s.slice(4) + s.slice(0, 4);
    let resto = 0;
    for (const ch of reord) {
        const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
        for (const d of n) resto = (resto * 10 + Number(d)) % 97;
    }
    return resto === 1;
}

/** «ES1234567890…» → «ES12 3456 7890 …», como se imprime. */
function formatearIban(v) {
    return normalizarIban(v).replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Compara el IBAN leído con el que consta.
 * @returns {{estado: 'sin_lectura'|'sin_dato'|'coincide'|'coincide_visible'|'no_coincide', leido, esperado}}
 *   sin_dato → no hay IBAN en la ficha (entonces se RELLENA, si el leído es válido).
 */
function compararIban(leido, esperado) {
    const l = normalizarIban(leido);
    const e = normalizarIban(esperado).replace(/\*/g, '');
    if (!l || l.replace(/\*/g, '').length < 4) return { estado: 'sin_lectura', leido: l || null, esperado: e || null };
    if (!e) return { estado: 'sin_dato', leido: l, esperado: null };
    if (!l.includes('*')) return { estado: l === e ? 'coincide' : 'no_coincide', leido: l, esperado: e };
    // Enmascarado: solo se comparan las posiciones que se ven. Un enmascarado puede
    // venir más corto (ES12****1234): entonces se casan el principio y el final.
    let ok;
    if (l.length === e.length) {
        ok = [...l].every((c, i) => c === '*' || c === e[i]);
    } else {
        const cabeza = l.split('*')[0];
        const cola = l.split('*').pop();
        ok = e.startsWith(cabeza) && e.endsWith(cola);
    }
    return { estado: ok ? 'coincide_visible' : 'no_coincide', leido: l, esperado: e };
}

// ── Titular ──────────────────────────────────────────────────────────────────
const VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'I', 'E', 'SL', 'SA', 'SLU', 'SAU', 'SC', 'CB', 'SLL', 'SCOOP', 'COOP', 'D', 'DNA', 'DON', 'DONA']);

function tokens(v) {
    return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
        .replace(/[^A-Z0-9Ñ ]/g, ' ').split(/\s+/).filter(t => t && !VACIAS.has(t));
}

/** ¿Distancia de edición 1 (una letra cambiada, de más o de menos)? */
function unaLetra(a, b) {
    if (a === b || Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
    let i = 0, j = 0, dif = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++dif > 1) return false;
        if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return dif + (a.length - i) + (b.length - j) <= 1;
}

/**
 * ¿Es `leido` la misma persona/sociedad que `esperado`? El orden no importa
 * («MORENO SERRANO FRANCISCO JAVIER») y se admite una inicial o una abreviatura del
 * nombre («FCO. JAVIER»): lo que no puede faltar son los APELLIDOS.
 * Una palabra que difiere en UNA letra (ZARZO / ZARCO) es 'errata': casi siempre
 * un error al teclear la ficha, y de ella salen el Anexo I y el Convenio.
 * @returns 'coincide' | 'errata' | 'parcial' | 'no_coincide'
 */
function mismaPersona(leido, esperado) {
    return detallePersona(leido, esperado).estado;
}

function detallePersona(leido, esperado) {
    const L = tokens(leido), E = tokens(esperado.nombre_completo);
    if (!L.length || !E.length) return { estado: 'no_coincide' };
    const enL = (t) => L.some(x => x === t || (x.length >= 2 && t.startsWith(x)) || (t.length >= 2 && x.startsWith(t)) || (x.length === 1 && t[0] === x));
    const errata = (t) => L.find(x => unaLetra(x, t));
    const ape = tokens(esperado.apellidos);
    const nom = tokens(esperado.nombre);
    const juzgar = (clave, extra) => {
        const faltan = clave.filter(t => !enL(t));
        const nomOk = extra.filter(enL).length;
        if (!faltan.length && (nomOk > 0 || !extra.length)) return { estado: 'coincide' };
        const erratas = faltan.map(t => ({ ficha: t, leido: errata(t) }));
        if (erratas.every(e => e.leido) && (nomOk > 0 || !extra.length)) return { estado: 'errata', erratas };
        if (clave.length - faltan.length > 0 && clave.length - faltan.length + nomOk >= 2) return { estado: 'parcial' };
        return { estado: 'no_coincide' };
    };
    if (ape.length) return juzgar(ape, nom);
    // Sociedad (o nombre sin apellidos): todos los términos significativos.
    const r = juzgar(E, []);
    if (r.estado !== 'no_coincide') return r;
    return E.filter(enL).length >= Math.max(1, Math.ceil(E.length / 2)) ? { estado: 'parcial' } : r;
}

/** Quién puede figurar como titular: el cliente, la sociedad y los copropietarios. */
function titularesEsperados(c = {}) {
    const lista = [];
    const add = (nombre, apellidos, rol) => {
        const nc = [nombre, apellidos].filter(Boolean).join(' ').trim();
        if (nc) lista.push({ nombre: nombre || '', apellidos: apellidos || '', nombre_completo: nc, rol });
    };
    add(c.nombre_razon_social, c.es_empresa ? '' : c.apellidos, 'titular');
    if (c.es_empresa) add(c.representante_nombre, c.representante_apellidos, 'representante');
    for (const p of (Array.isArray(c.copropietarios) ? c.copropietarios : [])) {
        add(p?.nombre_razon_social || p?.nombre, p?.es_empresa ? '' : p?.apellidos, 'copropietario');
    }
    return lista;
}

/**
 * @returns {{estado: 'sin_lectura'|'coincide'|'parcial'|'no_coincide', leidos: string[], casa_con: string|null}}
 * 'coincide' exige que el TITULAR del expediente (o su sociedad) figure en el
 * documento: una cuenta solo del copropietario no es la del titular, y se dice.
 */
function compararTitular(leidos = [], cliente = {}) {
    const L = (leidos || []).map(s => String(s || '').trim()).filter(Boolean);
    if (!L.length) return { estado: 'sin_lectura', leidos: [], casa_con: null };
    const esperados = titularesEsperados(cliente);
    if (!esperados.length) return { estado: 'sin_lectura', leidos: L, casa_con: null };
    let mejor = { estado: 'no_coincide', casa_con: null, rol: null, erratas: null };
    const rango = { coincide: 3, errata: 2, parcial: 1, no_coincide: 0 };
    const peso = (m) => rango[m.estado] * 2 + (m.rol === 'titular' ? 1 : 0);
    for (const e of esperados) {
        for (const l of L) {
            const d = detallePersona(l, e);
            const cand = { estado: d.estado, casa_con: e.nombre_completo, rol: e.rol, erratas: d.erratas || null };
            if (peso(cand) > peso(mejor)) mejor = cand;
        }
    }
    return { ...mejor, leidos: L };
}

/**
 * Lectura + ficha → veredicto, avisos y (si procede) el IBAN con el que RELLENAR.
 * Rellenar solo si la ficha no tiene IBAN y el leído está completo y valida.
 */
function evaluarJustificante(lectura = {}, cliente = {}) {
    const iban = compararIban(lectura.iban, cliente.numero_cuenta);
    const titular = compararTitular(lectura.titulares, cliente);
    const completo = iban.leido && !iban.leido.includes('*');
    const valido = completo && ibanValido(iban.leido);
    const rellenar = iban.estado === 'sin_dato' && valido ? formatearIban(iban.leido) : null;

    const avisos = [];
    if (iban.estado === 'sin_lectura') avisos.push('No se ha podido leer el IBAN en el documento.');
    else if (completo && !valido) avisos.push(`El IBAN leído (${formatearIban(iban.leido)}) no pasa el dígito de control: compruébalo a mano.`);
    if (iban.estado === 'no_coincide') avisos.push(`El IBAN del justificante (${formatearIban(iban.leido)}) NO coincide con el de la ficha (${formatearIban(iban.esperado)}).`);
    if (iban.estado === 'sin_dato' && !rellenar && iban.leido?.includes('*')) avisos.push('El justificante oculta parte del IBAN: no se puede rellenar desde él.');
    if (titular.estado === 'sin_lectura') avisos.push('No se ha podido leer el titular de la cuenta.');
    else if (titular.estado === 'no_coincide') avisos.push(`El titular del justificante (${titular.leidos.join(' · ')}) no parece el cliente.`);
    else if (titular.estado === 'errata') avisos.push(`El titular coincide salvo una letra (${titular.erratas.map(e => `ficha «${e.ficha}» / justificante «${e.leido}»`).join(', ')}): revisa el nombre de la ficha, que es el que sale en el Anexo I y el Convenio.`);
    else if (titular.estado === 'parcial') avisos.push(`El titular (${titular.leidos.join(' · ')}) coincide solo en parte con ${titular.casa_con}.`);
    else if (titular.rol === 'copropietario') avisos.push(`La cuenta es del copropietario ${titular.casa_con}, no del titular del expediente.`);

    const ok = ['coincide', 'coincide_visible', 'sin_dato'].includes(iban.estado)
        && titular.estado === 'coincide' && titular.rol !== 'copropietario'
        && (iban.estado !== 'sin_dato' || !!rellenar);
    return { ok, iban, titular, rellenar, iban_valido: valido, avisos };
}

module.exports = { normalizarIban, ibanValido, formatearIban, compararIban, compararTitular, titularesEsperados, evaluarJustificante, mismaPersona };
