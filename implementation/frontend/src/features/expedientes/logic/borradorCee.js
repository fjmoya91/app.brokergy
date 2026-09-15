// ─── borradorCee.js ──────────────────────────────────────────────────────────
// El BORRADOR para presentar el Certificado de Eficiencia Energética en el
// Registro Autonómico.
//
// Inscribir un CEE es rellenar un formulario telemático con datos que la app YA
// tiene: el titular, la vivienda, el técnico y las dos calificaciones del propio
// certificado. Se venía tecleando a mano mirando tres pantallas, y una errata en
// la referencia catastral o en el NIF no se descubre hasta que el registro
// devuelve el expediente.
//
// Esto NO es una réplica del impreso: el trámite es telemático y no hay PDF que
// rellenar. Es una GUÍA DE RELLENO — qué va en cada casilla, en el orden en que
// el formulario las pide, qué X hay que marcar y cuál dejar sin marcar.
//
// REGLA — solo CASTILLA-LA MANCHA. El formulario replicado es el procedimiento
// 020264 (SIACI SJM3) de la JCCM, y cada comunidad tiene el suyo, con otros
// apartados y otras casillas. Un borrador con los apartados de CLM en un
// expediente de Valencia manda a rellenar un formulario que no es el suyo, así
// que fuera de CLM no se genera: se dice que no hay plantilla para ese registro.
//
// REGLA — el módulo es PURO: ni React ni red. Lo consumen el popup y el backend
// (por import() ESM, como `cifoService` con `cifoDoc.js`), porque el mismo PDF se
// adjunta al visto bueno que le dice al certificador que ya puede presentar. Si
// cada lado lo compusiera por su cuenta, el borrador que se revisa en pantalla y
// el que viaja en el correo podrían no ser el mismo documento.

// La extensión va EXPLÍCITA: este módulo lo carga también Node por import(), y
// ahí no hay resolución al estilo de Vite.
import { PROV_CCAA, PROV_NOMBRE, getProvCodByNombre, normalize } from '../../../utils/direccionCatastral.js';
import { contactoCliente, deQuienEs } from '../../../utils/contactoCliente.js';

export const CCAA_BORRADOR = 'CASTILLA-LA MANCHA';

// Lo que identifica al trámite en la sede. Va impreso porque es lo que se busca
// para llegar al formulario, y porque es lo que delata que un borrador es de otra
// comunidad si alguna vez se copia uno de aquí.
export const TRAMITE = {
    ccaa: CCAA_BORRADOR,
    procedimiento: '020264',
    siaci: 'SJM3',
    titulo: 'Inscripción en la sección primera del Registro Autonómico de Certificados '
        + 'de Eficiencia Energética de Edificios de Castilla-La Mancha',
    tramite: 'Inscripción de certificado de eficiencia energética de edificio existente',
    url: 'https://www.jccm.es/tramites/1002560',
    organismo: 'Servicio Instalaciones y Tecnologías Energéticas de la Dirección General de Transición Energética',
    dir3: 'A08027234',
};

// El plazo del apartado 07.2 del impreso: un mes desde la emisión del certificado.
export const PLAZO_INSCRIPCION_DIAS = 30;

// ─── Los cuatro ficheros que se anexan ───────────────────────────────────────
// Lo que el Registro pide adjuntar, en el orden en que los lista el acuse. Vive
// aquí y no en el servicio que los busca en Drive: es la misma lista con la que
// se marcan las X del apartado 07.3, y dos copias divergirían el día que el
// Ministerio pida un quinto documento.
//
// `slot` es el del CEE en la app; el informe de medidas de mejora lo produce
// CE3X y NO tiene slot propio, así que se reconoce por su nombre.
export const DOCUMENTOS_REGISTRO = [
    { clave: 'pdf', titulo: 'Certificado firmado', sufijo: '_fdo.pdf', slot: 'pdf' },
    { clave: 'xml', titulo: 'Archivo XML', sufijo: '.xml', slot: 'xml' },
    { clave: 'mejoras', titulo: 'Informe de medidas de mejora', sufijo: '_informeMedidasMejora.pdf', slot: null },
    { clave: 'cex', titulo: 'Archivo de cálculo', sufijo: '.cex', slot: 'cex' },
];

// ─── Tipos de vía ────────────────────────────────────────────────────────────
// El formulario pide el tipo de vía APARTE del nombre, en un desplegable. La app
// guarda la dirección como una cadena ("CL MEJICO 4"), así que hay que separarla.
// Solo se traduce lo que está en esta tabla: una sigla desconocida se deja tal
// cual en el nombre de la vía antes que inventar un tipo que el desplegable no
// tiene.
const TIPOS_VIA = [
    [['CL', 'C', 'C/', 'CALLE', 'CALL'], 'Calle'],
    [['AV', 'AVD', 'AVDA', 'AV.', 'AVENIDA'], 'Avenida'],
    [['PZ', 'PL', 'PLZ', 'PZA', 'PLAZA'], 'Plaza'],
    [['PS', 'PSO', 'PASEO'], 'Paseo'],
    [['CR', 'CTRA', 'CARRETERA'], 'Carretera'],
    [['CM', 'CAMINO'], 'Camino'],
    [['TR', 'TRAV', 'TRAVESIA', 'TRAVESÍA'], 'Travesía'],
    [['RD', 'RONDA'], 'Ronda'],
    [['GL', 'GLORIETA'], 'Glorieta'],
    [['UR', 'URB', 'URBANIZACION', 'URBANIZACIÓN'], 'Urbanización'],
    [['PG', 'POL', 'POLIGONO', 'POLÍGONO'], 'Polígono'],
    [['BO', 'BARRIO'], 'Barrio'],
    [['LG', 'LUGAR'], 'Lugar'],
    [['CJ', 'CALLEJON', 'CALLEJÓN'], 'Callejón'],
    [['CARRER'], 'Carrer'],
];

const limpio = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Parte "CL MEJICO 4" en `{ tipo:'Calle', nombre:'MEJICO', numero:'4', … }`.
 *
 * REGLA — se PROPONE, y el original va al lado. El troceo de una dirección
 * escrita a mano no puede ser exacto ("CALLE 8 DE MARZO" tiene un número en el
 * nombre), así que el borrador imprime siempre la dirección tal cual está
 * guardada: quien rellena el formulario la tiene delante para comprobarlo. Lo que
 * no se puede repartir con seguridad —un "5-B-3"— se deja entero en `resto` con
 * su aviso, nunca se reparte a ojo entre planta y puerta.
 */
export function trocearVia(direccion) {
    const vacio = { tipo: '', nombre: '', numero: '', portal: '', escalera: '', planta: '', puerta: '', resto: '', original: limpio(direccion) };
    let s = limpio(direccion);
    if (!s) return vacio;

    // Si la cadena arrastra el CP y el municipio (como la guarda el Catastro), se
    // corta por el CP: lo de detrás son campos propios del formulario.
    const cp = s.match(/\b\d{5}\b/);
    if (cp) s = s.slice(0, s.indexOf(cp[0])).trim();
    s = s.replace(/[,;]\s*$/, '').trim();

    const out = { ...vacio };

    // Tipo de vía: solo la PRIMERA palabra, y solo si está en la tabla.
    const primera = s.split(/[\s.]+/)[0] || '';
    const clave = primera.replace(/\.$/, '').toUpperCase();
    for (const [siglas, nombre] of TIPOS_VIA) {
        if (!siglas.includes(clave)) continue;
        out.tipo = nombre;
        s = s.slice(primera.length).replace(/^[.\s,]+/, '').trim();
        break;
    }

    // Número de portal: el primer grupo de dígitos que venga DESPUÉS de algo. Un
    // número al principio no es el portal (sería parte del nombre de la vía).
    const m = s.match(/^(.+?)[\s,]+(?:n[ºo°]?\.?\s*)?(\d+)\s*(.*)$/i);
    if (m && limpio(m[1])) {
        out.nombre = limpio(m[1]).replace(/[,;]$/, '');
        out.numero = m[2];
        out.resto = limpio(m[3]).replace(/^[-,/\s]+/, '');
    } else {
        out.nombre = s;
    }

    // Planta y puerta: solo los dos patrones que aparecen de verdad —"1ºE" y
    // "3A"—. Cualquier otra cosa se queda en `resto` para que la mire una persona.
    if (out.resto) {
        const conOrdinal = out.resto.match(/^(\d+)\s*[ºo°]?\s*[-\s]*([A-Za-zÑñ]?)$/);
        if (conOrdinal) {
            out.planta = conOrdinal[1];
            out.puerta = (conOrdinal[2] || '').toUpperCase();
            out.resto = '';
        }
    }
    return out;
}

// ─── Qué casillas se marcan en el bloque VIVIENDA / TERCIARIO ────────────────
// El impreso tiene ocho casillas y el certificado trae `<TipoDeEdificio>`, así
// que no hay que preguntarlo. No se reutiliza `clasificarTipoEdificio` de la
// calculadora: aquella colapsa "unifamiliar" y "vivienda en bloque" en un solo
// valor —le basta para decidir si la demanda es de un piso o de un edificio— y
// aquí son casillas DISTINTAS del formulario.
export function usoEdificio(tipoEdificio) {
    const t = normalize(tipoEdificio).replace(/[^a-z]/g, '');
    if (!t) return { uso: null, casillas: [] };
    if (t.includes('bloque') && t.includes('completo')) {
        return { uso: 'BLOQUE DE VIVIENDAS COMPLETO', casillas: ['Vivienda', 'Bloque', 'Bloque Completo'] };
    }
    if (t.includes('bloque')) {
        return { uso: 'VIVIENDA INDIVIDUAL EN BLOQUE', casillas: ['Vivienda', 'Bloque', 'Vivienda Individual'] };
    }
    if (t.includes('unifamiliar')) {
        return { uso: 'VIVIENDA UNIFAMILIAR', casillas: ['Vivienda', 'Unifamiliar'] };
    }
    if (t.includes('local') && t.includes('terciario')) {
        return { uso: 'LOCAL DE USO TERCIARIO', casillas: ['Terciario', 'Local'] };
    }
    if (t.includes('terciario')) {
        return { uso: 'EDIFICIO DE USO TERCIARIO', casillas: ['Terciario', 'Edificio completo'] };
    }
    return { uso: null, casillas: [] };
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const esFecha = (v) => /^\d{4}-\d{2}-\d{2}/.test(limpio(v));
const aEs = (iso) => {
    if (!esFecha(iso)) return '';
    const [a, m, d] = limpio(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

/** CCAA a partir de la provincia, con el código postal como respaldo. */
export function ccaaDe({ provincia, codigo_postal } = {}) {
    const cod = getProvCodByNombre(provincia)
        || (/^\d{5}$/.test(limpio(codigo_postal)) ? limpio(codigo_postal).slice(0, 2) : '');
    return cod ? (PROV_CCAA[cod] || null) : null;
}

/** El nombre de provincia tal y como lo escribe el formulario ("Ciudad Real"). */
function provinciaFormulario(provincia) {
    const cod = getProvCodByNombre(provincia);
    const oficial = cod ? PROV_NOMBRE[cod] : limpio(provincia);
    if (!oficial) return '';
    // La BD la guarda en MAYÚSCULAS y el desplegable del formulario la escribe
    // capitalizada. Mismo criterio que `provinciaCe3x` en la ficha del .cex.
    return oficial.toLowerCase().replace(/(^|[\s-])([a-záéíóúñ])/g, (_, p, c) => p + c.toUpperCase());
}

const dato = (campo, valor, extra = {}) => ({
    campo,
    valor: limpio(valor) || null,
    ...extra,
});

// Los campos de dirección del formulario, en su orden y con sus rótulos.
//
// El `grupo` es SOLO para el PDF: el impreso pone N.º, portal, escalera, planta y
// puerta en una misma línea, y una fila por cada uno deja media hoja en blanco de
// casillas que casi siempre van vacías. En el popup cada campo sigue siendo su
// propia línea con su botón de copiar, que es lo que allí hace falta.
function camposDireccion(via, { provincia, municipio, codigo_postal }) {
    const campos = [
        dato('Tipo vía', via.tipo, { grupo: 'via' }),
        dato('Nombre de la vía', via.nombre, { grupo: 'via' }),
        dato('N.º Calle', via.numero, { grupo: 'num' }),
        dato('Portal', via.portal, { grupo: 'num' }),
        dato('Escalera', via.escalera, { grupo: 'num' }),
        dato('Planta', via.planta, { grupo: 'num' }),
        dato('Puerta', via.puerta, { grupo: 'num' }),
        dato('Provincia', provinciaFormulario(provincia), { grupo: 'loc' }),
        dato('Población', municipio, { grupo: 'loc' }),
        dato('Código Postal', codigo_postal, { grupo: 'loc' }),
    ];
    if (via.resto) {
        campos.push(dato('Resto de la dirección', via.resto, {
            nota: 'No se ha podido repartir entre portal, escalera, planta y puerta: colócalo tú.',
        }));
    }
    return campos;
}

// ─── El borrador ─────────────────────────────────────────────────────────────

/**
 * @param {object} ctx
 * @param {object} ctx.expediente   fila de `expedientes` (o de `cee_directos`) con `cee` e `instalacion`
 * @param {object} ctx.cliente      fila de `clientes`
 * @param {object} ctx.certificador fila de `prescriptores` del técnico asignado
 * @param {object} ctx.oportunidad  fila de `oportunidades` (para la referencia catastral)
 * @param {'inicial'|'final'} fase
 * @returns {{aplica:boolean, motivo:string|null, ccaa:string|null, fase:string,
 *            numeroExpediente:string|null, apartados:Array, avisos:string[], ficheros:string[]}}
 */
export function buildBorradorCee(ctx = {}, { fase = 'inicial', hoy = null } = {}) {
    const exp = ctx.expediente || {};
    const cli = ctx.cliente || null;
    const cert = ctx.certificador || null;
    const op = ctx.oportunidad || null;
    const faseKey = fase === 'final' ? 'final' : 'inicial';
    const faseLabel = faseKey === 'final' ? 'CEE FINAL' : 'CEE INICIAL';

    const cee = exp.cee || {};
    const certificado = cee[`cee_${faseKey}`] || {};
    const inst = exp.instalacion || {};
    const inputs = op?.datos_calculo?.inputs || {};

    const avisos = [];

    // ── Dónde está el edificio ───────────────────────────────────────────────
    // REGLA — manda lo que dice el PROPIO CERTIFICADO. `<DatosDelCertificador>`
    // trae la identificación del edificio tal y como se va a inscribir, y es
    // contra ella contra la que el Registro compara. Solo si el certificado no la
    // trae se cae al expediente y, después, a la simulación.
    const ident = certificado.identificacion || {};
    const edificio = {
        direccion: limpio(ident.direccion) || limpio(inst.direccion) || limpio(inputs.direccion) || limpio(inputs.address),
        municipio: limpio(ident.municipio) || limpio(inst.municipio) || limpio(inputs.municipio),
        provincia: limpio(ident.provincia) || limpio(inst.provincia) || limpio(inputs.provincia),
        codigo_postal: limpio(inst.codigo_postal) || limpio(inputs.cp),
        ref_catastral: limpio(ident.refCatastral) || limpio(op?.ref_catastral) || limpio(inst.ref_catastral)
            || limpio(exp.ref_catastral) || limpio(inputs.rc) || limpio(inputs.referencia_catastral),
    };
    // El municipio y el CP suelen faltar en la identificación del certificado y
    // en el expediente; el domicilio del cliente los tiene cuando la vivienda es
    // la suya, que es el caso normal.
    if (!edificio.municipio) edificio.municipio = limpio(cli?.municipio);
    if (!edificio.provincia) edificio.provincia = limpio(cli?.provincia);
    if (!edificio.codigo_postal) edificio.codigo_postal = limpio(cli?.codigo_postal);

    // ── ¿Es de Castilla-La Mancha? ───────────────────────────────────────────
    const ccaa = ccaaDe(edificio) || ccaaDe(cli || {});
    const numeroExpediente = limpio(exp.numero_expediente) || null;
    if (ccaa && ccaa !== CCAA_BORRADOR) {
        return {
            aplica: false,
            ccaa,
            fase: faseKey,
            numeroExpediente,
            motivo: `Este certificado se inscribe en ${ccaa}, y el borrador replica el formulario `
                + `de ${CCAA_BORRADOR} (procedimiento ${TRAMITE.procedimiento}). Cada comunidad tiene `
                + `su propio trámite, con otros apartados y otras casillas.`,
            apartados: [],
            avisos: [],
            ficheros: [],
        };
    }
    if (!ccaa) {
        avisos.push('No consta la provincia del edificio, así que no se puede comprobar que se inscriba '
            + 'en Castilla-La Mancha. Compruébalo antes de presentar.');
    }

    // ── 01 Solicitante: el TITULAR del certificado ───────────────────────────
    // En una persona jurídica quien comparece es su representante legal, igual
    // que en el Anexo I y en el Convenio de Cesión: una sociedad no es "mayor de
    // edad con documento de identificación B…".
    const esEmpresa = cli?.es_empresa === true;
    const solicitanteNombre = esEmpresa
        ? [limpio(cli?.representante_nombre), limpio(cli?.representante_apellidos)].filter(Boolean).join(' ')
        : [limpio(cli?.nombre_razon_social), limpio(cli?.apellidos)].filter(Boolean).join(' ');
    const solicitanteNif = esEmpresa ? limpio(cli?.representante_dni) : limpio(cli?.dni);
    const viaCliente = trocearVia(cli?.direccion);
    const sexo = limpio(cli?.sexo);

    // El formulario EXIGE teléfono y correo, y muchos titulares no dan los suyos:
    // quien lleva la obra es un hijo, la pareja o el instalador, y es SU número el
    // que consta en la ficha. Se cae a la persona de contacto y se dice con su
    // nombre — no es lo mismo el correo de quien firma que el de quien lleva la
    // obra. Medido en 26RES060_187: el titular los tiene los dos en blanco y JUAN
    // ANTONIO, su contacto, los dos rellenos.
    const kc = contactoCliente(cli);
    const deContacto = deQuienEs(kc.nombreContacto);

    const apSolicitante = {
        id: '01',
        titulo: '01 Solicitante',
        nota: esEmpresa
            ? `El titular es la entidad ${limpio(cli?.nombre_razon_social)} (${limpio(cli?.dni)}); quien comparece es su representante legal.`
            : 'Los datos del titular, tal y como constan en su ficha de cliente.',
        campos: [
            dato('NIF', solicitanteNif),
            dato('Nombre y apellidos', solicitanteNombre),
            dato('Sexo', sexo ? (sexo === 'MUJER' ? 'Mujer' : 'Hombre') : null),
            ...camposDireccion(viaCliente, cli || {}),
            dato('Teléfono móvil', kc.telefono,
                kc.telefonoDeContacto ? { nota: `Sale de la ${deContacto}.` } : {}),
            dato('e-mail', kc.email,
                kc.emailDeContacto ? { nota: `Sale de la ${deContacto}.` } : {}),
            dato('En calidad de', 'Propietario'),
        ],
        original: viaCliente.original || null,
    };
    if (!kc.telefono || !kc.email) {
        avisos.push('El formulario exige teléfono y correo del solicitante, y en la ficha del cliente '
            + `falta ${!kc.telefono && !kc.email ? 'los dos' : (!kc.telefono ? 'el teléfono' : 'el correo')}.`);
    }

    // ── 02 Representante: el CERTIFICADOR asignado ───────────────────────────
    // Es el técnico que firma el certificado y quien lo presenta en su nombre.
    const certPersona = [limpio(cert?.nombre_responsable), limpio(cert?.apellidos_responsable)]
        .filter(Boolean).join(' ') || limpio(cert?.razon_social);
    const certAutonomo = cert ? cert.es_autonomo !== false : false;
    const certNif = limpio(cert?.nif_responsable) || (certAutonomo ? limpio(cert?.cif) : '');
    const viaCert = trocearVia(cert?.direccion);

    const apRepresentante = {
        id: '02',
        titulo: '02 Representante',
        nota: 'El técnico certificador asignado al expediente.',
        campos: [
            dato('NIF', certNif),
            dato('Nombre y apellidos', certPersona),
            ...camposDireccion(viaCert, cert || {}),
            dato('Teléfono móvil', cert?.tlf_responsable || cert?.tlf),
            dato('e-mail', cert?.email_responsable || cert?.email),
            dato('En calidad de', 'Técnico competente autorizado por el promotor/propietario del edificio '
                + 'cuyo certificado se pretende inscribir.'),
        ],
        original: viaCert.original || null,
    };
    if (!cert) {
        avisos.push('No hay certificador asignado al expediente: el apartado 02 (Representante) va vacío.');
    } else if (!certNif) {
        avisos.push(`No consta el NIF de ${certPersona || 'el certificador'}. En una empresa el NIF del `
            + 'técnico es `nif_responsable`, no el CIF: rellénalo en su ficha de Prescriptores.');
    }

    // ── 04 Ámbito de la solicitud ────────────────────────────────────────────
    const apAmbito = {
        id: '04',
        titulo: '04 Ámbito de la Solicitud',
        instrucciones: ['Marca **Inscripción**. Las otras dos (Renovación y Actualización) se dejan sin marcar, '
            + 'y sus tres campos de número y fecha, en blanco.'],
        campos: [],
    };

    // ── 05 Datos identificativos del edificio ────────────────────────────────
    const { uso, casillas } = usoEdificio(certificado.tipoEdificio);
    const viaEdificio = trocearVia(edificio.direccion);
    const apEdificio = {
        id: '05',
        titulo: '05 Datos Identificativos del Edificio',
        nota: 'Dónde está la vivienda que se certifica. Si el certificado la identifica, manda lo que él diga.',
        instrucciones: casillas.length
            ? [`Marca **${casillas.join('** + **')}** en el bloque de casillas de encima.`]
            : ['El certificado no declara el tipo de edificio: marca a mano las casillas que correspondan '
                + '(Vivienda / Unifamiliar / Bloque… o Terciario).'],
        campos: [
            dato('Uso del Edificio', uso),
            ...camposDireccion(viaEdificio, edificio),
            dato('Referencia catastral', edificio.ref_catastral),
        ],
        original: viaEdificio.original || null,
    };
    if (!edificio.ref_catastral) {
        avisos.push('Falta la referencia catastral del edificio: sin ella el Registro no puede identificar el inmueble.');
    }

    // ── 06 Datos del certificado a inscribir ─────────────────────────────────
    const fEmision = limpio(cee[`fecha_firma_cee_${faseKey}`]) || limpio(certificado.fechaFirma);
    const fVisita = limpio(cee[`fecha_visita_cee_${faseKey}`]) || limpio(certificado.fechaVisita);
    const apCertificado = {
        id: '06',
        titulo: '06 Datos del certificado a inscribir',
        nota: 'Sale del propio .xml del certificado.',
        campos: [
            dato('Fecha de emisión del certificado', aEs(fEmision)),
            dato('Fecha visita técnico certificador', aEs(fVisita)),
            dato('Calificación Emisiones CO2', certificado.emisionesLetra),
            dato('Calificación Consumo Energía Primaria', certificado.epnrLetra),
        ],
    };
    if (!certificado.emisionesLetra || !certificado.epnrLetra) {
        avisos.push('Falta alguna de las dos calificaciones. Están dentro del .xml del certificado: '
            + 'vuelve a cargarlo en la rejilla del CEE y se rellenan solas.');
    }

    // El plazo del apartado 07.2: un mes desde la emisión. Es el aviso que de
    // verdad cuesta dinero — pasado el plazo hay que volver a emitir el
    // certificado, con su visita y su tasa.
    if (esFecha(fEmision)) {
        const emision = new Date(`${fEmision.slice(0, 10)}T00:00:00`);
        const ref = hoy ? new Date(hoy) : new Date();
        const dias = Math.floor((ref - emision) / 86400000);
        if (dias > PLAZO_INSCRIPCION_DIAS) {
            avisos.push(`⚠ El certificado se emitió el ${aEs(fEmision)}, hace ${dias} días. El plazo para `
                + 'solicitar la inscripción es de UN MES desde la emisión: comprueba si todavía se admite.');
        } else if (dias >= 0) {
            const quedan = PLAZO_INSCRIPCION_DIAS - dias;
            if (quedan <= 7) {
                avisos.push(`El plazo de inscripción (un mes desde el ${aEs(fEmision)}) vence en ${quedan} `
                    + `día${quedan === 1 ? '' : 's'}.`);
            }
        }
    }

    // ── 07 y 08: lo que se marca, no se teclea ───────────────────────────────
    const apDeclaraciones = {
        id: '07.1',
        titulo: '07.1 Declaraciones Responsables',
        instrucciones: ['Marca la X de «Son ciertos los datos consignados en la presente solicitud…».'],
        campos: [],
    };
    const apAutorizacion = {
        id: '07.2',
        titulo: '07.2 Autorización',
        instrucciones: ['**Deja SIN marcar** «Me opongo a la consulta de datos de identidad»: '
            + 'oponerse obliga a aportar los documentos de identidad a mano.'],
        campos: [],
    };
    const apDocumentacion = {
        id: '07.3',
        titulo: '07.3 Documentación aportada',
        instrucciones: ['Marca las X de los cuatro documentos que se anexan (el PDF firmado, el XML, '
            + 'el informe de medidas de mejora y el archivo de cálculo).'],
        campos: [],
    };
    const apTasas = {
        id: '08',
        titulo: '08 Pago de tasas',
        instrucciones: [
            'La tasa se paga **con tarjeta** dentro del propio trámite.',
            'Una vez pagada, anota aquí la referencia del pago electrónico que devuelve la pasarela.',
        ],
        campos: [dato('Pago electrónico con referencia', null, {
            hueco: true,
            nota: 'Se rellena a mano al pagar.',
        })],
    };

    // ── Los ficheros que se anexan ───────────────────────────────────────────
    // Nombre canónico de la app (el que ya tienen en Drive) con el NIF del titular
    // delante, que es como se suben al Registro. Quien sirve el borrador los cruza
    // después con Drive para poder ofrecerlos descargados y ya renombrados; aquí
    // solo se dice CUÁLES son y cómo se tienen que llamar.
    const base = numeroExpediente ? `${numeroExpediente} – ${faseLabel}` : `… – ${faseLabel}`;
    const pre = solicitanteNif ? `${solicitanteNif}_` : '';
    const ficheros = DOCUMENTOS_REGISTRO.map(d => ({
        clave: d.clave,
        titulo: d.titulo,
        nombreDrive: `${base}${d.sufijo}`,
        nombreRegistro: `${pre}${base}${d.sufijo}`,
        presente: null,   // lo resuelve quien mire Drive
    }));

    return {
        aplica: true,
        ccaa: ccaa || null,
        motivo: null,
        fase: faseKey,
        faseLabel,
        numeroExpediente,
        titular: solicitanteNombre || null,
        // Para componer el nombre con el que se sube cada fichero al Registro.
        nif: solicitanteNif || null,
        apartados: [
            apSolicitante, apRepresentante, apAmbito, apEdificio,
            apCertificado, apDeclaraciones, apAutorizacion, apDocumentacion, apTasas,
        ],
        avisos,
        ficheros,
    };
}

// ─── El PDF ──────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Las instrucciones llevan **negrita** para que la X que hay que marcar y la que
// no se distingan de un vistazo: son la mitad de lo que aporta esta hoja.
const negrita = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// Rótulos de las filas agrupadas del PDF. Dicen lo mismo que el impreso.
const ROTULO_GRUPO = {
    via: 'Tipo y nombre de la vía',
    num: 'N.º, portal, escalera, planta y puerta',
    loc: 'Provincia, población y código postal',
};

/** Una fila por campo, salvo los de un mismo `grupo`, que van juntos en línea. */
function filasDe(campos) {
    const filas = [];
    for (let i = 0; i < campos.length; i++) {
        const c = campos[i];
        if (!c.grupo) {
            filas.push(`<tr><td class="k">${esc(c.campo)}</td><td class="v">${
                c.valor ? esc(c.valor) : '<span class="hueco">&nbsp;</span>'}${
                c.nota ? `<div class="n">${esc(c.nota)}</div>` : ''}</td></tr>`);
            continue;
        }
        const bloque = [];
        while (i < campos.length && campos[i].grupo === c.grupo) bloque.push(campos[i++]);
        i--;
        // Un campo vacío del grupo NO desaparece: en el formulario esa casilla
        // existe, y saber que se queda en blanco es justamente lo que se comprueba.
        const celdas = bloque.map(x => `<span class="par"><span class="r">${esc(x.campo)}</span>${
            x.valor ? esc(x.valor) : '<span class="vacio">—</span>'}</span>`).join('');
        filas.push(`<tr><td class="k">${esc(ROTULO_GRUPO[c.grupo] || '')}</td><td class="v">${celdas}</td></tr>`);
    }
    return filas.join('');
}

/**
 * El borrador como página A4, para descargar o adjuntar.
 *
 * Se rasteriza con `/api/pdf/generate` como el resto de documentos de la app.
 */
export function buildBorradorCeeHtml(borrador) {
    const b = borrador || {};
    const cabecera = [b.numeroExpediente, b.titular].filter(Boolean).join(' · ');

    const avisos = (b.avisos || []).length ? `
      <div class="avisos">
        <div class="avisos-t">Antes de presentar</div>
        ${b.avisos.map(a => `<div class="aviso">${esc(a)}</div>`).join('')}
      </div>` : '';

    const apartados = (b.apartados || []).map(ap => {
        const instrucciones = (ap.instrucciones || []).length
            ? `<ul class="instr">${ap.instrucciones.map(i => `<li>${negrita(i)}</li>`).join('')}</ul>` : '';
        const tabla = (ap.campos || []).length ? `<table>${filasDe(ap.campos)}</table>` : '';
        const original = ap.original ? `<div class="orig">Dirección guardada: ${esc(ap.original)}</div>` : '';
        return `
          <section>
            <h2>${esc(ap.titulo)}</h2>
            ${ap.nota ? `<p class="sub">${esc(ap.nota)}</p>` : ''}
            ${instrucciones}
            ${tabla}
            ${original}
          </section>`;
    }).join('');

    // Un fichero que NO está en la carpeta del CEE se dice, porque es lo que hay
    // que resolver antes de entrar en la sede. `presente: null` es "no se ha
    // mirado" (el PDF se pudo componer sin Drive): entonces no se afirma nada.
    const ficheros = (b.ficheros || []).length ? `
      <section>
        <h2>Documentos anexados</h2>
        <p class="sub">Los cuatro ficheros del ${esc(b.faseLabel || 'certificado')}, renombrados con el NIF del titular delante.</p>
        <ul class="files">${b.ficheros.map(f => `<li>${esc(f.nombreRegistro || f.nombreDrive)}${
            f.presente === false ? ' <span class="falta">— no está en la carpeta del CEE</span>' : ''
        }</li>`).join('')}</ul>
      </section>` : '';

    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 14mm 15mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #111; margin: 0; line-height: 1.35; }
      h1 { font-size: 13pt; margin: 0 0 2px; }
      .tramite { font-size: 8pt; color: #444; margin: 0 0 2px; }
      .exp { font-size: 9pt; font-weight: bold; margin: 0 0 10px; }
      .intro { font-size: 8pt; color: #444; border-left: 2px solid #999; padding-left: 7px; margin: 0 0 12px; }
      section { margin: 0 0 11px; page-break-inside: avoid; }
      h2 { font-size: 10pt; margin: 0 0 3px; padding-bottom: 2px; border-bottom: 1px solid #333; }
      .sub { font-size: 8pt; color: #555; margin: 3px 0; }
      .instr { margin: 4px 0 4px 15px; padding: 0; font-size: 8.5pt; }
      .instr li { margin-bottom: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 4px; }
      td { border: 1px solid #ccc; padding: 3px 5px; vertical-align: top; }
      td.k { width: 38%; font-size: 8pt; color: #444; background: #f4f4f4; }
      td.v { font-size: 9.5pt; }
      .hueco { display: inline-block; min-width: 55%; border-bottom: 1px dotted #666; }
      .par { display: inline-block; margin-right: 14px; white-space: nowrap; }
      .par .r { font-size: 7.5pt; color: #666; text-transform: uppercase; letter-spacing: .3px; margin-right: 4px; }
      .par .vacio { color: #aaa; }
      .n { font-size: 7.5pt; color: #666; margin-top: 1px; }
      .orig { font-size: 7.5pt; color: #666; margin-top: 3px; font-style: italic; }
      .avisos { border: 1px solid #333; padding: 6px 9px; margin: 0 0 12px; page-break-inside: avoid; }
      .avisos-t { font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
      .aviso { font-size: 8.5pt; margin-bottom: 2px; }
      .files { margin: 4px 0 0 15px; padding: 0; font-size: 8.5pt; font-family: 'Courier New', monospace; }
      .files .falta { font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #666; }
      .pie { margin-top: 12px; padding-top: 5px; border-top: 1px solid #ccc; font-size: 7.5pt; color: #555; }
    </style></head><body>
      <h1>Borrador para presentar el ${esc(b.faseLabel || 'CEE')}</h1>
      <p class="tramite">${esc(TRAMITE.titulo)}<br>
         Procedimiento ${esc(TRAMITE.procedimiento)} · Código SIACI ${esc(TRAMITE.siaci)} · ${esc(TRAMITE.tramite)}</p>
      ${cabecera ? `<p class="exp">${esc(cabecera)}</p>` : ''}
      <p class="intro">Esto NO es el impreso: el trámite se rellena en la sede electrónica.
         Es la guía de qué va en cada casilla, en el orden en que el formulario las pide.
         Los apartados 03 (medio de notificación) e información de protección de datos no
         se rellenan: los cumplimenta la propia sede.</p>
      ${avisos}
      ${apartados}
      ${ficheros}
      <div class="pie">${esc(TRAMITE.organismo)} · Código DIR 3: ${esc(TRAMITE.dir3)}<br>${esc(TRAMITE.url)}</div>
    </body></html>`;
}
