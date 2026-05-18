import React from 'react';

const STAGE_COPY = {
    gps: {
        title: 'Esperando tu ubicación',
        hint: 'Permite el acceso al GPS en tu navegador'
    },
    catastro: {
        title: 'Identificando tu vivienda',
        hint: 'Consultando cartografía oficial del Catastro…'
    },
    neighbors: {
        title: 'Cargando entorno',
        hint: 'Buscando viviendas colindantes…'
    }
};

export function GeoLocatingOverlay({ stage }) {
    if (!stage) return null;
    const copy = STAGE_COPY[stage] || STAGE_COPY.catastro;

    return (
        <div className="fixed inset-0 z-[700] bg-bkg-deep/80 backdrop-blur-md flex items-center justify-center px-6 animate-fade-in">
            <div className="relative flex flex-col items-center">
                {/* Radar rings */}
                <div className="relative w-44 h-44 flex items-center justify-center mb-8">
                    <span className="absolute inset-0 rounded-full border border-brand/40 animate-geo-ping"></span>
                    <span className="absolute inset-0 rounded-full border border-brand/30 animate-geo-ping" style={{ animationDelay: '0.6s' }}></span>
                    <span className="absolute inset-0 rounded-full border border-brand/20 animate-geo-ping" style={{ animationDelay: '1.2s' }}></span>

                    {/* Sweeping arm */}
                    <span className="absolute inset-0 rounded-full overflow-hidden">
                        <span
                            className="absolute top-1/2 left-1/2 w-1/2 h-px origin-left animate-geo-sweep"
                            style={{
                                background: 'linear-gradient(90deg, rgba(255,176,32,0) 0%, rgba(255,176,32,0.9) 100%)'
                            }}
                        ></span>
                    </span>

                    {/* Center pin */}
                    <div className="relative w-20 h-20 rounded-full bg-brand/15 border border-brand/40 flex items-center justify-center shadow-[0_0_40px_rgba(255,176,32,0.35)]">
                        <svg className="w-9 h-9 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </div>
                </div>

                <h3 className="text-white text-xl font-black tracking-tight text-center mb-2">{copy.title}</h3>
                <p className="text-white/50 text-xs uppercase tracking-[0.25em] text-center max-w-xs">{copy.hint}</p>

                {/* Progress dots */}
                <div className="flex items-center gap-2 mt-6">
                    <span className={`w-2 h-2 rounded-full transition-colors ${stage === 'gps' ? 'bg-brand animate-pulse' : 'bg-brand/40'}`}></span>
                    <span className={`w-2 h-2 rounded-full transition-colors ${stage === 'catastro' ? 'bg-brand animate-pulse' : stage === 'neighbors' ? 'bg-brand/40' : 'bg-white/10'}`}></span>
                    <span className={`w-2 h-2 rounded-full transition-colors ${stage === 'neighbors' ? 'bg-brand animate-pulse' : 'bg-white/10'}`}></span>
                </div>
            </div>
        </div>
    );
}
