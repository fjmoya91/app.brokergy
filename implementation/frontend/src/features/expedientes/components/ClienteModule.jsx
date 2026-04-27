import React, { useState } from 'react';
import { ClienteDetailModal } from '../../clientes/components/ClienteDetailModal';

export function ClienteModule({ expediente }) {
    const [showModal, setShowModal] = useState(false);
    const cliente = expediente?.clientes;

    if (!cliente) {
        return (
            <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4">Cliente</h3>
                <p className="text-white/30 text-sm italic">Sin cliente vinculado.</p>
            </div>
        );
    }

    return (
        <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4">Cliente</h3>

            {/* Tarjeta resumen */}
            <div className="bg-bkg-surface/60 rounded-xl p-4 border border-white/[0.06] flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                    {/* Avatar inicial */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand/30 to-brand-700/30 border border-brand/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-brand font-black text-sm">
                            {(cliente.nombre_razon_social || '?').charAt(0).toUpperCase()}
                        </span>
                    </div>

                    <div className="min-w-0">
                        <p className="text-white font-bold truncate">
                            {cliente.nombre_razon_social}
                            {cliente.apellidos && <span className="text-white/70"> {cliente.apellidos}</span>}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {cliente.municipio && (
                                <span className="text-white/40 text-xs flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {cliente.municipio}{cliente.provincia && `, ${cliente.provincia}`}
                                </span>
                            )}
                            {(expediente?.oportunidades?.datos_calculo?.inputs?.direccion || expediente?.oportunidades?.datos_calculo?.inputs?.address) && (
                                <span className="text-white/40 text-xs flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-brand/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    {expediente.oportunidades.datos_calculo.inputs.direccion || expediente.oportunidades.datos_calculo.inputs.address}
                                </span>
                            )}
                            {cliente.tlf && (
                                <span className="text-white/40 text-xs flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {cliente.tlf}
                                </span>
                            )}
                            {cliente.email && (
                                <span className="text-white/40 text-xs flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    {cliente.email}
                                </span>
                            )}
                            {cliente.dni && (
                                <span className="text-white/30 text-xs font-mono">{cliente.dni}</span>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => setShowModal(true)}
                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-brand/30 text-brand text-xs font-bold hover:bg-brand/10 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Ver perfil
                </button>
            </div>

            {/* Modal de detalle del cliente (reutilizamos el existente) */}
            {showModal && (
                <ClienteDetailModal
                    isOpen={true}
                    clienteId={cliente.id_cliente}
                    onClose={() => setShowModal(false)}
                />
            )}
        </div>
    );
}
