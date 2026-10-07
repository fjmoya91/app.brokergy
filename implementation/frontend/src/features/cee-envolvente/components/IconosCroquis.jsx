// Iconos del CROQUIS, en SVG y en `currentColor`: a 14-20 px un emoji es una
// mancha de color que no casa con el resto de las barras (que son glifos
// monocromos) y en el icono grande del popup se ve pixelado.

const base = (size) => ({
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});

export const IconoMovil = ({ size = 14, className = '' }) => (
    <svg {...base(size)} className={className}>
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <path d="M10.5 18.5h3" />
    </svg>
);

export const IconoLapiz = ({ size = 14, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 013 3L8 18.5 4 20z" />
        <path d="M13.5 7l3 3" />
    </svg>
);

export const IconoDeshacer = ({ size = 20, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </svg>
);

export const IconoPapelera = ({ size = 20, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M4 7h16M10 11v6M14 11v6" />
        <path d="M6 7l1 12.5A1.5 1.5 0 008.5 21h7a1.5 1.5 0 001.5-1.5L18 7" />
        <path d="M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
    </svg>
);

export const IconoEncuadrar = ({ size = 20, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" />
    </svg>
);

export const IconoMas = ({ size = 20, className = '' }) => (
    <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);

export const IconoMenos = ({ size = 20, className = '' }) => (
    <svg {...base(size)} className={className}><path d="M5 12h14" /></svg>
);

//: El CONTORNO de la vivienda: una casa con sus esquinas marcadas.
export const IconoVivienda = ({ size = 14, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M4 11l8-6.5 8 6.5" />
        <path d="M6 9.5V20h12V9.5" />
        <circle cx="6" cy="20" r="1.2" fill="currentColor" />
        <circle cx="18" cy="20" r="1.2" fill="currentColor" />
    </svg>
);

//: La PIZARRA: un trozo de plano (una esquina con su ventana) y el lápiz encima.
export const IconoPizarra = ({ size = 14, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M3 13V3h10" />
        <path d="M3 17v3h7" />
        <path d="M12.5 20.5l1-3.5 6.5-6.5a1.8 1.8 0 012.5 2.5L16 19.5l-3.5 1z" />
    </svg>
);

export const IconoCamara = ({ size = 14, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M4 8.5A1.5 1.5 0 015.5 7h2l1.4-2h6.2l1.4 2h2A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" />
        <circle cx="12" cy="13" r="3.4" />
    </svg>
);

export const IconoImagen = ({ size = 14, className = '' }) => (
    <svg {...base(size)} className={className}>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M20.5 16l-5-5-8.5 8.5" />
    </svg>
);

//: Sin cobertura: la señal tachada.
export const IconoSinRed = ({ size = 16, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M2 8.8a15 15 0 015.2-3.1M12 5a15 15 0 0110 3.8" />
        <path d="M5 12.6a10 10 0 014.3-2.4M15.5 10.6A10 10 0 0119 12.6" />
        <path d="M8.5 16.1a5 5 0 017 0" />
        <circle cx="12" cy="19.5" r="0.8" fill="currentColor" />
        <path d="M3 3l18 18" />
    </svg>
);

//: Enviando: una flecha hacia arriba.
export const IconoSubiendo = ({ size = 16, className = '' }) => (
    <svg {...base(size)} className={className}>
        <path d="M12 19V6" />
        <path d="M6.5 11.5L12 6l5.5 5.5" />
        <path d="M5 20.5h14" />
    </svg>
);
