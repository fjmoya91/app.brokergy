// La CAMPAÑA DE LA RENTA (marzo): «aquí tienes tus documentos» (24/10/2026, Fran).
//
//   node implementation/backend/scripts/campana_renta.js [--anio 2026] [--solo 25RES060_29]
//
// EN SECO, siempre: lista a quién le tocaría y con qué mensaje (componerMensajeCampanaRenta,
// fuente única en cobroForm.js). No escribe nada ni envía nada; el envío es otro paso,
// con el «sí» de Fran para ESE envío.
//
// A quién: expedientes con los certificados ya entregables (`certificadosLiberados`,
// desde 'DOC. COMPLETA') y los DOS CEE registrados (lo que pide la deducción), que
// no sean rechazados. Al que todavía no dice haber dejado reseña se le pide de paso.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { pathToFileURL } = require('url');
const supabase = require('../services/supabaseClient');
const portal = require('../services/portalService');
const cobroService = require('../services/cobroService');
const recepcion = require('../services/recepcionCobroService');
const { enlaceResena } = require('../services/cartaPagoService');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };

(async () => {
    const anio = Number(arg('anio')) || new Date().getFullYear() - 1;
    const solo = arg('solo');
    const { componerMensajeCampanaRenta } = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href);

    let q = supabase.from('v_expedientes_lifecycle')
        .select('numero_expediente, cee_ini_registro_ok, cee_fin_registro_ok');
    if (solo) q = q.eq('numero_expediente', solo);
    const { data: lc, error } = await q;
    if (error) throw error;
    const candidatos = (lc || []).filter(r => r.cee_ini_registro_ok && r.cee_fin_registro_ok).map(r => r.numero_expediente);

    let n = 0;
    for (let i = 0; i < candidatos.length; i += 50) {
        const { data: exps } = await supabase.from('expedientes')
            .select('id, numero_expediente, estado').in('numero_expediente', candidatos.slice(i, i + 50));
        for (const e of exps || []) {
            if (!portal.certificadosLiberados(e.estado) || /RECHAZ/i.test(e.estado || '')) continue;
            const exp = await cobroService.cargarExpediente(e.id);
            const c = exp?.clientes || {};
            const contacto = cobroService.contactoCliente(exp);
            const enlace = await recepcion.enlacePortal(exp, { crear: false });
            const msg = componerMensajeCampanaRenta({
                nombre: cobroService.primerNombre(exp),
                enlace: enlace || '(sin enlace del portal: se crearía al enviar)',
                anio,
                tercero: cobroService.esTercero(c),
                conResena: !c.contacto_es_partner && !exp.documentacion?.cobro?.resena_cliente?.declarada_at,
                enlaceResena: enlaceResena(),
            });
            n++;
            console.log(`\n── ${e.numero_expediente} · ${e.estado} · ${contacto.nombre || '—'} · ${contacto.tlf || 'sin teléfono'}${contacto.email ? ` · ${contacto.email}` : ''}`);
            console.log(msg.whatsapp);
        }
    }
    console.log(`\n${n} destinatario(s) · Renta ${anio} · EN SECO: no se ha enviado nada.`);
    process.exit(0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
