// ============================================================================
// cargarRevision.js — TODO lo que hace falta para revisar un CEE, desde
// Supabase y con el nº de expediente (o su id).
//
// Vivía dentro de `scripts/revisar_cee.js`. Se sacó al necesitarlo también el
// barrido de calibración (`scripts/barrer_revision_cee.js`) y, después, la
// ruta de la app: con dos copias, el CLI y la app cargarían el expediente de
// forma distinta y podrían dar veredictos distintos del mismo certificado.
//
// El `.xml` crudo de cada fase está guardado en el propio expediente
// (`cee.xml_inicial` / `cee.xml_final`), así que no hay que bajar nada de Drive.
//
// ⚠️ Viene EN MAYÚSCULAS —`normalizeData` deja así la columna entera— y eso es
// justo lo que impide releerlo con `parseCeeXml` (regla 32). `radiografiaCee`
// sí puede: busca sin distinguir mayúsculas.
//
// ⚠️ Los dos XML pesan ~110 KB cada uno: se piden de UN expediente, nunca de un
// listado (regla 22).
// ============================================================================

const supabase = require('../supabaseClient');
const { radiografiaXml } = require('./radiografiaCee');
const ceeUploadService = require('../ceeUploadService');
const revisionCex = require('./revisionCex');

/**
 * @param {{numero?: string, id?: string}} clave
 * @returns {Promise<{expediente, certificador, fases: Array<{fichero, fase, deducida, rx}>}>}
 */
async function cargarParaRevision({ numero = null, id = null, conCex = true, xmlDeDrive = null }) {
    let q = supabase.from('expedientes').select('*, oportunidades(*)');
    q = id ? q.eq('id', id) : q.eq('numero_expediente', numero);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!data) throw new Error(`No existe el expediente ${numero || id}.`);

    //: Quién tiene asignado el CEE, para poder decir si lo firma ese técnico.
    //: ⚠️ La columna del NIF en `prescriptores` es `cif`, no `cif_nif` (regla 51).
    let certificador = null;
    const certId = data.cee?.certificador_id;
    if (certId) {
        const { data: p } = await supabase.from('prescriptores')
            .select('id_empresa, razon_social, cif, nombre_responsable, nif_responsable, es_autonomo, empresa_cif')
            .eq('id_empresa', certId).maybeSingle();
        certificador = p || null;
    }

    const numeroExp = data.numero_expediente;
    const ctx = { expediente: data, driveFolderId: await ceeUploadService.resolveDriveFolderId(data).catch(() => null) };
    const fases = [];
    for (const fase of ['inicial', 'final']) {
        //: `xmlDeDrive` = la fase cuyo `.xml` ACABA de subir el técnico: se lee
        //: el suyo de Drive antes que el de la BD. El de la BD lo escribe el
        //: navegador un instante después de subirlo (y por el enlace público no
        //: se escribe), así que en la revisión al subir sería el ANTERIOR.
        if (xmlDeDrive === fase && conCex) {
            try {
                const x = await revisionCex.ficheroEntregado(ctx, fase, 'xml');
                if (x) {
                    fases.push({ fichero: `${x.nombre} (Drive)`, fase, deducida: false, rx: radiografiaXml(x.bytes) });
                    continue;
                }
            } catch { /* sin xml en Drive: se cae al de la BD */ }
        }
        const crudo = data.cee?.[`xml_${fase}`];
        if (crudo) {
            fases.push({ fichero: `${numeroExp} · CEE ${fase} (Supabase)`, fase, deducida: false,
                         rx: radiografiaXml(crudo) });
            continue;
        }
        //: Sin `.xml` en la BD —los expedientes migrados, y los que se subieron
        //: por fuera de la app— se busca el del técnico en su carpeta.
        if (!conCex) continue;
        try {
            const x = await revisionCex.ficheroEntregado(ctx, fase, 'xml');
            if (x) fases.push({ fichero: `${x.nombre} (Drive)`, fase, deducida: false, rx: radiografiaXml(x.bytes) });
        } catch { /* sin xml en Drive: la revisión lo dirá */ }
    }
    //: El `.cex` del técnico, de Drive, leído por el motor. Si no está, o el
    //: motor no responde, la revisión sigue con el `.xml` y lo dice: los puntos
    //: que solo se ven en el `.cex` salen «sin comprobar», nunca en blanco.
    const cex = {};
    if (conCex) {
        for (const fase of ['inicial', 'final']) {
            try {
                const entregado = await revisionCex.cexEntregado(ctx, fase);
                if (!entregado) continue;
                cex[fase] = { nombre: entregado.nombre, rx: await revisionCex.radiografiaCex(entregado.bytes) };
            } catch (e) {
                cex[fase] = { error: e.message };
            }
        }
    }
    return { expediente: data, certificador, fases, cex };
}

/**
 * Revisa el CEE de una fase y GUARDA el resultado en el expediente, en
 * `cee.revision_{fase}`: la chapa del módulo CEE lo enseña sin volver a revisar,
 * y la revisión automática al subir el técnico (fase 3) escribe en el mismo sitio.
 *
 * REGLA — se guardan METADATOS (regla 21): el veredicto, el recuento y los
 * puntos que NO están en verde, con su evidencia. Lo correcto no se guarda: se
 * recalcula revisando otra vez.
 *
 * REGLA — lo escribe SOLO esta función, con la RPC que reemplaza UNA clave de
 * `cee`; el PUT general la preserva (ver `routes/expedientes.js`).
 */
async function revisarYGuardar({ id, fase = 'inicial', usuario = null, xmlDeDrive = false, origen = null }) {
    const { revisarCee } = require('./revisionCee');
    const { setCeeField } = require('../ceeEnvolventeCex');
    const carga = await cargarParaRevision({ id, xmlDeDrive: xmlDeDrive ? fase : null });
    const principal = carga.fases.find((f) => f.fase === fase);
    const cexF = carga.cex?.[fase] || null;
    //: Sin `.xml` pero con `.cex` se revisa igual: la revisión dice que falta.
    if (!principal && !cexF?.rx) {
        const e = new Error(`El técnico todavía no ha entregado el CEE ${fase}: no hay ni .xml ni .cex `
            + `en el expediente ni en «1. CEE / CEE ${fase.toUpperCase()}».`);
        e.status = 409;
        throw e;
    }
    const otra = carga.fases.find((f) => f.fase !== fase) || null;
    const res = await revisarCee({
        radiografia: principal ? principal.rx : null, otraFase: otra ? otra.rx : null,
        expediente: carga.expediente, certificador: carga.certificador, fase,
        cex: cexF?.rx || null,
    });
    const corta = (v) => (v == null ? null : String(v).slice(0, 600));
    const guardado = {
        at: new Date().toISOString(),
        por: usuario,
        //: 'subida' = la revisión previa que se lanza al subir el técnico su
        //: fichero (`revisionTecnico.preRevisar`); sin origen, la de la lupa.
        ...(origen ? { origen } : {}),
        veredicto: res.veredicto,
        resumen: res.resumen,
        fuentes: { xml: principal ? principal.fichero : null, cex: cexF?.nombre || null, cex_error: cexF?.error || null },
        puntos: res.comprobaciones
            .filter((p) => p.estado !== 'ok' && p.estado !== 'info')
            .map((p) => ({ id: p.id, titulo: p.titulo, estado: p.estado, dice: corta(p.dice),
                           esperado: corta(p.esperado), detalle: corta(p.detalle),
                           ...(p.accion ? { accion: p.accion } : {}) })),
    };
    await setCeeField(carga.expediente, `revision_${fase}`, guardado);
    return { ...res, fuentes: guardado.fuentes, guardado };
}

module.exports = { cargarParaRevision, revisarYGuardar };
