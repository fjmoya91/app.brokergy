// ─────────────────────────────────────────────────────────────────────────────
// Importes que se SELLAN en cada versión de la propuesta, y qué cambió de una a
// otra. Puro (sin BD ni Drive) para poder probarlo:
//   node implementation/backend/scripts/test_importes_propuesta.js
//
// REGLA — se sellan los importes de la opción que IMPRIME el PDF. Con reforma,
// el `result` de la calculadora lleva DOS economías: `financials` (solo
// aerotermia, la rama RES060) y `financialsRes080` (aerotermia + envolvente).
// Una propuesta de SOLO reforma (`comparativaReforma === false`) imprime la
// segunda, y la comparativa imprime las dos. Se leía siempre la primera, así que
// las 36 versiones de reforma sellaron el bono de una opción que el cliente no
// había visto: 26RES080_OP76 v1 selló 2.255 € con un PDF de 5.262 € (19/10/2026).
// Mismo criterio que el PDF (ProposalModal: `isOnlyReforma`/`isBoth`) y que el
// expediente (`propuestaGuardada.js`).
//
// REGLA — la inversión es la que imprime la portada: presupuesto + fotovoltaica.
// Se leía de `investment`, que no existe, y las 200 versiones salieron con null.
// ─────────────────────────────────────────────────────────────────────────────

const IMPORTES = ['inversion', 'caeBonus', 'irpfDeduction', 'totalAyuda'];

const ETIQUETA_IMPORTE = {
    inversion: 'inversión',
    caeBonus: 'bono CAE',
    irpfDeduction: 'deducción IRPF',
    totalAyuda: 'ayuda total',
};

// Qué ofrece la propuesta. Una versión antigua sin `rama` sellaba siempre la
// opción de solo aerotermia, así que se lee como tal.
const RAMA = {
    aerotermia: 'solo aerotermia',
    reforma: 'solo reforma',
    comparativa: 'comparativa aerotermia / reforma',
};

const num = (x) => (x != null && x !== '' && Number.isFinite(Number(x)) ? Math.round(Number(x)) : null);

// La deducción y la ayuda total, como las IMPRIME el PDF (frontend
// `logic/cifrasPropuesta.js`): la deducción por propietario redondeada × los
// propietarios, y la ayuda total como SUMA de lo impreso — redondeando el total
// a pelo, 26RES060_OP279 habría sellado 10.932 € con un PDF que dice
// 5.161 + 5.772 = 10.933 (22/10/2026).
function importesDeRama(f = {}) {
    const pres = num(f.presupuesto), fv = num(f.presupuestoFotovoltaica);
    const cae = num(f.caeBonus);
    const owners = Math.max(1, parseInt(f.numOwners, 10) || 1);
    const porPropietario = num(f.irpfDeductionPerOwner);
    const irpf = porPropietario != null ? porPropietario * owners : num(f.irpfDeduction);
    const totalAyuda = cae == null && irpf == null
        ? num(f.totalAyuda)
        : Math.max(0, (cae || 0) - (num(f.irpfCaeAmount) || 0)) + (irpf || 0);
    return {
        inversion: pres == null && fv == null ? null : (pres || 0) + (fv || 0),
        caeBonus: cae,
        irpfDeduction: irpf,
        totalAyuda,
    };
}

// CONDICIONES REFORZADAS: la MISMA cuenta que `penalizacionReforzada` de
// frontend `logic/cifrasPropuesta.js` (el 40 % del bono que imprime el PDF, con la
// tarifa de 702,78 € como mínimo). Se repite porque esto es CommonJS;
// test_importes_propuesta.js compara las dos.
const TARIFA_TOTAL = 702.78;
const PENALIZACION_REFORZADA_PCT = 40;
function penalizacionReforzada(caeBonus) {
    return Math.max(TARIFA_TOTAL, Math.round((num(caeBonus) || 0) * PENALIZACION_REFORZADA_PCT / 100));
}

/** `inputs` y `result` de la calculadora → importes de la versión. */
function importesDe(result, inputs) {
    const f60 = result?.financials || {};
    const f80 = result?.financialsRes080 || null;
    const conReforma = !!inputs?.isReforma && f80?.caeBonus != null;
    const soloReforma = conReforma && inputs?.comparativaReforma === false;
    const principal = importesDeRama(soloReforma ? f80 : f60);
    const reforma = conReforma && !soloReforma ? importesDeRama(f80) : null;
    // Lo que el cliente acepta al firmar sale de AQUÍ (GET /public/cliente lee la
    // versión vigente): se sella la cifra impresa, no se recalcula al aceptar.
    const reforzadas = inputs?.condicionesReforzadas === true ? {
        pct: PENALIZACION_REFORZADA_PCT,
        penalizacion: penalizacionReforzada(principal.caeBonus),
        ...(reforma ? { penalizacion_reforma: penalizacionReforzada(reforma.caeBonus) } : {}),
    } : null;
    return {
        ...principal,
        rama: soloReforma ? 'reforma' : (conReforma ? 'comparativa' : 'aerotermia'),
        ...(reforma ? { reforma } : {}),
        ...(reforzadas ? { reforzadas } : {}),
    };
}

// { aerotermia, reforma } con los importes de cada opción que la versión ofrece.
function opciones(imp) {
    const { rama, reforma, reforzadas, ...principal } = imp;
    if (rama === 'reforma') return { reforma: principal };
    if (rama === 'comparativa') return { aerotermia: principal, reforma: reforma || null };
    return { aerotermia: principal };
}

const eur = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true }).format(n)} €`;

/**
 * Qué cambió entre dos versiones, en lenguaje de persona.
 * Devuelve '' si no hay importes con los que comparar (una versión antigua sin
 * sellar no puede afirmar que "no cambió nada": no lo sabe).
 * Solo se restan cifras de la MISMA opción: el bono de la reforma frente al de
 * solo aerotermia no es un cambio de precio, es otra propuesta.
 */
function describirCambios(anterior, actual) {
    const a = anterior?.importes, b = actual?.importes;
    if (!a || !b) return '';
    const ramaA = a.rama || 'aerotermia', ramaB = b.rama || 'aerotermia';
    const oa = opciones(a), ob = opciones(b);
    const dos = ramaA !== ramaB || ramaA === 'comparativa';
    const difs = [];
    if (ramaA !== ramaB) difs.push(`propuesta ${RAMA[ramaA] || ramaA} → ${RAMA[ramaB] || ramaB}`);
    for (const op of ['aerotermia', 'reforma']) {
        const x = oa[op], y = ob[op];
        if (!x || !y) continue;
        const sufijo = dos ? (op === 'reforma' ? ' con reforma' : ' solo aerotermia') : '';
        for (const k of IMPORTES) {
            if (Number.isFinite(x[k]) && Number.isFinite(y[k]) && x[k] !== y[k]) {
                difs.push(`${ETIQUETA_IMPORTE[k]}${sufijo} ${eur(x[k])} → ${eur(y[k])}`);
            }
        }
    }
    return difs.length ? difs.join('; ') : 'sin cambios en los importes';
}

module.exports = { IMPORTES, importesDe, importesDeRama, describirCambios, penalizacionReforzada, PENALIZACION_REFORZADA_PCT };
