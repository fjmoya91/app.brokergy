// ============================================================================
// sepaTransferencia.js — el FICHERO de una remesa de transferencias SEPA.
// ----------------------------------------------------------------------------
// Formato ISO 20022 `pain.001.001.03` (Customer Credit Transfer Initiation), el
// que aceptan todos los bancos españoles para las órdenes de transferencias en
// fichero (el sucesor de la Norma 34 de la AEB). En BBVA net cash se sube como
// «Ficheros → Transferencias SEPA». Una transferencia por beneficiario.
//
// REGLA — la estructura es la del fichero que BBVA YA ACEPTÓ (remesa del
// 02/10/2026, 5 pagos): ordenante «SOLUCIONES SOSTENIBLES PARA EFICIENCIA
// ENERGETICA SL» con Id = NIF + sufijo «000» en `InitgPty` y en `Dbtr`, BIC de
// BBVA, `BtchBookg` = false (un apunte por transferencia), `MsgId` «BRKGY» + fecha
// y hora, y `CreDtTm` en hora de Madrid. No se cambia sin probar antes en el banco.
//
// Puro y sin dependencias: lo prueba `scripts/test_remesa_sepa.js`.
//
// REGLA — un pago que no se puede ordenar NO entra en el fichero: un IBAN que no
// pasa el dígito de control o un importe que no es positivo hacen que el banco
// rechace la remesa ENTERA. Se comprueba antes y se lanza diciendo cuál.
//
// REGLA — los textos van en el juego de caracteres SEPA (latino básico): una «ñ»
// o una tilde en el nombre del beneficiario es motivo de rechazo en muchos
// bancos. Se transliteran (Ñ → N, Á → A) y lo demás se quita.
// ============================================================================

const { ibanValido, normalizarIban } = require('./justificanteBancario');

/** Texto en el juego de caracteres SEPA, recortado a `max`. */
function textoSepa(v, max = 140) {
    const s = String(v ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tildes y diéresis fuera
        .replace(/[ñÑ]/g, m => (m === 'ñ' ? 'n' : 'N'))
        .replace(/[ºª]/g, '')
        .replace(/[&]/g, '+')
        .replace(/_/g, '-')                                  // el guion bajo no es SEPA
        .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return s.slice(0, max).trim();
}

/** Identificador SEPA (MsgId, EndToEndId…): sin espacios y como mucho 35. */
function idSepa(v, max = 35) {
    return textoSepa(v, 200).replace(/\s+/g, '-').replace(/[^A-Za-z0-9/\-?:().,'+]/g, '').slice(0, max) || 'NOTPROVIDED';
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Céntimos enteros: sumar euros con decimales en coma flotante descuadra el CtrlSum. */
const aCentimos = (n) => Math.round(Number(n) * 100);
const deCentimos = (c) => (c / 100).toFixed(2);

/** YYYY-MM-DD en la zona de Madrid. */
function fechaMadrid(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** «2026-10-02T16:46:07» en hora de Madrid, como el `CreDtTm` del fichero que BBVA aceptó. */
function fechaHoraMadrid(d = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}

/** «BRKGY20261002164607»: el identificador del fichero, con la hora de Madrid. */
function msgIdBrokergy(d = new Date()) {
    return `BRKGY${fechaHoraMadrid(d).replace(/\D/g, '')}`;
}

/** Siguiente día hábil (lunes a viernes) a partir de `desde`, sin contarlo. */
function siguienteDiaHabil(desde = new Date(), dias = 1) {
    const d = new Date(`${fechaMadrid(desde)}T12:00:00Z`);
    let n = 0;
    while (n < dias) {
        d.setUTCDate(d.getUTCDate() + 1);
        const dow = d.getUTCDay();
        if (dow !== 0 && dow !== 6) n++;
    }
    return d.toISOString().slice(0, 10);
}

/**
 * Comprueba los pagos antes de componer nada.
 * @returns {string[]} los problemas, uno por pago que no se puede ordenar
 */
function problemasPagos(pagos = []) {
    const out = [];
    const vistos = new Set();
    for (const p of pagos) {
        const ref = p.referencia || p.nombre || '?';
        if (!ibanValido(p.iban)) out.push(`${ref}: el IBAN ${p.iban || '(vacío)'} no es válido`);
        if (!(aCentimos(p.importe) > 0)) out.push(`${ref}: el importe tiene que ser mayor que cero`);
        if (!textoSepa(p.nombre, 70)) out.push(`${ref}: falta el nombre del beneficiario`);
        const e2e = idSepa(p.end_to_end || p.referencia);
        if (vistos.has(e2e)) out.push(`${ref}: referencia repetida (${e2e})`);
        vistos.add(e2e);
    }
    return out;
}

/**
 * El XML de la remesa.
 *
 * @param {object} p
 *   @param {object} p.ordenante  { nombre, iban, bic, nif, sufijo }
 *   @param {string} p.msgId       identificador único del fichero (≤ 35)
 *   @param {string} p.fechaEjecucion  YYYY-MM-DD (cuándo se carga en nuestra cuenta)
 *   @param {Array}  p.pagos       [{ nombre, iban, importe, concepto, end_to_end, referencia }]
 *   @param {Date}   [p.ahora]
 * @returns {{ xml: string, total: number, n: number }}
 */
function componerRemesa({ ordenante, msgId, fechaEjecucion, pagos, ahora = new Date() }) {
    if (!Array.isArray(pagos) || !pagos.length) throw new Error('La remesa no tiene ningún pago');
    if (!ibanValido(ordenante?.iban)) throw new Error('El IBAN de la cuenta de cargo no es válido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaEjecucion || ''))) throw new Error('La fecha de ejecución no es válida');
    const problemas = problemasPagos(pagos);
    if (problemas.length) throw new Error(`No se puede generar la remesa:\n· ${problemas.join('\n· ')}`);

    const totalC = pagos.reduce((s, p) => s + aCentimos(p.importe), 0);
    const id = idSepa(msgId);
    const creado = fechaHoraMadrid(ahora);
    const nombreOrd = xmlEsc(textoSepa(ordenante.nombre, 70));
    const idOrd = xmlEsc(idSepa(`${ordenante.nif || ''}${ordenante.sufijo || ''}`));
    const bic = String(ordenante.bic || '').trim().toUpperCase();

    const trf = pagos.map((p) => `
            <CdtTrfTxInf>
                <PmtId>
                    <EndToEndId>${xmlEsc(idSepa(p.end_to_end || p.referencia))}</EndToEndId>
                </PmtId>
                <Amt>
                    <InstdAmt Ccy="EUR">${deCentimos(aCentimos(p.importe))}</InstdAmt>
                </Amt>
                <Cdtr>
                    <Nm>${xmlEsc(textoSepa(p.nombre, 70))}</Nm>
                </Cdtr>
                <CdtrAcct>
                    <Id>
                        <IBAN>${normalizarIban(p.iban)}</IBAN>
                    </Id>
                </CdtrAcct>
                <RmtInf>
                    <Ustrd>${xmlEsc(textoSepa(p.concepto || p.referencia, 140))}</Ustrd>
                </RmtInf>
            </CdtTrfTxInf>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <CstmrCdtTrfInitn>
        <GrpHdr>
            <MsgId>${xmlEsc(id)}</MsgId>
            <CreDtTm>${creado}</CreDtTm>
            <NbOfTxs>${pagos.length}</NbOfTxs>
            <CtrlSum>${deCentimos(totalC)}</CtrlSum>
            <InitgPty>
                <Nm>${nombreOrd}</Nm>
                <Id>
                    <OrgId>
                        <Othr>
                            <Id>${idOrd}</Id>
                        </Othr>
                    </OrgId>
                </Id>
            </InitgPty>
        </GrpHdr>
        <PmtInf>
            <PmtInfId>${xmlEsc(idSepa(`${id}-1`))}</PmtInfId>
            <PmtMtd>TRF</PmtMtd>
            <BtchBookg>false</BtchBookg>
            <NbOfTxs>${pagos.length}</NbOfTxs>
            <CtrlSum>${deCentimos(totalC)}</CtrlSum>
            <PmtTpInf>
                <SvcLvl>
                    <Cd>SEPA</Cd>
                </SvcLvl>
            </PmtTpInf>
            <ReqdExctnDt>${fechaEjecucion}</ReqdExctnDt>
            <Dbtr>
                <Nm>${nombreOrd}</Nm>
                <Id>
                    <OrgId>
                        <Othr>
                            <Id>${idOrd}</Id>
                        </Othr>
                    </OrgId>
                </Id>
            </Dbtr>
            <DbtrAcct>
                <Id>
                    <IBAN>${normalizarIban(ordenante.iban)}</IBAN>
                </Id>
                <Ccy>EUR</Ccy>
            </DbtrAcct>
            <DbtrAgt>
                <FinInstnId>${bic ? `
                    <BIC>${xmlEsc(bic)}</BIC>` : `
                    <Othr>
                        <Id>NOTPROVIDED</Id>
                    </Othr>`}
                </FinInstnId>
            </DbtrAgt>
            <ChrgBr>SLEV</ChrgBr>${trf}
        </PmtInf>
    </CstmrCdtTrfInitn>
</Document>
`;
    return { xml, total: totalC / 100, n: pagos.length };
}

/**
 * Reparte un importe en partes según sus porcentajes, en céntimos, sin perder ni
 * ganar un céntimo: el resto del redondeo va a la ÚLTIMA parte.
 */
function repartirCentimos(importe, cuotas = []) {
    const totalC = aCentimos(importe);
    if (!cuotas.length) return [];
    const partes = cuotas.map(q => Math.floor(totalC * Number(q || 0) / 100));
    const resto = totalC - partes.reduce((s, x) => s + x, 0);
    partes[partes.length - 1] += resto;
    return partes.map(c => c / 100);
}

module.exports = {
    componerRemesa,
    problemasPagos,
    repartirCentimos,
    textoSepa,
    idSepa,
    fechaMadrid,
    fechaHoraMadrid,
    msgIdBrokergy,
    siguienteDiaHabil,
};
