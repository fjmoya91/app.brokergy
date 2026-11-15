/**
 * Banco de pruebas del VISOR y del EDITOR (solo en desarrollo).
 *
 * No entra en el build: `vite build` solo toma `index.html` como entrada. Se
 * abre en http://localhost:PUERTO/visor-prueba.html y sirve para comprobar el
 * teclado, la rueda, el giro y el recorte sin tocar un expediente de verdad.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { VisorFotos } from '../components/VisorFotos';
import { EditorImagen } from '../components/EditorImagen';

const lienzo = (texto, color, w, h) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <rect width="100%" height="100%" fill="${color}"/>
        <g fill="#fff" font-family="sans-serif" font-weight="bold" text-anchor="middle">
          <text x="50%" y="48%" font-size="${Math.round(w / 8)}">${texto}</text>
          <text x="50%" y="62%" font-size="${Math.round(w / 22)}">${w}×${h}</text>
        </g>
        <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="#fff" stroke-width="6"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const FOTOS = [
    { id: 'caldera', label: 'Caldera actual (instalada)', nota: 'muy grande', src: lienzo('CALDERA', '#334155', 3200, 2400) },
    { id: 'a', label: 'Placa de características', nota: 'apaisada', src: lienzo('PLACA', '#1d4ed8', 1600, 900) },
    { id: 'b', label: 'Fachada principal', nota: 'vertical', src: lienzo('FACHADA', '#047857', 900, 1600) },
    { id: 'c', label: 'Unidad exterior', nota: 'cuadrada', src: lienzo('EXTERIOR', '#b45309', 1200, 1200) },
];

export function PruebaVisor() {
    const [i, setI] = useState(null);
    const [editar, setEditar] = useState(null);
    const [resultado, setResultado] = useState(null);
    // Como el Anexo Fotográfico: el visor y el editor se abren DENTRO de un modal
    // que se cierra con cualquier clic que le llegue. Si un clic del portal sube
    // por React hasta aquí, el contador lo canta (y el Anexo se cerraría).
    const [escapados, setEscapados] = useState(0);

    return (
        <div className="min-h-screen bg-[#0B0C0F] text-white p-8 space-y-6" onClick={() => setEscapados(n => n + 1)}>
            <p id="escapados" className="text-[11px] uppercase tracking-widest text-white/40">Clics que suben al modal de debajo: <b className="text-white">{escapados}</b></p>
            <h1 className="text-xl font-black uppercase tracking-widest">Prueba del visor y del editor</h1>
            <div className="flex flex-wrap gap-4">
                {FOTOS.map((f, n) => (
                    <button key={f.id} onClick={() => setI(n)}
                        className="w-40 h-40 rounded-xl overflow-hidden border-2 border-white/10 hover:border-brand transition-all">
                        <img src={f.src} alt="" className="w-full h-full object-cover" />
                    </button>
                ))}
            </div>
            <div className="flex gap-3">
                <button onClick={() => setEditar(FOTOS[0])} className="px-5 py-2.5 rounded-xl bg-brand text-black font-black uppercase text-[11px] tracking-widest">Abrir editor (píxeles)</button>
                <button onClick={() => setEditar({ ...FOTOS[1], modo: 'recuadro' })} className="px-5 py-2.5 rounded-xl bg-white/10 font-black uppercase text-[11px] tracking-widest">Abrir editor (recuadro)</button>
            </div>
            {resultado && (
                <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-widest text-white/40">Resultado del editor</p>
                    {typeof resultado === 'string'
                        ? <img src={resultado} alt="" className="max-h-80 rounded-xl border border-white/10" />
                        : <pre className="text-[11px] text-emerald-300">{JSON.stringify(resultado, null, 2)}</pre>}
                </div>
            )}

            {i !== null && (
                <VisorFotos
                    fotos={FOTOS} indice={i} onIndice={setI} onCerrar={() => setI(null)}
                    onEditar={(f) => { setI(null); setEditar(f); }}
                    acciones={(f) => (
                        <button className="h-11 px-4 rounded-xl bg-red-500/15 text-red-300 text-[11px] font-black uppercase tracking-widest">
                            Acción de ejemplo · {f.id}
                        </button>
                    )}
                />
            )}
            {editar && (
                <EditorImagen
                    src={editar.src} titulo={editar.label} modo={editar.modo || 'pixeles'}
                    onAplicar={(r) => { setResultado(r); setEditar(null); }}
                    onCancelar={() => setEditar(null)}
                    onQuitarFoto={() => setEditar(null)}
                />
            )}
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<PruebaVisor />);
