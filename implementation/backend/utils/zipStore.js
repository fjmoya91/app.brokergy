// ─────────────────────────────────────────────────────────────────────────────
// Escritor de ZIP mínimo, SIN dependencias nuevas.
//
// Lo usa el paquete de actuaciones del lote (services/envioGestorService.js), que
// tiene que dejar un "ActuacionE{n}.zip" con los PDFs ya renombrados.
//
// POR QUÉ NO `archiver`: el contenido son PDFs y un `.xml`, y los PDF ya vienen
// comprimidos por dentro — deflatearlos otra vez ahorra una migaja y cuesta una
// dependencia más en la imagen del backend. Aquí se escribe el ZIP en modo STORE,
// que es la parte del formato que llevan implementando igual todos los
// descompresores desde 1989 (APPNOTE 4.3, secciones 4.3.7 / 4.3.12 / 4.3.16).
//
// LÍMITES A PROPÓSITO: 32 bits, sin ZIP64. Un paquete de una actuación son ~20
// ficheros y decenas de MB; si algún día hiciera falta pasar de 4 GB, el formato
// avisa solo (los tamaños no caben) y entonces sí toca `archiver`.
//
// Nombres en UTF-8: se marca el bit 11 de los flags (EFS), o los acentos de
// "CERTIFICACIÓN" se leen como basura en Windows.
// ─────────────────────────────────────────────────────────────────────────────

// Tabla CRC-32 (polinomio 0xEDB88320), construida una vez por proceso.
const CRC_TABLA = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLA[(c ^ buf[i]) & 0xFF];
    return (c ^ (-1)) >>> 0;
}

// Fecha y hora en formato MS-DOS (dos words). Antes de 1980 no existe en el
// formato: se recorta a 1980-01-01 en vez de escribir un valor imposible.
function dosDateTime(date) {
    const d = date instanceof Date && !isNaN(date) ? date : new Date();
    const y = Math.max(1980, d.getFullYear());
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1F);
    const fecha = (((y - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
    return { time, fecha };
}

/**
 * Crea un ZIP en memoria.
 * @param {Array<{ name: string, data: Buffer, date?: Date }>} entradas
 * @returns {Buffer}
 */
function crearZip(entradas) {
    const items = (Array.isArray(entradas) ? entradas : []).filter(e => e && e.name && e.data);
    if (!items.length) throw new Error('crearZip: no hay ficheros que comprimir');

    const partes = [];
    const central = [];
    let offset = 0;

    for (const it of items) {
        // Las barras son separador de carpeta DENTRO del zip: en un nombre de
        // fichero las convertiría en una jerarquía que nadie ha pedido.
        const nombre = Buffer.from(String(it.name).replace(/[\\/]+/g, '_'), 'utf8');
        const data = Buffer.isBuffer(it.data) ? it.data : Buffer.from(it.data);
        const crc = crc32(data);
        const { time, fecha } = dosDateTime(it.date);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);   // firma
        local.writeUInt16LE(20, 4);           // versión necesaria (2.0)
        local.writeUInt16LE(0x0800, 6);       // flags: nombre en UTF-8
        local.writeUInt16LE(0, 8);            // método: STORE
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(fecha, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18); // tamaño comprimido
        local.writeUInt32LE(data.length, 22); // tamaño original
        local.writeUInt16LE(nombre.length, 26);
        local.writeUInt16LE(0, 28);           // sin campo extra
        partes.push(local, nombre, data);

        const cd = Buffer.alloc(46);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4);              // versión con la que se creó
        cd.writeUInt16LE(20, 6);              // versión necesaria
        cd.writeUInt16LE(0x0800, 8);
        cd.writeUInt16LE(0, 10);
        cd.writeUInt16LE(time, 12);
        cd.writeUInt16LE(fecha, 14);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(data.length, 20);
        cd.writeUInt32LE(data.length, 24);
        cd.writeUInt16LE(nombre.length, 28);
        cd.writeUInt16LE(0, 30);              // extra
        cd.writeUInt16LE(0, 32);              // comentario
        cd.writeUInt16LE(0, 34);              // nº de disco
        cd.writeUInt16LE(0, 36);              // atributos internos
        cd.writeUInt32LE(0, 38);              // atributos externos
        cd.writeUInt32LE(offset, 42);         // offset de su cabecera local
        central.push(cd, nombre);

        offset += local.length + nombre.length + data.length;
    }

    const cdBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);                 // este disco
    eocd.writeUInt16LE(0, 6);                 // disco del directorio central
    eocd.writeUInt16LE(items.length, 8);
    eocd.writeUInt16LE(items.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);                // sin comentario

    return Buffer.concat([...partes, cdBuf, eocd]);
}

module.exports = { crearZip, crc32 };
