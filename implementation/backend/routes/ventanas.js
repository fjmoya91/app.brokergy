// ============================================================================
// routes/ventanas.js — el CATÁLOGO de marcos y vidrios.
// ----------------------------------------------------------------------------
// Gemelo de `routes/aerotermia.js`. Dos diferencias a propósito:
//
//  1. **Crear y editar es `staffOnly`, no adminOnly.** Aquí no hay ni un euro:
//     son datos técnicos (Uf, Ug, factor solar) que se teclean con la ficha
//     delante, y quien está rellenando el expediente es a menudo un TRABAJADOR.
//     Si dar de alta un modelo exigiera un ADMIN, el modelo no se daría de alta:
//     se escribiría a mano en el expediente y el catálogo seguiría vacío, que es
//     exactamente lo que este catálogo viene a arreglar. BORRAR sí es adminOnly
//     — un modelo borrado se lleva por delante la ficha de los expedientes que
//     lo citen.
//
//  2. **El alta desde el EXPEDIENTE es idempotente** (`upsertar`): el mismo
//     modelo se da de alta desde dos expedientes a la vez sin dejar duplicados,
//     y devuelve la fila que ya existía. Sin esto, la clave única respondería un
//     409 al segundo y el usuario no sabría qué hacer con él.
// ============================================================================

const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { staffOnly, adminOnly } = require('../middleware/auth');

const str = (v) => {
    const s = String(v ?? '').trim();
    return s === '' ? null : s;
};
const upper = (v) => (str(v) ? str(v).toUpperCase() : null);
/** Acepta la coma decimal española: el Uf se teclea "1,3", no "1.3". */
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';

function payloadMarco(b) {
    return {
        marca: upper(b.marca),
        serie: str(b.serie),
        apertura: upper(b.apertura) || 'ABISAGRADA',
        material: upper(b.material),
        uf: num(b.uf),
        permeabilidad: str(b.permeabilidad),
        ficha_tecnica: str(b.ficha_tecnica),
        ficha_tecnica_id: str(b.ficha_tecnica_id),
        notas: str(b.notas),
        validado: bool(b.validado),
    };
}

function payloadCristal(b) {
    return {
        fabricante: upper(b.fabricante),
        gama: upper(b.gama),
        composicion: str(b.composicion),
        ug: num(b.ug),
        factor_solar: num(b.factor_solar),
        transmision_luminosa: num(b.transmision_luminosa),
        ficha_tecnica: str(b.ficha_tecnica),
        ficha_tecnica_id: str(b.ficha_tecnica_id),
        notas: str(b.notas),
        validado: bool(b.validado),
    };
}

const CONFIG = {
    marcos: {
        tabla: 'ventanas_marcos',
        payload: payloadMarco,
        conflicto: 'marca,serie,apertura',
        orden: [['marca', true], ['serie', true], ['apertura', true]],
        obligatorios: (p) => (!p.marca ? 'La marca es obligatoria' : (!p.serie ? 'La serie / modelo es obligatoria' : null)),
    },
    cristales: {
        tabla: 'ventanas_cristales',
        payload: payloadCristal,
        conflicto: 'fabricante,gama,composicion',
        orden: [['fabricante', true], ['gama', true], ['composicion', true]],
        obligatorios: (p) => (!p.fabricante ? 'El fabricante es obligatorio' : (!p.gama ? 'La gama es obligatoria' : (!p.composicion ? 'La composición es obligatoria' : null))),
    },
};

function cfgDe(req, res) {
    const c = CONFIG[req.params.tipo];
    if (!c) {
        res.status(404).json({ error: 'Catálogo no válido (usa marcos o cristales)' });
        return null;
    }
    return c;
}

// ─── GET /api/ventanas/:tipo — listado ──────────────────────────────────────
// Se devuelve ENTERO: son decenas de filas, sin JSONB, y quien lo pide (el
// selector del expediente y la pestaña del catálogo) filtra en el navegador SIN
// TILDES. Un filtro por `ilike` aquí sería peor que no tenerlo: "kommerling" no
// casa con "KÖMMERLING" y la búsqueda devolvería cero sin decir por qué.
router.get('/:tipo', staffOnly, async (req, res) => {
    const cfg = cfgDe(req, res); if (!cfg) return;
    try {
        let q = supabase.from(cfg.tabla).select('*');
        for (const [col, asc] of cfg.orden) q = q.order(col, { ascending: asc });
        const { data, error } = await q;
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error(`Error GET ventanas/${req.params.tipo}:`, err);
        res.status(500).json({ error: 'Error al recuperar el catálogo de ventanas' });
    }
});

// ─── GET /api/ventanas/:tipo/:id ────────────────────────────────────────────
router.get('/:tipo/:id', staffOnly, async (req, res) => {
    const cfg = cfgDe(req, res); if (!cfg) return;
    try {
        const { data, error } = await supabase.from(cfg.tabla).select('*').eq('id', req.params.id).single();
        if (error || !data) return res.status(404).json({ error: 'Modelo no encontrado' });
        res.json(data);
    } catch (err) {
        console.error(`Error GET ventanas/${req.params.tipo}/:id:`, err);
        res.status(500).json({ error: 'Error al obtener el modelo' });
    }
});

// ─── POST /api/ventanas/:tipo — crear (o devolver el que ya existe) ─────────
// `upsertar: true` es lo que manda el alta DESDE UN EXPEDIENTE: allí lo que se
// quiere es "que exista", no "crear uno nuevo", y chocar con la clave única a
// mitad de rellenar la envolvente sería un callejón sin salida.
router.post('/:tipo', staffOnly, async (req, res) => {
    const cfg = cfgDe(req, res); if (!cfg) return;
    try {
        const payload = cfg.payload(req.body);
        const falta = cfg.obligatorios(payload);
        if (falta) return res.status(400).json({ error: falta });

        if (bool(req.body.upsertar)) {
            const { data, error } = await supabase
                .from(cfg.tabla)
                .upsert(payload, { onConflict: cfg.conflicto })
                .select()
                .single();
            if (error) throw error;
            return res.status(201).json(data);
        }

        const { data, error } = await supabase.from(cfg.tabla).insert([payload]).select().single();
        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ese modelo ya está en el catálogo', duplicado: true });
            }
            throw error;
        }
        res.status(201).json(data);
    } catch (err) {
        console.error(`Error POST ventanas/${req.params.tipo}:`, err);
        res.status(500).json({ error: 'Error al guardar el modelo', details: err.message });
    }
});

// ─── PUT /api/ventanas/:tipo/:id — editar ───────────────────────────────────
router.put('/:tipo/:id', staffOnly, async (req, res) => {
    const cfg = cfgDe(req, res); if (!cfg) return;
    try {
        const payload = cfg.payload(req.body);
        const falta = cfg.obligatorios(payload);
        if (falta) return res.status(400).json({ error: falta });
        const { data, error } = await supabase
            .from(cfg.tabla).update(payload).eq('id', req.params.id).select().single();
        if (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Ya hay otro modelo con esos mismos datos', duplicado: true });
            }
            throw error;
        }
        if (!data) return res.status(404).json({ error: 'Modelo no encontrado' });
        res.json(data);
    } catch (err) {
        console.error(`Error PUT ventanas/${req.params.tipo}/:id:`, err);
        res.status(500).json({ error: 'Error al actualizar el modelo', details: err.message });
    }
});

// ─── PATCH /api/ventanas/:tipo/:id — completar HUECOS ───────────────────────
// Lo usa el aviso "a este modelo le falta el Uf" que sale en el expediente: se
// teclea el dato con la ficha delante y queda para todos los expedientes que
// vengan detrás. NO reutiliza el PUT porque ése reconstruye la fila entera
// (mismo motivo que el PATCH /datos-rite de aerotermia): mandarle solo el Uf
// pondría a NULL la ficha técnica, el material y las notas.
router.patch('/:tipo/:id', staffOnly, async (req, res) => {
    const cfg = cfgDe(req, res); if (!cfg) return;
    const CAMPOS = {
        marcos:    { uf: num, material: upper, permeabilidad: str, ficha_tecnica: str, ficha_tecnica_id: str, notas: str, validado: bool },
        cristales: { ug: num, factor_solar: num, transmision_luminosa: num, ficha_tecnica: str, ficha_tecnica_id: str, notas: str, validado: bool },
    }[req.params.tipo];
    try {
        const updates = {};
        for (const [campo, cast] of Object.entries(CAMPOS)) {
            if (!Object.prototype.hasOwnProperty.call(req.body, campo)) continue;
            updates[campo] = cast(req.body[campo]);
        }
        if (!Object.keys(updates).length) {
            return res.status(400).json({ error: 'No has indicado ningún dato que guardar' });
        }
        const { data, error } = await supabase
            .from(cfg.tabla).update(updates).eq('id', req.params.id).select().single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Modelo no encontrado' });
        res.json(data);
    } catch (err) {
        console.error(`Error PATCH ventanas/${req.params.tipo}/:id:`, err);
        res.status(500).json({ error: 'Error al guardar el dato', details: err.message });
    }
});

// ─── DELETE /api/ventanas/:tipo/:id ─────────────────────────────────────────
router.delete('/:tipo/:id', adminOnly, async (req, res) => {
    const cfg = cfgDe(req, res); if (!cfg) return;
    try {
        const { error } = await supabase.from(cfg.tabla).delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        console.error(`Error DELETE ventanas/${req.params.tipo}/:id:`, err);
        res.status(500).json({ error: 'Error al eliminar el modelo' });
    }
});

module.exports = router;
