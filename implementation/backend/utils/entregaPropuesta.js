// ─── A QUIÉN le ha llegado la propuesta ───────────────────────────────────────
//
// La oportunidad pasa a ENVIADA con CUALQUIER envío que salga bien (2026-10-14,
// decisión del usuario, 26RES060_OP295): antes solo contaba si le llegaba al
// CLIENTE, y una propuesta mandada al instalador para que se la pase al cliente
// —lo normal con los partners— se quedaba en PTE ENVIAR para siempre (había 18
// así). Pero «enviada» ya no dice a quién, y eso cambia lo que se hace después:
// si la tiene el cliente se le llama a él; si solo la tiene el instalador, se le
// pregunta al instalador si se la ha pasado. Así que se dice al lado de la chapa.
//
// REGLA — se CALCULA de `propuesta_versiones`, no se guarda aparte: lo que ya
// consta (cada versión con sus destinatarios y el resultado de cada envío) es
// la verdad, y una copia en otro campo acabaría diciendo otra cosa.
//
// Cada envío lleva su `modo` desde hoy. Los anteriores no: se casan con el
// destinatario por la etiqueta (`"{label} → {teléfono|email}"`), y si no casa
// pero la versión tenía un único modo, ese.

const ES_CLIENTE = new Set(['CLIENTE', 'TITULAR']);
const ES_INSTALADOR = new Set(['PARTNER', 'INSTALADOR']);

function tipoDeModo(modo) {
    const m = String(modo || '').toUpperCase();
    if (ES_CLIENTE.has(m)) return 'cliente';
    if (ES_INSTALADOR.has(m)) return 'instalador';
    if (m === 'OTRO') return 'otro';
    return null;
}

function modoDelEnvio(envio, destinatarios) {
    if (envio.modo) return envio.modo;
    const texto = String(envio.text || envio.destinatario || '');
    const d = (destinatarios || []).find(x => x?.label && (texto.startsWith(`${x.label} →`) || texto.startsWith(`${x.label}:`)));
    if (d) return d.modo;
    const modos = [...new Set((destinatarios || []).map(x => x?.modo).filter(Boolean))];
    return modos.length === 1 ? modos[0] : null;
}

function nombreDelEnvio(envio) {
    return String(envio.text || envio.destinatario || '').split(/ → |: /)[0].trim() || null;
}

/**
 * @param {Array} versiones  `datos_calculo.propuesta_versiones`
 * @returns {null | { cliente: boolean, instalador: boolean, otro: boolean, enlace: boolean,
 *                    nombres: { cliente: string[], instalador: string[], otro: string[] } }}
 *          null si ninguna versión ha llegado a nadie.
 */
function entregaPropuesta(versiones) {
    const out = { cliente: false, instalador: false, otro: false, enlace: false, nombres: { cliente: [], instalador: [], otro: [] } };
    let alguna = false;
    for (const v of Array.isArray(versiones) ? versiones : []) {
        for (const e of Array.isArray(v?.envios) ? v.envios : []) {
            if (!(e?.status === 'ok' || e?.ok === true)) continue;
            if ((e.channel || e.canal) === 'enlace') { out.enlace = true; alguna = true; continue; }
            const tipo = tipoDeModo(modoDelEnvio(e, v.destinatarios)) || 'otro';
            out[tipo] = true;
            alguna = true;
            const n = nombreDelEnvio(e);
            if (n && !out.nombres[tipo].includes(n)) out.nombres[tipo].push(n);
        }
    }
    return alguna ? out : null;
}

/** ¿Algún envío de esta tanda salió bien? Es lo que pasa la oportunidad a ENVIADA. */
function algunEnvioOk(envios) {
    return (Array.isArray(envios) ? envios : []).some(e => e?.status === 'ok' || e?.ok === true);
}

module.exports = { entregaPropuesta, algunEnvioOk, tipoDeModo };
