/**
 * SubirDocsReformaView — página pública del enlace único de documentación.
 * URL: /subir-docs/:uuid?token=...
 *
 * Envoltorio de página: aporta el chrome (fondo, logo, footer) y delega toda la
 * lógica en <DocsManager> en modo token (subir/ver/borrar, sin validación).
 */

import React from 'react';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import { DocsManager } from '../../docs/DocsManager';

export function SubirDocsReformaView({ uuid, token }) {
    return (
        <div className="min-h-screen bg-slate-950 text-white relative overflow-x-hidden px-4 py-6 md:py-10">
            <DynamicNetworkBackground />
            <div className="relative z-10 max-w-2xl mx-auto">
                <header className="text-center mb-6">
                    <div className="text-2xl md:text-3xl font-black tracking-tight">
                        <span className="text-white">BROKER</span><span className="text-amber-400">GY</span>
                    </div>
                    <p className="text-white/45 text-xs mt-3">Sube tu documentación desde el móvil: al pulsar te dejará usar la <strong className="text-white/70">cámara</strong> o elegir de la <strong className="text-white/70">galería</strong>.</p>
                </header>

                <DocsManager mode="token" idOrUuid={uuid} token={token} />

                <div className="mt-6 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/45 leading-relaxed text-center">
                    Puedes volver a este enlace cuando quieras. Un técnico de Brokergy revisará cada foto: si alguna no se ve bien, te avisaremos para repetirla.
                </div>

                <footer className="mt-10 pt-6 border-t border-white/5 text-center">
                    <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">Brokergy · Ingeniería Energética</p>
                </footer>
            </div>
        </div>
    );
}

export default SubirDocsReformaView;
