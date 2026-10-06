// ─── propietariosAceptacion.js ───────────────────────────────────────────────
// La lógica de "otros propietarios" de la aceptación de la propuesta, aparte de
// la pantalla (components/PropietariosAceptacion.jsx) para poder probarla desde
// Node. Lo que se guarda lo vuelve a sanear el backend
// (utils/normalization.js · sanearCopropietarios / fundirCopropietarios).
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_PROPIETARIOS_EXTRA = 4;

const nuevoId = () => `cop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Un propietario en blanco, cobrando en la cuenta del titular. */
export const propietarioNuevo = () => ({
    id: nuevoId(), es_empresa: false, nombre: '', apellidos: '', dni: '', email: '', tlf: '', iban: '',
    cuenta_propia: false,
});

/** Lo que llega del servidor, con la marca de pantalla de "cobra en su cuenta". */
export const propietariosDesdeServidor = (lista) =>
    (Array.isArray(lista) ? lista : []).map(p => ({ ...propietarioNuevo(), ...p, id: p.id || nuevoId(), cuenta_propia: !!p.iban }));

/** Lo que se manda: sin las marcas de pantalla, y sin IBAN si cobra en la del titular. */
export const propietariosParaEnviar = (lista) =>
    (lista || []).map(p => {
        const { cuenta_propia: propia, tiene_justificante: _tj, ...resto } = p;
        return { ...resto, iban: propia ? (resto.iban || '') : '' };
    });

const ibanLimpio = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();

/**
 * Qué falta para poder continuar. Nombre y DNI son obligatorios (sin ellos no
 * sirven para la deducción en Hacienda) y, si cobra en su cuenta, el IBAN.
 * @param {boolean|null} mas  ¿más de un propietario? (null = sin contestar)
 * @returns {string|null} el primer problema, o null si está todo bien
 */
export function faltaEnPropietarios(mas, lista) {
    if (mas === null || mas === undefined) return 'Indícanos si la vivienda tiene más de un propietario.';
    if (!mas) return null;
    if (!lista || !lista.length) return 'Añade los datos del otro propietario, o marca que solo hay uno.';
    for (let i = 0; i < lista.length; i++) {
        const p = lista[i];
        const quien = `del propietario ${i + 2}`;
        if (!String(p.nombre || '').trim()) return `Falta el nombre ${quien}.`;
        if (!String(p.dni || '').trim()) return `Falta el DNI / NIE ${quien}.`;
        if (p.cuenta_propia) {
            const iban = ibanLimpio(p.iban);
            if (iban.length < 15 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return `Revisa el IBAN ${quien}.`;
        }
    }
    return null;
}
