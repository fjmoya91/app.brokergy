/**
 * revisar_aerosun_confort_cop.js — Repasa el COP A7/55 de la Serie CONFORT de
 * AEROSUN (NTII-9/12/17/22 IIEN) contra su ENSAYO OFICIAL. En seco por
 * defecto; escribe con `--execute`.
 *
 *   node implementation/backend/scripts/revisar_aerosun_confort_cop.js [--execute]
 *
 * ── De dónde sale el 3,00 de la NTII-12IIEN ──────────────────────────────
 * No está en la ficha técnica comercial (esa solo publica el SCOP estacional
 * y el COP a 30/35°C). Está en la PLACA DE CARACTERÍSTICAS, que el propio
 * informe de ensayo SGS reproduce en su página 3 ("Copy of marking plate"):
 * la fila "Air 7/6°C Inlet/Outlet water 47/55°C · COP" viene como RANGO
 * (el equipo modula), y el valor que se usa en el Anexo VI es el MÁXIMO del
 * rango — mismo criterio que `elegirPotencia()` en placaOcrService.js.
 *
 * Comprobado en el ensayo de la NTII-12IIEN (SGS GZEE231000389831, pág. 3):
 * COP 2,70-3,00 W/W -> 3,00. Coincide exactamente con lo que ya hay en la BD
 * y con lo que justifica el documento "SCOPdhw AEROSUN 12" (Anexo VI, Caso 3).
 *
 * ── Los otros dos, del MISMO sitio en su propio ensayo ───────────────────
 * NTII-9IIEN  (SGS GZEE231000389731, pág. 3): COP 2,61-3,10 W/W -> 3,10
 * NTII-17IIEN (SGS GZEE231000390031, pág. 3): COP 2,90-3,03 W/W -> 3,03
 *
 * ── NTII-22IIEN: ESTIMADO por analogía, a petición expresa (2026-09-17) ──
 * No hay ensayo SGS suyo en el Drive de AEROSUN (solo existen para 9, 12 y
 * 17 kW), así que este valor NO sale de un ensayo propio — es una estimación
 * pedida explícitamente, apoyada en que la NTII-22IIEN es la MISMA carcasa
 * que la NTII-17IIEN (1030×456×1322 mm, 129 kg frente a 127 kg) y declara
 * exactamente el mismo SCOP 55°C clima cálido (4,33 en las dos, según la
 * ficha técnica), así que se le asigna el COP A7/55 de su hermana: 3,03.
 * Queda marcada como ESTIMADA y no como medida — si algún día aparece su
 * propio ensayo, ese valor manda sobre este.
 */
require('dotenv').config();
const supabase = require('../services/supabaseClient');

const EXECUTE = process.argv.includes('--execute');

//: Tabla del ENSAYO (placa de características, pág. 3 de cada informe SGS),
//: indexada por el modelo de la unidad exterior tal y como consta en el
//: informe. Fuente: los propios PDF "9KW---DSS_GZEE231000389731.pdf",
//: "12KW--DSS_GZEE231000389831.pdf", "17KW--DSS_GZEE231000390031.pdf".
const ENSAYO = {
    'NTII-9IIEN':  { cop_a7_55: 3.10, fuente: 'medido', origen: 'placa del ensayo SGS GZEE231000389731 (COP 2,61-3,10 W/W, máximo del rango)' },
    'NTII-12IIEN': { cop_a7_55: 3.00, fuente: 'medido', origen: 'placa del ensayo SGS GZEE231000389831 (COP 2,70-3,00 W/W, máximo del rango)' },
    'NTII-17IIEN': { cop_a7_55: 3.03, fuente: 'medido', origen: 'placa del ensayo SGS GZEE231000390031 (COP 2,90-3,03 W/W, máximo del rango)' },
    // Sin ensayo propio: ESTIMADO por analogía con la NTII-17IIEN (misma
    // carcasa 1030x456x1322mm y mismo SCOP 55°C cálido=4,33) — pedido
    // explícitamente el 2026-09-17. Si aparece su ensayo, ese manda.
    'NTII-22IIEN': { cop_a7_55: 3.03, fuente: 'estimado', origen: 'ESTIMADO por analogía con la NTII-17IIEN (misma carcasa y mismo SCOP 55°C cálido=4,33) — sin ensayo propio' },
};

const n = (v) => (v === null || v === undefined ? null : Number(v));
const dif = (a, b) => {
    const na = n(a);
    const nb = n(b);
    if (na === null && nb === null) return false;
    if (na === null || nb === null) return true; // un hueco frente a un valor SÍ es una diferencia
    return Math.abs(na - nb) > 0.005;
};

const modeloDelEnsayo = (r) => {
    const texto = `${r.modelo_ud_exterior || ''} ${r.modelo_conjunto || ''}`.toUpperCase();
    return Object.keys(ENSAYO).find((k) => texto.includes(k));
};

(async () => {
    const { data: cat, error } = await supabase
        .from('aerotermia')
        .select('id,marca,modelo_comercial,modelo_ud_exterior,modelo_conjunto,cop_a7_55,is_validated')
        .eq('marca', 'AEROSUN');
    if (error) throw error;

    const cambios = [];

    for (const r of cat) {
        const clave = modeloDelEnsayo(r);
        if (!clave) continue; // no es de la Serie Confort NTII (Advanced/Confort Plus/ACS quedan fuera de este repaso)
        const e = ENSAYO[clave];
        if (!dif(r.cop_a7_55, e.cop_a7_55)) continue;
        cambios.push({
            id: r.id,
            titulo: `${r.modelo_comercial} · ${clave}`,
            fuente: e.fuente,
            detalle: `cop_a7_55: ${r.cop_a7_55 ?? '(vacío)'} -> ${e.cop_a7_55} — ${e.origen}`,
            update: { cop_a7_55: e.cop_a7_55 },
        });
    }

    console.log(`\n${EXECUTE ? 'APLICANDO' : 'EN SECO (usa --execute para escribir)'} — ${cambios.length} filas\n`);
    for (const c of cambios) {
        console.log(`  id ${String(c.id).padEnd(4)} [${c.fuente}]  ${c.titulo}`);
        console.log(`        ${c.detalle}`);
    }

    if (!cambios.length) { console.log('\nNada que corregir.'); process.exit(0); }

    // ── Quién usa cada fila ──────────────────────────────────────────────
    const enUso = new Map();
    const marcar = (id, quien) => { if (!id) return; const k = Number(id); if (!enUso.has(k)) enUso.set(k, []); enUso.get(k).push(quien); };
    const { data: exps } = await supabase.from('expedientes').select('numero_expediente,estado,instalacion');
    for (const e of exps || []) {
        const i = e.instalacion || {};
        for (const nodo of [i.aerotermia_cal, i.aerotermia_acs, ...(i.aerotermia_cal?.equipos_extra || [])].filter(Boolean)) {
            marcar(nodo.aerotermia_db_id, `${e.numero_expediente} (${e.estado})`);
        }
    }
    const { data: opps } = await supabase.from('oportunidades').select('id,datos_calculo');
    for (const o of opps || []) {
        const inp = o.datos_calculo?.inputs || {};
        const est = o.datos_calculo?.estado || '';
        marcar(inp.aerothermiaModel, `oportunidad ${String(o.id).slice(0, 8)} (${est})`);
        marcar(inp.aerothermiaModelAcs, `oportunidad ${String(o.id).slice(0, 8)} ACS (${est})`);
    }
    for (const c of cambios) {
        const usos = enUso.get(Number(c.id)) || [];
        console.log(usos.length
            ? `        EN USO por ${usos.length}: ${usos.join(', ')}`
            : '        sin uso — no hay nada guardado con esta fila');
    }

    if (!EXECUTE) { console.log('\nNada escrito.'); process.exit(0); }

    let escritas = 0;
    for (const c of cambios) {
        const { error: e } = await supabase.from('aerotermia').update(c.update).eq('id', c.id);
        if (e) console.error(`  ! id ${c.id}: ${e.message}`);
        else escritas++;
    }
    console.log(`\nHecho: ${escritas} filas corregidas.`);
    process.exit(0);
})();
