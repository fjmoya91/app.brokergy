/**
 * anexoActuacionService — El ANEXO del MITECO por actuación estandarizada, el que
 * viaja dentro del ZIP "ActuacionE{n}" de la solicitud de emisión de CAE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLA — no se REPLICA el impreso: se RELLENA el oficial.
 * `plantillas/AnexoActuacionEstandarizada.pdf` es el formulario del Ministerio con
 * sus 33 campos vivos. Escribir dentro de él es la única forma de que el escudo,
 * la GillSansMT de la cabecera, la Calibri del cuerpo, los márgenes y las cuatro
 * notas al pie sean EXACTAMENTE los suyos — porque son los suyos. Rehacerlo en
 * HTML sería una imitación de un documento que ya tenemos, y el que lo recibe
 * compara contra el modelo oficial.
 *
 * La plantilla del repo está VACIADA a propósito: la que nos pasaron venía con los
 * datos de un expediente real (su referencia catastral, su ahorro y su dictamen), y
 * una plantilla no puede llevar dentro los datos de un cliente.
 *
 * REGLA — el título de la ficha se ELIGE del catálogo, no se escribe.
 * "Código de ficha" es un desplegable con las 115 fichas del catálogo oficial. Se
 * selecciona la opción, así que el texto es literalmente el del Ministerio: ni una
 * tilde ni un punto de diferencia con lo que espera quien lo revisa.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const PLANTILLA = path.join(__dirname, '..', 'plantillas', 'AnexoActuacionEstandarizada.pdf');

// Las cuatro fichas con las que trabajamos, con el texto EXACTO de la opción del
// desplegable oficial. Si alguna vez se añade una ficha, hay que copiar su opción
// tal cual: `pdf.getForm().getDropdown('Código de ficha').getOptions()` las lista.
const FICHA_CATALOGO = {
    RES060: 'RES060: Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico.',
    RES080: 'RES080: Rehabilitación profunda de edificios de viviendas.',
    RES093: 'RES093: Hibridación en paralelo de caldera de comb. con bomba de calor, edif. residenciales (D1, D2 o D3).',
    TER100: 'TER100: Sustitución de caldera de combustión existente por bomba de calor de accionamiento eléctrico.',
};

// Vida útil por ficha, para cuando el dictamen todavía no la ha fijado. Es la que
// declara cada ficha del catálogo y la que imprimen los informes de verificación.
const VIDA_UTIL = { RES060: 15, RES093: 15, TER100: 15, RES080: 25 };

// CNAE de "instalaciones de fontanería, sistemas de calefacción y aire
// acondicionado", que es el que viene declarándose y el que recogen los informes
// de verificación. El impreso avisa de que en residencial no es necesario.
const CNAE_POR_DEFECTO = '4322';

// ─────────────────────────────────────────────────────────────────────────────
// Huso UTM. Trabajamos en la España peninsular central, que es el 30, pero el dato
// va firmado en una declaración responsable y no puede salir de una suposición
// muda: se deduce de la PROVINCIA y solo se apartan del 30 las que de verdad caen
// en otro huso. Ante la duda, 30 — y el que genera lo ve en pantalla.
// ─────────────────────────────────────────────────────────────────────────────
const HUSO_POR_PROVINCIA = {
    // Canarias
    'LAS PALMAS': '28', 'SANTA CRUZ DE TENERIFE': '28',
    // Noroeste peninsular
    'A CORUÑA': '29', 'LA CORUÑA': '29', 'LUGO': '29', 'OURENSE': '29',
    'ORENSE': '29', 'PONTEVEDRA': '29',
    // Extremo oriental
    'BARCELONA': '31', 'GIRONA': '31', 'GERONA': '31', 'LLEIDA': '31', 'LERIDA': '31',
    'TARRAGONA': '31', 'ILLES BALEARS': '31', 'BALEARES': '31',
};

const normProv = (v) => String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().trim();

function husoDe(provincia) {
    const p = normProv(provincia);
    for (const [k, v] of Object.entries(HUSO_POR_PROVINCIA)) {
        if (normProv(k) === p) return v;
    }
    return '30';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tamaño de letra de cada campo, MEDIDO sobre el impreso oficial relleno.
//
// El PDF lo lleva en el /DA de cada campo, pero ahí no se puede leer con garantías
// —pdf-lib 1.17 no expone `getFontSize()`, y cualquier herramienta que reescriba
// la plantilla puede serializar el /DA de forma que deje de encontrarse el `Tf`—.
// Escrito aquí es explícito, se puede leer y no depende de cómo se guardó el
// fichero.
//
//   0 = AUTOMÁTICO: lo calcula `autoSize` como hace el lector de PDF.
// ─────────────────────────────────────────────────────────────────────────────
const TAMANO_CAMPO = {
    'Nº DE ACTUACIÓN': 14,                                   // Calibri Bold en el título
    'Código CNAE 2009': 14,
    'AHORRO ANUAL DE ENERGÍA FINAL CONSEGUIDO': 14,
    'FECHA INICIO DE EJECUCIÓN DE ACTUACIÓN': 14,
    'FECHA FIN DE EJECUCIÓN DE ACTUACIÓN': 14,
    'Inversión realizada': 14,
    'Costes operativos estimados para mantenimiento': 14,
    // Los demás van a 0 (automático): el título de la ficha son 95 caracteres en
    // una celda de 273pt y baja a ~6pt; las coordenadas, a ~8-9pt.
};

// ─── Formato ──────────────────────────────────────────────────────────────────
// El impreso pide el ahorro "en kWh, sin posiciones decimales" y los importes "en
// euros". Se escriben como los escribiría una persona en español, que es como los
// trae la plantilla de ejemplo del Ministerio.
const entero = (n) => Number.isFinite(Number(n))
    ? Math.round(Number(n)).toLocaleString('es-ES', { useGrouping: 'always' }) : '';

// `useGrouping: 'always'`: en español los miles de CUATRO dígitos no se agrupan
// por defecto ("5776,86"), y en un impreso oficial el punto de millar se espera
// siempre — la plantilla del Ministerio lo trae ("11.434,64 €").
const euros = (n) => Number.isFinite(Number(n))
    ? `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })} €` : '';

// Las fechas llegan de la BD como 'YYYY-MM-DD' y el impreso las lleva en dd/mm/aaaa.
// Una fecha que no se entienda se deja VACÍA: es preferible un hueco que una fecha
// inventada en un documento que se presenta a la Administración.
function fecha(v) {
    if (!v) return '';
    const s = String(v).trim();
    let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);          // 'YYYY-MM-DD' de la BD
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    // La fecha se BUSCA dentro del texto, no se exige que sea todo. El dictamen la
    // escribe como viñeta y llega con el punto pegado ("28/08/2026."): exigiendo
    // que la cadena entera fuera la fecha, se descartaba y el anexo salía sin ella.
    m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    return '';
}

/**
 * Datos que necesita un anexo. Los arma `anexosDeLote` desde el expediente; se
 * expone aparte para poder generar uno suelto y para poder probarlo.
 */
function datosDesdeExpediente(exp, { orden, ficha, dictamen = {}, huso = null } = {}) {
    const inst = exp?.instalacion || {};
    const doc = exp?.documentacion || {};
    const v = inst.verificacion || {};

    return {
        numero_expediente: exp?.numero_expediente || '',
        n_actuacion: String(orden || ''),
        ficha,
        titulo_ficha: FICHA_CATALOGO[ficha] || '',
        utm_x: inst.coord_x != null ? String(inst.coord_x) : '',
        utm_y: inst.coord_y != null ? String(inst.coord_y) : '',
        huso: huso || husoDe(inst.provincia),
        referencia_catastral: inst.ref_catastral || '',
        cnae: CNAE_POR_DEFECTO,
        vida_util: String(v.vida_util_anios || VIDA_UTIL[ficha] || ''),
        // El ahorro y la inversión son los VERIFICADOS: es lo que el organismo ha
        // dado por bueno y lo que figura en su dictamen. Con el estimado, el anexo
        // diría una cifra distinta de la del dictamen que lo acompaña.
        ahorro_kwh: entero(v.ahorro_verificado_kwh),
        inversion: euros(v.inversion_verificada_eur),
        costes_operativos: euros(0),
        fecha_inicio: fecha(doc.fecha_inicio_cifo),
        fecha_fin: fecha(doc.fecha_fin_cifo),
        dictamen_numero: dictamen.numero_dictamen || v.dictamen_numero || '',
        dictamen_fecha: fecha(dictamen.fecha_emision || v.dictamen_fecha),
    };
}

/**
 * Qué le falta a un anexo para poder presentarse. Se comprueba ANTES de generar:
 * un anexo con huecos se presenta igual de bien que uno completo y el requerimiento
 * llega tres semanas después.
 */
function faltantes(d) {
    const f = [];
    if (!d.n_actuacion) f.push('el número de actuación');
    if (!d.titulo_ficha) f.push('el código de ficha del catálogo');
    if (!d.utm_x || !d.utm_y) f.push('las coordenadas UTM');
    if (!d.referencia_catastral) f.push('la referencia catastral');
    if (!d.vida_util) f.push('la vida útil');
    if (!d.ahorro_kwh) f.push('el ahorro verificado');
    if (!d.inversion) f.push('la inversión verificada');
    if (!d.fecha_inicio) f.push('la fecha de inicio de la actuación');
    if (!d.fecha_fin) f.push('la fecha de fin de la actuación');
    if (!d.dictamen_numero) f.push('la identificación del dictamen');
    if (!d.dictamen_fecha) f.push('la fecha del dictamen');
    return f;
}

/**
 * Rellena el formulario oficial y devuelve el PDF.
 *
 * NO se aplana, igual que el modelo del Ministerio: si hay que corregir un dato a
 * mano antes de presentarlo, se puede. Las apariencias se regeneran con la fuente
 * que cada campo ya trae definida.
 *
 * @param {object} d  datos de `datosDesdeExpediente`
 * @returns {Promise<Buffer>}
 */
async function generarAnexo(d) {
    const pdf = await PDFDocument.load(fs.readFileSync(PLANTILLA));
    const form = pdf.getForm();
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // ── Tamaño AUTOMÁTICO ─────────────────────────────────────────────────────
    // La mitad de los campos del impreso llevan tamaño 0, que en un PDF significa
    // "ajústalo tú". pdf-lib no lo implementa: escribe a 12pt y el título de la
    // ficha —95 caracteres en una celda de 273pt— se sale de la tabla, y las
    // coordenadas y la referencia catastral se cortan a media cifra.
    //
    // Se replica lo que hace el lector: el tope lo pone la ALTURA de la casilla
    // (×0,65, medido contra el PDF de ejemplo: casilla de 15,7pt → 10,2pt) y, si
    // aun así el texto no cabe a lo ANCHO, se reduce hasta que quepa.
    const autoSize = (field, valor, font) => {
        const w = field.acroField.getWidgets()[0];
        if (!w) return null;
        const r = w.getRectangle();
        const alto = Math.abs(r.height);
        const ancho = Math.abs(r.width) - 4;        // los 2pt de margen a cada lado
        let size = Math.min(12, alto * 0.65);
        const txt = String(valor ?? '');
        if (txt && ancho > 0) {
            const anchoUnitario = font.widthOfTextAtSize(txt, 1);
            if (anchoUnitario > 0) size = Math.min(size, ancho / anchoUnitario);
        }
        return Math.max(4, size);
    };

    const texto = (nombre, valor) => {
        try {
            const f = form.getTextField(nombre);
            f.setText(String(valor ?? ''));
            // Solo se calcula en los campos que declaran 0: los que traen un tamaño
            // fijo (14pt del ahorro, de las fechas y de los importes; 11pt del nº de
            // actuación) son decisión del impreso y se respetan.
            const fijo = TAMANO_CAMPO[nombre];
            const s = fijo || autoSize(f, valor, helv);
            if (s) f.setFontSize(s);
        } catch (e) { console.warn(`[anexoActuacion] campo "${nombre}": ${e.message}`); }
    };
    const marcar = (nombre) => {
        try { form.getCheckBox(nombre).check(); }
        catch (e) { console.warn(`[anexoActuacion] casilla "${nombre}": ${e.message}`); }
    };
    const elegir = (nombre, valor) => {
        try {
            if (!valor) return;
            const f = form.getDropdown(nombre);
            f.select(valor);
            const s = TAMANO_CAMPO[nombre] || autoSize(f, valor, helv);
            if (s) f.setFontSize(s);
        } catch (e) { console.warn(`[anexoActuacion] desplegable "${nombre}": ${e.message}`); }
    };

    // El nº de actuación es UN campo repetido doce veces (título, nombre del ZIP y
    // cada uno de los adjuntos): se escribe una vez y sale en los doce sitios.
    texto('Nº DE ACTUACIÓN', d.n_actuacion);
    elegir('Código de ficha', d.titulo_ficha);

    texto('Coordenadas UTM: X', d.utm_x);
    texto('Coordenadas UTM: Y', d.utm_y);
    elegir('Huso', d.huso);
    texto('Referencia catastral', d.referencia_catastral);
    texto('Código CNAE 2009', d.cnae);
    texto('VIDA ÚTIL DE LA ACTUACIÓN', d.vida_util);
    texto('AHORRO ANUAL DE ENERGÍA FINAL CONSEGUIDO', d.ahorro_kwh);
    texto('FECHA INICIO DE EJECUCIÓN DE ACTUACIÓN', d.fecha_inicio);
    texto('FECHA FIN DE EJECUCIÓN DE ACTUACIÓN', d.fecha_fin);
    texto('Inversión realizada', d.inversion);
    texto('Costes operativos estimados para mantenimiento', d.costes_operativos);

    // Ayudas públicas. Se declara lo mismo que en el Anexo I que firma el titular
    // —"NO se ha solicitado"—, y la tabla queda vacía. Si algún día un expediente
    // lleva subvención, el dato tiene que venir de esa declaración firmada y no de
    // aquí: son el mismo hecho declarado dos veces y no pueden decir cosas
    // distintas.
    if (d.ayuda_solicitada) {
        marcar('SÍ se ha solicitado ayuda o subvención y en ese ca');
        if (d.ayuda_estado === 'obtenida') marcar('Se ha obtenido dicha ayuda o subvención');
        else if (d.ayuda_estado === 'denegada') marcar('No se ha obtenido dicha ayuda o subvención');
        else if (d.ayuda_estado === 'pendiente') marcar('Está pendiente de resolución dicha ayuda o subvenc');
        const a = d.ayuda || {};
        texto('Denominación del programa', a.denominacion);
        texto('Entidad u órgano gestor', a.entidad);
        texto('Año', a.anio);
        texto('Disposición reguladora', a.disposicion);
        texto('Número de expediente', a.num_expediente);
        texto('Estado de la concesión', a.estado);
        texto('Fecha de solicitud', fecha(a.fecha_solicitud));
        texto('Fecha de la resolución de concesión', fecha(a.fecha_resolucion));
        texto('Cuantía obtenida o esperada en euros', a.cuantia);
    } else {
        marcar('NO se ha solicitado ninguna ayuda o subvención');
    }

    // Documentación que se adjunta. Los cuatro apartados van siempre: el convenio,
    // el dictamen con su informe, los documentos de la ficha y los demás
    // justificativos. Es lo que de verdad se mete en el ZIP.
    marcar('E 1 Convenio CAE');
    marcar('E 2 Dictamen favorable');
    marcar('E 3 Documentos justificativos');
    marcar('E 4 Otros documentos justificativos');

    // El dictamen cubre las cinco actuaciones del lote, así que se adjunta solo en
    // la primera y en todas se cita su identificación única y su fecha. Es
    // justamente lo que pide el pie de ese apartado.
    texto('Identificación única del dictamen', d.dictamen_numero);
    texto('Fecha de emisión del dictamen', d.dictamen_fecha);

    // El nº de actuación va en NEGRITA en el impreso (Calibri Bold en el título y
    // en cada apartado); el resto de los datos, en Helvetica, que es con lo que
    // está rellenado el modelo del Ministerio.
    form.updateFieldAppearances(helv);
    try { form.getTextField('Nº DE ACTUACIÓN').updateAppearances(helvBold); } catch { /* noop */ }

    return Buffer.from(await pdf.save());
}

// Nombre del fichero: el EXPEDIENTE por delante, como el resto de los documentos
// del lote. Los anexos acaban en la carpeta de su expediente, junto a los demás
// papeles de esa actuación, y ahí lo que identifica el fichero es de quién es —el
// número de actuación solo tiene sentido dentro de la solicitud.
const nombreAnexo = (d) => `${d.numero_expediente} - AnexoE${d.n_actuacion}.pdf`;

module.exports = {
    FICHA_CATALOGO,
    VIDA_UTIL,
    CNAE_POR_DEFECTO,
    husoDe,
    datosDesdeExpediente,
    faltantes,
    generarAnexo,
    nombreAnexo,
    PLANTILLA,
};
