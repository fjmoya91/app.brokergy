/**
 * importar_cobro_tally.js — trae a la app las respuestas del formulario de Tally
 * "⚡ Confirmación de Datos de Pago y Optimización de tu Aerotermia", que es el que
 * se usaba antes de tener el formulario dentro (/cobro/:id).
 *
 * Para qué: que la bandeja de VENTA CRUZADA (pestaña "Venta cruzada") tenga también
 * a quienes contestaron en Tally —tarifa, placas, IRPF— y que el expediente diga
 * que ese cliente ya confirmó sus datos (así el lote y el parte no se los vuelven a
 * pedir).
 *
 * Qué hace con cada respuesta:
 *   1. La casa con su CLIENTE por el DNI (normalizado). Nunca por el teléfono a
 *      secas: hay móviles de instalador metidos en varias fichas de clientes.
 *   2. De ese cliente, el EXPEDIENTE: si tiene uno, ése; si tiene varios, el que
 *      esté en fase de pago o ya pagado; si sigue habiendo duda, NO se toca y se dice.
 *   3. Compara el IBAN de Tally con el de la ficha y lo dice (coincide · distinto ·
 *      la ficha no tenía). El IBAN de la ficha NO se cambia aquí: un cambio de cuenta
 *      exige justificante (regla del formulario de cobro).
 *   4. Con --execute, sella `documentacion.cobro` (RPC de MERGE) con
 *      `origen: 'tally'`, la fecha de la respuesta y las respuestas traducidas a los
 *      valores del formulario de la app. Lo que ya esté contestado en la app NO se pisa.
 *
 *   node implementation/backend/scripts/importar_cobro_tally.js "<ruta del .csv>"            (en seco)
 *   node implementation/backend/scripts/importar_cobro_tally.js "<ruta del .csv>" --execute
 *
 * ⚠️ El CSV lleva DNI e IBAN de clientes: no se copia al repo.
 */

const fs = require('fs');
const supabase = require('../services/supabaseClient');

const ruta = process.argv[2];
const EJECUTAR = process.argv.includes('--execute');
if (!ruta || !fs.existsSync(ruta)) {
    console.error('Uso: node importar_cobro_tally.js "<ruta del .csv>" [--execute]');
    process.exit(1);
}

// ─── CSV con comillas (los textos de Tally llevan comas dentro) ──────────────
function parseCsv(texto) {
    const filas = [];
    let fila = [], campo = '', comillas = false;
    for (let i = 0; i < texto.length; i++) {
        const ch = texto[i];
        if (comillas) {
            if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (ch === '"') comillas = false;
            else campo += ch;
        } else if (ch === '"') comillas = true;
        else if (ch === ',') { fila.push(campo); campo = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && texto[i + 1] === '\n') i++;
            fila.push(campo); campo = '';
            if (fila.some(c => c !== '')) filas.push(fila);
            fila = [];
        } else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); if (fila.some(c => c !== '')) filas.push(fila); }
    return filas;
}

const normDni = (v) => String(v || '').replace(/[\s.\-]/g, '').toUpperCase();
const normIban = (v) => String(v || '').replace(/[\s\-]+/g, '').toUpperCase();
const masc = (v) => { const s = normIban(v); return s.length >= 12 ? `${s.slice(0, 4)} ${s.slice(4, 8)} •••• ${s.slice(-4)}` : '—'; };

// ─── Traducción de las respuestas de Tally a los valores de cobroForm.js ─────
// Se busca por el COMIENZO del texto: Tally escribe la opción entera con su
// paréntesis explicativo, y basta lo primero para saber cuál es.
function traducir(col, txt) {
    const t = String(txt || '').trim().toLowerCase();
    if (!t) return null;
    if (col === 'tarifa') {
        if (t.startsWith('sí') || t.startsWith('si')) return 'ajustado';
        if (t.startsWith('no')) return 'no_revisado';
    }
    if (col === 'solar') {
        if (t.startsWith('ya tengo')) return 'si';
        if (t.includes('pero me interesa')) return 'futuro';
        if (t.includes('no me interesa')) return 'no';
    }
    if (col === 'fiscalidad') {
        if (t.startsWith('sí') || t.startsWith('si')) return 'si';
        if (t.startsWith('no')) return 'no';
    }
    if (col === 'forma_pago') {
        if (t.startsWith('opción 1') || t.startsWith('opcion 1')) return 'descuento';
        if (t.startsWith('opción 2') || t.startsWith('opcion 2')) return 'factura';
    }
    return null;
}

// Tally exporta la hora en UTC ("2026-01-27 14:45:38").
const fechaIso = (v) => { const d = new Date(`${String(v).replace(' ', 'T')}Z`); return isNaN(d) ? null : d.toISOString(); };

const ESTADOS_PAGO = ['PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO', 'CAE EMITIDO – PTE PAGO BROKERGY'];

(async () => {
    const filas = parseCsv(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, ''));
    const cab = filas.shift();
    const idx = (frag) => cab.findIndex(h => h.toLowerCase().includes(frag));
    const C = {
        id: idx('submission id'), fecha: idx('submitted at'),
        tarifa: idx('potencia contratada'), solar: idx('placas solares'),
        fiscalidad: idx('deducciones fiscales'), forma_pago: idx('forma de pago'),
        nombre: idx('nombre y apellidos'), dni: idx('dni'), email: idx('email'),
        tlf: idx('teléfono'), iban: idx('iban'),
    };
    if (Object.values(C).some(v => v < 0)) {
        console.error('El CSV no tiene las columnas esperadas:', C);
        process.exit(1);
    }

    // Clientes por DNI normalizado (son pocos cientos: se traen una vez).
    const { data: clientes, error: cErr } = await supabase
        .from('clientes').select('id_cliente, dni, nombre_razon_social, apellidos, numero_cuenta');
    if (cErr) throw new Error(cErr.message);
    const porDni = new Map();
    for (const c of clientes || []) {
        const k = normDni(c.dni);
        if (!k) continue;
        if (!porDni.has(k)) porDni.set(k, []);
        porDni.get(k).push(c);
    }

    const resumen = { aplicadas: 0, ya_en_app: 0, sin_cliente: 0, dudosas: 0, iban_distinto: 0, iban_falta_ficha: 0 };
    console.log(`\n${EJECUTAR ? 'APLICANDO' : 'EN SECO (no escribe nada)'} · ${filas.length} respuestas de Tally\n`);

    for (const r of filas) {
        const dni = normDni(r[C.dni]);
        const nombre = String(r[C.nombre] || '').trim();
        const cands = porDni.get(dni) || [];
        if (cands.length !== 1) {
            resumen.sin_cliente++;
            console.log(`✗ ${nombre} (${dni}) → ${cands.length ? `${cands.length} fichas con ese DNI` : 'ningún cliente con ese DNI'}`);
            continue;
        }
        const cli = cands[0];
        const { data: exps, error: eErr } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, estado, documentacion->cobro')
            .eq('cliente_id', cli.id_cliente);
        if (eErr) throw new Error(eErr.message);
        let elegidos = exps || [];
        if (elegidos.length > 1) elegidos = elegidos.filter(e => ESTADOS_PAGO.includes(e.estado));
        if (elegidos.length !== 1) {
            resumen.dudosas++;
            console.log(`? ${nombre} → ${(exps || []).length} expedientes (${(exps || []).map(e => `${e.numero_expediente} ${e.estado}`).join(' | ') || 'ninguno'}): no se toca`);
            continue;
        }
        const exp = elegidos[0];

        const ibanTally = normIban(r[C.iban]);
        const ibanFicha = normIban(cli.numero_cuenta);
        let ibanTxt;
        if (!ibanFicha) { ibanTxt = `⚠ la ficha NO tenía cuenta · Tally ${masc(ibanTally)}`; resumen.iban_falta_ficha++; }
        else if (ibanFicha === ibanTally) ibanTxt = `✓ cuenta coincide (${masc(ibanFicha)})`;
        else {
            // Cuántas cifras cambian: una o dos es casi siempre una errata al
            // teclearla (en un lado o en el otro), y la máscara sola no lo deja ver.
            const n = ibanFicha.length === ibanTally.length
                ? [...ibanFicha].filter((ch, i) => ch !== ibanTally[i]).length : null;
            ibanTxt = `⚠ CUENTA DISTINTA${n != null ? ` (${n} cifra${n === 1 ? '' : 's'} distinta${n === 1 ? '' : 's'})` : ' (otra longitud)'} · ficha ${masc(ibanFicha)} · Tally ${masc(ibanTally)}`;
            resumen.iban_distinto++;
        }

        const respuestas = Object.fromEntries(['tarifa', 'solar', 'fiscalidad', 'forma_pago']
            .map(k => [k, traducir(k, r[C[k]])]).filter(([, v]) => v));

        if (exp.cobro?.completado_at) {
            resumen.ya_en_app++;
            console.log(`= ${exp.numero_expediente} · ${nombre} · ya contestó en la app (${exp.cobro.completado_at.slice(0, 10)}) — ${ibanTxt}`);
            continue;
        }

        console.log(`→ ${exp.numero_expediente} · ${nombre} · ${exp.estado} · ${JSON.stringify(respuestas)} — ${ibanTxt}`);
        if (EJECUTAR) {
            const { error } = await supabase.rpc('merge_expediente_doc_json', {
                p_expediente_id: exp.id,
                p_field: 'cobro',
                p_value: {
                    completado_at: fechaIso(r[C.fecha]) || new Date().toISOString(),
                    origen: 'tally',
                    tally_submission_id: r[C.id] || null,
                    respuestas,
                    // La cuenta de Tally, enmascarada: el IBAN entero ya vive (o no) en
                    // la ficha del cliente, que es su sitio.
                    iban_tally_mascara: masc(ibanTally),
                    iban_coincide: !!ibanFicha && ibanFicha === ibanTally,
                    importado_at: new Date().toISOString(),
                },
            });
            if (error) { console.log(`   ✗ no se pudo sellar: ${error.message}`); continue; }
        }
        resumen.aplicadas++;
    }

    console.log(`\n${EJECUTAR ? 'Selladas' : 'Se sellarían'}: ${resumen.aplicadas} · ya contestadas en la app: ${resumen.ya_en_app}`
        + ` · sin cliente: ${resumen.sin_cliente} · con duda de expediente: ${resumen.dudosas}`);
    console.log(`Cuentas distintas a la ficha: ${resumen.iban_distinto} · fichas sin cuenta: ${resumen.iban_falta_ficha}\n`);
})().catch(e => { console.error(e.message); process.exit(1); });
