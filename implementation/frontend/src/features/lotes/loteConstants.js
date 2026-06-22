// Constantes compartidas del módulo Lotes (evita dependencia circular
// entre LotesView y LoteDetailModal).

// Estados del lote — espejo de loteService.LOTE_ESTADOS (backend).
export const LOTE_ESTADOS = [
    'BORRADOR',
    'SOLICITADO PRESUPUESTO A VERIFICADOR',
    'ENVIADO A VERIFICADOR',
    'REQUERIMIENTO VERIFICADOR',
    'PTE. SUBIDA MITECO',
    'REQUERIMIENTO G.A.',
    'CAE EMITIDO – PTE PAGO BROKERGY',
    'PTE. PAGO BROKERGY A CLIENTE',
    'FINALIZADO',
];

export function loteEstadoBadge(estado) {
    const s = (estado || '').toUpperCase();
    if (s === 'BORRADOR') return 'bg-white/5 text-white/50 border-white/15';
    if (s.includes('REQUERIMIENTO')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (s === 'FINALIZADO') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (s.includes('CAE EMITIDO') || s.includes('PAGO')) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    if (s.includes('MITECO')) return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    if (s.includes('VERIFICADOR')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-white/5 text-white/40 border-white/10';
}
