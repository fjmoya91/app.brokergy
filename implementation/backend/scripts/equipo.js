// El TABLERO DEL EQUIPO DE AGENTES (regla 246): qué obra es de quién, hoy.
// SOLO LEE. No escribe en la BD, no envía nada y no arranca ninguna sesión.
//
//   node scripts/equipo.js resumen [--rol …] [--buscar "texto"] [--urgentes] [--top N | --todo] [--json]
//        Lo que lee Fran cuando pregunta «¿cómo vamos?»: una entrada por OBRA con el
//        cliente, el pueblo, el instalador, lo pendiente, cuándo empieza la obra, cómo
//        están sus CEE y qué toca hacer. Primero las obras que empiezan sin el CEE
//        inicial registrado. `--buscar` filtra por instalador, cliente, pueblo o número.
//   node scripts/equipo.js tablero [--rol comercial|tecnico|responsable|direccion] [--vencidas] [--json]
//        Toda la cartera viva repartida por papel: las oportunidades en captación
//        (COMERCIAL), los bloques del radar del parte (cada uno con su dueño), lo que
//        está en REQUERIMIENTO (TÉCNICO) y lo LISTO PARA AUDITAR (RESPONSABLE).
//        `--vencidas`: solo lo que ya ha pasado el plazo de su bloque.
//   node scripts/equipo.js obra 26RES060_245 | 26RES060_OP318 [--json]
//        De quién es ESA obra ahora y qué tiene pendiente. Lo usa la sesión de una
//        obra al empezar, para saber con qué papel trabaja.
//
// El criterio de lo pendiente es el del RADAR del parte (services/seguimientoRadar.js),
// no uno propio: aquí solo se le pone dueño a cada fila (utils/equipoRoles.js).
const path = require('path');
// Los servicios vuelven a cargar el .env sin `quiet`, y su línea de aviso va a la salida
// estándar: rompería el `--json` de quien lo lee.
process.env.DOTENV_CONFIG_QUIET = 'true';
require(path.join(__dirname, '../node_modules/dotenv')).config({ path: path.join(__dirname, '../.env'), quiet: true });
const supabase = require('../services/supabaseClient');
const radar = require('../services/seguimientoRadar');
const eq = require('../utils/equipoRoles');

const args = process.argv.slice(2);
const ORDEN = args[0];
const opt = (k) => { const i = args.indexOf(k); return i > 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const flag = (k) => args.includes(k);

const dias = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

// Las oportunidades en CAPTACIÓN, con campos concretos del JSONB (regla 22): es la
// misma proyección que `GET /api/oportunidades/captacion`.
async function captacion() {
    const { data, error } = await supabase
        .from('oportunidades')
        .select(`id, id_oportunidad, referencia_cliente, prescriptor_id, instalador_asociado_id, created_at,
                 estado:datos_calculo->>estado,
                 origen:datos_calculo->>origen,
                 bono:datos_calculo->result->financials->>caeBonus`)
        .in('datos_calculo->>estado', Object.keys(eq.CAPTACION));
    if (error) throw new Error(`oportunidades: ${error.message}`);
    const vivas = (data || []).filter(o => o.origen !== 'migracion_xml');
    if (!vivas.length) return [];

    // «Mandan los hechos, no la etiqueta»: una oportunidad con expediente ya no es
    // captación aunque su estado diga otra cosa. Por lotes: un `.in()` con cientos de
    // ids desborda las cabeceras.
    const conExpediente = new Set();
    for (let i = 0; i < vivas.length; i += 100) {
        const { data: exps, error: eErr } = await supabase
            .from('expedientes').select('oportunidad_id')
            .in('oportunidad_id', vivas.slice(i, i + 100).map(o => o.id));
        if (eErr) throw new Error(`expedientes: ${eErr.message}`);
        for (const e of exps || []) conExpediente.add(e.oportunidad_id);
    }
    const partners = await nombresPartner(vivas.flatMap(o => [o.instalador_asociado_id, o.prescriptor_id]));
    return vivas.filter(o => !conExpediente.has(o.id)).map(o => {
        const estado = String(o.estado || '').toUpperCase();
        const pid = o.instalador_asociado_id || o.prescriptor_id;
        return {
            rol: 'COMERCIAL',
            obra: o.id_oportunidad,
            cliente: o.referencia_cliente || null,
            partner: (pid && String(pid) !== '1') ? partners.get(String(pid)) || null : null,
            bloque: estado,
            que: eq.CAPTACION[estado].que,
            dias: dias(o.created_at),
            vencida: true,
            detalle: null,
            bono: Number.isFinite(parseFloat(o.bono)) ? Math.round(parseFloat(o.bono)) : null,
        };
    });
}

async function nombresPartner(ids) {
    const unicos = [...new Set(ids.filter(Boolean).map(String))].filter(id => id !== '1');
    const map = new Map();
    for (let i = 0; i < unicos.length; i += 100) {
        const { data } = await supabase.from('prescriptores')
            .select('id_empresa, razon_social, acronimo').in('id_empresa', unicos.slice(i, i + 100));
        for (const p of data || []) map.set(String(p.id_empresa), p.acronimo || p.razon_social || null);
    }
    return map;
}

// Lo que el radar no dice: lo que está en REQUERIMIENTO y lo que ya no tiene nada
// pendiente y nadie ha auditado. Escalares, nunca `documentacion` entera.
async function fueraDelRadar() {
    const { data, error } = await supabase
        .from('expedientes')
        .select(`id, numero_expediente, estado, cliente_id, lote_id, created_at,
                 anexo_i_signed:documentacion->>anexo_i_signed_link,
                 anexo_cesion_signed:documentacion->>anexo_cesion_signed_link,
                 cert_cifo_signed:documentacion->>cert_cifo_signed_link,
                 cert_cifo_signed_ts:documentacion->>cert_cifo_signed_at,
                 reg_fin:documentacion->>fecha_registro_cee_final`)
        .is('lote_id', null)
        .not('estado', 'in', '("FINALIZADO","RECHAZADO","DOC. COMPLETA","DOC. COMPLETA APPSHEET")');
    if (error) throw new Error(`expedientes: ${error.message}`);
    const out = [];
    for (const e of data || []) {
        if (eq.enRequerimiento(e)) {
            out.push({ rol: 'TECNICO', expediente_id: e.id, cliente_id: e.cliente_id, obra: e.numero_expediente,
                bloque: 'REQUERIMIENTO', que: 'En requerimiento: subsanar y volver a pasar la revisión',
                dias: null, vencida: true, detalle: e.estado });
        } else if (eq.listoParaAuditar(e)) {
            out.push({ rol: 'RESPONSABLE', expediente_id: e.id, cliente_id: e.cliente_id, obra: e.numero_expediente,
                bloque: 'LISTO_PARA_AUDITAR', que: 'Todo firmado y CEE final registrado: auditar antes de DOC. COMPLETA',
                dias: dias(e.cert_cifo_signed_ts), vencida: true, detalle: e.estado });
        }
    }
    const cliIds = [...new Set(out.map(f => f.cliente_id).filter(Boolean))];
    const nombres = new Map();
    for (let i = 0; i < cliIds.length; i += 100) {
        const { data: cs } = await supabase.from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos').in('id_cliente', cliIds.slice(i, i + 100));
        for (const c of cs || []) nombres.set(c.id_cliente, `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim());
    }
    for (const f of out) f.cliente = nombres.get(f.cliente_id) || null;
    return out;
}

// Las filas del radar, con su dueño.
async function delRadar() {
    const filas = await radar.escanear();
    return filas.map(f => ({
        rol: eq.rolDeBloque(f.bloque) || 'DIRECCION',
        sin_duenio: !eq.rolDeBloque(f.bloque),
        expediente_id: f.expediente_id,
        obra: f.numero_expediente,
        cliente: f.cliente_nombre || null,
        partner: f.instalador_nombre || null,
        municipio: f.municipio || null,
        certificador: f.certificador_nombre || null,
        bloque: f.bloque,
        que: radar.BLOQUES[f.bloque].titulo,
        dias: f.dias,
        vencida: f.vencida,
        detalle: f.detalle || null,
        responsable: f.responsable || null,
    }));
}

async function todo() {
    const [a, b, c] = await Promise.all([captacion(), delRadar(), fueraDelRadar()]);
    // Lo listo para auditar que AÚN sale en un bloque del técnico no está listo: el
    // radar ve más que estos cuatro campos (un rechazo, una re-firma, el anexo
    // fotográfico) y manda él.
    const conPendienteTecnico = new Set(b.filter(f => f.rol === 'TECNICO').map(f => f.expediente_id));
    return [...a, ...b, ...c.filter(f => !(f.bloque === 'LISTO_PARA_AUDITAR' && conPendienteTecnico.has(f.expediente_id)))];
}

const ALIAS_ROL = { comercial: 'COMERCIAL', tecnico: 'TECNICO', responsable: 'RESPONSABLE', 'responsable-tecnico': 'RESPONSABLE', direccion: 'DIRECCION', director: 'DIRECCION' };

function pintar(filas) {
    const orden = ['COMERCIAL', 'TECNICO', 'RESPONSABLE', 'DIRECCION'];
    for (const rol of orden) {
        const mias = filas.filter(f => f.rol === rol);
        if (!mias.length) continue;
        const obras = new Set(mias.map(f => f.obra));
        console.log(`\n══ ${eq.ROLES[rol].titulo} — ${mias.length} pendientes en ${obras.size} obras (${eq.ROLES[rol].tramo})`);
        const porBloque = new Map();
        for (const f of mias) { if (!porBloque.has(f.bloque)) porBloque.set(f.bloque, []); porBloque.get(f.bloque).push(f); }
        for (const [bloque, items] of porBloque) {
            const vencidas = items.filter(f => f.vencida).length;
            console.log(`\n  ${items[0].que} [${bloque}] — ${items.length}${vencidas !== items.length ? ` (${vencidas} fuera de plazo)` : ''}`);
            items.sort((x, y) => (y.dias ?? -1) - (x.dias ?? -1));
            for (const f of items) {
                const d = f.dias == null ? 's/f' : `${f.dias} d`;
                const quien = [f.cliente, f.partner && `(${f.partner})`].filter(Boolean).join(' ');
                console.log(`    ${String(f.obra).padEnd(18)} ${d.padStart(6)}  ${quien}${f.vencida ? '' : '  · en plazo'}${f.detalle ? `\n${' '.repeat(31)}${String(f.detalle).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
            }
        }
    }
    const sinDuenio = [...new Set(filas.filter(f => f.sin_duenio).map(f => f.bloque))];
    if (sinDuenio.length) console.log(`\n⚠ Bloques del radar SIN dueño en utils/equipoRoles.js (van a DIRECCIÓN): ${sinDuenio.join(', ')}`);
}

async function tablero() {
    let filas = await todo();
    const rol = opt('--rol');
    if (rol) {
        const r = ALIAS_ROL[rol.toLowerCase()];
        if (!r) throw new Error(`Papel desconocido: ${rol}. Valen: comercial, tecnico, responsable, direccion.`);
        filas = filas.filter(f => f.rol === r);
    }
    if (flag('--vencidas')) filas = filas.filter(f => f.vencida);
    if (flag('--json')) { console.log(JSON.stringify(filas, null, 1)); return; }
    pintar(filas);
    const cuenta = (r) => new Set(filas.filter(f => f.rol === r).map(f => f.obra)).size;
    console.log(`\nObras con algo pendiente — comercial ${cuenta('COMERCIAL')} · técnico ${cuenta('TECNICO')} · responsable ${cuenta('RESPONSABLE')} · dirección ${cuenta('DIRECCION')}`);
}

async function obra() {
    const ref = String(args[1] || '').trim().toUpperCase();
    if (!ref) throw new Error('Falta la obra: un nº de expediente (26RES060_245) o de oportunidad (26RES060_OP318).');
    let exp = null; let opp = null;
    if (/_OP\d+$/.test(ref)) {
        const { data } = await supabase.from('oportunidades')
            .select('id, id_oportunidad, referencia_cliente, estado:datos_calculo->>estado').eq('id_oportunidad', ref).maybeSingle();
        opp = data;
        if (!opp) throw new Error(`No existe la oportunidad ${ref}.`);
        const { data: e } = await supabase.from('expedientes').select('id, numero_expediente, estado, lote_id').eq('oportunidad_id', opp.id).maybeSingle();
        exp = e;
    } else {
        const { data } = await supabase.from('expedientes').select('id, numero_expediente, estado, lote_id, oportunidad_id').eq('numero_expediente', ref).maybeSingle();
        exp = data;
        if (!exp) throw new Error(`No existe el expediente ${ref}.`);
    }

    let res;
    if (!exp) {
        const estado = String(opp.estado || '').toUpperCase();
        const rol = eq.rolDeOportunidad(estado);
        res = { obra: opp.id_oportunidad, cliente: opp.referencia_cliente, estado, rol,
            pendientes: rol ? [{ bloque: estado, que: eq.CAPTACION[estado].que }] : [],
            nota: rol ? null : `Oportunidad ${estado || 'sin estado'} y sin expediente: no es de nadie del equipo.` };
    } else {
        const filas = (await todo()).filter(f => f.expediente_id === exp.id);
        // El dueño es el del pendiente más grave (el radar ya ordena por gravedad); sin
        // pendientes, lo dice el estado.
        let rol = filas[0]?.rol || null; let nota = null;
        if (!rol) {
            if (exp.lote_id) { rol = 'DIRECCION'; nota = 'Está en un lote: lo que venga del verificador se reparte desde dirección.'; }
            else if (eq.ESTADOS_TRAS_EL_TECNICO.includes(String(exp.estado).toUpperCase())) { rol = 'DIRECCION'; nota = 'Completo y sin lotear dentro de plazo.'; }
            else { rol = 'TECNICO'; nota = 'Sin nada vencido ni pendiente en el radar: el expediente sigue su curso.'; }
        }
        res = { obra: exp.numero_expediente, estado: exp.estado, rol,
            pendientes: filas.map(f => ({ rol: f.rol, bloque: f.bloque, que: f.que, dias: f.dias, vencida: f.vencida, detalle: f.detalle })), nota };
    }
    if (flag('--json')) { console.log(JSON.stringify(res, null, 1)); return; }
    console.log(`${res.obra}${res.cliente ? ` — ${res.cliente}` : ''} · estado ${res.estado}`);
    console.log(`Dueño ahora: ${res.rol ? `${eq.ROLES[res.rol].titulo} (.claude/agents/${eq.ROLES[res.rol].agente}.md)` : 'nadie'}`);
    for (const p of res.pendientes) console.log(`  - ${p.rol && p.rol !== res.rol ? `[${eq.ROLES[p.rol].titulo}] ` : ''}${p.que}${p.dias != null ? ` · ${p.dias} d` : ''}${p.detalle ? ` · ${String(p.detalle).replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
    if (res.nota) console.log(res.nota);
}

// ─── El RESUMEN: lo que Fran lee para decir «ponte con este» ──────────────────
// Una entrada por OBRA (no por pendiente), con quién es, de qué instalador, dónde, qué
// tiene pendiente, cuándo empieza la obra y qué toca hacer. Lo urgente lo decide el
// código, no quien lo redacta: primero la obra que EMPIEZA sin el CEE inicial
// registrado (el plazo de logic/fechasPrevistas.js, el mismo que pinta la app), después
// el orden de clases de dirección.
const ddmm = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}` : null; };
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function datosDeObra(ids) {
    const map = new Map();
    for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('expedientes')
            .select(`id, prioridad,
                     fpi:instalacion->>fecha_prevista_inicio, fpf:instalacion->>fecha_prevista_fin,
                     mun:instalacion->>municipio,
                     ci:seguimiento->>cee_inicial, cf:seguimiento->>cee_final,
                     reg_ini:documentacion->>fecha_registro_cee_inicial,
                     fin_obra:documentacion->>fecha_fin_obra_comunicada`)
            .in('id', ids.slice(i, i + 100));
        if (error) throw new Error(`expedientes: ${error.message}`);
        for (const e of data || []) map.set(e.id, e);
    }
    return map;
}

async function construirResumen() {
    const { pathToFileURL } = require('url');
    const plazo = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/fechasPrevistas.js')).href);
    const filas = await todo();
    const extra = await datosDeObra([...new Set(filas.map(f => f.expediente_id).filter(Boolean))]);

    const obras = new Map();
    for (const f of filas) {
        if (!obras.has(f.obra)) obras.set(f.obra, { obra: f.obra, ficha: eq.fichaDe(f.obra), expediente_id: f.expediente_id || null, pendientes: [] });
        const o = obras.get(f.obra);
        o.cliente = o.cliente || f.cliente || null;
        o.instalador = o.instalador || f.partner || null;
        o.municipio = o.municipio || f.municipio || null;
        o.certificador = o.certificador || f.certificador || null;
        if (f.bono != null) o.bono = f.bono;
        o.pendientes.push({ rol: f.rol, bloque: f.bloque, que: f.que, detalle: f.detalle || null, dias: f.dias, vencida: f.vencida,
            siguiente: eq.SIGUIENTE[f.bloque] || null, clase: eq.claseDe(f.bloque) });
    }

    const out = [];
    for (const o of obras.values()) {
        // El pendiente que manda: por clase y, dentro, el que más días lleva.
        o.pendientes.sort((a, b) => (a.clase - b.clase) || (Number(b.vencida) - Number(a.vencida)) || ((b.dias ?? -1) - (a.dias ?? -1)));
        const p = o.pendientes[0];
        o.rol = p.rol;
        o.siguiente = p.siguiente;
        o.peso = 10 + p.clase;
        const e = o.expediente_id ? extra.get(o.expediente_id) : null;
        if (e) {
            o.municipio = o.municipio || e.mun || null;
            o.prioridad = e.prioridad && e.prioridad !== 'NORMAL' ? e.prioridad : null;
            o.cee_inicial = e.ci || null;
            o.cee_final = e.cf || null;
            if (e.fpi || e.fpf) {
                o.obra_prevista = { inicio: e.fpi || null, fin: e.fpf || null,
                    dias_inicio: plazo.diasHasta(e.fpi), dias_fin: plazo.diasHasta(e.fpf) };
            }
            const registrado = e.ci === 'REGISTRADO' || !!e.reg_ini;
            const pl = plazo.estadoPlazoCeeInicial(e.fpi, registrado);
            if (['vencido', 'critico', 'aviso'].includes(pl.nivel)) {
                o.urgente = { nivel: pl.nivel, texto: pl.nivel === 'vencido'
                    ? `${pl.texto} registrado (inicio previsto el ${ddmm(e.fpi)})`
                    : `${pl.texto} (${ddmm(e.fpi)}) y el CEE inicial no está registrado` };
                // Con la fecha ya pasada no se puede «llegar antes»: lo que toca es saber si
                // la obra ha empezado de verdad, porque el CEE inicial tiene que estar
                // firmado antes de la primera factura (cee/…con-la-obra-ya-facturada…).
                o.siguiente = pl.nivel === 'vencido'
                    ? `confirmar con el instalador si la obra ha empezado (el CEE inicial va firmado antes de la primera factura) y, ya: ${p.siguiente}`
                    : `tener el CEE inicial registrado antes del ${ddmm(e.fpi)}; ahora: ${p.siguiente}`;
                o.peso = plazo.PESO_PLAZO[pl.nivel];
            }
        }
        if (o.rol === 'COMERCIAL') {
            // En captación manda lo vivo: la aceptación de palabra, y después lo más
            // reciente (una propuesta sin enviar de hace ocho meses ya no espera a nadie).
            o.peso = 20 + (p.bloque === 'PRE-ACEPTADO' ? 0 : p.bloque === 'ENVIADA' ? 2 : 1);
        }
        o.dias = p.dias;
        out.push(o);
    }
    out.sort((a, b) => (a.peso - b.peso)
        || (a.rol === 'COMERCIAL' ? ((a.dias ?? 9999) - (b.dias ?? 9999)) : ((b.dias ?? -1) - (a.dias ?? -1))));
    return out;
}

function pintarObra(o, n) {
    const cab = [o.obra, o.cliente, o.municipio, o.instalador && `inst. ${o.instalador}`, o.bono != null && `bono ${o.bono.toLocaleString('es-ES')} €`, o.prioridad && `prioridad ${o.prioridad}`]
        .filter(Boolean).join(' · ');
    console.log(`\n${n}. ${cab}`);
    if (o.urgente) console.log(`   URGENTE: ${o.urgente.texto}`);
    for (const p of o.pendientes.slice(0, 3)) {
        const d = p.dias == null ? '' : ` · ${p.dias} d${p.vencida ? '' : ' (en plazo)'}`;
        console.log(`   Pendiente [${eq.ROLES[p.rol].titulo}]: ${p.que}${p.detalle && p.detalle !== p.que ? ` — ${String(p.detalle).replace(/\s+/g, ' ').slice(0, 140)}` : ''}${d}`);
    }
    if (o.pendientes.length > 3) console.log(`   … y ${o.pendientes.length - 3} pendiente(s) más`);
    if (o.obra_prevista) {
        const { inicio, fin, dias_inicio: di, dias_fin: df } = o.obra_prevista;
        const cuando = di == null ? '' : di > 0 ? ` (empieza en ${di} d)` : df != null && df >= 0 ? ` (en obra; acaba en ${df} d)` : df != null ? ` (tenía que acabar hace ${-df} d)` : ` (empezó hace ${-di} d)`;
        console.log(`   Obra prevista: ${ddmm(inicio) || '¿?'} → ${ddmm(fin) || '¿?'}${cuando} · CEE inicial ${o.cee_inicial || 's/d'} · CEE final ${o.cee_final || 's/d'}`);
    } else if (o.expediente_id) {
        console.log(`   Sin fecha prevista de obra · CEE inicial ${o.cee_inicial || 's/d'} · CEE final ${o.cee_final || 's/d'}`);
    }
    if (o.siguiente) console.log(`   Siguiente: ${o.siguiente}`);
}

async function resumen() {
    let obras = await construirResumen();
    const totales = {};
    for (const o of obras) totales[o.rol] = (totales[o.rol] || 0) + 1;
    const urgentes = obras.filter(o => o.urgente).length;

    const rol = opt('--rol');
    if (rol) {
        const r = ALIAS_ROL[rol.toLowerCase()];
        if (!r) throw new Error(`Papel desconocido: ${rol}. Valen: comercial, tecnico, responsable, direccion.`);
        obras = obras.filter(o => o.rol === r);
    }
    const buscar = opt('--buscar');
    if (buscar) {
        const q = sinTildes(buscar);
        obras = obras.filter(o => [o.obra, o.cliente, o.instalador, o.municipio, o.certificador].some(v => sinTildes(v).includes(q)));
    }
    if (flag('--urgentes')) obras = obras.filter(o => o.urgente);

    const top = flag('--todo') ? Infinity : (parseInt(opt('--top'), 10) || 12);
    if (flag('--json')) { console.log(JSON.stringify({ totales, urgentes, obras: obras.slice(0, top) }, null, 1)); return; }

    console.log(`Obras con algo pendiente — comercial ${totales.COMERCIAL || 0} · técnico ${totales.TECNICO || 0} · responsable ${totales.RESPONSABLE || 0} · dirección ${totales.DIRECCION || 0}`);
    console.log(`Con la obra encima y el CEE inicial sin registrar: ${urgentes}`);
    // Sin filtro de papel, las oportunidades van aparte: mezcladas con los expedientes
    // no se sabría qué se está comparando con qué.
    if (!rol) {
        const exps = obras.filter(o => o.rol !== 'COMERCIAL');
        const ops = obras.filter(o => o.rol === 'COMERCIAL');
        console.log(`\n── EXPEDIENTES (${Math.min(top, exps.length)} de ${exps.length}, por urgencia)`);
        exps.slice(0, top).forEach((o, i) => pintarObra(o, i + 1));
        const nOps = Math.min(Math.ceil(top / 2), ops.length);
        console.log(`\n── OPORTUNIDADES (${nOps} de ${ops.length}; primero las aceptadas de palabra y lo más reciente)`);
        ops.slice(0, nOps).forEach((o, i) => pintarObra(o, i + 1));
    } else {
        console.log(`\n── ${eq.ROLES[ALIAS_ROL[rol.toLowerCase()]].titulo} (${Math.min(top, obras.length)} de ${obras.length})`);
        obras.slice(0, top).forEach((o, i) => pintarObra(o, i + 1));
    }
}

(async () => {
    if (ORDEN === 'tablero') await tablero();
    else if (ORDEN === 'obra') await obra();
    else if (ORDEN === 'resumen') await resumen();
    else console.log('Uso: node scripts/equipo.js resumen [--rol …] [--buscar "instalador, cliente o pueblo"] [--urgentes] [--top N | --todo] [--json]\n     node scripts/equipo.js tablero [--rol comercial|tecnico|responsable|direccion] [--vencidas] [--json]\n     node scripts/equipo.js obra <nº de expediente | nº de oportunidad> [--json]');
})().catch(err => { console.error(`✖ ${err.message}`); process.exitCode = 1; })
    // Salir en el acto con una conexión cerrándose tumba node en Windows (aserción de libuv).
    .finally(() => setTimeout(() => process.exit(process.exitCode || 0), 150));
