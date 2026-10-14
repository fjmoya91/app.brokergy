// ─────────────────────────────────────────────────────────────────────────────
// avisoInstaladoresCobro — fase 7 del lote: avisar a cada INSTALADOR de que sus
// clientes ya han COBRADO la ayuda.
//
// UN mensaje por instalador y lote (no uno por expediente), al contacto COMERCIAL
// del partner (regla 44), y solo cuando TODOS sus clientes del lote ya están
// transferidos: el mensaje dice «ya hemos abonado», y eso tiene que ser verdad para
// cada línea. Nada sale solo: se prepara el borrador, se revisa en el popup y se
// manda con un clic (adminOnly: lleva lo que cobra cada cliente).
//
// El texto vive en `cobroForm.componerMensajeInstaladorCobro` (puro y probado).
// El envío se sella en cada expediente (`documentacion.cobro.aviso_instalador`)
// con la RPC de MERGE, para no volver a ofrecerlo.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = require('./supabaseClient');
const cobroService = require('./cobroService');

// La MISMA cascada que la columna Instalador del listado y la ficha (regla 53).
const instaladorDe = (e) => e?.instalacion?.instalador_id || e?.instalador_asociado_id
    || e?.oportunidades?.instalador_asociado_id || null;

/**
 * Los grupos del lote, uno por instalador, con su borrador.
 * @returns {Promise<{ lote, grupos: Array }>}
 */
async function gruposDelLote(loteId) {
    const { data: lote, error } = await supabase.from('lotes')
        .select('id, codigo, anio_actuacion, estado').eq('id', loteId).maybeSingle();
    if (error) { const e = new Error('No se pudo leer el lote'); e.status = 503; throw e; }
    if (!lote) { const e = new Error('Lote no encontrado'); e.status = 404; throw e; }

    // Campos CONCRETOS (regla 22): lo justo para agrupar y escribir la dirección.
    const { data: filas, error: fErr } = await supabase.from('expedientes')
        .select(`id, numero_expediente, instalador_asociado_id,
            instalacion->instalador_id, instalacion->direccion, instalacion->municipio, instalacion->misma_direccion,
            cobro:documentacion->cobro,
            clientes!cliente_id(nombre_razon_social, apellidos, direccion, municipio),
            oportunidades!oportunidad_id(instalador_asociado_id, inputs:datos_calculo->inputs)`)
        .eq('lote_id', loteId).order('numero_expediente');
    if (fErr) { const e = new Error('No se pudieron leer los expedientes del lote'); e.status = 503; throw e; }

    const { componerMensajeInstaladorCobro, direccionObra, nombrePropio } = await cobroService.loadCobroForm();
    const porInst = new Map();
    let requerimientos = 0;
    for (const f of (filas || [])) {
        const e = {
            ...f,
            instalacion: { instalador_id: f.instalador_id, direccion: f.direccion, municipio: f.municipio, misma_direccion: f.misma_direccion },
            oportunidades: { instalador_asociado_id: f.oportunidades?.instalador_asociado_id, datos_calculo: { inputs: f.oportunidades?.inputs || {} } },
        };
        const full = await cobroService.cargarExpediente(f.id);
        if (!requerimientos && full) requerimientos = await cobroService.requerimientosDe(full);
        const cobro = f.cobro || {};
        const c = f.clientes || {};
        const item = {
            id: f.id,
            numero_expediente: f.numero_expediente,
            nombre: nombrePropio(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`) || f.numero_expediente,
            direccion: direccionObra(e),
            ayuda: full ? await cobroService.bonoVerificado(full) : null,
            transferido: !!cobro.transferencia?.at,
            avisado_at: cobro.aviso_instalador?.at || null,
        };
        const inst = instaladorDe(e);
        if (!porInst.has(inst)) porInst.set(inst, []);
        porInst.get(inst).push(item);
    }

    const { resolverContacto } = require('./seguimientoLote');
    const grupos = [];
    for (const [instId, items] of porInst) {
        if (!instId) {
            grupos.push({ instalador_id: null, instalador: 'Sin instalador', items, listo: false, motivo: 'Estos expedientes no tienen instalador asignado' });
            continue;
        }
        const { data: p } = await supabase.from('prescriptores')
            .select('razon_social, acronimo').eq('id_empresa', instId).maybeSingle();
        const contacto = await resolverContacto('INSTALADOR', instId, 'comercial');
        const faltan = items.filter(i => !i.transferido).length;
        const sinImporte = items.filter(i => !(Number(i.ayuda) > 0)).length;
        const avisados = items.filter(i => i.avisado_at);
        const motivo = faltan ? `Faltan ${faltan} de ${items.length} por transferir: el mensaje dice que ya han cobrado`
            : sinImporte ? 'Hay clientes sin ayuda verificada'
                : null;
        grupos.push({
            instalador_id: instId,
            instalador: p?.acronimo || p?.razon_social || 'Instalador',
            contacto: {
                nombre: contacto.nombre ? nombrePropio(contacto.nombre) : null,
                tlf: contacto.tlf || null,
                email: contacto.email || null,
                general: !!contacto.general,
            },
            items,
            listo: !motivo,
            motivo,
            avisado_at: avisados.length === items.length ? avisados.map(i => i.avisado_at).sort().pop() : null,
            asunto: `Ayudas CAE abonadas a vuestros clientes${lote.anio_actuacion ? ` (${lote.anio_actuacion})` : ''}`,
            mensaje: componerMensajeInstaladorCobro({
                // Al canal GENERAL de la empresa se saluda en genérico (regla 44).
                nombre: contacto.general ? null : (contacto.nombre ? nombrePropio(contacto.nombre).split(' ')[0] : null),
                clientes: items,
                anio: lote.anio_actuacion || null,
                requerimientos,
            }),
        });
    }
    // Primero los que se pueden mandar; luego por nombre.
    grupos.sort((a, b) => (b.listo - a.listo) || String(a.instalador).localeCompare(String(b.instalador)));
    return { lote, grupos };
}

/** Manda el aviso a UN instalador y lo sella en cada expediente suyo del lote. */
async function avisarInstalador(loteId, instId, { channels = [], mensaje, usuario }) {
    const { grupos } = await gruposDelLote(loteId);
    const g = grupos.find(x => String(x.instalador_id) === String(instId));
    if (!g) { const e = new Error('Ese instalador no tiene expedientes en este lote'); e.status = 404; throw e; }
    if (!g.listo) { const e = new Error(g.motivo); e.status = 409; throw e; }
    const texto = String(mensaje || '').trim() || g.mensaje;
    const { mandar } = require('./pagoClientesService');
    const sent = await mandar({ tlf: g.contacto.tlf, email: g.contacto.email, channels, texto, asunto: g.asunto });
    if (!sent.length) { const e = new Error('No se pudo enviar por los canales elegidos (sin teléfono o sin email)'); e.status = 400; throw e; }
    const at = new Date().toISOString();
    for (const i of g.items) {
        try {
            await cobroService.sellar(i.id, { aviso_instalador: { at, por: usuario || null, canales: sent, instalador_id: instId } });
        } catch (e) { console.warn('[aviso instalador] sello', i.numero_expediente, e.message); }
    }
    return { channels: sent, instalador: g.instalador, contacto: g.contacto.nombre || g.instalador, n: g.items.length };
}

module.exports = { gruposDelLote, avisarInstalador, instaladorDe };
