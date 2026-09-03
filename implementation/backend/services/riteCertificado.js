/**
 * riteCertificado — QUÉ se hace con lo que se ha leído del Certificado RITE.
 *
 * `riteOcrService` solo LEE; aquí se decide, de forma determinista y reproducible:
 *   1. qué fecha de pruebas y de firma se escriben en el expediente,
 *   2. si el EMPLAZAMIENTO del certificado es el del expediente,
 *   3. qué se escribe y qué se deja para que lo mire una persona.
 *
 * Mismo reparto que las facturas de obra: la IA lee, `facturaIncidencias` juzga. Un
 * juicio que vive dentro del prompt no se puede reproducir ni explicar; éste sí.
 *
 * REGLA — se rellenan HUECOS, nunca se pisa lo ya escrito. La fecha de pruebas que
 * hay en la app puede haberla marcado una persona a mano, y `resolveFechasRite` dice
 * expresamente que lo manual MANDA. De esa fecha salen las de inicio y fin de
 * actuación del CIFO: sustituirla en silencio por lo que lea una máquina de un PDF
 * que puede ser cualquier cosa es cambiar un documento que ya se ha presentado. Si
 * difiere, se avisa con las dos fechas delante y decide el usuario.
 *
 * REGLA — la comprobación del emplazamiento AVISA, no bloquea. El impreso escribe la
 * vía como la tiene registrada Industria ("CALLE GARCÍA MORATO NUM: 30") y el
 * expediente como la escribió el Catastro o el cliente: que no casen letra a letra es
 * lo normal, y bloquear por eso dejaría el expediente parado por una coma. Lo que sí
 * es una señal seria es que no coincidan la referencia catastral o el municipio: eso
 * ya no es una forma de escribir, es otra vivienda.
 */

const supabase = require('./supabaseClient');
const { buildCertClienteData } = require('./certClienteData');

const present = (v) => v != null && String(v).trim() !== '' && !String(v).includes('___');

/** Sin acentos, en mayúsculas y sin puntuación: para comparar, nunca para guardar. */
const norm = (s) => String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();

// Palabras que no distinguen una dirección de otra: están en todas.
const RUIDO = new Set([
    'CALLE', 'AVENIDA', 'AVDA', 'PLAZA', 'PASEO', 'CAMINO', 'CARRETERA', 'CTRA',
    'TRAVESIA', 'RONDA', 'URBANIZACION', 'POLIGONO', 'PARTIDA', 'BARRIO',
    'NUM', 'NUMERO', 'PISO', 'PUERTA', 'ESCALERA', 'BLOQUE', 'PORTAL', 'PLANTA',
    'DEL', 'DE', 'LA', 'EL', 'LOS', 'LAS', 'SN',
]);

const palabras = (s) => norm(s).split(' ').filter(w => w.length >= 3 && !RUIDO.has(w) && !/^\d+$/.test(w));

/** Números de portal de una dirección: enteros de 1-4 cifras que no son un CP. */
const portales = (s) => new Set((norm(s).match(/\b\d{1,4}\b/g) || []).filter(n => n.length <= 4));

/** Las referencias catastrales casan si comparten los 14 primeros caracteres. */
function refCatastralCasa(a, b) {
    const x = norm(a).replace(/ /g, '');
    const y = norm(b).replace(/ /g, '');
    if (!x || !y) return null;
    return x.slice(0, 14) === y.slice(0, 14);
}

/**
 * ¿La dirección leída es la del expediente?
 * @returns {'ok'|'revisar'|null} null = no hay con qué comparar.
 */
function direccionCasa(leida, esperada) {
    const a = palabras(leida);
    const b = palabras(esperada);
    if (!a.length || !b.length) return null;
    const comunes = a.filter(w => b.includes(w)).length;
    // Basta con que se reconozca la vía: la mitad de las palabras distintivas de la
    // más corta de las dos. Con el umbral más alto, "GARCIA MORATO" contra
    // "GARCIA MORATO 30 CONSUEGRA TOLEDO" salía marcada sin motivo.
    if (comunes / Math.min(a.length, b.length) < 0.5) return 'revisar';

    // El portal es lo que separa dos viviendas de la misma calle. Solo cuenta si las
    // dos direcciones traen alguno: la del expediente a veces se guarda sin número.
    const pa = portales(leida), pb = portales(esperada);
    if (pa.size && pb.size && ![...pa].some(n => pb.has(n))) return 'revisar';
    return 'ok';
}

/**
 * La fecha de PRUEBAS del certificado: la ÚLTIMA de las que declara.
 *
 * El impreso trae hasta ocho casillas (equipos, estanqueidad, pruebas finales,
 * ajuste y equilibrado, eficiencia energética…) y lo habitual es que lleven todas la
 * misma fecha. Cuando no, la instalación no está probada hasta que pasa la última: es
 * la que cierra la actuación, y es la que `calcCifo` usa como fecha de fin.
 */
function fechaPruebasDe(lectura) {
    const fechas = (lectura?.fechas_pruebas || []).filter(Boolean).sort();
    return fechas.length ? fechas[fechas.length - 1] : null;
}

/**
 * Cruza lo leído con el expediente. Devuelve una lista de comprobaciones legible,
 * no un booleano: quien mira esto necesita saber QUÉ no cuadra y contra qué.
 *
 * @returns {Array<{campo:string, estado:'ok'|'revisar'|'no_consta', leido:string|null, esperado:string|null, nota:string}>}
 */
function comprobarEmplazamiento(lectura, exp, op, cliente) {
    const esperado = buildCertClienteData(exp, op, cliente).data;
    const out = [];

    // ── Referencia catastral ──
    const rcLeida = lectura?.referencia_catastral || null;
    const rcExp = esperado.refCatastral || null;
    if (!rcLeida || !rcExp) {
        out.push({
            campo: 'Referencia catastral', estado: 'no_consta',
            leido: rcLeida, esperado: rcExp,
            nota: !rcLeida ? 'El certificado no la trae (o no se ha podido leer).' : 'El expediente no la tiene registrada.',
        });
    } else {
        const casa = refCatastralCasa(rcLeida, rcExp);
        out.push({
            campo: 'Referencia catastral', estado: casa ? 'ok' : 'revisar',
            leido: rcLeida, esperado: rcExp,
            nota: casa ? 'Coincide con la del expediente.' : 'NO coincide con la del expediente: puede ser el certificado de otra vivienda.',
        });
    }

    // ── Dirección del emplazamiento ──
    const dirLeida = [lectura?.direccion, lectura?.municipio].filter(Boolean).join(', ') || null;
    const dirExp = esperado.direccionInstalacion || null;
    if (!dirLeida || !dirExp) {
        out.push({
            campo: 'Dirección', estado: 'no_consta',
            leido: dirLeida, esperado: dirExp,
            nota: !dirLeida ? 'No se ha podido leer el emplazamiento.' : 'El expediente no tiene dirección de instalación.',
        });
    } else {
        const casa = direccionCasa(dirLeida, dirExp);
        out.push({
            campo: 'Dirección', estado: casa === 'ok' ? 'ok' : 'revisar',
            leido: dirLeida, esperado: dirExp,
            nota: casa === 'ok'
                ? 'Coincide con el emplazamiento del expediente.'
                : 'No se parece a la del expediente. El impreso escribe la vía como la tiene registrada Industria, así que compruébalo antes de dar nada por malo.',
        });
    }

    return out;
}

/**
 * Lee el certificado, lo cruza con el expediente y escribe las fechas que falten.
 *
 * Lo usan las DOS superficies —la subida del admin desde Documentación y la del
 * instalador desde su enlace público—, para que el expediente quede igual venga el
 * certificado por donde venga.
 *
 * @param {object} p
 * @param {object} p.exp expediente (id, oportunidad_id, numero_expediente, documentacion, instalacion)
 * @param {Buffer} p.pdf el certificado ya normalizado a PDF
 * @param {'admin'|'instalador'} [p.origen]
 * @returns {Promise<{lectura, fechas, escrito:string[], conflictos:Array, comprobaciones:Array}>}
 */
async function procesarCertificadoRite({ exp, pdf, origen = 'admin' }) {
    const riteOcrService = require('./riteOcrService');
    const lectura = await riteOcrService.leerCertificadoRite(pdf);

    const doc = exp?.documentacion || {};
    const pruebas = fechaPruebasDe(lectura);
    const firma = lectura?.fecha_firma || null;

    const escrito = [];
    const conflictos = [];
    const campos = [
        { key: 'fecha_pruebas_cert_instalacion', label: 'Fecha pruebas Cert. Inst.', valor: pruebas },
        { key: 'fecha_firma_cert_instalacion', label: 'Fecha firma Cert. Inst.', valor: firma },
    ];

    for (const c of campos) {
        if (!c.valor) continue;
        const actual = doc[c.key];
        if (present(actual)) {
            // Ya hay una fecha escrita: no se pisa (puede ser una decisión manual y de
            // ella cuelgan las fechas del CIFO). Se enseñan las dos y decide el usuario.
            if (String(actual).slice(0, 10) !== c.valor) {
                conflictos.push({ campo: c.key, label: c.label, en_app: String(actual).slice(0, 10), en_certificado: c.valor });
            }
            continue;
        }
        const { error } = await supabase.rpc('set_expediente_doc_field', {
            p_oportunidad_id: exp.oportunidad_id,
            p_field: c.key,
            p_value: c.valor,
        });
        if (error) { console.warn('[riteCert] no se pudo escribir', c.key, error.message); continue; }
        escrito.push(c.key);
    }

    // Cruce con el expediente. Necesita la oportunidad y el cliente, que no viajan en
    // `exp`: se piden aquí para que las dos superficies compartan también esto.
    let comprobaciones = [];
    try {
        const { data: op } = exp.oportunidad_id
            ? await supabase.from('oportunidades')
                .select('id, ref_catastral, referencia_cliente, cliente_id, datos_calculo')
                .eq('id', exp.oportunidad_id).maybeSingle()
            : { data: null };
        const { data: cliente } = op?.cliente_id
            ? await supabase.from('clientes')
                .select('nombre_razon_social, apellidos, dni, tlf, email, direccion, municipio, provincia, codigo_postal')
                .eq('id_cliente', op.cliente_id).maybeSingle()
            : { data: null };
        comprobaciones = comprobarEmplazamiento(lectura, exp, op, cliente);
    } catch (e) {
        console.warn('[riteCert] no se pudo comprobar el emplazamiento:', e.message);
    }

    // Huella de la lectura: qué se leyó, cuándo y qué no cuadraba. Se guarda para que
    // el aviso siga estando cuando alguien abra el expediente mañana — sin esto, la
    // única señal de que la referencia catastral no casaba se ve una vez y se pierde
    // al cerrar el popup. Solo metadatos (regla 21).
    try {
        await supabase.rpc('merge_expediente_doc_json', {
            p_expediente_id: exp.id,
            p_field: 'rite_ocr',
            p_value: {
                at: new Date().toISOString(),
                origen,
                provider: riteOcrService.PROVIDER,
                fechas_pruebas: lectura.fechas_pruebas,
                fecha_firma: lectura.fecha_firma,
                direccion: lectura.direccion,
                municipio: lectura.municipio,
                referencia_catastral: lectura.referencia_catastral,
                escrito,
                conflictos,
                revisar: comprobaciones.filter(c => c.estado === 'revisar').map(c => c.campo),
            },
        });
    } catch (e) { console.warn('[riteCert] no se pudo sellar la lectura:', e.message); }

    return { lectura, fechas: { pruebas, firma }, escrito, conflictos, comprobaciones };
}

module.exports = {
    procesarCertificadoRite,
    comprobarEmplazamiento,
    fechaPruebasDe,
    direccionCasa,
    refCatastralCasa,
};
