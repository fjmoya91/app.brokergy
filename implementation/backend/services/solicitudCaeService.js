// ─────────────────────────────────────────────────────────────────────────────
// SOLICITUD DE EMISIÓN DE CAE — actuaciones estandarizadas.
//
// Es la CARÁTULA de la subida al MITECO: un solo impreso por LOTE que declara
// quién solicita, cuánto ahorro se pide en total, y una fila por actuación con su
// ficha y su ahorro. Cada fila se corresponde con un ZIP "ActuacionE{n}", y
// dentro de ese ZIP va el anexo que genera `anexoActuacionService`.
//
// REGLA — no se REPLICA el impreso: se RELLENA el oficial.
// `backend/plantillas/SolicitudEmisionCAE.pdf` es el formulario del Ministerio con
// sus 42 campos vivos. Escribir dentro de él es la única forma de que el escudo,
// las tipografías, los márgenes y las notas al pie sean exactamente los suyos, y
// de que el título de la ficha y la comunidad autónoma sean literalmente las
// opciones de sus desplegables. Mismo criterio que el anexo por actuación.
//
// REGLA — se genera junto a los anexos, NO por separado. Los dos salen de los
// mismos datos (el nº de actuación, el ahorro verificado y el dictamen) y tienen
// que casar entre sí: la fila E3 de la solicitud es el expediente cuyo anexo se
// llama AnexoE3. Con dos botones se puede generar uno y no el otro, y que
// diverjan sin que nadie se entere hasta el requerimiento.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const { FICHA_CATALOGO } = require('./anexoActuacionService');

const PLANTILLA = path.join(__dirname, '..', 'plantillas', 'SolicitudEmisionCAE.pdf');

// La tabla del impreso tiene QUINCE filas. Un lote nuestro son 5 como mucho (ese
// es el criterio de agrupación), pero el tope es del formulario.
const MAX_ACTUACIONES = 15;

// ⚠️ La fila 11 se llama "Ell-0" en la plantilla oficial —ele minúscula, no uno—.
// Es una errata del Ministerio; hay que respetarla, no corregirla, o el campo no
// se encuentra y esa fila sale sin ahorro.
const campoAhorro = (n) => (n === 11 ? 'Ell-0' : `E${n}-0`);

// Comunidades tal y como las escribe el desplegable del impreso. Se elige la
// opción, así que el texto tiene que ser el suyo carácter a carácter.
const CCAA_OPCIONES = [
    'Andalucía', 'Aragón', 'Canarias', 'Cantabria', 'Castilla y León',
    'Castilla-La Mancha', 'Cataluña', 'Ciudad de Ceuta', 'Ciudad de Melilla',
    'Comunidad Foral de Navarra', 'Comunidad de Madrid', 'Comunitat Valenciana',
    'Extremadura', 'Galicia', 'Illes Balears', 'La Rioja', 'País Vasco',
    'Principado de Asturias', 'Región de Murcia',
];
// Cuando la actuación excede una comunidad, el impreso tiene su propia opción.
const CCAA_VARIAS = '_ Excede el ámbito territorial de una comunidad autónoma _';

const norm = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');

/**
 * La comunidad autónoma, en la redacción EXACTA del desplegable. La BD guarda
 * "Castilla-La Mancha" pero también hay filas históricas en MAYÚSCULAS o sin
 * guion, y una que no case dejaría la solicitud sin comunidad — que es uno de
 * los campos por los que el Gestor Autonómico la reparte.
 */
function opcionCcaa(ccaa) {
    const n = norm(ccaa);
    if (!n) return '';
    return CCAA_OPCIONES.find(o => norm(o) === n)
        || CCAA_OPCIONES.find(o => norm(o).startsWith(n) || n.startsWith(norm(o)))
        || '';
}

/**
 * Un entero de kWh, en la redacción que pide el impreso: sin decimales y sin
 * separador de miles.
 *
 * ⚠️ Acepta también lo que llega ya formateado en español ("28.852"): `Number()`
 * lo leería como 28,852 —tres órdenes de magnitud menos en la cifra por la que se
 * emiten los CAE— y aquí no hay decimales que perder, así que cualquier punto o
 * coma es separador de millar y se quita. Mismo cuidado que `numeroEs()` con lo
 * que se lee de los PDF del lote.
 */
const entero = (v) => {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[.\s]/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : '';
};

/**
 * Reúne lo que la solicitud declara, a partir del LOTE, de sus expedientes (ya
 * con su nº de actuación y su ahorro verificado) y del sujeto obligado.
 *
 * @param {object} lote          fila de `lotes`
 * @param {Array}  actuaciones   [{ numero_expediente, ficha, n_actuacion, ahorro_kwh }]
 * @param {object} so            fila de `prescriptores` del sujeto obligado
 */
function datosDesdeLote(lote, actuaciones, so) {
    const p = so || {};
    const filas = [...(actuaciones || [])]
        .filter(a => Number(a.n_actuacion) > 0)
        .sort((a, b) => a.n_actuacion - b.n_actuacion);

    return {
        codigo_lote: lote?.codigo || '',
        razon_social: p.razon_social || '',
        nif: p.cif || '',
        representante: [p.nombre_responsable, p.apellidos_responsable].filter(Boolean).join(' ').trim(),
        representante_dni: p.nif_responsable || '',
        // Para un sujeto obligado el código es "SO-" + su NIF (nota 2 del impreso).
        codigo_identificacion: p.codigo_identificacion || (p.cif ? `SO-${p.cif}` : ''),
        anio: String(lote?.anio_actuacion || ''),
        // El total es la SUMA de las filas, no un dato aparte: lo primero que
        // comprueba quien lo revisa es que cuadren, y un total heredado de otro
        // sitio puede haberse quedado atrás.
        ahorro_total: entero(filas.reduce((a, f) => a + (Number(entero(f.ahorro_kwh)) || 0), 0)),
        ccaa: opcionCcaa(lote?.ccaa),
        // Localidad de la firma: el domicilio del sujeto obligado, que es quien
        // firma. El impreso solo pide la localidad; la fecha la pone la firma
        // electrónica.
        localidad: p.municipio ? String(p.municipio).charAt(0).toUpperCase() + String(p.municipio).slice(1).toLowerCase() : '',
        actuaciones: filas.map(f => ({
            n_actuacion: Number(f.n_actuacion),
            numero_expediente: f.numero_expediente,
            titulo_ficha: FICHA_CATALOGO[f.ficha] || '',
            ahorro_kwh: entero(f.ahorro_kwh),
        })),
    };
}

/**
 * Lo que impide presentar la solicitud. Una solicitud con huecos se presenta
 * igual de bien que una completa y el requerimiento llega tres semanas después.
 */
function faltantes(d) {
    const falta = [];
    if (!d.razon_social) falta.push('la razón social del sujeto obligado');
    if (!d.nif) falta.push('el NIF del sujeto obligado');
    if (!d.representante) falta.push('el representante legal');
    if (!d.representante_dni) falta.push('el DNI del representante legal');
    if (!d.codigo_identificacion) falta.push('el código de identificación del solicitante');
    if (!d.anio) falta.push('el año de finalización de la ejecución');
    if (!d.ccaa) falta.push('la comunidad autónoma');
    if (!d.localidad) falta.push('la localidad de firma (municipio del sujeto obligado)');
    if (!d.actuaciones.length) falta.push('las actuaciones con su nº y su ahorro verificado');
    if (d.actuaciones.length > MAX_ACTUACIONES) falta.push(`caben ${MAX_ACTUACIONES} actuaciones y hay ${d.actuaciones.length}`);
    for (const a of d.actuaciones) {
        if (!a.titulo_ficha) falta.push(`la ficha de ${a.numero_expediente}`);
        if (!a.ahorro_kwh) falta.push(`el ahorro verificado de ${a.numero_expediente}`);
    }
    return falta;
}

/** Rellena el formulario oficial y devuelve el PDF. */
async function generarSolicitud(d) {
    const pdf = await PDFDocument.load(fs.readFileSync(PLANTILLA));
    const form = pdf.getForm();
    const helv = await pdf.embedFont(StandardFonts.Helvetica);

    // Los campos que se tocan se les regenera la apariencia UNO A UNO, nunca con
    // `form.updateFieldAppearances()`.
    //
    // ⚠️ En este impreso, la opción "Seleccione código de la ficha" y la primera
    // ficha del catálogo (AGR010) EXPORTAN LA MISMA CADENA: es un fallo de la
    // plantilla oficial. Las filas vacías conservan el valor por defecto, y un
    // repintado global las dejaría diciendo "AGR010: Pantallas térmicas en
    // invernaderos" — o sea, una solicitud que declara diez actuaciones de
    // invernaderos que no existen. Sin tocarlas, conservan su apariencia buena.
    const marcados = [];

    // Tamaño AUTOMÁTICO: la mitad de los campos declaran 0, que significa
    // "ajústalo tú", y pdf-lib no lo implementa (escribiría a 12pt y el título de
    // la ficha —95 caracteres en una celda de 219pt— se saldría de la tabla).
    // Se replica al lector: tope por la ALTURA de la casilla y reducción hasta que
    // quepa a lo ancho. Mismo cálculo que en `anexoActuacionService`.
    const autoSize = (field, valor) => {
        const w = field.acroField.getWidgets()[0];
        if (!w) return null;
        const r = w.getRectangle();
        const ancho = Math.abs(r.width) - 4;          // 2pt de margen a cada lado
        let size = Math.min(12, Math.abs(r.height) * 0.65);
        const txt = String(valor ?? '');
        if (txt && ancho > 0) {
            const unitario = helv.widthOfTextAtSize(txt, 1);
            if (unitario > 0) size = Math.min(size, ancho / unitario);
        }
        return Math.max(4, size);
    };

    const texto = (nombre, valor) => {
        try {
            const f = form.getTextField(nombre);
            f.setText(String(valor ?? ''));
            const s = autoSize(f, valor);
            if (s) f.setFontSize(s);
            f.updateAppearances(helv);
            marcados.push(nombre);
        } catch (e) { console.warn(`[solicitudCae] campo "${nombre}": ${e.message}`); }
    };
    const elegir = (nombre, valor) => {
        try {
            if (!valor) return;
            const f = form.getDropdown(nombre);
            f.select(valor);
            const s = autoSize(f, valor);
            if (s) f.setFontSize(s);
            f.updateAppearances(helv);
            marcados.push(nombre);
        } catch (e) { console.warn(`[solicitudCae] desplegable "${nombre}": ${e.message}`); }
    };
    const marcar = (nombre) => {
        try { form.getCheckBox(nombre).check(); marcados.push(nombre); }
        catch (e) { console.warn(`[solicitudCae] casilla "${nombre}": ${e.message}`); }
    };

    texto('SOLICITANTE Razón social de la entidad', d.razon_social);
    texto('SOLICITANTE NIF', d.nif);
    texto('REPRESENTANTE LEGAL Nombre y apellidos', d.representante);
    texto('REPRESENTANTE LEGAL DNI/NIE', d.representante_dni);
    // Brokergy tramita para un SUJETO OBLIGADO (una comercializadora con obligación
    // de ahorro); el sujeto delegado es otra figura y no es la nuestra.
    marcar('SUJETO OBLIGADO');
    texto('Código de indentificación del solicitante', d.codigo_identificacion);
    texto('Año de finalización de la ejecución', d.anio);
    texto('Ahorro anual total', d.ahorro_total);
    elegir('CC AA', d.ccaa);

    for (const a of d.actuaciones) {
        elegir(`E${a.n_actuacion}`, a.titulo_ficha);
        texto(campoAhorro(a.n_actuacion), a.ahorro_kwh);
    }

    texto('Localidad', d.localidad);

    // NO se aplana, igual que el anexo: si hay que corregir un dato a mano antes
    // de presentarlo se puede, y el recuadro de firma electrónica sigue vivo.
    return Buffer.from(await pdf.save());
}

/**
 * Nombre del fichero. Lleva el código del lote porque fuera de su carpeta
 * —descargado, adjunto a un correo— "Solicitud de emisión de CAE.pdf" no dice de
 * qué lote es, y todos los lotes generan uno con ese mismo nombre.
 */
const nombreSolicitud = (d) => `Solicitud de emision de CAE - ${d.codigo_lote}.pdf`.replace(/\s+/g, ' ');

module.exports = {
    PLANTILLA,
    MAX_ACTUACIONES,
    CCAA_VARIAS,
    opcionCcaa,
    datosDesdeLote,
    faltantes,
    generarSolicitud,
    nombreSolicitud,
};
