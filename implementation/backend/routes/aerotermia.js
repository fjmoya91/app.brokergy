const express = require('express');
const multer = require('multer');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { enforceAuth, staffOnly } = require('../middleware/auth');
const { anexarEprelAFicha } = require('../services/fichaEprelMerge');

// Solo ADMIN puede acceder a este módulo
function requireAdmin(req, res, next) {
    if (req.user?.rol_nombre !== 'ADMIN') {
        return res.status(403).json({ error: 'Acceso restringido al administrador' });
    }
    next();
}

// GET /api/aerotermia — Listar equipos (filtros opcionales: marca, q)
router.get('/', enforceAuth, async (req, res) => {
    try {
        const { marca, q } = req.query;
        let query = supabase
            .from('aerotermia')
            .select(`
                *,
                marcas:aerotermia_marcas!left(logo)
            `)
            .order('marca', { ascending: true })
            .order('modelo_comercial', { ascending: true })
            .order('potencia_calefaccion', { ascending: true });

        if (marca) {
            query = query.ilike('marca', marca);
        }
        if (q) {
            query = query.or(`marca.ilike.%${q}%,modelo_comercial.ilike.%${q}%,modelo_conjunto.ilike.%${q}%`);
        }

        // Filtro por marcas autorizadas si no es ADMIN
        if (req.user?.rol_nombre !== 'ADMIN' && req.user?.marcas_autorizadas) {
            const list = req.user.marcas_autorizadas.split(',').map(m => m.trim().toUpperCase());
            if (list.length > 0) {
                query = query.in('marca', list);
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        // Re-mapear para que logo_marca se extraiga de la tabla marcas
        const result = data.map(item => ({
            ...item,
            logo_marca: item.marcas?.logo || null
        }));

        res.json(result);
    } catch (err) {
        console.error('Error GET aerotermia:', err);
        res.status(500).json({ error: 'Error al recuperar equipos de aerotermia' });
    }
});

// GET /api/aerotermia/marcas — Lista de marcas desde su propia tabla de gestión
router.get('/marcas', enforceAuth, async (req, res) => {
    try {
        // Intentar obtener de la tabla de marcas dedicada
        let query = supabase
            .from('aerotermia_marcas')
            .select('*')
            .order('nombre', { ascending: true });

        if (req.user?.rol_nombre !== 'ADMIN' && req.user?.marcas_autorizadas) {
            const list = req.user.marcas_autorizadas.split(',').map(m => m.trim().toUpperCase());
            if (list.length > 0) {
                query = query.in('nombre', list);
            }
        }

        const { data, error } = await query;
            
        if (error) {
            console.warn('Tabla aerotermia_marcas no disponible, usando fallback...');
            // Fallback: extraer marcas únicas de la tabla de equipos
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('aerotermia')
                .select('marca, logo_marca')
                .order('marca', { ascending: true });
                
            if (fallbackError) throw fallbackError;

            const marcasMap = {};
            fallbackData.forEach(r => {
                const m = r.marca?.trim().toUpperCase() || 'DESCONOCIDA';
                
                // Si no es ADMIN, comprobamos que la marca esté autorizada
                if (req.user?.rol_nombre !== 'ADMIN' && req.user?.marcas_autorizadas) {
                    const list = req.user.marcas_autorizadas.split(',').map(x => x.trim().toUpperCase());
                    if (!list.includes(m)) return;
                }

                if (!marcasMap[m]) {
                    marcasMap[m] = { nombre: m, logo: r.logo_marca };
                } else if (!marcasMap[m].logo && r.logo_marca) {
                    marcasMap[m].logo = r.logo_marca;
                }
            });
            return res.json(Object.values(marcasMap).sort((a, b) => a.nombre.localeCompare(b.nombre)));
        }

        res.json(data);
    } catch (err) {
        console.error('Error GET aerotermia/marcas:', err);
        res.status(500).json({ error: 'Error al recuperar marcas' });
    }
});

// POST /api/aerotermia/marcas — Crear o actualizar marca
router.post('/marcas', enforceAuth, requireAdmin, async (req, res) => {
    try {
        const { nombre, logo, descripcion } = req.body;
        if (!nombre) return res.status(400).json({ error: 'El nombre de la marca es obligatorio' });

        const payload = { 
            nombre: nombre.trim().toUpperCase(), 
            logo: logo || null, 
            descripcion: descripcion || null 
        };

        const { data, error } = await supabase
            .from('aerotermia_marcas')
            .upsert(payload, { onConflict: 'nombre' })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        console.error('Error POST marcas:', err);
        res.status(500).json({ error: 'Error al guardar la marca' });
    }
});

// DELETE /api/aerotermia/marcas/:nombre — Eliminar marca
router.delete('/marcas/:nombre', enforceAuth, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase
            .from('aerotermia_marcas')
            .delete()
            .eq('nombre', req.params.nombre.toUpperCase());
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error DELETE marcas:', err);
        res.status(500).json({ error: 'Error al eliminar la marca' });
    }
});

// POST /api/aerotermia/leer-placa — QUÉ EQUIPO es el de esta foto.
//
// El hermano de `POST /api/expedientes/:id/placas/ocr` para cuando TODAVÍA NO HAY
// EXPEDIENTE: en la calculadora el equipo se elige al simular, meses antes de que
// exista ninguna carpeta de Drive, y hasta ahora había que reconocerlo a ojo entre
// los 490 del catálogo. Con la foto de la placa delante eso es absurdo: la app ya
// sabe casar un código con el catálogo (`casarConCatalogo`), solo le faltaba una
// puerta por la que entrar sin expediente.
//
// Las fotos llegan como FICHEROS de un formulario, no de Drive, y NO SE GUARDAN en
// ningún sitio: se leen y se tiran. Lo único que se devuelve es qué pone la placa y
// con qué fila del catálogo casa.
//
// REGLA — aquí no se escribe nada. La ruta ni siquiera toca la oportunidad: quien
// aplica es la calculadora, seleccionando ese modelo en su desplegable, o sea por
// el MISMO camino que elegirlo a mano. Así un equipo que entra por la placa y otro
// elegido a dedo no pueden acabar con SCOP distintos.
//
// `staffOnly`: detrás hay una llamada de pago a un LLM. Mismo criterio que el
// lector de la referencia catastral y que el de placas del expediente.
const placaUpload = multer({
    storage: multer.memoryStorage(),
    // Una placa por foto y tres perspectivas como mucho de cada unidad: es el tope
    // que ya aplica el expediente (`MAX_PLACAS`), porque con tres se ha visto todo
    // lo que hay en una etiqueta y cada imagen se paga.
    limits: { fileSize: 15 * 1024 * 1024, files: 6 },
});
router.post('/leer-placa', staffOnly, (req, res, next) => {
    placaUpload.fields([{ name: 'exterior', maxCount: 3 }, { name: 'interior', maxCount: 3 }])(req, res, (err) => {
        if (err) {
            console.error('[aerotermia/leer-placa] multer:', err.message);
            return res.status(400).json({ error: `No se pudo leer la foto: ${err.message}` });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { leerPlacasDeImagenes, casarConCatalogo } = require('../services/placaEquipoOcrService');

        // El nombre llega de un formulario: en Windows puede traer la ruta entera y
        // algunos navegadores lo codifican en latin1 (mismo cuidado que los firmados
        // del S.O.). Solo se usa para decir de qué foto salió cada cosa.
        const aImg = (f) => ({
            name: Buffer.from(f.originalname || 'placa', 'latin1').toString('utf8').split(/[\\/]/).pop(),
            buffer: f.buffer,
            mimeType: (f.mimetype || '').startsWith('image/') ? f.mimetype : 'image/jpeg',
        });

        const porUnidad = {
            exterior: (req.files?.exterior || []).map(aImg),
            interior: (req.files?.interior || []).map(aImg),
        };
        if (!porUnidad.exterior.length && !porUnidad.interior.length) {
            return res.status(400).json({ error: 'Adjunta al menos una foto de la placa.' });
        }

        // ⚠️ Las fotos van como FOTOS, nunca convertidas a PDF: una placa es un
        // primer plano y lo que se busca vive en unos pocos píxeles (ver la regla
        // «la placa se lee SOLA» en placaEquipoOcrService).
        const { unidades, avisos } = await leerPlacasDeImagenes(porUnidad);
        const catalogo = await casarConCatalogo(unidades.exterior, unidades.interior);

        res.json({
            unidades,
            // Qué equipo del catálogo es, por qué se ha decidido así, y —cuando hay
            // más de uno posible— la lista para que elija una persona: con dos
            // candidatos no se elige, que sería declarar el SCOP de otra máquina.
            modelo: catalogo.modelo || null,
            por: catalogo.por || null,
            candidatos: catalogo.candidatos || [],
            avisos: [...avisos, ...(catalogo.aviso ? [catalogo.aviso] : [])],
        });
    } catch (err) {
        console.error('Error POST aerotermia/leer-placa:', err);
        res.status(500).json({ error: 'No se pudo leer la placa', details: err.message });
    }
});

// GET /api/aerotermia/:id — Detalle de un equipo
router.get('/:id', enforceAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('aerotermia')
            .select(`
                *,
                marcas:aerotermia_marcas!left(logo)
            `)
            .eq('id', req.params.id)
            .single();
        if (error || !data) return res.status(404).json({ error: 'Equipo no encontrado' });
        
        // Formateamos para incluir logo_marca desde la tabla de marcas
        const result = {
            ...data,
            logo_marca: data.marcas?.logo || null
        };
        
        res.json(result);
    } catch (err) {
        console.error('Error GET aerotermia/:id:', err);
        res.status(500).json({ error: 'Error al obtener el equipo' });
    }
});

// POST /api/aerotermia — Crear equipo
router.post('/', enforceAuth, requireAdmin, async (req, res) => {
    try {
        const payload = buildPayload(req.body);
        if (!payload.marca) {
            return res.status(400).json({ error: 'La marca es obligatoria' });
        }
        // Garantizar que la marca existe en aerotermia_marcas (FK constraint)
        await supabase.from('aerotermia_marcas').upsert({ nombre: payload.marca }, { onConflict: 'nombre', ignoreDuplicates: true });
        const { data, error } = await supabase.from('aerotermia').insert([payload]).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (err) {
        console.error('Error POST aerotermia:', err);
        res.status(500).json({ error: 'Error al crear el equipo', details: err.message });
    }
});

// PUT /api/aerotermia/:id — Actualizar equipo
router.put('/:id', enforceAuth, requireAdmin, async (req, res) => {
    try {
        const { data: existing, error: fetchErr } = await supabase
            .from('aerotermia')
            .select('id')
            .eq('id', req.params.id)
            .single();
        if (fetchErr || !existing) return res.status(404).json({ error: 'Equipo no encontrado' });

        const payload = buildPayload(req.body);
        if (payload.marca) {
            await supabase.from('aerotermia_marcas').upsert({ nombre: payload.marca }, { onConflict: 'nombre', ignoreDuplicates: true });
        }
        const { data, error } = await supabase
            .from('aerotermia')
            .update(payload)
            .eq('id', req.params.id)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error PUT aerotermia:', err);
        res.status(500).json({ error: 'Error al actualizar el equipo', details: err.message });
    }
});

// PATCH /api/aerotermia/:id/datos-rite — completar SOLO los datos del modelo que
// piden la Memoria RITE y el CEE final: potencia térmica (`potencia_calefaccion`),
// frigorífica, absorbida por los compresores, gas refrigerante y SEER.
//
// Lo usan los popups que saltan al generar la Memoria RITE o al mandarle al
// certificador las instrucciones del CEE final (el SEER solo hace falta cuando el
// emisor da frío y el equipo se declara con refrigeración en CE3X): se teclean una
// vez, con la ficha técnica a mano, y quedan en el catálogo para todos los
// expedientes futuros que usen ese equipo.
//
// NO se reutiliza el PUT /:id porque ese pasa por `buildPayload`, que reconstruye
// la fila ENTERA: enviarle solo estos campos pondría a null todo lo demás (SCOPs,
// modelo, ficha técnica…). Aquí se actualiza solo lo recibido.
//
// `staffOnly` en vez de `requireAdmin`: es un dato técnico del catálogo y quien
// genera el RITE puede ser un TRABAJADOR; no hay dinero ni borrado de por medio.
//: Por encima de esto no es un SEER, es el mismo número escrito en % (el
//: rendimiento que pide CE3X). Los SEER del catálogo van de ~3 a ~9.
const SEER_MAX = 15;

router.patch('/:id/datos-rite', staffOnly, async (req, res) => {
    try {
        const updates = {};
        for (const campo of ['potencia_calefaccion', 'potencia_frigorifica', 'potencia_compresores', 'seer']) {
            // El SEER llega tecleado a mano y en España se escribe con coma.
            const v = parseFloat(String(req.body?.[campo] ?? '').replace(',', '.'));
            // Un SEER es un cociente (4,16), no un %. Tecleado como el rendimiento
            // de CE3X (416) entró así en el modelo de 26RES060_198 y el .cex salía
            // con 41.600 % de refrigeración. Se para aquí, que es donde se escribe.
            if (campo === 'seer' && v > SEER_MAX) {
                return res.status(400).json({ error: `Un SEER va entre 2 y ${SEER_MAX} (p. ej. 4,16). `
                    + `Has puesto ${v}: ¿lo has escrito en % como en CE3X?` });
            }
            if (v > 0) updates[campo] = v;
        }
        const refri = String(req.body?.refrigerante || '').trim().toUpperCase();
        if (refri) updates.refrigerante = refri;
        if (!Object.keys(updates).length) {
            return res.status(400).json({ error: 'Indica al menos un dato (potencias en kW o SEER mayores que 0, o el refrigerante)' });
        }
        const { data, error } = await supabase
            .from('aerotermia')
            .update(updates)
            .eq('id', req.params.id)
            .select('id, marca, modelo_comercial, potencia_calefaccion, potencia_frigorifica, potencia_compresores, refrigerante, seer')
            .single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Equipo no encontrado' });
        res.json(data);
    } catch (err) {
        console.error('Error PATCH aerotermia/datos-rite:', err);
        res.status(500).json({ error: 'Error al guardar los datos del modelo', details: err.message });
    }
});

// PATCH /api/aerotermia/:id/datos-acs — completar los datos de ACS del MODELO.
//
// Salta desde el expediente cuando se elige un CONJUNTO (equipo con el acumulador
// dentro) del que el catálogo no puede justificar el SCOP_dhw: ni lo declara su
// ficha técnica ni tenemos su η_wh del EPREL. Antes eso obligaba a teclear el SCOP
// a mano en cada expediente con ese equipo —o, peor, a dejar que cayera al 3,0 por
// defecto de `getScopAcsFromModel`—; ahora se rellena UNA vez, con el EPREL
// delante, y queda para todos los que vengan detrás.
//
// Admite además los PDF del EPREL (ficha del producto y etiqueta): se ANEXAN a la
// ficha técnica del catálogo, que es el fichero que el CIFO adjunta como anexo. Sin
// ellos el certificado declara un SCOP calculado por el Anexo IV y no lleva el
// documento que lo acredita.
//
// `staffOnly` como `datos-rite`: es un dato técnico del catálogo que teclea quien
// está rellenando el expediente, sin dinero ni borrados de por medio.
const eprelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 4 },
});
router.patch('/:id/datos-acs', staffOnly, (req, res, next) => {
    eprelUpload.array('files', 4)(req, res, (err) => {
        if (err) {
            console.error('[aerotermia/datos-acs] multer:', err.message);
            return res.status(400).json({ error: `No se pudo leer el fichero: ${err.message}` });
        }
        next();
    });
}, async (req, res) => {
    try {
        const updates = {};

        // η_wh del EPREL, en %. Se acepta con coma (se teclea a mano) y se admite
        // la fracción (1,27) subiéndola a porcentaje, igual que hace `buildPayload`
        // con el resto de rendimientos: el catálogo los guarda siempre en %.
        const raw = String(req.body?.eta_acs ?? '').replace(',', '.').trim();
        if (raw) {
            let eta = parseFloat(raw);
            if (!Number.isFinite(eta) || eta <= 0) {
                return res.status(400).json({ error: 'El η_wh tiene que ser un número mayor que 0.' });
            }
            if (eta < 10) eta *= 100;
            // Un η_wh de ACS realista va del 60 % al 200 %. Fuera de ahí es una
            // errata de tecleo, y de ese número sale el SCOP que se declara: vale
            // más rechazarlo que dejar que llegue a un certificado.
            if (eta < 60 || eta > 200) {
                return res.status(400).json({ error: `η_wh = ${eta} % está fuera de lo razonable (60-200 %). Comprueba el dato en el EPREL.` });
            }
            // Se escribe en la columna de SU zona: son datos distintos, y rellenar
            // las dos con el mismo número afirmaría un dato que nadie ha leído.
            const zona = String(req.body?.zona || 'D3').toUpperCase();
            updates[zona === 'E1' ? 'eta_acs_media' : 'eta_acs_calida'] = eta;
        }

        // COP A7/W55 — el dato del Anexo VI, para los equipos que calientan un
        // depósito APARTE (el modo "Acumulador ACS" del expediente). No está en la
        // ficha de producto del Rgto. 811/2013 sino en la tabla de datos técnicos
        // del catálogo del fabricante, así que se teclea con ella delante.
        const rawCop = String(req.body?.cop_a7_55 ?? '').replace(',', '.').trim();
        if (rawCop) {
            const cop = parseFloat(rawCop);
            if (!Number.isFinite(cop) || cop <= 0) {
                return res.status(400).json({ error: 'El COP A7/55 tiene que ser un número mayor que 0.' });
            }
            // Un COP a 55 °C realista va de 1,5 a 6. Por encima suele ser el COP a
            // 35 °C copiado por error, y ése da un SCOP_dhw que no se sostiene.
            if (cop < 1.5 || cop > 6) {
                return res.status(400).json({ error: `COP A7/55 = ${cop} está fuera de lo razonable (1,5-6). Comprueba que no sea el COP a 35 °C.` });
            }
            updates.cop_a7_55 = cop;
        }

        const eprelUrl = String(req.body?.eprel || '').trim();
        if (eprelUrl) updates.eprel = eprelUrl;

        if (!Object.keys(updates).length && !(req.files || []).length) {
            return res.status(400).json({ error: 'Indica el η_wh del EPREL, el COP A7/55, el enlace, o adjunta el PDF.' });
        }

        let data = null;
        if (Object.keys(updates).length) {
            const { data: fila, error } = await supabase
                .from('aerotermia')
                .update(updates)
                .eq('id', req.params.id)
                .select('id, marca, modelo_comercial, eta_acs_calida, eta_acs_media, scop_dhw_calido, scop_dhw_medio, cop_a7_55, deposito_acs_incluido, litros_acs, eprel, ficha_tecnica')
                .single();
            if (error) throw error;
            if (!fila) return res.status(404).json({ error: 'Equipo no encontrado' });
            data = fila;
        }

        // Los PDF del EPREL se anexan a la ficha técnica del catálogo. Un fallo aquí
        // NO tira el dato numérico, que es lo que desbloquea el cálculo: se informa
        // aparte para que se pueda reintentar sin volver a teclear el η_wh.
        let anexo = null;
        if ((req.files || []).length) {
            const piezas = req.files.map(f => ({
                nombre: Buffer.from(f.originalname || 'EPREL', 'latin1').toString('utf8').split(/[\\/]/).pop(),
                buffer: f.buffer,
            }));
            anexo = await anexarEprelAFicha(req.params.id, piezas);
        }

        if (!data) {
            const { data: fila } = await supabase
                .from('aerotermia')
                .select('id, marca, modelo_comercial, eta_acs_calida, eta_acs_media, scop_dhw_calido, scop_dhw_medio, cop_a7_55, deposito_acs_incluido, litros_acs, eprel, ficha_tecnica')
                .eq('id', req.params.id)
                .single();
            data = fila || null;
        }

        res.json({ ...(data || {}), anexo });
    } catch (err) {
        console.error('Error PATCH aerotermia/datos-acs:', err);
        res.status(500).json({ error: 'Error al guardar los datos de ACS del modelo', details: err.message });
    }
});

// DELETE /api/aerotermia/:id — Eliminar equipo
router.delete('/:id', enforceAuth, requireAdmin, async (req, res) => {
    try {
        const { error } = await supabase.from('aerotermia').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error('Error DELETE aerotermia:', err);
        res.status(500).json({ error: 'Error al eliminar el equipo' });
    }
});

// Helper: construir payload desde req.body
function buildPayload(body) {
    const num = (v) => (v !== undefined && v !== '' && v !== null ? parseFloat(v) : null);
    const str = (v) => (v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : null);
    const bool = (v) => (v === true || v === 'true' || v === 'SI' || v === 1 ? true : false);
    // Los SCOP son de la ficha técnica del fabricante, pero cuando se teclean a
    // mano llegan a veces con 3 decimales (o los arrastra un catálogo importado
    // con más precisión de la que declara la ficha). El resto de la app los
    // redondea a 2 en cuanto los calcula (`getScopAcsFromModel`, `resolveScop`);
    // aquí, que es donde se ESCRIBEN, se hace lo mismo para que lo guardado sea
    // ya lo que se va a mostrar, sin que cada lectura tenga que recordarlo.
    const scop = (v) => { const n = num(v); return n === null ? null : Math.round(n * 100) / 100; };

    return {
        marca:                 str(body.marca)?.toUpperCase() || null,
        modelo_comercial:      str(body.modelo_comercial),
        tipo:                  str(body.tipo)?.toUpperCase() || null,
        potencia_calefaccion:  num(body.potencia_calefaccion),
        refrigerante:          str(body.refrigerante)?.toUpperCase() || null,
        // Capacidad frigorífica: se declara en la casilla FRÍO del RITE cuando la
        // instalación incluye climatización (suelo radiante refrescante).
        potencia_frigorifica:  num(body.potencia_frigorifica),
        modelo_conjunto:       str(body.modelo_conjunto),
        modelo_ud_exterior:    str(body.modelo_ud_exterior),
        modelo_ud_interior:    str(body.modelo_ud_interior),
        deposito_acs_incluido: bool(body.deposito_acs_incluido),
        litros_acs:            num(body.litros_acs),
        scop_cal_calido_35:    scop(body.scop_cal_calido_35),
        scop_cal_calido_55:    scop(body.scop_cal_calido_55),
        scop_cal_medio_35:     scop(body.scop_cal_medio_35),
        scop_cal_medio_55:     scop(body.scop_cal_medio_55),
        scop_dhw_calido:       scop(body.scop_dhw_calido),
        scop_dhw_medio:        scop(body.scop_dhw_medio),
        // En % (416) es el rendimiento de CE3X, no el SEER (4,16): ver `SEER_MAX`.
        seer:                  num(body.seer) > SEER_MAX ? num(body.seer) / 100 : num(body.seer),
        eta_calida_35:         num(body.eta_calida_35) < 10 && num(body.eta_calida_35) !== null ? num(body.eta_calida_35) * 100 : num(body.eta_calida_35),
        eta_calida_55:         num(body.eta_calida_55) < 10 && num(body.eta_calida_55) !== null ? num(body.eta_calida_55) * 100 : num(body.eta_calida_55),
        eta_media_35:          num(body.eta_media_35) < 10 && num(body.eta_media_35) !== null ? num(body.eta_media_35) * 100 : num(body.eta_media_35),
        eta_media_55:          num(body.eta_media_55) < 10 && num(body.eta_media_55) !== null ? num(body.eta_media_55) * 100 : num(body.eta_media_55),
        eta_acs_calida:        num(body.eta_acs_calida) < 10 && num(body.eta_acs_calida) !== null ? num(body.eta_acs_calida) * 100 : num(body.eta_acs_calida),
        eta_acs_media:         num(body.eta_acs_media) < 10 && num(body.eta_acs_media) !== null ? num(body.eta_acs_media) * 100 : num(body.eta_acs_media),
        cop_a7_55:             num(body.cop_a7_55),
        eprel:                 str(body.eprel),
        ficha_tecnica:         str(body.ficha_tecnica),
        url_keymark:           str(body.url_keymark),
        is_validated:          bool(body.is_validated),
    };
}

module.exports = router;
