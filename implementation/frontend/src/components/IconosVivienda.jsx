// ─── IconosVivienda.jsx ──────────────────────────────────────────────────────
// Pictogramas de lo que el cliente tiene en casa: radiador, suelo radiante,
// placas, aire acondicionado. Los emojis no servían —el del radiador era una
// ESCALERA (🪜)— y en una pregunta que el cliente contesta mirando el dibujo,
// un dibujo que no es lo que tiene en casa confunde más que ninguno.
//
// SVG de trazo, `currentColor`: se adaptan al tema y al estado seleccionado sin
// ficheros de imagen. Todos sobre la misma rejilla de 48 y el mismo grosor.
// ─────────────────────────────────────────────────────────────────────────────

const base = {
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
};

/** Ondas de calor que suben (x = centro de cada una). */
function Calor({ xs, y = 11 }) {
    return xs.map(x => (
        <path key={x} d={`M${x} ${y}c-1.6-1.6 1.6-3.2 0-4.8s1.6-3.2 0-4.8`} strokeWidth={1.8} />
    ));
}

/** Radiador de columnas, con su llave y sus patas. */
export function IconRadiador({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Calor xs={[17, 24, 31]} y={12} />
            {[9, 16.5, 24, 31.5].map(x => <rect key={x} x={x} y="16" width="6" height="22" rx="3" />)}
            <path d="M9 20.5h30M9 33.5h30" strokeWidth={1.4} opacity=".55" />
            <path d="M39 20h3M11 38v4M37 38v4" />
        </svg>
    );
}

/** Suelo radiante: el tubo en serpentín dentro del suelo y el calor subiendo. */
export function IconSueloRadiante({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Calor xs={[14, 24, 34]} y={27} />
            <path d="M4 31h40M4 43h40" />
            <path d="M8 37c2.5-3.5 5-3.5 7.5 0s5 3.5 7.5 0 5-3.5 7.5 0 5 3.5 7.5 0 3.5-2.2 4.5-1.2" strokeWidth={1.9} />
        </svg>
    );
}

/** Las dos cosas: un radiador pequeño sobre un suelo radiante. */
export function IconMixto({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            {[8, 13.5, 19].map(x => <rect key={x} x={x} y="9" width="4.5" height="15" rx="2.2" />)}
            <path d="M10 24v3M21.5 24v3" />
            <Calor xs={[31, 38]} y={24} />
            <path d="M4 31h40M4 43h40" />
            <path d="M8 37c2.5-3.5 5-3.5 7.5 0s5 3.5 7.5 0 5-3.5 7.5 0 5 3.5 7.5 0 3.5-2.2 4.5-1.2" strokeWidth={1.9} />
        </svg>
    );
}

/** Otro sistema / no lo sé. */
export function IconNoSe({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <circle cx="24" cy="24" r="17" />
            <path d="M18.5 19a5.5 5.5 0 1 1 7.6 5.1c-1.3.6-2.1 1.8-2.1 3.2v1.2" />
            <path d="M24 34.5v.2" strokeWidth={3} />
        </svg>
    );
}

/** Panel fotovoltaico en su soporte (sin el sol: lo añade quien lo usa). */
function Panel({ dashed = false }) {
    return (
        <g strokeDasharray={dashed ? '3 3' : undefined}>
            <path d="M6 22h24l6 15H12z" />
            <path d="M14 22l6 15M22 22l6 15M9 29.5h24" strokeWidth={1.5} />
            <path d="M24 37v6M18 43h12" strokeDasharray="none" />
        </g>
    );
}

/** Sí, ya tengo placas: el panel con el sol. */
export function IconPlacas({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Panel />
            <circle cx="38" cy="10" r="4" />
            <path d="M38 2.5v1.5M38 16v1.5M30.5 10H32M44 10h1.5M32.7 4.7l1.1 1.1M42.2 14.2l1.1 1.1M32.7 15.3l1.1-1.1M42.2 5.8l1.1-1.1" strokeWidth={1.7} />
        </svg>
    );
}

/** No, pero me interesa: el panel que todavía no está, y un «más». */
export function IconPlacasFuturo({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Panel dashed />
            <circle cx="38" cy="11" r="7" />
            <path d="M38 7.5v7M34.5 11h7" />
        </svg>
    );
}

/** No tengo placas ni me interesa: el panel tachado. */
export function IconSinPlacas({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Panel />
            <path d="M6 8l34 34" strokeWidth={2.4} />
        </svg>
    );
}

/** Split de pared con el aire saliendo. */
export function IconAire({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="5" y="8" width="38" height="15" rx="3.5" />
            <path d="M10 18.5h28" strokeWidth={1.6} />
            <path d="M36 12.5h2" strokeWidth={2.6} />
            <path d="M14 28c0 3.5-3 3.5-3 7s3 3.5 3 7M24 28c0 3.5-3 3.5-3 7s3 3.5 3 7M34 28c0 3.5-3 3.5-3 7s3 3.5 3 7" strokeWidth={1.8} />
        </svg>
    );
}

/** Sin aire acondicionado: el split tachado. */
export function IconSinAire({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="5" y="8" width="38" height="15" rx="3.5" />
            <path d="M10 18.5h28" strokeWidth={1.6} />
            <path d="M8 4l32 40" strokeWidth={2.4} />
        </svg>
    );
}

// ─── El resto del formulario de captación (/reforma) ────────────────────────
// Mismo trazo y misma rejilla. Cada dibujo dice lo que dice su tarjeta: la obra,
// las facturas, los certificados, el combustible, la caldera, el agua caliente,
// la envolvente y el presupuesto.

/** Documento con la esquina doblada (base de factura, certificado…). */
function Hoja({ dashed = false }) {
    return (
        <g strokeDasharray={dashed ? '3 3' : undefined}>
            <path d="M11 5h19l8 8v30H11z" />
            <path d="M30 5v8h8" />
        </g>
    );
}

/** Calendario (base de las fechas). */
function Calendario({ x = 6, y = 9, w = 36, h = 33 }) {
    return (
        <>
            <rect x={x} y={y} width={w} height={h} rx="3" />
            <path d={`M${x} ${y + 9}h${w} M${x + w * 0.25} ${y - 4}v8 M${x + w * 0.75} ${y - 4}v8`} />
        </>
    );
}

/** Caldera mural: cuerpo, pantalla y mandos. */
function CuerpoCaldera({ y = 5 }) {
    return (
        <>
            <rect x="12" y={y} width="24" height="28" rx="3" />
            <rect x="17" y={y + 5} width="14" height="6" rx="1" strokeWidth={1.6} />
            <circle cx="20" cy={y + 18} r="1.5" />
            <circle cx="28" cy={y + 18} r="1.5" />
        </>
    );
}

/** Solo cambiar la caldera por AEROTERMIA: la unidad exterior. */
export function IconAerotermia({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="4" y="10" width="40" height="26" rx="3" />
            <circle cx="17" cy="23" r="8.5" />
            <path d="M17 23v-6.5M17 23l5.6 3.2M17 23l-5.6 3.2" strokeWidth={1.8} />
            <path d="M30 16.5h9M30 21h9M30 25.5h9M30 30h9" strokeWidth={1.6} />
            <path d="M9 36v4M39 36v4" />
        </svg>
    );
}

/** Reforma integral: la casa con su capa de aislamiento y la aerotermia al lado. */
export function IconReformaIntegral({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M3 22L19 8l16 14" />
            <path d="M6 20v22h26V20" />
            <path d="M10 24v14h18V24" strokeWidth={1.5} strokeDasharray="2.5 2.5" />
            <rect x="35" y="31" width="10" height="11" rx="1.5" />
            <circle cx="40" cy="36.5" r="2.8" strokeWidth={1.6} />
        </svg>
    );
}

/** Aún no he empezado: el plano y el lápiz. */
export function IconPlano({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="5" y="6" width="28" height="34" rx="2" />
            <path d="M10 12h18v16H10zM19 12v8M19 24v4M10 20h5" strokeWidth={1.5} />
            <path d="M30 44l1.5-5.5L42 28l4 4-10.5 10.5z" />
            <path d="M39 31l4 4" strokeWidth={1.6} />
        </svg>
    );
}

/** Obra a medias / factura parcial: la valla de obra. */
export function IconObraMedias({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="5" y="14" width="38" height="12" rx="2" />
            <path d="M8 26l8-12M16 26l8-12M24 26l8-12M32 26l8-12" strokeWidth={1.8} />
            <path d="M11 26v14M37 26v14M6 41h10M32 41h10" />
            <circle cx="11" cy="9" r="2.5" />
            <circle cx="37" cy="9" r="2.5" />
        </svg>
    );
}

/** Obra ya hecha / terminada: la casa con su visto bueno. */
export function IconObraHecha({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M5 22L24 6l19 16" />
            <path d="M10 18v24h28V18" />
            <path d="M17 30l5 5 9-10" strokeWidth={2.6} />
        </svg>
    );
}

/** Obra nueva: la grúa levantando la casa. */
export function IconObraNueva({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M12 44V4M6 8h36M12 4L6 8M12 4l30 4" />
            <path d="M36 8v10" strokeWidth={1.6} />
            <path d="M33 18h6v4h-6z" />
            <path d="M22 44V35l8-6 8 6v9" />
            <path d="M4 44h40" />
        </svg>
    );
}

/** Fecha dentro de plazo. */
export function IconCalendarioOk({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Calendario />
            <path d="M16 30l5 5 10-10" strokeWidth={2.6} />
        </svg>
    );
}

/** Fecha fuera de plazo. */
export function IconCalendarioNo({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Calendario />
            <path d="M18 25l12 12M30 25L18 37" strokeWidth={2.6} />
        </svg>
    );
}

/** Hace más de un mes: el calendario y el reloj. */
export function IconCalendarioReloj({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Calendario x={4} y={9} w={23} h={20} />
            <circle cx="35" cy="35" r="9" />
            <path d="M35 30v5l3 2" strokeWidth={1.9} />
        </svg>
    );
}

/** Factura / presupuesto: la hoja con el euro. */
export function IconFactura({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Hoja />
            <path d="M16 12h8" strokeWidth={1.6} />
            <path d="M29.6 23.8A6.2 6.2 0 1 0 29.6 33" />
            <path d="M18 26.8h8.5M18 30h8.5" strokeWidth={1.8} />
        </svg>
    );
}

/** Todavía no hay factura: la hoja que aún no existe. */
export function IconFacturaPendiente({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Hoja dashed />
            <path d="M17 22h14M17 28h14M17 34h8" strokeWidth={1.6} strokeDasharray="3 3" />
        </svg>
    );
}

/** Certificado de eficiencia energética: la hoja con su etiqueta. */
export function IconCertificado({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Hoja />
            <path d="M16 18h8M16 24h12M16 30h16M16 36h20" strokeWidth={3} />
        </svg>
    );
}

/** Un solo papel, sin más (p. ej. "no, solo tengo uno"). */
export function IconDocumento({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Hoja />
            <path d="M16 20h16M16 26h16M16 32h10" strokeWidth={1.6} />
        </svg>
    );
}

/** No tengo / no tenía: el círculo tachado. */
export function IconNinguno({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <circle cx="24" cy="24" r="17" />
            <path d="M12 12l24 24" />
        </svg>
    );
}

/** Tengo fotos: la cámara. */
export function IconCamara({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M5 16h8l3-5h16l3 5h8v25H5z" />
            <circle cx="24" cy="28" r="7" />
            <circle cx="37" cy="21" r="1" strokeWidth={2.6} />
        </svg>
    );
}

/** Gas: la llama. */
export function IconLlama({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M24 4c2 8 12 12 12 24a12 12 0 0 1-24 0c0-7 4-10 5-16 3 3 4 6 4 9 3-4 4-10 3-17z" />
            <path d="M24 39.5c-3 0-4.5-2-4.5-4 0-2.5 2-4.5 4.5-7 2.5 2.5 4.5 4.5 4.5 7 0 2-1.5 4-4.5 4z" strokeWidth={1.6} />
        </svg>
    );
}

/** Gasóleo: el bidón. */
export function IconBidon({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <ellipse cx="24" cy="10" rx="12" ry="4" />
            <path d="M12 10v28c0 2.2 5.4 4 12 4s12-1.8 12-4V10" />
            <path d="M12 20c0 2.2 5.4 4 12 4s12-1.8 12-4M12 30c0 2.2 5.4 4 12 4s12-1.8 12-4" strokeWidth={1.6} />
            <path d="M28.5 9h3" strokeWidth={2.8} />
        </svg>
    );
}

/** Electricidad: el rayo. */
export function IconRayo({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M27 4L11 27h11l-3 17 18-24H26z" />
        </svg>
    );
}

/** Carbón: el montón. */
export function IconCarbon({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M5 41l3-9 8-4 6 5-1 8z" />
            <path d="M21 41l3-9 9-5 8 5 2 9z" />
            <path d="M14 26l3-9 8-3 6 6-2 7-7 2z" />
        </svg>
    );
}

/** Biomasa: los troncos. */
export function IconLena({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M9 29h25M9 39h25" />
            <ellipse cx="9" cy="34" rx="2.5" ry="5" />
            <ellipse cx="34" cy="34" rx="3.5" ry="5" />
            <circle cx="34" cy="34" r="1.2" />
            <path d="M15 15h25M15 25h25" />
            <ellipse cx="15" cy="20" rx="2.5" ry="5" />
            <ellipse cx="40" cy="20" rx="3.5" ry="5" />
            <circle cx="40" cy="20" r="1.2" />
        </svg>
    );
}

/** La caldera (p. ej. "la misma caldera da el agua caliente"). */
export function IconCaldera({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <CuerpoCaldera />
            <path d="M18 33v8M24 33v8M30 33v8" strokeWidth={1.8} />
        </svg>
    );
}

/** Caldera de menos de 10 años: la caldera, nueva. */
export function IconCalderaNueva({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <CuerpoCaldera y={9} />
            <path d="M18 37v6M24 37v6M30 37v6" strokeWidth={1.8} />
            <path d="M41 3v7M37.5 6.5h7M42 14v3M40.5 15.5h3" strokeWidth={1.8} />
        </svg>
    );
}

/** Entre 10 y 20 años: el reloj de arena. */
export function IconRelojArena({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M12 5h24M12 43h24" />
            <path d="M15 5c0 9 9 12 9 19s-9 10-9 19M33 5c0 9-9 12-9 19s9 10 9 19" />
            <path d="M18.5 39c1.8-2.8 3.7-4 5.5-4s3.7 1.2 5.5 4z" fill="currentColor" stroke="none" opacity=".45" />
            <path d="M19.5 13h9" strokeWidth={1.6} />
        </svg>
    );
}

/** Más de 20 años: la caldera de pie, antigua. */
export function IconCalderaVieja({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="11" y="12" width="26" height="30" rx="2" />
            <path d="M24 12V5h8" />
            <path d="M16 20h16M16 25h16M16 30h16" strokeWidth={1.5} />
            <path d="M18 36l3-2 2 3 3-3 2 2" strokeWidth={1.5} />
            <path d="M13 42v3M35 42v3" />
        </svg>
    );
}

/** Caldera sin condensación: la que echa los humos. */
export function IconCalderaHumos({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <CuerpoCaldera y={14} />
            <path d="M24 14V9" />
            <path d="M24 7c-2-1.5 2-3 0-4.5M31 9c-2-1.5 2-3 0-4.5M17 9c-2-1.5 2-3 0-4.5" strokeWidth={1.6} />
            <path d="M18 42v4M30 42v4" strokeWidth={1.8} />
        </svg>
    );
}

/** Caldera de condensación: la manguera y su gota. */
export function IconCalderaGota({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <CuerpoCaldera y={4} />
            <path d="M24 32v4" strokeWidth={1.8} />
            <path d="M24 37.5c-2 3-3.5 4.5-3.5 6.2a3.5 3.5 0 0 0 7 0c0-1.7-1.5-3.2-3.5-6.2z" />
        </svg>
    );
}

/** Termo eléctrico: el depósito con su resistencia. */
export function IconTermo({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="14" y="4" width="20" height="36" rx="10" />
            <path d="M25.5 13l-4.5 8h6l-4.5 8" strokeWidth={2} />
            <path d="M19 40v5M29 40v5" />
        </svg>
    );
}

/** Butano / propano: la bombona. */
export function IconBombona({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M15 17c0-4 4-7 9-7s9 3 9 7v21a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4z" />
            <path d="M20 10V5h8v5" />
            <path d="M15 25h18" strokeWidth={1.6} />
            <path d="M18 42v3M30 42v3" />
        </svg>
    );
}

/** Placas solares TÉRMICAS: el captador con su gota de agua caliente. */
export function IconSolarTermico({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <Panel />
            <path d="M38 3c-2.6 3.8-4.5 5.8-4.5 8a4.5 4.5 0 0 0 9 0c0-2.2-1.9-4.2-4.5-8z" />
        </svg>
    );
}

/** El agua caliente también: la ducha. */
export function IconDucha({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M11 44V14a7 7 0 0 1 7-7h6a7 7 0 0 1 7 7v2" />
            <path d="M23 16h16l-2.5 5h-11z" />
            <path d="M27 26v3M31 26v3M35 26v3M29 33v3M33 33v3" strokeWidth={2} />
        </svg>
    );
}

/** Ventanas. */
export function IconVentana({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="9" y="5" width="30" height="36" rx="2" />
            <path d="M24 5v36M9 23h30" strokeWidth={1.8} />
            <path d="M5 43h38" />
        </svg>
    );
}

/** Cubierta / tejado: el tejado con su capa de aislamiento. */
export function IconCubierta({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M3 26L24 8l21 18" />
            <path d="M10 27l14-12 14 12" strokeWidth={1.6} strokeDasharray="3 2.5" />
            <path d="M10 27v15h28V27" />
        </svg>
    );
}

/** Fachada: el muro de ladrillo y el aislamiento por fuera. */
export function IconFachada({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="5" y="7" width="25" height="35" rx="1" />
            <path d="M5 16h25M5 25h25M5 34h25M17 7v9M11 16v9M23 16v9M17 25v9M11 34v8M23 34v8" strokeWidth={1.5} />
            <rect x="33" y="7" width="10" height="35" rx="1" />
            <path d="M33 13l10 5M33 21l10 5M33 29l10 5M33 37l10 5" strokeWidth={1.4} />
        </svg>
    );
}

/** Suelo: el forjado con su capa de aislamiento. */
export function IconSueloAislamiento({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M4 20h40M4 28h40M4 42h40" />
            <path d="M6 35l4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4" strokeWidth={1.6} />
            <path d="M24 5v9M20 10l4 4 4-4" strokeWidth={1.8} />
        </svg>
    );
}

/** Un presupuesto orientativo: la calculadora. */
export function IconCalculadora({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <rect x="10" y="4" width="28" height="40" rx="3" />
            <rect x="15" y="9" width="18" height="8" rx="1" strokeWidth={1.6} />
            {[17, 24, 31].flatMap(x => [24, 31, 38].map(y => (
                <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" stroke="none" />
            )))}
        </svg>
    );
}

/** Presupuesto de un instalador: la llave inglesa. */
export function IconHerramienta({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M30 6a9 9 0 0 0-8.3 12.2L7.5 32.4a4 4 0 0 0 5.7 5.7l14.2-14.2A9 9 0 0 0 39.6 15.6l-5.4 5.4-5.2-1.4-1.4-5.2L33 9a9 9 0 0 0-3-3z" />
        </svg>
    );
}

// ─── Zonas del inmueble (lo que dice el Catastro de cada planta) ────────────

/** Vivienda: la casa con su puerta. */
export function IconCasa({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M5 22L24 6l19 16" />
            <path d="M10 18v24h28V18" />
            <path d="M20 42V31h8v11" />
        </svg>
    );
}

/** Aparcamiento / garaje: el coche. */
export function IconCoche({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M8 29l3-9a4 4 0 0 1 3.8-3h18.4a4 4 0 0 1 3.8 3l3 9" />
            <rect x="5" y="29" width="38" height="10" rx="3" />
            <circle cx="14" cy="40" r="3.5" />
            <circle cx="34" cy="40" r="3.5" />
            <path d="M11 34h3M34 34h3" strokeWidth={2.6} />
        </svg>
    );
}

/** Almacén / trastero: la caja. */
export function IconCaja({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M6 15l18-8 18 8v19l-18 8-18-8z" />
            <path d="M6 15l18 8 18-8M24 23v19" />
            <path d="M15 11l18 8" strokeWidth={1.6} />
        </svg>
    );
}

/** Local comercial: la tienda con su toldo. */
export function IconTienda({ className = 'w-9 h-9' }) {
    return (
        <svg {...base} className={className}>
            <path d="M6 18l3-10h30l3 10" />
            <path d="M6 18a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0" />
            <path d="M9 23v19h30V23" />
            <path d="M20 42V32h8v10" />
        </svg>
    );
}
