// ─── Iconos — SVG de trazo 24×24, escritos aquí (estilo «carta de pago») ────
// Sin librería de iconos: trazo 2, extremos redondos, `currentColor`.
const Ico = ({ d, size = 20, sw = 2, children, ...p }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
        {d ? <path d={d} /> : children}
    </svg>
);

export const IcoCheck = (p) => <Ico d="M5 12.5l4.5 4.5L19 7.5" {...p} />;
export const IcoFlecha = (p) => <Ico d="M5 12h14M13 6l6 6-6 6" {...p} />;
export const IcoAtras = (p) => <Ico d="M19 12H5M11 6l-6 6 6 6" {...p} />;
export const IcoChevron = (p) => <Ico d="M9 6l6 6-6 6" {...p} />;
export const IcoAbajo = (p) => <Ico d="M6 9l6 6 6-6" {...p} />;
export const IcoX = (p) => <Ico d="M6 6l12 12M18 6L6 18" {...p} />;
export const IcoMas = (p) => <Ico d="M12 5v14M5 12h14" {...p} />;
export const IcoMenos = (p) => <Ico d="M5 12h14" {...p} />;
export const IcoMenu = (p) => <Ico d="M4 7h16M4 12h16M4 17h16" {...p} />;
export const IcoDescarga = (p) => <Ico {...p}><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Ico>;
export const IcoSubir = (p) => <Ico {...p}><path d="M12 20V9" /><path d="M7 14l5-5 5 5" /><path d="M5 4h14" /></Ico>;
export const IcoCopiar = (p) => <Ico {...p}><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></Ico>;
export const IcoAlerta = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Ico>;
export const IcoReloj = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ico>;
export const IcoCarpeta = (p) => <Ico {...p}><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><path d="M3 10h18" /></Ico>;
export const IcoCamara = (p) => <Ico {...p}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2.5h6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" /><circle cx="12" cy="13" r="3.5" /></Ico>;
export const IcoImagen = (p) => <Ico {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 16l-5-5-8.5 8.5" /></Ico>;
export const IcoVideo = (p) => <Ico {...p}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3z" /></Ico>;
export const IcoDoc = (p) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Ico>;
export const IcoCasa = (p) => <Ico {...p}><path d="M3 11l9-7 9 7" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></Ico>;
export const IcoChat = (p) => <Ico {...p}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5z" /><path d="M8.5 10.5h7M8.5 13.5h4.5" /></Ico>;
export const IcoBombilla = (p) => <Ico {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></Ico>;
export const IcoUbicacion = (p) => <Ico {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></Ico>;
export const IcoGps = (p) => <Ico {...p}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Ico>;
export const IcoMapa = (p) => <Ico {...p}><path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z" /><path d="M9 4v13M15 6.5v13" /></Ico>;
export const IcoBuscar = (p) => <Ico {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Ico>;
export const IcoUsuario = (p) => <Ico {...p}><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></Ico>;
export const IcoSalir = (p) => <Ico {...p}><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 16l-4-4 4-4M6 12h10" /></Ico>;
export const IcoEscudo = (p) => <Ico {...p}><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" /><path d="M8.8 12l2.2 2.2 4.2-4.4" /></Ico>;
export const IcoWhatsApp = (p) => <Ico {...p}><path d="M4 20l1.3-3.9A8 8 0 1 1 8.1 19z" /><path d="M9 9.2c.2 2.6 2.2 4.6 4.8 4.8l1-1.2 1.8.8-.2 1.3c-3.8.4-7.4-3.2-7-7l1.3-.2.8 1.8z" /></Ico>;
export const IcoEnlace = (p) => <Ico {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></Ico>;
export const IcoPapelera = (p) => <Ico {...p}><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" /><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" /></Ico>;
export const IcoChispa = (p) => <Ico {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></Ico>;
export const IcoSello = (p) => <Ico {...p}><circle cx="12" cy="9" r="5.5" /><path d="M9 13.8L7.5 21l4.5-2.5 4.5 2.5-1.5-7.2" /></Ico>;
export const IcoCandado = (p) => <Ico {...p}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Ico>;
export const IcoLista = (p) => <Ico {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Ico>;
export const IcoPlano = (p) => <Ico {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 12h7v8.5M10.5 3.5V8M14 12h6.5" /></Ico>;
export const IcoRecargar = (p) => <Ico {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></Ico>;

export function Spinner({ size = 18 }) {
    return (
        <svg className="ca-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    );
}

/** El check que se dibuja (círculo y luego palomita; trazos con pathLength 100). */
export function CheckDibujado() {
    return (
        <div className="ca-check-ok">
            <svg viewBox="0 0 60 60" width="64" height="64" aria-hidden="true">
                <circle cx="30" cy="30" r="26.5" pathLength="100" />
                <path d="M19 31l7.5 7.5L42 23" pathLength="100" />
            </svg>
        </div>
    );
}
