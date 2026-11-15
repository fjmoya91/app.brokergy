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

/**
 * VARIOS técnicos pueden firmar la Memoria RITE de una misma empresa (FONCAMAN:
 * Francisco Javier o Antonio Manjavacas). `tecnico_firmante_*` es el de POR
 * DEFECTO; `tecnicos_firmantes_rite` guarda los OTROS. Al enviar la memoria se
 * elige uno para ESE expediente (`documentacion.memoria_rite_tecnico.dni`).
 *
 * Devuelve la ficha con el elegido puesto en `tecnico_firmante_*`, así todos los
 * consumidores (generador, barrido, popup) siguen leyendo los mismos campos.
 * Un DNI que no está en la lista (borrado de la ficha) → se queda el de por
 * defecto: nunca un documento a nombre de quien ya no figura.
 *
 * ESPEJO de `presConTecnicoRite` en frontend logic/instaladorPendientes.js.
 */
const normDni = (s) => String(s || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
function aplicarTecnicoRite(pres, dni) {
    if (!pres || !dni) return pres;
    const d = normDni(dni);
    if (!d || normDni(pres.tecnico_firmante_dni) === d) return pres;
    const lista = Array.isArray(pres.tecnicos_firmantes_rite) ? pres.tecnicos_firmantes_rite : [];
    const t = lista.find(x => normDni(x?.dni) === d);
    if (!t) return pres;
    return {
        ...pres,
        tecnico_firmante_distinto: true,
        tecnico_firmante_nombre: t.nombre || '',
        tecnico_firmante_apellidos: t.apellidos || '',
        tecnico_firmante_dni: t.dni || '',
        tecnico_firmante_carnet_rite: t.carnet || '',
    };
}

/** Sanea la lista que llega del formulario de la ficha (mayúsculas, sin vacíos, máx. 10). */
function limpiarTecnicosRite(lista) {
    if (!Array.isArray(lista)) return [];
    const up = (v) => (v ?? '').toString().trim().toUpperCase() || null;
    return lista
        .map(t => ({ nombre: up(t?.nombre), apellidos: up(t?.apellidos), dni: up(t?.dni), carnet: up(t?.carnet) }))
        .filter(t => t.nombre && t.dni)
        .slice(0, 10);
}

module.exports = { estaHabilitadoRite, resolveInstaladorFirmante, aplicarTecnicoRite, limpiarTecnicosRite };
