import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Colores corporativos Brokergy
const COLORS = {
    orange: [230, 126, 34],
    yellow: [241, 196, 15],
    green: [46, 204, 113],
    dark: [44, 62, 80],
    gray: [127, 140, 141],
    lightGray: [236, 240, 241],
    white: [255, 255, 255]
};

export const generateBrokergyReport = async (data) => {
    try {
        console.log('PDF Generator received data:', data);

        const financials = data?.financials;
        const financialsRes080 = data?.financialsRes080;
        const inputs = data?.inputs || {};
        const isBoth = inputs.reformaType === 'both';
        const isOnlyReforma = inputs.reformaType === 'onlyReforma';

        console.log('Financials used for PDF:', financials);

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 14;
        console.log('jsPDF doc created, dimensions:', { pageWidth, pageHeight, margin });

        // ===========================================
        // PÁGINA 1: RESUMEN FINANCIERO
        // ===========================================
        console.log('Drawing Header...');
        drawHeader(doc, pageWidth);

        // Título Principal
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(...COLORS.orange);
        doc.text('¡Descubre las ayudas que te corresponden!', pageWidth / 2, 55, { align: 'center' });

        // Introducción
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.dark);
        doc.text('En BROKERGY, somos especialistas en eficiencia energética, dedicados a maximizar', pageWidth / 2, 65, { align: 'center' });
        doc.text('las oportunidades de ahorro y sostenibilidad en tu vivienda.', pageWidth / 2, 70, { align: 'center' });

        // Llamada a la acción
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.green);
        doc.text('¿Estás listo para ahorrar dinero y reducir tu huella de carbono?', margin, 85);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...COLORS.gray);
        doc.text('A continuación, te planteamos las mejores opciones para amortizar tu instalación:', margin, 93);

        // ===========================================
        // BLOQUE: DATOS DEL EDIFICIO
        // ===========================================
        if (data?.inputs) {
            const inputs = data.inputs;
            autoTable(doc, {
                startY: 100,
                head: [[
                    {
                        content: 'CARACTERÍSTICAS DEL INMUEBLE',
                        colSpan: 4,
                        styles: { halign: 'left', fillColor: [245, 245, 245], textColor: COLORS.dark, fontStyle: 'bold', fontSize: 9 }
                    }
                ]],
                body: [
                    [
                        { content: 'Año constr.:', styles: { fontStyle: 'bold', textColor: COLORS.gray } },
                        { content: inputs.anio?.toString() || '---' },
                        { content: 'Superficie:', styles: { fontStyle: 'bold', textColor: COLORS.gray } },
                        { content: `${(inputs.superficie || 0).toLocaleString('es-ES')} m²` }
                    ],
                    [
                        { content: 'Nº Plantas:', styles: { fontStyle: 'bold', textColor: COLORS.gray } },
                        { content: (inputs.plantas || 1).toLocaleString('es-ES') },
                        { content: 'Tipología:', styles: { fontStyle: 'bold', textColor: COLORS.gray } },
                        { content: inputs.tipo?.toUpperCase() || '---' }
                    ]
                ],
                theme: 'plain',
                styles: { fontSize: 9, cellPadding: 2 },
                margin: { left: margin, right: margin }
            });
        }

        // Definir qué tablas dibujar
        const tablesToDraw = [];
        if (!isOnlyReforma) {
            tablesToDraw.push({
                title: isBoth ? 'OPCIÓN 1: CAMBIO DE CALDERA POR AEROTERMIA' : 'SIMULACIÓN DE INVERSIÓN Y AYUDAS',
                fin: financials,
                color: isBoth ? COLORS.dark : COLORS.orange,
                type: 'standard'
            });
        }
        if ((isBoth || isOnlyReforma) && financialsRes080) {
            tablesToDraw.push({
                title: isBoth ? 'OPCIÓN 2: CAMBIO DE CALDERA POR AEROTERMIA Y SUSTITUCIÓN DE VENTANAS O AISLAMIENTO' : (isOnlyReforma ? 'SIMULACIÓN REFORMA ENERGÉTICA' : 'REFORMA INTEGRAL'),
                fin: financialsRes080,
                color: COLORS.orange,
                type: 'reforma'
            });
        }

        let currentY = (doc).lastAutoTable?.finalY + 10 || 100;

        tablesToDraw.forEach((table, idx) => {
            autoTable(doc, {
                startY: currentY,
                head: [[
                    {
                        content: table.title,
                        colSpan: 2,
                        styles: { halign: 'center', fillColor: table.color, textColor: COLORS.white, fontStyle: 'bold', fontSize: idx === 0 && isBoth ? 10 : 12 }
                    }
                ]],
                body: [
                    [
                        { 
                            content: table.type === 'reforma' 
                                ? 'Inversión Reforma de Vivienda + Aerotermia (IVA INC.)' 
                                : 'Inversión sustitución de caldera por aerotermia (IVA INC.)', 
                            styles: { fontStyle: 'bold' } 
                        },
                        { content: formatCurrency(table.fin.presupuesto), styles: { halign: 'right', fontStyle: 'bold' } }
                    ],
                    [
                        { content: 'Bono Energético CAE BROKERGY (Nota 1)', styles: { textColor: COLORS.dark } },
                        { content: '+' + formatCurrency(table.fin.caeBonus), styles: { halign: 'right', textColor: COLORS.green } }
                    ],
                    ...(table.fin.irpfCap > 0 ? [[
                        { content: `Deducción en el IRPF (Nota 2) (${table.fin.irpfRate}%, Límite ${formatCurrency(table.fin.irpfCap)})`, styles: { textColor: COLORS.dark } },
                        { content: '+' + formatCurrency(table.fin.irpfDeduction), styles: { halign: 'right', textColor: COLORS.green } }
                    ]] : []),
                    [
                        { content: 'Total ayuda', styles: { fillColor: COLORS.yellow, fontStyle: 'bold' } },
                        { content: formatCurrency(table.fin.totalAyuda), styles: { fillColor: COLORS.yellow, halign: 'right', fontStyle: 'bold' } }
                    ],
                    [
                        { content: 'Ahorro conseguido por BROKERGY', styles: { fillColor: [144, 238, 144] } },
                        { content: `${Math.round(table.fin.porcentajeCubierto || 0).toLocaleString('es-ES')}%`, styles: { fillColor: [144, 238, 144], halign: 'right', fontStyle: 'bold' } }
                    ],
                    [
                        { content: 'COSTE FINAL', styles: { fillColor: COLORS.dark, textColor: COLORS.white, fontStyle: 'bold', fontSize: 12 } },
                        { content: formatCurrency(table.fin.costeFinal), styles: { fillColor: COLORS.dark, textColor: COLORS.white, halign: 'right', fontStyle: 'bold', fontSize: isBoth ? 12 : 14 } }
                    ]
                ],
                theme: 'grid',
                styles: { fontSize: isBoth ? 9 : 10, cellPadding: isBoth ? 3 : 5, valign: 'middle' },
                columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 50 } },
                margin: { left: margin, right: margin }
            });
            currentY = doc.lastAutoTable.finalY + (isBoth ? 5 : 10);
        });

        // Notas al pie de la tabla
        const notesY = (doc).lastAutoTable?.finalY || 180;
        console.log('Drawing notes at Y:', notesY);
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.gray);
        doc.text('Nota 1: La ayuda Bono Energético CAE está garantizada. El importe indicado es orientativo y se ajustará una vez se emitan los certificados de eficiencia energética inicial y final.', margin, notesY + 10);
        if (financials.irpfCap > 0) {
            doc.text('Nota 2: Las deducciones en el IRPF por eficiencia energética no suponen un descuento directo sobre el precio de la actuación, sino que se aplican en la', margin, notesY + 15);
            doc.text('   declaración de la renta del contribuyente. El importe finalmente recuperado dependerá de su situación fiscal personal y de que dichas deducciones', margin, notesY + 19);
            doc.text('   se encuentren en vigor en el momento de su aplicación, que tendrá lugar al año siguiente de la ejecución de la obra.', margin, notesY + 23);
        }

        console.log('Drawing Footer P1...');
        drawFooter(doc, pageWidth, pageHeight);

        console.log('Adding Page 2...');
        doc.addPage();
        drawHeader(doc, pageWidth);

        // Título Principal Página 2
        doc.setFillColor(...COLORS.yellow);
        doc.rect(0, 45, pageWidth, 14, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...COLORS.dark);
        doc.text('¡AYUDA 1 GARANTIZADA con BROKERGY y los CAEs!', pageWidth / 2, 54, { align: 'center' });

        let y = 70;

        // Bloque 1: Qué son los CAE
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.orange);
        doc.text('¿QUÉ SON LOS CERTIFICADOS DE AHORRO ENERGÉTICO (CAE)?', margin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...COLORS.dark);
        doc.text('Los Certificados de Ahorro Energético son un mecanismo regulado por el Ministerio para la Transición', margin, y);
        y += 5;
        doc.text('Ecológica y el Reto Demográfico que premia económicamente las acciones de eficiencia energética.', margin, y);
        y += 8;
        doc.text('En términos sencillos: cuando realizas mejoras que ahorran energía (como instalar aerotermia),', margin, y);
        y += 5;
        doc.text('estas mejoras se convierten en dinero a través de los CAE (Real Decreto 36/2023).', margin, y);
        y += 15;

        // Bloque 2: Problema vs Solución
        // Problema
        doc.setFillColor(255, 245, 235); // Fondo naranja muy claro
        doc.setDrawColor(...COLORS.orange);
        doc.roundedRect(margin, y, pageWidth - 2 * margin, 32, 2, 2, 'DF');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.orange);
        doc.text('El Problema (Sin Brokergy):', margin + 5, y + 8);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.dark);
        doc.setFontSize(9);
        let bulletY = y + 14;
        doc.text('- Se requiere documentación técnica muy compleja.', margin + 8, bulletY);
        doc.text('- Las grandes compañías energéticas solo compran grandes paquetes.', margin + 8, bulletY + 5);
        doc.text('- Es difícil para un particular acceder al mercado.', margin + 8, bulletY + 10);

        y += 38;

        // Solución
        doc.setFillColor(235, 250, 240); // Fondo verde muy claro
        doc.setDrawColor(...COLORS.green);
        doc.roundedRect(margin, y, pageWidth - 2 * margin, 20, 2, 2, 'DF');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...COLORS.green);
        doc.text('La Solución BROKERGY:', margin + 5, y + 8);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...COLORS.dark);
        doc.text('Actuamos como intermediarios, agrupando múltiples expedientes para acceder al mercado mayorista', margin + 8, y + 15);
        y += 30;

        // Bloque 3: ¿Cómo funciona? - Diagrama de Pasos
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...COLORS.orange);
        doc.text('¿CÓMO FUNCIONA EL BONO ENERGÉTICO?', margin, y);
        y += 10;

        const steps = [
            { title: '1. MEJORAS', desc: 'Realizas la instalación (aerotermia, etc).' },
            { title: '2. GESTIÓN', desc: 'Brokergy gestiona toda la documentación necesaria.' },
            { title: '3. AGRUPACIÓN', desc: 'Juntamos tu ahorro con el de otros para tener fuerza.' },
            { title: '4. VENTA', desc: 'Negociamos con las energéticas el mejor precio.' },
            { title: '5. COBRO', desc: 'Recibes tu dinero en cuenta directamente.' }
        ];

        steps.forEach((step, i) => {
            // Círculo número
            doc.setFillColor(...COLORS.orange);
            doc.circle(margin + 4, y - 1, 3, 'F');
            doc.setTextColor(...COLORS.white);
            doc.setFontSize(8);
            doc.text(`${i + 1}`, margin + 4, y, { align: 'center', baseline: 'middle' });

            // Texto
            doc.setFontSize(9);
            doc.setTextColor(...COLORS.dark);
            doc.setFont('helvetica', 'bold');
            doc.text(step.title, margin + 10, y);
            doc.setFont('helvetica', 'normal');
            doc.text(step.desc, margin + 40, y);

            y += 8;
        });

        drawFooter(doc, pageWidth, pageHeight);

        // ===========================================
        // PÁGINA 3: VENTAJAS Y DEDUCCIONES
        // ===========================================
        doc.addPage();
        drawHeader(doc, pageWidth);

        // Banner Naranja Ventajas
        doc.setFillColor(...COLORS.orange);
        doc.rect(0, 45, pageWidth, 14, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...COLORS.white);
        doc.text('VENTAJAS DE TRABAJAR CON BROKERGY', pageWidth / 2, 54, { align: 'center' });

        y = 70;
        // Lista de ventajas con "Check" dibujado
        const advantages = [
            ['MÁXIMO BENEFICIO', 'Conseguimos los mejores precios al vender en volumen.'],
            ['GESTIÓN INTEGRAL', 'Nos ocupamos de la parte técnica, legal y administrativa.'],
            ['RAPIDEZ', 'Procesos automatizados para cobrar lo antes posible (3-6 meses).'],
            ['SIN RIESGOS', 'Solo firmas dos documentos: cesión de ahorros y encargo.'],
            ['EXPERIENCIA', 'Expertos en el sector energético y subvenciones.']
        ];

        advantages.forEach(([title, desc]) => {
            // Dibujar Check Verde
            doc.setDrawColor(...COLORS.green);
            doc.setLineWidth(0.5);
            doc.line(margin, y, margin + 2, y + 2); // Palito corto
            doc.line(margin + 2, y + 2, margin + 5, y - 3); // Palito largo

            // Texto
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...COLORS.dark);
            doc.text(title, margin + 8, y);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...COLORS.gray);
            doc.text(desc, margin + 8, y + 5);

            y += 12;
        });

        if (financials.irpfCap > 0) {
            y += 10;
            // Banner Amarillo IRPF
            doc.setFillColor(...COLORS.yellow);
            doc.rect(0, y, pageWidth, 12, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(...COLORS.dark);
            doc.text('AYUDA 2: DEDUCCIONES EN EL IRPF', pageWidth / 2, y + 8, { align: 'center' });
            y += 20;

            // Requisitos IRPF
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...COLORS.dark);
            doc.text('Requisitos fundamentales:', margin, y);
            y += 6;

            const irpfReqs = [
                '• Ser contribuyente del IRPF (declaración de la renta en España).',
                '• Disponer de Certificado Energético ANTES y DESPUÉS de la actuación.',
                '• Importante: NO realizar pagos en efectivo (solo transferencias/tarjeta).',
                `• Deducción del ${financials.irpfRate} % (hasta máximo anual de ${formatCurrency(financials.irpfCap)
                }).`,
                '• La deducción se aplica en la declaración de la renta del año siguiente.'
            ];

            irpfReqs.forEach(req => {
                doc.text(req, margin, y);
                y += 5;
            });

            y += 10;
            // Ejemplo Práctico Box
            doc.setFillColor(245, 245, 245);
            doc.roundedRect(margin, y, pageWidth - 2 * margin, 25, 2, 2, 'F');

            doc.setFontSize(8);
            doc.setTextColor(...COLORS.gray);
            doc.text('EJEMPLO PRÁCTICO DE DEDUCCIÓN:', margin + 4, y + 5);
            doc.text('Si te corresponde una deducción total de 7.200€ y el límite anual es 3.000€:', margin + 4, y + 10);
            doc.text('   - Año 1 (Renta 2025): Te deduces 3.000€', margin + 4, y + 14);
            doc.text('   - Año 2 (Renta 2026): Te deduces otros 3.000€', margin + 4, y + 18);
            doc.text('   - Año 3 (Renta 2027): Te deduces el resto (1.200€)', margin + 4, y + 22);
        }

        console.log('Drawing Footer P3...');
        drawFooter(doc, pageWidth, pageHeight);

        console.log('Saving PDF file...');
        doc.save('Informe_Brokergy_Simulacion.pdf');
        console.log('PDF Generated Successfully!');

    } catch (error) {
        console.error('CRITICAL PDF ERROR:', error);
        alert(`Error al generar el PDF: ${error.message}. Por favor, abre la consola del navegador(F12) y envía una captura de los logs a soporte.`);
    }
};

// ==========================================
// UTILIDADES GRÁFICAS Y TEXTO
// ==========================================

function drawHeader(doc, pageWidth) {
    // Logo "Simulado" con texto y forma
    doc.setFillColor(...COLORS.orange);
    doc.rect(14, 12, 10, 10, 'F'); // Cuadrado naranja logo

    // Texto BROKERGY
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0); // Negro
    doc.text('BROKERGY', 28, 21);

    // Línea separadora
    doc.setDrawColor(...COLORS.orange);
    doc.setLineWidth(0.8);
    doc.line(14, 30, pageWidth - 14, 30);
}

function drawFooter(doc, pageWidth, pageHeight) {
    // Barra Fondo
    doc.setFillColor(...COLORS.yellow);
    doc.rect(0, pageHeight - 14, pageWidth, 14, 'F');

    // Texto Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.dark);
    doc.text('info@brokergy.es  |  Tlf: 623 926 179  |  www.brokergy.es', pageWidth / 2, pageHeight - 6, { align: 'center' });
}

function formatCurrency(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return '0 €';
    }
    const num = typeof value === 'number' ? value : parseFloat(value);
    const d = (num % 1 === 0) ? 0 : 2;
    return num.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
}
