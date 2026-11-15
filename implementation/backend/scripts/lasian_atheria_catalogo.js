// ============================================================================
// lasian_atheria_catalogo.js — da de alta la gama LASIAN ATHERIA (100/150/200/300,
// R290, tarifa 2026) en el catálogo de ACS y corrige los expedientes que la llevan.
// ----------------------------------------------------------------------------
// NO CONFUNDIR con la ATHERIA «S2» (110/150/200/250 S2, ids 81/90/169/170/171):
// es OTRA gama, con otros SCOP. Se distinguen por la placa: la nueva tiene
// nº de serie «…GHHBS…Q7…» (26RES060_172 y _164) y la S2, otro patrón (_141).
//
// Fuente: «FT - JUSTIFICACION SCOP LASIAN ATHERIA 100-150-200-300.pdf» (carpeta
// ACS del catálogo), pág. 28 de la tarifa: «SCOP a 7 °C / EN 16147» 2,63 · 2,89 ·
// 2,97 · 3,02. Va en clima MEDIO (aire a 7 °C), como la id 593 que la abrió:
// Anexo VI caso 1 (conjunto suministrado por el fabricante, dato al menos en
// clima medio). Con el cálido vacío, `scopAcsCatalogo` cae al medio.
//
// La id 593 (24/10/2026) ES la ATHERIA 100 nueva —su ficha es la tarifa 2026 y
// la placa con COP 2,65— pero nació con el nombre «S2»: se le quita.
//
//   node scripts/lasian_atheria_catalogo.js            (en seco)
//   node scripts/lasian_atheria_catalogo.js --execute  (escribe)
// ============================================================================
require('dotenv').config({ quiet: true });
const supabase = require('../services/supabaseClient');
const { renameFolder } = require('../services/driveService');
const { asegurarFichaTecnica } = require('../services/fichaTecnicaSlot');

const EXEC = process.argv.includes('--execute');
const FT_GAMA = 'https://drive.google.com/file/d/1lKLsuYeKFhFWW0WkA52Hyp2pd2vsoAuk/view?usp=drivesdk';
const ID_100 = 593;
const FT_100_DRIVE_ID = '1CXmPGZYB_FIxOPqE_Z1jBlSBR2IQYaf6';

const GAMA = [
    { litros: 100, scop: 2.63, kw: 0.80 },
    { litros: 150, scop: 2.89, kw: 0.84 },
    { litros: 200, scop: 2.97, kw: 1.18 },
    { litros: 300, scop: 3.02, kw: 1.30 },
];
const nombre = (l) => `LASIAN ATHERIA ${l}`;
const fila = (g) => ({
    marca: 'LASIAN',
    modelo_comercial: nombre(g.litros),
    modelo_conjunto: `BOMBA CALOR ACS ${nombre(g.litros)}`,
    modelo_ud_interior: nombre(g.litros),
    tipo: 'MONOBLOCK',
    potencia_calefaccion: g.kw,          // la de la BOMBA, no la resistencia (regla 118)
    deposito_acs_incluido: true,
    litros_acs: g.litros,
    refrigerante: 'R290',
    scop_dhw_medio: g.scop,
    scop_dhw_calido: null,
    is_validated: true,
});

// Expedientes que llevan la ATHERIA nueva: { número → litros del modelo }.
// 172 ya está en la 593 (solo cambia el nombre); 164 está en la 200 S2 por error
// (Fran: es una ATHERIA 200); 225 la tecleó sin catálogo y con un SCOP 3,0.
const EXPEDIENTES = { '26RES060_172': 100, '26RES060_164': 200, '26RES060_225': 100 };

// Mismo snapshot que escribe el desplegable de ACS (InstalacionModule.handleModelChange).
function snapshot(prev, m) {
    return {
        ...prev,
        scop_temporada: null,
        aerotermia_db_id: m.id,
        modelo_sin_repetir: true,
        marca: m.marca,
        modelo: m.modelo_comercial,
        modelo_ud_exterior: '',
        modelo_ud_interior: m.modelo_ud_interior,
        modelo_conjunto: m.modelo_conjunto,
        scop: m.scop_dhw_medio,
        potencia: m.potencia_calefaccion,
        metodo_scop: 'ficha',
        url_eprel: null,
        url_keymark: null,
        url_ficha: m.ficha_tecnica,
        litros: m.litros_acs,
    };
}

(async () => {
    console.log(EXEC ? '== ESCRIBE ==' : '== EN SECO (sin --execute no se escribe nada) ==');
    const porLitros = {};

    for (const g of GAMA) {
        const datos = fila(g);
        if (g.litros === 100) {
            const { data: cur } = await supabase.from('aerotermia').select('*').eq('id', ID_100).single();
            const cambios = Object.fromEntries(Object.entries(datos).filter(([k, v]) => cur[k] !== v));
            console.log(`id ${ID_100} (${cur.modelo_comercial}) →`, cambios);
            if (EXEC && Object.keys(cambios).length) {
                const { error } = await supabase.from('aerotermia').update(cambios).eq('id', ID_100);
                if (error) throw error;
                await renameFolder(FT_100_DRIVE_ID, 'LASIAN ATHERIA 100 - FT.pdf');
            }
            porLitros[100] = { ...cur, ...cambios };
            continue;
        }
        const { data: ya } = await supabase.from('aerotermia').select('*')
            .eq('marca', 'LASIAN').eq('modelo_comercial', datos.modelo_comercial).maybeSingle();
        if (ya) { console.log(`ya existe id ${ya.id} ${ya.modelo_comercial}`); porLitros[g.litros] = ya; continue; }
        const nueva = { ...datos, ficha_tecnica: FT_GAMA };
        console.log('ALTA', nueva.modelo_comercial, `SCOPdhw medio ${g.scop}`, `${g.litros} l`);
        if (EXEC) {
            const { data, error } = await supabase.from('aerotermia').insert([nueva]).select().single();
            if (error) throw error;
            porLitros[g.litros] = data;
            console.log('   → id', data.id);
        } else porLitros[g.litros] = { ...nueva, id: `(nueva ${g.litros})` };
    }

    for (const [num, litros] of Object.entries(EXPEDIENTES)) {
        const { data: exp } = await supabase.from('expedientes')
            .select('id, oportunidad_id, numero_expediente, estado, instalacion, documentacion')
            .eq('numero_expediente', num).single();
        const prev = exp.instalacion.aerotermia_acs || {};
        const nuevo = snapshot(prev, porLitros[litros]);
        const dif = Object.keys(nuevo).filter(k => JSON.stringify(prev[k]) !== JSON.stringify(nuevo[k]))
            .map(k => `${k}: ${JSON.stringify(prev[k])} → ${JSON.stringify(nuevo[k])}`);
        console.log(`\n${num} [${exp.estado}] serie ${prev.numero_serie || '(sin serie)'}`);
        dif.forEach(d => console.log('   ', d));
        const cambiaFicha = prev.aerotermia_db_id !== nuevo.aerotermia_db_id;
        if (!EXEC) { if (cambiaFicha) console.log('    + ficha técnica de ACS: se vuelve a copiar del catálogo (⟳)'); continue; }

        const instalacion = { ...exp.instalacion, aerotermia_acs: nuevo };
        const { error } = await supabase.from('expedientes')
            .update({ instalacion, updated_at: new Date().toISOString() }).eq('id', exp.id);
        if (error) throw error;
        exp.instalacion = instalacion;
        if (cambiaFicha) {
            const r = await asegurarFichaTecnica(exp, 'acs', { force: true });
            console.log('    ficha ACS:', r.ok ? `${r.fileName} (${r.link})` : `FALLO ${r.error}`);
        }
    }
    console.log('\nNo se tocan las S2 (81, 90, 169, 170, 171). 26RES060_203 sigue en la 200 S2: sin nº de serie, no se sabe cuál es.');
})().catch(e => { console.error(e); process.exit(1); });
