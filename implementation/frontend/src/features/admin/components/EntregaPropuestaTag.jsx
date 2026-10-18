// A QUIÉN le ha llegado la propuesta, debajo de la chapa ENVIADA.
//
// Desde 2026-10-14 una propuesta mandada SOLO al instalador también pasa la
// oportunidad a ENVIADA, así que la chapa ya no dice si la tiene el cliente.
// Esto lo dice: «al cliente», «cliente + instalador» o, en ámbar porque es lo
// que pide una llamada, «solo al instalador». Lo calcula el backend de
// `propuesta_versiones` (utils/entregaPropuesta.js) y llega en el listado como
// `datos_calculo.propuesta_entregada`.

const ESTADOS_CON_ENTREGA = ['ENVIADA', 'PRE-ACEPTADO'];

export function textoEntrega(e) {
    if (!e) return null;
    if (e.cliente && (e.instalador || e.otro)) return { texto: 'cliente + instalador', aviso: false };
    if (e.cliente) return { texto: 'al cliente', aviso: false };
    if (e.instalador) return { texto: 'solo al instalador', aviso: true };
    if (e.otro) return { texto: 'a otro contacto', aviso: true };
    if (e.enlace) return { texto: 'enlace copiado', aviso: false };
    return null;
}

function tituloEntrega(e) {
    const partes = [];
    if (e.nombres?.cliente?.length) partes.push(`Cliente: ${e.nombres.cliente.join(', ')}`);
    if (e.nombres?.instalador?.length) partes.push(`Instalador / partner: ${e.nombres.instalador.join(', ')}`);
    if (e.nombres?.otro?.length) partes.push(`Otro: ${e.nombres.otro.join(', ')}`);
    if (e.enlace) partes.push('Enlace de aceptación copiado');
    const base = partes.length ? `La propuesta le ha llegado a — ${partes.join(' · ')}` : '';
    return e.cliente ? base : `${base}\nEl cliente no la ha recibido de nosotros: pregunta al instalador si se la ha pasado.`;
}

export function EntregaPropuestaTag({ op, estado, className = '' }) {
    if (!ESTADOS_CON_ENTREGA.includes(estado)) return null;
    const e = op?.datos_calculo?.propuesta_entregada;
    const t = textoEntrega(e);
    if (!t) return null;
    return (
        <span
            title={tituloEntrega(e)}
            className={`text-[9px] font-semibold uppercase tracking-wider leading-none ${t.aviso ? 'text-amber-400' : 'text-white/40'} ${className}`}
        >
            → {t.texto}
        </span>
    );
}
