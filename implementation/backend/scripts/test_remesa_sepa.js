/**
 * test_remesa_sepa.js — el PAGO a los clientes del lote, sin BD y sin enviar nada:
 *
 *   · el fichero SEPA (pain.001.001.03): cuadra el total, valida los IBAN, quita
 *     tildes y eñes, no repite referencias y se lee como XML;
 *   · el reparto entre varias cuentas no pierde ni gana un céntimo;
 *   · los días hábiles y la hora de Madrid de la reseña;
 *   · los textos del aviso de transferencia y de la reseña (sin IBAN entero, sin
 *     requerimientos inventados).
 *
 *   node implementation/backend/scripts/test_remesa_sepa.js
 */

const path = require('path');
const { pathToFileURL } = require('url');
const xml2js = require('xml2js');
const {
    componerRemesa, problemasPagos, repartirCentimos, textoSepa, idSepa, siguienteDiaHabil, msgIdBrokergy,
} = require('../utils/sepaTransferencia');
const { horaMadridAIso } = require('../services/pagoClientesService');

const ok = (cond, txt) => {
    console.log(`${cond ? '  ✅' : '  ❌'} ${txt}`);
    if (!cond) process.exitCode = 1;
};

const ORD = { nombre: 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA SL', iban: 'ES1001820394300201753286', bic: 'BBVAESMMXXX', nif: 'B19350222', sufijo: '000' };
const IBAN_OK = 'ES9121000418450200051332';
const IBAN_OK2 = 'ES7921000813610123456789';

(async () => {
    console.log('\n· Textos SEPA');
    ok(textoSepa('MUÑOZ GARCÍA, José Ángel') === 'MUNOZ GARCIA, Jose Angel', 'quita tildes y eñes');
    ok(textoSepa('A & B <x>') === 'A + B x', 'sin & ni < >');
    ok(textoSepa('x'.repeat(200), 140).length === 140, 'recorta a 140');
    ok(idSepa('26RES060_187') === '26RES060-187', 'el guion bajo de la referencia pasa a guion');

    console.log('\n· Validación previa');
    ok(problemasPagos([{ nombre: 'A', iban: 'ES0000000000000000000000', importe: 10, referencia: 'X1' }]).length === 1, 'un IBAN con mal dígito de control no pasa');
    ok(problemasPagos([{ nombre: 'A', iban: IBAN_OK, importe: 0, referencia: 'X1' }]).length === 1, 'un importe cero no pasa');
    ok(problemasPagos([
        { nombre: 'A', iban: IBAN_OK, importe: 1, referencia: 'X1' },
        { nombre: 'B', iban: IBAN_OK2, importe: 1, referencia: 'X1' },
    ]).some(p => /repetida/.test(p)), 'dos pagos con la misma referencia no pasan');
    let lanzo = false;
    try { componerRemesa({ ordenante: ORD, msgId: 'M', fechaEjecucion: '2026-10-14', pagos: [{ nombre: 'A', iban: 'ES12', importe: 5, referencia: 'R' }] }); }
    catch { lanzo = true; }
    ok(lanzo, 'con un pago malo NO se genera el fichero (el banco rechazaría la remesa entera)');

    console.log('\n· El fichero');
    const pagos = [
        { nombre: 'María Muñoz Peña', iban: 'ES91 2100 0418 4502 0005 1332', importe: 1590.1, concepto: 'AYUDA CAE 26RES060_187 BROKERGY', referencia: '26RES060_187' },
        { nombre: 'José Ruiz', iban: IBAN_OK2, importe: 0.1, concepto: 'AYUDA CAE 26RES060_188 BROKERGY', referencia: '26RES060_188' },
        { nombre: 'José Ruiz', iban: IBAN_OK2, importe: 0.2, concepto: 'AYUDA CAE 26RES060_188 BROKERGY', referencia: '26RES060_188', end_to_end: '26RES060_188-2' },
    ];
    const ahora = new Date('2026-10-02T14:46:07Z');   // 16:46:07 en Madrid (verano)
    ok(msgIdBrokergy(ahora) === 'BRKGY20261002164607', 'MsgId como el de la remesa que BBVA aceptó (BRKGY + hora de Madrid)');
    const { xml, total, n } = componerRemesa({ ordenante: ORD, msgId: msgIdBrokergy(ahora), fechaEjecucion: '2026-10-14', pagos, ahora });
    ok(total === 1590.4 && n === 3, `total ${total} en ${n} transferencias (0,1 + 0,2 sin coma flotante)`);
    const doc = await xml2js.parseStringPromise(xml);
    const root = doc.Document.CstmrCdtTrfInitn[0];
    ok(doc.Document.$.xmlns === 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03', 'espacio de nombres pain.001.001.03');
    ok(root.GrpHdr[0].CtrlSum[0] === '1590.40' && root.GrpHdr[0].NbOfTxs[0] === '3', 'CtrlSum y NbOfTxs de la cabecera');
    const pmt = root.PmtInf[0];
    ok(pmt.CtrlSum[0] === '1590.40' && pmt.BtchBookg[0] === 'false', 'BtchBookg = false, como el fichero que BBVA aceptó');
    ok(root.GrpHdr[0].CreDtTm[0] === '2026-10-02T16:46:07', 'CreDtTm en hora de Madrid');
    ok(pmt.Dbtr[0].Id[0].OrgId[0].Othr[0].Id[0] === 'B19350222000', 'el Dbtr lleva también su Id (NIF + sufijo)');
    ok(pmt.ReqdExctnDt[0] === '2026-10-14', 'fecha de ejecución');
    ok(pmt.DbtrAcct[0].Id[0].IBAN[0] === ORD.iban && pmt.DbtrAgt[0].FinInstnId[0].BIC[0] === 'BBVAESMMXXX', 'cuenta de cargo y BIC de BBVA');
    ok(root.GrpHdr[0].InitgPty[0].Id[0].OrgId[0].Othr[0].Id[0] === 'B19350222000', 'ordenante = NIF + sufijo');
    const tx = pmt.CdtTrfTxInf;
    ok(tx[0].Cdtr[0].Nm[0] === 'Maria Munoz Pena', 'beneficiario sin tildes ni eñes');
    ok(tx[0].CdtrAcct[0].Id[0].IBAN[0] === IBAN_OK, 'IBAN sin espacios');
    ok(tx[0].Amt[0].InstdAmt[0]._ === '1590.10' && tx[0].Amt[0].InstdAmt[0].$.Ccy === 'EUR', 'importe con dos decimales y en EUR');
    ok(tx[0].RmtInf[0].Ustrd[0] === 'AYUDA CAE 26RES060-187 BROKERGY', 'concepto (el guion bajo no es SEPA: va con guion)');
    ok(tx[0].PmtId[0].EndToEndId[0] === '26RES060-187', 'EndToEndId = nº de expediente');
    ok(!/[ñÑáéíóú]/.test(xml), 'ni una tilde en todo el fichero');

    console.log('\n· Reparto entre cuentas');
    const r = repartirCentimos(1000, [33.33, 33.33, 33.34]);
    ok(Math.round(r.reduce((s, x) => s + x, 0) * 100) === 100000, `suma exacta: ${r.join(' + ')}`);
    const r2 = repartirCentimos(100.01, [50, 50]);
    ok(r2[0] === 50 && r2[1] === 50.01, 'el céntimo que sobra va a la última cuenta');

    console.log('\n· Días hábiles y hora de Madrid');
    ok(siguienteDiaHabil(new Date('2026-10-16T10:00:00Z'), 1) === '2026-10-19', 'viernes → lunes');
    ok(siguienteDiaHabil(new Date('2026-10-13T10:00:00Z'), 2) === '2026-10-15', 'martes + 2 hábiles → jueves');
    ok(horaMadridAIso('2026-10-15', '11:00') === '2026-10-15T09:00:00.000Z', '11:00 en verano = 09:00 UTC');
    ok(horaMadridAIso('2026-11-16', '11:00') === '2026-11-16T10:00:00.000Z', '11:00 en invierno = 10:00 UTC');

    console.log('\n· Mensajes');
    const form = await import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/cobro/logic/cobroForm.js')).href);
    const t = form.componerMensajeTransferencia({
        nombre: 'María', cuentas: [{ mascara: 'ES91 2100 •••• •••• •••• 1332', importe: 1590.1 }],
        concepto: form.conceptoTransferencia('26RES060_187'),
    });
    ok(t.includes('1.590,10') && t.includes('ES91 2100 ••••') && !t.includes(IBAN_OK), 'transferencia: importe y cuenta ENMASCARADA');
    ok(t.includes('AYUDA CAE 26RES060-187 BROKERGY'), 'transferencia: el concepto TAL CUAL lo verá en el banco');
    const t2 = form.componerMensajeTransferencia({
        nombre: 'Luis', cuentas: [{ mascara: 'A', importe: 500 }, { mascara: 'B', importe: 500 }],
    });
    ok(t2.includes('1.000,00') && (t2.match(/•/g) || []).length === 2, 'varias cuentas: el total y una línea por cuenta');
    const tp = form.componerMensajeTransferencia({ nombre: 'Ana', tercero: true, titular: 'Pedro', partner: true, cuentas: [{ mascara: 'ES91 ••••', importe: 10 }] });
    ok(!tp.includes('ES91') && tp.includes('Pedro'), 'al partner: ni la cuenta enmascarada');

    const r0 = form.componerMensajeResena({ nombre: 'María', enlace: 'https://g.page/r/x/review', requerimientos: 0 });
    ok(!/requerimiento/.test(r0) && r0.includes('Ministerio'), 'reseña sin requerimientos: se cuenta el proceso, no se inventan');
    const r3 = form.componerMensajeResena({ nombre: 'María', enlace: 'https://g.page/r/x/review', requerimientos: 3 });
    ok(r3.includes('3 requerimientos') && r3.includes('más de lo que nos hubiera gustado'), 'reseña con 3 requerimientos');
    ok(r3.includes('https://g.page/r/x/review'), 'reseña: lleva el enlace');

    console.log(process.exitCode ? '\n❌ Hay fallos\n' : '\n✅ Todo bien\n');
})();
