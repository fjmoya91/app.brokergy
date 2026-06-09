#!/usr/bin/env node
/**
 * VINCULAR cliente correcto a cada expediente migrado usando la AppSheet antigua.
 * Empareja por dos claves fiables (el NumExpte de la AppSheet NO se alinea con el de Drive):
 *   1) REFERENCIA CATASTRAL (RC-20, misma vivienda)        — prioridad
 *   2) DIRECCIÓN (municipio + nº de portal + tokens de calle, con UNICIDAD) — solo si falla la RC
 *
 * Cliente autoritativo = fila EXPEDIENTES_CAE del sheet (nombre, NIF, dirección…). Se busca en
 * Supabase por NIF (se crea si no existe), se re-vincula expedientes.cliente_id + oportunidades.cliente_id,
 * se rellenan campos vacíos. Con --delete-orphans borra el cliente "barebones" huérfano resultante.
 *
 * USO: node scripts/vincular_por_catastro.js [--execute] [--delete-orphans] [--solo-dir|--solo-rc] [--dump <ruta>]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const supabase = require('../services/supabaseClient');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const EXECUTE = has('--execute');
const DELETE_ORPHANS = has('--delete-orphans');
const SOLO_DIR = has('--solo-dir');
const SOLO_RC = has('--solo-rc');
const DUMP = val('--dump', 'C:/Users/Usuario/.claude/projects/C--Proyectos-app-brokergy/3374f1b9-4d92-4f50-aadf-c7dd78adf364/tool-results/mcp-6a2e2a3a-a6af-492e-b2af-ec223be37875-read_file_content-1780743568518.txt');

const txt = JSON.parse(fs.readFileSync(DUMP, 'utf8')).fileContent.split('\n');
const unesc = (s) => String(s || '').replace(/\\([_#\[\]!])/g, '$1').trim();
const cells = (l) => { const p = l.split('|'); return p.slice(1, p.length - 1).map(unesc); };
const cleanNum = (s) => String(s || '').replace(/\\/g, '').trim();
const empty = (v) => v === null || v === undefined || String(v).trim() === '';
const updni = (s) => String(s || '').toUpperCase().replace(/[\s-]/g, '').trim();
const rc20 = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ── dirección ──
const VIA = new Set(['C', 'CL', 'CALLE', 'AV', 'AVDA', 'AVENIDA', 'PASEO', 'PJE', 'PLAZA', 'PZA', 'TRAVESIA', 'TVA', 'CTRA', 'CARRETERA', 'CAMINO', 'RONDA', 'GLORIETA', 'URB', 'URBANIZACION', 'CALLEJON', 'PARAJE', 'PARTIDA', 'PLAZUELA', 'CUESTA']);
const ADDR_STOP = new Set([...VIA, 'BAJO', 'PISO', 'PORTAL', 'ESC', 'ESCALERA', 'IZQ', 'IZQUIERDA', 'DCHA', 'DERECHA', 'BIS', 'EN', 'CATASTRO', 'DISEMINADO', 'DISEMINADOS', 'TN', 'NUM', 'Nº', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'SN']);
const noParen = (s) => String(s || '').replace(/\([^)]*\)/g, ' ');
const houseNum = (dir) => { const m = noParen(dir).match(/\b(\d{1,4})\b/); return m ? m[1] : ''; };
const streetToks = (dir) => new Set(norm(noParen(dir)).split(' ').filter((t) => t.length > 1 && !/^\d+$/.test(t) && !ADDR_STOP.has(t)));
const subset = (a, b) => a.size && [...a].every((t) => b.has(t));

const expH = [], instH = [];
txt.forEach((l, i) => { if (/ID\\?_EXPEDIENTE.*ID\\?_CLIENTE.*NumExpte.*Nombre Ahorrador/.test(l)) expH.push(i); if (/ID\\?_Instalacion.*NumExpte.*Referencia catastral/.test(l)) instH.push(i); });
const exp = {};
for (const h of expH) {
  const H = cells(txt[h]); const I = (n) => H.indexOf(n);
  const m = { n: I('NumExpte'), nom: I('Nombre Ahorrador'), ape: I('Apellidos Ahorrador'), email: I('Email Ahorrador'), tlf: I('Teléfono Ahorrador'), nif: I('NIF/CIF Ahorrador'), ccaa: I('Comunidad Autónoma'), prov: I('Provincia Ahorrador'), mun: I('Municipio Ahorrador'), dir: I('Dirección Ahorrador'), cp: I('Código Postal Ahorrador'), cta: I('Número de Cuenta Ahorrador') };
  for (let i = h + 2; i < txt.length; i++) { const l = txt[i]; if (!l.startsWith('|') || /^\| *ID/.test(l)) break; const c = cells(l); const n = cleanNum(c[m.n]); if (!/RES0\d{2}_\d+/.test(n)) continue;
    exp[n] = { numexpte: n, nombre: c[m.nom] || '', apellidos: c[m.ape] || '', email: c[m.email] || '', tlf: c[m.tlf] || '', dni: (c[m.nif] || '').toUpperCase().trim(), ccaa: c[m.ccaa] || '', provincia: c[m.prov] || '', municipio: c[m.mun] || '', direccion: c[m.dir] || '', codigo_postal: c[m.cp] || '', numero_cuenta: c[m.cta] || '' }; }
}
const rcFull = {};
for (const h of instH) { const H = cells(txt[h]); const iN = H.indexOf('NumExpte'), iRc = H.indexOf('Referencia catastral'); for (let i = h + 2; i < txt.length; i++) { const l = txt[i]; if (!l.startsWith('|') || /^\| *ID/.test(l)) break; const c = cells(l); const n = cleanNum(c[iN]); const r = rc20(c[iRc]); if (r.length === 20 && exp[n]) rcFull[r] = exp[n]; } }
// índice de direcciones del sheet: "MUN|Nº" -> [{stoks, client}]
const addrIdx = {};
for (const a of Object.values(exp)) { const mun = norm(a.municipio), num = houseNum(a.direccion); if (!mun || !num) continue; const k = mun + '|' + num; (addrIdx[k] = addrIdx[k] || []).push({ stoks: streetToks(a.direccion), client: a }); }

console.log('═'.repeat(78));
console.log(`VINCULAR cliente — modo: ${EXECUTE ? '*** EXECUTE ***' : 'DRY-RUN'}${DELETE_ORPHANS ? ' +DEL-ORPHANS' : ''}${SOLO_DIR ? ' [solo-dir]' : ''}${SOLO_RC ? ' [solo-rc]' : ''}`);
console.log(`Sheet: ${Object.keys(exp).length} exp | RC-20: ${Object.keys(rcFull).length} | direcciones idx: ${Object.keys(addrIdx).length}`);
console.log('═'.repeat(78));

(async () => {
  const allCli = [];
  for (let f = 0; ; f += 1000) { const { data } = await supabase.from('clientes').select('*').range(f, f + 999); allCli.push(...(data || [])); if (!data || data.length < 1000) break; }
  const byId = new Map(allCli.map((c) => [c.id_cliente, c]));
  const byDni = new Map(); allCli.forEach((c) => { const d = updni(c.dni); if (d) byDni.set(d, c); });

  const { data: exps } = await supabase.from('expedientes').select('id, numero_expediente, cliente_id, oportunidad_id, instalacion, cee, oportunidades(datos_calculo)');
  const mig = (exps || []).filter((e) => e.oportunidades?.datos_calculo?.origen === 'migracion_xml');

  const rows = []; const tally = { rc: 0, dir: 0, ya_ok: 0, relink: 0, creado: 0, enriquecido: 0, orphan: 0, sin_match: 0, dir_ambiguo: 0 };

  const buildPatch = (cli, a) => { const p = {}; const f = [];
    if (empty(cli.apellidos) && a.apellidos) { p.nombre_razon_social = a.nombre || cli.nombre_razon_social; p.apellidos = a.apellidos; f.push('nombre'); }
    for (const k of ['email', 'tlf', 'ccaa', 'provincia', 'municipio', 'direccion', 'codigo_postal', 'numero_cuenta']) if (empty(cli[k]) && !empty(a[k])) { p[k] = a[k]; f.push(k); }
    if (empty(cli.dni) && a.dni && !byDni.has(updni(a.dni))) { p.dni = a.dni; f.push('dni'); }
    return { p, f };
  };

  // aplica el cliente autoritativo `a` al expediente `e` (cur = cliente actual). tier: 'rc'|'dir'
  const applyClient = async (e, cur, a, tier) => {
    let target = a.dni ? byDni.get(updni(a.dni)) : null;
    let accion, detalle = `[${tier}] sheet ${a.numexpte}: ${a.nombre} ${a.apellidos} (dni ${a.dni || '∅'})`;
    if (target && target.id_cliente === e.cliente_id) {
      accion = 'ya_ok'; tally.ya_ok++;
      const { p, f } = buildPatch(cur, a); if (f.length) { detalle += ` | enriquece: ${f.join(',')}`; if (EXECUTE) await supabase.from('clientes').update(p).eq('id_cliente', cur.id_cliente); tally.enriquecido++; }
    } else if (target) {
      accion = 'relink'; tally.relink++; detalle += ` | RELINK ${cur.nombre_razon_social || '∅'} → existente`;
      const { p, f } = buildPatch(target, a);
      if (EXECUTE) { await supabase.from('expedientes').update({ cliente_id: target.id_cliente }).eq('id', e.id); if (e.oportunidad_id) await supabase.from('oportunidades').update({ cliente_id: target.id_cliente }).eq('id', e.oportunidad_id); if (f.length) await supabase.from('clientes').update(p).eq('id_cliente', target.id_cliente); }
      if (f.length) { detalle += ` | enriquece destino: ${f.join(',')}`; tally.enriquecido++; }
      await maybeDeleteOrphan(cur, (s) => detalle += s);
    } else if (cur.id_cliente && norm(cur.nombre_razon_social) && (norm(`${a.nombre} ${a.apellidos}`).includes(norm(cur.nombre_razon_social)) || (a.apellidos && norm(cur.nombre_razon_social).includes(norm(a.apellidos))))) {
      accion = 'fill_actual'; tally.ya_ok++;
      const { p, f } = buildPatch(cur, a); if (f.length) { detalle += ` | enriquece actual: ${f.join(',')}`; if (EXECUTE) await supabase.from('clientes').update(p).eq('id_cliente', cur.id_cliente); tally.enriquecido++; }
    } else {
      accion = 'crear+link'; tally.creado++; detalle += ` | CREA cliente y vincula (actual ${cur.nombre_razon_social || '∅'})`;
      if (EXECUTE) {
        const ins = { nombre_razon_social: a.nombre || a.apellidos, apellidos: a.apellidos || null, email: a.email || null, tlf: a.tlf || null, dni: a.dni || null, ccaa: a.ccaa || null, provincia: a.provincia || null, municipio: a.municipio || null, direccion: a.direccion || null, codigo_postal: a.codigo_postal || null, numero_cuenta: a.numero_cuenta || null };
        const { data: nc, error: ie } = await supabase.from('clientes').insert([ins]).select('id_cliente').single();
        if (ie) detalle += ' | ERR:' + ie.message; else { if (a.dni) byDni.set(updni(a.dni), { id_cliente: nc.id_cliente }); await supabase.from('expedientes').update({ cliente_id: nc.id_cliente }).eq('id', e.id); if (e.oportunidad_id) await supabase.from('oportunidades').update({ cliente_id: nc.id_cliente }).eq('id', e.oportunidad_id); await maybeDeleteOrphan(cur, (s) => detalle += s); }
      }
    }
    return { accion, detalle };
  };
  const maybeDeleteOrphan = async (cur, addDetail) => {
    if (!(DELETE_ORPHANS && cur.id_cliente && empty(cur.dni))) { if (cur.id_cliente && empty(cur.dni)) addDetail(' | huérfano borrable'); return; }
    if (!EXECUTE) { addDetail(' | huérfano borrable'); return; }
    const [{ count: rE }, { count: rO }] = await Promise.all([supabase.from('expedientes').select('id', { count: 'exact', head: true }).eq('cliente_id', cur.id_cliente), supabase.from('oportunidades').select('id', { count: 'exact', head: true }).eq('cliente_id', cur.id_cliente)]);
    if ((rE || 0) === 0 && (rO || 0) === 0) { await supabase.from('clientes').delete().eq('id_cliente', cur.id_cliente); tally.orphan++; addDetail(' | huérfano borrado'); } else addDetail(` | huérfano aún ref (E:${rE} O:${rO})`);
  };

  for (const e of mig) {
    const cur = byId.get(e.cliente_id) || {};
    const rc = rc20(e.instalacion?.ref_catastral || e.cee?.cee_inicial?.identificacion?.refCatastral || e.cee?.cee_final?.identificacion?.refCatastral || '');
    let a = null, tier = null;
    if (!SOLO_DIR && rc && rcFull[rc]) { a = rcFull[rc]; tier = 'rc'; }
    if (!a && !SOLO_RC) {
      // dirección desde el XML / inputs de la op
      const id = e.cee?.cee_inicial?.identificacion || e.cee?.cee_final?.identificacion || {};
      const inp = e.oportunidades?.datos_calculo?.inputs || {};
      const dir = id.direccion || inp.direccion || '', mun = id.municipio || inp.municipio || '';
      const k = norm(mun) + '|' + houseNum(dir);
      const cand = (addrIdx[norm(mun) + '|' + houseNum(dir)] || []).filter((x) => { const st = streetToks(dir); return subset(st, x.stoks) || subset(x.stoks, st); });
      if (houseNum(dir) && norm(mun)) {
        if (cand.length === 1) { a = cand[0].client; tier = 'dir'; }
        else if (cand.length > 1) { tally.dir_ambiguo++; rows.push({ ne: e.numero_expediente, accion: 'dir_ambiguo', detalle: `${cand.length} candidatos en ${mun} ${houseNum(dir)}` }); continue; }
      }
    }
    if (!a) { tally.sin_match++; rows.push({ ne: e.numero_expediente, accion: 'sin_match', detalle: '' }); continue; }
    if (tier === 'rc') tally.rc++; else tally.dir++;
    const r = await applyClient(e, cur, a, tier);
    rows.push({ ne: e.numero_expediente, accion: r.accion, detalle: r.detalle });
    console.log(`\n${e.numero_expediente} [${r.accion}] ${r.detalle}`);
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const csv = path.join(__dirname, `vinculacion_${stamp}${EXECUTE ? '' : '_dryrun'}.csv`);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  fs.writeFileSync(csv, '﻿' + ['numero_expediente,accion,detalle', ...rows.map((r) => [r.ne, r.accion, r.detalle].map(esc).join(','))].join('\n'), 'utf8');

  console.log('\n' + '═'.repeat(78));
  console.log(`RESUMEN — migrados: ${mig.length}`);
  console.log(`  Match por RC: ${tally.rc}  | por DIRECCIÓN: ${tally.dir}`);
  console.log(`  (ya_ok=${tally.ya_ok}, relink=${tally.relink}, crear+link=${tally.creado}, enriquecidos=${tally.enriquecido}, huérfanos borrados=${tally.orphan})`);
  console.log(`  Dirección AMBIGUA: ${tally.dir_ambiguo}  | sin match: ${tally.sin_match}`);
  console.log(`CSV: ${csv}`);
  if (!EXECUTE) console.log('\n(DRY-RUN: no se ha escrito nada.)');
})().then(() => { process.exitCode = 0; }).catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
