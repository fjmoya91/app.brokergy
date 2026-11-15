// ─── Instaladores a los que FRAN les firma con SU certificado ────────────────
//
// Con algunos instaladores el CIFO, la Memoria RITE y su presentación en eDICE los
// hace Fran con el certificado electrónico DEL INSTALADOR (lo tiene en el almacén de
// Windows): RUBÉN HORCAJADA, SANEAMIENTOS ERNESTO SL, RCA INSTALACIONES (Ramón
// Carrasco) y JOSÉ ÁLVAREZ ALMARCHA (Fran, 04–09/11/2026). Al instalador no se le
// pide ninguna firma ni el RITE.
//
// REGLA — lo dice la FICHA del partner, no una lista en el código: un contacto de
// `contactos_notificacion` con el cargo «Firma con el certificado del instalador»
// (es Fran, con el rol TÉCNICO, así que el popup «Enviar al instalador» ya le llega
// a él). El repo es público: los NIF no se escriben aquí, se leen de la ficha.

const CARGO_FIRMA_FRAN = 'Firma con el certificado del instalador';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** ¿Firma Fran con el certificado de este instalador? `p` = fila de `prescriptores`. */
function firmaFranConCertificado(p) {
    const contactos = Array.isArray(p?.contactos_notificacion) ? p.contactos_notificacion : [];
    return contactos.some(c => norm(c?.cargo) === norm(CARGO_FIRMA_FRAN));
}

/** El NIF/CIF con el que se busca su certificado: `cif` de la ficha, o el del
 *  responsable si es un autónomo con el `cif` vacío. null si no hay uno válido. */
function nifCertificado(p) {
    for (const v of [p?.cif, p?.es_autonomo ? p?.nif_responsable : null]) {
        const s = String(v || '').toUpperCase().replace(/[\s.-]/g, '');
        if (/^[0-9XYZ][0-9]{7}[A-Z]$|^[A-HJ-NP-SUVW][0-9]{7}[0-9A-J]$/.test(s)) return s;
    }
    return null;
}

module.exports = { CARGO_FIRMA_FRAN, firmaFranConCertificado, nifCertificado };
