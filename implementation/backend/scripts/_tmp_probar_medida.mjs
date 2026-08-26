// Prueba de buildMedidaMejora contra expedientes REALES.
// Uso: node probar_medida.mjs [26RES060_175 ...]   (sin args: una muestra variada)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildMedidaMejora } from 'file:///C:/Proyectos/app.brokergy/implementation/frontend/src/features/expedientes/logic/ce3xFinal.js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nums = process.argv.slice(2);

const SEL = 'numero_expediente, instalacion, cee, documentacion, oportunidades(datos_calculo)';

let q = sb.from('expedientes').select(SEL);
if (nums.length) q = q.in('numero_expediente', nums);
else q = q.limit(400);

const { data, error } = await q;
if (error) { console.error(error.message); process.exit(1); }

// El SEER vive en el catálogo, no en el expediente.
const { data: cat } = await sb.from('aerotermia').select('id, marca, modelo_comercial, modelo_ud_exterior, seer');
const modelos = Object.fromEntries((cat || []).map(m => [m.id, m]));

const filas = [];
for (const e of data) {
    const m = buildMedidaMejora(e, { modelos });
    if (!m) continue;
    const inst = e.instalacion || {};
    const rasgos = [
        (inst.aerotermia_cal?.equipos_extra?.length > 0) && 'cascada',
        inst.hibridacion && 'hibridacion',
        inst.cambio_acs === false && 'sin-acs',
        inst.misma_aerotermia_acs && 'acs-mismo-equipo',
        inst.aerotermia_acs?.tipo_equipo_nuevo === 'termo_electrico' && 'termo',
        inst.aerotermia_acs?.tipo_equipo_nuevo === 'acumulador' && 'acumulador',
        ['splits', 'conductos'].includes(String(inst.tipo_emisor || '').toLowerCase()) && 'aire-aire',
        String(inst.tipo_emisor || '').toLowerCase() === 'suelo_radiante' && 'con-frio',
        m.faltan.length && `FALTA:${m.faltan.join('+')}`,
        m.aviso && 'AVISO-ENVOLVENTE',
    ].filter(Boolean).join(' ');
    filas.push({ n: e.numero_expediente, rasgos, texto: m.texto });
}

// Sin argumentos: una muestra que cubra cada rasgo distinto, no las 400 iguales.
const vistos = new Set();
const muestra = nums.length ? filas : filas.filter(f => {
    if (vistos.has(f.rasgos)) return false;
    vistos.add(f.rasgos); return true;
});

for (const f of muestra) {
    console.log(`\n── ${f.n}${f.rasgos ? `  [${f.rasgos}]` : ''}`);
    console.log(f.texto);
}
console.log(`\n${muestra.length} casos distintos, de ${filas.length} expedientes con equipo declarado.`);
process.exit(0);
