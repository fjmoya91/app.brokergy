// ============================================================================
// test_acs_conjunto.mjs — un CONJUNTO resuelve el ACS solo, y el desplegable de
// ACS no ofrece equipos que no puedan justificar su SCOP_dhw.
//
//   node implementation/backend/scripts/test_acs_conjunto.mjs
//
// Los apartados 1-5 son puros (sin BD). El 6 barre el catálogo REAL si hay
// credenciales de Supabase en el .env; si no las hay, se salta y lo dice — el
// test tiene que poder pasarse sin acceso a producción.
// ============================================================================
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const front = (rel) => pathToFileURL(path.join(__dirname, '../../frontend/src', rel)).href;

const {
    metodoAcsDelModelo, produceAcs, esConjuntoAcs, nodoAcsDesdeConjunto,
    litrosAcsCatalogo, scopDhwFicha, etaAcsEprel, FALTA_ACS,
} = await import(front('features/expedientes/logic/acsCatalogo.js'));
const { acsEsOtraMaquina, mismaMaquina, getUnidades } =
    await import(front('features/expedientes/logic/aerotermiaUnits.js'));
const { getScopAcsFromModel } = await import(front('features/calculator/logic/calculation.js'));

let fallos = 0;
const ok = (cond, msg) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
    if (!cond) fallos++;
};
const sec = (t) => console.log(`\n${t}`);

// ── 1. La cascada: ficha → Anexo IV → (solo si NO es conjunto) Anexo VI ──────
sec('1. De dónde sale el SCOP_dhw de cada modelo');
{
    const conFicha = { deposito_acs_incluido: true, scop_dhw_calido: 3.1, eta_acs_calida: 127, cop_a7_55: 3.3 };
    ok(metodoAcsDelModelo(conFicha, 'D3').metodo === 'ficha',
       'la ficha técnica MANDA cuando declara el SCOP para ACS');

    const soloEta = { deposito_acs_incluido: true, eta_acs_calida: 127 };
    const r = metodoAcsDelModelo(soloEta, 'D3');
    ok(r.metodo === 'conjunto' && r.justifica === 'eprel',
       'sin ficha, un conjunto se calcula por el Anexo IV y lo justifica el EPREL');

    // El Anexo VI es literalmente "depósito NO suministrado como conjunto".
    const conjSoloCop = { deposito_acs_incluido: true, cop_a7_55: 3.15 };
    ok(metodoAcsDelModelo(conjSoloCop, 'D3').metodo === null,
       'el Anexo VI NO se aplica a un conjunto aunque tenga COP A7/55');
    ok(metodoAcsDelModelo(conjSoloCop, 'D3').falta === FALTA_ACS.ETA_EPREL,
       'y lo que pide es el η_wh del EPREL, que es el dato que falta');

    ok(metodoAcsDelModelo({ deposito_acs_incluido: false, cop_a7_55: 3.15 }, 'D3').metodo === 'independiente',
       'con el depósito APARTE sí se aplica el Anexo VI');

    ok(metodoAcsDelModelo({ deposito_acs_incluido: false }, 'D3').falta === FALTA_ACS.SIN_DATOS,
       'sin ningún dato no se inventa un método');
}

// ── 2. La zona elige la columna, igual que getScopAcsFromModel ───────────────
sec('2. La zona climática elige la MISMA columna que el cálculo');
{
    const m = { scop_dhw_calido: 3.4, scop_dhw_medio: 2.8, eta_acs_calida: 130, eta_acs_media: 110 };
    ok(scopDhwFicha(m, 'D3') === 3.4 && scopDhwFicha(m, 'E1') === 2.8,
       'D3 → columna cálida · E1 → columna media (SCOP de ficha)');
    ok(etaAcsEprel(m, 'D3') === 130 && etaAcsEprel(m, 'E1') === 110,
       'D3 → columna cálida · E1 → columna media (η_wh)');
    // El valor real lo da calculation.js: aquí se comprueba que el método elegido
    // produce EXACTAMENTE ese valor, que es lo que se declara.
    ok(getScopAcsFromModel(m, 'D3', metodoAcsDelModelo(m, 'D3').metodo) === 3.4,
       'el método elegido produce el SCOP de la ficha, sin recalcular nada aquí');
    const soloEta = { eta_acs_calida: 128 };
    ok(getScopAcsFromModel(soloEta, 'D3', metodoAcsDelModelo(soloEta, 'D3').metodo) === 3.2,
       'Anexo IV: 2,5 · 128 % = 3,20');
}

// ── 3. El filtro del desplegable de ACS ─────────────────────────────────────
sec('3. Qué modelos se ofrecen en la columna de ACS');
{
    ok(produceAcs({ scop_dhw_medio: 2.8 }, 'D3'), 'sale el que declara SCOP_dhw de ficha');
    ok(produceAcs({ eta_acs_calida: 127 }, 'D3'), 'sale el que tiene η_wh del EPREL');
    ok(produceAcs({ cop_a7_55: 3.1 }, 'D3'), 'sale el que tiene COP A7/55');
    ok(!produceAcs({ deposito_acs_incluido: true }, 'D3'),
       'NO sale el que no tiene ningún dato, aunque lleve depósito');
    ok(!produceAcs({ scop_dhw_medio: 0, eta_acs_media: 0, cop_a7_55: 0 }, 'D3'),
       'el catálogo guarda 0 como "no consta": no cuenta como dato');
}

// ── 4. El nodo de ACS que deja un conjunto ──────────────────────────────────
sec('4. El nodo de ACS que rellena un conjunto');
{
    const model = { id: 7, marca: 'PANASONIC', deposito_acs_incluido: true, litros_acs: 185,
                    scop_dhw_calido: 3.0, eprel: 'https://eprel/7', ficha_tecnica: 'https://drive/ft' };
    const cal = { aerotermia_db_id: 7, marca: 'PANASONIC', modelo: 'AQUAREA', numero_serie: 'S-1',
                  scop: 4.34, scop_propio: 4.34, equipos_extra: [{ aerotermia_db_id: 7, numero_serie: 'S-2' }] };
    const metodo = metodoAcsDelModelo(model, 'D3').metodo;
    const acs = nodoAcsDesdeConjunto(cal, model, {
        metodo, scop: getScopAcsFromModel(model, 'D3', metodo), litros: litrosAcsCatalogo(model),
    });

    ok(acs.scop === 3.0, 'el SCOP del ACS es el SUYO (3,00), no el de calefacción (4,34)');
    ok(acs.numero_serie === 'S-1' && acs.aerotermia_db_id === 7,
       'conserva modelo y nº de serie: es la MISMA máquina');
    ok(acs.litros === 185, 'arrastra los litros de acumulación del catálogo');
    ok(getUnidades(acs).length === 1,
       'NO arrastra la cascada de calefacción: un conjunto es una sola máquina');
    ok(acs.url_eprel === 'https://eprel/7' && acs.url_ficha === 'https://drive/ft',
       'se lleva los justificantes del modelo para que el CIFO los adjunte');

    // Lo que ve el resto de la app: una máquina, no dos.
    const inst = { misma_aerotermia_acs: false, aerotermia_cal: cal, aerotermia_acs: acs };
    ok(mismaMaquina(acs, cal), 'los dos nodos nombran la misma máquina');
    ok(!acsEsOtraMaquina(inst),
       'y por eso NO se le pide una segunda serie ni salta el aviso de series repetidas');
}

// ── 5. Cuando el ACS sí es otro equipo ──────────────────────────────────────
sec('5. Cuando el ACS lo hace OTRO equipo, se sigue exigiendo aparte');
{
    const cal = { aerotermia_db_id: 7, marca: 'PANASONIC', modelo: 'AQUAREA', numero_serie: 'S-1' };
    const otro = { aerotermia_db_id: 9, marca: 'DAIKIN', modelo: 'EBLA', numero_serie: '' };
    ok(acsEsOtraMaquina({ misma_aerotermia_acs: false, aerotermia_cal: cal, aerotermia_acs: otro }),
       'un modelo distinto sí es una segunda máquina');
    ok(!acsEsOtraMaquina({ misma_aerotermia_acs: true, aerotermia_cal: cal, aerotermia_acs: { ...cal } }),
       'con el flag de siempre en true, el ACS no es otra máquina');
    // Un nodo de ACS VACÍO con el flag en false sigue siendo un equipo por
    // declarar, no un conjunto resuelto: darlo por hecho escondería justo lo que
    // falta por rellenar (es la misma razón por la que `mismaMaquina` exige que
    // los dos nodos estén IDENTIFICADOS). Se conserva el comportamiento de antes.
    ok(acsEsOtraMaquina({ misma_aerotermia_acs: false, aerotermia_cal: cal, aerotermia_acs: {} }),
       'un ACS declarado aparte y aún sin rellenar se sigue reclamando');
}

// ── 6. El catálogo REAL ─────────────────────────────────────────────────────
sec('6. Barrido del catálogo real');
try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.join(__dirname, '../.env'), quiet: true });
    const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!URL_ || !KEY) throw new Error('sin credenciales');
    // Por REST y no con supabase-js: su cliente deja handles abiertos y el
    // process.exit() del final revienta libuv en Windows con un assert.
    const cols = 'id,marca,modelo_comercial,deposito_acs_incluido,litros_acs,scop_dhw_calido,scop_dhw_medio,eta_acs_calida,eta_acs_media,cop_a7_55';
    const res = await fetch(`${URL_}/rest/v1/aerotermia?select=${cols}&limit=2000`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) throw new Error(`REST ${res.status}`);
    const data = await res.json();

    const zona = 'D3';
    const conj = data.filter(esConjuntoAcs);
    const autoRellenan = conj.filter(m => metodoAcsDelModelo(m, zona).metodo);
    const piden = conj.filter(m => metodoAcsDelModelo(m, zona).falta === FALTA_ACS.ETA_EPREL);
    const ofrecidos = data.filter(m => produceAcs(m, zona));

    console.log(`  · ${data.length} modelos · ${conj.length} conjuntos`);
    console.log(`  · ${autoRellenan.length} conjuntos rellenan el ACS solos · ${piden.length} piden el EPREL`);
    console.log(`  · ${ofrecidos.length} se ofrecen en el desplegable de ACS`);

    ok(autoRellenan.length + piden.length === conj.length,
       'todo conjunto o se rellena solo o pide el EPREL: ninguno se queda en tierra de nadie');

    // Lo que este trabajo viene a impedir: que un modelo elegible en ACS acabe
    // declarando el 3,0 por defecto de getScopAcsFromModel.
    const porDefecto = ofrecidos.filter(m => {
        const met = metodoAcsDelModelo(m, zona).metodo;
        return met && getScopAcsFromModel(m, zona, met) === 3.0 && !(scopDhwFicha(m, zona) === 3.0);
    });
    ok(porDefecto.length === 0,
       `ningún modelo ofrecido en ACS cae al 3,0 por defecto (${porDefecto.length} lo harían)`);

    const sinLitros = conj.filter(m => !litrosAcsCatalogo(m));
    console.log(`  · aviso: ${sinLitros.length} conjuntos no tienen litros de acumulación en el catálogo`);
} catch (e) {
    console.log(`  — se salta (${e.message}): el barrido necesita credenciales de Supabase.`);
}

console.log(fallos === 0 ? '\n✅ Todo correcto.\n' : `\n❌ ${fallos} comprobación(es) fallida(s).\n`);
// `process.exitCode` y no `process.exit()`: con una conexion keep-alive todavia
// viva, salir a la fuerza revienta libuv en Windows con un assert que se lee
// como si el test hubiera fallado.
process.exitCode = fallos === 0 ? 0 : 1;
