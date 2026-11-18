/**
 * Banco de pruebas del COMISIONISTA (solo en desarrollo).
 *
 * No entra en el build (`vite build` solo toma index.html). Se abre en
 * http://localhost:PUERTO/comisionista-prueba.html y pinta, SIN sesión y SIN tocar
 * la BD, las piezas del comisionista tal y como salen en la app:
 *   · el chip/selector de una fila del listado de oportunidades (ADMIN y TRABAJADOR);
 *   · la celda de la columna «Comisionista» del listado de expedientes.
 * TODA la API va simulada en memoria (`/api/comisionistas…`): local escribe en
 * PRODUCCIÓN y aquí no sale nada. `?rol=TRABAJADOR` para ver sin importes.
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import '../index.css';
import { ComisionistaSelector } from '../features/comisionistas/ComisionistaSelector';
import { COLUMNAS_POR_KEY } from '../features/expedientes/logic/expedientesColumnas';

const ROL = (new URLSearchParams(location.search).get('rol') || 'ADMIN').toUpperCase();
const ADMIN = ROL === 'ADMIN';
const SH = '153578c1-eea5-4b73-8325-dfdf8026d5bc';

const PERSONAS = [
    { id: 'c-juanma', nombre: 'JUANMA', cargo: 'INGENIERO', tlf: '600000000', prescriptor_id: SH, activo: true, comision_tipo: 'eur', comision_valor: 0 },
];
const OPS = {
    '26RES060_OP308': { comisionista_id: 'c-juanma', comisionista_importe: null },
    '26RES060_OP25': { comisionista_id: null, comisionista_importe: null },
};

const responder = (config, data, status = 200) => () => Promise.resolve({ data, status, statusText: 'OK', headers: {}, config });

axios.interceptors.request.use((config) => {
    const url = String(config.url || '');
    const m = String(config.method || 'get').toLowerCase();
    const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data || {});
    if (url === '/api/comisionistas' && m === 'get') {
        const lista = PERSONAS.map(p => {
            const obras = Object.values(OPS).filter(o => o.comisionista_id === p.id).length;
            const { comision_tipo, comision_valor, ...resto } = p;
            return ADMIN ? { ...p, obras } : { ...resto, obras };
        });
        config.adapter = responder(config, lista);
    } else if (url === '/api/comisionistas' && m === 'post') {
        const nueva = { id: `c-${Date.now()}`, nombre: String(body.nombre || '').toUpperCase(), tlf: body.tlf, cargo: (body.cargo || '').toUpperCase(), prescriptor_id: body.prescriptor_id || null, activo: true };
        PERSONAS.push(nueva);
        config.adapter = responder(config, nueva, 201);
    } else if (url.startsWith('/api/comisionistas/oportunidad/')) {
        const id = decodeURIComponent(url.split('/').pop());
        const op = OPS[id] || (OPS[id] = { comisionista_id: null, comisionista_importe: null });
        if (m === 'put') {
            if ('comisionista_id' in body) {
                if (body.comisionista_id !== op.comisionista_id) op.comisionista_importe = null;
                op.comisionista_id = body.comisionista_id || null;
            }
            if (ADMIN && 'comisionista_importe' in body) {
                const v = body.comisionista_importe;
                op.comisionista_importe = v == null || v === '' ? null : Number(String(v).replace(',', '.'));
            }
        }
        const out = ADMIN ? op : { comisionista_id: op.comisionista_id };
        config.adapter = responder(config, { id_oportunidad: id, ...out });
    } else if (m !== 'get') {
        console.warn('[banco] BLOQUEADO', m.toUpperCase(), url);
        config.adapter = () => Promise.reject(Object.assign(new Error('Bloqueado'), { response: { status: 418, data: { error: 'Bloqueado en el banco de pruebas' } }, config }));
    }
    return config;
});

const PRESCRIPTORES = [{ id_empresa: SH, acronimo: 'SH', razon_social: 'LOS SIETE HERMANOS DEL BONILLO, SL', tipo_empresa: 'DISTRIBUIDOR' }];

function Fila({ id, ref_ }) {
    const [op, setOp] = useState(OPS[id]);
    return (
        <tr className="border-b border-white/[0.06]">
            <td className="p-3 text-[11px] font-mono text-brand">{id}</td>
            <td className="p-3 text-[11px] text-white/70 uppercase">{ref_}</td>
            <td className="p-3 w-[180px]">
                <div className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-black/30 text-[10px] font-bold text-white uppercase">SH</div>
                <div className="mt-1.5">
                    <ComisionistaSelector
                        idOportunidad={id}
                        value={op.comisionista_id}
                        importe={op.comisionista_importe}
                        prescriptorId={SH}
                        prescriptores={PRESCRIPTORES}
                        isAdmin={ADMIN}
                        onSaved={next => setOp(o => ({ ...o, ...next }))}
                    />
                </div>
            </td>
        </tr>
    );
}

function Banco() {
    const col = COLUMNAS_POR_KEY.comisionista;
    const exp = { oportunidades: { comisionista_id: 'c-juanma', comisionista_nombre: 'JUANMA', comisionista_importe: ADMIN ? 300 : undefined } };
    return (
        <div className="min-h-screen bg-bkg-deep p-6 text-white">
            <h1 className="text-lg font-black uppercase tracking-tight mb-1">Comisionista · banco de pruebas</h1>
            <p className="text-[11px] text-white/40 mb-5">Rol simulado: <b>{ROL}</b> · API simulada, nada se escribe.</p>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Listado de oportunidades · columna Prescriptor</h2>
            <table className="w-full max-w-[640px] rounded-xl bg-bkg-surface/60 mb-8"><tbody>
                <Fila id="26RES060_OP308" ref_="VIVIENDA FRANCIS" />
                <Fila id="26RES060_OP25" ref_="JUANMA SH -- COMUNIDAD VALENCIANA 12, MUNERA" />
            </tbody></table>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Listado de expedientes · celda «{col.label}»</h2>
            <div id="celda-exp" className="w-[180px] p-3 rounded-xl bg-bkg-surface/60">{col.render(exp, { rol: ROL })}</div>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Banco />);
