// ─── documentosComun.js — lo que comparten «Documentos» y quien lo abre ──────
// (obra/Documentos.jsx solo exporta componentes: react-refresh lo pide.)
import axios from 'axios';
import { API, API_ADMIN, useCarga } from '../api';

export const CLASES = {
    certificado: 'Certificado',
    firmado: 'Certificado firmado',
    xml: 'XML del certificado',
    cex: 'Archivo CE3X (.cex)',
    croquis: 'Croquis',
    justificante: 'Justificante de registro',
    etiqueta: 'Etiqueta energética',
    otros: 'Otro documento',
};

/** Quién dejó el fichero, en palabras de quien lo mira. */
export function autorTxt(autor, admin) {
    if (autor === 'certificador') return admin ? 'el certificador' : 'tú';
    return admin && autor === 'IA' ? 'la IA' : 'BROKERGY';
}

/** Los documentos de la obra (`admin`: los del panel, con el enlace de Drive). */
export function useDocumentos(obraId, { admin = false, activo = true } = {}) {
    return useCarga(async () => {
        if (!activo || !obraId) return null;
        return (await axios.get(`${admin ? API_ADMIN : API}/obras/${obraId}/documentos`)).data;
    }, [obraId, admin, activo]);
}

/** Bytes → base64 por trozos (un PDF de 1 MB revienta `String.fromCharCode(...todo)`). */
export function aBase64(buffer) {
    const u8 = new Uint8Array(buffer);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
}
