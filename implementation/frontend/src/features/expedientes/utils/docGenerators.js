
/**
 * docGenerators.js
 * Generadores compartidos para Anexo I y Anexo de Cesión.
 */

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

// Mapa código de provincia (2 díg.) → nombre. Permite mostrar la provincia
// cuando solo tenemos el código (p.ej. oportunidades migradas) o el CP.
export const PROVINCE_CODE_TO_NAME = {
    '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería',
    '05': 'Ávila', '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona',
    '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
    '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
    '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
    '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
    '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
    '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
    '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
    '37': 'Salamanca', '38': 'S.C. de Tenerife', '39': 'Cantabria', '40': 'Segovia',
    '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
    '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya',
    '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

// Mapa código de provincia → Comunidad Autónoma (el Catastro NO devuelve la CCAA;
// se deriva del código de provincia). Nombres alineados con el selector de CCAA
// del módulo de Instalación.
export const PROVINCE_CODE_TO_CCAA = {
    '01': 'País Vasco', '02': 'Castilla-La Mancha', '03': 'Comunidad Valenciana', '04': 'Andalucía',
    '05': 'Castilla y León', '06': 'Extremadura', '07': 'Baleares', '08': 'Cataluña',
    '09': 'Castilla y León', '10': 'Extremadura', '11': 'Andalucía', '12': 'Comunidad Valenciana',
    '13': 'Castilla-La Mancha', '14': 'Andalucía', '15': 'Galicia', '16': 'Castilla-La Mancha',
    '17': 'Cataluña', '18': 'Andalucía', '19': 'Castilla-La Mancha', '20': 'País Vasco',
    '21': 'Andalucía', '22': 'Aragón', '23': 'Andalucía', '24': 'Castilla y León',
    '25': 'Cataluña', '26': 'La Rioja', '27': 'Galicia', '28': 'Comunidad de Madrid',
    '29': 'Andalucía', '30': 'Región de Murcia', '31': 'Navarra', '32': 'Galicia',
    '33': 'Asturias', '34': 'Castilla y León', '35': 'Canarias', '36': 'Galicia',
    '37': 'Castilla y León', '38': 'Canarias', '39': 'Cantabria', '40': 'Castilla y León',
    '41': 'Andalucía', '42': 'Castilla y León', '43': 'Cataluña', '44': 'Aragón',
    '45': 'Castilla-La Mancha', '46': 'Comunidad Valenciana', '47': 'Castilla y León', '48': 'País Vasco',
    '49': 'Castilla y León', '50': 'Aragón', '51': 'Ceuta', '52': 'Melilla',
};

/**
 * Resuelve la dirección de la INSTALACIÓN (la vivienda donde se ejecutó la
 * actuación), que es la vinculada al Catastro de la oportunidad y que NUNCA debe
 * confundirse con el domicilio del cliente (que puede ser distinto).
 *
 * Regla de oro (acordada 2026-06-21): en los documentos, la dirección de la
 * INSTALACIÓN sale de la oportunidad/Catastro; el domicilio del CLIENTE solo se
 * usa en los datos legales (propietario/cedente). Por eso aquí NO se cae nunca a
 * `clientes.*`.
 *
 * Prioridad:
 *   1. instalacion.*      → cacheado desde el Catastro o sobrescrito a mano en el
 *                           módulo de Instalación (fuente autoritativa, partes sueltas).
 *   2. oportunidad inputs → dirección de la vivienda capturada del Catastro al
 *                           crear/migrar la oportunidad (datos_calculo[.inputs]).
 *                           OJO: en migradas, `direccion` suele ser la dirección
 *                           COMPLETA (con CP, municipio y provincia) y `provincia`
 *                           un código numérico.
 *   3. ubicacion.*        → legacy.
 *
 * Devuelve partes sueltas (calle, cp, municipio, provincia, ccaa, refCatastral)
 * y la cadena completa `full` ya formateada para los campos de una sola línea.
 */
export const buildInstalacionAddress = (expediente) => {
    const exp = expediente || {};
    const op = exp.oportunidades || {};
    const inst = exp.instalacion || {};
    const loc = exp.ubicacion || {};
    const dc = op.datos_calculo || {};
    // Los inputs del Catastro pueden estar tanto en datos_calculo como en
    // datos_calculo.inputs (doble-spread al guardar). Fusionamos para leer de
    // cualquiera de los dos sitios.
    const opIn = { ...dc, ...(dc.inputs || {}) };
    const isNum = (v) => /^\d+$/.test(String(v ?? '').trim());

    // Cuando la instalación comparte domicilio con el cliente (misma_direccion = SI),
    // la dirección NO se replica en `instalacion`: vive en la ficha del cliente, que
    // pasa a ser la fuente de respaldo. Si misma_direccion === false, la instalación
    // tiene dirección propia y NO se debe usar la del cliente.
    const cli = exp.clientes || {};
    const cliAddr = inst.misma_direccion === false ? {} : cli;

    const calle = inst.direccion || opIn.direccion || opIn.address || cliAddr.direccion || loc.direccion || '';
    const num = inst.num || loc.num || '';
    const cp = inst.codigo_postal || opIn.cp || opIn.codigo_postal || cliAddr.codigo_postal || loc.cp || '';
    const municipio = inst.municipio || opIn.municipio || cliAddr.municipio || loc.municipio || '';

    // Código de provincia: de un campo de código, de una provincia que llega como
    // número, o de los 2 primeros dígitos del CP.
    const provCodeRaw = inst.provincia_cod || opIn.provincia_cod
        || (isNum(inst.provincia) ? inst.provincia : '')
        || (isNum(opIn.provincia) ? opIn.provincia : '')
        || (cp ? String(cp).substring(0, 2) : '');
    const provCode = provCodeRaw ? String(provCodeRaw).padStart(2, '0') : '';

    // Nombre de provincia (nunca un código). geoContext deja el nombre en
    // datos_calculo.provincia; si no, lo derivamos del código.
    const provincia = [inst.provincia, opIn.provincia_nombre, dc.provincia, opIn.provincia, cliAddr.provincia, loc.provincia]
        .find(v => v && !isNum(v)) || PROVINCE_CODE_TO_NAME[provCode] || '';

    // CCAA: el Catastro no la da; preferimos lo guardado y, si no, la derivamos
    // del código de provincia.
    const ccaa = inst.ccaa || dc.ccaa || opIn.ccaa || cliAddr.ccaa || PROVINCE_CODE_TO_CCAA[provCode] || '';
    const refCatastral = inst.ref_catastral || op.ref_catastral || opIn.rc || opIn.ref_catastral || loc.ref_catastral || '';

    // Si `calle` ya es una dirección COMPLETA (contiene un CP de 5 dígitos), la
    // usamos tal cual (caso migrado) y NO volvemos a añadir CP/municipio/provincia
    // para no duplicar ni colar el código de provincia.
    const calleFull = [calle, num].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const full = /\b\d{5}\b/.test(calleFull)
        ? calleFull
        : [
            calleFull,
            cp,
            municipio,
            provincia ? `(${provincia})` : ''
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    return { calle, num, cp, municipio, provincia, provinciaCod: provCode, ccaa, refCatastral, full };
};

/**
 * Precio CAE (€/MWh) que se ofrece al cliente. Fuentes por prioridad:
 *   1. Override explícito de la pestaña Económico (lo que el usuario fija a mano).
 *   2. Valor capturado en la oportunidad. OJO: la clave real es `caePriceClient`;
 *      `cae_client_rate` se mantiene como alias legacy.
 *   3. Default por ficha (95 €/MWh RES060/RES093, 60 €/MWh RES080), EL MISMO que usa
 *      expedienteFinancials, para que el documento y la pestaña Económico no se
 *      contradigan (antes el Anexo caía a 0 y mostraba '___').
 * `explicit` indica si el precio viene de un override puesto a mano (para avisar en
 * la validación de envío cuando solo se está usando el valor por defecto).
 */
export const getClientCaeRate = (expediente) => {
    const exp = expediente || {};
    const inst = exp.instalacion || {};
    const opIn = exp.oportunidades?.datos_calculo?.inputs || {};
    const numexp = String(exp.numero_expediente || '');
    const isRes080 = numexp.includes('RES080') || exp.oportunidades?.ficha === 'RES080';
    const defaultRate = isRes080 ? 60 : 95;

    const override = inst.economico_override?.cae_client_rate;
    const explicit = override !== undefined && override !== null && override !== '';
    const rate = parseFloat(override ?? opIn.caePriceClient ?? opIn.cae_client_rate) || defaultRate;
    return { rate, explicit, defaultRate };
};

export const ANEXO_I_TEXTS = {
    TITULO_PRINCIPAL: "ANEXO I DECLARACIÓN RESPONSABLE FORMALIZADA POR EL PROPIETARIO INICIAL DEL AHORRO REFERIDA A LA SOLICITUD Y/U OBTENCIÓN DE AYUDAS O SUBVENCIONES PÚBLICAS PARA LA MISMA ACTUACIÓN DE AHORRO DE ENERGÍA",
    NOMBRE_ACTUACION_FIXED: "Sustitución caldera existente por bomba de calor (aerotermia)",
    BONO_LABELS: [
        'Bono social eléctrico para consumidores vulnerables',
        'Bono social eléctrico para consumidores vulnerables severos',
        'Bono social eléctrico en riesgo de exclusión social',
        'Bono social de justicia energética',
        'Bono social térmico',
        'Ninguno de los anteriores',
    ]
};

export const DOC_WIDTH = '794px';
export const PAGE_PADDING_ANEXO_I = '90px 38px 18px 76px';

export const ANEXO_I_CSS = `
    .doc-wrap { background: #e8e8e8; width: ${DOC_WIDTH}; padding: 20px 0; }
    .doc-page {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12pt;
        color: #000;
        background: white;
        width: ${DOC_WIDTH};
        min-height: 1123px;
        padding: ${PAGE_PADDING_ANEXO_I};
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin: 0 auto 20px auto;
        box-shadow: 0 2px 16px rgba(0,0,0,0.18);
        position: relative;
    }
    .doc-page:last-child { margin-bottom: 0; }
    .doc-title { text-align: center; font-weight: bold; font-size: 12pt; margin-bottom: 20px; text-transform: uppercase; line-height: 1.3; }
    .doc-sec-title { font-size: 12pt; margin: 14px 0 10px 0; font-weight: normal; }
    .doc-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12pt; table-layout: fixed; }
    .doc-table td { border: 1px solid #000; padding: 4px 8px; vertical-align: middle; line-height: 1.25; word-wrap: break-word; }
    .doc-table td.lbl { background-color: #f2f2f2; width: 40%; }
    .doc-p { font-size: 12pt; line-height: 1.4; margin-bottom: 8px; text-align: justify; }
    .doc-check-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px; font-size: 12pt; }
    .doc-check-box { 
        width: 15px; height: 15px; border: 1px solid #000; display: flex; align-items: center; justify-content: center; 
        font-size: 11pt; font-weight: bold; flex-shrink: 0; margin-top: 3px; background: white; 
    }
    .doc-fn { font-size: 8pt; line-height: 1.2; margin-top: auto; padding-top: 8px; text-align: justify; }
    .doc-signature { margin-top: 30px; font-size: 12pt; }
    .doc-editable { cursor: text; min-height: 1.2em; border-bottom: 1px dashed transparent; }
    .doc-editable:hover { background-color: #f8f9fa; border-bottom: 1px dashed #ced4da; }
`;

export const ANEXO_CESION_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
.conv-wrap { font-family: 'Inter', Arial, sans-serif; width: ${DOC_WIDTH}; margin: 0 auto; -webkit-font-smoothing: antialiased; }
.conv-page {
    width: 794px; height: 1122px;
    background: white;
    display: flex; flex-direction: column;
    page-break-after: always; break-after: page;
    overflow: hidden;
}
.conv-hdr {
    flex-shrink: 0;
    background: linear-gradient(135deg, #08090C 0%, #1C1E26 100%);
    padding: 14px 36px;
    display: flex; align-items: center; justify-content: space-between;
    position: relative; overflow: hidden;
}
.conv-hdr::after {
    content: '';
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(90deg, #FF6D00, #FF9A3C, transparent);
}
.conv-hdr-left { display: flex; flex-direction: column; gap: 1px; }
.conv-expte-label { font-size: 7.5px; color: rgba(255,255,255,0.35); font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; }
.conv-expte-num { font-size: 11px; color: rgba(255,255,255,0.85); font-weight: 700; letter-spacing: 0.3px; }
.conv-logo-img { height: 20px; width: auto; filter: invert(1) brightness(10); position: relative; z-index: 1; }
.conv-body { flex: 1; padding: 24px 36px 16px; display: flex; flex-direction: column; overflow: hidden; }
.conv-title {
    text-align: center;
    font-size: 14px; font-weight: 800; color: #08090C;
    line-height: 1.45; letter-spacing: 0.5px;
    margin-bottom: 16px;
    padding: 12px 24px;
    background: linear-gradient(135deg, #FFF3E0, #FFF8ED);
    border-left: 4px solid #FF6D00;
    border-radius: 0 6px 6px 0;
}
.conv-dateline { text-align: right; font-size: 11px; color: #737373; font-style: italic; margin-bottom: 12px; }
.conv-subtitle {
    display: flex; align-items: center; gap: 10px;
    margin: 14px 0 10px;
    font-size: 11px; font-weight: 800; color: #08090C;
    letter-spacing: 2.5px; text-transform: uppercase;
}
.conv-subtitle::before, .conv-subtitle::after { content: ''; flex: 1; height: 1px; background: #E5E5E5; }
.conv-p { font-size: 11px; line-height: 1.65; color: #404040; margin-bottom: 10px; text-align: justify; }
.conv-p strong, .conv-p b { color: #171717; font-weight: 700; }
.conv-cl { margin-bottom: 10px; }
.conv-cl p { font-size: 11px; line-height: 1.65; color: #404040; text-align: justify; margin-bottom: 4px; }
.conv-cl p strong, .conv-cl p b { color: #171717; font-weight: 700; }
.conv-cl li { font-size: 11px; line-height: 1.65; color: #404040; margin-left: 20px; margin-bottom: 2px; }
.conv-cuenta {
    background: #F8F8F8; border: 1px solid #E0E0E0;
    border-left: 4px solid #FF6D00; border-radius: 0 5px 5px 0;
    padding: 10px 18px; text-align: center;
    font-size: 12px; font-weight: 700; color: #171717;
    margin: 10px 0; letter-spacing: 2px; font-family: monospace;
}
.conv-sign { margin-top: auto; padding-top: 16px; border-top: 1px solid #E5E5E5; }
.conv-sign-intro { font-size: 10px; color: #737373; text-align: justify; line-height: 1.5; margin-bottom: 16px; font-style: italic; }
.conv-sign-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.conv-sign-col { display: flex; flex-direction: column; }
.conv-sign-lbl { font-size: 9px; font-weight: 800; color: #9E9E9E; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
.conv-sign-box { height: 165px; border-bottom: 1px solid #D0D0D0; position: relative; }
.conv-sign-img { position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); height: 160px; width: auto; }
.conv-sign-name { font-size: 10px; color: #555; font-weight: 500; margin-top: 8px; }
.conv-footer {
    flex-shrink: 0; padding: 10px 36px;
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid #F0F0F0; background: #FAFAFA;
}
.conv-footer-v { font-size: 8px; color: #BDBDBD; font-weight: 500; }
.conv-footer-b { font-size: 8px; font-weight: 800; color: #FF6D00; letter-spacing: 1px; }
.conv-footer-pg { font-size: 8px; color: #BDBDBD; font-weight: 700; }
`;

export const buildAnexoIHtml = (expediente, results, states = {}, isForPdf = true) => {
    const {
        bonoSocial = [false, false, false, false, false, true],
        noSolicitado = true,
        seSolicitado = false,
        ayudaOptions = [false, false, false],
        ayudaFields = {}
    } = states;

    const { oportunidades: op = {}, clientes: cliente = {}, instalacion: inst = {}, numero_expediente: numexpte = '' } = expediente;

    const fichaType = numexpte.includes('RES080') ? 'RES080'
                    : numexpte.includes('RES093') ? 'RES093'
                    : (op.ficha || 'RES060');

    const nombreActuacion = fichaType === 'RES080'
        ? 'Rehabilitación profunda de edificios de viviendas'
        : fichaType === 'RES093'
            ? 'Hibridación de combustión con bomba de calor de accionamiento eléctrico'
            : ANEXO_I_TEXTS.NOMBRE_ACTUACION_FIXED;

    const codigoFicha = fichaType === 'RES080'
        ? 'RES080: Mejora de la eficiencia energética de instalaciones térmicas'
        : fichaType === 'RES093'
            ? 'RES093: Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3'
            : 'RES060: Sustitución de caldera de combustión por una bomba de calor tipo aire-aire, aire-agua, agua-agua o combinadas';
    // Dirección de la INSTALACIÓN (vivienda del Catastro), NUNCA la del cliente.
    const instAddr = buildInstalacionAddress(expediente);
    const ccaa = (instAddr.ccaa || 'CASTILLA-LA MANCHA').toUpperCase();
    const dirActuacion = instAddr.full.toUpperCase() || '___________';
    const opInputs = op?.datos_calculo?.inputs || {};
    // inst.cambio_acs es autoritativo (fijado por el usuario en InstalacionModule);
    // si no está establecido aún, cae al valor del calculador de la oportunidad.
    const hasAcs = inst.cambio_acs != null
        ? !!(inst.cambio_acs === true || inst.cambio_acs === 'si')
        : !!(opInputs.changeAcs === true || opInputs.changeAcs === 'si' || opInputs.incluir_acs === true || opInputs.incluir_acs === 'si');
    const snExt = inst.aerotermia_cal?.numero_serie || '___________';
    const snInt = inst.misma_aerotermia_acs ? snExt : (inst.aerotermia_acs?.numero_serie || '___________');
    const refCatastral = instAddr.refCatastral || '___________';
    const serialsHtml = hasAcs ? `Ud. exterior: ${snExt}<br>Ud. interior: ${snInt}` : `Ud. exterior: ${snExt}`;
    const nombrePropietario = [cliente.nombre_razon_social, cliente.apellidos].filter(Boolean).join(' ') || '___________';
    const nif = cliente.dni_nie || cliente.dni || '___________';
    const domicilio = [cliente.direccion, cliente.codigo_postal, cliente.municipio].filter(Boolean).join(', ') || '___________';
    const municipioFirma = (cliente.municipio || '___________').toUpperCase();
    const fechaFirma = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    const cb = (v) => v ? 'X' : '';
    const edVal = (f) => ayudaFields[f] || '';

    const content = `
        <div class="doc-page">
            <div class="doc-title">${ANEXO_I_TEXTS.TITULO_PRINCIPAL}</div>
            <div class="doc-sec-title">1. Identificación de la actuación de ahorro de energía</div>
            <table class="doc-table">
                <tr><td class="lbl">Nombre de la actuación</td><td>${nombreActuacion}</td></tr>
                <tr><td class="lbl">Código y nombre de la ficha</td><td>${codigoFicha}</td></tr>
                <tr><td class="lbl">Comunidad autónoma en la que se ejecutó la actuación<sup>1</sup></td><td>${ccaa}</td></tr>
                <tr><td class="lbl">Dirección postal de la instalación en que se ejecutó la actuación</td><td>${dirActuacion}</td></tr>
                <tr><td class="lbl">Referencia catastral de la localización de la actuación</td><td>${refCatastral}</td></tr>
                <tr><td class="lbl">En su caso, número de serie de los equipos</td><td>${serialsHtml}</td></tr>
            </table>
            <div class="doc-sec-title">2. Identificación del propietario inicial del ahorro y del beneficiario</div>
            <table class="doc-table">
                <tr><td class="lbl">Propietario inicial del ahorro<sup>2</sup> (Nombre y apellidos / Razón social)</td><td colspan="2">${nombrePropietario}</td><td style="width:10%">NIF/NIE</td><td>${nif}</td></tr>
                <tr><td class="lbl">Domicilio</td><td colspan="4">${domicilio}</td></tr>
                <tr><td class="lbl">Teléfono</td><td colspan="4">${cliente.tlf || cliente.telefono || '___________'}</td></tr>
                <tr><td class="lbl">Correo electrónico</td><td colspan="4">${cliente.email || '___________'}</td></tr>
            </table>
            <div class="doc-p" style="font-size: 11pt; margin-top: 6px">En el caso de que el propietario inicial del ahorro no coincida con el beneficiario del ahorro, completar también la siguiente tabla:</div>
            <table class="doc-table">
                <tr><td class="lbl">Beneficiario del ahorro<sup>3</sup> (Nombre y apellidos / Razón social)</td><td colspan="2"></td><td style="width:10%">NIF/NIE</td><td></td></tr>
                <tr><td class="lbl">Domicilio</td><td colspan="4"></td></tr>
                <tr><td class="lbl">Teléfono</td><td colspan="4"></td></tr>
                <tr><td class="lbl">Correo electrónico</td><td colspan="4"></td></tr>
            </table>
            <div class="doc-fn">
                <sup>1</sup> En el caso de que la actuación exceda el ámbito territorial de una comunidad autónoma, indicar en este apartado: "Excede el ámbito territorial de una comunidad autónoma".<br>
                <sup>2</sup> Persona física o jurídica que lleva a cabo la inversión de la actuación en eficiencia energética.<br>
                <sup>3</sup> Aquella persona física o jurídica que, siendo titular, arrendatario u ocupante de las instalaciones sobre las que se ha ejecutado la actuación de eficiencia energética, obtiene un impacto positivo de los ahorros de energía final generados.
            </div>
        </div>
        <div class="doc-page">
            <div class="doc-sec-title">3. Identificación del representante del propietario inicial del ahorro (a indicar únicamente en caso de representación)</div>
            <table class="doc-table">
                <tr><td class="lbl">Representante (Nombre y apellidos / Razón social)</td><td colspan="2"></td><td style="width:10%">NIF/NIE</td><td></td></tr>
                <tr><td class="lbl">Domicilio</td><td colspan="4"></td></tr>
                <tr><td class="lbl">Teléfono</td><td colspan="4"></td></tr>
                <tr><td class="lbl">Correo electrónico</td><td colspan="4"></td></tr>
            </table>
            <div class="doc-p">Ostentando poderes suficientes según:</div>
            <div class="doc-check-row"><div class="doc-check-box"></div> <span>Poder Notarial de fecha ______________ y número de protocolo ______________. Se adjunta copia a la presente.</span></div>
            <div class="doc-check-row"><div class="doc-check-box">X</div> <span>Otro documento (identificar título y fecha de formalización): <b>${numexpte} - ANEXO CESIÓN AHORRO</b>. Se adjunta copia a la presente.</span></div>
            <div class="doc-p" style="margin-top:10px">Manifestando que dichos poderes no se encuentran revocados, modificados ni limitados.</div>
            <div class="doc-sec-title">4. Indicación de si el propietario inicial del ahorro o el beneficiario son perceptores del bono social, en sus modalidades eléctrico o térmico.</div>
            <table class="doc-table">
                <tr>
                    <td class="lbl" style="width: 30%">Perceptor de bono social<br>(Seleccionar las opciones que correspondan)</td>
                    <td>
                        ${ANEXO_I_TEXTS.BONO_LABELS.map((lbl, i) => `
                            <div class="doc-check-row" ${isForPdf ? '' : `data-type="bono" data-idx="${i}"`}>
                                <div class="doc-check-box">${cb(bonoSocial[i])}</div> <span>${lbl}</span>
                            </div>
                        `).join('')}
                    </td>
                </tr>
            </table>
        </div>
        <div class="doc-page" ${isForPdf ? '' : 'style="height: auto; min-height: 1123px; padding-bottom: 50px;"'}>
            <div class="doc-p">En relación con la actuación arriba indicada, el abajo firmante:</div>
            <div class="doc-title" style="margin: 20px 0">DECLARA RESPONSABLEMENTE</div>
            <div class="doc-check-row" ${isForPdf ? '' : 'data-type="radio" data-val="no"'}><div class="doc-check-box">${cb(noSolicitado)}</div> <span>NO SE HA SOLICITADO a otros organismos o administraciones internacionales, nacionales, autonómicas o locales, una ayuda o subvención para la misma actuación.</span></div>
            <div class="doc-check-row" ${isForPdf ? '' : 'data-type="radio" data-val="si"'}><div class="doc-check-box">${cb(seSolicitado)}</div> <span>SE HA SOLICITADO a otros organismos o administraciones internacionales, nacionales, autonómicas o locales, una ayuda o subvención para la misma actuación, y en ese caso:</span></div>
            <div style="margin-left: 30px">
                <div class="doc-check-row" ${isForPdf ? '' : 'data-type="ayudaOp" data-idx="0"'}><div class="doc-check-box">${cb(ayudaOptions[0])}</div> <span>Se ha obtenido dicha ayuda o subvención para la misma actuación.</span></div>
                <div class="doc-check-row" ${isForPdf ? '' : 'data-type="ayudaOp" data-idx="1"'}><div class="doc-check-box">${cb(ayudaOptions[1])}</div> <span>No se ha obtenido dicha ayuda o subvención para la misma actuación.</span></div>
                <div class="doc-check-row" ${isForPdf ? '' : 'data-type="ayudaOp" data-idx="2"'}><div class="doc-check-box">${cb(ayudaOptions[2])}</div> <span>Está pendiente de resolución dicha ayuda o subvención solicitada para la misma actuación.</span></div>
            </div>
            <div class="doc-p" style="margin-top: 20px">En todo caso, se deberán indicar los siguientes datos para cada ayuda o subvención:</div>
            <table class="doc-table">
                ${['denominacion', 'entidad', 'anio', 'disposicion', 'num_expediente', 'estado', 'fecha_solicitud', 'fecha_resolucion', 'cuantia'].map(field => `
                    <tr>
                        <td class="lbl">${field === 'num_expediente' ? 'Número de expediente' : field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' ')}</td>
                        <td contenteditable="${!isForPdf}" class="${isForPdf ? '' : 'doc-editable'}" data-field="${field}">${edVal(field)}</td>
                    </tr>
                `).join('')}
            </table>
            <div class="doc-p" style="margin-top: 30px">Asimismo, se COMPROMETE a comunicar cualquier modificación o variación de las circunstancias anteriores en un plazo máximo de cinco días al sujeto obligado o sujeto delegado con el que haya formalizado el convenio CAE.</div>
            <div class="doc-p" style="margin-top: 15px">Y para que así conste, firma la presente en <b>${municipioFirma}</b>, a <b>${fechaFirma}</b>.</div>
            <div class="doc-signature">
                <div>Fdo.: <b>${nombrePropietario}</b></div>
                <div style="font-size: 9pt; margin-top: 5px">(Firma del propietario inicial del ahorro o representante del mismo).</div>
            </div>
        </div>
    `;

    if (isForPdf) {
        return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>body{margin:0;padding:0;}${ANEXO_I_CSS}.doc-wrap{background:white!important;padding:0!important;}@page{size:A4;margin:0;}</style></head><body><div class="doc-wrap">${content}</div></body></html>`;
    }
    return content;
};

export const buildAnexoCesionHtml = (expediente, results) => {
    const op = expediente.oportunidades || {};
    const cliente = expediente.clientes || {};
    const inst = expediente.instalacion || {};
    const numexpte = expediente.numero_expediente || '___________';
    const municipioFecha = (cliente.municipio || 'Tomelloso').toUpperCase();
    const fechaFirma = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const nombreCedente = [cliente.nombre_razon_social, cliente.apellidos].filter(Boolean).join(' ') || '___________';
    const dniCedente = cliente.dni_nie || cliente.dni || '___________';
    const dirCedente = [cliente.direccion, cliente.codigo_postal, `${cliente.municipio} (${cliente.provincia})`].filter(Boolean).join(', ').toUpperCase() || '___________';
    const telCedente = cliente.tlf || cliente.telefono || '___________';
    const emailCedente = cliente.email || '___________';
    const numCuenta = cliente.numero_cuenta || '___________________________';
    const aeRaw = results?.savingsKwh || 0;
    const aeKwh = Math.round(aeRaw).toLocaleString('es-ES', { useGrouping: true });
    const caeVolStr = (aeRaw / 1000).toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).replace(',', '.');
    const opInputs = op?.datos_calculo?.inputs || {};
    const { rate: rateMwh } = getClientCaeRate(expediente);
    const rateMWhStr = Math.round(rateMwh).toString();
    const beneficioRaw = results?.caeBonus ?? (aeRaw && rateMwh ? aeRaw / 1000 * rateMwh : null);
    const beneficioStr = beneficioRaw ? Math.round(beneficioRaw).toLocaleString('es-ES', { useGrouping: true }) : '___________';
    // Localización de la INSTALACIÓN (Catastro), independiente del domicilio del
    // cliente (que arriba se usa en `dirCedente` como dato legal del cedente).
    const instAddr = buildInstalacionAddress(expediente);
    const municipioAct = (instAddr.municipio || '___________').toUpperCase();
    const provinciaAct = (instAddr.provincia || '___________').toUpperCase();
    const ccaa = (instAddr.ccaa || '___________').toUpperCase();
    const refCatastral = instAddr.refCatastral || '___________';
    const coordX = inst.coord_x || opInputs.coordX || opInputs.coord_x || '___________';
    const coordY = inst.coord_y || opInputs.coordY || opInputs.coord_y || '___________';

    const numexp = expediente.numero_expediente || '';
    const fichaType = numexp.includes('RES080') ? 'RES080'
                    : numexp.includes('RES093') ? 'RES093'
                    : (op.ficha || 'RES060');

    const descripcionActuacion = fichaType === 'RES080'
        ? 'Rehabilitación profunda de edificios de viviendas'
        : fichaType === 'RES093'
            ? 'Hibridación de combustión con bomba de calor de accionamiento eléctrico'
            : 'Sustitución de caldera de combustión por una bomba de calor aire-agua (aerotermia)';

    const vidaUtilTexto = fichaType === 'RES080'
        ? 'La vida útil de la actuación de eficiencia energética recogida en la cláusula 1 de este convenio es de 15 años para bombas de calor aire-agua y de 25 años para la sustitución de ventanas e instalación de aislamiento térmico.'
        : 'La vida útil de la actuación de eficiencia energética recogida en la cláusula 1 de este convenio es de 15 años.';

    const hdr = `
        <div class="conv-hdr">
          <div class="conv-hdr-left">
            <span class="conv-expte-label">Nº Expediente</span>
            <span class="conv-expte-num">${numexpte}</span>
          </div>
          <img src="${APP_URL}/logo_brokergy_dark.png" class="conv-logo-img" alt="BROKERGY">
        </div>`;
    const footer = (pg) => `
        <div class="conv-footer">
          <span class="conv-footer-v">V3 – 16/06/2025</span>
          <span class="conv-footer-b">BROKERGY</span>
          <span class="conv-footer-pg">${pg}</span>
        </div>`;

    const p1 = `
        <div class="conv-page">
          ${hdr}
          <div class="conv-body">
            <div class="conv-title">CONVENIO DE CESIÓN DE AHORROS ENERGÉTICOS</div>
            <div class="conv-dateline">En ${municipioFecha} a ${fechaFirma}</div>
            <div class="conv-subtitle">REUNIDOS</div>
            <p class="conv-p">De una parte, Dª/D. <strong>${nombreCedente}</strong>, mayor de edad, con documento de identificación <strong>${dniCedente}</strong> y domicilio a efectos de notificaciones en <strong>${dirCedente}</strong>, teléfono de contacto <strong>${telCedente}</strong> y correo electrónico <strong>${emailCedente}</strong>, en adelante el <strong>Cedente</strong>.</p>
            <p class="conv-p">De otra parte, Dª/D. FRANCISCO JAVIER MOYA LÓPEZ mayor de edad, con documento de identificación 06282551D, actuando en nombre y representación de la entidad SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL (<strong>BROKERGY</strong>), con código de identificación NIF B19350222 y domicilio a efectos de notificaciones en C/ Don Sergio, 12 – 1ºL de 13700 Tomelloso (Ciudad Real), en adelante el <strong>Cesionario</strong>.</p>
            <p class="conv-p"><strong>Las partes se reconocen mutua y recíprocamente la capacidad legal necesaria para otorgar este convenio y, a sus efectos, exponen lo siguiente:</strong></p>
            <div class="conv-subtitle">EXPONEN</div>
            <p class="conv-p"><strong>Primero.</strong> Que como resultado de la actuación de eficiencia energética estandarizada llevada a cabo por el Cedente, consistente en la <em>"${descripcionActuacion}"</em>, se ha estimado un ahorro de <strong>${aeKwh} kWh/año</strong>, conforme al Real Decreto 36/2023, de 24 de enero, por el que se establece un sistema de Certificados de Ahorro Energético (CAE).</p>
            <p class="conv-p"><strong>Segundo.</strong> Que el Cedente desea participar en la valorización de dichos ahorros, autorizando al Cesionario para su gestión técnica y administrativa ante los organismos competentes, sin que ello constituya cesión onerosa ni transmisión patrimonial.</p>
            <p class="conv-p">Tercero. Que el Cesionario realiza la agrupación de actuaciones de eficiencia de diferentes particulares para alcanzar los umbrales requeridos por la normativa vigente para la emisión de CAEs, y ofrece a los participantes un incentivo económico por su participación.</p>
            <p class="conv-p">Por lo tanto, ambas partes acuerdan suscribir el presente convenio con sujeción a las siguientes:</p>
            <div class="conv-subtitle">CLÁUSULAS</div>
            <div class="conv-cl">
              <p><strong>Primera. Objeto y exclusividad.</strong> El Cedente autoriza al Cesionario, en exclusiva, a gestionar en su nombre los ahorros energéticos generados por la actuación de eficiencia energética descrita como <em>"${descripcionActuacion}"</em>. Esta autorización se realiza a efectos de agrupación con otras actuaciones y tramitación ante los organismos competentes para la emisión de CAEs.</p>
            </div>
            <div class="conv-cl">
              <p><strong>Segunda. Localización geográfica de la instalación o instalaciones</strong><br>La cesión de los ahorros de energía prevista en el presente convenio sólo será válida en territorio español, donde se ha ejecutado la actuación de eficiencia energética.</p>
              <p>La actuación se ha llevado a cabo en la localidad de <strong>${municipioAct}</strong>, provincia de <strong>${provinciaAct}</strong> de la Comunidad Autónoma de <strong>${ccaa}</strong>, siendo la referencia catastral de su ubicación <strong>${refCatastral}</strong> y sus coordenadas UTM X: <strong>${coordX}</strong> Y: <strong>${coordY}</strong></p>
            </div>
            <div class="conv-cl">
              <p><strong>Tercera. Ahorro anual de energía</strong><br>El ahorro anual de energía efectivo será de <strong>${aeKwh} kWh/año</strong>, permitiendo obtener teóricamente <strong>${caeVolStr} CAEs</strong> en el sistema de Certificados de Ahorro Energético.</p>
            </div>
            <div class="conv-cl">
              <p><strong>Cuarta. Tipo de contraprestación</strong><br>Las partes acuerdan fijar el valor del incentivo económico por participación en un importe de <strong>${rateMWhStr} €/MWh</strong>, correspondiente a los ahorros del primer año generados por la actuación que supone, en junto, la suma de <strong>${beneficioStr} €</strong>.</p>
            </div>
            <div class="conv-cl">
              <p><strong>Quinta. Forma de pago de la contraprestación</strong><br>El Cesionario pagará al Cedente el importe bruto acordado en la cláusula cuarta en el plazo máximo de sesenta (60) días contados desde la fecha en la que el Órgano Territorial emita a nombre del Sujeto Obligado, comprador de los CAEs asociados a los ahorros cedidos a través de este convenio.</p>
            </div>
          </div>
          ${footer(1)}
        </div>`;

    const p2 = `
        <div class="conv-page">
          ${hdr}
          <div class="conv-body">
            <p class="conv-p">El Cedente recibirá el importe final tras deducir del monto establecido en la cláusula cuarta los costes de 247 € correspondientes a la gestión de los certificados de eficiencia energética necesarios para obtener el expediente CAE.</p>
            <p class="conv-p">El CEDENTE recibirá el pago mediante transferencia bancaria a la siguiente cuenta de su titularidad:</p>
            <div class="conv-cuenta">${numCuenta}</div>
            <div class="conv-cl">
              <p><strong>Sexta. Vida útil de la actuación de eficiencia energética</strong><br>Cedente y Cesionario se comprometen a mantener activa la medida generadora de ahorro durante todo el tiempo de vida útil de la misma.</p>
              <p>En caso de que por causa imputable a una actuación del CEDENTE se anulase o invalidase el CAE, este estará obligado a devolver la contraprestación recibida por parte del CESIONARIO, en el plazo máximo de tres (3) días desde que esto se produzca.</p>
              <p>${vidaUtilTexto}</p>
            </div>
            <div class="conv-cl">
              <p><strong>Séptima. Percepción de financiación pública.</strong><br>La información relativa a la solicitud y/o percepción de ayudas o subvenciones públicas vinculadas a la actuación de ahorro energético objeto del presente convenio será proporcionada mediante el documento denominado "Anexo I: Declaración responsable formalizada por el propietario inicial del ahorro referida a la solicitud y/u obtención de ayudas o subvenciones públicas para la misma actuación de ahorro de energía". Dicho anexo, debidamente firmado por el Cedente, se incorpora como parte integrante del presente convenio y deberá ser presentado junto con la documentación del expediente.</p>
              <p>En todo caso, el Cedente se compromete a informar al Cesionario de todas las ayudas públicas que finalmente obtenga para, o con motivo de, la ejecución de la actuación, incluso si estas ayudas se conceden con posterioridad a la firma de este convenio.</p>
            </div>
            <div class="conv-cl">
              <p><strong>Octava. Declaración responsable</strong><br>El Cedente se compromete a que, una vez firmado el presente convenio, no suscribirá convenios por los ahorros de energía generados por la misma actuación. Además, el Cedente declara que los ahorros energéticos objeto de este convenio no están comprometidos con ninguna otra entidad o acuerdo previo.</p>
            </div>
            <div class="conv-cl">
              <p><strong>Novena. Notificaciones</strong><br>Todas las comunicaciones y notificaciones que deban realizarse las partes en virtud de este CONTRATO deberán efectuarse por escrito, por cualquier medio que deje constancia de su contenido, y la debida recepción por el destinatario.</p>
              <p>Las comunicaciones y notificaciones entre las Partes deberán ser remitidas a los domicilios y a la atención de las personas que se indican a continuación:</p>
              <li>Contacto: Francisco Javier Moya López</li>
              <li>Dirección: Calle Don Sergio, 12 – 1ºE, 13700 Tomelloso (Ciudad Real)</li>
              <li>Teléfono: 623926179</li>
              <li>E-mail: info@brokergy.es</li>
            </div>
            <div class="conv-sign">
              <p class="conv-sign-intro">Habiendo leído por sí mismos y hallándose conformes, las partes firman el presente documento por duplicado y a un solo efecto, en el lugar y fecha arriba indicados.</p>
              <div class="conv-sign-grid">
                <div class="conv-sign-col">
                  <div class="conv-sign-lbl">El Cedente</div>
                  <div class="conv-sign-box"></div>
                  <div class="conv-sign-name">Dª/D. ${nombreCedente}</div>
                </div>
                <div class="conv-sign-col">
                  <div class="conv-sign-lbl">El Cesionario</div>
                  <div class="conv-sign-box">
                    <img src="${APP_URL}/firma_brokergy.png" class="conv-sign-img" alt="Firma">
                  </div>
                  <div class="conv-sign-name">Dª/D. FRANCISCO JAVIER MOYA LÓPEZ</div>
                </div>
              </div>
            </div>
          </div>
          ${footer(2)}
        </div>`;

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><style>${ANEXO_CESION_CSS}@page { size: A4; margin: 0; }</style></head><body><div class="conv-wrap">${p1}${p2}</div></body></html>`;
};

export const getDualMessage = (nombre, importeCAE, numexpte) => {
    return `Buenas tardes, ${nombre}:

Ya he realizado todos los cálculos para obtener el máximo beneficio posible y te traigo buenas noticias: finalmente vamos a solicitar una ayuda por un importe de unos *${importeCAE}* para tu expediente como puedes ver en el anexo de cesión de ahorros. 

Ahora toca avanzar con la parte administrativa. Para finalizar el trámite de justificación, te adjunto los anexos solicitados por el Ministerio, necesarios para gestionar tu expediente y obtener la ayuda:

• *Anexo Cesión de Ahorros*: Autoriza la gestión y agrupación de tu expediente con otros, siendo imprescindible para tramitar la ayuda.
• *Anexo I*: Declara si se han solicitado otras ayudas para la misma actuación.

*Firma de los documentos:*
Ambos anexos pueden firmarse de las siguientes maneras:
1. *Firma electrónica* (recomendado si dispones de certificado digital).
2. *Firma manuscrita*, acompañada obligatoriamente del nombre completo, apellidos y DNI escritos a mano.

*Importante:*
En caso de firma manuscrita, necesitaremos fotografías del DNI por ambas caras y los documentos escaneados o, en su defecto, fotografías de buena calidad donde se vea claramente la firma y todo el contenido de las páginas o bien, firmarlo digitalmente.

La firma a mano alzada debe coincidir la imagen con la que aparece en el DNI. 

Quedamos a la espera de recibir los documentos firmados para comenzar la justificación cuanto antes.

Un saludo,
*Brokergy · Ingeniería energética.*`;
};
