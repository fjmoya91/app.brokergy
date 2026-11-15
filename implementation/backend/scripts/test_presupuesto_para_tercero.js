// Presupuesto de CEE que pide un INSTALADOR «para un cliente suyo» (2026-11-10):
// al aceptar, el CEE nace a nombre del PROPIETARIO, se le factura (y entrega) al
// instalador, y la visita se concierta con quien diga. Sin BD, Drive, email ni
// WhatsApp: Supabase es una tabla en memoria.
//   node implementation/backend/scripts/test_presupuesto_para_tercero.js
const assert = require('assert');
const path = require('path');

const S = path.join(__dirname, '..', 'services');
const doble = (rel, exp) => {
    const f = require.resolve(path.join(S, rel));
    require.cache[f] = { id: f, filename: f, loaded: true, exports: exp };
};

// ── Supabase en memoria (lo justo que usa ceeOfertaService) ────────────────
let db;
let nId = 0;
const PK = { clientes: 'id_cliente', prescriptores: 'id_empresa' };
function consulta(tabla) {
    const q = { tabla, filtros: [], op: 'select', datos: null, lim: null, uno: null, devolver: false };
    const filas = () => (db[tabla] || []).filter(r => q.filtros.every(f => f(r)));
    const ejecutar = () => {
        if (q.op === 'insert') {
            const pk = PK[tabla] || 'id';
            const nuevas = [].concat(q.datos).map(d => ({ [pk]: `${tabla}-${++nId}`, ...d }));
            (db[tabla] = db[tabla] || []).push(...nuevas);
            return { data: q.uno ? nuevas[0] : nuevas, error: null };
        }
        if (q.op === 'update') {
            const af = filas();
            af.forEach(r => Object.assign(r, q.datos));
            return { data: q.devolver ? af.map(r => ({ ...r })) : null, error: null };
        }
        if (q.op === 'delete') {
            const quitar = new Set(filas());
            db[tabla] = (db[tabla] || []).filter(r => !quitar.has(r));
            return { data: null, error: null };
        }
        let out = filas().map(r => ({ ...r }));
        if (q.lim != null) out = out.slice(0, q.lim);
        if (q.uno) return { data: out[0] || null, error: null };
        return { data: out, error: null };
    };
    const b = {
        select() { if (q.op !== 'select') q.devolver = true; return b; },
        insert(d) { q.op = 'insert'; q.datos = d; return b; },
        update(d) { q.op = 'update'; q.datos = d; return b; },
        delete() { q.op = 'delete'; return b; },
        eq(k, v) { q.filtros.push(r => r[k] === v); return b; },
        neq(k, v) { q.filtros.push(r => r[k] !== v); return b; },
        is(k, v) { q.filtros.push(r => (r[k] ?? null) === v); return b; },
        limit(n) { q.lim = n; return b; },
        maybeSingle() { q.uno = true; return Promise.resolve(ejecutar()); },
        single() { q.uno = true; return Promise.resolve(ejecutar()); },
        then(res, rej) { return Promise.resolve(ejecutar()).then(res, rej); },
    };
    return b;
}

doble('supabaseClient.js', { from: consulta });
doble('pdfService.js', { htmlToPdf: async () => Buffer.from('pdf') });
doble('emailService.js', { sendMail: async () => {} });
doble('whatsappService.js', { sendText: async () => {}, sendMedia: async () => {} });
doble('driveService.js', { saveFileToFolder: async () => {} });
doble('avisosAlPartner.js', { marcarSiElPartnerLoPide: async () => {} });
doble('ceeDirectoDocsService.js', { asegurarToken: async () => 'tok' });
let creados;
let revientaAlta = false;
doble('ceeDirectoService.js', {
    crearExpediente: async (datos) => {
        if (revientaAlta) throw new Error('Drive no responde');
        creados.push(datos);
        return { id: 'cee-1', numero_expediente: '2026CEE_99' };
    },
    anotarHistorial: async () => {},
    contactoCliente: (c) => (c?.notificaciones_contacto_activas
        ? { nombre: c.persona_contacto_nombre, tlf: c.persona_contacto_tlf, email: c.persona_contacto_email }
        : { nombre: c?.nombre_razon_social, tlf: c?.tlf, email: c?.email }),
});

const ofertas = require('../services/ceeOfertaService');
const entrega = require('../services/ceeDirectoEntrega');

const TOKEN = 'a'.repeat(32);
const INSTALADOR = {
    id_cliente: 'inst', nombre_razon_social: 'INSTALACIONES EJEMPLO, SL', dni: 'B00000000',
    tlf: '600000001', email: 'inst@example.com', persona_contacto_nombre: 'ALBERTO',
};
const reset = (oferta = {}) => {
    nId = 0; creados = []; revientaAlta = false;
    db = {
        clientes: [{ ...INSTALADOR }],
        prescriptores: [{ id_empresa: 'pres-inst', cif: 'B00000000', razon_social: 'INSTALACIONES EJEMPLO, SL' }],
        cee_directos: [],
        cee_ofertas: [{
            id: 'of1', token: TOKEN, estado: 'ENVIADA', numero: 'P-26ING_50', cliente_id: 'inst',
            prescriptor_id: null, alcance: 'UNICO', para_tercero: true, precio: 150, tasa: 16.39, num_tasas: 1,
            direccion: 'C/ MAYOR 3', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL', historial: [], ...oferta,
        }],
    };
};
const form = (extra = {}) => ({
    nombre_razon_social: 'INSTALACIONES EJEMPLO, SL', dni_cif: 'B00000000', email: 'inst@example.com', telefono: '600000001',
    direccion: 'C/ MAYOR 3', municipio: 'TOMELLOSO',
    cuestionario: { calefaccion: 'gas', acs: 'termo', aire_acondicionado: false, placas: 'no' },
    propietario: { nombre: 'Ana', apellidos: 'López', dni: '00000000-t' },
    ...extra,
});
const cliente = (id) => db.clientes.find(c => c.id_cliente === id);

let n = 0;
const t = async (nombre, fn) => { reset(); await fn(); n++; console.log('  ✓', nombre); };
const falla = async (p, re) => {
    let e = null;
    try { await p; } catch (err) { e = err; }
    assert.ok(e, 'tenía que fallar'); assert.match(e.message, re); return e;
};

(async () => {
    await t('propietario nuevo, visita con el instalador: el CEE es del propietario y paga el instalador', async () => {
        const r = await ofertas.aceptar(TOKEN, form());
        assert.strictEqual(r.numeroExpediente, '2026CEE_99');
        const c = creados[0];
        const prop = cliente(c.cliente_id);
        assert.notStrictEqual(c.cliente_id, 'inst');
        assert.strictEqual(c.pagador_cliente_id, 'inst');
        assert.strictEqual(c.nombre, 'ANA LÓPEZ');
        assert.strictEqual(c.prescriptor_id, 'pres-inst');                 // el partner con el CIF del instalador
        assert.strictEqual(c.documentacion.cuestionario.coordina_visita, 'instalador');
        assert.strictEqual(prop.dni, '00000000T');                          // DNI limpio
        assert.strictEqual(prop.direccion, 'C/ MAYOR 3');                   // nace con el inmueble como domicilio
        assert.strictEqual(prop.notificaciones_contacto_activas, true);     // desvío al instalador
        assert.strictEqual(prop.persona_contacto_nombre, 'ALBERTO');
        assert.strictEqual(prop.persona_contacto_tlf, '600000001');
        const of = db.cee_ofertas[0];
        assert.strictEqual(of.estado, 'ACEPTADA');
        assert.strictEqual(of.propietario_cliente_id, c.cliente_id);
        assert.strictEqual(of.cliente_id, 'inst');
    });

    await t('visita con el propietario y con su móvil: su ficha NO lleva desvío', async () => {
        await ofertas.aceptar(TOKEN, form({ coordina_visita: 'propietario', propietario: { nombre: 'Ana', dni: '00000000T', telefono: '600000002' } }));
        const prop = cliente(creados[0].cliente_id);
        assert.ok(!prop.notificaciones_contacto_activas);
        assert.strictEqual(prop.tlf, '600000002');
        assert.strictEqual(creados[0].documentacion.cuestionario.coordina_visita, 'propietario');
    });

    await t('«con el propietario» pero sin móvil ni email: se concierta con el instalador', async () => {
        await ofertas.aceptar(TOKEN, form({ coordina_visita: 'propietario' }));
        assert.strictEqual(creados[0].documentacion.cuestionario.coordina_visita, 'instalador');
        assert.strictEqual(cliente(creados[0].cliente_id).notificaciones_contacto_activas, true);
    });

    await t('propietario que YA tiene ficha: se usa, se rellenan huecos y no se le toca el desvío', async () => {
        db.clientes.push({ id_cliente: 'ana', nombre_razon_social: 'ANA', apellidos: null, dni: '00000000T', tlf: '699999999', direccion: null });
        await ofertas.aceptar(TOKEN, form());
        assert.strictEqual(creados[0].cliente_id, 'ana');
        assert.strictEqual(db.clientes.length, 2);                          // no nace otra
        const ana = cliente('ana');
        assert.strictEqual(ana.apellidos, 'LÓPEZ');
        assert.strictEqual(ana.tlf, '699999999');                           // lo que había no se pisa
        assert.strictEqual(ana.direccion, 'C/ MAYOR 3');
        assert.ok(!ana.notificaciones_contacto_activas);
    });

    await t('el DNI del propietario no puede ser el del instalador', async () => {
        const e = await falla(ofertas.aceptar(TOKEN, form({ propietario: { nombre: 'X', dni: 'b-00000000' } })), /mismo que el tuyo/);
        assert.strictEqual(e.status, 400);
        assert.strictEqual(db.cee_ofertas[0].estado, 'ENVIADA');
    });

    await t('sin el DNI del propietario no se acepta y la oferta sigue ENVIADA', async () => {
        const e = await falla(ofertas.aceptar(TOKEN, form({ propietario: { nombre: 'Ana' } })), /DNI del propietario/);
        assert.strictEqual(e.status, 400);
        assert.strictEqual(db.cee_ofertas[0].estado, 'ENVIADA');
        assert.strictEqual(creados.length, 0);
    });

    await t('si el alta del CEE falla, la oferta vuelve a ENVIADA y la ficha recién nacida se quita', async () => {
        revientaAlta = true;
        await falla(ofertas.aceptar(TOKEN, form()), /Drive no responde/);
        assert.strictEqual(db.cee_ofertas[0].estado, 'ENVIADA');
        assert.deepStrictEqual(db.clientes.map(c => c.id_cliente), ['inst']);
    });

    await t('un presupuesto normal no cambia: el CEE es de quien acepta y no hay pagador', async () => {
        reset({ para_tercero: false });
        await ofertas.aceptar(TOKEN, form({ propietario: undefined }));
        assert.strictEqual(creados[0].cliente_id, 'inst');
        assert.strictEqual(creados[0].pagador_cliente_id, null);
        assert.ok(!('coordina_visita' in creados[0].documentacion.cuestionario));
        assert.strictEqual(db.clientes.length, 1);
    });

    await t('la entrega va a quien paga, salvo que la factura se le hiciera al cliente', async () => {
        const row = {
            cliente: { nombre_razon_social: 'ANA', notificaciones_contacto_activas: true, persona_contacto_nombre: 'ALBERTO', persona_contacto_tlf: '600000001' },
            pagador: { ...INSTALADOR },
            documentacion: {},
        };
        const d = entrega.destinatarioEntrega(row);
        assert.strictEqual(d.pagador, true); assert.strictEqual(d.email, 'inst@example.com');
        row.documentacion.facturas_emitidas = { a: { numero: 'F1', destino: 'cliente', emitida_at: '2026-11-10' } };
        assert.ok(!entrega.destinatarioEntrega(row).pagador);
    });

    console.log(`\n${n} comprobaciones OK`);
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
