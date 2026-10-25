// ─── verifactuService.js ─────────────────────────────────────────────────────
// VERI*FACTU (RD 1007/2023 y Orden HAC/1177/2024): cada factura que emite la app
// deja un REGISTRO DE FACTURACIÓN encadenado con el anterior del mismo emisor
// por su HUELLA (SHA-256), y la factura lleva un QR con el que el cliente la
// comprueba en la sede de la AEAT.
//
// Lo que hay aquí, y en qué estado (2026-10-24):
//   · huella de alta y de anulación — probada con los vectores de la AEAT
//     (test_facturas.mjs); la cadena se guarda desde YA en `facturas_emitidas`
//     (vf_nif, vf_orden, vf_huella), una por emisor;
//   · URL y la imagen del QR (nivel M, con su margen);
//   · el XML del registro (RegistroAlta / RegistroAnulacion) y el sobre SOAP;
//   · el ENVÍO, APAGADO: hace falta el certificado cualificado del obligado
//     (BROKERGY, y el de Fran para la serie FML) en el servidor. Con
//     VERIFACTU_ENVIO_ENABLED apagado la factura sale SIN QR: la leyenda
//     «VERI*FACTU» en una factura que no se ha remitido diría algo falso.
//
// Obligatorio: 1/1/2027 sociedades, 1/7/2027 el resto (RDL 15/2025). Ver
// docs/conocimiento/facturacion/facturas-desde-la-app.md.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const ENTORNO = (process.env.VERIFACTU_ENTORNO || 'pruebas').toLowerCase() === 'produccion' ? 'produccion' : 'pruebas';
const URL_QR = {
    produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
    pruebas: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR',
};
const URL_SOAP = {
    produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
};
const NS_LR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const NS_SI = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

/** ¿Se remiten los registros? Solo con el interruptor Y el certificado. */
function activo() {
    return process.env.VERIFACTU_ENVIO_ENABLED === 'true' && !!process.env.VERIFACTU_CERT_PATH && fs.existsSync(process.env.VERIFACTU_CERT_PATH);
}

/**
 * El SISTEMA INFORMÁTICO que genera los registros: esta app, hecha por BROKERGY
 * para sí misma (declaración responsable propia, art. 13 RD 1007/2023). Lo usan
 * DOS obligados (BROKERGY y Fran, serie FML): multi-OT.
 */
const SISTEMA = {
    NombreRazon: process.env.VERIFACTU_PRODUCTOR_NOMBRE || 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL',
    NIF: process.env.VERIFACTU_PRODUCTOR_NIF || 'B19350222',
    NombreSistemaInformatico: 'BROKERGY CRM',
    IdSistemaInformatico: 'BK',
    Version: '1.0',
    NumeroInstalacion: process.env.VERIFACTU_NUMERO_INSTALACION || '1',
    TipoUsoPosibleSoloVerifactu: 'S',
    TipoUsoPosibleMultiOT: 'S',
    IndicadorMultiplesOT: 'S',
};

// ── Formatos ─────────────────────────────────────────────────────────────────

/** `aaaa-mm-dd` → `dd-mm-aaaa`, el formato de fecha de VERI*FACTU. */
const fechaVf = (iso) => { const [y, m, d] = String(iso || '').slice(0, 10).split('-'); return `${d}-${m}-${y}`; };

/**
 * Importe como va en el XML y, por tanto, en la huella: punto decimal y DOS
 * decimales siempre. La huella se calcula sobre el texto: «123.1» y «123.10»
 * dan huellas distintas, así que el XML lleva exactamente esto.
 */
const importeVf = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

/** Fecha y hora con su huso (`2024-01-01T19:20:30+01:00`), en hora de Madrid. */
function fechaHoraHuso(d = new Date()) {
    const x = new Date(d);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(x).map(o => [o.type, o.value]));
    const hora = p.hour === '24' ? '00' : p.hour;
    const local = Date.UTC(+p.year, +p.month - 1, +p.day, +hora, +p.minute, +p.second);
    const off = Math.round((local - Math.floor(x.getTime() / 1000) * 1000) / 60000);
    const signo = off >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
    const mm = String(Math.abs(off) % 60).padStart(2, '0');
    return `${p.year}-${p.month}-${p.day}T${hora}:${p.minute}:${p.second}${signo}${hh}:${mm}`;
}

// ── Huella ───────────────────────────────────────────────────────────────────

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase();

/**
 * Huella de un registro de ALTA. Campos en este orden, `clave=valor` unidos por
 * `&`, valores sin espacios a los lados; sin registro anterior, `Huella=` vacío.
 */
function huellaAlta({ nif, numSerie, fecha, tipoFactura, cuotaTotal, importeTotal, huellaAnterior = '', fechaHora }) {
    const t = (v) => String(v ?? '').trim();
    return sha256([
        `IDEmisorFactura=${t(nif)}`,
        `NumSerieFactura=${t(numSerie)}`,
        `FechaExpedicionFactura=${t(fecha)}`,
        `TipoFactura=${t(tipoFactura)}`,
        `CuotaTotal=${t(cuotaTotal)}`,
        `ImporteTotal=${t(importeTotal)}`,
        `Huella=${t(huellaAnterior)}`,
        `FechaHoraHusoGenRegistro=${t(fechaHora)}`,
    ].join('&'));
}

/** Huella de un registro de ANULACIÓN. */
function huellaAnulacion({ nif, numSerie, fecha, huellaAnterior = '', fechaHora }) {
    const t = (v) => String(v ?? '').trim();
    return sha256([
        `IDEmisorFacturaAnulada=${t(nif)}`,
        `NumSerieFacturaAnulada=${t(numSerie)}`,
        `FechaExpedicionFacturaAnulada=${t(fecha)}`,
        `Huella=${t(huellaAnterior)}`,
        `FechaHoraHusoGenRegistro=${t(fechaHora)}`,
    ].join('&'));
}

// ── QR ───────────────────────────────────────────────────────────────────────

/** La URL del QR: nif, numserie, fecha (dd-mm-aaaa) e importe (el ImporteTotal). */
function urlQr({ nif, numSerie, fecha, importe, entorno = ENTORNO }) {
    const e = encodeURIComponent;
    return `${URL_QR[entorno] || URL_QR.pruebas}?nif=${e(nif)}&numserie=${e(numSerie)}&fecha=${e(fecha)}&importe=${e(importeVf(importe))}`;
}

/**
 * La imagen del QR como data URI (Puppeteer rasteriza sobre about:blank).
 * Corrección de errores M; margen de 4 módulos, que a 32 mm son ≥ 2 mm.
 */
async function qrDataUri(url) {
    const QRCode = require('qrcode');
    return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 480 });
}

// ── Registro ─────────────────────────────────────────────────────────────────

/**
 * El DESGLOSE por tipo de IVA y las cuotas del registro. Los SUPLIDOS no van
 * (no son contraprestación, art. 78.Tres.3º LIVA) y la RETENCIÓN de IRPF
 * tampoco (FAQ de la AEAT): `ImporteTotal` = base + cuota.
 * Una línea al 0 % que no es suplido no se sabe declarar sin su causa
 * (exención o no sujeción): se devuelve en `sinCausa` y no se registra.
 */
function desglose(lineasCalculadas = []) {
    const porTipo = new Map();
    const sinCausa = [];
    for (const l of lineasCalculadas) {
        if (l.suplido) continue;
        const tipo = Math.round(Number(l.ivaPct || 0) * 100) / 100;
        if (tipo === 0) { sinCausa.push(l.descripcion); continue; }
        const d = porTipo.get(tipo) || { tipo, base: 0, cuota: 0 };
        d.base = Math.round((d.base + l.subtotal) * 100) / 100;
        d.cuota = Math.round((d.cuota + l.iva) * 100) / 100;
        porTipo.set(tipo, d);
    }
    const detalles = [...porTipo.values()];
    const cuotaTotal = Math.round(detalles.reduce((s, d) => s + d.cuota, 0) * 100) / 100;
    const base = Math.round(detalles.reduce((s, d) => s + d.base, 0) * 100) / 100;
    return { detalles, cuotaTotal, importeTotal: Math.round((base + cuotaTotal) * 100) / 100, sinCausa };
}

/**
 * Prepara el registro de ALTA de una factura y su huella, encadenado al
 * `anterior` ({ nif, numSerie, fecha, huella } del último registro del emisor,
 * o null si es el primero).
 */
function registroAlta({ emisor, factura, lineasCalculadas, anterior = null, ahora = new Date() }) {
    const { detalles, cuotaTotal, importeTotal, sinCausa } = desglose(lineasCalculadas);
    const fecha = fechaVf(factura.fecha);
    const fechaHora = fechaHoraHuso(ahora);
    const tipoFactura = factura.tipo || 'F1';
    const huella = huellaAlta({
        nif: emisor.nif, numSerie: factura.numero, fecha, tipoFactura,
        cuotaTotal: importeVf(cuotaTotal), importeTotal: importeVf(importeTotal),
        huellaAnterior: anterior?.huella || '', fechaHora,
    });
    const registro = {
        tipo: 'ALTA', IDEmisorFactura: emisor.nif, NumSerieFactura: factura.numero, FechaExpedicionFactura: fecha,
        NombreRazonEmisor: emisor.razon_social, TipoFactura: tipoFactura,
        ...(tipoFactura !== 'F1' ? {
            TipoRectificativa: 'I',
            FacturaRectificada: factura.rectifica_numero
                ? { IDEmisorFactura: emisor.nif, NumSerieFactura: factura.rectifica_numero, FechaExpedicionFactura: fechaVf(factura.rectifica_fecha) }
                : null,
        } : {}),
        DescripcionOperacion: String(factura.concepto || 'Prestación de servicios').slice(0, 500),
        Destinatario: { NombreRazon: factura.cliente?.razon_social || '', NIF: String(factura.cliente?.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '') },
        Desglose: detalles.map(d => ({ TipoImpositivo: importeVf(d.tipo), BaseImponible: importeVf(d.base), CuotaRepercutida: importeVf(d.cuota) })),
        CuotaTotal: importeVf(cuotaTotal), ImporteTotal: importeVf(importeTotal),
        RegistroAnterior: anterior ? { IDEmisorFactura: anterior.nif, NumSerieFactura: anterior.numSerie, FechaExpedicionFactura: anterior.fecha, Huella: anterior.huella } : null,
        FechaHoraHusoGenRegistro: fechaHora, Huella: huella,
    };
    return { registro, huella, importeTotal, cuotaTotal, avisos: sinCausa.length ? [`Partidas al 0 % sin causa de exención: ${sinCausa.join(' · ')}`] : [] };
}

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const el = (n, v) => (v == null || v === '' ? '' : `<sum1:${n}>${x(v)}</sum1:${n}>`);

/** El XML (`sum1:RegistroAlta`) de un registro preparado con `registroAlta`. */
function xmlRegistroAlta(r) {
    const idFactura = (o) => `${el('IDEmisorFactura', o.IDEmisorFactura)}${el('NumSerieFactura', o.NumSerieFactura)}${el('FechaExpedicionFactura', o.FechaExpedicionFactura)}`;
    const rect = r.TipoRectificativa
        ? `${el('TipoRectificativa', r.TipoRectificativa)}${r.FacturaRectificada ? `<sum1:FacturasRectificadas><sum1:IDFacturaRectificada>${idFactura(r.FacturaRectificada)}</sum1:IDFacturaRectificada></sum1:FacturasRectificadas>` : ''}`
        : '';
    const desg = r.Desglose.map(d => `<sum1:DetalleDesglose>${el('Impuesto', '01')}${el('ClaveRegimen', '01')}${el('CalificacionOperacion', 'S1')}${el('TipoImpositivo', d.TipoImpositivo)}${el('BaseImponibleOimporteNoSujeto', d.BaseImponible)}${el('CuotaRepercutida', d.CuotaRepercutida)}</sum1:DetalleDesglose>`).join('');
    const enc = r.RegistroAnterior
        ? `<sum1:RegistroAnterior>${idFactura(r.RegistroAnterior)}${el('Huella', r.RegistroAnterior.Huella)}</sum1:RegistroAnterior>`
        : el('PrimerRegistro', 'S');
    const sis = Object.entries(SISTEMA).map(([k, v]) => el(k, v)).join('');
    return `<sum1:RegistroAlta>${el('IDVersion', '1.0')}<sum1:IDFactura>${idFactura(r)}</sum1:IDFactura>${el('NombreRazonEmisor', r.NombreRazonEmisor)}${el('TipoFactura', r.TipoFactura)}${rect}${el('DescripcionOperacion', r.DescripcionOperacion)}<sum1:Destinatarios><sum1:IDDestinatario>${el('NombreRazon', r.Destinatario.NombreRazon)}${el('NIF', r.Destinatario.NIF)}</sum1:IDDestinatario></sum1:Destinatarios><sum1:Desglose>${desg}</sum1:Desglose>${el('CuotaTotal', r.CuotaTotal)}${el('ImporteTotal', r.ImporteTotal)}<sum1:Encadenamiento>${enc}</sum1:Encadenamiento><sum1:SistemaInformatico>${sis}</sum1:SistemaInformatico>${el('FechaHoraHusoGenRegistro', r.FechaHoraHusoGenRegistro)}${el('TipoHuella', '01')}${el('Huella', r.Huella)}</sum1:RegistroAlta>`;
}

/** El sobre SOAP de un envío (hasta 1.000 registros del MISMO obligado). */
function sobreSoap({ obligado, registros }) {
    return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sum="${NS_LR}" xmlns:sum1="${NS_SI}"><soapenv:Header/><soapenv:Body><sum:RegFactuSistemaFacturacion><sum:Cabecera><sum1:ObligadoEmision>${el('NombreRazon', obligado.razon_social)}${el('NIF', obligado.nif)}</sum1:ObligadoEmision></sum:Cabecera>${registros.map(r => `<sum:RegistroFactura>${xmlRegistroAlta(r)}</sum:RegistroFactura>`).join('')}</sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`;
}

// ── Envío ────────────────────────────────────────────────────────────────────

const etiqueta = (xml, nombre) => { const m = new RegExp(`<(?:\\w+:)?${nombre}>([^<]*)</(?:\\w+:)?${nombre}>`).exec(xml); return m ? m[1] : null; };

/**
 * Remite a la AEAT. Con el envío apagado no hace nada y lo dice. La AEAT obliga
 * a esperar `TiempoEsperaEnvio` (60 s) entre envíos: lo devuelve para que quien
 * llama no vuelva antes.
 */
async function enviar({ obligado, registros }) {
    if (!activo()) return { enviado: false, motivo: 'VERI*FACTU apagado (VERIFACTU_ENVIO_ENABLED o el certificado no están en el servidor)' };
    const body = sobreSoap({ obligado, registros });
    const agent = new https.Agent({ pfx: fs.readFileSync(process.env.VERIFACTU_CERT_PATH), passphrase: process.env.VERIFACTU_CERT_PASS || '' });
    const url = new URL(URL_SOAP[ENTORNO]);
    const respuesta = await new Promise((resolve, reject) => {
        const req = https.request({ method: 'POST', hostname: url.hostname, path: url.pathname, agent,
            headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body), SOAPAction: '' } }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => { data += c; });
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.setTimeout(60000, () => req.destroy(new Error('La AEAT no ha contestado en 60 s')));
        req.write(body);
        req.end();
    });
    return {
        enviado: true, status: respuesta.status,
        estadoEnvio: etiqueta(respuesta.data, 'EstadoEnvio'), csv: etiqueta(respuesta.data, 'CSV'),
        estadoRegistro: etiqueta(respuesta.data, 'EstadoRegistro'),
        codigoError: etiqueta(respuesta.data, 'CodigoErrorRegistro') || etiqueta(respuesta.data, 'faultstring'),
        descripcionError: etiqueta(respuesta.data, 'DescripcionErrorRegistro'),
        esperaSegundos: Number(etiqueta(respuesta.data, 'TiempoEsperaEnvio')) || 60,
    };
}

module.exports = {
    ENTORNO, SISTEMA, activo, fechaVf, importeVf, fechaHoraHuso, huellaAlta, huellaAnulacion, urlQr, qrDataUri,
    desglose, registroAlta, xmlRegistroAlta, sobreSoap, enviar,
};
