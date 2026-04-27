const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { enforceAuth } = require('../middleware/auth');

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
            query = query.or(`modelo_comercial.ilike.%${q}%,modelo_conjunto.ilike.%${q}%`);
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

    return {
        marca:                 str(body.marca)?.toUpperCase() || null,
        modelo_comercial:      str(body.modelo_comercial),
        tipo:                  str(body.tipo)?.toUpperCase() || null,
        potencia_calefaccion:  num(body.potencia_calefaccion),
        modelo_conjunto:       str(body.modelo_conjunto),
        modelo_ud_exterior:    str(body.modelo_ud_exterior),
        modelo_ud_interior:    str(body.modelo_ud_interior),
        deposito_acs_incluido: bool(body.deposito_acs_incluido),
        scop_cal_calido_35:    num(body.scop_cal_calido_35),
        scop_cal_calido_55:    num(body.scop_cal_calido_55),
        scop_cal_medio_35:     num(body.scop_cal_medio_35),
        scop_cal_medio_55:     num(body.scop_cal_medio_55),
        scop_dhw_calido:       num(body.scop_dhw_calido),
        scop_dhw_medio:        num(body.scop_dhw_medio),
        seer:                  num(body.seer),
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
