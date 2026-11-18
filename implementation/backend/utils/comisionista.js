// ─── El COMISIONISTA de una oportunidad: quién lo ve y cómo se valida ─────────
//
// Fuente única de la poda por rol. La usan routes/comisionistas.js, el listado y
// el detalle de oportunidades (routes/oportunidades.js) y el listado de
// expedientes (routes/expedientes.js). Si cada ruta decidiera por su cuenta,
// alguna acabaría enseñándole a un partner a quién le pagamos comisión de su
// propia empresa, o a un TRABAJADOR el importe (reglas 6 y 102).
//
//   · partner (no staff): ni `comisionista_id` ni `comisionista_importe`.
//   · TRABAJADOR: ve quién es, no lo pactado.
//   · ADMIN: todo.
// Prueba sin BD: node scripts/test_comisionista.js

const esAdmin = (req) => !!(req && req.user && req.user.rol_nombre === 'ADMIN');
const esStaff = (req) => !!(req && (req.internalCall
    || (req.user && (req.user.rol_nombre === 'ADMIN' || req.user.rol_nombre === 'TRABAJADOR'))));

// Lo pactado con la PERSONA (tabla comisionistas) y lo agregado en el listado.
const CAMPOS_COMISION = ['comision_tipo', 'comision_valor', 'importe_total', 'obras_sin_importe'];

// Una fila de `oportunidades` (o algo que la contenga) podada según quién mira.
function capaComisionista(op, req) {
    if (!op || typeof op !== 'object') return op;
    if (esAdmin(req)) return op;
    const out = { ...op };
    delete out.comisionista_importe;
    if (!esStaff(req)) delete out.comisionista_id;
    return out;
}

function normalizarImporte(v) {
    if (v === null || v === undefined || v === '') return { valor: null };
    // «1.234,56» (tecleado en castellano) o «150.5» (lo que da un input numérico):
    // los puntos solo son de miles si hay coma decimal.
    const s = String(v).replace(/\s/g, '');
    const n = typeof v === 'number' ? v : Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    if (!Number.isFinite(n) || n < 0 || n > 1e6) return { error: 'Importe no válido.' };
    return { valor: Math.round(n * 100) / 100 };
}

const texto = (v, max = 200) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().slice(0, max);
    return s || null;
};

// Lo que se puede escribir de una persona. En un alta, `nombre` es obligatorio.
// Los campos de comisión solo cuentan si quien escribe es ADMIN (si no, se
// ignoran sin error, igual que en la ficha del partner).
function normalizarComisionista(body = {}, { admin = false, alta = false } = {}) {
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const fila = {};
    if (alta || has('nombre')) {
        const nombre = texto(body.nombre, 120);
        if (!nombre) return { error: 'El nombre es obligatorio.' };
        fila.nombre = nombre.toUpperCase();
    }
    if (has('tlf')) {
        const t = texto(body.tlf, 30);
        fila.tlf = t ? t.replace(/[^\d+]/g, '') || null : null;
    }
    if (has('email')) {
        const e = texto(body.email, 160);
        if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { error: 'Email no válido.' };
        fila.email = e ? e.toLowerCase() : null;
    }
    if (has('cargo')) fila.cargo = texto(body.cargo, 80);
    if (has('notas')) fila.notas = texto(body.notas, 2000);
    if (has('prescriptor_id')) fila.prescriptor_id = body.prescriptor_id || null;
    if (has('activo')) fila.activo = body.activo !== false;
    if (admin) {
        if (has('comision_tipo')) {
            if (!['eur', 'pct'].includes(body.comision_tipo)) return { error: 'Tipo de comisión no válido.' };
            fila.comision_tipo = body.comision_tipo;
        }
        if (has('comision_valor')) {
            const { valor, error } = normalizarImporte(body.comision_valor);
            if (error) return { error: 'Valor de comisión no válido.' };
            fila.comision_valor = valor ?? 0;
        }
    }
    return { fila };
}

module.exports = { esAdmin, esStaff, CAMPOS_COMISION, capaComisionista, normalizarImporte, normalizarComisionista };
