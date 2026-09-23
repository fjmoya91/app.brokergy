// ─── facturaSheetService.js ─────────────────────────────────────────────────
// La hoja "APP PPTO Y FACTURAS" es el LIBRO DE FACTURAS de Brokergy: de ahí tira
// también la app de AppSheet, que numera sus facturas con la MISMA serie
// ({YY}ING_{n}). Dos sitios emitiendo contra la misma serie solo es seguro si
// los dos miran el mismo contador, así que esta app NO tiene numeración propia:
// lee la hoja, toma el siguiente y escribe su fila en el acto para reservarlo.
//
// Lo que se escribe es lo MISMO que escribe AppSheet, columna a columna
// (medido sobre 26ING_70 · _75 · _77, que son facturas de CEE de la propia app):
//   · FACTURAS            → la cabecera (nº, cliente por NIF, importes, estado…)
//   · DETALLE FACTURA     → una fila por línea, enlazada por el `id` de la factura
//   · CLIENTES            → la ficha del cliente, SOLO si su NIF no está (AppSheet
//                           busca el cliente por el NIF de la cabecera)
// Así la factura aparece en AppSheet igual que si se hubiera hecho allí, y si
// alguien la reabre desde allí sale el mismo documento.
//
// ⚠️ DETALLE FACTURA tiene las cabeceras DESPLAZADAS una columna desde
// "DESCUENTO %" (se borró una columna de IRPF y los datos no se movieron). Lo que
// hay debajo de cada cabecera es: G = IRPF % (0,15 fantasma, lo escribe AppSheet
// en todas las filas) · H = DESCUENTO % · I = DESCUENTO TOTAL · J = SUB TOTAL ·
// K = TOTAL A PAGAR · L = IVA. Se escribe IGUAL que AppSheet —también el 0,15—
// para que su app lea nuestras filas como las suyas. El script de Apps Script
// que regenera el PDF (`_desplazamiento`) ya lo sabe leer así.
// Antes de escribir se comprueba que las cabeceras siguen siendo esas: si alguien
// reordena la hoja, se para en vez de escribir importes en la columna que no es.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const { google } = require('googleapis');

const HOJA_ID = process.env.APPSHEET_FACTURAS_SHEET_ID || '1MaVmhOcjwPJZy4EavdlYwbXZ5t89FhBPTT4WIfU2z2k';
// La cuenta con la que se hacen las facturas en AppSheet. Va en la columna
// USUARIO de cada fila: si la app filtra por el usuario, una fila con otro no
// se vería allí.
const USUARIO_APPSHEET = process.env.APPSHEET_USUARIO || 'franciscojavier.moya.s2e2@gmail.com';
// Carpeta FACTURAS junto a la hoja: ahí busca AppSheet el PDF de cada factura.
const CARPETA_FACTURAS = process.env.APPSHEET_FACTURAS_FOLDER_ID || '1v32LiN17naTvgjZyIn2mEnTRVoC0PAQW';
const RUTA_APP_FACTURAS = '/appsheet/data/APPPPTOYFACTURAS-92521152/FACTURAS/';

const TAB_FACTURAS = 'FACTURAS';
const TAB_DETALLE = 'DETALLE FACTURA';
const TAB_CLIENTES = 'CLIENTES';
const TAB_ARTICULOS = 'ARTÍCULOS';

const CAB_FACTURAS = ['id', 'Nº FACTURA', 'Nº EXPEDIENTE ASOCIADO', 'USUARIO', 'MARCATIEMPO', 'FECHA FACTURA',
    'FECHA VENCIMIENTO', 'CLIENTE', 'ESTADO', 'FECHA DE PAGO', 'SUBTOTAL', 'IMPUESTOS', 'DESCUENTO', 'TOTAL',
    'OBSERVACIONES', 'PDF FACTURA'];
const CAB_DETALLE = ['id', 'FACTURA', 'ARTÍCULO', 'CANTIDAD', 'PRECIO', 'IVA %', 'DESCUENTO %', 'DESCUENTO TOTAL',
    'SUB TOTAL', 'TOTAL A PAGAR', 'IVA'];
const IRPF_FANTASMA = 0.15;

const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

const q = (tab) => `'${tab.replace(/'/g, "''")}'`;
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const nif = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Se escribe con USER_ENTERED (para que fechas e importes queden con el tipo que
// les da AppSheet), y ahí un texto que empieza por = + - @ se toma por FÓRMULA:
// "+34 644 48 40 51" acaba como #ERROR! en la ficha del cliente, y unas
// observaciones que empiecen por guion, igual. El apóstrofo lo deja como texto
// (la hoja no lo guarda: es solo la marca de "esto es literal").
const texto = (v) => {
    if (v == null) return '';
    const t = String(v);
    return /^[=+\-@]/.test(t) ? `'${t}` : t;
};
// El teléfono, además, como lo guarda la otra app: sin prefijo de país cuando es
// un número español, para que el mismo cliente no tenga dos formas de teléfono.
const telefono = (v) => {
    const t = String(v ?? '').trim();
    const d = t.replace(/[\s.-]/g, '').replace(/^(\+|00)34(?=\d{9}$)/, '');
    return /^\d{9}$/.test(d) ? d : texto(t);
};
const nuevoId = () => crypto.randomBytes(4).toString('hex');   // 8 hex, como UNIQUEID() de AppSheet

/** Columna en letras (0 → A, 26 → AA). */
function letra(i) {
    let s = ''; i += 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
}

/** `dd/mm/aaaa` y `dd/mm/aaaa hh:mm:ss` en hora de Madrid, como los escribe AppSheet. */
function fechaHoja(d = new Date()) {
    return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' });
}
function marcaTiempo(d = new Date()) {
    const h = new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Europe/Madrid' });
    return `${fechaHoja(d)} ${h}`;
}

async function leer(rango, render = 'UNFORMATTED_VALUE') {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: HOJA_ID, range: rango, valueRenderOption: render });
    return r.data.values || [];
}

async function cabeceras(tab) {
    const [fila] = await leer(`${q(tab)}!1:1`, 'FORMATTED_VALUE');
    return (fila || []).map(h => String(h ?? '').trim());
}

/** Índice de cada cabecera exigida; lanza si falta alguna (la hoja ha cambiado). */
function mapaCabeceras(tab, cab, exigidas) {
    const idx = {};
    for (const h of exigidas) {
        const i = cab.findIndex(c => norm(c) === norm(h));
        if (i < 0) throw new Error(`La pestaña ${tab} de la hoja de facturas ya no tiene la columna «${h}». No se escribe nada hasta revisarlo.`);
        idx[h] = i;
    }
    return idx;
}

// ── Catálogo ────────────────────────────────────────────────────────────────

/** Los artículos de la hoja: { id, nombre, importe, iva (fracción) }. */
async function articulos() {
    const filas = await leer(`${q(TAB_ARTICULOS)}!A2:D`);
    return filas
        .filter(f => f[0] !== undefined && f[0] !== '' && f[1])
        .map(f => ({ id: String(f[0]), nombre: String(f[1]).trim(), importe: Number(f[2]) || 0, iva: Number(f[3]) || 0 }));
}

// ── Numeración ──────────────────────────────────────────────────────────────

const RE_NUM = /^(\d{2})ING_(\d+)$/;

/**
 * Siguiente número de la serie. El correlativo NO se reinicia en enero: la hoja
 * pasó de 25ING_37 a 26ING_38, así que manda el MAYOR de todos (de cualquier
 * año) + 1 con el prefijo del año en curso.
 */
function siguienteDe(numeros, ahora = new Date()) {
    let max = 0;
    for (const n of numeros) {
        const m = RE_NUM.exec(String(n || '').trim());
        if (m) max = Math.max(max, Number(m[2]));
    }
    const yy = new Date(ahora).toLocaleDateString('es-ES', { year: '2-digit', timeZone: 'Europe/Madrid' });
    return { numero: `${yy}ING_${max + 1}`, correlativo: max + 1 };
}

async function columnasIdNumero() {
    const cab = await cabeceras(TAB_FACTURAS);
    const ix = mapaCabeceras(TAB_FACTURAS, cab, ['id', 'Nº FACTURA']);
    const filas = await leer(`${q(TAB_FACTURAS)}!A2:${letra(Math.max(ix.id, ix['Nº FACTURA']))}`, 'FORMATTED_VALUE');
    return filas.map((f, i) => ({ fila: i + 2, id: String(f[ix.id] ?? ''), numero: String(f[ix['Nº FACTURA']] ?? '').trim() }));
}

/** El número que tocaría AHORA (para enseñarlo en la vista previa; no reserva nada). */
async function proximoNumero() {
    const filas = await columnasIdNumero();
    return siguienteDe(filas.map(f => f.numero)).numero;
}

// ── Candado ─────────────────────────────────────────────────────────────────
// Dentro de ESTE proceso dos emisiones no pueden solaparse (doble clic, dos
// pestañas). Contra AppSheet no hay candado posible: lo cubre la comprobación
// de después de escribir.
let cola = Promise.resolve();
function enExclusiva(fn) {
    const run = cola.then(fn, fn);
    cola = run.catch(() => {});
    return run;
}

// ── Clientes ────────────────────────────────────────────────────────────────

/**
 * Da de alta al cliente en la pestaña CLIENTES si su NIF no está. Si ya está NO
 * se toca: esa ficha es de la otra app y puede tener lo que alguien corrigió allí.
 */
async function asegurarCliente(c, { usuario = USUARIO_APPSHEET } = {}) {
    const cab = await cabeceras(TAB_CLIENTES);
    const ix = mapaCabeceras(TAB_CLIENTES, cab, ['id_CLIENTE', 'USUARIO', 'RAZON SOCIAL', 'EMAIL', 'TLF', 'CIF',
        'Provincia', 'Municipio', 'Dirección', 'Código Postal']);
    const filas = await leer(`${q(TAB_CLIENTES)}!${letra(ix.CIF)}2:${letra(ix.CIF)}`, 'FORMATTED_VALUE');
    if (filas.some(f => nif(f[0]) && nif(f[0]) === nif(c.cif))) return { creado: false };

    const fila = new Array(cab.length).fill('');
    const poner = (h, v) => { const i = cab.findIndex(x => norm(x) === norm(h)); if (i >= 0) fila[i] = v ?? ''; };
    poner('id_CLIENTE', nuevoId());
    poner('USUARIO', usuario);
    poner('RAZON SOCIAL', texto(c.razon_social));
    poner('EMAIL', texto(c.email));
    poner('TLF', telefono(c.tlf));
    poner('CIF', texto(c.cif));
    poner('Comunidad Autónoma', texto(c.ccaa));
    poner('Provincia', texto(c.provincia));
    poner('Municipio', texto(c.municipio));
    poner('Dirección', texto(c.direccion));
    poner('Código Postal', texto(c.cp));
    poner('FORMA DE PAGO', 'TRANSFERENCIA');
    await sheets.spreadsheets.values.append({
        spreadsheetId: HOJA_ID, range: `${q(TAB_CLIENTES)}!A1`, valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS', requestBody: { values: [fila] }
    });
    return { creado: true };
}

// ── Emisión ─────────────────────────────────────────────────────────────────

/**
 * Reserva el número y escribe la factura en la hoja.
 * @param {object} f  { expediente, cliente:{razon_social,cif,…}, fechaIso, vencimientoIso,
 *                      lineas:[calculadas], totales:{neto,iva,descuento,total}, observaciones, estado }
 * @returns {{ id, numero, fila }}
 */
function emitir(f) {
    return enExclusiva(async () => {
        const cabF = await cabeceras(TAB_FACTURAS);
        const ixF = mapaCabeceras(TAB_FACTURAS, cabF, CAB_FACTURAS);
        const cabD = await cabeceras(TAB_DETALLE);
        // El orden de DETALLE FACTURA importa (ver cabecera del fichero): se
        // exige EXACTAMENTE el que hay hoy.
        if (CAB_DETALLE.some((h, i) => norm(cabD[i]) !== norm(h))) {
            throw new Error(`La pestaña ${TAB_DETALLE} ha cambiado de columnas (${cabD.join(' · ')}). No se escribe nada hasta revisarlo.`);
        }

        const id = nuevoId();
        const hoy = new Date();
        const aHoja = (iso) => { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; };

        const filaFactura = (numero) => {
            const fila = new Array(cabF.length).fill('');
            const v = {
                'id': id,
                'Nº FACTURA': numero,
                'Nº EXPEDIENTE ASOCIADO': texto(f.expediente),
                'USUARIO': USUARIO_APPSHEET,
                'MARCATIEMPO': marcaTiempo(hoy),
                'FECHA FACTURA': aHoja(f.fechaIso),
                'FECHA VENCIMIENTO': aHoja(f.vencimientoIso),
                'CLIENTE': texto(f.cliente.cif),
                'ESTADO': f.estado || 'ENVIADA',
                'FECHA DE PAGO': '',
                'SUBTOTAL': f.totales.neto,
                'IMPUESTOS': f.totales.iva,
                'DESCUENTO': f.totales.descuento || 0,
                'TOTAL': f.totales.total,
                'OBSERVACIONES': texto(f.observaciones),
                'PDF FACTURA': '',
            };
            for (const [h, val] of Object.entries(v)) fila[ixF[h]] = val;
            return fila;
        };

        // 1 · Número + fila de cabecera, del tirón: la fila ES la reserva.
        let filas = await columnasIdNumero();
        let { numero } = siguienteDe(filas.map(x => x.numero));
        await sheets.spreadsheets.values.append({
            spreadsheetId: HOJA_ID, range: `${q(TAB_FACTURAS)}!A1`, valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS', requestBody: { values: [filaFactura(numero)] }
        });

        // 2 · Comprobación: si otra fila (de AppSheet) se ha llevado el mismo
        // número entre la lectura y la escritura, la nuestra salta al siguiente.
        let fila = null;
        let libre = false;
        for (let intento = 0; intento < 4 && !libre; intento++) {
            filas = await columnasIdNumero();
            const nuestra = filas.find(x => x.id === id);
            if (!nuestra) throw new Error('La factura no aparece en la hoja después de escribirla');
            fila = nuestra.fila;
            libre = !filas.some(x => x.numero === numero && x.id !== id);
            if (libre) break;
            ({ numero } = siguienteDe(filas.filter(x => x.id !== id).map(x => x.numero)));
            await sheets.spreadsheets.values.update({
                spreadsheetId: HOJA_ID, range: `${q(TAB_FACTURAS)}!${letra(ixF['Nº FACTURA'])}${fila}`,
                valueInputOption: 'RAW', requestBody: { values: [[numero]] }
            });
        }
        if (!libre) throw new Error(`No se ha podido reservar un número libre: la fila ${fila} de FACTURAS quedó con ${numero} repetido. Revísala en la hoja.`);

        // 3 · Líneas, con la forma exacta de AppSheet.
        const lineas = f.lineas.map(l => [
            nuevoId(), id, String(l.articulo_id ?? ''), l.uds, l.precio, l.ivaPct / 100,
            IRPF_FANTASMA, l.dtoPct / 100, l.descuento, l.subtotal, l.subtotal, l.iva
        ]);
        await sheets.spreadsheets.values.append({
            spreadsheetId: HOJA_ID, range: `${q(TAB_DETALLE)}!A1`, valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS', requestBody: { values: lineas }
        });

        // 4 · El cliente, si AppSheet no lo conoce.
        let clienteCreado = false;
        try { clienteCreado = (await asegurarCliente(f.cliente)).creado; }
        catch (e) { console.warn('[factura hoja] cliente:', e.message); }

        return { id, numero, fila, clienteCreado };
    });
}

/** Fila actual de una factura por su id (puede moverse si alguien ordena la hoja). */
async function filaDe(id) {
    const filas = await columnasIdNumero();
    return filas.find(x => x.id === id) || null;
}

/** Escribe columnas de la cabecera de una factura ya emitida. */
async function actualizar(id, valores = {}) {
    const cab = await cabeceras(TAB_FACTURAS);
    const ix = mapaCabeceras(TAB_FACTURAS, cab, Object.keys(valores));
    const f = await filaDe(id);
    if (!f) throw new Error('La factura ya no está en la hoja');
    const data = Object.entries(valores).map(([h, v]) => ({ range: `${q(TAB_FACTURAS)}!${letra(ix[h])}${f.fila}`, values: [[v ?? '']] }));
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: HOJA_ID, requestBody: { valueInputOption: 'USER_ENTERED', data } });
    return f;
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/** Nombre del PDF igual que el de AppSheet: `{nº} - {razón social}.pdf`. */
const nombrePdf = (numero, razon) => `${numero} - ${razon}`.replace(/[\\/<>:"|?*]/g, '_') + '.pdf';

/**
 * Guarda el PDF en la carpeta FACTURAS (sustituyendo el de ese nombre, como el
 * script de AppSheet) y escribe la ruta en "PDF FACTURA", que es de donde lo
 * abre la app.
 */
async function guardarPdf({ id, numero, razonSocial, buffer }) {
    const { Readable } = require('stream');
    const nombre = nombrePdf(numero, razonSocial);
    const safe = nombre.replace(/'/g, "\\'");
    const ya = await drive.files.list({ q: `'${CARPETA_FACTURAS}' in parents and name = '${safe}' and trashed = false`, fields: 'files(id)' });
    for (const x of ya.data.files || []) await drive.files.update({ fileId: x.id, requestBody: { trashed: true } });
    const r = await drive.files.create({
        requestBody: { name: nombre, parents: [CARPETA_FACTURAS] },
        media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
        fields: 'id, webViewLink'
    });
    await actualizar(id, { 'PDF FACTURA': RUTA_APP_FACTURAS + nombre });
    return { driveId: r.data.id, link: r.data.webViewLink, nombre };
}

module.exports = {
    HOJA_ID, articulos, proximoNumero, siguienteDe, emitir, actualizar, filaDe, guardarPdf, nombrePdf,
    fechaHoja, _internos: { letra, mapaCabeceras, nif, texto, telefono }
};
