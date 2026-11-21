'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// «Solicitar revisión» del PARTNER (Fran, 17/11/2026) — lo que pasa al TERMINAR.
//
// El partner con el bono por debajo de 3.000 € pide revisión (`POST
// /api/oportunidades/:id/peticion-revision`): se encarga el CEE inicial a la IA
// por la API (la cola del PC, `ceeIa.pedir` con `porVia: 'api'`). El agente lo
// genera, lo califica con CE3X y `cee_inicial.js aplicar --escribir` CARGA su XML
// en la simulación (`cargarCeeEnOportunidad`): la cifra pasa a cálculo real.
//
// Aquí se cierra:
//   · `cerrarRevision`  — lo llama la CARGA del XML: marca la petición resuelta
//     (con el bono antes → después) y le manda un WhatsApp al PARTNER (sus
//     contactos de rol comercial, como la propuesta) con el enlace a la oportunidad.
//   · `trasTrabajo`     — lo llama el vigilante del PC al acabar un trabajo: si era
//     el de una revisión y NO ha quedado resuelta (la IA no terminó, faltaban
//     fotos, el XML no validó), avisa a ADMINISTRACIÓN. Al partner no: su página
//     sigue diciendo «Revisión pedida» y la termina una persona.
//
// REGLA — se avisa UNA vez: la petición lleva `resuelta_at` y, con él, ni se
// vuelve a marcar ni se vuelve a escribir al partner (cargar el CEE otra vez a
// mano no repite el aviso).
// REGLA — el WhatsApp sale por la COLA de la BD (`whatsappService.sendText`), la
// misma que usa el aviso del agente desde el PC: lo entrega el servidor que tiene
// la sesión.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('./supabaseClient');
const { partnerNotifyTargets, PARTNER_CONTACT_FIELDS, saludoPartner } = require('./notifyContacts');

/** La app de verdad, también desde el PC (cuyo FRONTEND_URL es localhost). */
const APP = () => {
    const u = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    return /^https:\/\//.test(u) && !/localhost|127\.0\.0\.1/.test(u) ? u : 'https://app.brokergy.es';
};
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const eur = (n) => `${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;

/**
 * El WhatsApp al partner (puro: lo prueba test_revision_partner.js). Sin emojis.
 * @param {{ nombre?, id, direccion?, antes, despues }} d
 */
function textoAvisoPartner({ nombre, id, direccion, antes, despues }) {
    const a = Math.round(Number(antes) || 0);
    const d = Math.round(Number(despues) || 0);
    const cifra = d > a
        ? `El bono CAE sube de ${eur(a)} (estimado) a *${eur(d)}* con el certificado de la vivienda.`
        : d === a
            ? `El bono CAE se queda en *${eur(d)}*, ahora calculado con el certificado de la vivienda.`
            : `Con el certificado de la vivienda, el bono CAE queda en *${eur(d)}* (la estimación era ${eur(a)}).`;
    return [
        `Hola${nombre ? ` ${nombre}` : ''},`,
        `Ya hemos revisado la oportunidad *${id}*${direccion ? ` (${direccion})` : ''} con el certificado energético de la vivienda.`,
        cifra,
        `Ya puedes ver las cifras y enviar la propuesta a tu cliente desde la app:\n${APP()}/?op=${encodeURIComponent(id)}`,
    ].join('\n\n');
}

/** Los teléfonos del partner de la oportunidad, rol comercial (como la propuesta). */
async function destinatarios(op) {
    const empresa = op.prescriptor_id || op.instalador_asociado_id;
    if (!empresa || String(empresa) === '1') return [];
    const { data: p, error } = await supabase.from('prescriptores')
        .select(`id_empresa, ${PARTNER_CONTACT_FIELDS}`).eq('id_empresa', empresa).maybeSingle();
    if (error || !p) return [];
    const vistos = new Set();
    return partnerNotifyTargets(p, 'comercial')
        .filter(t => t.tlf)
        .map(t => ({ ...t, saludo: (t.nombre || '').trim().split(/\s+/)[0] || saludoPartner(p) }))
        .filter(t => { const k = String(t.tlf).replace(/\D/g, '').slice(-9); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

/**
 * Lo llama la carga del XML en la simulación (`cargarCeeOportunidad`) cuando ha
 * ESCRITO. Si la oportunidad tenía una revisión pedida sin resolver, la cierra y
 * avisa al partner. Nunca lanza: el CEE ya está cargado y eso no se deshace.
 * @returns {{ cerrada: boolean, avisados?: string[], motivo?: string }}
 */
async function cerrarRevision(oportunidadId, { antes, despues } = {}) {
    try {
        const { data: op, error } = await supabase.from('oportunidades')
            .select('id, id_oportunidad, prescriptor_id, instalador_asociado_id, peticion:datos_calculo->inputs->peticion_revision, direccion:datos_calculo->inputs->>direccion')
            .eq('id', oportunidadId).maybeSingle();
        if (error || !op) return { cerrada: false, motivo: error?.message || 'sin oportunidad' };
        const pet = op.peticion;
        if (!pet?.at) return { cerrada: false, motivo: 'sin revisión pedida' };
        if (pet.resuelta_at) return { cerrada: false, motivo: 'ya estaba resuelta' };

        const bonoAntes = Math.round(Number(antes?.bono ?? pet.bono) || 0);
        const bonoDespues = Math.round(Number(despues?.bono) || 0);
        const lista = await destinatarios(op);
        const resuelta = { ...pet, resuelta_at: new Date().toISOString(), bono_antes: bonoAntes, bono_despues: bonoDespues,
                           avisados: lista.map(t => t.nombre || 'canal general') };
        // Primero se marca (así un segundo cargado no vuelve a escribir) y luego se avisa.
        const { error: mErr } = await supabase.rpc('oportunidad_merge_inputs', { p_id: op.id, p_patch: { peticion_revision: resuelta } });
        if (mErr) return { cerrada: false, motivo: `no se ha podido marcar: ${mErr.message}` };

        const whatsappService = require('./whatsappService');
        const avisados = [];
        for (const t of lista) {
            try {
                await whatsappService.sendText(t.tlf, textoAvisoPartner({
                    nombre: t.saludo, id: op.id_oportunidad, direccion: op.direccion, antes: bonoAntes, despues: bonoDespues }));
                avisados.push(t.nombre || t.tlf);
            } catch (e) { console.warn(`[revision-partner] ${op.id_oportunidad}: WhatsApp a ${t.nombre || 'partner'}: ${e.message}`); }
        }
        if (!lista.length) console.warn(`[revision-partner] ${op.id_oportunidad}: el partner no tiene teléfono de contacto; no se le avisa.`);
        return { cerrada: true, avisados };
    } catch (e) {
        console.warn('[revision-partner] cerrar:', e.message);
        return { cerrada: false, motivo: e.message };
    }
}

/**
 * Lo llama el vigilante del PC (`banco.mjs atender`) al acabar un trabajo. Si era el
 * de una revisión del partner y la petición sigue SIN resolver, avisa a administración.
 * @param {object} t    la fila de `cee_ia_trabajos`
 * @param {object} fin  `{ estado, resultado?, error? }` con el que se cierra
 */
async function trasTrabajo(t, fin) {
    try {
        if (t?.negocio !== 'op') return { avisado: false };
        const { data: op } = await supabase.from('oportunidades')
            .select('id_oportunidad, peticion:datos_calculo->inputs->peticion_revision')
            .eq('id', t.ref_id).maybeSingle();
        const pet = op?.peticion;
        if (!pet?.at || pet.resuelta_at || (pet.trabajo_id && pet.trabajo_id !== t.id)) return { avisado: false };
        const motivo = fin?.error || fin?.resultado?.informe || 'el CEE no ha llegado a cargarse en la simulación';
        const texto = `REVISIÓN DEL PARTNER SIN TERMINAR · ${op.id_oportunidad}\n\n`
            + `${pet.por || 'El partner'} pidió revisión con el CEE (bono ${eur(pet.bono)}) y la IA ha acabado en ${fin?.estado || '—'}.\n`
            + `${String(motivo).slice(0, 600)}\n\n`
            + 'El partner sigue viendo «Revisión pedida». Termínalo (CEE inicial + cargar el XML) y el aviso al partner sale solo.\n'
            + `${APP()}/?op=${encodeURIComponent(op.id_oportunidad)}`;
        await require('./whatsappService').sendText(adminPhone(), texto);
        return { avisado: true };
    } catch (e) {
        console.warn('[revision-partner] tras el trabajo:', e.message);
        return { avisado: false, motivo: e.message };
    }
}

module.exports = { cerrarRevision, trasTrabajo, textoAvisoPartner, APP };
