#!/usr/bin/env node
// certificador_casa_pendientes.js — pone al certificador de la CASA (Fran) en los
// CEE vivos que están SIN certificador o con el AGENTE IA en la barra, y que aún
// tienen algún certificado por registrar (decisión del usuario, 26/10/2026:
// «excepto que yo diga lo contrario, todos los CEE me ponen a mí»).
//
//   node scripts/certificador_casa_pendientes.js            → en seco: la lista
//   node scripts/certificador_casa_pendientes.js --escribir → lo escribe
//
// No toca: los de un técnico de fuera, los FINALIZADO/RECHAZADO, los que ya
// tienen registrados todos sus certificados, los MIGRADOS y el HISTÓRICO
// importado de CEE directos (sus CEE los hizo quien los hizo en el sistema
// antiguo), ni un CAE que ya pasó la fase del CEE (de «REVISADO Y LISTO
// (FINAL)» en adelante: su CEE está hecho aunque la app no tenga la fecha). Con el AGENTE IA en la barra, su
// encargo pasa a su sello (`cee.agente_ia[fase].estado = 'encargado'`) para que
// siga en su cola y en el radar. Escribe UNA clave de `cee` por su RPC.
require('dotenv').config();
const supabase = require('../services/supabaseClient');
const { certificadorCasaId } = require('../utils/certificadorCasa');
const agenteIa = require('../services/agenteIa');
const { esDoble } = require('../utils/ceeDirectoEstados');
const { rankEstado } = require('../utils/expedienteEstados');

const ESCRIBIR = process.argv.includes('--escribir');
const ENCARGADO = ['ASIGNADO', 'EN_TRABAJO'];

const registradaCae = (e, fase) => !!(fase === 'final' ? e.reg_fin : e.reg_ini)
    || !!e.seguimiento?.[`cee_${fase}_ts`]?.REGISTRADO
    || String(e.seguimiento?.[`cee_${fase}`] || '').toUpperCase() === 'REGISTRADO';
const registradaCee = (e, fase) => String(e.seguimiento?.[`cee_${fase}`] || '').toUpperCase() === 'REGISTRADO';

async function main() {
    const casa = certificadorCasaId();
    const ag = await agenteIa.agente();
    const agId = ag ? String(ag.id_empresa) : null;
    const elegible = (cid) => !cid || (agId && String(cid) === agId);

    const [cae, cee] = await Promise.all([
        supabase.from('expedientes')
            .select('id, numero_expediente, estado, seguimiento, cid:cee->>certificador_id, sello:cee->agente_ia, '
                + 'reg_ini:documentacion->>fecha_registro_cee_inicial, reg_fin:documentacion->>fecha_registro_cee_final')
            .not('estado', 'in', '("FINALIZADO","RECHAZADO","PENDIENTE REVISAR EXPTE")'),
        supabase.from('cee_directos')
            .select('id, numero_expediente, estado, alcance, origen, seguimiento, cid:cee->>certificador_id, sello:cee->agente_ia')
            .neq('estado', 'FINALIZADO'),
    ]);
    if (cae.error || cee.error) throw new Error((cae.error || cee.error).message);

    const plan = [];
    for (const e of cae.data) {
        if (!elegible(e.cid)) continue;
        if (rankEstado(e.estado) > rankEstado('REVISADO Y LISTO (FINAL)')) continue;
        if (registradaCae(e, 'inicial') && registradaCae(e, 'final')) continue;
        plan.push({ negocio: 'cae', e, fases: ['inicial', 'final'] });
    }
    for (const e of cee.data) {
        if (!elegible(e.cid) || String(e.origen || '').toUpperCase() === 'HISTORICO') continue;
        const fases = esDoble(e) ? ['inicial', 'final'] : ['inicial'];
        if (fases.every(f => registradaCee(e, f))) continue;
        plan.push({ negocio: 'cee', e, fases });
    }

    const cex = require('../services/ceeEnvolventeCex');
    let escritos = 0;
    for (const p of plan) {
        const delAgente = agId && String(p.e.cid || '') === agId;
        // Del agente: sus fases encargadas y sin sello pasan a su sello.
        const sello = { ...(p.e.sello || {}) };
        const sellar = delAgente ? p.fases.filter(f => ENCARGADO.includes(String(p.e.seguimiento?.[`cee_${f}`] || '').toUpperCase())
            && !sello[f]?.estado) : [];
        for (const f of sellar) sello[f] = { estado: 'encargado', encargado_at: new Date().toISOString() };
        p.linea = `${p.e.numero_expediente.padEnd(16)} ${String(p.e.estado || '').padEnd(30)} `
            + `${delAgente ? 'AGENTE IA' : '(vacío)  '} → Fran`
            + (sellar.length ? `  · sello del agente: ${sellar.join(', ')}` : '');
        if (!ESCRIBIR) continue;
        const stub = cex.expedienteStub(p.negocio, p.e.id);
        await cex.setCeeField(stub, 'certificador_id', casa);
        if (sellar.length) await cex.setCeeField(stub, 'agente_ia', sello);
        escritos++;
    }

    const porNegocio = (n) => plan.filter(p => p.negocio === n);
    for (const [n, t] of [['cae', 'EXPEDIENTES CAE'], ['cee', 'CEE DIRECTOS']]) {
        console.log(`\n== ${t}: ${porNegocio(n).length}`);
        for (const p of porNegocio(n)) console.log('  ' + p.linea);
    }
    console.log(ESCRIBIR ? `\n✓ Escritos: ${escritos}` : `\n(en seco: nada escrito; --escribir para hacerlo)`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
