// Constantes compartidas del módulo Lotes (evita dependencia circular
// entre LotesView y LoteDetailModal).

// Estados del lote — espejo de loteService.LOTE_ESTADOS (backend).
export const LOTE_ESTADOS = [
    'BORRADOR',
    'SOLICITADO PRESUPUESTO A VERIFICADOR',
    'PTE. FIRMA S.O.',
    'PTE. OFERTA VERIFICADOR',
    'PTE. FIRMA OFERTA S.O.',
    'ENVIADO A VERIFICADOR',
    'REQUERIMIENTO VERIFICADOR',
    'VERIFICADO',
    'PTE. SUBIDA MITECO',
    'SUBIDO A MITECO',
    'REQUERIMIENTO G.A.',
    'CAE EMITIDO – PTE PAGO BROKERGY',
    'PTE. PAGO BROKERGY A CLIENTE',
    'FINALIZADO',
];

export function loteEstadoBadge(estado) {
    const s = (estado || '').toUpperCase();
    if (s === 'BORRADOR') return 'bg-white/5 text-white/50 border-white/15';
    if (s.includes('REQUERIMIENTO')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (s === 'FINALIZADO' || s === 'VERIFICADO') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (s.includes('CAE EMITIDO') || s.includes('PAGO')) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
    // Los dos estados del MITECO no son lo mismo: uno es una tarea PENDIENTE y el
    // otro un hito ya cumplido (con su justificante de registro), así que no pueden
    // pintarse igual — "subido" se lee de un vistazo, sin abrir el lote.
    if (s === 'SUBIDO A MITECO') return 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40';
    if (s.includes('MITECO')) return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    // Los estados de espera del papeleo (firma del S.O., oferta) van en ámbar suave:
    // el lote está parado esperando a un tercero, no avanzando.
    if (s.startsWith('PTE. FIRMA') || s === 'PTE. OFERTA VERIFICADOR') return 'bg-amber-500/[0.07] text-amber-300/80 border-amber-500/20';
    if (s.includes('VERIFICADOR')) return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-white/5 text-white/40 border-white/10';
}
