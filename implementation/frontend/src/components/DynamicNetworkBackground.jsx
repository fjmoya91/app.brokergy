import React, { useEffect, useRef } from 'react';

export const DynamicNetworkBackground = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;
        let particles = [];
        const particleCount = 60;
        const connectionDistance = 150;
        const mouseRadius = 200;

        let mouse = { x: null, y: null };

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles();
        };

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 1;
                this.baseX = this.x;
                this.baseY = this.y;
                this.dx = (Math.random() - 0.5) * 0.8;
                this.dy = (Math.random() - 0.5) * 0.8;
                this.color = Math.random() > 0.85 ? '#2dd4bf' : '#f59e0b';
            }

            update() {
                this.x += this.dx;
                this.y += this.dy;

                // Rebote en bordes
                if (this.x > canvas.width || this.x < 0) this.dx = -this.dx;
                if (this.y > canvas.height || this.y < 0) this.dy = -this.dy;

                // Interacción con ratón (vortex sutil)
                if (mouse.x != null) {
                    let dx = mouse.x - this.x;
                    let dy = mouse.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouseRadius) {
                        this.x -= dx / 50;
                        this.y -= dy / 50;
                    }
                }
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();

                // Brillo del nodo
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;
            }
        }

        const initParticles = () => {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.shadowBlur = 0; // Reset shadow for lines

            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();

                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < connectionDistance) {
                        // El color de la línea es un degradado entre los dos nodos
                        const opacity = 1 - (distance / connectionDistance);
                        ctx.strokeStyle = `rgba(245, 158, 11, ${opacity * 0.2})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();

                        // Pequeño pulso de luz ocasional en la conexión
                        if (Math.random() > 0.9995) {
                            // Aquí se podría animar un pulso, pero simplificamos por rendimiento
                        }
                    }
                }
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.x;
            mouse.y = e.y;
        });
        window.addEventListener('mouseleave', () => {
            mouse.x = null;
            mouse.y = null;
        });

        resize();
        draw();

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <>
            <canvas
                ref={canvasRef}
                className="fixed inset-0 z-0 pointer-events-none bg-[#020617]"
                style={{ filter: 'contrast(120%) brightness(110%)' }}
            />
            {/* Capas de profundidad con gradientes para suavizar los bordes del canvas */}
            <div className="fixed inset-0 z-1 pointer-events-none shadow-[inset_0_0_150px_rgba(2,6,23,0.9)]"></div>
            <div className="fixed inset-0 z-1 pointer-events-none bg-gradient-to-b from-[#020617]/40 via-transparent to-[#020617]/40"></div>
        </>
    );
};
