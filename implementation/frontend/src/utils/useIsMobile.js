import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Estamos en un móvil? Mismo corte que el resto de la app: 767px, el límite
// inferior del breakpoint `md` de Tailwind, para que lo que decide JavaScript y
// lo que decide el CSS (`max-md:`) no se contradigan nunca.
//
// Se usa SOLO cuando el cambio no se puede expresar en CSS —por ejemplo, montar
// un componente distinto—. Todo lo que sea de estilo va en `max-md:`, que no
// necesita re-render ni parpadea en la primera pintura.
// ─────────────────────────────────────────────────────────────────────────────
export function useIsMobile(query = '(max-width: 767px)') {
    const [matches, setMatches] = useState(
        () => (typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
    );
    useEffect(() => {
        const mq = window.matchMedia?.(query);
        if (!mq) return;
        const onChange = (e) => setMatches(e.matches);
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else mq.addListener(onChange);
        return () => {
            if (mq.removeEventListener) mq.removeEventListener('change', onChange);
            else mq.removeListener(onChange);
        };
    }, [query]);
    return matches;
}

export default useIsMobile;
