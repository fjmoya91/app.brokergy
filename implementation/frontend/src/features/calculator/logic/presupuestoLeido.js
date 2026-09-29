/**
 * presupuestoLeido — qué se vuelca a "Datos Económicos" cuando se adjunta un
 * PRESUPUESTO a la propuesta y se lee con el OCR.
 *
 * Los presupuestos se sueltan en el popup de Anexos de la propuesta
 * (ProposalModal), un hueco por partida. Antes solo se archivaban en
 * `0. PRESUPUESTO` y las cifras había que teclearlas mirándolos: la propuesta
 * podía salir adjuntando un presupuesto de 14.520 € mientras su tabla decía
 * 15.000 € (estimado). Ahora se leen con el MISMO lector que la toma de datos
 * (`POST /api/factura-ocr/extract`, que devuelve la base y el total con IVA
 * derivados por `importesDocumento`) y la cifra va a SU campo:
 *
 *   hueco Aerotermia       → P. Aerotermia    (`presupuesto`)
 *   hueco Placas solares   → P. Fotovoltaica  (`presupuestoFotovoltaica`)
 *   huecos de la reforma   → P. Reforma       (`presupuestoEnvolvente`), SUMADOS
 *   (ventanas, cubierta, suelo, fachada)
 *
 * REGLA — el IVA lo decide la SIMULACIÓN, no el documento. Un PARTICULAR no se lo
 * deduce, así que su inversión real lo incluye (mismo criterio que `StepDocsObra`);
 * una empresa/autónomo, según el conmutador "IVA Incluido / Sin IVA", que es lo que
 * rotulan la tabla y la propuesta (`ivaTag`). El terciario se calcula siempre como
 * empresa (`titularType` forzado en CalculatorView).
 *
 * REGLA — P. Reforma es la SUMA de los presupuestos de la reforma. Cada partida la
 * presupuesta a menudo un gremio distinto (el carpintero, el de la cubierta), así
 * que el campo no es "el último leído" sino la suma de los huecos de la reforma
 * que tienen presupuesto adjunto. Lo leído de cada uno se recuerda por hueco en
 * `inputs.presupuestos_leidos[HUECO]`: sustituir el de ventanas cambia SU sumando
 * y deja los demás. Solo cuentan los huecos ACTIVOS (su mejora marcada en la
 * reforma) y CON documento adjunto: quitar un presupuesto lo saca de la suma la
 * próxima vez que se lea otro, sin reescribir nada al quitarlo.
 *
 * REGLA — las líneas de OTRA partida van a SU campo. El coste final suma los tres
 * campos: dejar las placas de un presupuesto de aerotermia dentro de P. Aerotermia
 * y tener además P. Fotovoltaica relleno las contaría dos veces. El reparto sale de
 * las líneas que el lector clasifica por `partida` (importes SIN IVA), aplicado en
 * proporción al total del documento, que es la cifra fiable (descuentos, portes).
 * Lo común (obra civil, mano de obra, otros) es del documento en el que viene.
 *
 * REGLA — el campo del HUECO se sustituye; los de las líneas ajenas solo se
 * rellenan si están VACÍOS (P. Aerotermia cuenta como vacío si es el estimado).
 * Pueden venir de otro presupuesto y pisarlos sería perder un dato que alguien
 * puso. Si difieren, se dice.
 *
 * Puro y sin imports: se prueba desde Node
 * (`implementation/backend/scripts/test_presupuesto_leido.mjs`).
 */

// Huecos de presupuesto del popup de Anexos, en el orden en que se enseñan (y en
// el que van delante de la propuesta). `input` es la mejora de la reforma que lo
// activa (null = siempre); `campo`, el de Datos Económicos al que va su importe.
// La lista de nombres válidos vive también en el backend (POST /:id/anexos).
export const HUECOS_PRESUPUESTO = [
    { key: 'AEROTERMIA', label: 'Aerotermia', input: null, campo: 'aerotermia' },
    { key: 'FOTOVOLTAICA', label: 'Placas solares', input: null, campo: 'fotovoltaica' },
    { key: 'VENTANAS', label: 'Ventanas', input: 'reformaVentanas', campo: 'envolvente' },
    { key: 'CUBIERTA', label: 'Cubierta', input: 'reformaCubierta', campo: 'envolvente' },
    { key: 'SUELO', label: 'Suelo', input: 'reformaSuelo', campo: 'envolvente' },
    { key: 'FACHADA', label: 'Fachada', input: 'reformaParedes', campo: 'envolvente' },
];

export const CAMPOS_PRESUPUESTO = {
    aerotermia: { input: 'presupuesto', etiqueta: 'P. Aerotermia' },
    fotovoltaica: { input: 'presupuestoFotovoltaica', etiqueta: 'P. Fotovoltaica' },
    envolvente: { input: 'presupuestoEnvolvente', etiqueta: 'P. Reforma' },
};

const PARTIDAS_ENVOLVENTE = ['VENTANAS', 'CUBIERTA', 'FACHADA', 'SUELO'];
const PARTIDAS_AEROTERMIA = ['AEROTERMIA', 'ACS', 'EMISORES'];

const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
// Con separador de miles también en cifras de 4 dígitos ("6.050", no "6050"),
// como `formatNumber` de la propuesta: el es-ES por defecto no agrupa por debajo
// de 10.000 y la misma cifra se leería distinta en el aviso y en la tabla.
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: true });

export const huecoDe = (key) => HUECOS_PRESUPUESTO.find(h => h.key === String(key || '').toUpperCase()) || HUECOS_PRESUPUESTO[0];
export const huecoActivo = (h, inputs) => !h.input || !!inputs?.[h.input];

/**
 * ¿La simulación trabaja con IVA? Espejo de `ivaTag` (ResultsPanel / SummaryTable):
 * un particular siempre con IVA; empresa, autónomo o terciario, según el conmutador.
 */
export function ivaDeLaSimulacion(inputs) {
    const esEmpresa = inputs?.sector === 'terciario'
        || (!!inputs?.titularType && inputs.titularType !== 'particular');
    const includeIVA = inputs?.includeIVA === true || inputs?.includeIVA === 'true';
    return { esEmpresa, conIva: !esEmpresa || includeIVA };
}

// A qué campo va una línea por su partida; null = al del propio documento.
const campoDeLinea = (partida, isReforma) => {
    if (partida === 'FOTOVOLTAICA') return 'fotovoltaica';
    if (PARTIDAS_ENVOLVENTE.includes(partida)) return isReforma ? 'envolvente' : null;
    if (PARTIDAS_AEROTERMIA.includes(partida)) return 'aerotermia';
    return null;
};

/**
 * Reparte el importe de UN documento entre los campos de la simulación.
 * `lectura` es la respuesta de `/api/factura-ocr/extract`: `{ doc, ocr }`.
 * Devuelve null si el documento no trae un importe utilizable.
 */
export function repartoPresupuestoLeido(lectura, inputs, hueco = 'AEROTERMIA') {
    const doc = lectura?.doc || {};
    const lineas = Array.isArray(lectura?.ocr?.lineas) ? lectura.ocr.lineas : [];
    const { conIva } = ivaDeLaSimulacion(inputs);
    const propio = huecoDe(hueco).campo;
    const isReforma = !!inputs?.isReforma;

    const total = r2(num(conIva ? doc.importe_total : doc.importe_sin_iva));
    if (!(total > 0)) return null;

    const partida = (l) => String(l?.partida || '').trim().toUpperCase();
    const suma = (pred) => lineas
        .filter(pred)
        .reduce((acc, l) => acc + Math.max(0, num(l?.importe_total)), 0);
    const sumaLineas = suma(() => true);
    const enProporcion = (parte) => (sumaLineas > 0 ? r2(total * parte / sumaLineas) : 0);

    const partes = { aerotermia: 0, fotovoltaica: 0, envolvente: 0 };
    for (const c of Object.keys(partes)) {
        if (c === propio) continue;
        partes[c] = enProporcion(suma(l => campoDeLinea(partida(l), isReforma) === c));
    }
    partes[propio] = r2(total - Object.entries(partes).reduce((acc, [c, v]) => acc + (c === propio ? 0 : v), 0));

    // Envolvente dentro de un presupuesto que no es de reforma: se queda en su
    // documento, pero hay que decirlo (una ficha de sustitución no la contempla).
    const envolventeDentro = !isReforma && propio !== 'envolvente'
        ? enProporcion(suma(l => PARTIDAS_ENVOLVENTE.includes(partida(l))))
        : 0;

    return {
        total,
        conIva,
        ivaPct: num(doc.iva_pct),
        ivaEstimado: !!doc.iva_estimado,
        propio,
        partes,
        envolventeDentro,
    };
}

const sufijoIva = (conIva) => (conIva ? 'IVA incl.' : 'sin IVA');

// Lo que se recuerda de cada documento leído (solo metadatos — regla 21). Sin
// ello, P. Reforma no se podría recomponer al sustituir uno de sus sumandos, y
// quien abra la oportunidad no sabría si la cifra la tecleó alguien o la leyó
// una máquina de un PDF.
const huella = (lectura, rep, ahora) => {
    const doc = lectura?.doc || {};
    return {
        importe: rep.partes[rep.propio],
        partes: { ...rep.partes },
        total_documento: rep.total,
        con_iva: rep.conIva,
        iva_pct: rep.ivaPct || null,
        iva_estimado: rep.ivaEstimado,
        numero: doc.numero_factura || null,
        fecha: doc.fecha_factura || null,
        emisor: doc.emisor_nombre || null,
        at: ahora,
    };
};

/**
 * Lo que hay que escribir en `inputs` y lo que hay que decir en pantalla.
 *
 * Opciones:
 *   hueco           — el hueco en el que se ha soltado el documento
 *   huecosConAdjunto— los huecos que tienen presupuesto adjunto AHORA (el propio incluido)
 *   otras           — lecturas de OTROS huecos de la reforma que no estaban leídos
 *                     ({ CUBIERTA: lectura }): entran en la suma de P. Reforma. Una
 *                     que falle se queda fuera de la suma y se dice.
 *
 * Devuelve:
 *   patch   — claves a fundir en `inputs` (null si no hay nada que escribir)
 *   antes   — los valores que sustituye, para poder DESHACER
 *   titular — la línea principal ("P. Aerotermia: 14.520 € (IVA incl.)")
 *   extras  — los otros campos que se han escrito
 *   avisos  — lo que no se ha tocado y por qué, o lo que hay que revisar
 *   nota    — la línea del historial de la oportunidad (null si no cambia nada)
 *   igual   — las cifras ya eran ésas: solo se guarda la huella
 */
export function lecturaAPresupuesto(lectura, inputs, opts = {}) {
    const {
        hueco = 'AEROTERMIA',
        huecosConAdjunto = null,
        otras = {},
        ahora = new Date().toISOString(),
    } = opts;
    const h = huecoDe(hueco);
    const campoPropio = CAMPOS_PRESUPUESTO[h.campo];
    const nombre = h.label.toLowerCase();

    const rep = repartoPresupuestoLeido(lectura, inputs, h.key);
    if (!rep) {
        return {
            patch: null,
            titular: `No se ha podido leer el importe del presupuesto de ${nombre}.`,
            avisos: [`Ponlo a mano en Datos Económicos → ${campoPropio.etiqueta}.`],
        };
    }
    if (!(rep.partes[h.campo] > 0)) {
        return {
            patch: null,
            titular: `El presupuesto no trae importe de ${nombre}.`,
            avisos: [`Todo lo leído (${eur(rep.total)} €) es de otras partidas. ¿Es el presupuesto correcto?`],
        };
    }

    const avisos = [];
    const extras = [];
    const cambios = [];                       // [{ etiqueta, antes, despues }] para la nota
    const patch = {};
    const antes = {
        presupuestoEstimado: !!inputs?.presupuestoEstimado,
        presupuestos_leidos: inputs?.presupuestos_leidos ?? null,
    };

    // ── Huella de lo leído, por hueco ───────────────────────────────────────
    const memoria = { ...(inputs?.presupuestos_leidos || {}) };
    memoria[h.key] = huella(lectura, rep, ahora);
    for (const [k, lec] of Object.entries(otras || {})) {
        const r = repartoPresupuestoLeido(lec, inputs, k);
        if (r && r.partes[r.propio] > 0) memoria[k] = huella(lec, r, ahora);
    }
    patch.presupuestos_leidos = memoria;

    const escribir = (campo, valor) => {
        const { input, etiqueta } = CAMPOS_PRESUPUESTO[campo];
        const previo = num(inputs?.[input]);
        patch[input] = valor;
        antes[input] = inputs?.[input] ?? 0;
        if (campo === 'aerotermia') patch.presupuestoEstimado = false;
        cambios.push({ etiqueta, antes: previo, despues: valor, campo });
    };

    // ── El campo del hueco ──────────────────────────────────────────────────
    let desglose = null;
    if (h.campo === 'envolvente') {
        // SUMA de los huecos de la reforma activos y con documento adjunto.
        const conAdjunto = new Set(huecosConAdjunto || [h.key]);
        conAdjunto.add(h.key);
        const sumandos = [];
        const sinLeer = [];
        const sinDoc = [];
        for (const x of HUECOS_PRESUPUESTO.filter(y => y.campo === 'envolvente' && huecoActivo(y, inputs))) {
            if (!conAdjunto.has(x.key)) { sinDoc.push(x.label); continue; }
            const m = memoria[x.key];
            if (m && num(m.importe) > 0) sumandos.push({ label: x.label, importe: num(m.importe) });
            else sinLeer.push(x.label);
        }
        const suma = r2(sumandos.reduce((acc, s) => acc + s.importe, 0));
        escribir('envolvente', suma);
        if (sumandos.length > 1) desglose = sumandos.map(s => `${s.label} ${eur(s.importe)} €`).join(' + ');
        if (sinLeer.length) avisos.push(`No se ha podido leer el presupuesto de ${sinLeer.join(', ').toLowerCase()}: no está en la suma. Súmalo a mano en P. Reforma.`);
        if (sinDoc.length) avisos.push(`${sinDoc.join(', ')} sin presupuesto adjunto: no está en la suma de P. Reforma.`);
    } else {
        escribir(h.campo, rep.partes[h.campo]);
    }

    // ── Líneas de otras partidas: solo el hueco ─────────────────────────────
    for (const c of Object.keys(CAMPOS_PRESUPUESTO)) {
        if (c === h.campo || !(rep.partes[c] > 0)) continue;
        const { input, etiqueta } = CAMPOS_PRESUPUESTO[c];
        const actual = num(inputs?.[input]);
        const vacio = actual <= 0 || (c === 'aerotermia' && !!inputs?.presupuestoEstimado);
        if (vacio) {
            escribir(c, rep.partes[c]);
            extras.push(`${etiqueta} ${eur(rep.partes[c])} €`);
        } else if (Math.abs(actual - rep.partes[c]) >= 1) {
            avisos.push(`Incluye ${eur(rep.partes[c])} € que son de ${etiqueta}, fuera de ${campoPropio.etiqueta}. ${etiqueta} ya tenía ${eur(actual)} € y no se ha tocado.`);
        }
    }

    if (rep.envolventeDentro > 0) {
        avisos.push(`Incluye ${eur(rep.envolventeDentro)} € de envolvente (ventanas, cubierta…), que una ficha de sustitución de caldera no contempla: se ha dejado dentro de ${campoPropio.etiqueta}.`);
    }
    if (rep.ivaEstimado) {
        avisos.push(rep.conIva
            ? 'El documento no desglosa el IVA: se ha supuesto el 21 %. Compruébalo.'
            : 'El documento no desglosa el IVA: la base se ha deducido suponiendo el 21 %. Compruébalo.');
    }

    // Menos de un euro de diferencia es la misma cifra: el importe se teclea en
    // euros enteros y el documento trae céntimos (medido en 26RES060_OP228:
    // 17.530 tecleado, 17.530,84 en el PDF). Entonces solo se guarda la huella,
    // sin línea en el historial: un cambio que no cambia nada no es un hecho.
    const estimadoCambia = patch.presupuestoEstimado === false && !!inputs?.presupuestoEstimado;
    const igual = !estimadoCambia && cambios.every(c => Math.abs(c.antes - c.despues) < 1);

    const principal = cambios[0];
    const titular = igual
        ? `${principal.etiqueta}: ${eur(principal.antes)} € (${sufijoIva(rep.conIva)}) — coincide con el presupuesto adjunto`
        : `${principal.etiqueta}: ${eur(principal.despues)} € (${sufijoIva(rep.conIva)})`
            + (principal.antes > 0
                ? ` (antes ${eur(principal.antes)} €${principal.campo === 'aerotermia' && inputs?.presupuestoEstimado ? ', estimado' : ''})`
                : '');
    if (desglose) extras.unshift(`= ${desglose}`);

    const nota = igual ? null
        : `📋 Presupuesto de ${nombre} adjuntado a la propuesta · importe leído del documento: `
            + cambios.map(c => `${c.etiqueta} ${c.antes > 0 ? `${eur(c.antes)} € → ` : ''}${eur(c.despues)} €`).join(' · ')
            + ` (${sufijoIva(rep.conIva)})`;

    // Con las cifras iguales NO se reescriben (serían los céntimos del PDF encima
    // de lo tecleado): solo la huella, que es lo que la suma de P. Reforma necesita.
    const patchFinal = igual ? { presupuestos_leidos: memoria } : patch;

    return { patch: patchFinal, antes, rep, titular, avisos, nota, igual, extras };
}
