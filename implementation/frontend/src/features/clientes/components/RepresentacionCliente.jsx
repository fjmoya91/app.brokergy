import React from 'react';
import { FieldInput, Input } from '../../../components/DireccionEdit';
import { JustificanteUploader } from '../../expedientes/components/JustificanteUploader';
import { representacionDe, TIPOS_REPRESENTACION } from '../../expedientes/logic/representacion';

// ─── REPRESENTACIÓN del titular, en la ficha del cliente ─────────────────────
// Quién firma por él y con qué título (apartado 3 del Anexo I). Fuente única con
// los documentos: logic/representacion.js.
//
//  · EMPRESA: siempre la representa su representante legal.
//  · PARTICULAR: solo si se marca «Está representado» (un poder a favor del
//    cónyuge, por ejemplo). Sin marcar, firma él y el Anexo I va sin casillas.
//
// La copia del documento solo se puede subir con la ficha ya creada (`clienteId`):
// se guarda en la carpeta de Drive de su expediente y va al paquete de la actuación.
//
// `form` / `onChange(patch)`: el estado del formulario que la contiene.
export function RepresentacionCliente({ form, onChange, esEmpresa, clienteId = null, expedienteId = null, onDocSubido }) {
    const representado = !!form.representado;
    const hay = esEmpresa || representado;
    const rep = representacionDe({ ...form, es_empresa: esEmpresa });
    const tipo = (form.representacion_tipo || '').toUpperCase();

    const boton = (valor) => (
        <button key={valor} type="button" onClick={() => onChange({ representacion_tipo: tipo === valor ? '' : valor })}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${tipo === valor ? 'bg-brand text-bkg-deep border-brand' : 'border-white/10 text-white/40 hover:text-white hover:border-white/20'}`}>
            {TIPOS_REPRESENTACION[valor]}
        </button>
    );

    return (
        <div className="sm:col-span-2 animate-fade-in p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">
                    {esEmpresa ? 'Representante legal' : 'Representación'}
                </p>
                {!esEmpresa && (
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="accent-brand" checked={representado}
                            onChange={e => onChange({ representado: e.target.checked })} />
                        <span className="text-[11px] font-bold text-white/60">Está representado (firma otra persona con un poder)</span>
                    </label>
                )}
            </div>

            {!hay && (
                <p className="text-[10px] text-white/25">
                    Firma el titular en su nombre: el apartado 3 del Anexo I va en blanco y sin ninguna casilla marcada.
                </p>
            )}

            {hay && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <FieldInput label="Nombre">
                            <Input placeholder="MARINA" uppercase value={form.representante_nombre || ''}
                                onChange={e => onChange({ representante_nombre: e.target.value })} />
                        </FieldInput>
                        <FieldInput label="Apellidos">
                            <Input placeholder="CARRASCO GARCÍA" uppercase value={form.representante_apellidos || ''}
                                onChange={e => onChange({ representante_apellidos: e.target.value })} />
                        </FieldInput>
                        <FieldInput label="DNI / NIE">
                            <Input placeholder="12345678A" uppercase value={form.representante_dni || ''}
                                onChange={e => onChange({ representante_dni: e.target.value })} />
                        </FieldInput>
                    </div>

                    <div>
                        <p className="block text-[10px] uppercase tracking-widest font-black text-white/40 mb-1.5">Acredita la representación con</p>
                        <div className="flex gap-2">{['NOTARIAL', 'OTRO'].map(boton)}</div>
                    </div>

                    {tipo === 'NOTARIAL' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FieldInput label="Fecha del poder">
                                <Input type="date" value={(form.representacion_fecha || '').slice(0, 10)}
                                    onChange={e => onChange({ representacion_fecha: e.target.value })} />
                            </FieldInput>
                            <FieldInput label="Nº de protocolo">
                                <Input placeholder="1.234" value={form.representacion_protocolo || ''}
                                    onChange={e => onChange({ representacion_protocolo: e.target.value })} />
                            </FieldInput>
                        </div>
                    )}
                    {tipo === 'OTRO' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                                <FieldInput label="Título del documento">
                                    <Input placeholder={esEmpresa ? 'ESCRITURA DE NOMBRAMIENTO DE ADMINISTRADOR' : 'AUTORIZACIÓN DE REPRESENTACIÓN'} uppercase
                                        value={form.representacion_documento || ''}
                                        onChange={e => onChange({ representacion_documento: e.target.value })} />
                                </FieldInput>
                            </div>
                            <FieldInput label="Fecha de formalización">
                                <Input type="date" value={(form.representacion_fecha || '').slice(0, 10)}
                                    onChange={e => onChange({ representacion_fecha: e.target.value })} />
                            </FieldInput>
                        </div>
                    )}

                    {clienteId ? (
                        <JustificanteUploader variant="slot" label="Copia del poder / documento"
                            textos={{ tengo: 'Tenemos la copia del poder', falta: 'Falta la copia del poder', subiendo: 'Anexando…', error: 'No se pudo subir el documento.' }}
                            endpoint={`/api/clientes/${clienteId}/representacion`}
                            extraBody={expedienteId ? { expediente: expedienteId } : null}
                            currentLink={form.representacion_doc_link || null}
                            onUploaded={(link) => { onChange({ representacion_doc_link: link }); if (onDocSubido) onDocSubido(link); }} />
                    ) : (
                        <p className="text-[10px] text-white/30">La copia del poder se sube desde la ficha, una vez creado el cliente.</p>
                    )}

                    {rep.falta.length > 0 && (
                        <p className="text-[10px] text-amber-300/80">
                            Para el Anexo I y el expediente que se presenta falta: {rep.falta.join(' · ')}.
                        </p>
                    )}
                    <p className="text-[10px] text-white/25">
                        {esEmpresa ? 'Firma los anexos en nombre de la sociedad.' : 'Firma los anexos en nombre del titular.'} Sale en el apartado 3 del Anexo I y en el Convenio de Cesión; la copia va en el expediente que se presenta.
                    </p>
                </>
            )}
        </div>
    );
}

export default RepresentacionCliente;
