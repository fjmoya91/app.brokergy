// ─── certapp/vistoBueno.js — el visto bueno de BROKERGY, dado en la envolvente ─
// Lo pidió Fran (30/10/2026, 2026EXT_3): «una vez que le demos el visto bueno,
// directamente se genere listo para firmar y lo podamos firmar desde CEE».
// Antes eran tres pasos sobre lo mismo: «Entregar» en el admin cuando el PC lo
// calificaba, firmar en la app y, en un encargo del CRM, OTRA revisión en el
// expediente (notify-review) de un certificado que ya se había mirado.
//
//   · Lo da el EQUIPO (ADMIN / TRABAJADOR) desde la ventana de la envolvente de
//     una obra de la app (`POST /api/cee-envolvente/:id/visto-bueno?origen=ext`).
//     Un certificador de la app no lo da: es el de BROKERGY.
//   · Se da sobre el `.cex` SELLADO (`cee.cex_sello.inicial`) y su receta (la
//     huella): lo que se ve en la ventana tiene que ser lo generado (si no, la
//     ventana lo vuelve a generar antes; aquí, 409 DESFASADO).
//   · Calificado por CE3X → se ENTREGA ya, «listo para firmar» (LISTO; una obra
//     VALIDADO se reabre: la versión nueva necesita firma nueva). Por calificar →
//     el PC lo califica (la cola de siempre) y, al terminar, se entrega solo
//     (`alCalificar`, desde `entrega.alTerminarIa`) en vez del WhatsApp de «listo
//     para revisar».
//   · REGLA — vale para UNA receta. Otra generación con otra huella (la ventana o
//     la skill: `cex.sellar`) lo ANULA (`anularSiOtraReceta`). La del PC no:
//     califica la MISMA receta (con la 2.ª medida FV vuelve a medir las placas y
//     la huella puede cambiar), y solo cuenta si el visto bueno la esperaba.
//   · Al FIRMAR un encargo del CRM con el visto bueno vigente
//     (`crm.enviarCeeAsync`), el expediente recibe el visto bueno sin aviso
//     (approve-cee) en vez de la revisión.
//
// Se guarda en `cee.visto_bueno` de la obra, por la RPC de clave (regla 19):
//   { at, por, huella, sello_at, esperando_pc, entregado_at, firmado,
//     anulado_at, anulado_motivo }
// docs/conocimiento/certificadores-app/visto-bueno-desde-la-envolvente.md
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const cex = require('../ceeEnvolventeCex');
const { fallo, errorBd, evento } = require('./comun');

const CAMPO = 'visto_bueno';
const ESTADOS_CON_VISTO_BUENO = ['EN_PREPARACION', 'LISTO', 'VALIDADO'];

const cuando = (iso) => Date.parse(iso || '') || 0;
const selloDe = (cee) => cee?.cex_sello?.inicial || null;

/** ¿Vale el visto bueno para el `.cex` sellado ahora? */
function vigente(cee) {
    const vb = cee?.[CAMPO];
    const s = selloDe(cee);
    if (!vb?.at || vb.anulado_at || !s) return false;
    if (s.huella && s.huella === vb.huella) return true;
    //: El PC calificó la receta que se aprobó por calificar.
    return !!vb.esperando_pc && s.por === 'pc' && cuando(s.at) > cuando(vb.at);
}

/** Vigente y calificado por CE3X: lo que se firma lleva el visto bueno. */
const listoParaFirmar = (cee) => vigente(cee) && !selloDe(cee)?.por_calificar;

/** Lo que enseña la ventana. */
function resumen(cee) {
    const vb = cee?.[CAMPO];
    if (!vb?.at) return null;
    return {
        at: vb.at, por: vb.por || null,
        vigente: vigente(cee), listo: listoParaFirmar(cee),
        esperando_pc: !!vb.esperando_pc && !!selloDe(cee)?.por_calificar,
        entregado_at: vb.entregado_at || null, firmado: !!vb.firmado,
        anulado_at: vb.anulado_at || null, anulado_motivo: vb.anulado_motivo || null,
    };
}

/** El `cee` justo para esto (escalares por JSON path, nunca el JSONB entero). */
async function leer(obraId) {
    const { data, error } = await supabase.from('certapp_obras')
        .select('id, estado, cuenta_id, numero_expediente, vb:cee->visto_bueno, sello:cee->cex_sello->inicial, firma:cee->firma')
        .eq('id', obraId).maybeSingle();
    if (error) throw errorBd(error, 'visto bueno');
    if (!data) return null;
    return { obra: data, cee: { [CAMPO]: data.vb || null, cex_sello: { inicial: data.sello || null }, firma: data.firma || null } };
}

const escribir = (obraId, vb) => cex.setCeeField(cex.expedienteStub('ext', obraId), CAMPO, vb);

/** El estado del visto bueno de una obra, para la ventana. */
async function estado(obraId) {
    const l = await leer(obraId);
    return l ? resumen(l.cee) : null;
}

/**
 * Entrega con el visto bueno (calificado ya por CE3X) y lo apunta. La usan `dar`
 * y `alCalificar`.
 */
async function entregarConVistoBueno(obraId, vb, sello) {
    const r = await require('./entrega').entregar(obraId, {
        por: 'BROKERGY', porDetalle: vb.por || null, reabrir: true, vistoBueno: true });
    await escribir(obraId, { ...vb, huella: sello?.huella || vb.huella, sello_at: sello?.at || vb.sello_at || null,
                             esperando_pc: false, entregado_at: new Date().toISOString() });
    return r;
}

/**
 * Da el visto bueno.
 * @param {string} obraId
 * @param {{ quien?: string, huella?: string }} o  `huella`: la de lo que se ve en
 *        la ventana; si no es la del `.cex` sellado, 409 DESFASADO.
 * @returns {Promise<{ ok, que: 'ENTREGADO'|'CALCULANDO'|'FIRMADO', visto_bueno }>}
 */
async function dar(obraId, { quien = null, huella = null } = {}) {
    const l = await leer(obraId);
    if (!l) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
    const { obra } = l;
    if (!ESTADOS_CON_VISTO_BUENO.includes(obra.estado)) {
        throw fallo(409, `La obra está ${obra.estado}: el visto bueno se da con el certificado pedido.`, 'ESTADO_SIN_VISTO_BUENO');
    }
    const sello = selloDe(l.cee);
    if (!sello) throw fallo(409, 'Todavía no hay un .cex generado: genera primero el certificado.', 'SIN_CEX');
    if (huella && sello.huella && huella !== sello.huella) {
        throw fallo(409, 'Lo que ves no es lo que está generado: vuelve a generar el .cex y da el visto bueno.', 'DESFASADO');
    }
    const ahora = new Date().toISOString();
    const vb = { at: ahora, por: quien, huella: sello.huella || null, sello_at: sello.at || null,
                 esperando_pc: !!sello.por_calificar };

    // Por calificar: lo califica el PC y se entrega al terminar (`alCalificar`).
    if (sello.por_calificar) {
        await escribir(obra.id, vb);
        const pc = await require('../asistenteCanal').encargarCalificarExt({ numero: obra.numero_expediente, obraId: obra.id });
        await evento(obra.id, obra.cuenta_id, 'VISTO_BUENO',
            'BROKERGY ha dado el visto bueno: se está calculando con CE3X y quedará listo para firmar', 'BROKERGY',
            { huella: vb.huella }, { porDetalle: quien,
                                     notaInterna: pc.ok ? null : `No se ha podido encargar al PC: ${pc.motivo}` });
        return { ok: true, que: 'CALCULANDO', pc: { ok: !!pc.ok, motivo: pc.ok ? null : pc.motivo },
                 visto_bueno: resumen({ ...l.cee, [CAMPO]: vb }) };
    }

    // Ya firmado ESTA versión: no se reabre; en un encargo del CRM, su visto bueno.
    if (obra.estado === 'VALIDADO' && cuando(l.cee.firma?.at) > cuando(sello.at)) {
        const hecho = { ...vb, firmado: true };
        await escribir(obra.id, hecho);
        await evento(obra.id, obra.cuenta_id, 'VISTO_BUENO', 'BROKERGY ha dado el visto bueno al certificado firmado',
            'BROKERGY', { huella: vb.huella }, { porDetalle: quien });
        require('./crm').vistoBuenoAlCrmAsync(obra.id);
        return { ok: true, que: 'FIRMADO', visto_bueno: resumen({ ...l.cee, [CAMPO]: hecho }) };
    }

    await escribir(obra.id, vb);
    await evento(obra.id, obra.cuenta_id, 'VISTO_BUENO', 'BROKERGY ha dado el visto bueno al certificado',
        'BROKERGY', { huella: vb.huella }, { porDetalle: quien });
    const r = await entregarConVistoBueno(obra.id, vb, sello);
    const fresco = await leer(obra.id);
    return { ok: true, que: 'ENTREGADO', aviso: r.aviso || null, compartida: !!r.compartida?.ok,
             visto_bueno: fresco ? resumen(fresco.cee) : null };
}

/**
 * Tras calificar en el PC (`entrega.alTerminarIa`): con un visto bueno vigente,
 * se entrega con él. `null` si no lo hay (sigue el camino de siempre).
 */
async function alCalificar(obraId) {
    const l = await leer(obraId);
    if (!l || !vigente(l.cee) || !listoParaFirmar(l.cee)) return null;
    return entregarConVistoBueno(obraId, l.cee[CAMPO], selloDe(l.cee));
}

/**
 * Una generación nueva (ventana o skill) con OTRA receta anula el visto bueno.
 * La llama `cex.sellar` en las obras de la app; y, sin huella, `firma.subirXml`
 * (el certificador sube SU XML: lo que firmará ya no es lo revisado). Nunca lanza.
 * @returns {Promise<boolean>} si lo ha anulado
 */
async function anularSiOtraReceta(obraId, huellaNueva, { motivo = null } = {}) {
    try {
        const l = await leer(obraId);
        const vb = l?.cee?.[CAMPO];
        if (!vb?.at || vb.anulado_at || (huellaNueva && vb.huella === huellaNueva)) return false;
        const porque = motivo || 'El certificado se ha vuelto a generar con otros datos';
        await escribir(obraId, { ...vb, anulado_at: new Date().toISOString(), anulado_motivo: `${porque}.` });
        await evento(obraId, l.obra.cuenta_id, 'VISTO_BUENO_ANULADO',
            `${porque}: el visto bueno de BROKERGY ya no vale`, 'BROKERGY');
        return true;
    } catch (e) {
        console.warn(`[certapp visto bueno] anular (${obraId}):`, e.message);
        return false;
    }
}

module.exports = { vigente, listoParaFirmar, resumen, estado, dar, alCalificar, anularSiOtraReceta, leer, CAMPO };
