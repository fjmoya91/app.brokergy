import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Logo de un prescriptor (S.O., verificador, instalador) para las tarjetas y
// fichas del lote. El logo vive en `prescriptores.logo_empresa` como data URL.
//
// Si no hay logo —o no carga— cae a las iniciales del acrónimo sobre un fondo
// neutro, para que la fila no baile: una tarjeta con hueco vacío queda peor que
// una con iniciales.
// ─────────────────────────────────────────────────────────────────────────────

const iniciales = (p) => {
    const txt = p?.acronimo || p?.razon_social || '';
    return String(txt).replace(/[^A-Za-zÁÉÍÓÚÑ0-9 ]/gi, '').trim().slice(0, 2).toUpperCase() || '—';
};

export function LogoEmpresa({ p, size = 24, className = '' }) {
    const [falla, setFalla] = useState(false);
    const src = p?.logo_empresa;
    const lado = { width: size, height: size };

    if (!src || falla) {
        return (
            <span style={lado}
                title={p?.razon_social || ''}
                className={`shrink-0 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center text-[8px] font-black text-white/40 ${className}`}>
                {iniciales(p)}
            </span>
        );
    }
    return (
        <img src={src} alt={p?.acronimo || p?.razon_social || ''} title={p?.razon_social || ''}
            style={lado} onError={() => setFalla(true)}
            // `bg-white` porque casi todos los logos vienen con fondo transparente
            // pensados para papel: sobre el tema oscuro, en negro, no se veían.
            className={`shrink-0 rounded-md bg-white object-contain p-0.5 ${className}`} />
    );
}

export default LogoEmpresa;
