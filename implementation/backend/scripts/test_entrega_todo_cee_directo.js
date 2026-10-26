// «Entregar todo» de un CEE directo DOBLE (ceeDirectoEntrega.entregarTodo):
// los cinco papeles en UN mensaje y en el orden que pidió Fran, sin tocar la BD,
// Drive, el email ni WhatsApp (todo con dobles).
//   node implementation/backend/scripts/test_entrega_todo_cee_directo.js
const assert = require('assert');
const path = require('path');

const S = path.join(__dirname, '..', 'services');
const doble = (rel, exp) => {
    const f = require.resolve(path.join(S, rel));
    require.cache[f] = { id: f, filename: f, loaded: true, exports: exp };
};

// ── Dobles ──────────────────────────────────────────────────────────────────
let fila;
const enviados = { email: [], texto: [], media: [] };
const escrito = { merge: [], historial: [], guia: [] };
let drive;
let guiaVa = true;
let guiaRevienta = false;

doble('supabaseClient.js', {});
doble('emailService.js', { sendMail: async (m) => { enviados.email.push(m); } });
doble('whatsappService.js', {
    sendText: async (tlf, t) => { enviados.texto.push({ tlf, t }); },
    sendMedia: async (tlf, media, o) => { enviados.media.push({ tlf, filename: media.filename, caption: o.caption }); },
});
doble('ceeDirectoUploadService.js', {
    normalizePhase: (f) => (f === 'final' ? 'final' : 'inicial'),
    scanSection: async (row, ph) => drive[ph],
    getSlotAttachments: async (row, ph, slots) => slots
        .filter(s => drive[ph][s] && !drive[ph][s].noBaja)
        .map(s => ({ slot: s, filename: drive[ph][s].name, content: Buffer.from(drive[ph][s].name), contentType: 'application/pdf' })),
});
doble('ceeDirectoService.js', {
    cargar: async () => fila,
    contactoCliente: (c) => ({ nombre: c?.nombre_razon_social, tlf: c?.tlf, email: c?.email }),
    obraDe: () => ({ cliente: 'JOSÉ ÁNGEL VIOLERO', direccion: 'C/ EJEMPLO 1' }),
    mergeDoc: async (id, clave, v) => { escrito.merge.push({ clave, v }); },
    anotarHistorial: async (id, h) => { escrito.historial.push(h.texto); },
});
doble('guiaIrpfService.js', {
    guiaDeEntrega: async (row, fase) => (guiaVa && fase === 'final'
        ? { va: true, modalidad: '60', texto: 'Y como tus certificados acreditan la mejora, te mandamos también una *guía*.', fichero: 'N - GUÍA DEDUCCIÓN IRPF.pdf', avisos: [], _interno: {} }
        : { va: false }),
    guiaDeEntregaPublica: (g) => { if (!g) return null; const { _interno, ...p } = g; return p; },  // eslint-disable-line no-unused-vars
    pdfGuiaDeEntrega: async () => {
        if (guiaRevienta) throw new Error('chromium no arranca');
        return { buffer: Buffer.from('guia'), filename: '2026CEE_99 – GUÍA DEDUCCIÓN IRPF.pdf' };
    },
    sellarGuiaEntregada: async (g, b, o) => { escrito.guia.push(o); },
});

const entrega = require('../services/ceeDirectoEntrega');

// ── Escenario base: 2026CEE_61 con las dos fases listas ─────────────────────
const reset = (cambios = {}) => {
    fila = {
        id: 'x', numero_expediente: '2026CEE_99', alcance: 'DOBLE', cobrado: true, drive_folder_id: 'root',
        cliente: { nombre_razon_social: 'JOSÉ ÁNGEL VIOLERO MANJAVACAS', tlf: '600000000', email: 'cliente@example.com' },
        seguimiento: { cee_inicial: 'REGISTRADO', cee_final: 'REGISTRADO' },
        documentacion: {},
        ...cambios,
    };
    drive = {
        inicial: { pdf: { name: 'INI_fdo.pdf' }, registro: { name: 'INI_reg.pdf' }, etiqueta: { name: 'INI_etq.pdf' } },
        final: { pdf: { name: 'FIN_fdo.pdf' }, registro: { name: 'FIN_reg.pdf' }, etiqueta: { name: 'FIN_etq.pdf' } },
    };
    guiaVa = true; guiaRevienta = false;
    enviados.email = []; enviados.texto = []; enviados.media = [];
    escrito.merge = []; escrito.historial = []; escrito.guia = [];
};

let n = 0;
const t = async (nombre, fn) => { reset(); await fn(); n++; console.log('  ✓', nombre); };

(async () => {
    await t('los CINCO adjuntos, en el orden pedido, por los dos canales y en un solo email', async () => {
        const r = await entrega.entregarTodo('x', { usuario: 'fran' });
        assert.strictEqual(r.enviado, true);
        const orden = ['INI_fdo.pdf', 'INI_etq.pdf', 'FIN_fdo.pdf', 'FIN_etq.pdf', '2026CEE_99 - GUÍA DEDUCCIÓN IRPF.pdf'];
        assert.deepStrictEqual(r.ficheros, orden);
        assert.strictEqual(enviados.email.length, 1);
        assert.deepStrictEqual(enviados.email[0].attachments.map(a => a.filename), orden);
        assert.strictEqual(enviados.texto.length, 1, 'WhatsApp: UN texto');
        assert.deepStrictEqual(enviados.media.map(m => m.filename), orden);
        assert.deepStrictEqual(enviados.media.map(m => m.caption.slice(0, 2)), ['1.', '2.', '3.', '4.', '5.']);
        // Sin justificante de registro: no es de los cinco.
        assert.ok(!r.ficheros.some(f => /reg/.test(f)));
    });

    await t('el texto lista los cinco y anuncia la guía; saluda por el nombre de pila', async () => {
        await entrega.entregarTodo('x', {});
        const txt = enviados.texto[0].t;
        assert.ok(txt.startsWith('¡Hola José!'));
        assert.ok(/1\. CEE inicial firmado\n2\. Etiqueta energética del CEE inicial\n3\. CEE final firmado\n4\. Etiqueta energética del CEE final\n5\. Guía para la deducción en la Renta/.test(txt), txt);
        assert.ok(txt.includes('*guía*'));
        assert.ok(txt.includes('Ya está pagado'));
    });

    await t('sella las DOS fases (todo: true), con sus ficheros, y escribe el historial', async () => {
        await entrega.entregarTodo('x', { usuario: 'fran' });
        assert.strictEqual(escrito.merge.length, 1);
        const { clave, v } = escrito.merge[0];
        assert.strictEqual(clave, 'entrega_cliente');
        assert.strictEqual(v.inicial.todo, true);
        assert.deepStrictEqual(v.inicial.ficheros, ['INI_fdo.pdf', 'INI_etq.pdf']);
        assert.strictEqual(v.final.ficheros.length, 3);
        assert.ok(/CEE INICIAL Y FINAL ENTREGADOS EN UN SOLO MENSAJE AL CLIENTE/.test(escrito.historial[0]));
        assert.strictEqual(escrito.guia.length, 1, 'la guía queda sellada como enviada');
    });

    await t('con las dos fases ya entregadas NO sale sin `reenviar`', async () => {
        reset({ documentacion: { entrega_cliente: { inicial: { at: '2026-10-01' }, final: { at: '2026-10-02' } } } });
        const r = await entrega.entregarTodo('x', {});
        assert.strictEqual(r.motivo, 'YA_ENTREGADO');
        assert.strictEqual(enviados.texto.length + enviados.email.length, 0);
        const r2 = await entrega.entregarTodo('x', { reenviar: true });
        assert.strictEqual(r2.enviado, true);
    });

    await t('con solo el inicial entregado, «todo» sí sale (el juego completo)', async () => {
        reset({ documentacion: { entrega_cliente: { inicial: { at: '2026-10-01' } } } });
        const r = await entrega.entregarTodo('x', {});
        assert.strictEqual(r.enviado, true);
    });

    await t('sin cobrar no sale; con `sinCobro` sí, y queda sellado sin_cobrar', async () => {
        reset({ cobrado: false });
        const r = await entrega.entregarTodo('x', {});
        assert.strictEqual(r.motivo, 'FALTAN_REQUISITOS');
        assert.deepStrictEqual(r.faltan, ['Marcar el expediente como cobrado']);
        const r2 = await entrega.entregarTodo('x', { sinCobro: true });
        assert.strictEqual(r2.enviado, true);
        assert.strictEqual(escrito.merge[0].v.final.sin_cobrar, true);
        assert.ok(!enviados.texto[0].t.includes('Ya está pagado'));
    });

    await t('falta la etiqueta del final o el final no está registrado → no sale, y dice qué', async () => {
        delete drive.final.etiqueta;
        fila.seguimiento.cee_final = 'PRESENTADO';
        const r = await entrega.entregarTodo('x', {});
        assert.strictEqual(r.motivo, 'FALTAN_REQUISITOS');
        assert.deepStrictEqual(r.faltan, ['Que el CEE final esté registrado', 'Subir la etiqueta energética del CEE final']);
    });

    await t('un ÚNICO no tiene «todo»', async () => {
        reset({ alcance: 'UNICO' });
        const r = await entrega.entregarTodo('x', {});
        assert.strictEqual(r.motivo, 'FALTAN_REQUISITOS');
        assert.ok(r.faltan[0].startsWith('Solo para encargos con CEE inicial y final'));
    });

    await t('un fichero que no baja de Drive → no sale NADA', async () => {
        drive.inicial.etiqueta.noBaja = true;
        const r = await entrega.entregarTodo('x', {});
        assert.strictEqual(r.motivo, 'ADJUNTOS_NO_DESCARGABLES');
        assert.strictEqual(enviados.texto.length + enviados.email.length, 0);
        assert.strictEqual(escrito.merge.length, 0);
    });

    await t('la guía no se puede preparar → van cuatro y el texto (aunque se editara) no la anuncia', async () => {
        guiaRevienta = true;
        const r = await entrega.entregarTodo('x', { mensaje: 'Texto editado que habla de la guía' });
        assert.strictEqual(r.enviado, true);
        assert.strictEqual(r.ficheros.length, 4);
        assert.ok(!enviados.texto[0].t.includes('guía'), enviados.texto[0].t);
        assert.ok(r.errores.some(e => e.startsWith('guía de la Renta')));
    });

    await t('el texto editado se respeta cuando todo va', async () => {
        await entrega.entregarTodo('x', { mensaje: 'Hola, aquí va todo.' });
        assert.strictEqual(enviados.texto[0].t, 'Hola, aquí va todo.');
    });

    await t('solo por WhatsApp si así se elige', async () => {
        const r = await entrega.entregarTodo('x', { channels: ['whatsapp'] });
        assert.deepStrictEqual(r.canales, ['whatsapp']);
        assert.strictEqual(enviados.email.length, 0);
    });

    await t('si la factura es del PARTNER, va al partner y en plural', async () => {
        reset({
            prescriptor: { razon_social: 'ATERSOL', tlf: '611111111', email: 'partner@example.com' },
            documentacion: { facturas_emitidas: { a: { destino: 'partner', numero: '26ING_81', emitida_at: '2026-10-01', envios: [{ tlf: '622222222' }] } } },
        });
        await entrega.entregarTodo('x', {});
        assert.strictEqual(enviados.texto[0].tlf, '622222222');
        assert.ok(enviados.texto[0].t.includes('Os lo mandamos todo junto'));
        assert.ok(enviados.texto[0].t.includes('Pasádsela'));
    });

    await t('el borrador del popup: adjuntos en orden y el mismo texto, sin enviar nada', async () => {
        const b = await entrega.borradorTodo('x');
        assert.strictEqual(b.puede, true);
        assert.deepStrictEqual(b.adjuntos.map(a => a.fichero), ['INI_fdo.pdf', 'INI_etq.pdf', 'FIN_fdo.pdf', 'FIN_etq.pdf', 'N - GUÍA DEDUCCIÓN IRPF.pdf']);
        assert.ok(!('_guia' in b));
        assert.ok(b.mensaje.includes('5. Guía para la deducción en la Renta'));
        assert.strictEqual(enviados.texto.length + enviados.email.length + escrito.merge.length, 0);
    });

    console.log(`\n${n} OK`);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
