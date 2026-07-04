import React from 'react';

/**
 * ComparativaCeeModal — Popup cara al cliente (admin) que muestra la comparativa de ayuda
 * "Con tu CEE aportado" vs "Con un CEE nuevo BROKERGY". Sirve de previsualización de la
 * sección que se integrará en el PDF de propuesta.
 *
 * Props:
 *   isOpen, onClose
 *   comparison  → objeto de computeCeeComparison(inputs): { irpf, conCee, ceeNuevo }
 *   clienteNombre?  → para el encabezado
 *   onIncluirEnPropuesta?  → (opcional) callback para abrir/lanzar la propuesta con esta sección
 */

const BRAND = '#FFA000';
const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const kwh = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Number(n) || 0)} kWh/año`;

export default function ComparativaCeeModal({ isOpen, onClose, comparison, clienteNombre, onIncluirEnPropuesta }) {
  if (!isOpen) return null;

  if (!comparison) {
    return (
      <Overlay onClose={onClose}>
        <div className="p-8 text-center">
          <p className="text-slate-600">No se ha podido calcular la comparativa. Comprueba que el CEE aportado tiene demanda de calefacción y que la simulación está completa.</p>
          <button onClick={onClose} className="mt-6 px-6 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-sm">Cerrar</button>
        </div>
      </Overlay>
    );
  }

  const { conCee, ceeNuevo, irpf } = comparison;
  const mejor = ceeNuevo.total >= conCee.total ? 'ceeNuevo' : 'conCee';
  const diff = Math.abs(ceeNuevo.cae - conCee.cae);

  const Row = ({ label, a, b, strong, aHint, bHint }) => (
    <div className={`grid grid-cols-[1.4fr_1fr_1fr] items-center px-5 ${strong ? 'py-4 bg-slate-50' : 'py-3'} border-t border-slate-100`}>
      <div className={`text-slate-600 ${strong ? 'font-black text-slate-900' : ''}`}>{label}</div>
      <div className="text-right">
        <div className={`${strong ? 'text-xl font-black' : 'font-bold'} ${mejor === 'conCee' && strong ? 'text-amber-600' : 'text-slate-800'}`}>{a}</div>
        {aHint && <div className="text-[10px] text-slate-400">{aHint}</div>}
      </div>
      <div className="text-right">
        <div className={`${strong ? 'text-xl font-black' : 'font-bold'} ${mejor === 'ceeNuevo' && strong ? 'text-amber-600' : 'text-slate-800'}`}>{b}</div>
        {bHint && <div className="text-[10px] text-slate-400">{bHint}</div>}
      </div>
    </div>
  );

  return (
    <Overlay onClose={onClose}>
      {/* Cabecera */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100">
        <div>
          <div className="text-lg font-black text-slate-900">Comparativa de ayudas</div>
          <div className="text-xs text-slate-500">{clienteNombre ? `Para ${clienteNombre} · ` : ''}Con tu CEE vs. un CEE nuevo BROKERGY</div>
        </div>
        <div className="text-xl font-black tracking-tight"><span className="text-slate-900">BROKER</span><span style={{ color: BRAND }}>GY</span></div>
      </div>

      {/* Tabla */}
      <div className="p-6">
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] px-5 py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-widest">
            <div />
            <div className="text-right">Con tu CEE</div>
            <div className="text-right">CEE nuevo BROKERGY</div>
          </div>
          <Row label="Bono Energético CAE" a={eur(conCee.cae)} b={eur(ceeNuevo.cae)}
               aHint={kwh(conCee.ahorroKwh)} bHint={kwh(ceeNuevo.ahorroKwh)} />
          <Row label="Deducción IRPF (rehabilitación)" a={eur(irpf)} b={eur(irpf)} aHint="misma en ambas" bHint="misma en ambas" />
          <Row label="Total de ayudas" a={eur(conCee.total)} b={eur(ceeNuevo.total)} strong />
        </div>

        {diff >= 1 && (
          <div className="mt-3 text-sm text-slate-600 text-center">
            {mejor === 'ceeNuevo'
              ? <>Con un <b>CEE nuevo BROKERGY</b> el bono sería <b className="text-emerald-600">{eur(diff)}</b> mayor.</>
              : <>Con <b>tu CEE</b> el bono sería <b className="text-emerald-600">{eur(diff)}</b> mayor.</>}
          </div>
        )}

        {/* Reglas del juego (BORRADOR — a revisar por Fran) */}
        <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-200 p-4">
          <div className="text-xs font-black uppercase tracking-widest text-amber-700 mb-2">Las reglas del juego</div>
          <p className="text-sm text-slate-700 leading-relaxed">
            El <b>Bono Energético CAE</b> se calcula sobre el ahorro de energía que refleja el
            Certificado de Eficiencia Energética <b>inicial</b>. Con el CEE que nos aportas partimos
            de sus valores. Si emitimos un <b>CEE inicial nuevo</b> antes de la obra, reflejamos el
            estado real de partida de tu vivienda, lo que puede traducirse en un mayor ahorro
            certificado y, por tanto, un mayor bono. La <b>deducción del IRPF</b> por rehabilitación
            es la misma en ambos casos. <b>Tú eliges</b> qué opción usar.
          </p>
        </div>
      </div>

      {/* Pie */}
      <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-400">Esta comparativa se integrará en el PDF de propuesta.</span>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm">Cerrar</button>
          {onIncluirEnPropuesta && (
            <button
              onClick={() => onIncluirEnPropuesta(comparison)}
              className="px-6 py-2.5 rounded-xl font-bold text-black text-sm"
              style={{ backgroundColor: BRAND }}
            >
              Incluir en la propuesta →
            </button>
          )}
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
