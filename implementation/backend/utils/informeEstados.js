// ─── informeEstados.js ──────────────────────────────────────────────────────
// Fuente ÚNICA de lo que es un INFORME técnico ({AAAA}INF_{n}) y un CERTIFICADO
// DE INSTALACIÓN TÉRMICA ({AAAA}CIT_{n}): sus líneas, sus tipos, su circuito
// (estado y de quién es la pelota), sus documentos y cómo se llaman.
// Funciones PURAS: sin BD ni Drive, para que el listado, la ficha, el portal del
// cliente y la prueba (`scripts/test_informes.js`) digan exactamente lo mismo.
//
// El circuito (Fran, 05/11/2026: «envío de oferta, aceptación, memoria, firma,
// factura, pago, envío de memoria»):
//
//   (acepta) PTE. REDACCIÓN → (borrador) EN REVISIÓN → (final) PTE. FIRMA →
//   [solo CIT: (firmado) PTE. PRESENTACIÓN → (certificado oficial)] →
//   PTE. FACTURA → (factura enviada) PTE. PAGO → (justificante) PAGO RECIBIDO →
//   (confirmar cobro, UN clic) COBRADO → (sola) ENTREGADO
//
// El estado se DERIVA de los sellos de la fila: nunca se acepta del navegador
// (lección del CAE, donde lo escribían seis sitios).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Las LÍNEAS de trabajo que viven en la tabla `informes`. Cada una con su
 * número `{AAAA}{LINEA}_{n}` (correlativo propio), su carpeta raíz y lo que se
 * le ENTREGA al cliente al cobrar.
 *   · INF: «todo lo que no sea CAE ni CEE» (Fran, 05/11/2026). Se entrega SOLO el firmado.
 *   · CIT: el RITE SUELTO (no el de una obra CAE). Se entrega SOLO el certificado
 *     oficial de eDICE, el impreso sellado por la JCCM (Fran, 05/11/2026).
 */
const LINEAS = {
    INF: {
        etiqueta: 'Informe técnico', corto: 'Informe', tipoDefecto: 'INFORME_TECNICO',
        entrega: 'FIRMADO', entregaEtiqueta: 'el documento firmado', presentacion: false,
        subcarpetas: { principal: '1. INFORME', docs: '2. DOCUMENTACIÓN', facturas: '3. PRESUPUESTO Y FACTURAS' },
    },
    CIT: {
        etiqueta: 'Certificado de instalación térmica', corto: 'CIT', tipoDefecto: 'INSTALACION_TERMICA',
        entrega: 'CERTIFICADO_OFICIAL', entregaEtiqueta: 'el certificado de instalación térmica', presentacion: true,
        subcarpetas: { principal: '1. MEMORIA Y CERTIFICADO', docs: '2. DOCUMENTACIÓN', facturas: '3. PRESUPUESTO Y FACTURAS' },
    },
};
const LINEA_DEFECTO = 'INF';
const lineaValida = (l) => (LINEAS[String(l || '').toUpperCase()] ? String(l).toUpperCase() : LINEA_DEFECTO);
const lineaDe = (row) => lineaValida(row?.linea);
/** La línea de un número (`2026CIT_3` → CIT), o null si no es de ninguna. */
const lineaDeNumero = (n) => (String(n || '').trim().toUpperCase().match(/^\d{4}(INF|CIT)_\d+$/) || [])[1] || null;

const TIPOS = {
    MEMORIA_AYUNTAMIENTO: { linea: 'INF', etiqueta: 'Memoria para el Ayuntamiento', titulo: 'MEMORIA TECNICA AYUNTAMIENTO' },
    LEGALIZACION:         { linea: 'INF', etiqueta: 'Legalización',                 titulo: 'MEMORIA TECNICA DE LEGALIZACION' },
    INFORME_TECNICO:      { linea: 'INF', etiqueta: 'Informe técnico',              titulo: 'INFORME TECNICO' },
    AUDITORIA:            { linea: 'INF', etiqueta: 'Auditoría energética',         titulo: 'AUDITORIA ENERGETICA' },
    CONSULTORIA:          { linea: 'INF', etiqueta: 'Consultoría',                  titulo: 'INFORME DE CONSULTORIA' },
    OTRO:                 { linea: 'INF', etiqueta: 'Otro trabajo',                 titulo: 'INFORME' },
    INSTALACION_TERMICA:  { linea: 'CIT', etiqueta: 'Certificado de instalación térmica (RITE)', titulo: 'MEMORIA TECNICA RITE' },
};
const TIPO_DEFECTO = LINEAS[LINEA_DEFECTO].tipoDefecto;

/** Un tipo válido DE ESA LÍNEA (si se pasa); si no lo es, el de por defecto de la línea. */
function tipoValido(t, linea = null) {
    const k = String(t || '').toUpperCase();
    const l = linea ? lineaValida(linea) : null;
    if (TIPOS[k] && (!l || TIPOS[k].linea === l)) return k;
    return l ? LINEAS[l].tipoDefecto : TIPO_DEFECTO;
}
const tipoDe = (row) => TIPOS[tipoValido(row?.tipo, lineaDe(row))];

/** El tipo que se deduce del concepto de una partida de INFORME, si el artículo no lo dice. */
function tipoDeConcepto(texto) {
    const t = String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    // `\b`: «ibi» va dentro de «posibilidad» e «icio» dentro de «servicio» o «edificio».
    if (/ayuntamiento|\bibi\b|\bicio\b|licencia|titulo habilitante|urbanistic/.test(t)) return 'MEMORIA_AYUNTAMIENTO';
    if (/legaliza/.test(t)) return 'LEGALIZACION';
    if (/auditor/.test(t)) return 'AUDITORIA';
    if (/consultor|asesor/.test(t)) return 'CONSULTORIA';
    return TIPO_DEFECTO;
}

/** La línea que abre un artículo del catálogo (`articulos.genera`), o null. */
const lineaDeGenera = (g) => ({ INFORME: 'INF', CIT: 'CIT' })[String(g || '').toUpperCase()] || null;

// ── Carpetas y documentos ───────────────────────────────────────────────────

/** Los nombres de las tres subcarpetas de un informe de esa línea. */
const subcarpetas = (linea) => LINEAS[lineaValida(linea)].subcarpetas;
const SUBCARPETAS_DE = (linea) => Object.values(subcarpetas(linea));

/**
 * Las CLASES de documento y en qué subcarpeta (por PAPEL: principal, docs,
 * facturas) viven. El nombre lo pone el SERVIDOR (`nombreCanonico`), nunca quien
 * sube: así se reconoce cada uno por su sufijo, igual que los slots del CEE.
 */
const CLASES = {
    BORRADOR_PDF:        { carpeta: 'principal', sufijo: ' (BORRADOR).pdf',  ext: ['pdf'],  etiqueta: 'Borrador (PDF)' },
    BORRADOR_WORD:       { carpeta: 'principal', sufijo: ' (BORRADOR).docx', ext: ['docx'], etiqueta: 'Borrador (Word)' },
    FINAL_PDF:           { carpeta: 'principal', sufijo: '.pdf',             ext: ['pdf'],  etiqueta: 'Versión final (PDF)' },
    FINAL_WORD:          { carpeta: 'principal', sufijo: '.docx',            ext: ['docx'], etiqueta: 'Versión final (Word)' },
    FIRMADO:             { carpeta: 'principal', sufijo: '_fdo.pdf',         ext: ['pdf'],  etiqueta: 'Firmado' },
    // Solo CIT: el impreso oficial de eDICE (el de la IMPRESORA, `GenerarPdf.pdf`).
    CERTIFICADO_OFICIAL: { carpeta: 'principal', sufijo: ' (CERTIFICADO OFICIAL).pdf', ext: ['pdf'], etiqueta: 'Certificado oficial (eDICE)', linea: 'CIT' },
    JUSTIFICANTE:        { carpeta: 'facturas',  sufijo: null,               ext: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'], etiqueta: 'Justificante de pago' },
    DOCUMENTACION:       { carpeta: 'docs',      sufijo: null,               ext: ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp', 'docx', 'xlsx', 'doc', 'xls', 'zip'], etiqueta: 'Documentación' },
};
/** ¿Esa clase existe en esa línea? (el certificado oficial solo en CIT). */
const claseDeLinea = (clase, linea) => !!CLASES[clase] && (!CLASES[clase].linea || CLASES[clase].linea === lineaValida(linea));
/** El nombre de la subcarpeta donde va una clase en esa línea. */
const carpetaDeClase = (clase, linea) => subcarpetas(linea)[CLASES[clase].carpeta];

/** Lo que se le pide al cliente según el tipo (su enlace lo enseña como lista). */
const DOCS_CLIENTE = {
    MEMORIA_AYUNTAMIENTO: [
        { id: 'PRESUPUESTO_INSTALADOR', etiqueta: 'Presupuesto o factura del instalador', ayuda: 'El que detalla los paneles, el inversor y lo que se instala.' },
        { id: 'FICHAS_TECNICAS', etiqueta: 'Fichas técnicas de los equipos', ayuda: 'Paneles, inversor, batería o aerotermia. Si no las tienes, las buscamos nosotros.', opcional: true },
        { id: 'FOTOS_CUBIERTA', etiqueta: 'Fotos del tejado o de la cubierta', ayuda: 'Donde van (o están) las placas.', opcional: true },
        { id: 'TITULO_HABILITANTE', etiqueta: 'Licencia o comunicación previa de la obra', ayuda: 'El título urbanístico del Ayuntamiento, si ya lo tienes.', opcional: true },
        { id: 'RECIBO_IBI', etiqueta: 'Último recibo del IBI', ayuda: 'Para la referencia catastral y el titular.', opcional: true },
    ],
    LEGALIZACION: [
        { id: 'PRESUPUESTO_INSTALADOR', etiqueta: 'Presupuesto o factura de la instalación' },
        { id: 'FICHAS_TECNICAS', etiqueta: 'Fichas técnicas de los equipos', opcional: true },
        { id: 'FOTOS_INSTALACION', etiqueta: 'Fotos de la instalación', opcional: true },
    ],
    // Lo que hace falta para la memoria RITE: qué equipos, de qué potencia, dónde.
    INSTALACION_TERMICA: [
        { id: 'FACTURA_INSTALACION', etiqueta: 'Factura o presupuesto de la instalación', ayuda: 'La que detalla los equipos instalados.' },
        { id: 'FOTOS_PLACAS', etiqueta: 'Fotos de las placas de los equipos', ayuda: 'La pegatina con el modelo y la potencia de cada unidad (interior y exterior).' },
        { id: 'FICHAS_TECNICAS', etiqueta: 'Fichas técnicas de los equipos', ayuda: 'Si no las tienes, las buscamos nosotros.', opcional: true },
        { id: 'FOTOS_INSTALACION', etiqueta: 'Fotos de la instalación', ayuda: 'Las unidades montadas, por dentro y por fuera.', opcional: true },
    ],
};
const DOCS_GENERICOS = [{ id: 'DOCUMENTACION', etiqueta: 'Documentación para el informe', ayuda: 'Lo que tengas: presupuestos, fotos, planos…' }];
const docsCliente = (tipo, linea = null) => DOCS_CLIENTE[tipoValido(tipo, linea)] || DOCS_GENERICOS;

/** `{nº} - {TITULO}`: la base de todos los ficheros del informe. */
function baseNombre(row) {
    const titulo = String(row?.titulo || tipoDe(row).titulo)
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    return `${row.numero} - ${titulo}`;
}

/**
 * El nombre con el que se guarda un fichero. El de las clases fijas no depende
 * de cómo lo llamó quien lo sube; el de la documentación y el justificante
 * conserva el original detrás del prefijo (puede haber varios).
 */
function nombreCanonico(row, clase, original = '') {
    const c = CLASES[clase];
    if (!c) throw new Error(`Clase de documento desconocida: ${clase}`);
    if (c.sufijo) return `${baseNombre(row)}${c.sufijo}`;
    const limpio = String(original || 'documento').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    const pref = clase === 'JUSTIFICANTE' ? `${row.numero} - JUSTIFICANTE DE PAGO` : `${row.numero} - `;
    if (clase === 'JUSTIFICANTE') {
        const ext = (limpio.match(/\.[a-z0-9]{2,5}$/i) || ['.pdf'])[0].toLowerCase();
        return `${pref}${ext}`;
    }
    return limpio.startsWith(`${row.numero} - `) ? limpio : `${pref}${limpio}`;
}

/**
 * A qué clase pertenece un fichero de la subcarpeta principal por su nombre. El
 * orden importa: «_fdo.pdf», « (BORRADOR).pdf» y « (CERTIFICADO OFICIAL).pdf»
 * acaban también en «.pdf».
 */
function claseDeNombre(nombre) {
    const n = String(nombre || '').toUpperCase();
    if (n.endsWith('_FDO.PDF')) return 'FIRMADO';
    if (n.endsWith(' (CERTIFICADO OFICIAL).PDF')) return 'CERTIFICADO_OFICIAL';
    if (n.endsWith(' (BORRADOR).PDF')) return 'BORRADOR_PDF';
    if (n.endsWith(' (BORRADOR).DOCX')) return 'BORRADOR_WORD';
    if (n.endsWith('.PDF')) return 'FINAL_PDF';
    if (n.endsWith('.DOCX')) return 'FINAL_WORD';
    return null;
}

const extDe = (nombre) => (String(nombre || '').match(/\.([a-z0-9]{2,5})$/i) || [])[1]?.toLowerCase() || '';

// ── El circuito ─────────────────────────────────────────────────────────────

/** Las facturas que cuentan: ni borradores, ni rectificadas, ni rectificativas. */
function facturasVivas(facturas = []) {
    return (facturas || []).filter(f => f && (!f.tipo || f.tipo === 'F1') && ['EMITIDA', 'PAGADA'].includes(f.estado));
}

/**
 * Estado y pelota. `row` trae los sellos de la tabla; `facturas`, las de
 * `facturas_emitidas` con su `informe_id` (opcional: sin ellas se usan
 * `factura_numero`/`factura_enviada_at` de la fila, que es lo que lee el listado).
 */
function derivar(row, facturas = null) {
    if (row.anulado_at) return { estado: 'ANULADO', pelota: null, paso: null };
    if (row.entregado_at) return { estado: 'ENTREGADO', pelota: null, paso: 'entrega' };
    if (row.cobrado) return { estado: 'COBRADO · PTE. ENTREGA', pelota: 'NUESTRA', paso: 'entrega' };

    const vivas = facturas ? facturasVivas(facturas) : null;
    const hayFactura = vivas ? vivas.length > 0 : !!row.factura_numero;
    const enviada = vivas ? vivas.some(f => f.enviada_at) : !!row.factura_enviada_at;

    if (row.justificante_at && hayFactura) return { estado: 'PAGO RECIBIDO', pelota: 'NUESTRA', paso: 'pago' };
    if (hayFactura && enviada) return { estado: 'PTE. PAGO', pelota: 'CLIENTE', paso: 'pago' };
    if (hayFactura) return { estado: 'FACTURA SIN ENVIAR', pelota: 'NUESTRA', paso: 'factura' };
    // CIT: la memoria firmada se PRESENTA en eDICE; hasta tener el certificado
    // oficial no hay nada que entregar.
    if (row.firmado_at && LINEAS[lineaDe(row)].presentacion && !row.registrado_at) {
        return { estado: 'PTE. PRESENTACIÓN', pelota: 'NUESTRA', paso: 'presentacion' };
    }
    if (row.firmado_at) return { estado: 'PTE. FACTURA', pelota: 'NUESTRA', paso: 'factura' };
    if (row.final_at) return { estado: 'PTE. FIRMA', pelota: 'NUESTRA', paso: 'firma' };
    if (row.borrador_at) return { estado: 'EN REVISIÓN', pelota: 'NUESTRA', paso: 'redaccion' };
    return { estado: 'PTE. REDACCIÓN', pelota: 'NUESTRA', paso: 'redaccion' };
}
const deriveEstado = (row, facturas = null) => derivar(row, facturas).estado;

const TERMINADOS = ['ENTREGADO', 'ANULADO'];

/**
 * Los pasos del circuito con su estado, para el panel «Procedimiento» de la
 * ficha y para el portal del cliente. `hecho` es la fecha en que se cumplió.
 */
function pasos(row, facturas = null) {
    const vivas = facturas ? facturasVivas(facturas) : [];
    const fac = vivas[vivas.length - 1] || null;
    const actual = derivar(row, facturas).paso;
    const cit = lineaDe(row) === 'CIT';
    const lista = [
        { id: 'aceptacion', titulo: 'Presupuesto aceptado', hecho: row.presupuesto_id ? (row.documentacion?.presupuesto?.aceptado_at || row.created_at) : row.created_at, quien: 'Cliente' },
        { id: 'redaccion', titulo: cit ? 'Memoria técnica' : 'Redacción', hecho: row.final_at, detalle: row.borrador_at && !row.final_at ? 'Borrador en revisión' : null, quien: 'Nosotros' },
        { id: 'firma', titulo: cit ? 'Firma de la memoria' : 'Firma del técnico', hecho: row.firmado_at, quien: cit ? 'Empresa instaladora' : 'Fran' },
        ...(cit ? [{ id: 'presentacion', titulo: 'Presentación en Industria (eDICE)', hecho: row.registrado_at, quien: 'Nosotros' }] : []),
        { id: 'factura', titulo: 'Factura', hecho: fac?.enviada_at || row.factura_enviada_at, detalle: fac?.numero || row.factura_numero || null, quien: 'Nosotros' },
        { id: 'pago', titulo: 'Pago', hecho: row.cobrado_at, detalle: row.justificante_at && !row.cobrado ? 'Justificante subido: falta confirmarlo' : null, quien: 'Cliente' },
        { id: 'entrega', titulo: cit ? 'Entrega del certificado' : 'Entrega del documento firmado', hecho: row.entregado_at, quien: 'Sola' },
    ];
    return lista.map(p => ({ ...p, actual: !p.hecho && p.id === actual }));
}

// Compatibilidad: los nombres de las subcarpetas de un INF (los de siempre).
const SUB_INFORME = LINEAS.INF.subcarpetas.principal;
const SUB_DOCS = LINEAS.INF.subcarpetas.docs;
const SUB_FACTURAS = LINEAS.INF.subcarpetas.facturas;
const SUBCARPETAS = SUBCARPETAS_DE('INF');

module.exports = {
    LINEAS, LINEA_DEFECTO, lineaValida, lineaDe, lineaDeNumero, lineaDeGenera,
    TIPOS, TIPO_DEFECTO, tipoValido, tipoDe, tipoDeConcepto,
    subcarpetas, SUBCARPETAS_DE, SUB_INFORME, SUB_DOCS, SUB_FACTURAS, SUBCARPETAS,
    CLASES, claseDeLinea, carpetaDeClase, DOCS_CLIENTE, DOCS_GENERICOS, docsCliente,
    baseNombre, nombreCanonico, claseDeNombre, extDe,
    facturasVivas, derivar, deriveEstado, TERMINADOS, pasos,
};
