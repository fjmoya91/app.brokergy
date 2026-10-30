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
//   · El agente NO FIRMA ni figura en la barra (26/10/2026): el certificador es
//     el de la CASA (Fran, `utils/certificadorCasa`), que firma al dar el visto
//     bueno. Encargárselo al agente es su sello `cee.agente_ia[fase]`
//     (`encargado` → `trabajando` → `terminado`), no el `certificador_id`.
//   · Solo mueve la fase si el encargo es de la CASA (o no hay nadie). Si hay un
//     técnico de fuera asignado, el agente le prepara el borrador, avisa y no
//     toca ni el técnico ni la fase (salvo que se pida `reasignar`).
//   · Nunca hacia atrás: no rebaja una fase ya entregada, revisada o registrada.
//   · El aviso va al equipo (WhatsApp + email), como el de un técnico que sube
//     su .cex. Un fallo del aviso NUNCA deshace el trabajo: se devuelve dicho.
// ============================================================================

const supabase = require('./supabaseClient');
const { applyStatus } = require('./seguimientoTracking');
const { avanzarEstado } = require('../utils/expedienteEstados');
const { rankSubestado, esDoble, nombreFase } = require('../utils/ceeDirectoEstados');
const { enlaceCarpetaLocal } = require('../utils/carpetaLocalEnlace');
const { certificadorCasaId, esCertificadorCasa } = require('../utils/certificadorCasa');

const NOMBRE = 'AGENTE IA';
const FRONT = () => String(process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/+$/, '');
//: La app de certificadores (origen `ext`): su admin es donde se ENTREGA la obra.
const CERTAPP = () => String(process.env.CERTAPP_URL || 'https://cee.brokergy.es').trim().replace(/\/+$/, '');
const encendido = (n) => String(process.env[n] || '').trim().toLowerCase() === 'true';
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
 * ¿Quién queda como certificador, y mueve el agente la fase?
 *
 * Desde el 26/10/2026 el agente NO figura en la barra: el certificador es el de
 * la CASA (Fran, `utils/certificadorCasa`) y el encargo del agente vive en su
 * sello `cee.agente_ia[fase]`. `delAgente` = el encargo es de la casa, así que
 * el agente mueve la fase (EN_TRABAJO → PTE_REVISION).
 *  · Sin técnico → se le pone el de la casa.
 *  · El agente en la barra (lo de antes) → pasa al de la casa.
 *  · Ya es el de la casa → se queda.
 *  · Un técnico de verdad → NO se toca: el agente le prepara el borrador. Solo
 *    con `reasignar` (lo ha pedido una persona) pasa al de la casa.
 * `asignarId` es lo que se escribe cuando `asignar`.
 */
function decidirCertificador(actualId, agenteId, { reasignar = false, casaId = certificadorCasaId() } = {}) {
    const actual = actualId ? String(actualId) : null;
    const ag = agenteId ? String(agenteId) : null;
    const casa = casaId ? String(casaId) : null;
    if (!ag) return { asignar: false, delAgente: false, humano: actual, sinAgente: true };
    if (!actual) return { asignar: true, asignarId: casa, delAgente: true, humano: null };
    if (actual === ag) return { asignar: true, asignarId: casa, delAgente: true, humano: null, anterior: actual };
    if (actual === casa) return { asignar: false, delAgente: true, humano: null };
    if (reasignar) return { asignar: true, asignarId: casa, delAgente: true, humano: null, anterior: actual };
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

/**
 * Lo que queda por hacer tras el borrador del agente, por fase. Ya no lleva
 * «asigna el técnico que lo firma»: el encargo del agente es de la casa, y el
 * de la casa firma al dar el visto bueno.
 */
function pendientesPorDefecto(fase) {
    const f = normFase(fase);
    const lista = f === 'final'
        ? ['Abrirlo en CE3X y CALIFICAR: tiene que dar lo que dijo el análisis de la skill',
           'Comprobar que la demanda de ACS es la misma que la del CEE inicial',
           'Medidas de mejora → «Actualizar» (la medida va sin calcular)',
           'Exportar el .xml y el .pdf y subirlos al CEE final como «– CEE FINAL»']
        : ['Revisar el CROQUIS (PDF junto al .cex): en ÁMBAR lo que está POR CONFIRMAR. Se corrige en la ventana de la envolvente de la app, no en CE3X',
           'Medidas de mejora → «Actualizar» (la medida va sin calcular)',
           'Exportar el .xml y el .pdf y subirlos al CEE inicial como «– CEE INICIAL»'];
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
                        avisosCortos, masAvisos, delAgente, tecnicoHumano, reenvio, externo = null }) {
    const {
        brandEmailShell, emailP, emailBox, emailButton, emailOutlineButton, emailDataTable, BRAND, FONT,
    } = require('./emailService');
    const MONO = "font-family:Consolas,'Courier New',monospace;";

    const pill = externo
        ? { emoji: '🤖', text: externo.entregado ? 'Agente IA · entregado al certificador' : 'Agente IA · app de certificadores',
            bg: BRAND.orangeTint, color: BRAND.orangeDark }
        : !delAgente
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
    ) + emailP(externo
        ? `Es una obra de la <strong>app de certificadores</strong>, del certificador <strong>${escapar(externo.certificador || 'externo')}</strong>: `
          + 'lo firma él y el titular es cliente suyo. '
          + (externo.entregado ? 'Se le ha <strong>entregado sola</strong>.'
              : externo.porCalificar ? 'Aún <strong>no está calificado con CE3X</strong> (falta el .xml y el PDF): se califica en el PC y después se entrega desde el admin de la app.'
              : 'Revísalo y <strong>entrégaselo desde el admin</strong> de la app.')
        : delAgente
        ? 'Queda <strong>pendiente de tu revisión</strong>: va a tu nombre, así que lo firmas tú al darle el visto bueno.'
        : `El certificador asignado sigue siendo <strong>${escapar(tecnicoHumano || 'otro técnico')}</strong>: el expediente no cambia de fase. El borrador es para él.`,
    { color: BRAND.muted, mb: 22 });

    // La ficha del borrador: de quién es, en qué queda y qué fichero dejó.
    const estado = externo
        ? (externo.entregado ? 'Entregado al certificador'
            : `<span style="color:${BRAND.orangeDark};">${externo.porCalificar ? 'Pendiente de calificar (PC)' : 'Pendiente de entregar'}</span>`)
        : delAgente
        ? `<span style="color:${BRAND.orangeDark};">Pendiente de revisión</span>`
        : `Sigue con ${escapar(tecnicoHumano || 'el técnico asignado')}`;
    const ficha = emailBox(
        emailP('📄 Borrador generado', { size: 11, bold: true, color: BRAND.muted, mb: 12,
                                         css: 'letter-spacing:0.06em;text-transform:uppercase;' })
        + emailDataTable([
            ['Expediente', escapar(numero)],
            cliente ? ['Cliente', escapar(cliente)] : null,
            ['Fase', escapar(faseLabel)],
            externo ? ['Certificador', escapar(externo.certificador || 'externo')] : null,
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
        enlaces.croquis && ['📐', 'Croquis del borrador (PDF)', 'Plano de obra por planta, a escala, con cotas, huecos y cuadros de superficies', enlaces.croquis],
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
                : filaBoton(emailButton(attr(enlaces.app), externo ? '🔗 Abrir en el admin de la app' : '🔗 Abrir en la app', BRAND.orange), 0)
        }</table>`
        : '';

    const preheader = `El Agente IA ha dejado el borrador del ${faseLabel} de ${numero}${cliente ? ` (${cliente})` : ''}`
        + (externo ? ` · app de certificadores${externo.entregado ? ' · entregado'
            : externo.porCalificar ? ' · pendiente de calificar' : ' · pendiente de entregar'}.`
            : delAgente ? ' · pendiente de revisión.' : ` para ${tecnicoHumano || 'el técnico asignado'}.`);

    return brandEmailShell({
        preheader,
        title: externo ? `${faseLabel} ${externo.porCalificar ? 'por calificar en el PC' : 'listo para entregar'}` : delAgente ? `${faseLabel} listo para revisar` : `Borrador del ${faseLabel} listo`,
        pill,
        contentHtml: reenvioHtml + intro + ficha + pasos + avisosHtml + botones + accesosHtml,
        footerNote: 'Aviso interno del Agente IA · se envía al terminar un borrador de CEE.',
        firma: false,
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
                         reenvio = false, externo = null }) {
    const avisosCortos = avisos.slice(0, 4).map(a => recortar(a));
    const masAvisos = avisos.length > 4 ? avisos.length - 4 : 0;
    const clienteTxt = cliente ? ` del cliente *${cliente}*` : '';
    const lineasPend = pendientes.map(p => `• ${p}`).join('\n');
    const lineasAv = avisosCortos.map(a => `⚠ ${a}`).join('\n')
        + (masAvisos ? `\n⚠ … y ${masAvisos} aviso${masAvisos === 1 ? '' : 's'} más (en el resumen de la skill)` : '');
    const fase = `*${faseLabel}*`;
    // `externo`: la OBRA de un certificador de la app de certificadores (origen
    // `ext`). No es un cliente nuestro ni hay fase que mover: se entrega en su admin.
    const nota = externo
        ? `Es una obra de la *APP DE CERTIFICADORES*, del certificador *${externo.certificador || 'externo'}* (lo firma él). `
          + (externo.entregado ? 'Se le ha *ENTREGADO* sola.'
              : externo.porCalificar ? 'Aún *NO está calificado con CE3X* (falta el .xml y el PDF): se califica en el PC y después se entrega desde el admin.'
              : `Queda *PENDIENTE DE ENTREGAR* desde el admin${externo.motivoEntrega ? ` (la entrega automática ha fallado: ${externo.motivoEntrega})` : ''}.`)
        : delAgente
        ? `Queda *PENDIENTE DE REVISIÓN*${reenvio ? ' (ya lo estaba: es una versión nueva)' : ''}.`
        : `El certificador asignado sigue siendo *${tecnicoHumano || 'otro técnico'}*: el expediente no cambia de fase.`;

    const whatsapp =
`🤖 *${faseLabel} LISTO · AGENTE IA*${externo ? ' · *APP DE CERTIFICADORES*' : ''}${reenvio ? ' *(actualizado)*' : ''}

El *Agente IA* ha terminado el borrador del ${fase} de *${numero}*${clienteTxt}.
${nota}
${fichero ? `\n📄 ${fichero}\n` : ''}
*Queda por hacer:*
${lineasPend}
${lineasAv ? `\n${lineasAv}\n` : ''}
${enlaces.croquis ? `📐 Croquis (PDF): ${enlaces.croquis}\n` : ''}${enlaces.local ? `📂 Carpeta local (PC): ${enlaces.local}\n` : ''}${enlaces.app ? `🔗 ${externo ? 'Entregar (admin de la app)' : 'Ver'}: ${enlaces.app}\n` : ''}${enlaces.carpeta ? `📁 Carpeta en Drive: ${enlaces.carpeta}\n` : ''}${enlaces.envolvente ? `🧱 Envolvente: ${enlaces.envolvente}\n` : ''}
*BROKERGY · Ingeniería Energética*`;

    const html = componerHtml({ numero, cliente, faseLabel, fichero, enlaces, pendientes,
                                avisosCortos, masAvisos, delAgente, tecnicoHumano, reenvio, externo });

    const asunto = `🤖 ${faseLabel} listo (Agente IA${externo ? ' · app de certificadores' : ''}) — ${numero}${cliente ? ` · ${cliente}` : ''}${reenvio ? ' · actualizado' : ''}`;
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

//: La tabla de cada negocio sale del MAPA de orígenes (`ceeEnvolventeCex`), no
//: se escribe a mano (lo vigila scripts/test_origen_ext.mjs). Diferido: ese
//: módulo es grande y no hace falta para componer un aviso.
const tablaDe = (negocio) => require('./ceeEnvolventeCex').ORIGENES[negocio].tabla;

async function cargarCee(clave) {
    const { data, error } = await supabase.from(tablaDe('cee'))
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

/**
 * La OBRA de un certificador externo (app de certificadores, origen `ext`):
 * un CEE suelto de alcance ÚNICO cuyo certificador es de FUERA. El agente le
 * prepara el borrador, pero ni se pone de certificador ni mueve fases: la obra
 * la entrega la app (`services/certapp/entrega`). La tabla, por el mapa.
 */
async function cargarExt(clave) {
    const m = require('./ceeEnvolventeCex').ORIGENES.ext;
    const { data, error } = await supabase.from(m.tabla)
        .select('id, numero_expediente, estado, cuenta_id, nombre, drive_folder_link, '
                + 'tit_nombre:titular->>nombre, tit_apellidos:titular->>apellidos, agente_ia:cee->agente_ia')
        .eq(esUuid(clave) ? 'id' : m.clave, clave).maybeSingle();
    if (error) throw Object.assign(new Error(`No se puede leer la obra ${clave}: ${error.message}`), { status: 503 });
    if (!data) return null;
    data.clientes = { nombre_razon_social: data.tit_nombre || data.nombre || null, apellidos: data.tit_apellidos || null };
    data.cuenta = null;
    if (data.cuenta_id) {
        const { data: c } = await supabase.from('certapp_cuentas')
            .select('id, email, nombre, apellidos, empresa').eq('id', data.cuenta_id).maybeSingle();
        data.cuenta = c || null;
    }
    return data;
}

/** El certificador externo de una obra, para los avisos: «Nombre Apellidos (email)». */
const nombreCuenta = (c) => {
    if (!c) return null;
    const n = [c.nombre, c.apellidos].filter(Boolean).join(' ').trim();
    return [n || null, c.empresa ? `· ${c.empresa}` : null, c.email ? `(${c.email})` : null].filter(Boolean).join(' ') || null;
};

/**
 * Escribe UNA clave de `cee` (reemplaza, no funde). La MISMA función que la
 * envolvente (`setCeeField`): la tabla y la RPC las dice el mapa de orígenes.
 */
async function setCee(negocio, id, campo, valor) {
    const cex = require('./ceeEnvolventeCex');
    try {
        await cex.setCeeField(cex.expedienteStub(negocio, id), campo, valor);
    } catch (e) {
        throw Object.assign(new Error(`No se ha podido guardar cee.${campo}: ${e.message}`), { status: e.status, code: e.code });
    }
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
    if (negocio === 'ext') {
        // «Ver» lleva al ADMIN de la app de certificadores, que es donde se entrega.
        return { app: `${CERTAPP()}/admin/obras/${fila.id}`, envolvente: `${FRONT()}/envolvente/${fila.id}?origen=ext`,
                 carpeta: fila.drive_folder_link || null };
    }
    return { app: `${FRONT()}/?exp=${fila.id}`, envolvente: `${FRONT()}/envolvente/${fila.id}`,
             carpeta: fila.cee_folder_link || null };
}

function registradaCae(fila, fase) {
    const k = claveFase(fase);
    return !!(normFase(fase) === 'final' ? fila.reg_fin : fila.reg_ini)
        || !!fila.seguimiento?.[`${k}_ts`]?.REGISTRADO;
}

/** El sello `cee.agente_ia[fase]` al TERMINAR: el mismo en todos los negocios. */
function selloTerminado(prevSello, { delAgente, ahora, fichero = {}, avisos = [], decisiones = null }) {
    return {
        ...prevSello, estado: 'terminado', delAgente,
        empezado_at: prevSello.empezado_at || null,
        terminado_at: ahora,
        // Lo que se esperaba del propietario ya no se espera: el CEE está hecho.
        esperando: null,
        // Y si se le había pedido REHACERLO (alguien corrigió el plano a mano y
        // pulsó «Así es como está»), queda hecho: la cola deja de pedirlo.
        ...(prevSello.rehacer && !prevSello.rehacer.hecho_at
            ? { rehacer: { ...prevSello.rehacer, hecho_at: ahora } } : {}),
        fichero: fichero.nombre || prevSello.fichero || null,
        fichero_link: fichero.link || prevSello.fichero_link || null,
        carpeta_link: fichero.carpeta_link || prevSello.carpeta_link || null,
        croquis_link: fichero.croquis_link || prevSello.croquis_link || null,
        // Los AVISOS del borrador, para que la ventana de la envolvente los
        // enseñe: el WhatsApp los corta a cuatro y aquí es donde se revisan.
        // Solo texto y con tope (regla 21).
        avisos: (avisos || []).slice(0, 20).map(a => recortar(a, 300)),
        // CÓMO lo ha hecho: el porqué que no se ve en el plano (del plan) y
        // el resumen de lo escrito. Un `terminar` a mano no las trae: se
        // conservan las de la pasada anterior.
        decisiones: Array.isArray(decisiones)
            ? decisiones.slice(0, 30).map(d => recortar(d, 300))
            : (prevSello.decisiones || []),
    };
}

// ─── La OBRA de un certificador externo (origen `ext`) ───────────────────────
//
// Un CEE suelto de alcance ÚNICO cuyo certificador es de FUERA (app de
// certificadores). El agente le prepara el certificado y deja su sello, pero:
//   · NO se pone de certificador (lo firma el externo) y NO mueve fases: la obra
//     la ENTREGA la app (`services/certapp/entrega`);
//   · ni `ceeDirectoService` ni historial del CRM: su rastro son los eventos de
//     la obra (`certapp_eventos`, IA_HECHA);
//   · al terminar se llama a `alTerminarIa` de la app, que con
//     CERTAPP_ENTREGA_AUTO=true la entrega sola y, si no, manda al equipo su
//     WhatsApp corto «revísalo y pulsa Entregar» — ese WhatsApp no se repite
//     aquí; el email con el detalle (avisos, croquis, enlaces) va siempre;
//   · REGLA — sin calificar (el servidor no tiene CE3X) NO se avisa a nadie: se
//     encarga al PC en silencio (`asistenteCanal.encargarCalificarExt` → cola del
//     PC → `cee_inicial.js calificar`), y el PC, al acabar, llama a producción
//     (`POST /api/certapp-admin/interno/calificada`), que vuelve aquí con
//     `calificada: true`. Así Fran recibe UN aviso, el de «listo para revisar»
//     (25/10/2026: «no quiero que me vaya actualizando el proceso»). Si el PC no
//     se puede encargar, se avisa como antes de que falta calificarlo;
//   · fuera de la cola del agente (`cola`) y del radar del parte: su cola es el
//     admin de la app.

/** Lo que queda tras el borrador de una obra externa. */
function pendientesExt({ entregado = false, porCalificar = false } = {}) {
    if (porCalificar) {
        return ['CALIFICARLO en el PC con CE3X 3.2 (node scripts/cee_inicial.js calificar --cola --escribir): sin el .xml y el PDF no se entrega',
                'Revisar el CROQUIS y lo que está en ÁMBAR (por confirmar) en la ventana de la envolvente',
                'Después, entregarlo al certificador desde el admin de la app («Entregar»)'];
    }
    return entregado
        ? ['Ya está ENTREGADO: el certificador lo revisa en la app y lo valida, o lo corrige en la envolvente (se vuelve a generar)',
           'Mirar los avisos del borrador por si hay que decirle algo al certificador']
        : ['Revisar el CROQUIS y lo que está en ÁMBAR (por confirmar) en la ventana de la envolvente',
           'Comprobar el .cex, el .xml y el PDF de «1. CEE» (calificación y avisos)',
           'Entregarlo al certificador desde el admin de la app («Entregar»)'];
}

async function empezarExt({ clave, fase }) {
    if (normFase(fase) === 'final') throw new Error('Una obra de la app de certificadores es de UN solo certificado: no tiene fase final.');
    const fila = await cargarExt(clave);
    if (!fila) throw new Error(`No encuentro la obra ${clave}.`);
    const ahora = new Date().toISOString();
    const prev = fila.agente_ia?.inicial || {};
    const sello = { ...(fila.agente_ia || {}),
                    inicial: { ...prev, estado: 'trabajando', delAgente: false,
                               empezado_at: prev.estado === 'trabajando' ? prev.empezado_at || ahora : ahora } };
    await setCee('ext', fila.id, 'agente_ia', sello);
    return { ok: true, negocio: 'ext', numero: fila.numero_expediente, delAgente: false, humano: nombreCuenta(fila.cuenta),
             cambios: [],
             nota: 'Es la OBRA de un certificador externo (app de certificadores): el agente le prepara el certificado, '
                 + 'no se pone de certificador ni mueve fases. La entrega la hace la app.' };
}

/** El interruptor de los avisos de la app de certificadores; si no se puede leer, APAGADO. */
function avisosCertappActivos() {
    try { return !!require('./certapp/avisos').activos(); }
    catch (e) {
        console.warn('[agenteIa] interruptor de avisos de la app de certificadores:', e.message);
        return false;
    }
}

async function terminarExt({ clave, fase, fichero = {}, pendientes = null, avisos = [], decisiones = null,
                             aviso = true, entregable = true, calificada = false }) {
    if (normFase(fase) === 'final') throw new Error('Una obra de la app de certificadores es de UN solo certificado: no tiene fase final.');
    const ahora = new Date().toISOString();
    const fila = await cargarExt(clave);
    if (!fila) throw new Error(`No encuentro la obra ${clave}.`);
    const numero = fila.numero_expediente;
    const cliente = nombreCliente(fila.clientes);
    const certificador = nombreCuenta(fila.cuenta);
    const faseLabel = 'CEE';
    const enlaces = { ...enlacesDe('ext', fila) };
    const prevSello = fila.agente_ia?.inicial || {};
    if (fichero.carpeta_link || prevSello.carpeta_link) enlaces.carpeta = fichero.carpeta_link || prevSello.carpeta_link;
    // Tras calificar en el PC, los avisos del borrador son los de la pasada del agente.
    if (calificada && !(avisos || []).length) avisos = prevSello.avisos || [];
    // Una pasada que se quedó «por calificar» no cuenta como versión entregada.
    const reenvio = prevSello.estado === 'terminado' && !prevSello.por_calificar;
    const sello = { ...(fila.agente_ia || {}),
                    inicial: { ...selloTerminado(prevSello, { delAgente: false, ahora, fichero, avisos, decisiones }),
                               por_calificar: !entregable } };
    await setCee('ext', fila.id, 'agente_ia', sello);

    const fallos = [];
    // Sin calificar: al PC, en silencio (ver la REGLA de arriba). Ni evento (el
    // certificador aún no tiene nada que ver) ni WhatsApp ni email.
    if (aviso && !entregable) {
        const pc = await require('./asistenteCanal').encargarCalificarExt({ numero, obraId: fila.id });
        if (pc.ok) {
            return { ok: true, negocio: 'ext', numero, delAgente: false, humano: certificador, reenvio, cambios: [],
                     canales: [`ninguno: calificación encargada al PC${pc.duplicado ? ' (ya estaba en cola)' : ''}`],
                     fallos, entrega: null, aviso: null, pc };
        }
        fallos.push(`No se ha podido encargar la calificación al PC: ${pc.motivo}`);
    }
    // El rastro de la obra en la app. Sin enlaces de Drive: los eventos los puede
    // ver el certificador, y los enlaces de Drive son solo del equipo.
    if (entregable) {
        try {
            const { error } = await supabase.from('certapp_eventos').insert({
                obra_id: fila.id, cuenta_id: fila.cuenta_id || null, tipo: 'IA_HECHA', por: 'IA',
                texto: `La IA ha dejado el certificado${fichero.nombre ? ` (${fichero.nombre})` : ''} en «1. CEE»`
                    + (reenvio ? ' · versión nueva' : '') + '.',
                datos: { fase: 'inicial', reenvio, fichero: sello.inicial.fichero || null, avisos: (avisos || []).length },
            });
            if (error) fallos.push(`Evento IA_HECHA: ${error.message}`);
        } catch (e) { fallos.push(`Evento IA_HECHA: ${e.message}`); }
    }

    // La app decide: con CERTAPP_ENTREGA_AUTO=true entrega sola (y avisa ELLA al
    // certificador); si no, avisa al equipo. `aviso: false` (relanzar en la misma
    // sesión) no entrega ni avisa. Nunca deshace el trabajo.
    // `entregable: false` = el `.cex` aún no lo ha calificado CE3X (sin .xml ni
    // PDF) y el PC no se ha podido encargar: no se llama a la app —entregaría un
    // certificado a medias— y el aviso al equipo lo manda este servicio, diciendo
    // que falta calificarlo.
    let entrega = null;
    if (aviso && entregable) {
        try {
            const r = await require('./certapp/entrega').alTerminarIa(fila.id);
            entrega = { auto: !!r?.auto, ok: r?.auto ? r.ok !== false : null, motivo: r?.error || null,
                        porVistoBueno: !!r?.porVistoBueno };
            if (entrega.auto && !entrega.ok) fallos.push(`Entrega automática: ${entrega.motivo || 'falló'}`);
        } catch (e) {
            entrega = { auto: null, ok: false, motivo: e.message };
            fallos.push(`Entrega: ${e.message}`);
        }
    }
    const externo = { certificador, entregado: !!(entrega?.auto && entrega.ok), porCalificar: !entregable,
                      motivoEntrega: entrega?.auto && !entrega.ok ? entrega.motivo : null };

    if (fichero.link) enlaces.fichero = fichero.link;
    if (fichero.croquis_link) enlaces.croquis = fichero.croquis_link;
    const lista = Array.isArray(pendientes) && pendientes.length ? pendientes
        : pendientesExt(externo);
    const msg = componerAviso({ numero, cliente, faseLabel, fichero: fichero.nombre || null, enlaces,
                                pendientes: lista, avisos, delAgente: false, tecnicoHumano: certificador,
                                reenvio, externo });
    const canales = [];
    // REGLA — nada sale a terceros desde local: lo de la app de certificadores va
    // con CERTAPP_AVISOS_ENABLED, el MISMO interruptor que `certapp/avisos.js`
    // (`activos()`). Apagado, el aviso se escribe en el log y no sale nada.
    if (aviso && !avisosCertappActivos()) {
        console.log(`[certapp seco] equipo — ${msg.asunto}\n${String(msg.text || '').slice(0, 1500)}`);
        canales.push('ninguno: CERTAPP_AVISOS_ENABLED apagado (en el log)');
    } else if (aviso) {
        // `alTerminarIa` sin entrega automática ya le ha mandado al equipo su WhatsApp.
        // Entregado con el visto bueno que dio el equipo: ya lo sabe; queda el email.
        if (entrega?.porVistoBueno && entrega.ok) {
            canales.push('WhatsApp: no (entregado con el visto bueno de BROKERGY)');
        } else if (entrega?.auto !== false) {
            try {
                await require('./whatsappService').sendText(adminPhone(), msg.whatsapp);
                canales.push('WhatsApp');
            } catch (e) { fallos.push(`WhatsApp: ${e.message}`); }
        } else {
            canales.push('WhatsApp (el de la app)');
        }
        try {
            const emailService = require('./emailService');
            await emailService.sendMail({
                to: adminEmail(),
                from: process.env.ALERT_EMAIL_FROM || emailService.getFallbackSender() || undefined,
                subject: msg.asunto, html: msg.html, text: msg.text,
            });
            canales.push('Email');
        } catch (e) { fallos.push(`Email: ${e.message}`); }
    }
    return { ok: true, negocio: 'ext', numero, delAgente: false, humano: certificador, reenvio, cambios: [],
             canales, fallos, entrega, aviso: aviso ? msg : null };
}

async function esperarExt({ clave, fase, que }) {
    if (normFase(fase) === 'final') throw new Error('Una obra de la app de certificadores no tiene fase final.');
    const fila = await cargarExt(clave);
    if (!fila) throw new Error(`No encuentro la obra ${clave}.`);
    const sello = { ...(fila.agente_ia || {}) };
    sello.inicial = { ...(sello.inicial || {}), esperando: { que, desde: new Date().toISOString() } };
    await setCee('ext', fila.id, 'agente_ia', sello);
    return { sellado: true };
}

// ─── Los dos pasos ───────────────────────────────────────────────────────────

/**
 * El agente EMPIEZA a trabajar en un CEE: pone al certificador de la CASA en la
 * barra (si no hay técnico, si estaba el agente o si se pide `reasignar`) y la
 * fase pasa a EN_TRABAJO. Idempotente: relanzarlo no cambia nada ni anota dos veces.
 *
 * @returns {{ ok, negocio, numero, delAgente, humano, cambios: string[] }}
 */
async function empezar({ negocio, clave, fase = 'inicial', reasignar = false }) {
    if (negocio === 'ext') return empezarExt({ clave, fase });
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
        await setCee(negocio, fila.id, 'certificador_id', dec.asignarId);
        const casa = await nombreTecnico(dec.asignarId) || 'el de la casa';
        cambios.push(dec.anterior ? `certificador: ${await nombreTecnico(dec.anterior) || 'anterior'} → ${casa}`
                                  : `certificador: sin asignar → ${casa}`);
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
 * @param {'cae'|'cee'|'op'|'ext'} p.negocio
 * @param {string} p.clave   nº o uuid
 * @param {'inicial'|'final'} [p.fase]
 * @param {{nombre?, link?, carpeta_link?}} [p.fichero]  lo que devolvió `guardarEnDrive`
 * @param {string[]} [p.pendientes]  qué queda (por defecto, el de la fase)
 * @param {string[]} [p.avisos]      avisos de la skill (se resumen en el aviso)
 * @param {string[]} [p.decisiones]  cómo se ha hecho (se guardan en el sello)
 * @param {boolean} [p.aviso=true]
 */
async function terminar({ negocio, clave, fase = 'inicial', fichero = {}, pendientes = null,
                          avisos = [], decisiones = null, aviso = true, entregable = true }) {
    if (negocio === 'ext') return terminarExt({ clave, fase, fichero, pendientes, avisos, decisiones, aviso, entregable });
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

        // Si nadie lo había marcado al empezar y no hay técnico (o estaba el
        // agente), el encargo es de la casa: `decidir` sin reasignar nunca le
        // quita el expediente a un técnico.
        const dec = decidirCertificador(fila.cert, ag.id_empresa);
        delAgente = dec.delAgente;
        if (dec.asignar) {
            await setCee(negocio, fila.id, 'certificador_id', dec.asignarId);
            cambios.push(`certificador: ${dec.anterior ? NOMBRE : 'sin asignar'} → ${await nombreTecnico(dec.asignarId) || 'el de la casa'}`);
        }
        if (!delAgente) humano = await nombreTecnico(dec.humano);

        const prevSello = fila.agente_ia?.[fase] || {};
        reenvio = prevSello.estado === 'terminado';
        const sello = { ...(fila.agente_ia || {}) };
        sello[fase] = selloTerminado(prevSello, { delAgente, ahora, fichero, avisos, decisiones });
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
    if (fichero.croquis_link) enlaces.croquis = fichero.croquis_link;
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
 * ¿Es esta fase un encargo del agente? Con el agente en la barra (lo de antes
 * del 26/10/2026), todas; con el de la CASA, solo las que tienen su sello
 * (`encargado`, `trabajando` o `terminado`). Lo usan la cola y el radar.
 */
const SELLO_ENCARGO = ['encargado', 'trabajando', 'terminado'];
function esEncargoDelAgente(certId, agenteId, sello) {
    if (agenteId && String(certId || '') === String(agenteId)) return true;
    return esCertificadorCasa(certId) && SELLO_ENCARGO.includes(sello?.estado);
}

/**
 * Lo encargado al agente que NO está terminado (encargado o en trabajo), y lo
 * que dejó hecho y espera revisión. Es la respuesta a «¿qué tiene pendiente el
 * Agente IA?» y a «¿está hecho el CEE de X?».
 */
async function cola() {
    const ag = await agente();
    if (!ag) return [];
    const id = String(ag.id_empresa);
    // El agente en la barra (lo de antes) o el de la casa: de éstos, solo las
    // fases con el sello del agente (`esEncargoDelAgente`).
    const certs = [id, certificadorCasaId()];
    const [cae, cee] = await Promise.all([
        supabase.from('expedientes')
            .select('id, numero_expediente, estado, seguimiento, cert:cee->>certificador_id, agente_ia:cee->agente_ia, clientes!cliente_id(nombre_razon_social, apellidos)')
            .in('cee->>certificador_id', certs)
            .not('estado', 'in', `(${FUERA.map(s => `"${s}"`).join(',')})`),
        supabase.from(tablaDe('cee'))
            .select('id, numero_expediente, estado, alcance, seguimiento, cert:cee->>certificador_id, agente_ia:cee->agente_ia, cliente_id')
            .in('cee->>certificador_id', certs)
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
                if (!esEncargoDelAgente(f.cert, id, sello)) continue;
                let situacion = null;
                // Corregido A MANO en la pizarra del plano («Así es como está»):
                // hay que rehacerlo, esté como esté — lo normal es que ya lo
                // hubiera entregado y esté esperando revisión.
                const rehacer = sello?.rehacer && !sello.rehacer.hecho_at && sub !== 'REGISTRADO';
                if (rehacer) {
                    situacion = `corregido a mano · REHACER${sello.rehacer.nota ? ` («${recortar(sello.rehacer.nota, 120)}»)` : ''}`;
                } else if (rankSubestado(sub) < rankSubestado('PRESENTADO')) {
                    // La final no se le encarga hasta que el inicial está registrado:
                    // una fase final «sin empezar» de un inicial vivo no es trabajo aún.
                    if (fase === 'final' && !sello && String(f.seguimiento?.cee_inicial || '').toUpperCase() !== 'REGISTRADO') continue;
                    situacion = sello?.esperando ? `esperando ${sello.esperando.que || 'material del propietario'}`
                        : sello?.estado === 'trabajando' || sub === 'EN_TRABAJO' ? 'en trabajo' : 'encargado, sin empezar';
                } else if (['PRESENTADO', 'PTE_REVISION'].includes(sub) && sello?.estado === 'terminado') {
                    situacion = 'terminado · pendiente de revisar';
                } else continue;
                out.push({
                    negocio, id: f.id, numero: f.numero_expediente, estado: f.estado,
                    cliente: nombreCliente(f.clientes), fase, subestado: sub, situacion,
                    desde: (rehacer ? sello.rehacer.at : null)
                        || sello?.esperando?.desde || f.seguimiento?.[`${key}_desde`] || sello?.empezado_at || null,
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
    // Lo corregido a mano va PRIMERO: alguien está esperando a que se rehaga.
    const rango = (x) => (String(x).startsWith('corregido a mano') ? -1 : (orden[x] ?? 0.5));   // «esperando …» va tras «en trabajo»
    return out.sort((a, b) => (rango(a.situacion) - rango(b.situacion))
        || String(a.desde || '').localeCompare(String(b.desde || '')));
}

/**
 * El CEE queda ESPERANDO algo del propietario —las fotos de las paredes que su
 * vídeo no dejaba resolver (`cee_inicial.js pedir-fotos`)—. Se sella en
 * `cee.agente_ia[fase].esperando = { que, desde }` y lo dice `cola()`: así
 * «¿está hecho el CEE de X?» tiene respuesta («esperando fotos desde el 6/10»)
 * en vez de parecer olvidado. Lo limpia `terminar`. Una OPORTUNIDAD no tiene
 * sello (no tiene certificador): ahí solo queda la línea del historial.
 */
async function esperar({ negocio, clave, fase = 'inicial', que }) {
    if (negocio === 'ext') return esperarExt({ clave, fase, que });
    fase = normFase(fase);
    const ahora = new Date().toISOString();
    if (negocio === 'op') {
        const fila = await cargarOp(clave);
        if (!fila) throw new Error(`No encuentro la oportunidad ${clave}.`);
        await anotarOportunidad(fila.id, `🤖 El Agente IA espera ${que} para terminar el CEE.`);
        return { sellado: false };
    }
    const fila = negocio === 'cee' ? await cargarCee(clave) : await cargarCae(clave);
    if (!fila) throw new Error(`No encuentro ${clave}.`);
    const sello = { ...(fila.agente_ia || {}) };
    sello[fase] = { ...(sello[fase] || {}), esperando: { que, desde: ahora } };
    await setCee(negocio, fila.id, 'agente_ia', sello);
    const texto = `🤖 El Agente IA espera ${que} para terminar el ${etiquetaFase(fase, negocio, fila)}.`;
    if (negocio === 'cee') {
        await require('./ceeDirectoService').anotarHistorial(fila.id, {
            tipo: 'CERTIFICADOR', usuario: NOMBRE, texto: texto.toUpperCase() });
    } else {
        await anotarCae(fila.id, [{ id: `${Date.now()}_agente_ia_espera`, tipo: 'notificacion_tecnica',
                                    usuario: NOMBRE, fecha: ahora, texto }]);
    }
    return { sellado: true };
}

module.exports = {
    NOMBRE, esAgenteIa, agente, cola, empezar, terminar, esperar, anotarOportunidad, esEncargoDelAgente,
    // POST /certapp-admin/interno/calificada la llama directa (con `calificada`, que `terminar` no pasa).
    // Sin exportarla, la ruta daba 500 y el «listo para revisar» no salía nunca (2026EXT_3, 25/10/2026).
    terminarExt,
    // puros (pruebas)
    decidirCertificador, siguienteSubestado, estadoGlobalDe, pendientesPorDefecto, pendientesExt, componerAviso, normFase,
};
