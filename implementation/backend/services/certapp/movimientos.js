// ─── certapp/movimientos.js — «Mis gastos»: entradas y salidas de certificados ─
// Fran, 24/10/2026: «que puedan ver el gasto que llevan en qué expedientes».
// Cada certificado que entra o sale de una cuenta deja una fila en
// `certapp_movimientos` con el saldo que queda (scripts/certapp_schema.sql):
//   ALTA       los de regalo al crear la cuenta     → apuntar() desde cuentas.crearCuenta
//   AJUSTE     lo que el admin pone a mano          → apuntar() desde PATCH /cuentas/:id
//   COMPRA     los que paga (pasarela: más adelante; importe_eur, factura_id)
//   GASTO      -1 al pedir el certificado de una obra  → DENTRO de certapp_consumir_credito_obra
//   DEVOLUCION +1 si no se ha podido hacer             → DENTRO de certapp_devolver_credito_obra
//
// REGLA — el saldo de verdad es `certapp_cuentas.creditos`; esto es su historia.
// GASTO y DEVOLUCION los apuntan las RPC en la misma transacción que el saldo;
// desde Node solo ALTA, AJUSTE (y, cuando la haya, COMPRA).
// REGLA — `por` (quién del equipo, «automático») es interno: el certificador no lo ve.
// REGLA — con la BD caída, 503 (nunca una lista vacía ni un 0 de saldo).
// Contrato: docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const { errorBd, esUuid, texto } = require('./comun');

const TIPOS = ['ALTA', 'COMPRA', 'GASTO', 'DEVOLUCION', 'AJUSTE'];

/** Para el certificador: sin `por` ni nada interno; la obra con su nº y dirección. */
const COLS_CERTIFICADOR = 'id, created_at, tipo, creditos, saldo_despues, importe_eur, concepto, factura_id, obra_id, '
    + 'obra:certapp_obras(id, numero_expediente, direccion, municipio)';

const CONCEPTO_POR_DEFECTO = {
    ALTA: 'Certificados de regalo de la beta',
    COMPRA: 'Compra de certificados',
    GASTO: 'Certificado pedido',
    DEVOLUCION: 'Crédito devuelto',
    AJUSTE: 'Ajuste de BROKERGY',
};

/**
 * Apunta un movimiento (ALTA, AJUSTE, COMPRA). NUNCA lanza: el saldo ya está
 * cambiado cuando se llama, y que falle el apunte no puede tumbar el alta de
 * una cuenta ni el ajuste del admin. Si falla, lo dice alto en el log y
 * devuelve null; si va bien, la fila.
 *
 * `saldoDespues`: el saldo justo después del cambio; si no llega, se lee de la cuenta.
 */
async function apuntar({ cuentaId, obraId = null, tipo, creditos, concepto, por, importeEur = null, facturaId = null, saldoDespues } = {}) {
    const t = String(tipo || '').toUpperCase();
    const n = Number(creditos);
    try {
        if (!esUuid(cuentaId)) throw new Error(`cuenta no válida (${cuentaId})`);
        if (!TIPOS.includes(t)) throw new Error(`tipo desconocido (${tipo})`);
        if (!Number.isInteger(n)) throw new Error(`créditos no enteros (${creditos})`);
        const dado = saldoDespues === null || saldoDespues === undefined || saldoDespues === '' ? null : Number(saldoDespues);
        let saldo = Number.isInteger(dado) ? dado : null;
        if (saldo === null) {
            const { data, error } = await supabase.from('certapp_cuentas').select('creditos').eq('id', cuentaId).maybeSingle();
            if (error) throw new Error(`leer el saldo: ${error.message}`);
            if (!data) throw new Error('la cuenta no existe');
            saldo = Number(data.creditos ?? 0);
        }
        const importe = importeEur === null || importeEur === undefined || importeEur === '' ? null : Number(importeEur);
        const fila = {
            cuenta_id: cuentaId,
            obra_id: esUuid(obraId) ? obraId : null,
            tipo: t,
            creditos: n,
            saldo_despues: saldo,
            importe_eur: Number.isFinite(importe) ? Math.round(importe * 100) / 100 : null,
            concepto: texto(concepto, 200) || CONCEPTO_POR_DEFECTO[t],
            por: texto(por, 160) || null,
            factura_id: texto(facturaId, 80) || null,
        };
        const { data, error } = await supabase.from('certapp_movimientos').insert(fila).select('*').maybeSingle();
        if (error) throw new Error(error.message);
        return data || fila;
    } catch (e) {
        console.error(`[certapp] movimiento SIN apuntar (${t} ${creditos} cuenta ${cuentaId}):`, e?.message || e);
        return null;
    }
}

function paraCertificador(m) {
    if (!m) return null;
    const o = m.obra || null;
    return {
        id: m.id,
        created_at: m.created_at,
        tipo: m.tipo,
        creditos: m.creditos,
        saldo_despues: m.saldo_despues,
        importe_eur: m.importe_eur === null || m.importe_eur === undefined ? null : Number(m.importe_eur),
        concepto: m.concepto || CONCEPTO_POR_DEFECTO[m.tipo] || null,
        factura_id: m.factura_id || null,
        obra: o ? { id: o.id || m.obra_id, numero_expediente: o.numero_expediente || null, direccion: o.direccion || null, municipio: o.municipio || null } : null,
    };
}

/** Los movimientos de la cuenta, del más nuevo al más viejo. BD caída → lanza 503. */
async function listar(cuentaId, { limite = 500 } = {}) {
    const { data, error } = await supabase.from('certapp_movimientos').select(COLS_CERTIFICADOR)
        .eq('cuenta_id', cuentaId)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .limit(Math.min(Math.max(Number(limite) || 500, 1), 2000));
    if (error) throw errorBd(error, 'listar movimientos');
    return (data || []).map(paraCertificador);
}

/**
 * Las cifras de arriba de «Mis gastos». Del saldo de la cuenta (lo de verdad) y
 * de TODAS sus compras (no de la página de la lista):
 *   disponibles = creditos · usados = creditos_usados
 *   comprados   = suma de COMPRA · gastado_eur = suma de su importe
 *   recibidos_gratis = disponibles + usados − comprados (alta, ajustes y regalos)
 * `compras_abiertas` = false mientras no haya pasarela (la beta): «0 €».
 */
async function resumen(cuentaId) {
    const { data: c, error } = await supabase.from('certapp_cuentas').select('creditos, creditos_usados').eq('id', cuentaId).maybeSingle();
    if (error) throw errorBd(error, 'saldo');
    const { data: compras, error: errC } = await supabase.from('certapp_movimientos').select('creditos, importe_eur')
        .eq('cuenta_id', cuentaId).eq('tipo', 'COMPRA').limit(10000);
    if (errC) throw errorBd(errC, 'compras');
    const disponibles = Number(c?.creditos ?? 0);
    const usados = Number(c?.creditos_usados ?? 0);
    const comprados = (compras || []).reduce((s, r) => s + (Number(r.creditos) || 0), 0);
    const gastado = (compras || []).reduce((s, r) => s + (Number(r.importe_eur) || 0), 0);
    return {
        disponibles,
        usados,
        comprados,
        recibidos_gratis: Math.max(disponibles + usados - comprados, 0),
        gastado_eur: Math.round(gastado * 100) / 100,
        compras_abiertas: false,
    };
}

module.exports = { TIPOS, CONCEPTO_POR_DEFECTO, COLS_CERTIFICADOR, apuntar, listar, resumen, paraCertificador };
