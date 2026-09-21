// ─── traerDireccionCatastral.js ──────────────────────────────────────────────
// Pedirle al Catastro la dirección de una referencia catastral y devolverla ya
// partida en los campos de la cascada (calle · CP · comunidad · provincia · y la
// PISTA del municipio, que lo casa la cascada con su nombre oficial).
//
// Vivía dentro de `DatosExpediente` (la ficha del CEE directo). Se saca aquí en
// cuanto lo necesitó la segunda pantalla —el alta de un CEE—, por el mismo
// motivo que `parseCatastroAddressFull` y `DireccionEdit`: con dos copias, la
// misma referencia rellenaría la dirección de una forma o de otra según por
// dónde entres, y las dos acaban en la misma columna.
//
// REGLA — rellena y se APARTA: lo que devuelve es una PROPUESTA y todo queda
// editable. El Catastro escribe la vía como la tiene registrada ("AV BARBER
// (DE) 26"), que a menudo no es como se escribe la dirección de verdad, y el
// piso y la puerta no los da nunca.

import axios from 'axios';
import { parseCatastroAddressFull, normalize } from './direccionCatastral';

/**
 * ¿El municipio que hay en pantalla es el MISMO con el que se calculó la zona
 * climática? Se compara con la misma manga ancha que la cascada al casar su
 * lista oficial ("Campo de Criptana" ↔ "CAMPO DE CRIPTANA"), porque el Catastro
 * y el INE no escriben igual ni las tildes ni las mayúsculas.
 *
 * REGLA — la zona se DERIVA, no se invalida a mano. Rellenar la cascada dispara
 * sus efectos de normalización, que vuelven a emitir `municipio` y `provincia`:
 * un `setZona(null)` en ese manejador borraba la zona recién traída del Catastro
 * un instante después de traerla, así que no llegaba a verse nunca.
 */
export function mismoMunicipio(a, b) {
    const x = normalize(a), y = normalize(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
}

/** Deja la referencia como la quiere el Catastro: solo letras y cifras, en mayúsculas. */
export function limpiarRefCatastral(v) {
    return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** 14 (parcela) o 20 (inmueble) caracteres alfanuméricos. Nada intermedio vale. */
export function refCatastralValida(v) {
    const rc = limpiarRefCatastral(v);
    return rc.length === 14 || rc.length === 20;
}

/**
 * @param {string} refCatastral tal y como esté escrita en el campo.
 * @returns {Promise<{
 *   rc: string,
 *   direccion: string,          // la cadena entera que devuelve el Catastro
 *   campos: object|null,        // { direccion, codigo_postal, ccaa, provincia, provincia_cod } o null si no se ha podido desglosar
 *   municipioHint: string|null, // el municipio TAL CUAL lo escribe el Catastro, para que lo case la cascada
 *   zona: string|null,          // zona climática CTE, que el servidor deriva del código INE
 *   altitud: number|null,
 *   municipioZona: string|null, // el municipio CON EL QUE se calculó esa zona
 *                               // (ver `mismoMunicipio`: es lo que dice si la
 *                               // zona sigue describiendo lo que hay en pantalla)
 *   aviso: string               // qué decirle al usuario (siempre hay algo que comprobar)
 * }>}
 * @throws {Error} con el mensaje ya redactado para enseñarlo en pantalla.
 */
export async function traerDireccionCatastral(refCatastral) {
    const rc = limpiarRefCatastral(refCatastral);
    if (!refCatastralValida(rc)) {
        throw new Error('La referencia catastral debe tener 14 o 20 caracteres.');
    }

    let data;
    try {
        ({ data } = await axios.get('/api/catastro/search', { params: { q: rc } }));
    } catch (err) {
        const d = err.response?.data;
        throw new Error(
            d?.code === 'CATASTRO_RATE_LIMITED'
                ? 'El Catastro está saturado ahora mismo. Inténtalo en unos minutos.'
                : (d?.details || d?.error || err.message || 'No se ha podido consultar el Catastro.')
        );
    }

    const direccion = data?.data?.address;
    if (!direccion) throw new Error('El Catastro no ha devuelto dirección para esa referencia.');

    // El Catastro ya trae la zona climática (la calcula `climateService` con el
    // código INE del municipio, que es más fiable que casar por nombre).
    const ci = data?.data?.climateInfo;
    const uso = data?.data?.use ? ` · ${data.data.use}` : '';

    const trozos = parseCatastroAddressFull(direccion);
    if (!trozos) {
        // Sin código postal no se puede repartir con garantías: se vuelca la
        // cadena entera en la calle antes que inventarse el municipio.
        return {
            rc, direccion, campos: null, municipioHint: null,
            zona: ci?.climateZone || null, altitud: ci?.altitude ?? null,
            municipioZona: ci?.municipalityName || null,
            aviso: 'Traída sin desglosar: revisa municipio y provincia.'
        };
    }

    return {
        rc,
        direccion,
        campos: {
            direccion: trozos.direccion || '',
            codigo_postal: trozos.codigo_postal || '',
            ccaa: trozos.ccaa || '',
            provincia: trozos.provincia || '',
            // Es el que carga la lista de municipios de la cascada.
            provincia_cod: trozos.provincia_cod || ''
        },
        municipioHint: trozos.municipioHint || null,
        zona: ci?.climateZone || null,
        altitud: ci?.altitude ?? null,
        municipioZona: ci?.municipalityName || trozos.municipioHint || null,
        aviso: `Traída del Catastro${uso}. Compruébala: la vía viene como la tiene registrada y el piso no lo da.`
    };
}

export default traerDireccionCatastral;
