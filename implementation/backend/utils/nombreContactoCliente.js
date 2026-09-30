// ─── nombreContactoCliente.js ────────────────────────────────────────────────
// El nombre con el que un cliente está guardado en la agenda de WhatsApp.
//
// La convención de la casa es escribir delante lo que se le tramita:
// "RES080 Irene Lopez (Gonzagarri)". Con eso no se distinguía a qué obra se
// refería el chat, así que el prefijo pasa a llevar el NÚMERO:
//
//   · con expediente (propuesta aceptada) → su nº sin el año: RES080_87
//   · sin expediente                      → su oportunidad:    RES060_OP246
//   · CEE directo                          → CEE_54
//
// Puro, sin BD ni WhatsApp: se prueba desde Node
// (`node scripts/test_nombre_contacto_cliente.js`).
//
// REGLAS
//  · Solo se toca el PREFIJO. Lo que va detrás lo escribió una persona
//    ("Irene Lopez (Gonzagarri)", "Rosario MATA Hija De Moises (DIMAS)") y es
//    como de verdad la reconoce: se conserva letra a letra.
//  · Solo se renombra un contacto que YA lleva el prefijo. Uno sin él puede ser
//    cualquier cosa (un familiar, un proveedor) y no es de esta convención.
//  · Con VARIAS obras posibles no se elige a ojo: se desempata por la ficha que
//    ya dice el nombre, y si aun así quedan varias, se pregunta (no se toca).
// ─────────────────────────────────────────────────────────────────────────────

// "RES060", "RES080 -", "RES060_170", "26RES080_78", "RES060-08", "Res069",
// "CEE", "CEEI", "TER100", "RES060_OP12". Detrás tiene que venir un espacio,
// un guion, un paréntesis o el final: así no casan "Termia", "Teresa",
// "RESERVAS" ni "RESGONZA".
const PREFIJO = /^\s*(?:\d{2}|\d{4})?((?:RES|TER)\d{3}|CEEI?)(?:[_-](?:OP)?\d+)?(?=[\s(\-]|$)\s*-?\s*/i;

/** { ficha, resto } si el nombre lleva prefijo; null si no. */
function leerPrefijo(nombre) {
    const s = String(nombre || '');
    const m = s.match(PREFIJO);
    if (!m) return null;
    const bruto = m[1].toUpperCase();
    const ficha = bruto.startsWith('CEE') ? 'CEE' : bruto;
    return { ficha, prefijo: m[0].trim().replace(/\s*-$/, ''), resto: s.slice(m[0].length).trim() };
}

/** "26RES080_87" → "RES080_87" · "26RES060_OP246" → "RES060_OP246" · "2026CEE_54" → "CEE_54". */
function codigoCorto(numero) {
    return String(numero || '').trim().toUpperCase().replace(/^\d{2}(\d{2})?(?=[A-Z])/, '');
}

const FICHAS = ['RES080', 'RES093', 'TER173', 'TER100', 'RES060'];
const fichaDe = (codigo) => {
    const s = String(codigo || '').toUpperCase();
    if (/CEE/.test(s)) return 'CEE';
    return FICHAS.find(f => s.includes(f)) || null;
};
const up = (s) => String(s || '').toUpperCase();
const masReciente = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);

/**
 * De qué obra habla el contacto. `rel` = { expedientes, oportunidades, cee_directos }
 * (la forma de `clientesRelaciones`). `ficha` = la que ya dice el nombre.
 *
 * Devuelve { codigo, origen, numero } o { ambiguo: [...] } o null.
 */
function obraDelContacto(rel, ficha) {
    const exps = (rel?.expedientes || []).filter(e => e.numero_expediente);
    const ops = rel?.oportunidades || [];
    const cees = (rel?.cee_directos || []).filter(c => c.numero_expediente);

    // Dentro de cada grupo: primero lo de la MISMA ficha que dice el nombre; si
    // no hay nada de esa ficha, todo el grupo. Lo rechazado solo si no hay más.
    const elegir = (lista, campo, origen) => {
        if (!lista.length) return null;
        const vivos = lista.filter(x => !['RECHAZADO', 'RECHAZADA'].includes(up(x.estado)));
        const base = vivos.length ? vivos : lista;
        const deFicha = ficha ? base.filter(x => fichaDe(x[campo]) === ficha) : [];
        const pool = (deFicha.length ? deFicha : base).slice().sort(masReciente);
        if (pool.length > 1) {
            // Varias de la misma ficha: si solo UNA sigue abierta, es esa.
            const abiertas = pool.filter(x => !['FINALIZADO', 'ACEPTADA'].includes(up(x.estado)));
            if (abiertas.length === 1) return { numero: abiertas[0][campo], origen };
            return { ambiguo: pool.map(x => x[campo]) };
        }
        return { numero: pool[0][campo], origen };
    };

    let r;
    if (ficha === 'CEE') {
        r = elegir(cees, 'numero_expediente', 'cee') || elegir(exps, 'numero_expediente', 'expediente');
    } else {
        r = elegir(exps, 'numero_expediente', 'expediente');
        if (!r) {
            // Sin expediente: su oportunidad. Las que ya tienen expediente no
            // cuentan (si lo tuvieran, habría salido arriba).
            const conExp = new Set((rel?.expedientes || []).map(e => e.oportunidad_id).filter(Boolean));
            r = elegir(ops.filter(o => o.id_oportunidad && !conExp.has(o.id)), 'id_oportunidad', 'oportunidad');
        }
        if (!r) r = elegir(cees, 'numero_expediente', 'cee');
    }
    if (!r) return null;
    if (r.ambiguo) return { ambiguo: r.ambiguo.map(codigoCorto) };
    return { ...r, codigo: codigoCorto(r.numero) };
}

/** El nombre nuevo, o null si no lleva prefijo. */
function nombreNuevo(nombreActual, codigo) {
    const p = leerPrefijo(nombreActual);
    if (!p || !codigo) return null;
    return p.resto ? `${codigo} ${p.resto}` : codigo;
}

module.exports = { leerPrefijo, codigoCorto, obraDelContacto, nombreNuevo, fichaDe };
