// Resolución del nombre del certificador asignado a un expediente.
//
// El certificador NO es una columna de `expedientes`: vive dentro del JSONB `cee`
// como `cee.certificador_id`, apuntando a `prescriptores.id_empresa`. Los emails de
// aviso lo necesitan por su nombre, no por su id.

const supabase = require('./supabaseClient');

/**
 * @param {object} exp expediente (basta con que traiga `cee`)
 * @returns {Promise<string|null>} razón social / acrónimo, o null si no hay certificador
 */
async function getCertificadorNombre(exp) {
    const certId = exp?.cee?.certificador_id;
    if (!certId) return null;
    try {
        const { data } = await supabase
            .from('prescriptores')
            .select('razon_social, acronimo')
            .eq('id_empresa', certId)
            .maybeSingle();
        return data ? (data.razon_social || data.acronimo || null) : null;
    } catch (err) {
        // Un email sin el nombre del certificador es preferible a un email no enviado.
        console.warn('[certificadorLookup]', err.message);
        return null;
    }
}

module.exports = { getCertificadorNombre };
