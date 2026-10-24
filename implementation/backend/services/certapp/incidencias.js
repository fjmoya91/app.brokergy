// ─── certapp/incidencias.js — incidencias y sugerencias del certificador ─────
// Fran, 24/10/2026: «que el certificador nos pueda dejar incidencias para
// mejorar, tanto en cada CEE porque puede haber algo puntual como en general en
// la app». Es el buzón `certapp_feedback` ampliado: el certificador ve SUS
// incidencias (con el estado en palabras llanas y la respuesta de BROKERGY) y,
// al responder el equipo desde el admin, le llega un email.
//
// REGLA — lo interno no llega al certificador: de una incidencia ve el texto, el
// tipo, la obra, el estado y la respuesta; nunca quién del equipo contestó
// (`respuesta_por`), ni el user_agent ni la pantalla.
// REGLA — nada sale a terceros desde local: el email va por avisos.avisarPersona
// (sin CERTAPP_AVISOS_ENABLED=true, en seco al log).
// Contrato: docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────
const avisos = require('./avisos');
const cuentas = require('./cuentas');
const { certappUrl, nombreApp } = require('./comun');

const TIPOS = ['SUGERENCIA', 'MEJORA', 'ERROR', 'OTRO'];
const ESTADOS = ['NUEVA', 'VISTA', 'HECHA', 'DESCARTADA'];

/** Lo que lee el certificador (el frontend tiene su copia en src/certificadores/incidencias/comun.js). */
const ESTADO_LLANO = { NUEVA: 'Recibida', VISTA: 'En revisión', HECHA: 'Resuelta', DESCARTADA: 'Cerrada' };

/** Columnas para el certificador: sin `respuesta_por`, `user_agent` ni `pantalla`. */
const COLS_CERTIFICADOR = 'id, created_at, tipo, texto, obra_id, estado, respuesta, respuesta_at, obra:certapp_obras(numero_expediente)';

function paraCertificador(f) {
    if (!f) return null;
    return {
        id: f.id,
        created_at: f.created_at,
        tipo: f.tipo,
        texto: f.texto,
        obra_id: f.obra_id || null,
        numero_expediente: f.obra?.numero_expediente || null,
        estado: f.estado,
        respuesta: f.respuesta || null,
        respuesta_at: f.respuesta_at || null,
    };
}

const enlaceMisIncidencias = (id) => `${certappUrl()}/incidencias${id ? `?id=${encodeURIComponent(id)}` : ''}`;
const recorte = (s, n) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/**
 * Email al certificador: «te hemos respondido». Nunca lanza (un aviso no rompe
 * la operación que lo dispara): devuelve lo de avisarPersona o `{ canales: [], error }`.
 * @param {{ id, cuenta_id, texto, respuesta, estado, obra?: { numero_expediente } }} f la incidencia YA guardada
 */
async function avisarRespuesta(f) {
    try {
        if (!f?.cuenta_id || !f.respuesta) return { canales: [], motivo: 'sin cuenta o sin respuesta' };
        const cuenta = await cuentas.cuentaPorId(f.cuenta_id);
        if (!cuenta?.email) return { canales: [], motivo: 'la cuenta no tiene email' };
        const num = f.obra?.numero_expediente || null;
        const p = {
            titulo: num ? `Te hemos respondido sobre ${num}` : 'Te hemos respondido',
            saludo: cuenta.nombre ? `Hola ${cuenta.nombre}:` : 'Hola:',
            parrafos: [
                `Nos escribiste${num ? ` sobre ${num}` : ''}: «${recorte(f.texto, 280)}»`,
                `Nuestra respuesta:\n${f.respuesta}`,
                `Estado: ${ESTADO_LLANO[f.estado] || f.estado}.`,
            ],
            boton: { href: enlaceMisIncidencias(f.id), label: 'Ver mis incidencias' },
            nota: 'Si algo sigue sin ir bien, cuéntanoslo desde la app con el botón «Incidencias y sugerencias».',
        };
        return await avisos.avisarPersona({ email: cuenta.email }, {
            asunto: `${p.titulo} — ${nombreApp()}`,
            html: avisos.plantilla({ ...p, preheader: `Nuestra respuesta a lo que nos contaste${num ? ` sobre ${num}` : ''}` }),
            texto: avisos.textoPlano(p),
        });
    } catch (e) {
        console.warn('[certapp] aviso de respuesta a una incidencia sin enviar:', e.message);
        return { canales: [], error: e.message };
    }
}

module.exports = { TIPOS, ESTADOS, ESTADO_LLANO, COLS_CERTIFICADOR, paraCertificador, avisarRespuesta, enlaceMisIncidencias };
