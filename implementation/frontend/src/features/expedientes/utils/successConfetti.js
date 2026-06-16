import confetti from 'canvas-confetti';

// Lluvia de "papeles" de éxito — mismo efecto que al enviar/firmar Anexos, RITE y CIFO.
// Se usa en los popups de Notificar y Validar certificador para un envío homogéneo.
export function fireSuccessConfetti() {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const scalar = 3.6;
    let shapes;
    try { shapes = ['📄', '📃', '📑', '📋'].map(text => confetti.shapeFromText({ text, scalar })); } catch { shapes = undefined; }
    const burst = (x, delay = 0) => setTimeout(() => {
        confetti({
            particleCount: 22, spread: 65, startVelocity: 34, gravity: 0.8, decay: 0.92,
            ticks: 220, scalar, origin: { x, y: 0.5 }, zIndex: 10000, disableForReducedMotion: true,
            ...(shapes ? { shapes, flat: true } : { colors: ['#f2a640', '#34d399', '#fcd34d', '#ffffff'] }),
        });
    }, delay);
    burst(0.2, 0); burst(0.8, 140); burst(0.5, 300);
}
