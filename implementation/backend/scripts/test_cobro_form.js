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

const expediente = (over = {}) => ({
    oportunidades: { datos_calculo: { inputs: {}, result: {} } },
    instalacion: {},
    documentacion: {},
    ...over,
});

(async () => {
    const url = pathToFileURL(path.join(
        __dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href;
    const m = await import(url);
    const {
        leadsDe, etiquetaRespuesta, BLOQUES, COSTE_GESTION_DEFECTO,
        contextoCobro: contextoDe, mascaraIban, ibanEnBloques, normalizarIban, textoEsfuerzo, eurEs,
    } = m;
    // Los importes llevan un espacio FIJO antes del € (U+00A0, para que no se partan
    // en dos renglones). Se comprueba aquí y, para el resto, se compara con espacio
    // normal: lo que se mira es la cifra, no el tipo de espacio.
    ok(eurEs(1840) === '1.840,00 €', 'el € va pegado con espacio fijo y con punto de miles en 4 cifras');
    const sinNbsp = (v) => JSON.parse(JSON.stringify(v).replace(/ /g, ' '));
    const bloquesPara = (...a) => sinNbsp(m.bloquesPara(...a));
    const bloquePago = (...a) => sinNbsp(m.bloquePago(...a));
    const componerMensajeCobro = (...a) => sinNbsp(m.componerMensajeCobro(...a));
    const tareaFormaPago = (...a) => sinNbsp(m.tareaFormaPago(...a));

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

    console.log('\n7) Manda lo corregido en el ECONÓMICO del expediente');
    {
        // La calculadora guarda `discountCertificates` y el expediente
        // `discount_certificates`: los dos cuentan, y el del expediente manda.
        const snake = expediente({
            oportunidades: { datos_calculo: { inputs: { discount_certificates: true }, result: {} } },
        });
        ok(contextoDe(snake).clienteAsumeCoste === false, 'lee también `discount_certificates` (clave del expediente)');
        const corregido = expediente({
            oportunidades: { datos_calculo: { inputs: { discountCertificates: true }, result: {} } },
            instalacion: { economico_override: { discount_certificates: false, certificates_cost: 200 } },
        });
        const c = contextoDe(corregido);
        ok(c.clienteAsumeCoste === true, 'el Económico del expediente manda sobre la simulación');
        ok(c.costeGestion === 200, `y su coste también: ${c.costeGestion} €`);
    }

    console.log('\n8) La cuenta en el MENSAJE va enmascarada');
    {
        const m = mascaraIban('ES59 3190 2099 1746 4324 3118');
        ok(m === 'ES59 3190 •••• •••• •••• 3118', `país, control y entidad + 4 últimos: "${m}"`);
        ok(mascaraIban('es64-2100-5634-7813-0001-1028') === 'ES64 2100 •••• •••• •••• 1028', 'guiones y minúsculas como los escribe el cliente');
        ok(mascaraIban('') === null && mascaraIban('ES12') === null, 'sin cuenta (o incompleta) no inventa nada');
        ok(ibanEnBloques('ES5931902099174643243118') === 'ES59 3190 2099 1746 4324 3118', 'el formulario la enseña en bloques de cuatro');
        ok(normalizarIban(' ES33 2085 8272 3403 3004 9224 ') === 'ES3320858272340330049224', 'un cambio de formato no es un cambio de cuenta');
    }

    console.log('\n9) El mensaje: enhorabuena, el motivo, la cuenta y el enlace');
    {
        const pago = bloquePago(250);
        const t = componerMensajeCobro({
            nombre: 'María', numExp: '26RES060_80', link: 'https://app/cobro/x?token=y',
            ibanMascara: 'ES59 3190 •••• •••• •••• 3118', pago,
        });
        ok(/^¡Enhorabuena, María!/.test(t), 'empieza por la noticia');
        ok(/ya nos ha llegado/.test(t), 'dice que el pago ya ha llegado');
        ok(/Por seguridad/.test(t), 'explica por qué se le pide la cuenta');
        ok(t.includes('ES59 3190 •••• •••• •••• 3118') && !t.includes('2099174643243118'), 'lleva la cuenta ENMASCARADA, nunca entera');
        ok(t.includes('250,00 €') && t.includes('302,50 €'), 'anuncia los dos importes de la gestión (base y con IVA)');
        ok(t.indexOf('https://app/cobro/x?token=y') < t.indexOf('250,00 €'), 'el enlace va antes que la forma de pago');
        ok(!/\d{1,2} de [a-z]+|antes del día/i.test(t), 'no promete fecha de ingreso');

        const sinPago = componerMensajeCobro({ nombre: null, link: 'L', ibanMascara: 'X', pago: null });
        ok(!/honorarios/.test(sinPago), 'a quien Brokergy le absorbió la gestión no se le habla de honorarios');
        const sinCuenta = componerMensajeCobro({ nombre: 'Ana', link: 'L', ibanMascara: null, pago });
        ok(/justificante/.test(sinCuenta) && !/Este es el que tenemos/.test(sinCuenta), 'sin cuenta en la ficha pide la cuenta y el justificante');
        const partner = componerMensajeCobro({ nombre: 'Juan', link: 'L', ibanMascara: 'ES59 3190 •••• 3118', tercero: true, titular: 'María', partner: true, pago });
        ok(/María/.test(partner) && !partner.includes('3118'), 'al partner se le habla del titular y NO se le enseña su cuenta');
        const familiar = componerMensajeCobro({ nombre: 'Juan', link: 'L', ibanMascara: 'ES59 3190 •••• 3118', tercero: true, titular: 'María', partner: false, pago });
        ok(familiar.includes('3118'), 'a la persona de contacto (no partner) sí, enmascarada, para que la reconozcan');
    }

    console.log('\n9b) La ayuda y el esfuerzo, en el mensaje y en la pregunta de pago');
    {
        const pago = bloquePago(250, 1840);
        const t = componerMensajeCobro({
            nombre: 'María', numExp: '26RES060_80', link: 'L', ibanMascara: 'ES59 3190 •••• •••• •••• 3118',
            pago, bono: 1840, requerimientos: 2,
        });
        ok(t.includes('*1.840,00 €*'), 'dice la ayuda verificada');
        ok(t.includes('*1.590,00 €*'), 'y lo que le llega con los honorarios descontados');
        ok(/contestar 2 requerimientos/.test(t), 'cuenta los requerimientos que hubo');
        ok(/por fin lo tenemos aquí/.test(t), 'y que por fin está');
        ok(/90 %/.test(t), 'lleva el argumento de la tarifa');
        const sinReq = componerMensajeCobro({ nombre: 'Ana', link: 'L', ibanMascara: 'X', pago, bono: 1840, requerimientos: 0 });
        ok(!/requerimiento/.test(sinReq) && /proceso largo/.test(sinReq), 'sin requerimientos NO se los inventa: cuenta el proceso');
        const sinBono = componerMensajeCobro({ nombre: 'Ana', link: 'L', ibanMascara: 'X', pago, bono: null });
        ok(!/Tu ayuda:/.test(sinBono), 'sin ahorro verificado no dice ninguna cifra de ayuda');
        const absorbida = componerMensajeCobro({ nombre: 'Ana', link: 'L', ibanMascara: 'X', pago: null, bono: 1840 });
        ok(/íntegra/.test(absorbida) && !/honorarios/.test(absorbida), 'con la gestión asumida: íntegra y sin hablar de honorarios');
        ok(textoEsfuerzo(1).includes('un requerimiento'), 'uno se dice "un requerimiento"');
        const desc = pago.opciones.find(o => o.value === 'descuento');
        const fact = pago.opciones.find(o => o.value === 'factura');
        ok(/Recibes 1\.590,00 €/.test(desc.sub) && /Recibes 1\.840,00 €/.test(fact.sub),
            'cada forma de pago dice lo que le LLEGA');
        ok(pago.recibe_descuento === 1590 && pago.recibe_factura === 1840, 'y lo devuelve como dato para la portada');
    }

    console.log('\n10) Qué hacer con la forma de pago al transferir');
    {
        const f = tareaFormaPago('factura', 250);
        ok(f.tono === 'aviso' && /302,50/.test(f.texto) && /ANTES/.test(f.texto), `factura: "${f.texto}"`);
        const d = tareaFormaPago('descuento', 250);
        ok(d.tono === 'ok' && /250,00/.test(d.texto), `descuento: "${d.texto}"`);
        ok(tareaFormaPago(null, 250) === null, 'sin elegir no hay tarea');
    }

    console.log(process.exitCode ? '\n❌ Hay comprobaciones que fallan.\n' : '\n✅ Todo correcto.\n');
})();
