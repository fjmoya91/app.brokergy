/**
 * test_cobro_form.js — el formulario de CONFIRMACIÓN DE COBRO, sin BD y sin enviar
 * nada. Comprueba las decisiones que no se ven mirando la pantalla:
 *
 *   · a quién se le pregunta por la forma de pago (y a quién NO, porque su
 *     Convenio de Cesión ya dice que Brokergy asumió el coste);
 *   · que el bloque de placas llega precontestado con lo que el cliente dijo en la
 *     captación, y que se marca como heredado;
 *   · qué respuestas dejan un LEAD comercial;
 *   · que reabrir el enlace enseña lo ya contestado y no lo pierde.
 *
 *   node implementation/backend/scripts/test_cobro_form.js
 */

const path = require('path');
const { pathToFileURL } = require('url');

const ok = (cond, txt) => {
    console.log(`${cond ? '  ✅' : '  ❌'} ${txt}`);
    if (!cond) process.exitCode = 1;
};

// `contextoDe` es puro pero vive en un servicio que abre Supabase al importarse.
// Se replica aquí la MISMA decisión para poder probarla sin credenciales; si
// alguna vez dejan de coincidir, este test deja de valer y hay que unificarlas.
function contextoDe(exp) {
    const datos = exp?.oportunidades?.datos_calculo || {};
    const inputs = datos.inputs || {};
    const result = datos.result || {};
    const brokergyAsume = inputs.discountCertificates === true;
    const coste = Number(result.caeMaintenanceCost) > 0
        ? Number(result.caeMaintenanceCost)
        : Number(inputs.certificatesCost) || 0;
    return {
        clienteAsumeCoste: !brokergyAsume,
        costeGestion: coste,
        solarPrevio: exp?.instalacion?.fotovoltaica?.estado || null,
        respuestas: exp?.documentacion?.cobro?.respuestas || {},
    };
}

const expediente = (over = {}) => ({
    oportunidades: { datos_calculo: { inputs: {}, result: {} } },
    instalacion: {},
    documentacion: {},
    ...over,
});

(async () => {
    const url = pathToFileURL(path.join(
        __dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href;
    const { bloquesPara, bloquePago, leadsDe, etiquetaRespuesta, BLOQUES, COSTE_GESTION_DEFECTO } = await import(url);

    console.log('\n1) El bloque de la forma de pago');
    {
        const conCoste = expediente({
            oportunidades: { datos_calculo: { inputs: { discountCertificates: false }, result: { caeMaintenanceCost: 220 } } },
        });
        const b = bloquesPara(contextoDe(conCoste));
        ok(b.some(x => x.id === 'forma_pago'), 'se le pregunta a quien ASUME el coste de gestión');
        const pago = b.find(x => x.id === 'forma_pago');
        ok(pago.importe_total === 266.2, `el total lleva el IVA: 220 → ${pago?.importe_total} €`);
        // Las dos opciones NO cuestan lo mismo, y es lo único que le importa al
        // cliente: el descuento va sobre la BASE y la factura lleva el IVA encima.
        const desc = pago.opciones.find(o => o.value === 'descuento');
        const fact = pago.opciones.find(o => o.value === 'factura');
        ok(desc.label.includes('220,00'), `el descuento anuncia la BASE sin IVA: "${desc.label}"`);
        ok(fact.label.includes('266,20'), `la factura anuncia el total CON IVA: "${fact.label}"`);
        ok(fact.desaconsejada === true && /46,20/.test(fact.aviso),
            `la factura sale marcada con lo que cuesta de más: "${fact.aviso}"`);
        ok(/retrasa/i.test(fact.sub) && /IVA/.test(fact.sub),
            'y su texto dice las DOS consecuencias: retraso del cobro e IVA');
        ok(!desc.desaconsejada && desc.recomendada === true, 'el descuento sigue siendo la recomendada');

        const absorbido = expediente({
            oportunidades: { datos_calculo: { inputs: { discountCertificates: true }, result: {} } },
        });
        const b2 = bloquesPara(contextoDe(absorbido));
        ok(!b2.some(x => x.id === 'forma_pago'),
            'NO se le pregunta a quien lleva "Descuento Certificados" (su convenio no lo menciona)');
        ok(b2.length === BLOQUES.length, 'a ése le quedan solo los tres bloques comerciales');
    }

    console.log('\n2) Sin coste en el expediente, el importe por defecto');
    {
        const p = bloquePago(0);
        ok(p.importe_sin_iva === COSTE_GESTION_DEFECTO, `cae a ${COSTE_GESTION_DEFECTO} € sin IVA`);
        ok(/\d/.test(p.ayuda) && p.ayuda.includes('€'), 'la explicación dice la cifra, no un "consúltanos"');
    }

    console.log('\n3) Las placas llegan precontestadas desde la captación');
    {
        const conPlacas = expediente({ instalacion: { fotovoltaica: { estado: 'si', potencia_kwp: 3.5 } } });
        const solar = bloquesPara(contextoDe(conPlacas)).find(b => b.id === 'solar');
        ok(solar.valor === 'si', 'viene marcado lo que ya nos dijo');
        ok(solar.heredado === true, 'y marcado como heredado, para poder avisarlo en pantalla');

        const sinDato = bloquesPara(contextoDe(expediente())).find(b => b.id === 'solar');
        ok(sinDato.valor === null && sinDato.heredado === false, 'sin dato previo no se marca nada');
    }

    console.log('\n4) Reabrir el enlace no pierde lo contestado');
    {
        const yaContestado = expediente({
            instalacion: { fotovoltaica: { estado: 'si' } },
            documentacion: { cobro: { respuestas: { tarifa: 'ajustado', solar: 'no' } } },
        });
        const b = bloquesPara(contextoDe(yaContestado));
        ok(b.find(x => x.id === 'tarifa').valor === 'ajustado', 'la tarifa sigue contestada');
        ok(b.find(x => x.id === 'solar').valor === 'no',
            'y lo que CORRIGIÓ manda sobre lo heredado de la captación');
        ok(b.find(x => x.id === 'solar').heredado === false, 'corregido deja de ser "heredado"');
    }

    console.log('\n5) Qué deja lead comercial');
    {
        ok(leadsDe({ tarifa: 'no_revisado', solar: 'futuro', fiscalidad: 'si' }).length === 3,
            'las tres respuestas de interés generan lead');
        ok(leadsDe({ tarifa: 'ajustado', solar: 'si', fiscalidad: 'no' }).length === 0,
            'las de "ya lo tengo resuelto" NO generan lead (pero se guardan)');
        ok(leadsDe({ solar: 'futuro' })[0].texto.includes('fotovoltaica'),
            'el lead viene ya redactado para la lista de a quién llamar');
        ok(leadsDe({}).length === 0, 'sin contestar no hay lead');
    }

    console.log('\n6) Etiquetas para el resumen interno');
    {
        ok(etiquetaRespuesta('tarifa', 'no_revisado') === 'Quiere estudio de tarifa', 'tarifa');
        ok(etiquetaRespuesta('forma_pago', 'descuento', 220) === 'Descuento sobre el bono',
            'la forma de pago se resuelve aunque no esté en BLOQUES');
        ok(etiquetaRespuesta('tarifa', null) === null, 'lo no contestado no inventa etiqueta');
    }

    console.log(process.exitCode ? '\n❌ Hay comprobaciones que fallan.\n' : '\n✅ Todo correcto.\n');
})();
