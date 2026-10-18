// «Todos los avisos de sus clientes, al partner» (prescriptores.avisos_al_partner).
//
// El desvío sigue siendo, cliente a cliente, `clientes.contacto_es_partner` + la
// copia del comercial en `persona_contacto_*` (ver `contactoClienteDesdePartner`):
// es lo que leen los ~30 sitios que eligen destinatario. La marca del partner NO
// es un tercer modo de resolverlo: solo ENCIENDE esa marca en sus clientes —los que
// ya tiene, al guardar la ficha, y los que se den de alta o se le asignen después—.
//
// REGLA — un cliente concreto puede apagarlo desde su ficha (excepción): la marca
// del partner solo actúa al ALTA, al CAMBIAR de partner y al guardar la ficha del
// partner con la marca recién puesta.
const supabase = require('./supabaseClient');
const { PARTNER_CONTACT_FIELDS, contactoClienteDesdePartner } = require('./notifyContacts');
const { normalizeCliente } = require('../utils/normalization');

const SIN_DESVIO = {
    contacto_es_partner: false,
    persona_contacto_nombre: null, persona_contacto_tlf: null, persona_contacto_email: null,
    notificaciones_contacto_activas: false,
};

/**
 * Lo que hay que escribir en un cliente de este partner para desviarle los
 * avisos, o null si el partner no lo pide (o no tiene a quién escribir).
 */
async function desvioDelPartner(prescriptorId) {
    if (!prescriptorId) return null;
    const { data: p, error } = await supabase.from('prescriptores')
        .select(`${PARTNER_CONTACT_FIELDS}, avisos_al_partner`)
        .eq('id_empresa', prescriptorId).maybeSingle();
    if (error) throw error;
    if (!p?.avisos_al_partner) return null;
    const c = contactoClienteDesdePartner(p);
    return c ? { contacto_es_partner: true, ...c } : null;
}

/**
 * Tras dar de alta un cliente o asignarle partner por un camino que no pasa por
 * la ficha (aceptación, landing, oferta de CEE): si su partner lo pide y el
 * cliente aún no lo tiene, se lo pone. Nunca hace fallar a quien lo llama.
 */
async function marcarSiElPartnerLoPide(idCliente) {
    try {
        if (!idCliente) return false;
        const { data: cli } = await supabase.from('clientes')
            .select('prescriptor_id, contacto_es_partner').eq('id_cliente', idCliente).maybeSingle();
        if (!cli?.prescriptor_id || cli.contacto_es_partner) return false;
        const d = await desvioDelPartner(cli.prescriptor_id);
        if (!d) return false;
        const { error } = await supabase.from('clientes')
            .update(normalizeCliente({ ...d })).eq('id_cliente', idCliente);
        if (error) throw error;
        return true;
    } catch (e) {
        console.warn('[avisosAlPartner] no se pudo marcar el cliente', idCliente, e.message);
        return false;
    }
}

/**
 * Al cambiar la marca en la ficha del partner: encendida, se desvían TODOS sus
 * clientes; apagada, se retira el desvío de los que lo tenían (dejar la copia
 * sería seguir escribiéndole a él sin la marca que lo explica, ver
 * PartnerComoContacto). Devuelve cuántos clientes ha tocado.
 */
async function aplicarATodosSusClientes(idEmpresa, activar) {
    if (activar) {
        const d = await desvioDelPartner(idEmpresa);
        if (!d) return 0;
        const { data, error } = await supabase.from('clientes')
            .update(normalizeCliente({ ...d }))
            .eq('prescriptor_id', idEmpresa)
            .select('id_cliente');
        if (error) throw error;
        return (data || []).length;
    }
    const { data, error } = await supabase.from('clientes')
        .update(SIN_DESVIO)
        .eq('prescriptor_id', idEmpresa)
        .eq('contacto_es_partner', true)
        .select('id_cliente');
    if (error) throw error;
    return (data || []).length;
}

module.exports = { desvioDelPartner, marcarSiElPartnerLoPide, aplicarATodosSusClientes };
