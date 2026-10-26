// ─── El móvil: marco, isla y barra de estado; la pantalla va a 390 px lógicos ─
// La pantalla se pinta a la medida real de un móvil (390 × 812, la de las
// capturas de la app) y se escala entera: el texto sale nítido y en proporción.
export const PANT_W = 390;
export const PANT_H = 812;
export const ESCALA = 1.5;
const BISEL = 16;
export const MOVIL_W = PANT_W * ESCALA + BISEL * 2;
export const MOVIL_H = PANT_H * ESCALA + BISEL * 2;

function BarraEstado() {
    return (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 44, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 28px 0 34px', font: "600 15px/1 'Inter',sans-serif", color: '#141111', pointerEvents: 'none' }}>
            <span>9:41</span>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <svg width="18" height="11" viewBox="0 0 18 11"><g fill="#141111"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="6" rx="1" /><rect x="10" y="2.5" width="3" height="8.5" rx="1" /><rect x="15" y="0" width="3" height="11" rx="1" /></g></svg>
                <svg width="16" height="11" viewBox="0 0 16 11"><path d="M8 2.2c2.3 0 4.4.9 5.9 2.4l1.1-1.1A9.9 9.9 0 0 0 8 .6 9.9 9.9 0 0 0 1 3.5l1.1 1.1A8.3 8.3 0 0 1 8 2.2zm0 3.2c1.4 0 2.7.5 3.6 1.4l1.1-1.1A6.6 6.6 0 0 0 8 3.8a6.6 6.6 0 0 0-4.7 1.9l1.1 1.1c.9-.9 2.2-1.4 3.6-1.4zM8 8.6l1.9 1.9L8 12.4 6.1 10.5z" fill="#141111" /></svg>
                <svg width="26" height="12" viewBox="0 0 26 12"><rect x=".5" y=".5" width="22" height="11" rx="3.5" fill="none" stroke="#141111" opacity=".4" /><rect x="2" y="2" width="17" height="8" rx="2" fill="#141111" /><rect x="23.5" y="4" width="1.8" height="4" rx=".9" fill="#141111" opacity=".4" /></svg>
            </span>
        </div>
    );
}

export function Movil({ children, style }) {
    return (
        <div style={{ position: 'absolute', width: MOVIL_W, height: MOVIL_H, borderRadius: 78, background: '#141111', padding: BISEL,
            boxShadow: '0 0 0 2px #3a3a3a inset, 0 2px 0 3px rgba(255,255,255,.06), 0 60px 120px -40px rgba(20,17,17,.55), 0 30px 60px -30px rgba(20,17,17,.35)', ...style }}>
            <div style={{ position: 'relative', width: PANT_W * ESCALA, height: PANT_H * ESCALA, borderRadius: 64, overflow: 'hidden', background: '#faf9f7' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: PANT_W, height: PANT_H, transform: `scale(${ESCALA})`, transformOrigin: '0 0' }}>
                    {children}
                    <BarraEstado />
                    <div style={{ position: 'absolute', left: '50%', top: 11, width: 112, height: 32, marginLeft: -56, borderRadius: 999, background: '#000', zIndex: 41 }} />
                    <div style={{ position: 'absolute', left: '50%', bottom: 8, width: 134, height: 5, marginLeft: -67, borderRadius: 999, background: 'rgba(20,17,17,.85)', zIndex: 41 }} />
                </div>
            </div>
        </div>
    );
}
