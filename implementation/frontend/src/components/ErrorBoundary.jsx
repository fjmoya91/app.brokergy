import React from 'react';

/**
 * ErrorBoundary genérico. Captura errores en árbol descendiente, muestra UI de
 * fallback y permite al usuario recargar la página o cerrar el bloque.
 *
 * Uso:
 *   <ErrorBoundary fallback={<MiUiAlternativa/>} onClose={...}>
 *       <ComponentePotencialmenteRoto />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info?.componentStack);
    }

    reset = () => this.setState({ hasError: false, error: null });

    render() {
        if (!this.state.hasError) return this.props.children;

        if (this.props.fallback) return this.props.fallback;

        const errMsg = this.state.error?.message || String(this.state.error);
        return (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                <div className="bg-bkg-deep border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            </svg>
                        </div>
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Algo ha fallado</h4>
                    </div>
                    <p className="text-xs text-white/60 mb-2">No se ha podido renderizar este bloque. El equipo técnico ha sido notificado.</p>
                    <pre className="text-[10px] text-red-300/80 bg-black/30 p-2 rounded-lg overflow-auto max-h-32 mb-5 font-mono whitespace-pre-wrap">{errMsg}</pre>
                    <div className="flex gap-3">
                        {this.props.onClose && (
                            <button onClick={() => { this.reset(); this.props.onClose(); }} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-widest hover:text-white">
                                Cerrar
                            </button>
                        )}
                        <button onClick={this.reset} className="flex-1 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest">
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
