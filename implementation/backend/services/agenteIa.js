// ============================================================================
// agenteIa.js — el AGENTE IA, un certificador más.
//
// Los CEE que se preparan con las skills (`generar-cee-inicial`,
// `generar-cee-final`) se perdían de vista: se le pedían a Claude y después
// nadie sabía si estaban hechos o no. Ahora el agente es un CERTIFICADOR de la
// tabla de siempre (`prescriptores.es_agente_ia`) y recorre las MISMAS fases que
// un técnico:
//
//   encargado (ASIGNADO) → el agente empieza (EN_TRABAJO) → deja el .cex y
//   avisa (PTE_REVISION, «pendiente de revisión»), igual que un técnico al
//   subir su .cex y pulsar «Solicitar revisión».
//
// Lo usan:
//   · `scripts/agente_ia.js` (cola · empezar · terminar · estado), que es lo
//     que llaman las skills;
//   · `scripts/cee_inicial.js aplicar --escribir` y `scripts/cee_final.js
//     --escribir`, que avisan solos al terminar (no se puede olvidar);
//   · el radar del parte (`seguimientoRadar`) y `notify-certificador`, que lo
//     reconocen con `esAgenteIa`.
//
// REGLAS (ver «El AGENTE IA, un certificador más» en CLAUDE.md):
//   · Se reconoce por la MARCA (`es_agente_ia`), nunca por el nombre.
//   · El agente NO FIRMA: no pone sus datos en el .cex (`tecnicoCe3x` lo
//     descarta) y para registrar hay que asignar un técnico.
//   · Solo mueve la fase si el encargo es SUYO. Si hay un técnico asignado, el
//     agente le prepara el borrador, avisa y no toca ni el técnico ni la fase
//     (salvo que se pida `reasignar`).
//   · Nunca hacia atrás: no rebaja una fase ya entregada, revisada o registrada.
//   · El aviso va al equipo (WhatsApp + email), como el de un técnico que sube
//     su .cex. Un fallo del aviso NUNCA deshace el trabajo: se devuelve dicho.
// ============================================================================

const supabase = require('./supabaseClient');
const { applyStatus } = require('./seguimientoTracking');
const { avanzarEstado } = require('../utils/expedienteEstados');
const { rankSubestado, esDoble, nombreFase } = require('../utils/ceeDirectoEstados');
const { enlaceCarpetaLocal } = require('../utils/carpetaLocalEnlace');

const NOMBRE = 'AGENTE IA';
const FRONT = () => String(process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/+$/, '');
const adminPhone = () => process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
const adminEmail = () => process.env.ADMIN_EMAIL || 'franciscojavier.moya.s2e2@gmail.com';

/** ¿Es el agente? Por la marca de su ficha, nunca por el nombre. */
const esAgenteIa = (p) => p?.es_agente_ia === true;

let cacheAgente;
/** La ficha del agente (`id_empresa`, nombre). Se cachea por proceso. */
async function agente() {
    if (cacheAgente !== undefined) return cacheAgente;
    const { data, error } = await supabase.from('prescriptores')
        .select('id_empresa, razon_social, acronimo').eq('es_agente_ia', true).maybeSingle();
    if (error) throw new Error(`No se ha podido leer la ficha del AGENTE IA: ${error.message}`);
    cacheAgente = data || null;
    return cacheAgente;
}

// ─── Lo que se decide (puro: lo prueba test_agente_ia.js) ─────────────────────

const normFase = (f) => (String(f || '').toLowerCase().startsWith('fin') ? 'final' : 'inicial');
const claveFase = (f) => (normFase(f) === 'final' ? 'cee_final' : 'cee_inicial');

/**
 * ¿Quién queda como certificador, y es el encargo del agente?
 *  · Sin técnico → se le pone al agente.
 *  · Ya es el agente → se queda.
 *  · Un técnico de verdad → NO se toca: el agente le prepara el borrador. Solo
 *    con `reasignar` (lo ha pedido una persona) pasa a ser del agente.
 */
function decidirCertificador(actualId, agenteId, { reasignar = false } = {}) {
    const actual = actualId ? String(actualId) : null;
    const ag = agenteId ? String(agenteId) : null;
    if (!ag) return { asignar: false, delAgente: false, humano: actual, sinAgente: true };
    if (!actual) return { asignar: true, delAgente: true, humano: null };
    if (actual === ag) return { asignar: false, delAgente: true, humano: null };
    if (reasignar) return { asignar: true, delAgente: true, humano: null, anterior: actual };
    return { asignar: false, delAgente: false, humano: actual };
}

/**
 * El subestado al que pasa la fase, o null si no se toca.
 *  · empieza → EN_TRABAJO, solo si iba por debajo (encargado o sin encargar).
 *  · termina → PTE_REVISION, solo si iba por debajo: no rebaja un REVISADO.
 *  · registrada → nunca se toca (es terminal).
 */
function siguienteSubestado(actual, paso, { registrada = false } = {}) {
    if (registrada || String(actual || '').toUpperCase() === 'REGISTRADO') return null;
    const destino = paso === 'termina' ? 'PTE_REVISION' : 'EN_TRABAJO';
    return rankSubestado(actual) < rankSubestado(destino) ? destino : null;
}

/** El `estado` global (CAE) que acompaña a cada paso. Solo avanza. */
function estadoGlobalDe(paso, fase) {
    const F = normFase(fase) === 'final' ? 'FINAL' : 'INICIAL';
    return paso === 'termina' ? `PENDIENTE REVISIÓN (${F})` : `EN CERTIFICADOR CEE ${F}`;
}

/** Lo que queda por hacer tras el borrador del agente, por fase. */
function pendientesPorDefecto(fase, { delAgente = true } = {}) {
    const f = normFase(fase);
    const lista = f === 'final'
        ? ['Abrirlo en CE3X y CALIFICAR: tiene que dar lo que dijo el análisis de la skill',
           'Comprobar que la demanda de ACS es la misma que la del CEE inicial',
           'Medidas de mejora → «Actualizar» (la medida va sin calcular)',
           'Exportar el .xml y el .pdf y subirlos al CEE final como «– CEE FINAL»']
        : ['Abrirlo en CE3X: lo que está en ÁMBAR en la envolvente está por confirmar',
           'Medidas de mejora → «Actualizar» (la medida va sin calcular)',
           'Exportar el .xml y el .pdf y subirlos al CEE inicial como «– CEE INICIAL»'];
    if (delAgente) lista.push('El Agente IA no firma: asigna el técnico que lo firma y lo registra');
    return lista;
}

const etiquetaFase = (fase, negocio, fila) => {
    if (negocio === 'cee' && fila) return nombreFase(fila, normFase(fase));
    return normFase(fase) === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
};

const escapar = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const recortar = (s, n = 180) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

const attr = (s) => escapar(s).replace(/"/g, '&quot;');

/**
 * El EMAIL del aviso, con la identidad de marca de BROKERGY: el MISMO
 * `brandEmailShell` (barra degradado naranja→verde, logo, pill) y las mismas
 * piezas que el de «Revisión solicitada» de un técnico, porque cumple el mismo
 * papel. Un diseño propio aquí es el que se queda atrás el día que se toque la
 * marca. Puro: compone HTML, no envía nada.
 */
function componerHtml({ numero, cliente, faseLabel, fichero, enlaces, pendientes,
                        avisosCortos, masAvisos, delAgente, tecnicoHumano, reenvio }) {
    const {
        brandEmailShell, emailP, emailBox, emailButton, emailOutlineButton, emailDataTable, BRAND, FONT,
    } = require('./emailService');
    const MONO = "font-family:Consolas,'Courier New',monospace;";

    const pill = !delAgente
        ? { emoji: '🤖', text: 'Agente IA · borrador para el técnico', bg: BRAND.grayTint, color: BRAND.grayText }
        : { emoji: '🤖', text: reenvio ? 'Agente IA · versión actualizada' : 'Agente IA · pendiente de revisión',
            bg: BRAND.orangeTint, color: BRAND.orangeDark };

    const reenvioHtml = reenvio ? emailBox(
        emailP('🔁 Versión nueva — ya había un borrador anterior de esta fase', { size: 12, bold: true, color: BRAND.muted, center: true, mb: 0 }),
        { bg: BRAND.grayTint, mb: 22 },
    ) : '';

    const intro = emailP(
        `El <strong>Agente IA</strong> ha terminado el borrador del <strong>${escapar(faseLabel)}</strong> del expediente `
        + `<strong style="color:${BRAND.orangeDark};">${escapar(numero)}</strong>`
        + `${cliente ? ` de <strong>${escapar(cliente)}</strong>` : ''}.`,
        { color: BRAND.muted, mb: 10 },
    ) + emailP(delAgente
        ? 'Queda <strong>pendiente de tu revisión</strong>: el agente no firma, así que después hay que pasárselo al técnico que lo firma y lo registra.'
        : `El certificador asignado sigue siendo <strong>${escapar(tecnicoHumano || 'otro técnico')}</strong>: el expediente no cambia de fase. El borrador es para él.`,
    { color: BRAND.muted, mb: 22 });

    // La ficha del borrador: de quién es, en qué queda y qué fichero dejó.
    const estado = delAgente
        ? `<span style="color:${BRAND.orangeDark};">Pendiente de revisión</span>`
        : `Sigue con ${escapar(tecnicoHumano || 'el técnico asignado')}`;
    const ficha = emailBox(
        emailP('📄 Borrador generado', { size: 11, bold: true, color: BRAND.muted, mb: 12,
                                         css: 'letter-spacing:0.06em;text-transform:uppercase;' })
        + emailDataTable([
            ['Expediente', escapar(numero)],
            cliente ? ['Cliente', escapar(cliente)] : null,
            ['Fase', escapar(faseLabel)],
            ['Estado', estado],
            fichero ? ['Fichero', `<span style="${MONO}font-size:12px;font-weight:400;">${escapar(fichero)}</span>`] : null,
        ]),
        { pad: '18px 22px' },
    );

    // Lo que queda, como PASOS numerados: se hace en ese orden.
    const pasos = (pendientes || []).length ? emailP('Queda por hacer', { size: 16, bold: true, mb: 12 })
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">${
            pendientes.map((p, i) => `<tr>
              <td valign="top" width="34" style="width:34px;padding:0 12px 12px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td width="24" height="24" align="center" valign="middle" bgcolor="${BRAND.orange}" style="width:24px;height:24px;border-radius:12px;background:${BRAND.orange};${FONT}font-size:12px;line-height:24px;font-weight:700;color:#FFFFFF;">${i + 1}</td>
                </tr></table>
              </td>
              <td valign="top" style="padding:2px 0 12px;${FONT}font-size:14px;line-height:21px;color:${BRAND.text};">${escapar(p)}</td>
            </tr>`).join('')
        }</table>` : '';

    const avisosHtml = avisosCortos.length ? emailBox(
        emailP(`⚠️ Avisos del borrador${masAvisos ? ` · ${avisosCortos.length + masAvisos}` : ''}`,
               { size: 11, bold: true, color: BRAND.orangeDark, mb: 10, css: 'letter-spacing:0.06em;text-transform:uppercase;' })
        + avisosCortos.map(a => emailP(escapar(a), { size: 13, color: BRAND.text, mb: 8,
                                                     css: `padding-left:12px;border-left:3px solid ${BRAND.orange};` })).join('')
        + (masAvisos ? emailP(`… y ${masAvisos} aviso${masAvisos === 1 ? '' : 's'} más (en el resumen de la skill)`,
                              { size: 12, color: BRAND.muted, mb: 0, css: 'padding-top:2px;' }) : ''),
        { bg: BRAND.orangeTint, border: BRAND.orange, pad: '18px 22px' },
    ) : '';

    // Accesos: los botones son la carpeta LOCAL (donde se trabaja con CE3X) y la
    // app; el resto, una lista que dice para qué sirve cada uno.
    const accesos = [
        enlaces.fichero && ['📄', 'Abrir el .cex', 'Descárgalo y ábrelo en CE3X', enlaces.fichero],
        enlaces.carpeta && ['📁', 'Carpeta del CEE en Drive', 'Donde se suben el .xml y el .pdf exportados', enlaces.carpeta],
        enlaces.envolvente && ['🧱', 'Ventana de la envolvente', 'Lo que está en ámbar está por confirmar', enlaces.envolvente],
    ].filter(Boolean);
    const accesosHtml = accesos.length ? emailBox(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${accesos.map(([ico, txt, sub, href], i) => `
          <tr><td style="padding:${i ? '12px' : '0'} 0 ${i < accesos.length - 1 ? '12px' : '0'};${i < accesos.length - 1 ? `border-bottom:1px solid ${BRAND.border};` : ''}">
            <a href="${attr(href)}" style="text-decoration:none;display:block;">
              <span style="${FONT}font-size:14px;line-height:20px;font-weight:700;color:${BRAND.greenDark};">${ico} ${txt} →</span><br>
              <span style="${FONT}font-size:12px;line-height:18px;color:${BRAND.muted};">${sub}</span>
            </a>
          </td></tr>`).join('')}</table>`,
        { pad: '16px 22px', mb: 0 },
    ) : '';

    // Con carpeta local, ésa es la acción principal: abre el Explorador en
    // `1. CEE / CEE INICIAL`, donde está el .cex para CE3X. La app pasa a contorno.
    const filaBoton = (html, pb = 10) => `<tr><td align="center" style="padding-bottom:${pb}px;">${html}</td></tr>`;
    const botones = (enlaces.local || enlaces.app)
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:18px;">${
            enlaces.local
                ? filaBoton(emailButton(attr(enlaces.local), `📂 Abrir la carpeta local del ${escapar(faseLabel)}`, BRAND.orange), 6)
                  + filaBoton(emailP('Se abre en el Explorador de este PC (con <strong>brokergylocal</strong> instalado).',
                                     { size: 11, color: BRAND.muted, center: true, mb: 0 }), enlaces.app ? 14 : 0)
                  + (enlaces.app ? filaBoton(emailOutlineButton(attr(enlaces.app), '🔗 Abrir en la app'), 0) : '')
                : filaBoton(emailButton(attr(enlaces.app), '🔗 Abrir en la app', BRAND.orange), 0)
        }</table>`
        : '';

    const preheader = `El Agente IA ha dejado el borrador del ${faseLabel} de ${numero}${cliente ? ` (${cliente})` : ''}`
        + (delAgente ? ' · pendiente de revisión.' : ` para ${tecnicoHumano || 'el técnico asignado'}.`);

    return brandEmailShell({
        preheader,
        title: delAgente ? `${faseLabel} listo para revisar` : `Borrador del ${faseLabel} listo`,
        pill,
        contentHtml: reenvioHtml + intro + ficha + pasos + avisosHtml + botones + accesosHtml,
        footerNote: 'Aviso interno del Agente IA · se envía al terminar un borrador de CEE.',
    });
}

/**
 * El aviso al equipo cuando el agente termina. Mismo papel que el de un técnico
 * que sube su .cex («REVISIÓN SOLICITADA»), con lo que hace falta para seguir:
 * el fichero, la carpeta, la ventana de la envolvente y qué queda por hacer.
 * Puro: devuelve los textos, no envía nada.
 */
function componerAviso({ numero, cliente = '', faseLabel, fichero = null, enlaces = {},
                         pendientes = [], avisos = [], delAgente = true, tecnicoHumano = null,
                         reenvio = false }) {
    const avisosCortos = avisos.slice(0, 4).map(a => recortar(a));
    const masAvisos = avisos.length > 4 ? avisos.length - 4 : 0;
    const clienteTxt = cliente ? ` del cliente *${cliente}*` : '';
    const lineasPend = pendientes.map(p => `• ${p}`).join('\n');
    const lineasAv = avisosCortos.map(a => `⚠ ${a}`).join('\n')
        + (masAvisos ? `\n⚠ … y ${masAvisos} aviso${masAvisos === 1 ? '' : 's'} más (en el resumen de la skill)` : '');
    const fase = `*${faseLabel}*`;
    const nota = delAgente
        ? `Queda *PENDIENTE DE REVISIÓN*${reenvio ? ' (ya lo estaba: es una versión nueva)' : ''}.`
        : `El certificador asignado sigue siendo *${tecnicoHumano || 'otro técnico'}*: el expediente no cambia de fase.`;

    const whatsapp =
`🤖 *${faseLabel} LISTO · AGENTE IA*${reenvio ? ' *(actualizado)*' : ''}

El *Agente IA* ha terminado el borrador del ${fase} de *${numero}*${clienteTxt}.
${nota}
${fichero ? `\n📄 ${fichero}\n` : ''}
*Queda por hacer:*
${lineasPend}
${lineasAv ? `\n${lineasAv}\n` : ''}
${enlaces.local ? `📂 Carpeta local (PC): ${enlaces.local}\n` : ''}${enlaces.app ? `🔗 Ver: ${enlaces.app}\n` : ''}${enlaces.carpeta ? `📁 Carpeta en Drive: ${enlaces.carpeta}\n` : ''}${enlaces.envolvente ? `🧱 Envolvente: ${enlaces.envolvente}\n` : ''}
*BROKERGY · Ingeniería Energética*`;

    const html = componerHtml({ numero, cliente, faseLabel, fichero, enlaces, pendientes,
                                avisosCortos, masAvisos, delAgente, tecnicoHumano, reenvio });

    const asunto = `🤖 ${faseLabel} listo (Agente IA) — ${numero}${cliente ? ` · ${cliente}` : ''}${reenvio ? ' · actualizado' : ''}`;
    return { whatsapp, html, asunto, text: whatsapp.replace(/\*/g, '') };
}

// ─── Cargar lo justo de cada negocio (nunca `cee` entero: lleva los XML) ─────

const esUuid = (v) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(v || ''));
const nombreCliente = (c) => (c ? [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ').trim() : '');

async function cargarCae(clave) {
    const { data, error } = await supabase.from('expedientes')
        .select('id, numero_expediente, estado, oportunidad_id, seguimiento, '
                + 'cert:cee->>certificador_id, agente_ia:cee->agente_ia, '
                + 'cee_folder_link:cee->>cee_folder_link, '
                + 'reg_ini:documentacion->>fecha_registro_cee_inicial, '
                + 'reg_fin:documentacion->>fecha_registro_cee_final, '
                + 'clientes!cliente_id(nombre_razon_social, apellidos)')
        .eq(esUuid(clave) ? 'id' : 'numero_expediente', clave).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
}

async function cargarCee(clave) {
    const { data, error } = await supabase.from('cee_directos')
        .select('id, numero_expediente, estado, alcance, seguimiento, '
                + 'cert:cee->>certificador_id, agente_ia:cee->agente_ia, cliente_id')
        .eq(esUuid(clave) ? 'id' : 'numero_expediente', clave).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (data.cliente_id) {
        const { data: cli } = await supabase.from('clientes')
            .select('nombre_razon_social, apellidos').eq('id_cliente', data.cliente_id).maybeSingle();
        data.clientes = cli || null;
    }
    return data;
}

async function cargarOp(clave) {
    const { data, error } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, cliente_id, '
                + 'drive_link:datos_calculo->>drive_folder_link')
        .eq(esUuid(clave) ? 'id' : 'id_oportunidad', clave).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (data.cliente_id) {
        const { data: cli } = await supabase.from('clientes')
            .select('nombre_razon_social, apellidos').eq('id_cliente', data.cliente_id).maybeSingle();
        data.clientes = cli || null;
    }
    return data;
}

/** Escribe UNA clave de `cee` (reemplaza, no funde). Mismo RPC que la envolvente. */
async function setCee(negocio, id, campo, valor) {
    const { error } = negocio === 'cee'
        ? await supabase.rpc('set_cee_directo_cee_field', { p_cee_directo_id: id, p_field: campo, p_value: valor })
        : await supabase.rpc('set_expediente_cee_field', { p_expediente_id: id, p_field: campo, p_value: valor });
    if (error) throw new Error(`No se ha podido guardar cee.${campo}: ${error.message}`);
}

/** Una línea en el historial del expediente CAE (lectura fresca, como guiaIrpf). */
async function anotarCae(id, entradas) {
    const { data } = await supabase.from('expedientes').select('documentacion').eq('id', id).maybeSingle();
    const doc = data?.documentacion || {};
    const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
    historial.push(...entradas);
    const { error } = await supabase.from('expedientes')
        .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) console.warn(`[AgenteIA] historial ${id}: ${error.message}`);
}

/**
 * Una línea en el historial de la OPORTUNIDAD. Vive dentro de `datos_calculo` y
 * no tiene RPC propia: se relee justo antes de escribir (mismo patrón que
 * `anotarHistorial` de routes/oportunidades.js).
 */
async function anotarOportunidad(oportunidadId, texto) {
    const { data } = await supabase.from('oportunidades')
        .select('datos_calculo').eq('id', oportunidadId).maybeSingle();
    const dc = data?.datos_calculo || {};
    const hist = Array.isArray(dc.historial) ? dc.historial : [];
    hist.push({ id: `${Date.now()}_agente_ia`, tipo: 'comentario', texto,
                fecha: new Date().toISOString(), usuario: NOMBRE });
    const { error } = await supabase.from('oportunidades')
        .update({ datos_calculo: { ...dc, historial: hist } }).eq('id', oportunidadId);
    if (error) console.warn(`  (no se ha podido anotar en el historial: ${error.message})`);
}

async function nombreTecnico(id) {
    if (!id) return null;
    const { data } = await supabase.from('prescriptores')
        .select('razon_social, acronimo').eq('id_empresa', id).maybeSingle();
    return data?.razon_social || data?.acronimo || null;
}

function enlacesDe(negocio, fila) {
    if (negocio === 'op') {
        return { app: `${FRONT()}/?op=${encodeURIComponent(fila.id_oportunidad || fila.id)}`,
                 envolvente: `${FRONT()}/envolvente/${fila.id}?origen=op` };
    }
    if (negocio === 'cee') {
        return { app: `${FRONT()}/?cee=${fila.id}`, envolvente: `${FRONT()}/envolvente/${fila.id}?origen=cee` };
    }
    return { app: `${FRONT()}/?exp=${fila.id}`, envolvente: `${FRONT()}/envolvente/${fila.id}`,
             carpeta: fila.cee_folder_link || null };
}

function registradaCae(fila, fase) {
    const k = claveFase(fase);
    return !!(normFase(fase) === 'final' ? fila.reg_fin : fila.reg_ini)
        || !!fila.seguimiento?.[`${k}_ts`]?.REGISTRADO;
}

// ─── Los dos pasos ───────────────────────────────────────────────────────────

/**
 * El agente EMPIEZA a trabajar en un CEE: pone «AGENTE IA» en la barra de
 * certificadores (si no hay técnico, o si se pide `reasignar`) y la fase pasa
 * a EN_TRABAJO. Idempotente: relanzarlo no cambia nada ni anota dos veces.
 *
 * @returns {{ ok, negocio, numero, delAgente, humano, cambios: string[] }}
 */
async function empezar({ negocio, clave, fase = 'inicial', reasignar = false }) {
    fase = normFase(fase);
    if (negocio === 'op') {
        // Una oportunidad no tiene certificador ni fases: no hay nada que marcar.
        const op = await cargarOp(clave);
        if (!op) throw new Error(`No encuentro la oportunidad ${clave}.`);
        return { ok: true, negocio, numero: op.id_oportunidad, delAgente: false, humano: null,
                 cambios: [], nota: 'Es una OPORTUNIDAD: no tiene certificador ni fases. Al terminar se avisa igual.' };
    }
    const ag = await agente();
    if (!ag) throw new Error('No existe la ficha del AGENTE IA (scripts/agente_ia_certificador.sql).');
    const fila = negocio === 'cee' ? await cargarCee(clave) : await cargarCae(clave);
    if (!fila) throw new Error(`No encuentro ${clave}.`);
    if (negocio === 'cee' && fase === 'final' && !esDoble(fila)) {
        throw new Error(`${fila.numero_expediente} es un encargo de UN solo certificado: no tiene fase final.`);
    }

    const dec = decidirCertificador(fila.cert, ag.id_empresa, { reasignar });
    const cambios = [];
    const ahora = new Date().toISOString();
    const sello = { ...(fila.agente_ia || {}) };
    const prevFase = sello[fase] || {};
    sello[fase] = { ...prevFase, estado: 'trabajando', empezado_at: prevFase.estado === 'trabajando' ? prevFase.empezado_at || ahora : ahora,
                    delAgente: dec.delAgente };
    await setCee(negocio, fila.id, 'agente_ia', sello);

    if (!dec.delAgente) {
        const humano = await nombreTecnico(dec.humano);
        return { ok: true, negocio, numero: fila.numero_expediente, delAgente: false, humano, cambios,
                 nota: `El certificador asignado es ${humano || 'otro técnico'}: el agente le prepara el borrador `
                     + 'y no toca ni el técnico ni la fase. Para ponerlo a nombre del agente: --reasignar.' };
    }
    if (dec.asignar) {
        await setCee(negocio, fila.id, 'certificador_id', ag.id_empresa);
        cambios.push(dec.anterior ? `certificador: ${await nombreTecnico(dec.anterior) || 'anterior'} → ${NOMBRE}`
                                  : `certificador: sin asignar → ${NOMBRE}`);
    }

    const key = claveFase(fase);
    const registrada = negocio === 'cee'
        ? String(fila.seguimiento?.[key] || '').toUpperCase() === 'REGISTRADO'
        : registradaCae(fila, fase);
    const nuevo = siguienteSubestado(fila.seguimiento?.[key], 'empieza', { registrada });
    const faseLabel = etiquetaFase(fase, negocio, fila);

    if (negocio === 'cee') {
        const svc = require('./ceeDirectoService');
        if (nuevo) {
            await svc.guardar(fila.id, { seguimiento: { [key]: nuevo } }, { seguimientoPrev: fila.seguimiento });
            cambios.push(`${faseLabel}: ${fila.seguimiento?.[key] || 'sin empezar'} → ${nuevo}`);
        }
        if (cambios.length) {
            await svc.anotarHistorial(fila.id, { tipo: 'CERTIFICADOR', usuario: NOMBRE,
                texto: `EL AGENTE IA HA EMPEZADO EL ${faseLabel}` });
        }
        return { ok: true, negocio, numero: fila.numero_expediente, delAgente: true, humano: null, cambios };
    }

    // CAE: subestado + estado global (solo avanza) en una escritura; el historial aparte.
    const seguimiento = { ...(fila.seguimiento || {}) };
    if (nuevo) applyStatus(seguimiento, key, nuevo);
    const estado = avanzarEstado(fila.estado, estadoGlobalDe('empieza', fase));
    if (nuevo || estado !== fila.estado) {
        const { error } = await supabase.from('expedientes')
            .update({ seguimiento, estado, updated_at: ahora }).eq('id', fila.id);
        if (error) throw new Error(error.message);
        if (nuevo) cambios.push(`${faseLabel}: ${fila.seguimiento?.[key] || 'sin empezar'} → ${nuevo}`);
        if (estado !== fila.estado) cambios.push(`estado: ${fila.estado} → ${estado}`);
    }
    if (cambios.length) {
        const entradas = [{ id: `${Date.now()}_agente_ia_ini`, tipo: 'informativo', usuario: NOMBRE, fecha: ahora,
                            texto: `🤖 El Agente IA ha empezado el ${faseLabel}.` }];
        if (estado !== fila.estado) entradas.push({ id: `${Date.now()}_status`, estado, fecha: ahora, usuario: NOMBRE });
        await anotarCae(fila.id, entradas);
    }
    if (estado !== fila.estado) await moverCarpeta(fila.id);
    return { ok: true, negocio, numero: fila.numero_expediente, delAgente: true, humano: null, cambios };
}

/**
 * El agente TERMINA: deja la fase «pendiente de revisión» (si el encargo es
 * suyo), sella qué fichero dejó y AVISA al equipo — lo mismo que un técnico al
 * subir su .cex. `aviso: false` lo calla (relanzar en la misma sesión).
 *
 * @param {object} p
 * @param {'cae'|'cee'|'op'} p.negocio
 * @param {string} p.clave   nº o uuid
 * @param {'inicial'|'final'} [p.fase]
 * @param {{nombre?, link?, carpeta_link?}} [p.fichero]  lo que devolvió `guardarEnDrive`
 * @param {string[]} [p.pendientes]  qué queda (por defecto, el de la fase)
 * @param {string[]} [p.avisos]      avisos de la skill (se resumen en el aviso)
 * @param {boolean} [p.aviso=true]
 */
async function terminar({ negocio, clave, fase = 'inicial', fichero = {}, pendientes = null,
                          avisos = [], aviso = true }) {
    fase = normFase(fase);
    const ahora = new Date().toISOString();
    const cambios = [];

    let fila, numero, cliente, delAgente = false, humano = null, reenvio = false, faseLabel, enlaces;

    if (negocio === 'op') {
        fila = await cargarOp(clave);
        if (!fila) throw new Error(`No encuentro la oportunidad ${clave}.`);
        numero = fila.id_oportunidad;
        cliente = nombreCliente(fila.clientes) || fila.referencia_cliente || '';
        faseLabel = etiquetaFase(fase, negocio);
        enlaces = { ...enlacesDe('op', fila), carpeta: fichero.carpeta_link || fila.drive_link || null };
        await anotarOportunidad(fila.id, `🤖 El Agente IA ha dejado el borrador del ${faseLabel}`
            + `${fichero.nombre ? ` (${fichero.nombre})` : ''}. Pendiente de revisar en CE3X.`);
    } else {
        const ag = await agente();
        if (!ag) throw new Error('No existe la ficha del AGENTE IA (scripts/agente_ia_certificador.sql).');
        fila = negocio === 'cee' ? await cargarCee(clave) : await cargarCae(clave);
        if (!fila) throw new Error(`No encuentro ${clave}.`);
        numero = fila.numero_expediente;
        cliente = nombreCliente(fila.clientes);
        faseLabel = etiquetaFase(fase, negocio, fila);
        enlaces = { ...enlacesDe(negocio, fila) };
        // La carpeta del CEE: la que acaba de devolver la escritura, o la del sello
        // anterior (un `agente_ia.js terminar` a mano no la trae).
        const carpetaPrevia = fila.agente_ia?.[fase]?.carpeta_link;
        if (fichero.carpeta_link || carpetaPrevia) enlaces.carpeta = fichero.carpeta_link || carpetaPrevia;

        // Si nadie lo había marcado al empezar y no hay técnico, el encargo es del
        // agente: `decidir` sin reasignar nunca le quita el expediente a nadie.
        const dec = decidirCertificador(fila.cert, ag.id_empresa);
        delAgente = dec.delAgente;
        if (dec.asignar) {
            await setCee(negocio, fila.id, 'certificador_id', ag.id_empresa);
            cambios.push(`certificador: sin asignar → ${NOMBRE}`);
        }
        if (!delAgente) humano = await nombreTecnico(dec.humano);

        const prevSello = fila.agente_ia?.[fase] || {};
        reenvio = prevSello.estado === 'terminado';
        const sello = { ...(fila.agente_ia || {}) };
        sello[fase] = {
            ...prevSello, estado: 'terminado', delAgente,
            empezado_at: prevSello.empezado_at || null,
            terminado_at: ahora,
            fichero: fichero.nombre || prevSello.fichero || null,
            fichero_link: fichero.link || prevSello.fichero_link || null,
            carpeta_link: fichero.carpeta_link || prevSello.carpeta_link || null,
        };
        await setCee(negocio, fila.id, 'agente_ia', sello);

        if (delAgente) {
            const key = claveFase(fase);
            const registrada = negocio === 'cee'
                ? String(fila.seguimiento?.[key] || '').toUpperCase() === 'REGISTRADO'
                : registradaCae(fila, fase);
            const nuevo = siguienteSubestado(fila.seguimiento?.[key], 'termina', { registrada });
            if (negocio === 'cee') {
                const svc = require('./ceeDirectoService');
                if (nuevo) {
                    await svc.guardar(fila.id, { seguimiento: { [key]: nuevo } }, { seguimientoPrev: fila.seguimiento });
                    cambios.push(`${faseLabel}: ${fila.seguimiento?.[key] || 'sin empezar'} → ${nuevo}`);
                }
            } else {
                const seguimiento = { ...(fila.seguimiento || {}) };
                if (nuevo) applyStatus(seguimiento, key, nuevo);
                const estado = avanzarEstado(fila.estado, estadoGlobalDe('termina', fase));
                if (nuevo || estado !== fila.estado) {
                    const { error } = await supabase.from('expedientes')
                        .update({ seguimiento, estado, updated_at: ahora }).eq('id', fila.id);
                    if (error) throw new Error(error.message);
                    if (nuevo) cambios.push(`${faseLabel}: ${fila.seguimiento?.[key] || 'sin empezar'} → ${nuevo}`);
                    if (estado !== fila.estado) cambios.push(`estado: ${fila.estado} → ${estado}`);
                    // La etiqueta de la fase del CEE la escribe el servidor (como notify-review).
                    if (nuevo) await setCee('cae', fila.id, 'estado', estadoGlobalDe('termina', fase));
                    if (estado !== fila.estado) await moverCarpeta(fila.id);
                }
                fila._estadoNuevo = estado;
            }
        }

        const texto = `🤖 El Agente IA ha dejado el borrador del ${faseLabel}`
            + `${fichero.nombre ? ` (${fichero.nombre})` : ''}`
            + (delAgente ? '. PENDIENTE DE REVISIÓN por BROKERGY.' : ` para ${humano || 'el técnico asignado'}.`);
        if (negocio === 'cee') {
            await require('./ceeDirectoService').anotarHistorial(fila.id, {
                tipo: 'CERTIFICADOR', usuario: NOMBRE, texto: texto.toUpperCase() });
        } else {
            const entradas = [{ id: `${Date.now()}_agente_ia_fin`, tipo: 'notificacion_tecnica', usuario: NOMBRE,
                                fecha: ahora, texto }];
            if (fila._estadoNuevo && fila._estadoNuevo !== fila.estado) {
                entradas.push({ id: `${Date.now()}_status`, estado: fila._estadoNuevo, fecha: ahora, usuario: NOMBRE });
            }
            await anotarCae(fila.id, entradas);
        }
    }
    if (fichero.link) enlaces.fichero = fichero.link;
    // La carpeta LOCAL del CEE (espejo de Drive del PC): es donde se abre el .cex
    // en CE3X y donde se dejan el .xml y el .pdf exportados.
    if (enlaces.carpeta) {
        enlaces.local = enlaceCarpetaLocal({ id: fila.id, carpeta: enlaces.carpeta, origen: negocio }) || undefined;
    }

    const lista = Array.isArray(pendientes) && pendientes.length
        ? pendientes : pendientesPorDefecto(fase, { delAgente: negocio !== 'op' && delAgente });
    const msg = componerAviso({ numero, cliente, faseLabel, fichero: fichero.nombre || null, enlaces,
                                pendientes: lista, avisos, delAgente: negocio === 'op' ? true : delAgente,
                                tecnicoHumano: humano, reenvio });

    const canales = [];
    const fallos = [];
    if (aviso) {
        try {
            await require('./whatsappService').sendText(adminPhone(), msg.whatsapp);
            canales.push('WhatsApp');
        } catch (e) { fallos.push(`WhatsApp: ${e.message}`); }
        try {
            const emailService = require('./emailService');
            await emailService.sendMail({
                to: adminEmail(),
                // Buzón SECUNDARIO, como el resto de avisos internos: no gasta la
                // cuota del buzón con el que se escribe a clientes.
                from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
                subject: msg.asunto, html: msg.html, text: msg.text,
            });
            canales.push('Email');
        } catch (e) { fallos.push(`Email: ${e.message}`); }
    }
    return { ok: true, negocio, numero, delAgente, humano, reenvio, cambios, canales, fallos,
             aviso: aviso ? msg : null };
}

/** Recoloca la carpeta de Drive según el estado (03 ACEPTADO → 04 EN CURSO…). Nunca lanza. */
async function moverCarpeta(id) {
    try {
        const { syncExpedienteFolder } = require('./expedienteFolderSync');
        await syncExpedienteFolder(id, { motivo: 'agente IA' });
    } catch (e) { console.warn(`[AgenteIA] carpeta ${id}: ${e.message}`); }
}

// ─── La cola: lo que tiene encargado el agente y aún no ha terminado ─────────

const FUERA = ['FINALIZADO', 'RECHAZADO'];

/**
 * Lo encargado al agente que NO está terminado (encargado o en trabajo), y lo
 * que dejó hecho y espera revisión. Es la respuesta a «¿qué tiene pendiente el
 * Agente IA?» y a «¿está hecho el CEE de X?».
 */
async function cola() {
    const ag = await agente();
    if (!ag) return [];
    const id = String(ag.id_empresa);
    const [cae, cee] = await Promise.all([
        supabase.from('expedientes')
            .select('id, numero_expediente, estado, seguimiento, agente_ia:cee->agente_ia, clientes!cliente_id(nombre_razon_social, apellidos)')
            .eq('cee->>certificador_id', id)
            .not('estado', 'in', `(${FUERA.map(s => `"${s}"`).join(',')})`),
        supabase.from('cee_directos')
            .select('id, numero_expediente, estado, alcance, seguimiento, agente_ia:cee->agente_ia, cliente_id')
            .eq('cee->>certificador_id', id)
            .neq('estado', 'FINALIZADO'),
    ]);
    if (cae.error) throw new Error(cae.error.message);
    if (cee.error) throw new Error(cee.error.message);

    const out = [];
    const recorrer = (filas, negocio) => {
        for (const f of filas || []) {
            const fases = negocio === 'cee' && !esDoble(f) ? ['inicial'] : ['inicial', 'final'];
            for (const fase of fases) {
                const key = claveFase(fase);
                const sub = String(f.seguimiento?.[key] || '').toUpperCase() || null;
                const sello = f.agente_ia?.[fase] || null;
                let situacion = null;
                if (rankSubestado(sub) < rankSubestado('PRESENTADO')) {
                    // La final no se le encarga hasta que el inicial está registrado:
                    // una fase final «sin empezar» de un inicial vivo no es trabajo aún.
                    if (fase === 'final' && !sello && String(f.seguimiento?.cee_inicial || '').toUpperCase() !== 'REGISTRADO') continue;
                    situacion = sello?.estado === 'trabajando' || sub === 'EN_TRABAJO' ? 'en trabajo' : 'encargado, sin empezar';
                } else if (['PRESENTADO', 'PTE_REVISION'].includes(sub) && sello?.estado === 'terminado') {
                    situacion = 'terminado · pendiente de revisar';
                } else continue;
                out.push({
                    negocio, id: f.id, numero: f.numero_expediente, estado: f.estado,
                    cliente: nombreCliente(f.clientes), fase, subestado: sub, situacion,
                    desde: f.seguimiento?.[`${key}_desde`] || sello?.empezado_at || null,
                    fichero: sello?.fichero || null,
                });
            }
        }
    };
    recorrer(cae.data, 'cae');
    // Los clientes de un CEE directo, en una consulta.
    const cliIds = [...new Set((cee.data || []).map(f => f.cliente_id).filter(Boolean))];
    if (cliIds.length) {
        const { data: clis } = await supabase.from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos').in('id_cliente', cliIds);
        const porId = new Map((clis || []).map(c => [String(c.id_cliente), c]));
        for (const f of cee.data || []) f.clientes = porId.get(String(f.cliente_id)) || null;
    }
    recorrer(cee.data, 'cee');
    const orden = { 'en trabajo': 0, 'encargado, sin empezar': 1, 'terminado · pendiente de revisar': 2 };
    return out.sort((a, b) => (orden[a.situacion] - orden[b.situacion])
        || String(a.desde || '').localeCompare(String(b.desde || '')));
}

module.exports = {
    NOMBRE, esAgenteIa, agente, cola, empezar, terminar, anotarOportunidad,
    // puros (pruebas)
    decidirCertificador, siguienteSubestado, estadoGlobalDe, pendientesPorDefecto, componerAviso, normFase,
};
