/**
 * facturaIncidencias — FILTRO PREVIO de una factura de obra.
 *
 * Recibe el JSON que ha leído el OCR (`facturaOcrService`) y el expediente real, y
 * devuelve la lista de incidencias que un humano debería mirar ANTES de dar la
 * factura por buena. NO escribe nada: quien decide qué se registra es la persona
 * que confirma en el modal.
 *
 * Criterio: es el mismo cruce que hace la skill `auditar-expediente` en su apartado
 * 4B ("el alcance facturado manda": FACTURA ↔ CIFO ↔ FOTOS deben describir el MISMO
 * alcance), adelantado al momento de la subida para no descubrirlo con el expediente
 * ya montado. Este filtro NO sustituye a la auditoría: es la primera criba.
 *
 * REGLA DE ORO — todo lo que se afirme aquí tiene que ser DETERMINISTA y citar su
 * evidencia. La IA solo lee la factura; el juicio es de estas reglas, para que
 * cualquiera pueda reproducir por qué saltó una incidencia.
 *
 * Severidades (las mismas del módulo de incidencias): GRAVE | LEVE.
 */

const { detectPrograma, esSustitucionCaldera } = require('../utils/fichas');

// ─── Normalizadores de comparación ───────────────────────────────────────────
const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());

const sinTildes = (s) => clean(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** NIF/CIF comparable: solo alfanuméricos en mayúscula ("B-13.456.789" → "B13456789"). */
const normNif = (s) => sinTildes(s).replace(/[^A-Z0-9]/g, '');

/** Nº de serie comparable (los fabricantes intercalan guiones y espacios a capricho). */
const normSerie = (s) => sinTildes(s).replace(/[^A-Z0-9]/g, '');

// Formas jurídicas y ruido que no deben decidir si dos nombres son el mismo.
const RUIDO_NOMBRE = new Set([
    'SL', 'SLU', 'SA', 'SAU', 'SLL', 'SCP', 'SC', 'CB', 'SOCIEDAD', 'LIMITADA', 'ANONIMA',
    'UNIPERSONAL', 'DON', 'DONA', 'SR', 'SRA', 'Y', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS',
]);

/** Tokens significativos de un nombre, para comparar sin depender del orden ni de la forma jurídica. */
function tokensNombre(s) {
    return sinTildes(s)
        .replace(/[^A-Z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !RUIDO_NOMBRE.has(t));
}

/** ¿Dos nombres se refieren razonablemente al mismo sujeto? (comparte ≥1 token significativo) */
function mismoNombre(a, b) {
    const ta = tokensNombre(a);
    const tb = tokensNombre(b);
    if (!ta.length || !tb.length) return true;      // sin datos no se acusa a nadie
    return ta.some(t => tb.includes(t));
}

/** Clave de dirección: solo letras y números (la puntuación no puede decidir). */
const addrKey = (s) => sinTildes(s).replace(/[^A-Z0-9]/g, '');

/** ¿Dos direcciones apuntan al mismo sitio? (comparten calle o número + municipio) */
function mismaDireccion(a, b) {
    const ka = addrKey(a);
    const kb = addrKey(b);
    if (!ka || !kb) return true;
    if (ka.includes(kb) || kb.includes(ka)) return true;
    const ta = tokensNombre(a);
    const tb = tokensNombre(b);
    if (!ta.length || !tb.length) return true;
    const comunes = ta.filter(t => tb.includes(t));
    return comunes.length >= 2;
}

const numOrNull = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const fmtEur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Fecha ISO (YYYY-MM-DD) → Date, o null. Tolera dd/mm/yyyy por si el OCR se despista. */
function parseFecha(s) {
    const v = clean(s);
    if (!v) return null;
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(v);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return null;
}

const fmtFecha = (s) => {
    const d = parseFecha(s);
    if (!d) return clean(s) || '—';
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

// ─── Alcance por ficha ───────────────────────────────────────────────────────
// Partidas que NUNCA se cuestionan: acompañan a cualquier actuación.
const PARTIDAS_NEUTRAS = new Set(['OBRA_CIVIL', 'MANO_OBRA', 'OTROS']);

const ETIQUETA_PARTIDA = {
    AEROTERMIA: 'aerotermia', ACS: 'ACS', EMISORES: 'unidades terminales',
    VENTANAS: 'ventanas', CUBIERTA: 'cubierta', FACHADA: 'fachada', SUELO: 'suelo',
    FOTOVOLTAICA: 'fotovoltaica', OBRA_CIVIL: 'obra civil', MANO_OBRA: 'mano de obra', OTROS: 'otros',
};

/**
 * Partidas que el expediente SÍ puede llevar facturadas, según su ficha y lo que
 * declara la instalación. Fuera de esto, lo facturado no encaja con la actuación.
 */
function alcanceEsperado(ficha, exp, op) {
    const inst = exp?.instalacion || {};
    const inputs = op?.datos_calculo?.inputs || {};
    const set = new Set();

    if (esSustitucionCaldera(ficha)) {
        // RES060 / RES093 / TER100: se sustituye el generador. Nada de envolvente.
        set.add('AEROTERMIA');
        if (inst.cambio_acs !== false) set.add('ACS');
        return set;
    }

    // RES080 (reforma/envolvente): el alcance lo declara la calculadora.
    const els = inputs.reforma || inputs.reformaElements || {};
    if (els.ventanas) set.add('VENTANAS');
    if (els.cubierta) set.add('CUBIERTA');
    if (els.paredes || els.fachada) set.add('FACHADA');
    if (els.suelo) set.add('SUELO');
    if (els.placas) set.add('FOTOVOLTAICA');
    // En una reforma sí puede haber generador y emisores nuevos.
    set.add('AEROTERMIA');
    set.add('ACS');
    set.add('EMISORES');
    // Si la reforma no declara elementos (datos incompletos), no acusamos de alcance.
    if (!els || Object.keys(els).length === 0) {
        ['VENTANAS', 'CUBIERTA', 'FACHADA', 'SUELO', 'FOTOVOLTAICA'].forEach(p => set.add(p));
    }
    return set;
}

// ─── Reglas ──────────────────────────────────────────────────────────────────

/**
 * @param {object}   args
 * @param {object}   args.ocr    JSON saneado de facturaOcrService
 * @param {object}   args.exp    expediente (numero_expediente, instalacion, documentacion, cee)
 * @param {object}   args.op     oportunidad (datos_calculo, ficha)
 * @param {object?}  args.cliente     fila de `clientes`
 * @param {object?}  args.instalador  fila de `prescriptores` (el instalador asociado)
 * @param {object[]} args.facturasExistentes  documentacion.facturas[] YA registradas (sin la nueva)
 * @param {number?}  args.caeEstimado  bono CAE del cliente (€), para la sobrefinanciación
 * @returns {Array<{codigo,severidad,titulo,texto,evidencia}>} GRAVES primero
 */
function detectarIncidenciasFactura({ ocr, exp, op, cliente, instalador, facturasExistentes = [], caeEstimado = null }) {
    const out = [];
    const add = (codigo, severidad, titulo, texto, evidencia = null) =>
        out.push({ codigo, severidad, titulo, texto, evidencia });

    if (!ocr) return out;

    const ficha = detectPrograma(exp || {}, op || {});
    const inst = exp?.instalacion || {};
    const doc = exp?.documentacion || {};
    const lineas = Array.isArray(ocr.lineas) ? ocr.lineas : [];
    const numExp = clean(exp?.numero_expediente) || 'el expediente';

    // ── GRAVE · UNIDADES_TERMINALES ──────────────────────────────────────────
    // Las fichas de sustitución de caldera (RES060/RES093/TER100) miden el ahorro
    // sustituyendo el GENERADOR: la unidad terminal existente es un dato de entrada
    // (fija la temperatura de impulsión y con ella el SCOP). Cambiarla o ampliarla
    // no está contemplado en la ficha, así que facturarlo descuadra la actuación.
    const lineasEmisores = lineas.filter(l => l.partida === 'EMISORES');
    if (esSustitucionCaldera(ficha) && lineasEmisores.length) {
        add(
            'UNIDADES_TERMINALES', 'GRAVE',
            'Se facturan unidades terminales',
            `La ficha ${ficha} no admite cambiar ni ampliar las unidades terminales: la actuación es la sustitución del generador, y el emisor existente es el que fija la temperatura de impulsión y el SCOP. La factura incluye ${lineasEmisores.length} línea(s) de emisores (radiadores / suelo radiante / fancoils). Comprueba si la obra ha cambiado el sistema de emisión; si es así, esta actuación no encaja en ${ficha}.`,
            lineasEmisores.map(l => clean(l.descripcion)).filter(Boolean).join(' · ')
        );
    }

    // ── GRAVE · TITULAR ──────────────────────────────────────────────────────
    // El titular de la factura tiene que ser el cedente del ahorro. Manda el NIF.
    const cliNombreExp = [clean(cliente?.nombre_razon_social), clean(cliente?.apellidos)].filter(Boolean).join(' ');
    const cliNifExp = normNif(cliente?.dni);
    const cliNifFac = normNif(ocr.cliente?.nif);
    const cliNombreFac = clean(ocr.cliente?.nombre);

    if (cliNifExp && cliNifFac && cliNifExp !== cliNifFac) {
        add(
            'TITULAR', 'GRAVE',
            'El titular de la factura no es el del expediente',
            `La factura va a nombre de ${cliNombreFac || '(sin nombre)'} con NIF ${clean(ocr.cliente?.nif)}, y el titular de ${numExp} es ${cliNombreExp || '(sin nombre)'} con NIF ${clean(cliente?.dni)}. El que factura la obra debe ser el mismo que cede el ahorro.`,
            `Factura: ${cliNombreFac || '—'} (${clean(ocr.cliente?.nif)})`
        );
    } else if (!cliNifFac && cliNombreFac && cliNombreExp && !mismoNombre(cliNombreFac, cliNombreExp)) {
        add(
            'TITULAR', 'GRAVE',
            'El titular de la factura no es el del expediente',
            `La factura va a nombre de ${cliNombreFac} y el titular de ${numExp} es ${cliNombreExp}. La factura no trae NIF, así que confírmalo antes de darla por buena.`,
            `Factura: ${cliNombreFac}`
        );
    } else if (!cliNifFac && !cliNombreFac) {
        add(
            'SIN_CLIENTE', 'LEVE',
            'La factura no identifica al cliente',
            'No se ha podido leer a nombre de quién va la factura. El verificador exige que el destinatario de la factura sea el titular que cede el ahorro.',
            null
        );
    }

    // ── GRAVE · EMISOR ───────────────────────────────────────────────────────
    // Quien factura la obra es quien firma el CIFO. Si no coinciden, o falta el
    // instalador en el expediente, el certificado de instalación no se sostiene.
    const insNifExp = normNif(instalador?.cif);
    const insNifFac = normNif(ocr.emisor?.nif);
    if (insNifExp && insNifFac && insNifExp !== insNifFac) {
        add(
            'EMISOR', 'GRAVE',
            'La factura la emite otra empresa, no el instalador del expediente',
            `Emite ${clean(ocr.emisor?.nombre) || '(sin nombre)'} con NIF ${clean(ocr.emisor?.nif)}, y el instalador asociado a ${numExp} es ${clean(instalador?.razon_social) || '(sin nombre)'} con NIF ${clean(instalador?.cif)}. El CIFO lo firma quien ejecuta y factura la obra: o la factura no es de este expediente, o el instalador asociado está mal.`,
            `Emisor: ${clean(ocr.emisor?.nombre) || '—'} (${clean(ocr.emisor?.nif)})`
        );
    }

    // ── GRAVE · DUPLICADA ────────────────────────────────────────────────────
    // El caso real que venía duplicando el PDF único: la misma factura subida por
    // el instalador desde el enlace y otra vez por el admin desde el modal.
    const numFac = normNif(ocr.numero_factura);   // mismo saneado: quita guiones y puntos
    const baseFac = numOrNull(ocr.totales?.base_imponible);
    const fechaFac = clean(ocr.fecha_factura);
    const dup = (facturasExistentes || []).find((f) => {
        if (!f) return false;
        const mismoNum = numFac && normNif(f.numero_factura) === numFac;
        const mismoImporte = baseFac != null && Math.abs((numOrNull(f.importe_sin_iva) ?? -1) - baseFac) < 0.01;
        const mismaFecha = fechaFac && clean(f.fecha_factura).slice(0, 10) === fechaFac.slice(0, 10);
        return mismoNum || (mismoImporte && mismaFecha);
    });
    if (dup) {
        add(
            'DUPLICADA', 'GRAVE',
            'Esta factura ya está registrada en el expediente',
            `Ya hay una factura registrada con el nº ${clean(dup.numero_factura) || '(sin nº)'} de fecha ${fmtFecha(dup.fecha_factura)} por ${fmtEur(dup.importe_sin_iva)}. Si es la misma, no la añadas: duplicaría la inversión que se declara al verificador y saldría dos veces en el PDF único.`,
            `Registrada: ${clean(dup.numero_factura) || '—'} · ${fmtFecha(dup.fecha_factura)} · ${fmtEur(dup.importe_sin_iva)}`
        );
    }

    // ── GRAVE · ALCANCE ──────────────────────────────────────────────────────
    const esperado = alcanceEsperado(ficha, exp, op);
    const fueraDeAlcance = [...new Set(
        lineas
            .map(l => l.partida)
            .filter(p => p && !PARTIDAS_NEUTRAS.has(p) && !esperado.has(p) && p !== 'EMISORES')
    )];
    if (fueraDeAlcance.length) {
        const etiquetas = fueraDeAlcance.map(p => ETIQUETA_PARTIDA[p] || p.toLowerCase()).join(', ');
        add(
            'ALCANCE', 'GRAVE',
            'Se factura algo que no está en el alcance del expediente',
            `La factura incluye ${etiquetas}, y ${numExp} (${ficha}) no contempla esa actuación. O sobra en la factura, o el expediente tiene mal declarado el alcance. Recuerda que lo facturado, el CIFO y las fotos deben describir lo mismo.`,
            lineas.filter(l => fueraDeAlcance.includes(l.partida)).map(l => clean(l.descripcion)).filter(Boolean).join(' · ')
        );
    }

    // Falta la partida principal y ES la única factura del expediente. Con otras
    // facturas ya registradas no se acusa: puede ser una factura complementaria.
    if (esSustitucionCaldera(ficha)
        && !(facturasExistentes || []).length
        && !lineas.some(l => l.partida === 'AEROTERMIA')) {
        add(
            'ALCANCE_SIN_EQUIPO', 'GRAVE',
            'La factura no incluye la bomba de calor',
            `${numExp} es una sustitución de caldera por bomba de calor y esta factura —la única del expediente— no tiene ninguna línea de aerotermia. Sin el equipo facturado no hay justificación de la inversión de la actuación.`,
            null
        );
    }

    // ── GRAVE · SERIE_DISTINTA ───────────────────────────────────────────────
    // El nº de serie de la factura tiene que ser el del equipo del expediente
    // (⚠️ la serie de ACS es distinta de la de la unidad exterior de calefacción).
    const chequeaSerie = (partida, equipo, etiqueta) => {
        const serieExp = normSerie(equipo?.numero_serie);
        if (!serieExp) return;
        const seriesFac = lineas
            .filter(l => l.partida === partida && l.numero_serie)
            .map(l => ({ raw: clean(l.numero_serie), norm: normSerie(l.numero_serie) }));
        if (!seriesFac.length) return;
        const coincide = seriesFac.some(s => s.norm === serieExp || s.norm.includes(serieExp) || serieExp.includes(s.norm));
        if (!coincide) {
            add(
                'SERIE_DISTINTA', 'GRAVE',
                `El nº de serie de ${etiqueta} no coincide`,
                `La factura declara ${seriesFac.map(s => s.raw).join(', ')} y en ${numExp} el ${etiqueta} tiene el nº de serie ${clean(equipo.numero_serie)}. El CIFO, la placa de la foto y la factura tienen que dar la misma serie.`,
                `Factura: ${seriesFac.map(s => s.raw).join(', ')} · Expediente: ${clean(equipo.numero_serie)}`
            );
        }
    };
    chequeaSerie('AEROTERMIA', inst.aerotermia_cal, 'equipo de calefacción');
    if (inst.cambio_acs !== false) chequeaSerie('ACS', inst.aerotermia_acs, 'equipo de ACS');

    // ── GRAVE · FECHA ────────────────────────────────────────────────────────
    const fFactura = parseFecha(ocr.fecha_factura);
    if (!fFactura) {
        add('SIN_FECHA', 'LEVE', 'La factura no trae fecha legible',
            'No se ha podido leer la fecha de la factura. Es la que fija las fechas de inicio y fin de la actuación en el CIFO: rellénala a mano.');
    } else {
        const hoy = new Date();
        if (fFactura.getTime() > hoy.getTime() + 24 * 3600 * 1000) {
            add('FECHA', 'GRAVE', 'La factura tiene fecha futura',
                `La fecha leída es ${fmtFecha(ocr.fecha_factura)}, posterior a hoy. Revisa si el OCR ha leído mal o si la factura está mal emitida.`,
                fmtFecha(ocr.fecha_factura));
        }
        const fCeeIni = parseFecha(doc.fecha_registro_cee_inicial);
        if (fCeeIni && fFactura.getTime() < fCeeIni.getTime()) {
            add('FECHA', 'GRAVE', 'La factura es anterior al CEE inicial',
                `La factura es del ${fmtFecha(ocr.fecha_factura)} y el CEE inicial de ${numExp} se registró el ${fmtFecha(doc.fecha_registro_cee_inicial)}. La actuación tiene que ser posterior al certificado de partida: una factura anterior implica que la obra se hizo antes de existir la situación de referencia.`,
                `Factura ${fmtFecha(ocr.fecha_factura)} < CEE inicial ${fmtFecha(doc.fecha_registro_cee_inicial)}`);
        }
    }

    // ── GRAVE · SOBREFINANCIACION ────────────────────────────────────────────
    // El CAE no puede superar la inversión ejecutada (contando TODAS las facturas).
    const inversionTotal = (facturasExistentes || [])
        .reduce((s, f) => s + (numOrNull(f?.importe_sin_iva) || 0), 0) + (baseFac || 0);
    if (caeEstimado != null && inversionTotal > 0 && caeEstimado > inversionTotal) {
        add('SOBREFINANCIACION', 'GRAVE',
            'El bono CAE supera la inversión facturada',
            `El CAE estimado del cliente es ${fmtEur(caeEstimado)} y la inversión acumulada de las facturas es ${fmtEur(inversionTotal)}. No puede haber sobrefinanciación: o falta alguna factura por registrar, o el importe leído no es correcto.`,
            `CAE ${fmtEur(caeEstimado)} > inversión ${fmtEur(inversionTotal)}`);
    }

    // ── LEVE · SIN_EQUIPO (marca / modelo / nº de serie) ─────────────────────
    // Lo ideal es que la factura identifique el equipo. Si no lo hace, no bloquea,
    // pero conviene tenerlo fichado: es lo primero que pide el verificador cuando
    // quiere atar la placa de la foto con lo facturado.
    if (esSustitucionCaldera(ficha) || lineas.some(l => l.partida === 'AEROTERMIA')) {
        const equipoLineas = lineas.filter(l => l.partida === 'AEROTERMIA' || l.partida === 'ACS');
        if (equipoLineas.length) {
            const falta = [];
            if (!equipoLineas.some(l => l.marca)) falta.push('marca');
            if (!equipoLineas.some(l => l.modelo)) falta.push('modelo');
            if (!equipoLineas.some(l => l.numero_serie)) falta.push('nº de serie');
            if (falta.length) {
                add('SIN_EQUIPO', 'LEVE',
                    `La factura no indica ${falta.join(', ')} del equipo`,
                    `Lo ideal es que la factura identifique el equipo instalado con marca, modelo y nº de serie: es lo que ata la placa de la foto con lo facturado y con el CIFO. Aquí falta ${falta.join(', ')}. Si el instalador puede reemitirla con ese dato, mejor; si no, hay que justificarlo con la placa y la ficha técnica.`,
                    equipoLineas.map(l => clean(l.descripcion)).filter(Boolean).join(' · '));
            }
        }
    }

    // ── LEVE · SIN_DESGLOSE ──────────────────────────────────────────────────
    if (baseFac == null) {
        add('SIN_DESGLOSE', 'LEVE', 'La factura no desglosa la base imponible',
            'No se ha podido leer la base imponible (importe sin IVA). Es el importe que cuenta como inversión de la actuación: compruébalo y rellénalo a mano.');
    } else {
        const sumaLineas = lineas.reduce((s, l) => s + (numOrNull(l.importe_total) || 0), 0);
        const margen = Math.max(1, baseFac * 0.005);
        if (sumaLineas > 0 && Math.abs(sumaLineas - baseFac) > margen) {
            add('SIN_DESGLOSE', 'LEVE', 'El desglose no suma la base imponible',
                `Las líneas leídas suman ${fmtEur(sumaLineas)} y la base imponible declarada es ${fmtEur(baseFac)}. Puede ser un descuento, un concepto que el OCR no ha cogido, o una lectura errónea: compruébalo antes de dar el importe por bueno.`,
                `Σ líneas ${fmtEur(sumaLineas)} ≠ base ${fmtEur(baseFac)}`);
        }
    }

    // ── LEVE · DIRECCION ─────────────────────────────────────────────────────
    const dirInstalacion = [clean(inst.direccion), clean(inst.codigo_postal), clean(inst.municipio)]
        .filter(Boolean).join(' ');
    const dirFactura = clean(ocr.cliente?.direccion);
    if (dirInstalacion && dirFactura && !mismaDireccion(dirFactura, dirInstalacion)) {
        add('DIRECCION', 'LEVE', 'La dirección de la factura no es la de la instalación',
            `La factura pone "${dirFactura}" y la instalación de ${numExp} está en "${dirInstalacion}". Puede ser correcto (la factura suele llevar el domicilio del cliente, no el de la obra), pero conviene que la factura cite la dirección donde se ha ejecutado.`,
            `Factura: ${dirFactura}`);
    }

    // GRAVES primero, en el orden en que se detectaron.
    return [...out.filter(i => i.severidad === 'GRAVE'), ...out.filter(i => i.severidad !== 'GRAVE')];
}

module.exports = {
    detectarIncidenciasFactura,
    // exportados para test / reutilización
    normNif,
    normSerie,
    mismoNombre,
    alcanceEsperado,
};
