// ─── propietariosAceptacion.js ───────────────────────────────────────────────
// La lógica de "otros propietarios" de la aceptación de la propuesta, aparte de
// la pantalla (components/PropietariosAceptacion.jsx) para poder probarla desde
// Node. Lo que se guarda lo vuelve a sanear el backend
// (utils/normalization.js · sanearCopropietarios / fundirCopropietarios).
//
// De cada propietario se pregunta si PAGA también la obra: solo entonces es
// CEDENTE (firma el convenio y su Anexo I, la factura va también a su nombre) y
// se le piden su parte de la inversión y en qué cuenta cobra. Ver
// features/expedientes/logic/cedentes.js.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_PROPIETARIOS_EXTRA = 4;

const nuevoId = () => `cop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

/** Un propietario en blanco: sin contestar si paga la obra. */
export const propietarioNuevo = () => ({
    id: nuevoId(), es_empresa: false, nombre: '', apellidos: '', dni: '', email: '', tlf: '', iban: '',
    cedente: null, cuota_pct: '', cuenta_propia: false,
});

/** Lo que llega del servidor, con las marcas de pantalla. */
export const propietariosDesdeServidor = (lista) =>
    (Array.isArray(lista) ? lista : []).map(p => ({
        ...propietarioNuevo(), ...p,
        id: p.id || nuevoId(),
        cedente: p.cedente === true ? true : (p.cedente === false ? false : null),
        cuota_pct: p.cuota_pct != null ? String(p.cuota_pct).replace('.', ',') : '',
        cuenta_propia: !!p.iban,
    }));

const numero = (v) => {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
};

/**
 * Lo que se manda: sin las marcas de pantalla. Quien NO paga la obra no lleva
 * ni cuota ni cuenta (no cobra), y quien cobra en la cuenta del titular tampoco
 * lleva IBAN aunque se tecleara.
 */
export const propietariosParaEnviar = (lista) =>
    (lista || []).map(p => {
        const { cuenta_propia: propia, tiene_justificante: _tj, ...resto } = p;
        const ced = resto.cedente === true;
        const cuota = numero(resto.cuota_pct);
        return {
            ...resto,
            cedente: ced,
            cuota_pct: ced && cuota != null && !Number.isNaN(cuota) ? cuota : null,
            iban: ced && propia ? (resto.iban || '') : '',
        };
    });

const ibanLimpio = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();

/**
 * Qué falta para poder continuar. Nombre y DNI son obligatorios (sin ellos no
 * sirven para la deducción en Hacienda); hay que contestar si paga la obra y, si
 * cobra en su cuenta, el IBAN.
 * @param {boolean|null} mas  ¿más de un propietario? (null = sin contestar)
 * @returns {string|null} el primer problema, o null si está todo bien
 */
export function faltaEnPropietarios(mas, lista) {
    if (mas === null || mas === undefined) return 'Indícanos si la vivienda tiene más de un propietario.';
    if (!mas) return null;
    if (!lista || !lista.length) return 'Añade los datos del otro propietario, o marca que solo hay uno.';
    let suma = 0;
    for (let i = 0; i < lista.length; i++) {
        const p = lista[i];
        const quien = `del propietario ${i + 2}`;
        if (!String(p.nombre || '').trim()) return `Falta el nombre ${quien}.`;
        if (!String(p.dni || '').trim()) return `Falta el DNI / NIE ${quien}.`;
        if (p.cedente !== true && p.cedente !== false) return `Indica si ${String(p.nombre).trim()} paga también la obra.`;
        if (p.cedente) {
            const cuota = numero(p.cuota_pct);
            if (Number.isNaN(cuota) || (cuota != null && (cuota <= 0 || cuota >= 100))) return `Revisa el porcentaje ${quien}: entre 1 y 99.`;
            suma += cuota || 0;
            if (p.cuenta_propia) {
                const iban = ibanLimpio(p.iban);
                if (iban.length < 15 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return `Revisa el IBAN ${quien}.`;
            }
        }
    }
    if (suma >= 100) return 'Los porcentajes de los demás suman el 100 % o más: a ti también te tiene que quedar una parte.';
    return null;
}

/** Cuánto le queda al titular según lo que se ha escrito (para enseñarlo). */
export function cuotaTitular(lista) {
    const ced = (lista || []).filter(p => p.cedente === true);
    if (!ced.length) return 100;
    const decl = ced.map(p => numero(p.cuota_pct)).filter(n => n != null && !Number.isNaN(n));
    const sinCuota = ced.length - decl.length;
    const resto = Math.max(0, 100 - decl.reduce((s, n) => s + n, 0));
    return Math.round((resto / (sinCuota + 1)) * 100) / 100;
}
