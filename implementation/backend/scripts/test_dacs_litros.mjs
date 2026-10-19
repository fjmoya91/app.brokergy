/**
 * test_dacs_litros.mjs — la D_ACS por LITROS/DÍA del certificado.
 * ---------------------------------------------------------------------------
 * El CEE declara en su apartado de instalaciones de ACS una "Demanda diaria de
 * ACS a 60° (litros/día)". Cuando la trae, esa cifra es un DATO del certificado
 * y no una estimación por dormitorios, así que el técnico la teclea y la D_ACS
 * sale de ella con la misma fórmula del Anejo F, pero SIN el tramo de ocupación
 * (los litros/día ya son los del edificio: multiplicarlos otra vez por el número
 * de personas los multiplicaría por cinco).
 *
 * Lo que se comprueba es lo que no da error cuando se rompe:
 *   · la fórmula, contra el caso de la captura (120 l/día → 2.341,17 kWh/año),
 *   · que NO interviene la ocupación: cambiar los dormitorios no mueve la cifra,
 *   · que las superficies que imprimen D_ACS dicen lo MISMO (CIFO, ficha RES060,
 *     ficha RES093). Ahí había tres copias de la fórmula que solo entendían 'xml'
 *     y 'cte': un expediente en cualquier otro modo imprimía en su ficha una
 *     D_ACS distinta de la de su propio CIFO,
 *   · y que el CIFO dice DE DÓNDE sale el dato (del certificado aportado).
 *
 * No toca la base de datos, ni Drive, ni envía nada.
 *
 *   node implementation/backend/scripts/test_dacs_litros.mjs
 */
const F = '../../frontend/src/features/expedientes';
const { resolveDacs, dacsLitros, dacsCte, ACS_METHOD, CTE_ACS, litrosDelCertificado, litrosDeXmlTexto, ajusteAcsLitros } = await import(`${F}/logic/demandaAcs.js`);
const { ceeToXmlShape } = await import('../../frontend/src/features/cee/ceeExtract.js');
const { deriveCifoData, buildCifoHtml } = await import(`${F}/logic/cifoDoc.js`);
const { deriveFichaRes060 } = await import(`${F}/logic/fichaRes060Html.js`);
const { deriveFichaRes093 } = await import(`${F}/logic/fichaRes093Html.js`);

let ok = 0, ko = 0;
const check = (c, msg, extra) => {
    if (c) { ok++; console.log(`  ✓ ${msg}`); }
    else { ko++; console.log(`  ✗ ${msg}${extra !== undefined ? ` → ${extra}` : ''}`); }
};
const casi = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const fmt = (v) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── El expediente de laboratorio ────────────────────────────────────────────
// Los 120 l/día son los del certificado de la captura que motivó esto. El CEE
// declara además su demanda por m², para que se vea que en modo 'litros' NO se
// usa (y que cambiar de modo cambia de cifra).
const base = () => ({
    numero_expediente: '26RES060_112',
    clientes: { nombre_razon_social: 'CLIENTE', apellidos: 'DE PRUEBA', dni: '12345678Z' },
    prescriptores: { razon_social: 'INSTALADORA S.L.', cif: 'B13000000' },
    instalacion: {
        cambio_acs: true,
        caldera_antigua_cal: { rendimiento_id: 'gas_post98_auto' },
        tipo_emisor: 'radiadores_convencionales',
        aerotermia_cal: { marca: 'SIME', modelo: 'MX 12', numero_serie: 'A1', scop: 3.5 },
        misma_aerotermia_acs: true,
    },
    cee: {
        cee_inicial: { demandaCalefaccion: 100, superficieHabitable: 150, demandaACS: 5.89 },
        cee_final:   { demandaCalefaccion: 100, superficieHabitable: 150, demandaACS: 5.89 },
        num_rooms: 4,
        acs_method: ACS_METHOD.LITROS,
        dacs_litros_dia: 120,
    },
    documentacion: { fecha_inicio_cifo: '2026-05-04', fecha_fin_cifo: '2026-06-18' },
    oportunidades: { ficha: 'RES060', datos_calculo: { zona: 'D3', inputs: {} } },
});
const res = { savingsKwh: 12345, caeBonus: 1200, caeMaintenanceCost: 0 };

console.log('\n1. La fórmula: los litros/día del CEE, sin el tramo de ocupación');
const esperado = 120 * CTE_ACS.CALOR_ESPECIFICO * CTE_ACS.DIAS * CTE_ACS.SALTO_TERMICO;
check(casi(esperado, 2341.1976), `120 l/día → ${esperado.toFixed(4)} kWh/año`, esperado);
check(casi(dacsLitros({ dacs_litros_dia: 120 }), esperado), 'dacsLitros() da ese valor');
check(casi(resolveDacs(base().cee, base().cee.cee_final).value, esperado), 'y resolveDacs también');
check(
    casi(dacsCte({ num_rooms: 4 }), 2731.3996),
    'el modo CTE (28 l · 5 personas) no se ha tocado: 2.731,40',
    dacsCte({ num_rooms: 4 }).toFixed(4),
);

console.log('\n2. La OCUPACIÓN no interviene: el dato ya es del edificio');
const conDorm = (n) => {
    const e = base(); e.cee.num_rooms = n;
    return resolveDacs(e.cee, e.cee.cee_final).value;
};
check(casi(conDorm(1), conDorm(9)), 'cambiar los dormitorios no mueve la cifra', `${conDorm(1)} vs ${conDorm(9)}`);
check(!casi(conDorm(4), dacsCte({ num_rooms: 4 }), 1), 'y no coincide con la estimación por dormitorios');

console.log('\n3. Sin litros tecleados NO se inventa una cifra');
const vacio = base(); delete vacio.cee.dacs_litros_dia;
check(resolveDacs(vacio.cee, vacio.cee.cee_final).value === 0, 'sin dato, D_ACS = 0 (se ve el hueco)');

console.log('\n4. Las superficies del expediente dicen lo MISMO');
const exp = base();
const cifo = deriveCifoData({ expediente: exp, results: res });
const f060 = deriveFichaRes060(exp, res);
const exp93 = base();
exp93.numero_expediente = '26RES093_9';
exp93.oportunidades.ficha = 'RES093';
exp93.instalacion.hibridacion = true;
exp93.instalacion.potencia_bomba = 12;
const f093 = deriveFichaRes093(exp93, res);
check(cifo.dacsStr === fmt(esperado), `el CIFO imprime ${cifo.dacsStr}`, cifo.dacsStr);
check(f060.dacs === cifo.dacsStr, 'la Ficha RES060 imprime lo mismo', f060.dacs);
check(f093.dacs === cifo.dacsStr, 'la Ficha RES093 imprime lo mismo', f093.dacs);

// El mismo expediente en modo CTE: las tres se mueven JUNTAS. Es lo que fallaba
// (las fichas se quedaban en la estimación por dormitorios pasara lo que pasara).
const cte = base(); cte.cee.acs_method = ACS_METHOD.CTE;
const cte93 = base();
cte93.numero_expediente = '26RES093_9';
cte93.oportunidades.ficha = 'RES093';
cte93.cee.acs_method = ACS_METHOD.CTE;
cte93.instalacion.hibridacion = true;
cte93.instalacion.potencia_bomba = 12;
check(deriveCifoData({ expediente: cte, results: res }).dacsStr === fmt(2731.3996), `en modo CTE el CIFO dice ${fmt(2731.3996)}`, deriveCifoData({ expediente: cte, results: res }).dacsStr);
check(deriveFichaRes060(cte, res).dacs === fmt(2731.3996), 'y la ficha RES060 le sigue', deriveFichaRes060(cte, res).dacs);
check(deriveFichaRes093(cte93, res).dacs === fmt(2731.3996), 'y la RES093 también', deriveFichaRes093(cte93, res).dacs);

const man = base(); man.cee.acs_method = ACS_METHOD.MANUAL; man.cee.dacs_manual = 48000;
check(deriveFichaRes060(man, res).dacs === fmt(48000), 'el modo manual (terciario) tampoco se pierde en la ficha', deriveFichaRes060(man, res).dacs);

console.log('\n5. El CIFO dice DE DÓNDE sale el dato');
const html = buildCifoHtml({ data: cifo, appUrl: '' });
check(html.includes('120,00 litros/día a 60 °C'), 'imprime los litros/día declarados');
check(html.includes('Certificado de Eficiencia Energética</b> aportado'), 'y que salen del certificado aportado');
check(html.includes('D<sub>ACS</sub> = D<sub>L/D</sub> · C<sub>e</sub> · 365 · ΔT'), 'la fórmula va SIN N_P');
check(!html.includes('Número de personas consideradas'), 'y no habla de personas consideradas');
check(html.includes(fmt(esperado)), `y el resultado: ${fmt(esperado)} kWh/año`);

console.log('\n6. Fuera de alcance sigue mandando el "no aplica" (regla 12.b)');
const sinAcs = base(); sinAcs.instalacion.cambio_acs = false;
const htmlSinAcs = buildCifoHtml({ data: deriveCifoData({ expediente: sinAcs, results: res }), appUrl: '' });
check(htmlSinAcs.includes('No se actúa sobre el ACS'), 'el documento dice "no aplica"…');
check(!htmlSinAcs.includes('litros/día a 60 °C'), '…y no enseña la demanda diaria');

console.log('\n7. CRITERIO DE LOS VERIFICADORES (19/10/2026): mandan los litros/día del CERTIFICADO');
{
    // 26RES060_113: 112 l/día en los dos certificados y la demanda por m² casi al doble.
    const cee = {
        acs_method: ACS_METHOD.LITROS, dacs_litros_dia: 140,
        cee_inicial: { demandaACS: 13.23, superficieHabitable: 100, acsLitrosDia: 112 },
        cee_final:   { demandaACS: 22.90, superficieHabitable: 100, acsLitrosDia: 112 },
    };
    const r = resolveDacs(cee, cee.cee_final);
    check(casi(r.value, 112 * CTE_ACS.CALOR_ESPECIFICO * CTE_ACS.DIAS * CTE_ACS.SALTO_TERMICO),
        'los del certificado mandan sobre lo tecleado', r.value);
    check(r.litrosDia === 112 && r.litrosFase === 'inicial', 'y se dice que salen del INICIAL', r.litrosFase);
    const soloFin = { ...cee, cee_inicial: { demandaACS: 13.23, superficieHabitable: 100 } };
    check(litrosDelCertificado(soloFin).fase === 'final', 'si el inicial no los trae, los del final');
    const sinNada = { acs_method: ACS_METHOD.LITROS, dacs_litros_dia: 120,
        cee_inicial: { demandaACS: 5, superficieHabitable: 100 } };
    check(resolveDacs(sinNada, {}).litrosFase === 'tecleado', 'sin litros en el CEE, lo tecleado');

    // Recién creado (ya en L/D) y sin ningún CEE: lo simulado, no un 0.
    check(resolveDacs({ acs_method: ACS_METHOD.LITROS }, {}, { demandAcsFallback: 2731.4 }).value === 2731.4,
        'expediente nuevo sin CEE: enseña la D_ACS simulada');
    // Con un CEE cargado que no los dice, 0 (la puerta del documento lo para).
    const sinLitros = { acs_method: ACS_METHOD.LITROS, cee_inicial: { demandaACS: 5, superficieHabitable: 100 } };
    check(resolveDacs(sinLitros, {}, { demandAcsFallback: 2731.4 }).value === 0,
        'con un CEE que no los declara, 0: no se inventa');

    // El ajuste al cargar un certificado.
    const xmlDif = { acs_method: ACS_METHOD.XML, cee_inicial: cee.cee_inicial, cee_final: cee.cee_final };
    const aj = ajusteAcsLitros(xmlDif);
    check(aj?.acs_method === ACS_METHOD.LITROS && aj?.dacs_litros_dia === 112,
        'XML con las demandas distintas → pasa a L/D con 112', JSON.stringify(aj));
    check(ajusteAcsLitros({ ...xmlDif, acs_method: ACS_METHOD.CTE })?.acs_method === ACS_METHOD.LITROS,
        'CTE con las demandas distintas → L/D');
    const iguales = { acs_method: ACS_METHOD.XML,
        cee_inicial: { demandaACS: 13.23, acsLitrosDia: 112 }, cee_final: { demandaACS: 13.30, acsLitrosDia: 112 } };
    check(ajusteAcsLitros(iguales) === null, 'XML con las demandas iguales → no se toca');
    check(ajusteAcsLitros({ ...xmlDif, acs_method: ACS_METHOD.MANUAL }) === null, 'el manual del terciario no se toca');
    const litrosVacio = { acs_method: ACS_METHOD.LITROS, cee_inicial: { acsLitrosDia: 90 } };
    check(ajusteAcsLitros(litrosVacio)?.dacs_litros_dia === 90, 'L/D sin cifra → copia la del certificado');
    check(ajusteAcsLitros({ ...litrosVacio, dacs_litros_dia: 90 }) === null, 'L/D ya al día → nada');

    // Los litros del .xml crudo, que en la BD está en MAYÚSCULAS.
    check(litrosDeXmlTexto('<X><DEMANDADIARIAACS>168.00</DEMANDADIARIAACS></X>') === 168, 'se leen del .xml en MAYÚSCULAS');
    check(litrosDeXmlTexto('<DemandaDiariaACS>140,5</DemandaDiariaACS>') === 140.5, 'y con coma decimal');
    check(litrosDeXmlTexto('') === 0, 'sin .xml, 0');

    // Un CEE leído por OCR del PDF también los lleva.
    const ocr = ceeToXmlShape({ acs_litros_dia: 140, demandas: {}, emisiones: {}, identificacion: {} });
    check(ocr.acsLitrosDia === 140, 'el CEE leído por OCR lleva sus litros/día');

    // El CIFO nombra el certificado del que salen, con los dos cargados.
    const e = base();
    e.cee.cee_inicial.acsLitrosDia = 120;
    const h = buildCifoHtml({ data: deriveCifoData({ expediente: e, results: res }), appUrl: '' });
    check(h.includes('Certificado de Eficiencia Energética inicial</b> aportado'), 'el CIFO dice «certificado … inicial»');
}

console.log(`\n═══ ${ok} bien · ${ko} mal ═══\n`);
process.exit(ko ? 1 : 0);
