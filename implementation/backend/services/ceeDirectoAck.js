// ─── ceeDirectoAck.js ────────────────────────────────────────────────────────
// Acuse del encargo por parte del certificador: ACEPTA o NO PUEDE.
//
// El CAE solo tiene "aceptar" (`cert-ack` en expedientes.js). Aquí hacen falta
// las dos respuestas, y la de rechazo es la que más valor tiene: hasta ahora, que
// un técnico no pudiera se sabía llamándole por teléfono a los diez días, con el
// expediente parado y nadie enterado. Con un "No puedo" de un clic, el trabajo
// vuelve a la cola el mismo día y el equipo recibe el aviso con el enlace para
// reasignarlo.
//
// El token es de UN SOLO USO y vive en `cee.ack_token`, igual que en el CAE: se
// regenera en cada encargo, así que un enlace de un encargo viejo —o el de un
// técnico al que ya se le retiró— deja de valer solo.

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const svc = require('./ceeDirectoService');
const estados = require('../utils/ceeDirectoEstados');

const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';

/** Token nuevo para un encargo. Invalida cualquier anterior por sustitución. */
function nuevoToken(id, certId) {
    return crypto.createHash('sha256')
        .update(`cee-ack:${id}:${certId}:${Date.now()}:${Math.random()}`)
        .digest('hex').slice(0, 32);
}

const enlaceAck = (id, token) => `${APP_BASE}/cee-ack/${id}?token=${token}`;

/**
 * Lo que la página pública necesita para pintarse, y la validación del token.
 * @returns {{ok:boolean, motivo?:string, datos?:object, row?:object}}
 */
async function leer(id, token) {
    const row = await svc.cargar(id);
    if (!row) return { ok: false, motivo: 'NO_EXISTE' };

    const guardado = row.cee?.ack_token || null;
    if (!guardado || !token || guardado !== token) {
        // Se distingue "ya contestado" de "enlace malo": el técnico que pulsa dos
        // veces merece un "ya nos lo dijiste", no un error que le haga pensar que
        // su respuesta no llegó.
        const yaContesto = row.cee?.ack_respuesta && !guardado;
        return { ok: false, motivo: yaContesto ? 'YA_CONTESTADO' : 'TOKEN_INVALIDO', row };
    }

    const fase = row.cee?.ack_phase === 'final' ? 'final' : 'inicial';
    const cli = row.cliente;
    return {
        ok: true,
        row,
        datos: {
            numero_expediente: row.numero_expediente,
            faseLabel: estados.nombreFase(row, fase),
            fase,
            cliente: cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : null,
            direccion: [row.direccion, row.municipio, row.provincia].filter(Boolean).join(', ') || null,
            ref_catastral: row.ref_catastral || null,
            certificador: row.certificador?.razon_social || row.certificador?.acronimo || null
        }
    };
}

/**
 * Registra la respuesta del técnico.
 *
 * ACEPTA  → la fase pasa a EN_TRABAJO. El trabajo ya está en marcha y el parte
 *           diario deja de reclamar el encargo.
 * NO PUEDE→ la fase vuelve a PTE_ENVIO_CERT y **se retira el certificador**: si
 *           se quedara puesto, la ficha seguiría enseñando como responsable a
 *           quien acaba de decir que no. Queda anotado en `cee.rechazos[]` con
 *           quién y por qué, que es lo que permite no volver a proponérselo.
 *
 * @returns {{ok:boolean, respuesta?:string, expediente?:object, motivo?:string}}
 */
async function responder(id, token, { respuesta, motivo }) {
    const lectura = await leer(id, token);
    if (!lectura.ok) return { ok: false, motivo: lectura.motivo };

    const row = lectura.row;
    const acepta = respuesta === 'acepta';
    const fase = row.cee?.ack_phase === 'final' ? 'final' : 'inicial';
    const key = fase === 'final' ? 'cee_final' : 'cee_inicial';
    const certId = row.cee?.certificador_id || null;
    const certNombre = row.certificador?.razon_social || row.certificador?.acronimo || 'El técnico';
    const ahora = new Date().toISOString();

    const cee = { ...(row.cee || {}) };
    // Token de un solo uso: se quema al contestar.
    cee.ack_token = null;
    cee.ack_respuesta = acepta ? 'acepta' : 'rechaza';
    cee.ack_respuesta_at = ahora;

    const seguimiento = { ...(row.seguimiento || {}) };

    if (acepta) {
        cee.ack_aceptado_at = ahora;
        cee.ack_aceptado_por = certId;
        // Solo avanza; si ya estaba más adelante no se toca.
        if (estados.rankSubestado(seguimiento[key]) < estados.rankSubestado('EN_TRABAJO')) {
            seguimiento[key] = 'EN_TRABAJO';
        }
    } else {
        cee.rechazos = [
            ...(Array.isArray(cee.rechazos) ? cee.rechazos : []),
            { certificador_id: certId, nombre: certNombre, motivo: (motivo || '').trim() || null, fecha: ahora, fase }
        ];
        // Se retira el técnico y el trabajo vuelve a la cola.
        cee.certificador_id = null;
        cee.ack_aceptado_at = null;
        seguimiento[key] = 'PTE_ENVIO_CERT';
        // El sello de "ya le escribimos" era con él: si se queda, el parte diario
        // silencia el aviso al siguiente durante toda la ventana de reinsistencia.
        seguimiento[`${key}_last_contacto_at`] = null;
    }

    const guardado = await svc.guardar(row.id, { cee, seguimiento }, { seguimientoPrev: row.seguimiento });

    await svc.anotarHistorial(row.id, {
        tipo: 'CERTIFICADOR',
        texto: acepta
            ? `${certNombre.toUpperCase()} HA ACEPTADO EL ENCARGO DE ${estados.nombreFase(row, fase).toUpperCase()}`
            : `${certNombre.toUpperCase()} HA RECHAZADO EL ENCARGO DE ${estados.nombreFase(row, fase).toUpperCase()}`
                + `${motivo ? ` — ${String(motivo).toUpperCase()}` : ''}`,
        usuario: certNombre
    });

    return { ok: true, respuesta: cee.ack_respuesta, expediente: guardado, certNombre, fase, certId };
}

/**
 * A quién proponer cuando uno dice que no.
 *
 * Se excluyen los que ya han rechazado ESTE expediente —volver a ofrecérselo es
 * hacerle perder el tiempo a él y a quien lee el aviso— y se ordena por los que
 * menos trabajo abierto tienen ahora mismo, que es el dato que de verdad predice
 * quién puede cogerlo.
 */
async function sugerirCertificadores(row, limite = 5) {
    const yaRechazaron = new Set((row.cee?.rechazos || []).map(r => String(r.certificador_id)));

    const { data: certs } = await supabase
        .from('prescriptores')
        .select('id_empresa, razon_social, acronimo, email, tlf, municipio, provincia')
        .eq('tipo_empresa', 'CERTIFICADOR');

    const candidatos = (certs || []).filter(c => !yaRechazaron.has(String(c.id_empresa)));
    if (!candidatos.length) return [];

    // Carga abierta de cada uno: CEE directos suyos que aún no están registrados.
    const { data: abiertos } = await supabase
        .from('cee_directos')
        .select('cee, seguimiento')
        .not('cee->>certificador_id', 'is', null);

    const carga = {};
    for (const x of abiertos || []) {
        const cid = String(x.cee?.certificador_id || '');
        if (!cid) continue;
        const sub = String(x.seguimiento?.cee_inicial || '').toUpperCase();
        if (sub === 'REGISTRADO') continue;
        carga[cid] = (carga[cid] || 0) + 1;
    }

    return candidatos
        .map(c => ({ ...c, abiertos: carga[String(c.id_empresa)] || 0 }))
        .sort((a, b) => a.abiertos - b.abiertos)
        .slice(0, limite);
}

module.exports = { nuevoToken, enlaceAck, leer, responder, sugerirCertificadores };
