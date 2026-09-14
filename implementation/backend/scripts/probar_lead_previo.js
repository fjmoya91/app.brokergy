/**
 * Comprueba el emparejamiento contra la BASE DE VERDAD, sin dar de alta nada:
 * solo lee. Simula que el titular de un LEAD existente vuelve a rellenar el
 * formulario público y comprueba que se reconoce su oportunidad en vez de
 * estrenar otra.
 *
 *   node implementation/backend/scripts/probar_lead_previo.js [REF_CATASTRAL]
 *
 * Sin argumento coge el LEAD más reciente que tenga teléfono.
 */

const supabase = require('../services/supabaseClient');
const { buscarLeadPrevio } = require('../services/leadService');

(async () => {
    const rcArg = process.argv[2];

    let fila;
    if (rcArg) {
        const { data } = await supabase
            .from('oportunidades')
            .select('ref_catastral, id_oportunidad, cliente_id, datos_calculo')
            .eq('ref_catastral', rcArg)
            .order('created_at', { ascending: false })
            .limit(1);
        fila = data?.[0];
    } else {
        const { data } = await supabase
            .from('oportunidades')
            .select('ref_catastral, id_oportunidad, cliente_id, datos_calculo')
            .not('ref_catastral', 'is', null)
            .neq('ref_catastral', 'MANUAL')
            .order('created_at', { ascending: false })
            .limit(60);
        fila = (data || []).find(o => o.datos_calculo?.estado === 'LEAD' && o.cliente_id);
    }

    if (!fila) {
        console.log('No hay ningún LEAD con referencia catastral con el que probar.');
        process.exit(0);
    }

    const { data: cli } = await supabase
        .from('clientes')
        .select('id_cliente, nombre_razon_social, apellidos, email, dni, tlf')
        .eq('id_cliente', fila.cliente_id)
        .maybeSingle();

    console.log(`\nLEAD de prueba: ${fila.id_oportunidad}  ·  RC ${fila.ref_catastral}`);
    console.log(`Titular: ${cli?.nombre_razon_social || '?'} ${cli?.apellidos || ''}`.trim());
    console.log(`  email: ${cli?.email || '—'}   dni: ${cli?.dni || '—'}   tlf: ${cli?.tlf || '—'}\n`);

    const casos = [
        {
            titulo: 'Vuelve con el MISMO teléfono pero escrito con +34',
            contacto: { tlf: cli?.tlf ? '+34' + String(cli.tlf).replace(/\D/g, '').slice(-9) : null },
            espera: !!cli?.tlf
        },
        {
            titulo: 'Vuelve con el mismo teléfono sin prefijo y con espacios',
            contacto: { tlf: cli?.tlf ? String(cli.tlf).replace(/\D/g, '').slice(-9).replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4') : null },
            espera: !!cli?.tlf
        },
        {
            titulo: 'Vuelve con el mismo email',
            contacto: { email: cli?.email ? String(cli.email).toUpperCase() : null },
            espera: !!cli?.email
        },
        {
            titulo: 'OTRA persona pide presupuesto para la misma vivienda',
            contacto: { email: 'nadie-de-esta-casa@ejemplo.invalid', tlf: '600000000' },
            espera: false
        },
        {
            titulo: 'Alguien sin ningún dato de contacto',
            contacto: {},
            espera: false
        }
    ];

    let fallos = 0;
    for (const c of casos) {
        if (c.espera && !c.contacto.tlf && !c.contacto.email) {
            console.log(`  –  ${c.titulo} (este titular no tiene ese dato, se salta)`);
            continue;
        }
        const encontrado = await buscarLeadPrevio(fila.ref_catastral, c.contacto);
        const ok = c.espera ? encontrado?.id_oportunidad === fila.id_oportunidad : !encontrado;
        if (!ok) fallos++;
        console.log(`${ok ? '  ✓' : '  ✗'} ${c.titulo} → ${encontrado ? 'reutiliza ' + encontrado.id_oportunidad : 'alta nueva'}`);
    }

    console.log(fallos === 0 ? '\n✅ Todo correcto (no se ha escrito nada)\n' : `\n❌ ${fallos} fallo(s)\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
