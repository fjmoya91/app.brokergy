// ─── routes/ceeDirectos.js ───────────────────────────────────────────────────
// CEE contratados SUELTOS — fuera del negocio CAE.
//
// Estas rutas son el gemelo de las rutas CEE de `expedientes.js`, no una
// bifurcación de ellas. Aquellas cargan la oportunidad, calculan la demanda
// objetivo del CAE, mueven la carpeta entre las 13 carpetas de estado y hablan
// de "plazos del programa de ayudas". Nada de eso existe en un CEE de
// compraventa, y meterlo todo detrás de un `if` convertiría el camino del CAE
// —que está en producción y funciona— en el sitio donde se rompe lo nuevo.
//
// Lo que sí se comparte, importado y no copiado: driveService, emailService,
// whatsappService, seguimientoTracking, buildCertClienteData y los slots del CEE.

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const emailService = require('../services/emailService');
const whatsappService = require('../services/whatsappService');
const { enforceAuth, adminOnly, staffOnly, internalOnly, isStaff } = require('../middleware/auth');
const { buildCertClienteData } = require('../services/certClienteData');
const svc = require('../services/ceeDirectoService');
const folders = require('../services/ceeDirectoFolders');
const uploads = require('../services/ceeDirectoUploadService');
const estados = require('../utils/ceeDirectoEstados');
const entrega = require('../services/ceeDirectoEntrega');

const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';

// Deep-link al expediente dentro de la app. `?cee=` y no `?exp=`: son tablas
// distintas y el mismo UUID no vale en las dos.
const enlaceApp = (id) => `${APP_BASE}/?cee=${id}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Un CERTIFICADOR solo puede ver los encargos que tiene asignados.
 * Se comprueba en el HANDLER y no en un middleware porque hace falta la fila
 * cargada para saber a quién está asignada: un middleware tendría que cargarla
 * otra vez.
 */
function puedeVer(req, row) {
    if (isStaff(req)) return true;
    if (req.user?.rol_nombre !== 'CERTIFICADOR') return false;
    return !!req.user.prescriptor_id && row?.cee?.certificador_id === req.user.prescriptor_id;
}

/**
 * Ficha del cliente tal y como la va a recibir el certificador.
 *
 * El CEE se emite a nombre del CLIENTE del expediente, y punto. Hubo una version
 * con un `titular` aparte para el caso "nos contrata una empresa pero la vivienda
 * es de un particular"; se retiro porque ese caso ya lo cubre el modelo de
 * siempre: la empresa es el PARTNER que trae el encargo y el particular es el
 * CLIENTE. Dos campos contestando a "quien va en el certificado" es una
 * contradiccion esperando a ocurrir.
 */
function fichaCliente(row) {
    // `buildCertClienteData` habla el lenguaje del expediente CAE (instalacion +
    // oportunidad). Se le da esa forma con los datos de aqui en vez de duplicar
    // la logica de "la direccion de la instalacion no es el domicilio del cliente".
    const comoExpediente = {
        instalacion: {
            direccion: row.direccion,
            codigo_postal: row.codigo_postal,
            municipio: row.municipio,
            provincia: row.provincia,
            ref_catastral: row.ref_catastral
        }
    };
    return buildCertClienteData(comoExpediente, { ref_catastral: row.ref_catastral }, row.cliente);
}

const nombreCliente = (cli) => cli
    ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim()
    : '';

const telefonoDe = (p) => p?.telefono || p?.movil || p?.tlf || null;

// ════════════════════════════════════════════════════════════════════════════
// ALTA Y LISTADO
// ════════════════════════════════════════════════════════════════════════════

// ⚠️ `/siguiente-numero` va ANTES que `/:id` o Express lo tomaría por un id
// (mismo gotcha que `/fin-obra` en las subidas públicas y `/parte/global`).
router.get('/siguiente-numero', staffOnly, async (req, res) => {
    try {
        const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
        res.json(await svc.siguienteNumero(anio));
    } catch (err) {
        console.error('[cee-directos siguiente-numero]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Comprobación de un número tecleado a mano, para poder avisar EN EL FORMULARIO
// y no después de pulsar "Crear".
router.get('/comprobar-numero', staffOnly, async (req, res) => {
    try {
        const numero = String(req.query.numero || '').trim().toUpperCase();
        if (!numero) return res.status(400).json({ error: 'Falta el número' });
        const usado = await svc.numeroEnUso(numero);
        res.json({ libre: !usado, usadoPor: usado ? { id: usado.id, nombre: usado.nombre } : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET / ── Listado ───────────────────────────────────────────────────────
router.get('/', internalOnly, async (req, res) => {
    try {
        let q = supabase.from(svc.TABLA).select(svc.SELECT_LISTA).order('correlativo', { ascending: false });

        // El técnico ve SOLO lo suyo. Se filtra en la consulta, no después: traer
        // la cartera entera para descartarla en Node es enviar por la red datos
        // que no le tocan.
        if (!isStaff(req)) {
            if (req.user?.rol_nombre !== 'CERTIFICADOR' || !req.user.prescriptor_id) {
                return res.status(403).json({ error: 'Acceso denegado' });
            }
            q = q.eq('cee->>certificador_id', req.user.prescriptor_id);
        }

        if (req.query.prescriptor_id) q = q.eq('prescriptor_id', req.query.prescriptor_id);
        if (req.query.estado) q = q.eq('estado', req.query.estado);
        if (req.query.anio) q = q.eq('anio', parseInt(req.query.anio, 10));

        const { data, error } = await q;
        if (error) throw new Error(error.message);

        // Nombres de cliente, prescriptor y certificador en UNA consulta por tabla,
        // no una por fila (regla 22: nada de N+1 sobre el listado).
        const ids = {
            cli: [...new Set(data.map(r => r.cliente_id).filter(Boolean))],
            pres: [...new Set([
                ...data.map(r => r.prescriptor_id),
                ...data.map(r => r.cee_certificador)
            ].filter(Boolean))]
        };
        const [{ data: clientes }, { data: presc }] = await Promise.all([
            ids.cli.length
                ? supabase.from('clientes').select('id_cliente, nombre_razon_social, apellidos, tlf, email').in('id_cliente', ids.cli)
                : Promise.resolve({ data: [] }),
            ids.pres.length
                ? supabase.from('prescriptores').select('id_empresa, razon_social, acronimo').in('id_empresa', ids.pres)
                : Promise.resolve({ data: [] })
        ]);
        const mapCli = Object.fromEntries((clientes || []).map(c => [c.id_cliente, c]));
        const mapPre = Object.fromEntries((presc || []).map(p => [p.id_empresa, p]));

        const filas = data.map(r => ({
            ...r,
            cliente_nombre: nombreCliente(mapCli[r.cliente_id]),
            prescriptor_nombre: mapPre[r.prescriptor_id]?.razon_social || mapPre[r.prescriptor_id]?.acronimo || null,
            certificador_nombre: mapPre[r.cee_certificador]?.razon_social || mapPre[r.cee_certificador]?.acronimo || null,
            fase_activa: estados.faseActiva(r),
            responsable: estados.responsable(r)
        }));

        res.json(filas);
    } catch (err) {
        console.error('[cee-directos listado]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST / ── Alta ─────────────────────────────────────────────────────────
router.post('/', staffOnly, async (req, res) => {
    try {
        const {
            modo = 'auto',            // 'auto' | 'manual'
            numero_manual,
            anio: anioBody,
            nombre,
            alcance = 'UNICO',
            cliente_id,
            prescriptor_id = null,
            direccion = null,
            ref_catastral = null,
            ccaa = null, provincia = null, municipio = null, codigo_postal = null,
            certificador_id = null,
            notas = null
        } = req.body || {};

        if (!nombre || !String(nombre).trim()) {
            return res.status(400).json({ error: 'El nombre del expediente es obligatorio' });
        }
        // El cliente es obligatorio y con ficha: es lo que recibe el certificador
        // cuando se le encarga el trabajo. Un encargo con "un nombre y un móvil"
        // obliga a perseguir los datos justo cuando ya hay prisa.
        if (!cliente_id) {
            return res.status(400).json({ error: 'Hay que asignar un cliente al expediente' });
        }
        const { data: cli } = await supabase.from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, dni, tlf, email')
            .eq('id_cliente', cliente_id).maybeSingle();
        if (!cli) return res.status(400).json({ error: 'El cliente indicado no existe' });

        // Número
        let anio, correlativo, numero_expediente;
        if (modo === 'manual') {
            const num = String(numero_manual || '').trim().toUpperCase();
            const m = num.match(/^(\d{4})CEE_(\d+)$/);
            if (!m) {
                return res.status(400).json({ error: 'El número debe tener el formato AAAACEE_N (por ejemplo 2026CEE_55)' });
            }
            anio = parseInt(m[1], 10);
            correlativo = parseInt(m[2], 10);
            numero_expediente = num;
            const usado = await svc.numeroEnUso(numero_expediente);
            if (usado) {
                return res.status(409).json({
                    error: `El número ${numero_expediente} ya está usado por "${usado.nombre}". Elige otro o usa la numeración automática.`,
                    usadoPor: { id: usado.id, nombre: usado.nombre }
                });
            }
        } else {
            const sig = await svc.siguienteNumero(anioBody);
            anio = sig.anio; correlativo = sig.correlativo; numero_expediente = sig.numero;
        }

        const alcanceOk = String(alcance).toUpperCase() === 'DOBLE' ? 'DOBLE' : 'UNICO';

        const fila = {
            numero_expediente, anio, correlativo,
            nombre: String(nombre).trim(),
            alcance: alcanceOk,
            cliente_id, prescriptor_id,
            direccion, ref_catastral, ccaa, provincia, municipio, codigo_postal,
            cee: certificador_id ? { certificador_id } : {},
            // Nace pendiente de encargar: es lo que de verdad falta el día 1.
            seguimiento: { cee_inicial: 'PTE_ENVIO_CERT' },
            documentacion: {},
            portal_token: svc.nuevoPortalToken(),
            notas,
            created_by: req.user?.id_usuario || null,
            estado: 'PTE. CEE INICIAL'
        };

        const { data: creado, error } = await supabase.from(svc.TABLA).insert(fila).select().single();
        if (error) {
            // La carrera que el índice único sí puede pillar: dos altas manuales
            // con el mismo número en el mismo instante.
            if (error.code === '23505') {
                return res.status(409).json({ error: `El número ${numero_expediente} acaba de ser usado por otro alta. Vuelve a intentarlo.` });
            }
            throw new Error(error.message);
        }

        // Drive NO bloquea el alta (regla 1). Si Google falla, el expediente
        // existe y la carpeta se arregla después: perder el alta por un 503 es
        // peor que arreglar una carpeta.
        setImmediate(async () => {
            try {
                const carpeta = await folders.crearCarpeta(numero_expediente, fila.nombre, alcanceOk);
                if (carpeta?.id) {
                    await supabase.from(svc.TABLA)
                        .update({ drive_folder_id: carpeta.id, drive_folder_link: carpeta.link })
                        .eq('id', creado.id);
                }
            } catch (e) {
                console.error('[cee-directos alta] carpeta Drive:', e.message);
            }
        });

        res.status(201).json(creado);
    } catch (err) {
        console.error('[cee-directos alta]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /:id ── Detalle ────────────────────────────────────────────────────
router.get('/:id', internalOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!puedeVer(req, row)) return res.status(403).json({ error: 'Acceso denegado' });

        res.json({
            ...row,
            fase_activa: estados.faseActiva(row),
            responsable: estados.responsable(row),
            // El técnico no ve el candado de cobro: no es asunto suyo y enseñárselo
            // solo invita a preguntar por qué no está cobrado.
            cobrado: isStaff(req) ? row.cobrado : undefined,
            portal_token: isStaff(req) ? row.portal_token : undefined,
            // Ni el enlace de la carpeta RAÍZ, que contiene presupuestos y facturas.
            // Sus carpetas le llegan en el encargo, una a una.
            drive_folder_id: isStaff(req) ? row.drive_folder_id : undefined,
            drive_folder_link: isStaff(req) ? row.drive_folder_link : undefined
        });
    } catch (err) {
        console.error('[cee-directos detalle]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /:id ── Autoguardado ───────────────────────────────────────────────
// Mismo modelo que el expediente CAE: el módulo está siempre editable y guarda
// solo. Solo se aceptan los campos que el módulo puede tocar — `estado`,
// `cobrado`, `numero_expediente` y `correlativo` NO están: se derivan o tienen
// su propia ruta con su propio permiso.
const CAMPOS_EDITABLES = [
    'nombre', 'cee', 'seguimiento', 'documentacion', 'direccion', 'ref_catastral',
    'ccaa', 'provincia', 'municipio', 'codigo_postal', 'prescriptor_id', 'notas', 'alcance',
    // Los 55 importados llegaron SIN cliente (una carpeta del Drive antiguo no
    // tiene ficha de cliente). Asignárselo desde la ficha es el primer paso para
    // poder trabajarlos, así que tiene que poder escribirse por aquí.
    'cliente_id'
];

router.put('/:id', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        const patch = {};
        for (const k of CAMPOS_EDITABLES) {
            if (Object.prototype.hasOwnProperty.call(req.body, k)) patch[k] = req.body[k];
        }
        // El alcance solo se amplía por su ruta, que además reorganiza la carpeta.
        delete patch.alcance;

        const guardado = await svc.guardar(row.id, patch, { seguimientoPrev: row.seguimiento });

        // Disparo de la entrega: una fase acaba de pasar a REGISTRADO. Es una de
        // las dos mitades de la condición; si la otra (cobrado) ya estaba, el
        // certificado sale solo. `intentarEntregaAsync` comprueba el resto y no
        // puede hacer fallar este guardado.
        for (const [k, fase] of [['cee_inicial', 'inicial'], ['cee_final', 'final']]) {
            if (guardado.seguimiento?.[k] === 'REGISTRADO' && row.seguimiento?.[k] !== 'REGISTRADO') {
                entrega.intentarEntregaAsync(row.id, fase, `${k} → REGISTRADO`);
            }
        }

        // Si cambió el nombre, la carpeta de Drive sigue al expediente. Best-effort
        // y fuera de la respuesta: el guardado no puede depender de Google.
        if (patch.nombre && patch.nombre !== row.nombre && row.drive_folder_id) {
            setImmediate(() => folders.renombrarCarpeta(row.drive_folder_id, row.numero_expediente, patch.nombre));
        }

        res.json(guardado);
    } catch (err) {
        console.error('[cee-directos PUT]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/alcance ── Ampliar a doble o corregir a único ────────────────
// Reducir a ÚNICO solo si la fase final está virgen: hace falta poder corregir
// un alcance mal deducido (los 55 importados lo sacaron de cómo estaba la
// carpeta), pero nunca esconder un certificado ya emitido. El 422 lleva el
// motivo concreto — qué subestado o qué ficheros lo impiden.
router.post('/:id/alcance', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        const destino = String(req.body?.alcance || 'DOBLE').toUpperCase() === 'UNICO' ? 'UNICO' : 'DOBLE';
        if (destino === row.alcance) return res.json(row);

        let out;
        try {
            out = await svc.cambiarAlcance(row.id, destino);
        } catch (e) {
            return res.status(422).json({ error: e.message });
        }

        await svc.anotarHistorial(row.id, {
            tipo: 'ALCANCE',
            texto: destino === 'DOBLE' ? 'EL ENCARGO PASA A CEE INICIAL + FINAL' : 'EL ENCARGO PASA A UN SOLO CEE',
            usuario: req.user?.email || null
        });
        res.json(out);
    } catch (err) {
        console.error('[cee-directos alcance]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Compat con el botón "+ Añadir CEE final" de la primera versión.
router.post('/:id/ampliar-doble', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        const out = await svc.cambiarAlcance(row.id, 'DOBLE');
        await svc.anotarHistorial(row.id, {
            tipo: 'ALCANCE',
            texto: 'EL ENCARGO PASA A CEE INICIAL + FINAL',
            usuario: req.user?.email || null
        });
        res.json(out);
    } catch (err) {
        console.error('[cee-directos ampliar]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── PATCH /:id/cobrado ─────────────────────────────────────────────────────
// Solo ADMIN: es lo que abre la descarga al cliente y toca dinero.
router.patch('/:id/cobrado', adminOnly, async (req, res) => {
    try {
        const cobrado = req.body?.cobrado === true;
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        const { data, error } = await supabase.from(svc.TABLA).update({
            cobrado,
            cobrado_at: cobrado ? new Date().toISOString() : null,
            cobrado_por: cobrado ? (req.user?.id_usuario || null) : null,
            updated_at: new Date().toISOString()
        }).eq('id', row.id).select('id, cobrado, cobrado_at').single();
        if (error) throw new Error(error.message);

        await svc.anotarHistorial(row.id, {
            tipo: 'COBRO',
            texto: cobrado ? 'MARCADO COMO COBRADO — SE PUEDE ENTREGAR AL CLIENTE' : 'SE RETIRA LA MARCA DE COBRADO',
            usuario: req.user?.email || null
        });

        // La otra mitad de la condición. Se prueba con TODAS las fases ya
        // registradas: en un encargo doble puede tocar entregar las dos de golpe
        // si el pago llega al final.
        if (cobrado) {
            for (const [k, fase] of [['cee_inicial', 'inicial'], ['cee_final', 'final']]) {
                if (row.seguimiento?.[k] === 'REGISTRADO') {
                    entrega.intentarEntregaAsync(row.id, fase, 'marcado cobrado');
                }
            }
        }

        res.json(data);
    } catch (err) {
        console.error('[cee-directos cobrado]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────
// Solo ADMIN, y NO borra la carpeta de Drive: los ficheros son el trabajo hecho
// y un borrado en la app no puede llevárselos por delante.
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { error } = await supabase.from(svc.TABLA).delete().eq('id', row.id);
        if (error) throw new Error(error.message);
        res.json({ ok: true, carpetaConservada: row.drive_folder_link || null });
    } catch (err) {
        console.error('[cee-directos delete]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
// CERTIFICADOR
// ════════════════════════════════════════════════════════════════════════════

// Ficha del cliente + lo que falta, para avisar ANTES de mandar un encargo
// incompleto (el técnico no puede visitar sin dirección ni llamar sin teléfono).
router.get('/:id/cert-cliente-data', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        const { data, missing } = fichaCliente(row);
        res.json({ data, missing, clienteId: row.cliente_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Enlaces que acompañan al visto bueno: la carpeta de descarga y el enlace de
// subida del CEE registrado.
router.get('/:id/approve-cee-links', staffOnly, async (req, res) => {
    try {
        const phase = req.query.phase === 'final' ? 'final' : 'inicial';
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        let presentFolderLink = null;
        try { presentFolderLink = await uploads.findSectionFolderLink(row, phase); }
        catch (e) { console.warn('[cee-directos approve-links]', e.message); }

        const token = uploads.uploadSignature(row.id, phase);
        const ceeUploadLink = `${APP_BASE}/subir-cee-directo/${row.id}?token=${token}&phase=${phase}`;
        res.json({ presentFolderLink, ceeUploadLink });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Envía por los canales pedidos y devuelve por dónde salió.
 * Centralizado para que las tres rutas que escriben al certificador (encargo,
 * visto bueno, recordatorio) no diverjan en el manejo de errores: un fallo de
 * WhatsApp NO puede tumbar un email que ya se mandó.
 */
async function enviar({ canales, email, telefono, asunto, cuerpo, html, attachments }) {
    const enviados = [];
    const errores = [];
    if (canales.includes('email') && email) {
        try {
            await emailService.sendMail({
                to: email, subject: asunto,
                text: cuerpo,
                html: html || `<pre style="font-family:inherit;white-space:pre-wrap">${cuerpo}</pre>`,
                attachments
            });
            enviados.push('email');
        } catch (e) { errores.push(`email: ${e.message}`); }
    }
    if (canales.includes('whatsapp') && telefono) {
        try {
            await whatsappService.sendText(telefono, cuerpo);
            enviados.push('whatsapp');
        } catch (e) { errores.push(`whatsapp: ${e.message}`); }
    }
    return { enviados, errores };
}

// ─── POST /:id/notify-certificador ── Encargo y recordatorios ───────────────
router.post('/:id/notify-certificador', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phase = req.body?.phase === 'final' ? 'final' : 'inicial';
        const certId = req.body?.certificador_id || row.cee?.certificador_id;
        if (!certId) return res.status(400).json({ error: 'El expediente no tiene certificador asignado' });

        const { data: cert } = await supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle();
        if (!cert) return res.status(404).json({ error: 'Certificador no encontrado' });

        // ⚠️ CANALES. El módulo CEE manda `sendEmail` / `sendWhatsApp` (es el
        // contrato del popup, compartido con el CAE); `channels` es la forma que
        // usan mis propias llamadas. Se admiten las dos.
        //
        // Y lo importante: si NO viene ninguna de las dos, NO se manda nada. Antes
        // esto caía en `['email']` por defecto, así que pulsar "Solo asignar"
        // —que manda `sendEmail:false`— le enviaba el encargo al técnico igual.
        const canales = Array.isArray(req.body?.channels)
            ? req.body.channels
            : [
                req.body?.sendEmail === true ? 'email' : null,
                req.body?.sendWhatsApp === true ? 'whatsapp' : null
              ].filter(Boolean);

        const soloAsignar = canales.length === 0;

        if (canales.includes('email') && !cert.email) {
            return res.status(400).json({
                error: `El certificador "${cert.razon_social || cert.acronimo || ''}" no tiene email en su ficha. Edítalo desde Prescriptores.`
            });
        }

        const faseLabel = estados.nombreFase(row, phase);
        const key = phase === 'final' ? 'cee_final' : 'cee_inicial';

        // Compartir las carpetas se hace SIEMPRE, se avise o no: el técnico las va
        // a necesitar en cuanto se le diga algo, y dejarlo para el envío significa
        // que un "solo asignar" deja el expediente asignado y sin acceso.
        //
        // NUNCA la carpeta RAÍZ: dentro está "3. PRESUPUESTO Y FACTURAS" y en Drive
        // los permisos se HEREDAN, así que compartir la raíz es enseñarle lo que le
        // cobramos al cliente. Solo la de SU fase y la de documentación.
        const compartidas = await folders.compartirConCertificador(row, phase);

        const cee = { ...(row.cee || {}), certificador_id: certId };
        const seguimiento = { ...(row.seguimiento || {}) };

        // ── REASIGNACIÓN: lo encargado, lo estaba a OTRO ──────────────────
        //
        // Si el técnico cambia y la fase iba por "encargado / en trabajo / pendiente
        // de que lo entregue", ese avance describe la situación del ANTERIOR: al
        // nuevo no se le ha dicho nada. Dejarlo como está hace que el parte diario
        // dé por encargado un trabajo del que nadie sabe nada y que la ficha diga
        // "en certificador" señalando a quien no ha recibido el encargo. Vuelve a
        // "pendiente de encargar", que es la verdad.
        //
        // Si YA hay algo entregado (PRESENTADO en adelante) no se toca: ese
        // certificado existe, lo haya emitido quien lo haya emitido.
        // El anterior lo dice QUIEN LLAMA: para cuando llega esta petición, el
        // autoguardado del módulo ya ha escrito el técnico nuevo en el expediente,
        // así que `row.cee.certificador_id` es el NUEVO y comparar contra él nunca
        // detectaría el cambio. Se cae a la fila solo para llamadas que no lo manden.
        const certAnterior = req.body?.certificador_anterior !== undefined
            ? (req.body.certificador_anterior || null)
            : (row.cee?.certificador_id || null);
        const cambiaTecnico = !!certAnterior && String(certAnterior) !== String(certId);
        const subestadoActual = row.seguimiento?.[key];
        const sinEntregarAun = estados.rankSubestado(subestadoActual) < estados.rankSubestado('PRESENTADO');

        if (cambiaTecnico && sinEntregarAun && estados.rankSubestado(subestadoActual) > estados.rankSubestado('PTE_ENVIO_CERT')) {
            seguimiento[key] = 'PTE_ENVIO_CERT';
            // Y se suelta el sello del último contacto: era con el OTRO técnico, y
            // si no, el parte diario silenciaría el aviso al nuevo durante toda la
            // ventana de reinsistencia.
            //
            // Se pone a null en vez de borrarlo: `guardar` FUNDE el seguimiento
            // (`{...prev, ...patch}`), así que quitar la clave del parche no la
            // quita del resultado — el valor viejo sobrevivía intacto.
            seguimiento[`${key}_last_contacto_at`] = null;
        }

        if (cambiaTecnico) {
            const { data: anterior } = await supabase.from('prescriptores')
                .select('razon_social, acronimo').eq('id_empresa', certAnterior).maybeSingle();
            await svc.anotarHistorial(row.id, {
                tipo: 'CERTIFICADOR',
                texto: `REASIGNADO DE ${((anterior?.razon_social || anterior?.acronimo) || 'SIN TÉCNICO').toUpperCase()}`
                    + ` A ${(cert.razon_social || cert.acronimo || '').toUpperCase()}`,
                usuario: req.user?.email || null
            });
        }

        // ─── Solo asignar: se guarda y se sale, sin mandar nada ────────────
        if (soloAsignar) {
            // El subestado NO pasa a ASIGNADO. ASIGNADO significa "encargo
            // enviado" (ver el ciclo de vida del CEE): dejarlo ahí sin haber
            // avisado a nadie haría que el parte diario diera por encargado un
            // trabajo del que el técnico no sabe nada.
            const guardadoSinAviso = await svc.guardar(row.id, { seguimiento, cee }, { seguimientoPrev: row.seguimiento });
            await svc.anotarHistorial(row.id, {
                tipo: 'CERTIFICADOR',
                texto: `ASIGNADO ${(cert.razon_social || cert.acronimo || '').toUpperCase()} SIN AVISAR`,
                usuario: req.user?.email || null
            });
            return res.json({
                ok: true, asignadoSinAviso: true, enviados: [], errores: [],
                expediente: guardadoSinAviso, compartidas
            });
        }

        // Ficha con la que el técnico tiene que trabajar: a quién llamar y dónde
        // está el inmueble. Sale de la misma función que el aviso de "qué falta".
        const { data: ficha } = fichaCliente(row);
        const bloqueCarpetas = compartidas.map(c => `📁 ${c.nombre}:\n${c.link}`).join('\n\n');

        const cuerpo = (req.body?.customMessage || '').trim()
            || `¡Hola ${cert.razon_social || cert.acronimo || 'técnico'}! 👋\n\n`
             + `Te encargamos el ${faseLabel} del expediente ${row.numero_expediente}.\n\n`
             + `👤 ${ficha.nombre || '(cliente sin nombre)'}${ficha.dni ? ` · ${ficha.dni}` : ''}\n`
             + `${ficha.tlf ? `📞 ${ficha.tlf}\n` : ''}`
             + `${ficha.email ? `✉️ ${ficha.email}\n` : ''}`
             + `${row.direccion ? `📍 ${row.direccion}\n` : ''}`
             + `${row.ref_catastral ? `🏠 Ref. catastral: ${row.ref_catastral}\n` : ''}`
             + `${bloqueCarpetas ? `\n${bloqueCarpetas}\n` : ''}`
             + `\n¡Gracias!\nBROKERGY · Ingeniería Energética`;

        // ── ENVÍO ─────────────────────────────────────────────────────────
        // El EMAIL va con la plantilla de marca (`sendCeeDirectoEncargoEmail`), la
        // misma que el encargo del CAE: al certificador le llegan los dos y dos
        // diseños distintos le hacen dudar de cuál es el bueno. El WhatsApp va en
        // texto plano — allí no hay HTML — con el mismo contenido.
        const enviados = [];
        const errores = [];

        if (canales.includes('email')) {
            try {
                await emailService.sendCeeDirectoEncargoEmail({
                    to: cert.email,
                    certName: cert.razon_social || cert.acronimo || 'técnico',
                    expedienteNum: row.numero_expediente,
                    clienteName: nombreCliente(row.cliente),
                    clienteData: ficha,
                    faseLabel,
                    alcanceLabel: estados.esDoble(row)
                        ? 'Dos certificados: inicial y final'
                        : 'Un solo certificado',
                    carpetas: compartidas,
                    expedienteLink: enlaceApp(row.id),
                    priority: req.body?.priority === 'urgent' ? 'urgent' : 'normal',
                    adminMessage: (req.body?.adminMessage || '').trim() || null,
                    // El texto editado en el popup SUSTITUYE al saludo y a la
                    // introducción, pero conserva ficha, carpetas y botones: es lo
                    // mismo que hace el encargo del CAE.
                    customMessage: (req.body?.customMessage || '').trim() || null
                });
                enviados.push('email');
            } catch (e) { errores.push(`email: ${e.message}`); }
        }

        if (canales.includes('whatsapp')) {
            try {
                await whatsappService.sendText(telefonoDe(cert), cuerpo);
                enviados.push('whatsapp');
            } catch (e) { errores.push(`whatsapp: ${e.message}`); }
        }

        if (!enviados.length) {
            return res.status(502).json({ error: `No se pudo enviar. ${errores.join(' · ')}` });
        }

        // El encargo mueve el subestado a ASIGNADO, pero solo si aún no había
        // pasado de ahí: un recordatorio no puede devolver a "asignado" un CEE
        // que ya está entregado y en revisión.
        if (estados.rankSubestado(row.seguimiento?.[key]) < estados.rankSubestado('ASIGNADO')) {
            seguimiento[key] = 'ASIGNADO';
        }
        // Sello del último contacto: es lo que silencia el botón del parte diario
        // durante la ventana de reinsistencia.
        seguimiento[`${key}_last_contacto_at`] = new Date().toISOString();

        const guardado = await svc.guardar(row.id, { seguimiento, cee }, { seguimientoPrev: row.seguimiento });

        await svc.anotarHistorial(row.id, {
            tipo: 'CERTIFICADOR',
            texto: `ENCARGO/AVISO DE ${faseLabel.toUpperCase()} A ${(cert.razon_social || cert.acronimo || '').toUpperCase()} POR ${enviados.join(' Y ').toUpperCase()}`,
            usuario: req.user?.email || null
        });

        res.json({ ok: true, enviados, errores, expediente: guardado, compartidas });
    } catch (err) {
        console.error('[cee-directos notify-certificador]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/approve-cee ── Visto bueno para registrar ────────────────────
router.post('/:id/approve-cee', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phase = req.body?.phase === 'final' ? 'final' : 'inicial';
        const certId = row.cee?.certificador_id;
        if (!certId) return res.status(400).json({ error: 'El expediente no tiene certificador asignado' });
        const { data: cert } = await supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle();
        if (!cert) return res.status(404).json({ error: 'Certificador no encontrado' });

        const canales = Array.isArray(req.body?.channels) ? req.body.channels : ['email'];
        const faseLabel = estados.nombreFase(row, phase);

        // La carpeta se hace pública AQUÍ: es el enlace por el que el técnico se
        // descarga lo que tiene que presentar.
        const { link: carpetaLink } = await uploads.ensureSectionFolder(row, phase);
        const token = uploads.uploadSignature(row.id, phase);
        const subirLink = `${APP_BASE}/subir-cee-directo/${row.id}?token=${token}&phase=${phase}`;

        const base = (req.body?.customMessage || '').trim()
            || `¡Hola ${cert.razon_social || cert.acronimo || 'técnico'}! 👋\n\n`
             + `Hemos revisado el ${faseLabel} del expediente ${row.numero_expediente}`
             + `${nombreCliente(row.cliente) ? ` (${nombreCliente(row.cliente)})` : ''} y tiene nuestro visto bueno. `
             + `Ya puedes registrarlo.\n\n¡Gracias!\nBROKERGY · Ingeniería Energética`;

        const cuerpo = `${base}\n\n`
            + `${carpetaLink ? `📁 Descargar los archivos:\n${carpetaLink}\n\n` : ''}`
            + `⬆️ Subir el CEE registrado (etiqueta + justificante):\n${subirLink}`;

        const attachments = req.body?.attachFiles === true
            ? await uploads.getSectionAttachments(row, phase)
            : undefined;

        const { enviados, errores } = await enviar({
            canales, email: cert.email, telefono: telefonoDe(cert),
            asunto: `${row.numero_expediente} — Visto bueno ${faseLabel}`,
            cuerpo, attachments
        });

        if (!enviados.length) {
            return res.status(502).json({ error: `No se pudo enviar. ${errores.join(' · ')}` });
        }

        const key = phase === 'final' ? 'cee_final' : 'cee_inicial';
        const seguimiento = { ...(row.seguimiento || {}), [key]: 'REVISADO' };
        seguimiento[`${key}_last_contacto_at`] = new Date().toISOString();
        const guardado = await svc.guardar(row.id, { seguimiento }, { seguimientoPrev: row.seguimiento });

        await svc.anotarHistorial(row.id, {
            tipo: 'CERTIFICADOR',
            texto: `VISTO BUENO DEL ${faseLabel.toUpperCase()} ENVIADO POR ${enviados.join(' Y ').toUpperCase()}`,
            usuario: req.user?.email || null
        });

        res.json({ ok: true, enviados, errores, expediente: guardado, carpetaLink, subirLink });
    } catch (err) {
        console.error('[cee-directos approve-cee]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/notify-review ── El técnico avisa de que ya lo ha entregado ──
// La llama el CERTIFICADOR desde su propia sesión, así que es internalOnly.
router.post('/:id/notify-review', internalOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!puedeVer(req, row)) return res.status(403).json({ error: 'Acceso denegado' });

        const phase = req.body?.phase === 'final' ? 'final' : 'inicial';
        const key = phase === 'final' ? 'cee_final' : 'cee_inicial';
        const faseLabel = estados.nombreFase(row, phase);

        const seguimiento = { ...(row.seguimiento || {}), [key]: 'PTE_REVISION' };
        const guardado = await svc.guardar(row.id, { seguimiento }, { seguimientoPrev: row.seguimiento });

        const quien = req.user?.razon_social || req.user?.acronimo || req.user?.email || 'El técnico';
        const cuerpo = `📋 ${quien} ha entregado el ${faseLabel} del expediente ${row.numero_expediente}`
            + `${nombreCliente(row.cliente) ? ` (${nombreCliente(row.cliente)})` : ''}.\n\n`
            + `${(req.body?.techMessage || '').trim()}\n\n${enlaceApp(row.id)}`;

        // Aviso al equipo por los dos canales de siempre. Best-effort: que no
        // salga el WhatsApp no puede impedir que el subestado quede sellado.
        const adminChat = process.env.WHATSAPP_ADMIN_CHAT;
        const adminEmail = process.env.ADMIN_EMAIL;
        await enviar({
            canales: ['email', 'whatsapp'],
            email: adminEmail, telefono: adminChat,
            asunto: `${row.numero_expediente} — ${faseLabel} pendiente de revisar`,
            cuerpo
        });

        await svc.anotarHistorial(row.id, {
            tipo: 'CERTIFICADOR',
            texto: `${faseLabel.toUpperCase()} ENTREGADO POR EL TÉCNICO — PENDIENTE DE REVISIÓN`,
            usuario: req.user?.email || null
        });

        res.json({ ok: true, expediente: guardado });
    } catch (err) {
        console.error('[cee-directos notify-review]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/notify-registration ── CEE registrado ────────────────────────
router.post('/:id/notify-registration', internalOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!puedeVer(req, row)) return res.status(403).json({ error: 'Acceso denegado' });

        const phase = req.body?.phase === 'final' ? 'final' : 'inicial';
        const key = phase === 'final' ? 'cee_final' : 'cee_inicial';
        const faseLabel = estados.nombreFase(row, phase);

        const seguimiento = { ...(row.seguimiento || {}), [key]: 'REGISTRADO' };
        const patch = { seguimiento };
        if (req.body?.fecha_registro) {
            const doc = { ...(row.documentacion || {}) };
            doc[`fecha_registro_${key}`] = req.body.fecha_registro;
            patch.documentacion = doc;
        }
        const guardado = await svc.guardar(row.id, patch, { seguimientoPrev: row.seguimiento });

        await svc.anotarHistorial(row.id, {
            tipo: 'CEE',
            texto: `${faseLabel.toUpperCase()} REGISTRADO`,
            usuario: req.user?.email || null
        });

        // Al equipo, con el enlace del cliente a mano: registrado el certificado,
        // lo siguiente es cobrarlo y entregarlo.
        await enviar({
            canales: ['email', 'whatsapp'],
            email: process.env.ADMIN_EMAIL,
            telefono: process.env.WHATSAPP_ADMIN_CHAT,
            asunto: `${row.numero_expediente} — ${faseLabel} REGISTRADO`,
            cuerpo: `✅ ${faseLabel} REGISTRADO — ${row.numero_expediente}`
                + `${nombreCliente(row.cliente) ? ` (${nombreCliente(row.cliente)})` : ''}\n\n${enlaceApp(row.id)}`
        });

        res.json({ ok: true, expediente: guardado });
    } catch (err) {
        console.error('[cee-directos notify-registration]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENTOS
// ════════════════════════════════════════════════════════════════════════════

// ─── POST /:id/documents/upload ─────────────────────────────────────────────
router.post('/:id/documents/upload', internalOnly, async (req, res) => {
    try {
        const { base64, fileName, mimeType, subfolders = [] } = req.body || {};
        if (!base64 || !String(base64).trim() || !fileName) {
            return res.status(400).json({ error: 'base64 y fileName son obligatorios' });
        }
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!puedeVer(req, row)) return res.status(403).json({ error: 'Acceso denegado' });
        if (!row.drive_folder_id) {
            return res.status(400).json({ error: 'El expediente todavía no tiene carpeta de Drive' });
        }

        let currentFolderId = row.drive_folder_id;
        for (const sub of subfolders) {
            currentFolderId = await driveService.getOrCreateSubfolder(currentFolderId, sub);
        }

        // Versionado: lo que ya había con ese nombre se ARCHIVA en OLD, no se
        // pierde. Es el mismo criterio que en el CAE — un certificado sustituido
        // sigue siendo la prueba de lo que se entregó ese día.
        const existingId = await driveService.findFileByName(currentFolderId, fileName);
        if (existingId) await driveService.archiveExistingToOld(currentFolderId, existingId, fileName);

        let saved;
        try {
            saved = await driveService.saveFileToFolder(
                currentFolderId, fileName, mimeType || 'application/octet-stream',
                Buffer.from(base64, 'base64'), { throwOnError: true }
            );
        } catch (e) {
            return res.status(502).json({ error: `Error al subir el archivo a Drive: ${e.message}` });
        }
        if (!saved) return res.status(500).json({ error: 'Error al subir el archivo a Drive' });

        // Los ficheros se marcan "cualquiera con el enlace" para que la
        // previsualización del navegador funcione sin estar logueado en la cuenta
        // de Brokergy. En presupuestos y facturas NO: ahí hay importes.
        if (folders.puedeHacersePublico(subfolders)) {
            try { await driveService.setFolderPublic(saved.id, 'reader'); } catch { /* noop */ }
        }
        res.json({ drive_link: saved.link, drive_id: saved.id });
    } catch (err) {
        console.error('[cee-directos upload]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /:id/documents/scan-cee ────────────────────────────────────────────
// Reconciliación con Drive: si un fichero está en la carpeta, tiene que verse
// (regla 20). El .xml y el .cex se informan APARTE y no encienden su casilla:
// encenderla dice "hecho", y con esos dos no basta con que el fichero exista —
// pasar por la casilla es lo que parsea las demandas y mueve el subestado.
router.get('/:id/documents/scan-cee', internalOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!puedeVer(req, row)) return res.status(403).json({ error: 'Acceso denegado' });
        if (!row.drive_folder_id) return res.json({ inicial: {}, final: {} });

        const seccion = async (phase) => {
            const out = { xml: null, pdf: null, cex: null, registro: null, etiqueta: null, otros: [], sinVincular: {} };
            const encontrados = await uploads.scanSection(row, phase);
            for (const [slot, f] of Object.entries(encontrados)) {
                if (slot === 'xml' || slot === 'cex') out.sinVincular[slot] = f.link;
                else if (!out[slot]) out[slot] = f.link;
            }
            return out;
        };

        // Las dos fases en paralelo: son dos cadenas independientes contra Drive
        // y en serie duplicaban la espera del usuario delante de una tabla vacía.
        const [inicial, final] = await Promise.all([
            seccion('inicial'),
            estados.esDoble(row) ? seccion('final') : Promise.resolve({ xml: null, pdf: null, cex: null, registro: null, etiqueta: null, otros: [], sinVincular: {} })
        ]);

        res.json({ inicial, final });
    } catch (err) {
        console.error('[cee-directos scan-cee]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /:id/documents/file ─────────────────────────────────────────────
router.delete('/:id/documents/file', staffOnly, async (req, res) => {
    try {
        const driveId = req.query.driveId || req.body?.driveId;
        if (!driveId) return res.status(400).json({ error: 'Falta driveId' });
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        await driveService.deleteFile(driveId);
        res.json({ ok: true });
    } catch (err) {
        console.error('[cee-directos delete file]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/documents/make-public ────────────────────────────────────────
router.post('/:id/documents/make-public', internalOnly, async (req, res) => {
    try {
        const { driveId } = req.body || {};
        if (!driveId) return res.status(400).json({ error: 'Falta driveId' });
        await driveService.setFolderPublic(driveId, 'reader');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/documentos/validar-cee ───────────────────────────────────────
// Marca un fichero del CEE como revisado. El sello va por la RPC de MERGE, no
// por un read-modify-write de `documentacion`: validar dos casillas seguidas es
// justo el caso en el que el segundo guardado se lleva por delante al primero.
router.post('/:id/documentos/validar-cee', staffOnly, async (req, res) => {
    try {
        const field = String(req.body?.field || '').trim();
        if (!field) return res.status(400).json({ error: 'Falta el campo a validar' });
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        await svc.mergeDoc(row.id, 'docs_validados', { [field]: new Date().toISOString() });
        res.json({ ok: true, field });
    } catch (err) {
        console.error('[cee-directos validar-cee]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/documents/repair-cee-links ───────────────────────────────────
// Reconstruye los enlaces del CEE releyendo la carpeta. Drive es la fuente de
// verdad (regla 20): si un enlace guardado da 404 pero el fichero sigue ahí, el
// que está mal es el enlace.
router.post('/:id/documents/repair-cee-links', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!row.drive_folder_id) return res.json({ repaired: {} });

        const fases = estados.esDoble(row) ? ['inicial', 'final'] : ['inicial'];
        const encontrados = await Promise.all(fases.map(f => uploads.scanSection(row, f)));

        const repaired = {};
        const ceeFiles = { ...(row.cee?.cee_files || {}) };
        fases.forEach((fase, i) => {
            const slots = encontrados[i];
            repaired[fase] = Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v.link]));
            ceeFiles[fase] = { ...(ceeFiles[fase] || {}), ...repaired[fase] };
        });

        await svc.guardar(row.id, { cee: { ...(row.cee || {}), cee_files: ceeFiles } },
            { seguimientoPrev: row.seguimiento });
        res.json({ repaired });
    } catch (err) {
        console.error('[cee-directos repair-links]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/resend-cee-notifications ─────────────────────────────────────
// Entrega del certificado al cliente.
//
// ⚠️ EL CANDADO DE COBRO SE COMPRUEBA AQUÍ, no solo en la pantalla del cliente.
// Este es el otro camino por el que el certificado puede salir de la app, y un
// candado que solo vive en el portal no es un candado: basta con pulsar "enviar"
// desde el panel para saltárselo sin querer.
router.post('/:id/resend-cee-notifications', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        const phase = req.body?.phase === 'final' ? 'final' : 'inicial';
        const faseLabel = estados.nombreFase(row, phase);
        const preview = req.body?.preview === true;

        const key = phase === 'final' ? 'cee_final' : 'cee_inicial';
        if (!preview && row.seguimiento?.[key] !== 'REGISTRADO') {
            return res.status(400).json({ error: `El ${faseLabel} todavía no está registrado.` });
        }

        // El enlace al portal del cliente (`/mi-cee/:id`) NO se manda todavía: esa
        // página aún no existe, y un mensaje de entrega con un enlace muerto es
        // peor que no mandarlo — el cliente lo pulsa, no funciona, y llama. Hasta
        // que exista, el certificado va ADJUNTO, que además es lo que la mayoría
        // quiere: guardarse el PDF.

        // Texto editado en la preview. Viaja en `overrides.CLIENTE`, igual que en el
        // CAE, para que lo que se revisa en pantalla sea exactamente lo que sale.
        const cuerpo = String(req.body?.overrides?.CLIENTE || req.body?.customMessage || '').trim()
            || `¡Hola${nombreCliente(row.cliente) ? ` ${nombreCliente(row.cliente)}` : ''}! 👋\n\n`
             + `Ya tienes listo tu ${faseLabel} (expediente ${row.numero_expediente}).\n\n`
             + `Te lo adjuntamos en este mensaje.\n\n`
             + `¡Gracias por confiar en nosotros!\nBROKERGY · Ingeniería Energética`;

        if (preview) {
            return res.json({
                ok: true,
                preview: { CLIENTE: cuerpo },
                cobrado: row.cobrado,
                destinatario: { email: row.cliente?.email || null, tlf: row.cliente?.tlf || null }
            });
        }

        if (!row.cobrado) {
            return res.status(409).json({
                error: 'Este expediente todavía no está marcado como cobrado. El certificado no se entrega hasta entonces.',
                motivo: 'NO_COBRADO'
            });
        }

        const canales = Array.isArray(req.body?.channels) ? req.body.channels : ['email'];
        // Los ficheros del CEE van adjuntos al email. Por WhatsApp va solo el
        // texto: el envío de media es otra ruta y un .cex no se abre en un móvil.
        const attachments = canales.includes('email')
            ? await uploads.getSectionAttachments(row, phase)
            : undefined;
        const { enviados, errores } = await enviar({
            canales,
            email: row.cliente?.email,
            telefono: row.cliente?.tlf || row.cliente?.telefono,
            asunto: `${row.numero_expediente} — Tu certificado de eficiencia energética`,
            cuerpo, attachments
        });
        if (!enviados.length) return res.status(502).json({ error: `No se pudo enviar. ${errores.join(' · ')}` });

        await svc.anotarHistorial(row.id, {
            tipo: 'CLIENTE',
            texto: `${faseLabel.toUpperCase()} ENTREGADO AL CLIENTE POR ${enviados.join(' Y ').toUpperCase()}`,
            usuario: req.user?.email || null
        });

        res.json({ ok: true, enviados, errores });
    } catch (err) {
        console.error('[cee-directos resend]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/incidencias ──────────────────────────────────────────────────
// Existe porque el módulo CEE levanta una incidencia sola cuando la demanda del
// CEE final no cuadra con la del inicial. Sin esta ruta, ese aviso se perdía en
// un `console.warn` y solo se enteraba quien estuviera delante en ese momento.
router.post('/:id/incidencias', staffOnly, async (req, res) => {
    try {
        const texto = String(req.body?.texto || '').trim();
        if (!texto) return res.status(400).json({ error: 'Falta el texto de la incidencia' });
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        const doc = row.documentacion || {};
        const incidencias = Array.isArray(doc.incidencias) ? [...doc.incidencias] : [];
        incidencias.push({
            id: `${Date.now()}`,
            texto,
            severidad: req.body?.severidad === 'GRAVE' ? 'GRAVE' : 'LEVE',
            procedencia: req.body?.procedencia || 'MANUAL',
            estado: 'ABIERTA',
            fecha: new Date().toISOString(),
            usuario: req.user?.email || null
        });
        const { error } = await supabase.from(svc.TABLA)
            .update({ documentacion: { ...doc, incidencias }, updated_at: new Date().toISOString() })
            .eq('id', row.id);
        if (error) throw new Error(error.message);
        res.status(201).json({ ok: true, incidencias });
    } catch (err) {
        console.error('[cee-directos incidencias]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/carpeta/preparar ── Dejar la carpeta lista ───────────────────
// Crea lo que falte: la carpeta del expediente si no la hay, y las subcarpetas
// que le tocan según el alcance. Es explícito y no automático al abrir la ficha
// porque los 55 importados vienen del Drive de siempre con estructuras
// irregulares, y crear carpetas en las 55 solo por mirarlas llenaría el Drive de
// carpetas vacías que nadie ha pedido.
router.post('/:id/carpeta/preparar', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });

        let folderId = row.drive_folder_id;
        let link = row.drive_folder_link;

        if (!folderId) {
            const creada = await folders.crearCarpeta(row.numero_expediente, row.nombre, row.alcance);
            if (!creada?.id) return res.status(502).json({ error: 'No se pudo crear la carpeta en Drive' });
            folderId = creada.id;
            link = creada.link;
            await supabase.from(svc.TABLA)
                .update({ drive_folder_id: folderId, drive_folder_link: link, updated_at: new Date().toISOString() })
                .eq('id', row.id);
        }

        const subcarpetas = await folders.asegurarSubcarpetas(folderId, row.alcance);
        res.json({ ok: true, drive_folder_id: folderId, drive_folder_link: link, subcarpetas: Object.keys(subcarpetas) });
    } catch (err) {
        console.error('[cee-directos preparar carpeta]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /:id/entrega ── ¿Se le puede entregar ya? ──────────────────────────
// Misma función que usa el automático (`ceeDirectoEntrega.estado`), para que la
// pantalla no pueda decir que está listo mientras el backend dice que no.
router.get('/:id/entrega', staffOnly, async (req, res) => {
    try {
        const phase = req.query.phase === 'final' ? 'final' : 'inicial';
        const row = await svc.cargar(req.params.id);
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        const st = await entrega.estado(row, phase);
        res.json({
            ...st,
            phase,
            mensaje: entrega.mensaje(row, phase),
            // Que el automático esté apagado es un dato de la pantalla: si no, en
            // local uno marca cobrado, no pasa nada y piensa que está roto.
            autoActivado: entrega.autoActivado()
        });
    } catch (err) {
        console.error('[cee-directos entrega GET]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /:id/entrega ── Entregar ahora (manual) ───────────────────────────
// Salta el interruptor del automático (aquí hay una persona decidiendo), pero
// NO las condiciones: sin cobro, sin registro o sin los dos PDF no sale nada.
router.post('/:id/entrega', staffOnly, async (req, res) => {
    try {
        const phase = req.body?.phase === 'final' ? 'final' : 'inicial';
        const r = await entrega.entregar(req.params.id, phase, {
            manual: true,
            reenviar: req.body?.reenviar === true,
            mensaje: req.body?.mensaje,
            usuario: req.user?.email || null
        });
        if (!r.enviado) {
            const codigo = r.motivo === 'NO_EXISTE' ? 404 : r.motivo === 'YA_ENTREGADO' ? 409 : 422;
            return res.status(codigo).json(r);
        }
        res.json(r);
    } catch (err) {
        console.error('[cee-directos entrega POST]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /:id/local-path ────────────────────────────────────────────────────
// Ruta LOCAL de Windows (espejo de Drive Desktop) para el botón "Carpeta Local".
router.get('/:id/local-path', staffOnly, async (req, res) => {
    try {
        const row = await svc.cargar(req.params.id, { conRelaciones: false });
        if (!row) return res.status(404).json({ error: 'Expediente no encontrado' });
        if (!row.drive_folder_id) return res.status(404).json({ error: 'El expediente no tiene carpeta de Drive' });

        const rawSegments = await driveService.getFolderPathSegments(row.drive_folder_id);
        if (!rawSegments.length) return res.status(502).json({ error: 'No se pudo resolver la ruta en Drive' });
        const segments = rawSegments.map(driveService.sanitizeWindowsSegment);
        const base = (process.env.LOCAL_DRIVE_BASE || 'C:\\Users\\Usuario\\Mi unidad').replace(/[\\/]+$/, '');
        res.json({ path: [base, ...segments].join('\\'), folderName: segments[segments.length - 1], segments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
