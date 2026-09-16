/**
 * revisar_panasonic_r290.js — Repasa la gama PANASONIC Aquarea R290 (Serie M y
 * T-CAP) contra su FICHA TÉCNICA oficial y corrige dos cosas que el catálogo
 * declara mal. En seco por defecto; escribe con `--execute`.
 *
 *   node implementation/backend/scripts/revisar_panasonic_r290.js [--execute]
 *
 * ── 1. Un ACCESORIO no es una UNIDAD INTERIOR ───────────────────────────────
 * Siete filas declaran `CZ-RTW2TAW1C` como unidad interior. La ficha lo lista en
 * su apartado **Accesorios** y lo define así:
 *
 *   «CZ-RTW2TAW1C — Mando de pared con adaptador Wi-Fi (necesario para unidades
 *    exteriores independientes). Serie M»
 *
 * O sea: es el mando que se pone cuando la unidad exterior se monta SOLA, que es
 * el montaje normal de esta gama —el hidráulico va dentro de la propia unidad
 * exterior (la ficha se titula «Aquarea High Performance hidráulico serie M
 * unidad exterior»: bomba clase A y filtro magnético incorporados)—. No hay
 * ningún aparato dentro de la vivienda.
 *
 * Declararlo como unidad interior no es cosmético: ese campo se COPIA al
 * expediente al elegir el modelo y de ahí lo imprimen el Anexo I («Ud. interior:
 * …») y el CIFO. Medido el 16/09/2026: **7 expedientes** lo llevan escrito, uno
 * de ellos ya enviado a verificador. Y con la regla de las placas, un desplegable
 * que anuncia una unidad interior invita a buscar una placa que no existe.
 *
 * Las unidades interiores REALES de la gama son otras y ya están en el catálogo:
 * el hidrokit mural `WH-SDC0916M3E5` (bi-bloc) y los All in One `WH-ADC…`.
 *
 * ── 2. El SCOP de CALEFACCIÓN no es el COP de ACS ───────────────────────────
 * Diez filas All in One (las de 185 y 260 l) tienen en las casillas de
 * calefacción los valores de la fila «ERP del depósito ACS» de la ficha. Se ve
 * porque coinciden byte a byte con su propio `scop_dhw_*`, y porque sus hermanas
 * de 120 l —mismo aparato exterior— declaran 6,20/4,34.
 *
 * El SCOP de calefacción depende SOLO de la unidad exterior: la ficha lo publica
 * en una tabla por unidad exterior, sin mirar qué depósito lleve dentro. Por eso
 * la tabla de abajo va indexada por la unidad exterior y nada más.
 *
 * REGLA — se corrige la CALEFACCIÓN y no se toca el ACS: los `scop_dhw_*` y los
 * `eta_acs_*` ya son los de la ficha (comprobado fila a fila), y son los que
 * distinguen un depósito de 120 l de uno de 260.
 */
require('dotenv').config();
const supabase = require('../services/supabaseClient');

const EXECUTE = process.argv.includes('--execute');

//: Tabla de la FICHA (pág. 1, «Eficiencia energética estacional SCOP (η,s %)»),
//: indexada por unidad exterior porque es de lo único que depende.
//: clima templado = `medio` en el catálogo; clima cálido = `calido`.
const FICHA = {
    'WH-WDG12ME5': { c35: 6.20, c55: 4.34, m35: 4.65, m55: 3.50, ec35: 245, ec55: 171, em35: 183, em55: 137 },
    'WH-WDG16ME5': { c35: 6.20, c55: 4.34, m35: 4.58, m55: 3.58, ec35: 245, ec55: 171, em35: 180, em55: 140 },
    'WH-WDG09ME8': { c35: 6.01, c55: 4.17, m35: 4.84, m55: 3.57, ec35: 237, ec55: 164, em35: 191, em55: 140 },
    'WH-WDG12ME8': { c35: 6.20, c55: 4.34, m35: 4.65, m55: 3.58, ec35: 245, ec55: 171, em35: 183, em55: 140 },
    'WH-WDG16ME8': { c35: 6.20, c55: 4.34, m35: 4.58, m55: 3.58, ec35: 245, ec55: 171, em35: 180, em55: 140 },
};

//: Accesorios que alguien metió en la casilla de unidad interior. Se listan por
//: su referencia EXACTA: un prefijo `CZ-` cazaría también referencias legítimas
//: de otras marcas el día que las haya.
const ACCESORIOS = ['CZ-RTW2TAW1C', 'CZ-RTW2-1', 'CZ-NS6P', 'CZ-NS7P', 'CZ-NV3'];

const n = (v) => (v === null || v === undefined ? null : Number(v));
const dif = (a, b) => n(a) !== null && n(b) !== null && Math.abs(n(a) - n(b)) > 0.005;

(async () => {
    const { data: cat, error } = await supabase
        .from('aerotermia')
        .select('id,marca,modelo_comercial,tipo,potencia_calefaccion,modelo_ud_exterior,modelo_ud_interior,modelo_conjunto,scop_cal_calido_35,scop_cal_calido_55,scop_cal_medio_35,scop_cal_medio_55,eta_calida_35,eta_calida_55,eta_media_35,eta_media_55,scop_dhw_calido,scop_dhw_medio,litros_acs')
        .eq('marca', 'PANASONIC');
    if (error) throw error;

    const cambios = [];

    // ── 1. El accesorio sale de la casilla de unidad interior ────────────────
    for (const r of cat) {
        if (!ACCESORIOS.includes(String(r.modelo_ud_interior || '').toUpperCase())) continue;
        const mando = r.modelo_ud_interior;
        // El nombre del conjunto lo cita también, y es lo que se enseña cuando no
        // hay referencias de placa. Se reescribe diciendo lo que de verdad es.
        const fases = /\(3f\)/i.test(r.modelo_conjunto || '') ? ' (3f)' : (/\(1f\)/i.test(r.modelo_conjunto || '') ? ' (1f)' : '');
        const conjunto = `${r.modelo_comercial} ${r.modelo_ud_exterior}${fases} — solo unidad exterior, sin módulo interior`;
        cambios.push({
            id: r.id,
            aplicar: true,
            que: 'accesorio-como-ud-interior',
            titulo: `${r.modelo_comercial} · ${r.potencia_calefaccion} kW · ${r.modelo_ud_exterior}`,
            detalle: [`ud. interior: "${mando}" (es un mando de pared) -> (ninguna)`,
                      `conjunto: "${r.modelo_conjunto}" -> "${conjunto}"`],
            update: { modelo_ud_interior: null, modelo_conjunto: conjunto },
        });
    }

    // ── 2. El SCOP de calefacción, de la tabla de la ficha ───────────────────
    for (const r of cat) {
        const f = FICHA[String(r.modelo_ud_exterior || '').toUpperCase()];
        if (!f) continue;
        const campos = {
            scop_cal_calido_35: f.c35, scop_cal_calido_55: f.c55,
            scop_cal_medio_35: f.m35, scop_cal_medio_55: f.m55,
            eta_calida_35: f.ec35, eta_calida_55: f.ec55,
            eta_media_35: f.em35, eta_media_55: f.em55,
        };
        const malos = Object.entries(campos).filter(([k, v]) => dif(r[k], v));
        if (!malos.length) continue;
        // Que el valor guardado sea EXACTAMENTE su propio COP de ACS es la huella
        // del fallo; se dice, porque no es lo mismo una errata que una copia.
        const esCopiaDeAcs = n(r.scop_cal_calido_35) === n(r.scop_dhw_calido)
            && n(r.scop_cal_calido_55) === n(r.scop_dhw_medio);
        cambios.push({
            id: r.id,
            // REGLA - solo se ESCRIBE lo demostrado. Que el valor sea exactamente
            // el COP de ACS de esa misma fila no admite otra lectura, y una fila sin
            // unidad interior ES la propia unidad exterior de la tabla. Una
            // diferencia suelta en una COMBINACION (exterior + hidrokit) puede ser su
            // SCOP declarado como sistema, que la ficha de la unidad exterior no
            // publica: ahi se avisa y decide una persona con el EPREL delante.
            aplicar: esCopiaDeAcs || !r.modelo_ud_interior,
            que: esCopiaDeAcs ? 'scop-de-ACS-en-calefaccion' : 'scop-no-coincide-con-la-ficha',
            titulo: `${r.modelo_comercial} · ${r.potencia_calefaccion} kW · ${r.modelo_ud_exterior}${r.litros_acs ? ` · ${r.litros_acs} L` : ''}`,
            detalle: malos.map(([k, v]) => `${k}: ${r[k]} -> ${v}`),
            update: Object.fromEntries(malos),
        });
    }

    if (!cambios.length) { console.log('Nada que corregir.'); process.exit(0); }

    // ── Quién usa cada fila ──────────────────────────────────────────────────
    // Corregir el catálogo NO reescribe lo ya guardado: al elegir un modelo, el
    // expediente se queda con su propia COPIA de marca, modelo y referencias. Por
    // eso una corrección aquí es segura para lo que está en marcha — pero hay que
    // saber a quién habrá que repasar después, y con qué urgencia.
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

    console.log(`\n${EXECUTE ? 'APLICANDO' : 'EN SECO (usa --execute para escribir)'} — ${cambios.length} filas\n`);
    for (const c of cambios) {
        console.log(`  id ${String(c.id).padEnd(4)} [${c.que}]${c.aplicar ? '' : ' (SOLO AVISO)'}  ${c.titulo}`);
        c.detalle.forEach(d => console.log(`        ${d}`));
        const usos = enUso.get(Number(c.id)) || [];
        console.log(usos.length
            ? `        EN USO por ${usos.length}: ${usos.join(', ')}`
            : '        sin uso — no hay nada guardado con esta fila');
    }

    if (!EXECUTE) { console.log('\nNada escrito.'); process.exit(0); }

    let escritas = 0;
    for (const c of cambios.filter(x => x.aplicar)) {
        const { error: e } = await supabase.from('aerotermia').update(c.update).eq('id', c.id);
        if (e) console.error(`  ! id ${c.id}: ${e.message}`);
        else escritas++;
    }
    const avisos = cambios.filter(x => !x.aplicar).length;
    console.log(`\nHecho: ${escritas} filas corregidas${avisos ? `, ${avisos} dejada(s) como aviso - decide una persona` : ''}.`);
    process.exit(0);
})();
