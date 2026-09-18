/**
 * test_dacs_fase_inicial.mjs — la demanda de ACS sale del CEE INICIAL.
 * ---------------------------------------------------------------------------
 * Criterio del verificador (2026-09-17): la demanda de ACS tiene que ser LA
 * MISMA en el CEE inicial y en el final, y si no lo es, manda la del INICIAL.
 * Es la excepción a la regla general de `ceeFases.js` —con CEE final cargado
 * manda el final— y solo afecta al ACS: la demanda de calefacción y la
 * superficie siguen saliendo del certificado que manda, porque ahí el final SÍ
 * recoge el resultado de la obra.
 *
 * Lo que se comprueba es lo que no da error cuando se rompe:
 *   · con las dos cifras distintas, la D_ACS es la del INICIAL,
 *   · el CIFO imprime ESA cifra y dice de qué certificado sale: si el párrafo
 *     de justificación cogiera sus factores del final, el documento enseñaría
 *     una multiplicación cuyo producto no es el D_ACS de su propia tabla,
 *   · las tres superficies que imprimen D_ACS dicen lo MISMO,
 *   · un inicial SIN demanda de ACS (el caso de un CEE leído por OCR: el PDF
 *     no imprime esa tabla) no deja el expediente a cero — se usa la del final
 *     y se AVISA, que es lo que permite saber que falta su .xml,
 *   · la calefacción y la superficie NO han cambiado de fase,
 *   · y los avisos previos a generar dicen lo que de verdad va a pasar.
 *
 * No toca la base de datos, ni Drive, ni envía nada.
 *
 *   node implementation/backend/scripts/test_dacs_fase_inicial.mjs
 */
const F = '../../frontend/src/features/expedientes';
const { resolveDacs, baseAcs, ACS_METHOD } = await import(`${F}/logic/demandaAcs.js`);
const { avisosCeeDocumento, AVISO, ceeBaseDocumento } = await import(`${F}/logic/ceeFases.js`);
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
// Dos certificados que NO coinciden en la demanda de ACS (5,89 frente a 12,40)
// y sí en la superficie. La demanda de calefacción baja, como en cualquier obra.
const SUP = 150;
const ACS_INI = 5.89;
const ACS_FIN = 12.40;

const base = () => ({
    numero_expediente: '26RES060_999',
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
        acs_method: ACS_METHOD.XML,
        num_rooms: 4,
        cee_inicial: { demandaCalefaccion: 120, superficieHabitable: SUP, demandaACS: ACS_INI },
        cee_final: { demandaCalefaccion: 95, superficieHabitable: SUP, demandaACS: ACS_FIN },
    },
    documentacion: { fecha_inicio_cifo: '2026-05-04', fecha_fin_cifo: '2026-06-18' },
    oportunidades: { ficha: 'RES060', datos_calculo: { zona: 'D3', inputs: {} } },
});
const res = { savingsKwh: 12345, caeBonus: 1200, caeMaintenanceCost: 0 };
const cifoDe = (e) => deriveCifoData({ expediente: e, results: res });
const htmlDe = (e) => buildCifoHtml({ data: cifoDe(e), appUrl: '' });
const res093 = () => {
    const e = base();
    e.numero_expediente = '26RES093_9';
    e.oportunidades.ficha = 'RES093';
    e.instalacion.hibridacion = true;
    e.instalacion.potencia_bomba = 12;
    return e;
};

const D_INI = ACS_INI * SUP;   // 883,50 kWh/año
const D_FIN = ACS_FIN * SUP;   // 1.860,00 kWh/año

console.log('\n1. Con las dos cifras distintas manda el INICIAL');
{
    const e = base();
    const r = resolveDacs(e.cee, ceeBaseDocumento(e.cee).base);
    check(casi(r.value, D_INI), `D_ACS = ${fmt(r.value)} kWh/año (la del inicial)`, fmt(r.value));
    check(!casi(r.value, D_FIN), 'y NO la del final', fmt(D_FIN));
    check(r.acsFase === 'inicial', 'lo dice: acsFase = inicial', r.acsFase);
    check(r.acsDifiere === true, 'y que los dos certificados no coinciden');
    check(casi(r.dacsPorM2, ACS_INI), 'el factor por m² es el del inicial', r.dacsPorM2);
}

console.log('\n2. La CALEFACCIÓN y la SUPERFICIE siguen saliendo del FINAL');
{
    const e = base();
    const { base: b, fase } = ceeBaseDocumento(e.cee);
    check(fase === 'final', 'el CEE que manda sigue siendo el final');
    check(b.demandaCalefaccion === 95, 'la demanda de calefacción es la del final', b.demandaCalefaccion);
    const d = cifoDe(e);
    check(d.dcal === '95,00', `el CIFO imprime D_CAL = ${d.dcal}`, d.dcal);
    check(d.sStr === fmt(SUP), `y S = ${d.sStr} m²`, d.sStr);
}

console.log('\n3. El CIFO imprime la del inicial, y dice de dónde sale');
{
    const e = base();
    const d = cifoDe(e);
    check(d.dacsStr === fmt(D_INI), `la tabla de variables dice D_ACS = ${d.dacsStr}`, d.dacsStr);
    const html = htmlDe(e);
    check(html.includes(`${fmt(ACS_INI)} kWh/m²·año`), 'el párrafo imprime el factor del inicial');
    check(!html.includes(`${fmt(ACS_FIN)} kWh/m²·año`), 'y no el del final');
    check(html.includes('certificado de eficiencia energética inicial'), 'y nombra el certificado INICIAL');
    // El producto de los dos factores impresos TIENE que ser el D_ACS declarado:
    // es lo primero que rehace el verificador con una calculadora.
    check(html.includes(`da como resultado <b style="color:#1A1A1A;">${fmt(D_INI)} kWh/año`),
        'y el producto de los factores impresos es el D_ACS declarado');
}

console.log('\n4. Las tres superficies dicen lo MISMO');
{
    const cifo = cifoDe(base()).dacsStr;
    const f060 = deriveFichaRes060(base(), res).dacs;
    const f093 = deriveFichaRes093(res093(), res).dacs;
    check(cifo === fmt(D_INI), `el CIFO: ${cifo}`, cifo);
    check(f060 === cifo, 'la Ficha RES060 le sigue', f060);
    check(f093 === cifo, 'y la Ficha RES093 también', f093);
}

console.log('\n5. Un inicial SIN demanda de ACS (leído por OCR) no deja el expediente a cero');
{
    // El PDF del CEE no imprime la tabla de ACS, así que un certificado leído por
    // OCR llega sin esa cifra. Exigir el inicial a ciegas dejaría D_ACS = 0 y el
    // AE_ACS del documento se iría a cero sin que nada lo delatara.
    const e = base();
    delete e.cee.cee_inicial.demandaACS;
    const r = resolveDacs(e.cee, ceeBaseDocumento(e.cee).base);
    check(casi(r.value, D_FIN), `se usa la del final: ${fmt(r.value)}`, fmt(r.value));
    check(r.acsFase === 'final', 'y se dice que sale del final', r.acsFase);
    check(r.acsHayDos === false, 'no hay dos cifras que comparar');
    const avisos = avisosCeeDocumento(e);
    const a = avisos.find(x => x.id === AVISO.ACS_DESDE_FINAL);
    check(!!a && a.nivel === 'warn', 'y salta el aviso de que falta el .xml del inicial');
    check(!!a && /no declara demanda de ACS/i.test(a.texto), 'diciendo por qué');
    check(htmlDe(e).includes('certificado de eficiencia energética final'), 'el CIFO nombra el certificado FINAL');
}

console.log('\n6. Los avisos previos a generar dicen lo que va a pasar');
{
    const avisos = avisosCeeDocumento(base());
    const dif = avisos.find(a => a.id === AVISO.ACS_DIFIERE);
    check(!!dif && dif.nivel === 'warn', 'con las dos cifras distintas, aviso');
    check(!!dif && /del INICIAL/.test(dif.texto), 'y dice que se usa la del INICIAL');
    check(!!dif && /criterio del\s+verificador/.test(dif.texto), 'y por qué');
    check(!avisos.some(a => a.id === AVISO.ACS_DESDE_FINAL), 'y no el contrario');

    // Coinciden (dentro del 2 %): no hay nada que decir.
    const iguales = base();
    iguales.cee.cee_final.demandaACS = ACS_INI * 1.01;
    check(!avisosCeeDocumento(iguales).some(a => a.id === AVISO.ACS_DIFIERE), 'si coinciden, ningún aviso de ACS');

    // Sin CEE final: la del inicial es ya la definitiva, así que es una NOTA y no
    // un aviso. Antes pedía revisarla "cuando se registre el final", que con este
    // criterio es mandar a rehacer algo que ya está bien.
    const soloIni = base();
    soloIni.cee.cee_final = null;
    const nota = avisosCeeDocumento(soloIni).find(a => a.id === AVISO.SIN_FINAL_ACS);
    check(!!nota && nota.nivel === 'info', 'sin CEE final, la D_ACS es una nota, no un aviso', nota?.nivel);
    check(!!nota && /no cambiará/.test(nota.texto), 'y dice que no va a cambiar');
}

console.log('\n7. El ACS fuera de alcance no entra en esto (regla 12.b)');
{
    const fuera = base();
    fuera.instalacion.cambio_acs = false;
    const avisos = avisosCeeDocumento(fuera);
    check(!avisos.some(a => a.id === AVISO.ACS_DIFIERE), 'sin ACS en alcance, no se avisa del descuadre');
    check(/no aplica/i.test(htmlDe(fuera)), 'y el documento sigue diciendo "no aplica"');
}

console.log('\n8. Los otros modos no dependen de la fase');
{
    const cte = base(); cte.cee.acs_method = ACS_METHOD.CTE;
    check(casi(resolveDacs(cte.cee, ceeBaseDocumento(cte.cee).base).value, 2731.3996),
        'en modo CTE la cifra es la del Anejo F');
    const litros = base(); litros.cee.acs_method = ACS_METHOD.LITROS; litros.cee.dacs_litros_dia = 120;
    check(casi(resolveDacs(litros.cee, {}).value, 2341.1976), 'en modo L/D, los litros del certificado');
    const manual = base(); manual.cee.acs_method = ACS_METHOD.MANUAL; manual.cee.dacs_manual = 20000;
    check(resolveDacs(manual.cee, {}).value === 20000, 'en modo manual, lo tecleado');
    check(!avisosCeeDocumento(cte).some(a => a.id === AVISO.ACS_DIFIERE),
        'y no se avisa de una diferencia entre certificados que el documento no usa');
}

console.log('\n9. `baseAcs` fuera de un expediente no inventa nada');
{
    // Es como la llama la rejilla del CEE (enseña lo de CADA fase) y la
    // calculadora antes de que haya expediente: sin `cee_inicial`, manda lo que
    // le pasen.
    const r = baseAcs({}, { demandaACS: 7.5, superficieHabitable: 100 });
    check(r.base.demandaACS === 7.5, 'sin cee_inicial se respeta la base recibida');
    check(r.fase === null && r.hayDos === false, 'y no se afirma ninguna fase');
    check(resolveDacs({}, { demandaACS: 7.5, superficieHabitable: 100 }).value === 750, 'la cifra sale igual');
}

console.log(`\n═══ ${ok} bien · ${ko} mal ═══\n`);
process.exit(ko ? 1 : 0);
