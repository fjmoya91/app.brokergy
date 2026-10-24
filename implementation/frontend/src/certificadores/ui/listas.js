// ─── listas.js — provincias, comunidades y programas (beta y perfil) ────────
import { CCAA_LIST, PROV_NOMBRE } from '../../utils/direccionCatastral';

const MINUS = new Set(['de', 'la', 'y', 'del', 'las', 'los']);
/** «CASTILLA-LA MANCHA» → «Castilla-La Mancha». */
export const titulo = (s) => String(s || '').toLowerCase().split(' ')
    .map((w, i) => (i > 0 && MINUS.has(w) ? w : w.replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())))
    .join(' ').replace(/^S\.c\./, 'S.C.');

export const PROVINCIAS = Object.values(PROV_NOMBRE).map(titulo).sort((a, b) => a.localeCompare(b, 'es'));
export const COMUNIDADES = CCAA_LIST.map(c => ({ value: c, label: titulo(c) }));
export const SOFTWARE = [
    { value: 'CE3X', label: 'CE3X' }, { value: 'HULC', label: 'HULC' },
    { value: 'CYPETHERM', label: 'CYPETHERM' }, { value: 'OTRO', label: 'Otro' },
];
