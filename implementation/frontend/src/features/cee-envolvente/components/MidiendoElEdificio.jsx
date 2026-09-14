import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se ve mientras el motor mide el edificio.
//
// POR QUÉ EXISTE: traer la envolvente tarda entre veinte segundos y un minuto
// —son varias consultas a Catastro, en serie y con pausa—, y hasta ahora eso
// era un botón que ponía «Midiendo el edificio…» sobre una pantalla vacía. Una
// espera larga delante de una pantalla quieta se lee como que se ha colgado, y
// lo siguiente es recargar, que es justo lo que vuelve a empezar la espera.
//
// REGLA — se enseña LO QUE ESTÁ PASANDO, y no un porcentaje. Los rótulos son
// las fases REALES del motor y en su orden (`pipeline.descargar` →
// `construir_modelo` → `analizar` → `escribir_salidas`), pero no van
// sincronizados con él: van por tiempo, y por eso se PARAN en la última en vez
// de dar la vuelta. Una barra que llega al 90 % y se queda ahí miente; una que
// vuelve a empezar, dos veces.
//
// El dibujo sí da vueltas, y eso está bien: es lo que dice que sigue vivo.
// ─────────────────────────────────────────────────────────────────────────────

//: Las fases del motor, en su orden. La última es la que más tarda y es donde
//: se para: ahí es donde de verdad se está esperando a Catastro.
const FASES = [
    { a: 0, texto: 'Preguntando a Catastro por la parcela…' },
    { a: 5000, texto: 'Levantando el modelo del edificio…' },
    { a: 11000, texto: 'Clasificando fachadas, medianeras y particiones…' },
    { a: 18000, texto: 'Midiendo y orientando cada cerramiento…' },
];

export function MidiendoElEdificio({ expediente }) {
    const [fase, setFase] = useState(0);

    useEffect(() => {
        const relojes = FASES.slice(1).map(
            (f, i) => setTimeout(() => setFase(i + 1), f.a));
        return () => relojes.forEach(clearTimeout);
    }, []);

    // Portaleado a `body`: un `position: fixed` se ancla al ancestro más cercano
    // con `backdrop-filter`, y la cabecera de esta ventana lo lleva (regla 29.b).
    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4
                        backdrop-blur-sm">
            <style>{CSS}</style>
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-bkg-surface
                            p-6 shadow-2xl">
                <Dibujo />

                <p className="mt-5 text-center text-[13px] font-semibold text-white/85">
                    {FASES[fase].texto}
                </p>
                <p className="mt-1 text-center text-[11px] text-white/40">
                    {expediente || 'Envolvente térmica'}
                </p>

                <p className="mt-4 border-t border-white/[0.07] pt-3 text-center text-[11px]
                              leading-relaxed text-white/35">
                    Son varias consultas a Catastro, <b className="text-white/50">en serie y con
                    pausa</b> — al otro lado está el mismo servicio del que depende el buscador
                    de la app. Tarda entre veinte segundos y un minuto.
                </p>
            </div>
        </div>,
        document.body);
}

/**
 * El edificio dibujándose: la parcela, la planta que se traza sola, los muros
 * que engordan, las cotas y un barrido que la recorre midiendo.
 *
 * Es SVG y `@keyframes`, sin una sola dependencia ni un GIF: pesa nada, se
 * adapta al tema y no se pixela. Las coordenadas son las de un plano de verdad
 * —una planta en L con su patio—, no una forma abstracta: lo que está por venir
 * se reconoce antes.
 */
function Dibujo() {
    return (
        <svg viewBox="0 0 200 132" className="mx-auto block w-full" role="img"
             aria-label="El edificio midiéndose">
            <defs>
                <pattern id="mide-trama" width="4" height="4" patternUnits="userSpaceOnUse"
                         patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="4" stroke="var(--brand-primary)"
                          strokeWidth="1" opacity="0.45" />
                </pattern>
                <linearGradient id="mide-barrido" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0" />
                    <stop offset="50%" stopColor="var(--brand-primary)" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0" />
                </linearGradient>
                <pattern id="mide-rejilla" width="8" height="8" patternUnits="userSpaceOnUse">
                    <path d="M 8 0 L 0 0 0 8" fill="none" stroke="var(--border-subtle)"
                          strokeWidth="0.6" />
                </pattern>
            </defs>

            {/* La retícula: es lo que hace que esto se lea como un plano. */}
            <rect x="0" y="0" width="200" height="132" fill="url(#mide-rejilla)" />

            {/* La parcela, a trazos: lo primero que contesta Catastro. */}
            <polygon className="mide-parcela" points="14,12 186,16 182,120 10,116"
                     fill="none" stroke="var(--text-muted)" strokeWidth="1"
                     strokeDasharray="5 4" />

            {/* Los vecinos: lo que hace medianera a una pared. */}
            <g className="mide-vecinos">
                <polygon points="14,12 60,13 60,34 14,33" fill="var(--text-secondary)"
                         opacity="0.14" stroke="var(--text-secondary)" strokeWidth="0.8" />
                <polygon points="150,15 186,16 184,60 149,58" fill="var(--text-secondary)"
                         opacity="0.14" stroke="var(--text-secondary)" strokeWidth="0.8" />
            </g>

            {/* La planta, trazándose de un tirón. */}
            <polyline className="mide-traza" points={PLANTA} fill="none"
                      stroke="var(--brand-primary)" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round" />

            {/* Y engordando hasta ser un muro, con su trama. */}
            <g className="mide-muros">
                <polyline points={PLANTA} fill="none" stroke="var(--brand-primary)"
                          strokeWidth="6" strokeLinejoin="round" />
                <polyline points={PLANTA} fill="none" stroke="rgb(var(--bkg-surface))"
                          strokeWidth="4" strokeLinejoin="round" />
                <polyline points={PLANTA} fill="none" stroke="url(#mide-trama)"
                          strokeWidth="4" strokeLinejoin="round" />
            </g>

            {/* Los huecos, que es lo último que se coloca. */}
            <g className="mide-huecos" fill="var(--info)">
                <rect x="62" y="99" width="16" height="2.4" rx="1" />
                <rect x="96" y="99" width="16" height="2.4" rx="1" />
                <rect x="131" y="60" width="2.4" height="14" rx="1" />
            </g>

            {/* Las cotas: lo que prueba que está medido. */}
            <g className="mide-cotas" stroke="var(--text-secondary)" strokeWidth="0.8"
               fill="none">
                <path d="M40 115 L152 115 M40 112 L40 118 M152 112 L152 118" />
                <path d="M32 44 L32 104 M29 44 L35 44 M29 104 L35 104" />
            </g>
            <g className="mide-cotas" fill="var(--text-secondary)" fontSize="7"
               style={{ fontWeight: 600 }}>
                <text x="96" y="112" textAnchor="middle">14,13 m</text>
                <text x="28" y="74" textAnchor="middle" transform="rotate(-90 28 74)">
                    8,34 m
                </text>
            </g>

            {/* El barrido, que es lo que dice que sigue vivo. */}
            <rect className="mide-haz" x="-20" y="6" width="20" height="120"
                  fill="url(#mide-barrido)" />
        </svg>
    );
}

//: Una planta en L con su patio: la forma de media España y la del expediente
//: con el que se probó esto.
const PLANTA = '40,44 132,44 132,74 96,74 96,104 40,104 40,44';

//: Los `@keyframes` van aquí y no en `index.css` porque solo existen mientras
//: se mide: son de este componente y no hay por qué cargarlos con la app.
const CSS = `
.mide-parcela { opacity: 0; animation: mide-aparece .9s ease-out .1s forwards; }
.mide-vecinos { opacity: 0; animation: mide-aparece .9s ease-out .5s forwards; }
.mide-traza {
    stroke-dasharray: 330; stroke-dashoffset: 330;
    animation: mide-dibuja 6s cubic-bezier(.65,0,.35,1) 1s infinite;
}
.mide-muros { opacity: 0; animation: mide-engorda 6s ease-out 1s infinite; }
.mide-huecos { opacity: 0; animation: mide-tarde 6s ease-out 1s infinite; }
.mide-cotas { opacity: 0; animation: mide-cota 6s ease-out 1s infinite; }
.mide-haz { animation: mide-barre 6s linear 1s infinite; }

@keyframes mide-aparece { to { opacity: 1; } }
@keyframes mide-dibuja {
    0%   { stroke-dashoffset: 330; opacity: 1; }
    35%  { stroke-dashoffset: 0;   opacity: 1; }
    55%  { stroke-dashoffset: 0;   opacity: 0; }
    100% { stroke-dashoffset: 0;   opacity: 0; }
}
@keyframes mide-engorda {
    0%, 33% { opacity: 0; }
    52%     { opacity: 1; }
    88%     { opacity: 1; }
    100%    { opacity: 0; }
}
@keyframes mide-tarde {
    0%, 58% { opacity: 0; }
    72%     { opacity: 1; }
    88%     { opacity: 1; }
    100%    { opacity: 0; }
}
@keyframes mide-cota {
    0%, 66% { opacity: 0; }
    80%     { opacity: 1; }
    90%     { opacity: 1; }
    100%    { opacity: 0; }
}
@keyframes mide-barre {
    0%   { transform: translateX(0); }
    100% { transform: translateX(240px); }
}

/* Quien ha pedido que no se le muevan las cosas ve el plano quieto y ya
   dibujado: el rótulo que va cambiando basta para saber que esto sigue. */
@media (prefers-reduced-motion: reduce) {
    .mide-parcela, .mide-vecinos, .mide-muros, .mide-huecos, .mide-cotas {
        opacity: 1; animation: none;
    }
    .mide-traza { stroke-dashoffset: 0; opacity: 0; animation: none; }
    .mide-haz { display: none; }
}
`;

export default MidiendoElEdificio;
