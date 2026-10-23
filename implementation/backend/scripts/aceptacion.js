// La REVISIÓN DE LA DOCUMENTACIÓN tras la aceptación (services/aceptacionAgente.js).
// La usa el Claude del WhatsApp cuando el servidor le encarga la revisión al aceptar
// el cliente, o cuando llega lo que se le pidió (por el enlace o por WhatsApp).
//
//   node scripts/aceptacion.js estado 26RES060_245
//        Lo que hay para el CEE inicial (el criterio del parte, `materialCee`, y lo
//        que falta mirando Drive), si ya hay un BORRADOR del CEE inicial, las notas
//        del alta, el técnico, a quién se le escribe (cliente e instalador) y las
//        rondas ya hechas. Solo lee.
//   node scripts/aceptacion.js pedir 26RES060_245 --texto "línea 1\nlínea 2" [--slots K1,K2] [--a instalador] [--enviar]
//        El WhatsApp con lo que falta: al cliente (o a su persona de contacto) o, con
//        `--a instalador`, al contacto COMERCIAL del instalador. EN SECO salvo --enviar.
//        `--texto`: una cosa por línea, en lenguaje de casa. `--slots`: los apartados a
//        los que lleva el enlace (sin él, el enlace de siempre).
//
// - `pedir --enviar` es lo ÚNICO que el agente manda a un tercero sin el «envíala» de
//   Fran (decisión suya, 22/10/2026), y por eso tiene topes: el expediente tiene que
//   estar ACEPTADO con el CEE inicial sin encargar, y una vez por ronda de revisión
//   (`aceptacion_agente.revision_at`), hasta MAX_RONDAS. `--otra-vez` salta lo de la
//   ronda, solo si Fran lo pide.
// - Fuera de 9 a 21 h (Madrid) no sale: se PROGRAMA y lo manda el servidor a las 9:00.
// - El saludo, el enlace y la firma los pone el script; el agente solo dice QUÉ falta.
// - Envía por el VPS (`/api/whatsapp/send-text` con la clave interna), como el resto
//   de scripts del asistente, y lo apunta en el historial del expediente.
const path = require('path');
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const docs = require('../services/reformaUploadService');
const agente = require('../services/aceptacionAgente');
const { materialCee } = require('../utils/materialCee');

const args = process.argv.slice(2);
const ORDEN = args[0];
const NUM = args[1];
const opt = (k) => { const i = args.indexOf(k); return i > 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const flag = (k) => args.includes(k);

const nombreSaludo = (s) => {
    const n = String(s || '').trim().split(/\s+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : 'hola';
};

async function cargar(numero) {
    if (!numero) throw new Error('Falta el número de expediente.');
    const { data: exp, error } = await supabase.from('expedientes')
        .select(`id, numero_expediente, estado, oportunidad_id, cliente_id, certificador_id:cee->>certificador_id, instalacion, seguimiento, aa:documentacion->${agente.CLAVE_DOC}`)
        .eq('numero_expediente', numero).maybeSingle();
    if (error) throw new Error(error.message);
    if (!exp) throw new Error(`No existe el expediente ${numero}.`);
    const { data: opp } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, referencia_cliente, instalador_asociado_id, prescriptor_id, datos_calculo')
        .eq('id', exp.oportunidad_id).maybeSingle();
    if (!opp) throw new Error(`${numero} no tiene oportunidad.`);
    return { exp, opp };
}

const { sinEncargar } = agente;

async function estado() {
    const { exp, opp } = await cargar(NUM);
    const dc = opp.datos_calculo || {};
    const mat = materialCee(dc.reforma_uploads, exp.instalacion);
    const view = await docs.buildDocsView(opp);
    const falta = await docs.faltantesPorDestino(opp.id, 'CEE', { materialCee: true });
    const dest = await agente.destinatarioCliente(exp.cliente_id);
    const inst = await agente.destinatarioInstalador(opp);
    // ¿Hay ya un BORRADOR del CEE inicial? El Agente IA lo deja en la oportunidad como
    // «… CEE INICIAL_REVISAR.cex», que `scanCeeSection` no cuenta: se lista la carpeta.
    const driveService = require('../services/driveService');
    let borrador = [];
    const raiz = dc.drive_folder_id || dc.inputs?.drive_folder_id;
    const ceeRoot = raiz ? await driveService.findSubfolderByName(raiz, '1. CEE') : null;
    const ini = ceeRoot ? await driveService.findSubfolderByName(ceeRoot, 'CEE INICIAL') : null;
    if (ini) borrador = ((await driveService.listFiles(ini)) || []).map(f => f.name).filter(n => /\.(cex|xml)$/i.test(n));
    let tecnico = null;
    if (exp.certificador_id) {
        const { data } = await supabase.from('prescriptores').select('razon_social, acronimo, es_agente_ia').eq('id_empresa', exp.certificador_id).maybeSingle();
        tecnico = data ? `${data.acronimo || data.razon_social}${data.es_agente_ia ? ' (Agente IA)' : ''}` : exp.certificador_id;
    }
    const notas = (dc.historial || []).filter(h => h.tipo === 'comentario').slice(-5)
        .map(h => `- ${String(h.texto || '').replace(/\s+/g, ' ').slice(0, 900)} (${h.usuario || '?'})`);
    const conFotos = (view.slots || []).filter(s => s.existing || s.items?.length)
        .map(s => `- ${s.key} · ${s.label}: ${s.items?.length || 1}`);

    console.log(`${exp.numero_expediente} · ${opp.referencia_cliente || ''} · ${dc.inputs?.direccion || 'sin dirección'}`);
    console.log(`Estado: ${exp.estado} · CEE inicial: ${exp.seguimiento?.cee_inicial || 'sin encargar'}${tecnico ? ` · técnico: ${tecnico}` : ''}`);
    if (dc.cee_decision === 'usar_cee_aportado') console.log('⚠️ El cliente APORTA su CEE inicial: no hay que hacerlo.');
    if (!sinEncargar(exp)) console.log('⚠️ El CEE inicial ya está encargado o en marcha: no pidas ni generes nada sin preguntar a Fran.');
    console.log(`\nMaterial para el CEE inicial (criterio del parte): ${mat.listo ? 'LISTO' : `faltan ${mat.faltan.join(', ')}`}`);
    console.log(`  vivienda: ${mat.vivienda.estado} (vídeo ${mat.vivienda.video}, fachada ${mat.vivienda.fachada}, patios ${mat.vivienda.patios}) · caldera ${mat.caldera.aplica ? mat.caldera.fotos : 'no aplica'} · placa ${mat.placa.aplica ? mat.placa.fotos : 'no aplica'}`);
    console.log(`\nApartados vacíos que se le reclamarían (mirando Drive): ${falta.slots.length ? '' : 'ninguno'}`);
    for (const s of falta.slots) console.log(`- ${s.key} · ${s.label}`);
    console.log(`\nApartados con ficheros:\n${conFotos.join('\n') || '- ninguno'}`);
    console.log(`\nCEE inicial ya en «1. CEE / CEE INICIAL»: ${borrador.length
        ? `${borrador.join(', ')}\n  → hay BORRADOR: parte de él (aplicar conserva lo hecho y añade encima), no empieces otro.`
        : 'nada'}`);
    console.log(`\nCarpeta de Drive: ${dc.drive_folder_link || dc.inputs?.drive_folder_link || '—'}`);
    console.log(`\nNotas del alta:\n${notas.join('\n') || '- ninguna'}`);
    console.log(`\nSe le escribe al cliente: ${dest.saludo || '?'}${dest.titular ? ` (contacto de ${dest.titular})` : ''} · ${dest.tlf || 'SIN TELÉFONO'}`);
    console.log(`Al instalador (--a instalador): ${inst ? `${inst.saludo || 'canal general'} · ${inst.empresa} · ${inst.tlf}` : 'sin instalador con teléfono'}`);
    const aa = exp.aa || {};
    console.log(`Revisión del agente: ronda ${aa.ronda || 0} de ${agente.MAX_RONDAS}${aa.pedido_at ? ` · último pedido ${aa.pedido_at} (${aa.pedido_quien || 'cliente'}): ${(aa.pedido || []).join(' · ')}` : ' · nada pedido aún'}`);
    if (aa.programado?.para) console.log(`⏰ Pedido PROGRAMADO para ${new Date(aa.programado.para).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.`);
}

/** El WhatsApp: el saludo, el enlace y la firma son fijos; lo que falta lo dice el agente. */
function componer({ dest, numero, lineas, link, a = 'cliente', cliente = '', direccion = '' }) {
    if (a === 'instalador') {
        // A una empresa sin persona de contacto se la saluda en genérico (regla 44).
        return `¡Hola${dest.saludo ? ` *${nombreSaludo(dest.saludo)}*` : ''}!

Del expediente *${numero}*${cliente ? ` de *${cliente}*` : ''}${direccion ? ` (${direccion})` : ''}, para poder hacer el *Certificado de Eficiencia Energética (CEE) inicial* nos falta:

${lineas.map(l => `• ${l}`).join('\n')}

🔗 *Se puede subir aquí:*
${link}

¡Muchas gracias!
*BROKERGY — Ingeniería Energética*`;
    }
    const tu = !dest.titular;
    return `¡Hola *${nombreSaludo(dest.saludo)}*!

${tu
        ? `Ya hemos revisado la documentación de tu expediente *${numero}*.`
        : `Ya hemos revisado la documentación del expediente *${numero}* de *${dest.titular}*.`} Para poder hacer el *Certificado de Eficiencia Energética (CEE) inicial* nos falta:

${lineas.map(l => `• ${l}`).join('\n')}

🔗 *${tu ? 'Puedes subirlo aquí' : 'Se puede subir aquí'}:*
${link}

Si ${tu ? 'tienes' : 'tenéis'} cualquier duda, ${tu ? 'escríbenos' : 'escribidnos'} por aquí.
*BROKERGY — Ingeniería Energética*`;
}

async function pedir() {
    const texto = opt('--texto');
    if (!texto) throw new Error('Uso: pedir <nº> --texto "lo que falta, una cosa por línea" [--slots K1,K2] [--a instalador] [--enviar]');
    const a = opt('--a') || 'cliente';
    if (!['cliente', 'instalador'].includes(a)) throw new Error('--a es «cliente» o «instalador».');
    const lineas = texto.replace(/\\n/g, '\n').split(/\n+/)
        .map(l => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean);
    if (!lineas.length) throw new Error('El texto está vacío.');

    const { exp, opp } = await cargar(NUM);
    const dc = opp.datos_calculo || {};
    const aa = exp.aa || {};
    // Los topes: esto sale a un cliente sin que Fran lo vea antes.
    if (dc.estado !== 'ACEPTADA') throw new Error(`La oportunidad está en ${dc.estado || '?'}, no ACEPTADA.`);
    if (dc.cee_decision === 'usar_cee_aportado') throw new Error('El cliente aporta su CEE: no se le pide nada para el inicial.');
    if (!sinEncargar(exp)) throw new Error(`El CEE inicial ya está en marcha (${exp.seguimiento.cee_inicial}): pregúntale a Fran.`);
    if (!flag('--otra-vez')) {
        if (aa.pedido_at && !(aa.revision_at && aa.revision_at > aa.pedido_at)) {
            throw new Error(`Ya se le pidió en esta ronda (${aa.pedido_at}). Solo con --otra-vez, si Fran lo pide.`);
        }
        if ((Number(aa.ronda) || 1) > agente.MAX_RONDAS) throw new Error('Se han acabado las rondas: díselo a Fran.');
        if (aa.programado?.para) throw new Error(`Ya hay un pedido programado para ${aa.programado.para}. Solo con --otra-vez, si Fran lo pide.`);
    }
    const dest = a === 'instalador'
        ? await agente.destinatarioInstalador(opp)
        : await agente.destinatarioCliente(exp.cliente_id);
    if (!dest?.tlf) throw new Error(`${a === 'instalador' ? 'El instalador' : 'El cliente'} no tiene teléfono: díselo a Fran.`);

    // El enlace: filtrado a los apartados pedidos si se dicen (y existen en ESTA obra).
    let link = await docs.ensureUploadLink(opp.id);
    const slots = (opt('--slots') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (slots.length) {
        const view = await docs.buildDocsView(opp);
        const validas = new Set((view.slots || []).map(s => s.key));
        const malas = slots.filter(s => !validas.has(s));
        if (malas.length) throw new Error(`Apartados que esta obra no tiene: ${malas.join(', ')}`);
        link = `${link}${link.includes('?') ? '&' : '?'}need=${slots.join(',')}`;
    }

    const { capitalizar } = require('../services/recordatorios');
    const mensaje = componer({ dest, numero: exp.numero_expediente, lineas, link, a,
        cliente: capitalizar(opp.referencia_cliente || ''), direccion: dc.inputs?.direccion || '' });
    const quien = a === 'instalador'
        ? `${dest.saludo || 'canal general'} · ${dest.empresa} (instalador)`
        : `${dest.saludo}${dest.titular ? ` (contacto de ${dest.titular})` : ''}`;
    const fuera = !agente.enHorario();
    console.log(`Para: ${quien} · ${dest.tlf}${fuera ? `\n⏰ Fuera de horario: saldría a las ${agente.siguienteApertura().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}` : ''}\n\n${mensaje}\n`);
    if (!flag('--enviar')) { console.log('(EN SECO: repítelo con --enviar para mandarlo)'); return; }

    const base = { expedienteId: exp.id, oportunidadId: opp.id, numero: exp.numero_expediente, lineas, tel: dest.tlf, saludo: dest.saludo, a };
    if (fuera) {
        const para = await agente.programar({ ...base, mensaje });
        console.log(`✓ Programado: lo manda el servidor el ${new Date(para).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}.`);
        return;
    }
    const { api } = require('./asistente_whatsapp');
    const out = await api('/api/whatsapp/send-text', { method: 'POST', body: { phone: dest.tlf, message: mensaje } });
    if (out && out.ok === false) throw new Error(out.error || 'WhatsApp no lo ha aceptado');
    await agente.registrarPedido(base);
    console.log(`✓ Enviado${out?.queued ? ' (en cola del WhatsApp: el ACK dirá si ha salido)' : ''} y apuntado en el historial.`);
}

module.exports = { componer };

const ORDENES = { estado, pedir };
if (require.main === module) (async () => {
    const f = ORDENES[ORDEN];
    if (!f) { console.log('Órdenes: estado <nº> · pedir <nº> --texto "…" [--slots K1,K2] [--enviar]   (ver la cabecera)'); return; }
    try { await f(); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; }
})();
