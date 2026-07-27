// ============================================================================
// instaladorFirmante.js — QUIÉN FIRMA de verdad la documentación técnica.
//
// Un INSTALADOR puede no estar habilitado en Industria (`tiene_carnet_rite` en
// OFF). Entonces no puede constar como empresa instaladora en la Memoria RITE,
// el Certificado de Instalación Térmica ni el CIFO: quien responde ante
// Industria es otra empresa habilitada (`instalador_rite_id`), y son SUS datos
// —razón social, CIF, dirección, Nº de Empresa RITE, representante legal y
// técnico firmante— los que van en esos documentos.
//
// ⚠️ REGLA: esta sustitución afecta SOLO a los DATOS DE LOS DOCUMENTOS. Los
// destinatarios de avisos (WhatsApp / email), la atribución comercial, el
// portal y los lotes siguen apuntando al instalador REAL asignado — el que
// factura y con el que habla Brokergy. Por eso los consumidores reciben las dos
// fichas por separado (`prescriptores` = real, `prescriptores_firmante` =
// quien firma) y nunca se pisan.
// ============================================================================

/** ¿La empresa está habilitada en Industria (registro RITE)? */
function estaHabilitadoRite(pres) {
    return !!(pres && pres.tiene_carnet_rite);
}

/**
 * Resuelve la ficha que debe aparecer en los documentos técnicos.
 *
 * @returns {{ firmante: object|null, real: object|null, delegado: boolean }}
 *   - `real`     → instalador asignado al expediente (contactos, avisos).
 *   - `firmante` → ficha que va en los documentos. Igual a `real` salvo
 *                  delegación efectiva.
 *   - `delegado` → true solo si la sustitución se ha aplicado de verdad.
 *
 * Si el instalador NO está habilitado pero tampoco tiene firmante asignado, se
 * devuelve él mismo con `delegado: false`: el barrido de datos faltantes es
 * quien avisa (`validateMemoriaRite`), no este helper — así el documento nunca
 * sale a nombre de nadie inesperado por un dato a medio configurar.
 */
async function resolveInstaladorFirmante(pres, supabase) {
    if (!pres) return { firmante: null, real: null, delegado: false };
    if (estaHabilitadoRite(pres) || !pres.instalador_rite_id) {
        return { firmante: pres, real: pres, delegado: false };
    }
    const { data: firmante } = await supabase
        .from('prescriptores').select('*')
        .eq('id_empresa', pres.instalador_rite_id).maybeSingle();
    // Si la referencia está rota (borrado, permisos), se mantiene el real: mejor
    // que el barrido lo marque como incompleto que generar con datos a medias.
    if (!firmante) return { firmante: pres, real: pres, delegado: false };
    return { firmante, real: pres, delegado: true };
}

module.exports = { estaHabilitadoRite, resolveInstaladorFirmante };
