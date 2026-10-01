/**
 * La guía de la deducción del IRPF de un expediente REAL, sin escribir nada:
 * ni Drive, ni BD, ni envíos. Enseña qué deducción saldría, con qué datos, qué
 * adjuntos hay y qué impide enviarla; con --pdf deja el PDF en tmp/.
 *
 *   node scripts/probar_guia_irpf.js 26RES093_11 [--pdf]
 *   node scripts/probar_guia_irpf.js 2026CEE_60 [--pdf]      (CEE directo)
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const supabase = require('../services/supabaseClient');
const guiaIrpf = require('../services/guiaIrpfService');

(async () => {
    const numero = process.argv[2];
    if (!numero) { console.error('Uso: node scripts/probar_guia_irpf.js <nº expediente> [--pdf]'); process.exit(1); }
    const directo = /CEE_/i.test(numero) && !/RES|TER/i.test(numero);
    const tabla = directo ? 'cee_directos' : 'expedientes';
    const { data: row } = await supabase.from(tabla).select('id, numero_expediente').eq('numero_expediente', numero).maybeSingle();
    if (!row) { console.error(`No existe ${numero} en ${tabla}`); process.exit(1); }
    const origen = directo ? 'cee_directo' : 'expediente';

    const st = await guiaIrpf.estado(origen, row.id);
    const g = st.guia;
    console.log(`\n${numero} (${origen})`);
    console.log(`  Tipo: ${g.tipo} (${g.tipoOrigen}) · Deducción: ${g.modalidad || '—'} % · ${g.motivo}`);
    console.log(`  Antes:   ${g.certificados.anterior.fecha} · ${g.certificados.anterior.consumo} ${g.certificados.anterior.letra || ''}`);
    console.log(`  Después: ${g.certificados.posterior.fecha} · ${g.certificados.posterior.consumo} ${g.certificados.posterior.letra || ''}`);
    if (g.irpf?.estado === 'ok') console.log(`  Ahorro EPNR: ${g.irpf.ahorroPct.toFixed(1)} %`);
    console.log(`  Ref. catastral: ${g.vivienda.refCatastral} · Vivienda: ${g.vivienda.direccion}`);
    console.log(`  Titular: ${g.titular.nombre} ${g.titular.nif} · propietarios: ${g.propietarios}`);
    console.log(`  Obras: ${g.obras.map(o => `${o.nif} ${o.nombre}`).join(' | ') || '—'}`);
    console.log(`  Facturas (${st.facturas.length}):`);
    for (const f of st.facturas) console.log(`    · ${f.numero} ${f.fecha} ${f.emisor} ${f.nif} → ${f.importe} €${f.ivaEstimado ? ' (IVA supuesto)' : ''}${f.incluir ? '' : ' [fuera]'}`);
    if (g.ejemplo) {
        console.log(`  Sin facturas de la obra → EJEMPLO con ${g.ejemplo.importe} €: ${g.ejemplo.calendario.porPropietario} € ${g.ejemplo.calendario.anios.map(a => `[${a.anio}: ${a.importe}]`).join(' ')}`);
    } else {
        console.log(`  Total: ${g.total} € · Renta ${g.anio} · estimado: ${g.calendario?.porPropietario ?? 0} € ${g.calendario?.anios?.map(a => `[${a.anio}: ${a.importe}]`).join(' ') || ''}`);
    }
    console.log(`  Adjuntos: ${st.adjuntos.map(a => `${a.rotulo}: ${a.fichero || '✗ FALTA'}`).join(' · ')}`);
    console.log(`  Destinatario: ${st.destinatario.nombre} · ${st.destinatario.email || '—'} · ${st.destinatario.tlf || '—'}`);
    if (st.bloqueos.length) console.log(`  ⛔ ${st.bloqueos.join('\n  ⛔ ')}`);
    if (st.avisos.length) console.log(`  ⚠️ ${st.avisos.join('\n  ⚠️ ')}`);
    console.log(`  Guardada: ${st.guardada ? st.guardada.link : 'no'}`);
    console.log(`\n--- Mensaje ---\n${st.mensaje}\n`);

    // CEE directo: lo que llevaría la ENTREGA del certificado (sin enviar nada).
    if (directo) {
        const svc = require('../services/ceeDirectoService');
        const entrega = require('../services/ceeDirectoEntrega');
        const r = await svc.cargar(row.id);
        const fases = String(r.alcance || 'UNICO').toUpperCase() === 'DOBLE' ? ['inicial', 'final'] : ['inicial'];
        for (const fase of fases) {
            const e = await entrega.estado(r, fase);
            console.log(`--- Entrega ${fase}: ${e.puede ? 'lista' : `falta: ${e.faltan.join(' · ')}`}`);
            console.log(`    adjuntos: ${[e.ficheros.pdf, e.ficheros.registro, e.ficheros.guia].filter(Boolean).join(' · ')}`);
            console.log(`    guía: ${e.guia?.va ? `va (${e.guia.modalidad} %${e.guia.ejemplo ? `, ejemplo ${e.guia.ejemplo.importe} € → ${e.guia.ejemplo.deduccion} €` : ''})` : (e.guia?.motivo || 'no va')}`);
            console.log(`\n${entrega.mensaje(r, fase, { textoGuia: e.guia?.texto })}\n`);
        }
    }

    if (process.argv.includes('--pdf') && g.puede) {
        const { buffer, filename } = await guiaIrpf.pdf(origen, row.id);
        const out = path.join(__dirname, '../../../tmp', filename.replace(/[–\s]+/g, '_'));
        fs.writeFileSync(out, buffer);
        console.log(`PDF → ${out}`);
    }
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
