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
 * El nombre sigue el patrón que ya hay en esa carpeta: "F-2026CAE_6 - NATURGY IBERIA, S.A..pdf".
 */
const driveService = require('./driveService');

// Carpeta "FACTURAS VENTAS" de CAE - SERVICIOS CAE (cuenta de Drive de la app).
const RAIZ = process.env.CONTABILIDAD_FACTURAS_CAE_FOLDER_ID || '1NG1w-QW0YGzqOXazwMVmVNT7HCXSWFpf';

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

/** Nombre del fichero: "{nº} - {razón social}.pdf", sin caracteres que Windows no admite. */
function nombreFichero(numero, razonSocial) {
    const limpio = (t) => String(t || '').replace(/[\\/:*?"<>|]/g, '-').trim();
    const partes = [limpio(numero), limpio(razonSocial)].filter(Boolean);
    return `${partes.join(' - ') || 'Factura'}.pdf`;
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
async function archivarFacturaVenta({ pdf, numero, fecha, razonSocial }) {
    const am = anioMesDe(fecha);
    if (!am || am.mes < 1 || am.mes > 12) throw new Error(`La fecha de la factura no es válida (${fecha || 'vacía'}).`);
    const idAnio = await subcarpeta(RAIZ, String(am.anio));
    const nombreMes = carpetaMes(am.mes);
    const idMes = await subcarpeta(idAnio, nombreMes);

    const fileName = nombreFichero(numero, razonSocial);
    const previo = await driveService.findFileByName(idMes, fileName).catch(() => null);
    const saved = await driveService.saveFileToFolder(idMes, fileName, 'application/pdf', pdf);
    if (!saved?.id) throw new Error('Drive no devolvió el fichero guardado.');
    // El anterior se quita DESPUÉS de subir el nuevo: si la subida fallara, la
    // carpeta no se quedaría sin la factura.
    if (previo && previo !== saved.id) await driveService.deleteFile(previo).catch(() => { });

    return { id: saved.id, link: saved.link, fileName, ruta: `FACTURAS VENTAS / ${am.anio} / ${nombreMes}` };
}

module.exports = { archivarFacturaVenta, anioMesDe, carpetaMes, nombreFichero };
