// Color de la pastilla de estado de un INFORME (listado de «CEE directos e informes» y ficha).
// En su propio fichero: un .jsx que exporta componentes no exporta constantes (fast refresh).

const PASTILLA = {
    'PTE. REDACCIÓN': 'bg-white/[0.05] text-white/60 border-white/15',
    'EN REVISIÓN': 'bg-sky-500/10 text-sky-300 border-sky-500/25',
    'PTE. FIRMA': 'bg-violet-500/10 text-violet-300 border-violet-500/25',
    'PTE. PRESENTACIÓN': 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/25',
    'PTE. FACTURA':'bg-amber-500/10 text-amber-300 border-amber-500/25',
    'FACTURA SIN ENVIAR': 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    'PTE. PAGO': 'bg-orange-500/10 text-orange-300 border-orange-500/25',
    'PAGO RECIBIDO': 'bg-lime-500/10 text-lime-300 border-lime-500/25',
    'COBRADO · PTE. ENTREGA': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    ENTREGADO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    ANULADO: 'bg-white/[0.03] text-white/30 border-white/10 line-through',
};
export const colorEstadoInforme = (e) => PASTILLA[e] || PASTILLA['PTE. REDACCIÓN'];

// La pastilla de la LÍNEA: un informe (INF) o un certificado de instalación térmica (CIT).
export const pastillaLinea = (linea) => (linea === 'CIT'
    ? { texto: 'CIT', clase: 'bg-rose-500/10 text-rose-300 border-rose-500/20' }
    : { texto: 'Informe', clase: 'bg-violet-500/10 text-violet-300 border-violet-500/20' });
