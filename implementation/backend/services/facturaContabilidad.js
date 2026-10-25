/**
 * facturaContabilidad — archiva la factura de Brokergy al Sujeto Obligado en la
 * carpeta de CONTABILIDAD, por año y mes:
 *
 *   00. S2E2 / 04. CONTABILIDAD / CAE - SERVICIOS CAE / FACTURAS VENTAS / 2026 / 10. OCTUBRE
 *
 * Es donde la busca quien lleva la contabilidad, y hasta ahora había que bajarla
 * de la carpeta del lote y copiarla a mano. Se hace al ENVIARLA al S.O.
 *
 * REGLA — el mes es el de la FECHA DE LA FACTURA, no el del día del envío: una
 * factura de septiembre que se manda el 2 de octubre es de septiembre para Hacienda.
 *
 * REGLA — si no se puede llegar a la carpeta del mes, se FALLA, nunca se deja el
 * fichero en la carpeta de arriba. `getOrCreateSubfolder` devuelve el padre cuando
 * algo va mal, y aquí eso sería una factura archivada en el año equivocado sin que
 * nadie lo note.
 *
 * El nombre es el MISMO que el de la factura en la carpeta del lote, sin su
 * prefijo de orden: "F-2026CAE_9 - LOTE-2025-003 - INTERALCO.pdf" (decisión del
 * usuario, 2026-10-02). Se guarda al GENERARLA y al ENVIARLA; con el mismo nombre
 * la segunda sustituye a la primera, y también a la que se hubiera copiado a mano.
 */
const driveService = require('./driveService');

// Carpeta "FACTURAS VENTAS" de CAE - SERVICIOS CAE (cuenta de Drive de la app).
// REGLA — aquí van SOLO las facturas a los SUJETOS OBLIGADOS (decisión del usuario,
// 2026-10-19). Las de la serie {YY}ING_{n} —CEE directos y honorarios de gestión
// CAE a clientes o instaladores— van a la de INGENIERÍA (`archivarFacturaIngenieria`).
const RAIZ = process.env.CONTABILIDAD_FACTURAS_CAE_FOLDER_ID || '1NG1w-QW0YGzqOXazwMVmVNT7HCXSWFpf';
// "00. S2E2 / 04. CONTABILIDAD / ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS".
const RAIZ_ING = process.env.CONTABILIDAD_FACTURAS_ING_FOLDER_ID || '1M-SVjCAhDXDqbugXCBDWH0nUvYYLvFdh';
// "00. S2E2 / 04. CONTABILIDAD / FML - SERVICIOS AUTONOMO / VENTAS".
// REGLA — las FML son del AUTÓNOMO (Fran a la sociedad): van a SU carpeta de
// ventas, nunca a la de ING, que es la de la sociedad (2026-10-24).
const RAIZ_FML = process.env.CONTABILIDAD_FACTURAS_FML_FOLDER_ID || '1PYgsnaefPpyTNgUpNJXGIhv5RnBnZaEC';
// "00. S2E2 / 04. CONTABILIDAD / ING - SERVICIOS DE INGENIERIA / FACTURAS GASTOS".
// Para la SOCIEDAD, la FML es un GASTO: una copia va aquí, en el mes que factura.
const RAIZ_GASTOS_ING = process.env.CONTABILIDAD_GASTOS_ING_FOLDER_ID || '1KzfsPEAW7vL3hv06JB1q_Vz_qPd9wdXK';

// REGLA — con una COPIA del libro de AppSheet (las pruebas) no se archiva en la
// contabilidad REAL: el 19/10/2026 una prueba que desviaba la variable vieja dejó
// en «ING / FACTURAS VENTAS / 2026 / 10. OCTUBRE» un PDF de prueba con el número
// 26ING_87, que luego tuvo de verdad la factura de otro cliente.
const RAICES_REALES = new Set(['1M-SVjCAhDXDqbugXCBDWH0nUvYYLvFdh', '1PYgsnaefPpyTNgUpNJXGIhv5RnBnZaEC', '1KzfsPEAW7vL3hv06JB1q_Vz_qPd9wdXK']);
function soloConLibroReal(raiz) {
    const { ES_LIBRO_REAL } = require('./facturaSheetService');
    if (!ES_LIBRO_REAL && RAICES_REALES.has(raiz)) throw new Error('Con una COPIA del libro (una prueba) no se archiva en la contabilidad real.');
}

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
    'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** "02/10/2026" (o ISO "2026-10-02") → { anio: 2026, mes: 10 }, o null. */
function anioMesDe(fecha) {
    const s = String(fecha || '').trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) return { anio: Number(m[3]), mes: Number(m[2]) };
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { anio: Number(m[1]), mes: Number(m[2]) };
    return null;
}

/** Nombre de la carpeta del mes: "10. OCTUBRE". */
const carpetaMes = (mes) => `${mes}. ${MESES[mes - 1]}`;

/** Nombre del fichero: "{nº} - {lote} - {acrónimo del S.O.}.pdf", sin caracteres que Windows no admite. */
function nombreFichero(numero, codigoLote, acronimoSo) {
    const limpio = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '-').trim();
    const partes = [limpio(numero) || 'Factura', limpio(codigoLote) || 'LOTE', limpio(acronimoSo) || 'SO'];
    return `${partes.join(' - ')}.pdf`;
}

async function subcarpeta(padre, nombre) {
    const id = (await driveService.findSubfolderByName(padre, nombre)) || (await driveService.createSubfolder(padre, nombre));
    if (!id || id === padre) throw new Error(`No se pudo abrir la carpeta "${nombre}" de contabilidad.`);
    return id;
}

/**
 * Guarda el PDF en FACTURAS VENTAS/{año}/{n. MES}. Si ya hay uno con el mismo
 * nombre (la misma factura reenviada), lo SUSTITUYE: es el mismo número.
 * @returns {Promise<{ link, id, ruta, fileName }>}
 */
async function archivarFacturaVenta({ pdf, numero, fecha, codigoLote, acronimoSo }) {
    return archivarEn(RAIZ, { pdf, fecha, fileName: nombreFichero(numero, codigoLote, acronimoSo) }, 'FACTURAS VENTAS');
}

/**
 * Las facturas de la serie {YY}ING_{n} (CEE directos y honorarios de gestión CAE),
 * en «ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS / {año} / {n. MES}», con el
 * MISMO nombre que en la carpeta de AppSheet («26ING_80 - MANUEL CARNICER
 * RAMÍREZ.pdf»), que es como ya estaban las que se copiaban a mano.
 */
async function archivarFacturaIngenieria({ pdf, fecha, fileName }) {
    soloConLibroReal(RAIZ_ING);
    return archivarEn(RAIZ_ING, { pdf, fecha, fileName }, 'ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS');
}

/**
 * Las facturas de la serie {YY}FML_{n} (el autónomo a la sociedad), en «FML -
 * SERVICIOS AUTONOMO / VENTAS / {año} / {n. MES}», con el nombre de siempre
 * («26FML_16 - SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL.pdf»).
 */
async function archivarFacturaAutonomo({ pdf, fecha, fileName }) {
    soloConLibroReal(RAIZ_FML);
    return archivarEn(RAIZ_FML, { pdf, fecha, fileName }, 'FML - SERVICIOS AUTONOMO / VENTAS');
}

/**
 * La MISMA FML, como GASTO de la sociedad, en «ING - SERVICIOS DE INGENIERIA /
 * FACTURAS GASTOS / {año} / {n. MES}», con el mismo nombre que en ventas. Es donde
 * las ha dejado Fran siempre (25FML_1 a 26FML_18), y en el mes que FACTURA, no en
 * el de la fecha: la 26FML_16 «(julio)», fechada el 29/09, está en «7. JULIO»
 * (Fran, 24/10/2026: «es un gasto de FML autónomo que le factura a BROKERGY»).
 * Sus cifras las sigue poniendo la app (`facturas_emitidas`): este PDF no se lee.
 */
async function archivarFmlComoGastoSl({ pdf, fecha, concepto, fileName }) {
    soloConLibroReal(RAIZ_GASTOS_ING);
    const am = anioMesDe(fecha);
    const mes = am ? mesQueFactura(concepto, am.mes) : null;
    return archivarEn(RAIZ_GASTOS_ING, { pdf, fecha, fileName, mes }, 'ING - SERVICIOS DE INGENIERIA / FACTURAS GASTOS');
}

/** El mes que nombra el concepto («… – julio 2026»), si no es posterior al de la factura; si no, el de la factura. */
function mesQueFactura(concepto, mesFactura) {
    const t = String(concepto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const nombrados = MESES.map((m, i) => (new RegExp(`\\b${m}\\b`).test(t) ? i + 1 : null)).filter(m => m && m <= mesFactura);
    return nombrados.length ? Math.max(...nombrados) : mesFactura;
}

async function archivarEn(raiz, { pdf, fecha, fileName, mes = null }, etiqueta) {
    const am = anioMesDe(fecha);
    if (!am || am.mes < 1 || am.mes > 12) throw new Error(`La fecha de la factura no es válida (${fecha || 'vacía'}).`);
    if (mes) am.mes = mes;
    const idAnio = await subcarpeta(raiz, String(am.anio));
    const nombreMes = carpetaMes(am.mes);
    const idMes = await subcarpeta(idAnio, nombreMes);

    const previo = await driveService.findFileByName(idMes, fileName).catch(() => null);
    const saved = await driveService.saveFileToFolder(idMes, fileName, 'application/pdf', pdf);
    if (!saved?.id) throw new Error('Drive no devolvió el fichero guardado.');
    // El anterior se quita DESPUÉS de subir el nuevo: si la subida fallara, la
    // carpeta no se quedaría sin la factura.
    if (previo && previo !== saved.id) await driveService.deleteFile(previo).catch(() => { });

    return { id: saved.id, link: saved.link, fileName, ruta: `${etiqueta} / ${am.anio} / ${nombreMes}` };
}

module.exports = { archivarFacturaVenta, archivarFacturaIngenieria, archivarFacturaAutonomo, archivarFmlComoGastoSl, mesQueFactura, anioMesDe, carpetaMes, nombreFichero };
