#!/usr/bin/env node
// ============================================================================
// presupuesto_instalador_cli.js — los PRESUPUESTOS que hacen los instaladores en
// su app, vistos desde la terminal (equipo de BROKERGY). Las mismas funciones que
// la app (services/presupuestoInstaladorService.js): nada de consultas a mano.
//
//   node scripts/presupuesto_instalador_cli.js listar [--instalador <id|acrónimo>] [--sin-simulacion]
//   node scripts/presupuesto_instalador_cli.js ver <id|numero> --instalador <id|acrónimo>
//   node scripts/presupuesto_instalador_cli.js pdf <id> --out fichero.pdf
//   node scripts/presupuesto_instalador_cli.js vincular <id> <id_oportunidad> [--escribir]
//
// ⚠️ Local = PRODUCCIÓN (lee el .env del backend). Solo `vincular --escribir`
// escribe (la fila, el PDF en el Drive de la obra y una nota en su historial);
// sin `--escribir` va EN SECO y dice lo que haría.
// ============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const fs = require('fs');
const path = require('path');
const supabase = require('../services/supabaseClient');
const PI = require('../services/presupuestoInstaladorService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const args = process.argv.slice(2);
const orden = args[0];
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const bandera = (n) => args.includes(n);
// Los argumentos posicionales: ni las banderas ni el valor de las opciones con valor.
const CON_VALOR = ['--instalador', '--out'];
const sueltos = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !CON_VALOR.includes(arr[i - 1]));
const eur = (n) => require('../services/facturaInstaladorService').eur(n);

function salir(msg, codigo = 1) { console.error(msg); process.exit(codigo); }

/** El instalador por su id_empresa o su acrónimo (RCA). */
async function instalador(x) {
    if (!x) return null;
    const q = supabase.from('prescriptores').select('id_empresa, acronimo, razon_social');
    const { data, error } = UUID_RE.test(x) ? await q.eq('id_empresa', x).limit(2) : await q.ilike('acronimo', x).limit(2);
    if (error) salir(`BD: ${error.message}`);
    if (!data?.length) salir(`No encuentro el instalador «${x}».`);
    if (data.length > 1) salir(`«${x}» es ambiguo: ${data.map(d => `${d.acronimo} (${d.id_empresa})`).join(', ')}`);
    return data[0];
}

/** Una fila por su id, sin filtrar por empresa (es el equipo interno quien mira). */
async function filaPorId(id) {
    if (!UUID_RE.test(String(id || ''))) salir('Ese id no es un UUID.');
    const { data, error } = await supabase.from('instalador_presupuestos').select('id, prescriptor_id').eq('id', id).maybeSingle();
    if (error) salir(`BD: ${error.message}`);
    if (!data) salir('No existe ese presupuesto.');
    return PI.obtener(data.prescriptor_id, id);
}

async function listar() {
    const inst = await instalador(opcion('--instalador'));
    let empresas;
    if (inst) empresas = [inst];
    else {
        const { data, error } = await supabase.from('instalador_presupuestos').select('prescriptor_id');
        if (error) salir(`BD: ${error.message}`);
        const ids = [...new Set((data || []).map(d => d.prescriptor_id))];
        if (!ids.length) { console.log('No hay presupuestos.'); return; }
        const { data: ps } = await supabase.from('prescriptores').select('id_empresa, acronimo, razon_social').in('id_empresa', ids);
        empresas = ps || ids.map(id => ({ id_empresa: id, acronimo: id }));
    }
    for (const e of empresas) {
        const lista = await PI.listar(e.id_empresa, { sinSimulacion: bandera('--sin-simulacion') });
        console.log(`\n${e.acronimo || e.razon_social} · ${lista.length} presupuesto(s)`);
        for (const p of lista) {
            console.log(`  ${String(p.numero).padEnd(8)} ${p.fecha}  ${p.estado.padEnd(8)} ${eur(p.total).padStart(13)}  ${(p.cliente || '—').slice(0, 30).padEnd(30)} ${(p.municipio || '').slice(0, 18).padEnd(18)} ${p.obra || (p.simulacion ? `sim. ${p.simulacion}` : 'sin obra')}  ${p.id}`);
        }
    }
}

async function ver() {
    const clave = sueltos[0];
    if (!clave) salir('Uso: ver <id|numero> --instalador <id|acrónimo>');
    const inst = await instalador(opcion('--instalador'));
    let fila;
    if (UUID_RE.test(clave)) fila = inst ? await PI.obtener(inst.id_empresa, clave) : await filaPorId(clave);
    else {
        if (!inst) salir('Por número hace falta --instalador.');
        const { data, error } = await supabase.from('instalador_presupuestos').select('id').eq('prescriptor_id', inst.id_empresa).ilike('numero', clave).order('created_at', { ascending: false }).limit(1);
        if (error) salir(`BD: ${error.message}`);
        if (!data?.[0]) salir(`${inst.acronimo} no tiene el presupuesto ${clave}.`);
        fila = await PI.obtener(inst.id_empresa, data[0].id);
    }
    const app = await PI.paraApp(fila.prescriptor_id, fila);
    console.log(`Presupuesto ${app.numero} · ${app.fecha} · ${app.estado} · origen ${app.origen}`);
    console.log(`Cliente: ${app.cliente.nombre || '—'}${app.cliente.nif ? ` · ${app.cliente.nif}` : ''} · ${[app.cliente.direccion, app.cliente.codigo_postal, app.cliente.municipio].filter(Boolean).join(', ')}`);
    console.log(`Obra: ${app.resumen || '—'}${app.obra.oportunidad ? ` · ligado a ${app.obra.oportunidad}` : ''}${app.simulacion ? ` · simulación ${app.simulacion}` : ''}`);
    for (const l of app.lineas) console.log(`  ${l.importe > 0 ? `${l.cantidad} × ${eur(l.precio)} = ${eur(l.importe)}` : '·'.padStart(3)}  ${l.texto}`);
    if (app.notas) console.log(`Notas: ${app.notas}`);
    console.log(`Base ${eur(app.base)} · IVA ${app.iva_pct} % ${eur(app.iva)} · TOTAL ${eur(app.total)}`);
    console.log(`\nMensaje para el cliente:\n${app.mensaje}`);
}

async function pdf() {
    const id = sueltos[0];
    const out = opcion('--out');
    if (!id || !out) salir('Uso: pdf <id> --out fichero.pdf');
    const fila = await filaPorId(id);
    const r = await PI.pdfDe(fila.prescriptor_id, fila);
    fs.writeFileSync(path.resolve(out), r.buffer);
    console.log(`PDF: ${path.resolve(out)} (${Math.round(r.buffer.length / 1024)} KB)${r.desborda ? ' · ⚠️ DESBORDA' : ''}${r.numeroLargo ? ' · ⚠️ nº largo' : ''}`);
}

async function vincular() {
    const [id, obra] = sueltos;
    if (!id || !obra) salir('Uso: vincular <id> <id_oportunidad> [--escribir]');
    const fila = await filaPorId(id);
    const escribir = bandera('--escribir');
    const r = await PI.vincularOportunidad({ prescriptorId: fila.prescriptor_id, id, obra, fila, escribir });
    if (!escribir) {
        if (r.enSeco) {
            console.log(`EN SECO (añade --escribir para hacerlo):\n  ligaría ${fila.numero} a ${r.oportunidad}\n  subiría «${r.fileName}» a DOC_PRESUPUESTO\n  nota: ${r.nota}`);
        } else console.log(`Ya estaba ligado a esa obra con su fichero: nada que hacer.`);
        return;
    }
    console.log(`Hecho: ${fila.numero} ligado (oportunidad ${r.oportunidad_id}).`);
}

const ORDENES = { listar, ver, pdf, vincular };
if (!ORDENES[orden]) salir('Órdenes: listar · ver · pdf · vincular (mira la cabecera del script).');
ORDENES[orden]().then(() => process.exit(0)).catch((e) => salir(`${e.status ? `[${e.status}] ` : ''}${e.message}`));
