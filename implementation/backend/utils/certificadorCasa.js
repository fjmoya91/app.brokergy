// ============================================================================
// certificadorCasa.js — el certificador POR DEFECTO de todos los CEE: Fran.
//
// Decisión del usuario (2026-10-06 para los .cex del agente; 2026-10-26 para
// TODO): «excepto que yo diga lo contrario, todos los CEE me ponen a mí como
// certificador». Es FRANCISCO JAVIER MOYA LÓPEZ (`prescriptores.id_empresa`),
// y `CEE_TECNICO_POR_DEFECTO` lo cambia sin tocar código.
//
// Lo usan: el alta de un expediente y de un CEE directo (nacen con él), el
// AGENTE IA (que trabaja sin figurar en la barra: el encargo es de Fran), el
// borrador de presentación (el 02 va con quien firma) y `cee_inicial.js`.
//
// Y `normalizarCertificador`: el AGENTE IA NUNCA se guarda como certificador.
// Elegirlo en el selector es ENCARGÁRSELO; en la barra queda Fran.
// ============================================================================

const POR_DEFECTO = 'c05b23c1-aa81-4a9a-bd6b-b59cb65775c5';

/** El `id_empresa` del certificador de la casa. */
const certificadorCasaId = () => String(process.env.CEE_TECNICO_POR_DEFECTO || POR_DEFECTO).trim();

/** ¿Este `id_empresa` es el certificador de la casa? */
const esCertificadorCasa = (id) => !!id && String(id) === certificadorCasaId();

/**
 * El id que se GUARDA como certificador: el del agente pasa a ser el de la casa.
 * `agenteId` es el `id_empresa` de la ficha del agente (`agenteIa.agente()`);
 * sin él, el id se devuelve tal cual.
 */
function normalizarCertificador(id, agenteId) {
    if (!id) return id;
    return agenteId && String(id) === String(agenteId) ? certificadorCasaId() : id;
}

module.exports = { certificadorCasaId, esCertificadorCasa, normalizarCertificador };
