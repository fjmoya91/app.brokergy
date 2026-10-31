/**
 * Banco de pruebas del ASISTENTE de la envolvente cuando el `.cex` no sale
 * (solo en desarrollo). Sin backend, sin Claude y sin Drive: el motor, el visto
 * bueno y Claude están simulados aquí. Se abre en
 * http://localhost:PUERTO/asistente-prueba.html.
 */
import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import '../index.css';
import { AsistenteEnvolvente } from '../features/cee-envolvente/components/AsistenteEnvolvente';
import { transformarMuros } from '../features/cee-envolvente/logic/asistenteEnvolvente';
import { arreglosParaGenerar } from '../features/cee-envolvente/logic/arreglarGenerar';
import { faltaParaGenerar } from '../features/cee-envolvente/logic/pendientes';
import { necesitaRumbo, rumbosDe, nombreDe } from '../features/cee-envolvente/logic/usePlanoEnvolvente';

// Claude, simulado: lo que devolvería la ruta (operaciones ya limpias).
axios.defaults.adapter = async (config) => {
    const { texto = '' } = JSON.parse(config.data || '{}');
    await new Promise(r => setTimeout(r, 700));
    const data = /^Al generar el \.cex ha fallado/.test(texto)
        ? { entendido: 'El motor dice que a las placas les falta la potencia pico: eso no está en el plano.',
            seguro: true, operaciones: [],
            pregunta: 'Pon la potencia pico (kWp) de las placas en Instalaciones y vuelve a generar.' }
        : /pvc/i.test(texto)
            ? { entendido: 'Las ventanas de FBE1 son de PVC.', seguro: true, pregunta: '',
                operaciones: [{ op: 'cambiar_hueco', hueco: 'V1', marco: 'PVC' }] }
            : { entendido: 'No he visto nada que cambiar.', seguro: true, pregunta: '', operaciones: [] };
    return { data: { ok: true, modelo: 'claude-haiku-5-5', coste_usd: 0.0002, ...data },
             status: 200, statusText: 'OK', headers: {}, config };
};

const hueco = (uid, nombre) => ({ uid, nombre, tipo: 'ventana', ancho: 1.2, alto: 1.2, estado: 'medido' });
const MUROS = Object.fromEntries([
    { id: 'FBE1', tipo: 'FACHADA', orientacion: 'N', largo: 12, planta: 'pb', svg: [[0, 0], [12, 0]],
      huecos: [hueco('u1', 'V1')] },
    { id: 'FBE2', tipo: 'FACHADA', orientacion: 'E', largo: 9, planta: 'pb', svg: [[12, 0], [12, 9]], huecos: [] },
    { id: 'PVBS1', tipo: 'PARTICION_VERTICAL', tipo_manual: 'FACHADA', largo: 9, planta: 'pb',
      svg: [[5, 9], [12, 9]], huecos: [] },
    { id: 'PVBO1', tipo: 'PARTICION_VERTICAL', tipo_manual: 'FACHADA', largo: 4, planta: 'pb',
      svg: [[5, 5], [5, 9]], huecos: [] },
    { id: 'MBE1', tipo: 'MEDIANERA', largo: 9, planta: 'pb', svg: [[0, 9], [0, 0]], huecos: [] },
].map(m => [m.id, m]));
const PLANTAS = [{ id: 'pb', nivel: 0, nombre: 'Planta baja' }];

function Banco() {
    const [muros, setMuros] = useState(MUROS);
    const [incidencia, setIncidencia] = useState(null);
    const [log, setLog] = useState([]);
    const [sinPistas, setSinPistas] = useState(false);
    const intento = useRef(0);
    const apunta = (t) => setLog(l => [`${new Date().toLocaleTimeString()} · ${t}`, ...l].slice(0, 12));

    // El motor, simulado: para con la primera fachada sin rumbo (como generar_cex.py).
    async function generar(objetivo, conMuros = muros) {
        await new Promise(r => setTimeout(r, 600));
        const sin = Object.values(conMuros).filter(necesitaRumbo);
        if (sin.length || sinPistas) {
            const error = sin.length
                ? `${nombreDe(sin[0])} se escribe como FACHADA y no tiene orientacion. Las particiones y las paredes dibujadas nacen sin rumbo, porque no salen de ningun poligono: dile en el panel de la pared hacia donde da.`
                : '«Placas»: falta la potencia pico (kWp) de las placas';
            const falta = faltaParaGenerar({ muros: conMuros, lucernarios: {}, plantas: PLANTAS, nombreDe,
                                             entrada: 'FBE1', ventanas: true, pestanas: [], necesitaRumbo });
            const n = intento.current; intento.current = n + 1;
            setIncidencia({ id: Date.now(), error, fase: 'inicial', objetivo, intento: n,
                            ...(sinPistas ? { preguntas: [], otros: [] } : arreglosParaGenerar({ falta, muros: conMuros, nombreDe, rumbosDe })) });
            apunta(`motor: 422 (${objetivo}) — ${error.slice(0, 60)}…`);
            return false;
        }
        intento.current = 0;
        apunta(`motor: .cex escrito (${objetivo})`);
        return true;
    }

    async function onAplicar(pasos, { generar: gen, listo } = {}) {
        const nuevos = pasos.length ? transformarMuros(muros, pasos) : muros;
        if (pasos.length) { setMuros(nuevos); apunta(`aplicado: ${pasos.map(p => p.texto).join(' · ')}`); }
        if (listo) {
            const ok = await generar('listo', nuevos);
            if (!ok) return { medido: null, listo: { tono: 'aviso', noGenerado: true, texto: 'No se ha podido generar el .cex: el visto bueno no se ha dado.' } };
            apunta('visto bueno: CALCULANDO (PC)');
            return { medido: null, listo: { tono: 'ok', texto: 'Visto bueno dado. Se está calculando con CE3X (unos minutos): al terminar se le entrega al certificador, listo para firmar.' } };
        }
        if (gen) setTimeout(() => generar('generar', nuevos), 0);
        return { medido: null };
    }

    const contexto = () => ({ plantas: [{ ...PLANTAS[0], muros: Object.values(muros) }], muros, zonas: [], t: null,
                              catalogo: [], elegidas: null, fase: 'inicial', defecto: null, sel: null });
    return (
        <div className="min-h-screen bg-bkg-deep p-6 text-white">
            <h1 className="text-lg font-black">Banco del asistente: el .cex no sale</h1>
            <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-black text-black" onClick={() => generar('generar')}>Generar .cex</button>
                <button className="rounded-lg border border-emerald-400/50 px-3 py-1.5 text-[12px] font-bold text-emerald-300" onClick={() => generar('listo')}>✓ Visto bueno</button>
                <button className="rounded-lg border border-white/20 px-3 py-1.5 text-[12px]" onClick={() => { setMuros(MUROS); intento.current = 0; apunta('plano como al principio'); }}>Reiniciar plano</button>
                <label className="flex items-center gap-1.5 text-[12px] text-white/70">
                    <input type="checkbox" checked={sinPistas} onChange={e => setSinPistas(e.target.checked)} /> motor con un fallo que el plano no explica
                </label>
            </div>
            <table className="mt-4 text-[12px] text-white/80">
                <tbody>{Object.values(muros).map(m => (
                    <tr key={m.id}><td className="pr-4 font-bold">{m.id}</td><td className="pr-4">{m.tipo_manual || m.tipo}</td>
                        <td>{m.orientacion_manual || m.orientacion || '— sin rumbo'}</td></tr>
                ))}</tbody>
            </table>
            <ul className="mt-4 space-y-1 text-[11px] text-white/55">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <AsistenteEnvolvente urlAsistente="/mock/asistente" urlVoz="/mock/voz" contexto={contexto}
                                 onAplicar={onAplicar} onDeshacer={async () => { setMuros(MUROS); apunta('deshecho'); }}
                                 onIr={(it) => apunta(`ir a ${JSON.stringify(it.ir)}`)}
                                 incidencia={incidencia} puedeListo />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Banco />);
