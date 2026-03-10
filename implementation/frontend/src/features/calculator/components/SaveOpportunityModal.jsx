import React, { useState } from 'react';
import axios from 'axios';
import { Button, Input, Label } from './UIComponents';

export function SaveOpportunityModal({ isOpen, onClose, onSaveSuccess, inputs, result }) {
    const [referenciaCliente, setReferenciaCliente] = useState(inputs.referenciaCliente || '');

    // Sincronizar siempre que cambie el valor externo para asegurar que se muestra el dato correcto
    React.useEffect(() => {
        setReferenciaCliente(inputs.referenciaCliente || '');
    }, [inputs.referenciaCliente, isOpen]); // isOpen para forzar recarga al abrir
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [savedOportunidadId, setSavedOportunidadId] = useState(null);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [nota, setNota] = useState('');

    if (!isOpen) return null;

    const executeSave = async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = {
                id_oportunidad: inputs.id_oportunidad, // Pasar el ID para no generar errores 500 o inserciones dobles al editar
                ref_catastral: inputs.rc || 'MANUAL',
                prescriptor: 'BROKERGY', // Se podría sacar del login/context en un futuro
                referencia_cliente: referenciaCliente,
                demanda_calefaccion: result?.q_net || 0,
                datos_calculo: {
                    inputs,
                    result
                },
                nota: nota.trim() || null
            };

            const response = await axios.post('/api/oportunidades', payload);
            setSavedOportunidadId(response.data.id_oportunidad);
            setSuccess(true);
            setShowConfirmation(false);
            if (onSaveSuccess) onSaveSuccess(referenciaCliente);
        } catch (err) {
            console.error('Error guardando oportunidad:', err);
            setError('No se pudo guardar la oportunidad. Inténtalo de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveInit = async () => {
        if (!inputs.rc || inputs.rc === 'MANUAL') {
            return executeSave();
        }

        setLoading(true);
        setError(null);
        try {
            // Check if it exists
            await axios.get(`/api/oportunidades/${inputs.rc}`);
            // If it succeeds (200 OK), it means it exists
            setShowConfirmation(true);
            setLoading(false);
        } catch (err) {
            // If 404, it doesn't exist, just save directly
            if (err.response?.status === 404) {
                executeSave();
            } else {
                setError('Error al verificar existencia de la oportunidad.');
                setLoading(false);
            }
        }
    };

    const handleClose = () => {
        // Limpiamos el estado al cerrar para que esté limpio la próxima vez
        setTimeout(() => {
            // Solo limpiamos si ha habido éxito, para que si cancelas se mantenga lo escrito
            if (success) {
                setReferenciaCliente('');
                setNota('');
            }
            setSuccess(false);
            setSavedOportunidadId(null);
            setError(null);
            setShowConfirmation(false);
        }, 300);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in" onClick={handleClose}>
            <div
                className="bg-slate-900 rounded-2xl max-w-md w-full p-6 sm:p-8 border border-slate-700 shadow-2xl relative overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[80px] pointer-events-none"></div>

                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="relative z-10">
                    {!success && !showConfirmation && (
                        <>
                            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                                Guardar Oportunidad
                            </h3>
                            <p className="text-sm text-slate-400 mb-6">
                                Asigna una referencia de cliente para identificar este cálculo más adelante en tu Panel de Control.
                            </p>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <Label htmlFor="refClient">Referencia de Cliente</Label>
                                    <Input
                                        id="refClient"
                                        placeholder="Ej: Cliente Martínez, Proyecto Centro..."
                                        value={referenciaCliente}
                                        onChange={(e) => setReferenciaCliente(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <Label htmlFor="nota">Nota inicial (opcional)</Label>
                                    <textarea
                                        id="nota"
                                        rows="3"
                                        placeholder="Añade una nota que aparecerá en el historial de la oportunidad..."
                                        className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all resize-none text-sm"
                                        value={nota}
                                        onChange={(e) => setNota(e.target.value)}
                                    />
                                </div>

                                <div className="p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center text-sm">
                                    <span className="text-slate-400">Ref. Catastral</span>
                                    <span className="text-white font-mono">{inputs.rc || 'MANUAL'}</span>
                                </div>
                                <div className="p-3 bg-white/5 rounded-lg border border-white/10 flex justify-between items-center text-sm">
                                    <span className="text-slate-400">Demanda Estimada</span>
                                    <span className="text-white font-mono">{result?.q_net ? result.q_net.toFixed(2) : 0} kWh/m²</span>
                                </div>
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-3 mt-8">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={handleClose}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-500/20 shadow-lg"
                                    variant="primary" // Lo sobreescribimos con className si hace falta
                                    onClick={handleSaveInit}
                                    disabled={loading}
                                >
                                    {loading ? 'Guardando...' : 'Guardar Datos'}
                                </Button>
                            </div>
                        </>
                    )}

                    {showConfirmation && !success && (
                        <div className="text-center py-2 animate-fade-in">
                            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
                                <span className="text-3xl">⚠️</span>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">RC ya existente</h3>
                            <p className="text-slate-400 mb-6 text-sm">
                                Ya existe una oportunidad guardada con la referencia catastral <strong className="text-white">{inputs.rc}</strong>. <br /><br />
                                Si continúas, los datos actuales <strong className="text-amber-400">se sobrescribirán por completo</strong>. ¿Estás seguro de que deseas guardar y sobrescribir?
                            </p>

                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-3 mt-8">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => setShowConfirmation(false)}
                                    disabled={loading}
                                >
                                    Atrás
                                </Button>
                                <Button
                                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20 shadow-lg"
                                    variant="primary"
                                    onClick={executeSave}
                                    disabled={loading}
                                >
                                    {loading ? 'Guardando...' : 'Sí, Sobrescribir'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-white mb-2">¡Oportunidad Guardada!</h3>
                            <p className="text-slate-400 mb-6">
                                Este proyecto se ha registrado y está disponible en tu panel de administrador.
                            </p>
                            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-8 inline-block">
                                <p className="text-xs text-emerald-400/80 uppercase tracking-widest font-bold mb-1">ID Generado</p>
                                <p className="text-xl font-mono font-black text-emerald-400">{savedOportunidadId}</p>
                            </div>

                            <Button className="w-full bg-slate-800 hover:bg-slate-700 text-white" onClick={handleClose}>
                                Cerrar Ventana
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
