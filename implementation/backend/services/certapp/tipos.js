// ─── certapp/tipos.js — el tipo REAL de un fichero, por sus bytes ────────────
// Lo que dice el navegador (mimetype, extensión) lo escribe quien sube: un SVG
// con un <script> llega como «image/jpeg» si así lo quiere. Aquí el tipo sale de
// los BYTES MÁGICOS y solo vale lo de la lista permitida:
//
//   imagen  jpg · png · webp · heic/heif        (fotos y placas)
//   vídeo   mp4 · mov                           (VIDEO_VIVIENDA)
//   pdf                                          (DOC_*)
//   cex     un .cex de CE3X (pickle «CEXv…» / «CE3Xv…»)   DOC_* del CERTIFICADOR
//   xml     el XML de un CEE (<DatosEnergeticosDelEdificio>) DOC_* del CERTIFICADOR
//
// Fuera siempre: svg, html, xml que no sea un CEE, js y todo lo demás. El .cex y
// el XML se aceptan solo porque DOC_CEE_EXISTENTE pide «PDF, XML o .cex», y se
// sirven SIEMPRE como descarga (application/octet-stream).
//
// Al servir (/fichero, /thumb): Content-Type de la lista o octet-stream, en línea
// solo imagen y PDF, y SIEMPRE `X-Content-Type-Options: nosniff` +
// `Content-Security-Policy: default-src 'none'; sandbox`: aunque un fichero
// mintiera, el navegador nunca lo ejecuta en el origen de la app.
// Ver docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────

const MARCAS_HEIF = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'];
const MARCAS_HEIF_GENERICA = ['mif1', 'msf1'];
const MARCAS_MP4 = ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'mp71', 'avc1',
    'm4v ', 'm4vh', 'm4vp', 'msnv', '3gp4', '3gp5', '3gp6', '3gp7', '3g2a', '3ge6', 'dash', 'mmp4', 'f4v ', 'xavc', 'ndas'];
const ATOMOS_MOV = ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'];

const TIPOS = {
    jpg: { mime: 'image/jpeg', clase: 'imagen' },
    png: { mime: 'image/png', clase: 'imagen' },
    webp: { mime: 'image/webp', clase: 'imagen' },
    heic: { mime: 'image/heic', clase: 'imagen' },
    heif: { mime: 'image/heif', clase: 'imagen' },
    mp4: { mime: 'video/mp4', clase: 'video' },
    mov: { mime: 'video/quicktime', clase: 'video' },
    pdf: { mime: 'application/pdf', clase: 'pdf' },
    cex: { mime: 'application/octet-stream', clase: 'cex' },
    xml: { mime: 'application/xml', clase: 'xml' },
};
const tipo = (ext) => ({ ext, ...TIPOS[ext] });

// Lo que se puede servir con SU Content-Type. Todo lo demás, octet-stream.
const MIME_SERVIBLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'video/mp4', 'video/quicktime']);
// …y de eso, lo que se abre EN LÍNEA (el resto, descarga).
const MIME_EN_LINEA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
// Lo que /thumb devuelve (lo que pinta un <img>).
const MIME_MINIATURA = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ascii = (buf, desde, hasta) => buf.toString('latin1', desde, hasta);

/** ¿Es el XML de un CEE, y nada que un navegador pueda ejecutar? */
function esXmlDeCee(buf) {
    const cabeza = ascii(buf, 0, Math.min(buf.length, 4096)).replace(/^﻿|^ï»¿/, '').trimStart();
    if (!cabeza.startsWith('<?xml')) return false;
    if (!/<DatosEnergeticosDelEdificio[\s>]/.test(cabeza)) return false;
    // Todo el fichero (≤ 25 MB): nada de HTML, SVG, scripts ni DTD.
    const todo = ascii(buf, 0, buf.length).toLowerCase();
    return !/<script|<svg|<html|<body|<iframe|<!doctype|<!entity|xmlns(:\w+)?\s*=\s*["']http:\/\/www\.w3\.org\/(1999\/xhtml|2000\/svg)|javascript:/.test(todo);
}

/**
 * El tipo real de un fichero por sus primeros bytes.
 * @param {Buffer} buf
 * @returns {{ ext: string, mime: string, clase: 'imagen'|'video'|'pdf'|'cex'|'xml' } | null}
 */
function detectar(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return tipo('jpg');
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return tipo('png');
    if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return tipo('webp');
    // ISO-BMFF: [tamaño][ftyp][marca]. HEIC y MP4/MOV comparten la caja.
    const caja = ascii(buf, 4, 8);
    if (caja === 'ftyp') {
        const marca = ascii(buf, 8, 12).toLowerCase();
        if (MARCAS_HEIF.includes(marca)) return tipo('heic');
        if (MARCAS_HEIF_GENERICA.includes(marca)) return tipo('heif');
        if (marca === 'qt  ') return tipo('mov');
        if (MARCAS_MP4.includes(marca)) return tipo('mp4');
        return null;   // avif, audio, … : fuera
    }
    if (ATOMOS_MOV.includes(caja)) return tipo('mov');   // .mov antiguos, sin ftyp
    // %PDF- puede llevar basura delante (la norma admite hasta 1024 bytes)
    if (ascii(buf, 0, Math.min(buf.length, 1024)).includes('%PDF-')) return tipo('pdf');
    if (/^(S'|V)CE3?Xv\d/.test(ascii(buf, 0, 16))) return tipo('cex');
    if (esXmlDeCee(buf)) return tipo('xml');
    return null;
}

/**
 * ¿Vale este tipo para este apartado y para quien sube?
 * @param {{ video?: boolean, documento?: boolean }} slot
 * @param {object|null} t   lo que devuelve detectar()
 * @param {'certificador'|'cliente'|string} por
 * @returns {string|null} el motivo si no vale
 */
function motivoTipo(slot, t, por) {
    if (slot.video) return t?.clase === 'video' ? null : 'aquí solo van vídeos (MP4 o MOV)';
    if (slot.documento) {
        const vale = por === 'cliente' ? ['imagen', 'pdf'] : ['imagen', 'pdf', 'cex', 'xml'];
        if (t && vale.includes(t.clase)) return null;
        return por === 'cliente' ? 'aquí solo van PDF o fotos' : 'tipo no admitido (PDF, foto, .cex o el XML del certificado)';
    }
    return t?.clase === 'imagen' ? null : 'aquí solo van fotos (JPG, PNG, WEBP o HEIC)';
}

/** Nombre para Content-Disposition (ASCII + UTF-8), sin comillas ni saltos. */
function disposicion(tipoDisp, nombre) {
    const n = String(nombre || 'archivo').replace(/[\r\n"\\]/g, '').slice(0, 180) || 'archivo';
    return `${tipoDisp}; filename="${n.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(n)}`;
}

/** Las cabeceras que llevan SIEMPRE /fichero y /thumb. */
function cabecerasSeguras(res) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.set('Referrer-Policy', 'no-referrer');
}

/**
 * Cabeceras para servir un fichero de Drive. El Content-Type sale de la lista
 * (o octet-stream) y la descarga es `attachment` salvo imagen y PDF.
 * @returns {{ mime: string, enLinea: boolean }}
 */
function cabecerasFichero(res, { mime, nombre }) {
    const m = String(mime || '').toLowerCase();
    const servible = MIME_SERVIBLE.has(m) ? m : 'application/octet-stream';
    const enLinea = MIME_EN_LINEA.has(servible);
    cabecerasSeguras(res);
    res.set('Content-Type', servible);
    res.set('Content-Disposition', disposicion(enLinea ? 'inline' : 'attachment', nombre));
    return { mime: servible, enLinea };
}

module.exports = {
    detectar, motivoTipo, esXmlDeCee, cabecerasSeguras, cabecerasFichero, disposicion,
    MIME_SERVIBLE, MIME_EN_LINEA, MIME_MINIATURA, TIPOS,
};
