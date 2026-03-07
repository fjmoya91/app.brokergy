import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';

const formatNumber = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (num === null || num === undefined || isNaN(num)) return '0';
    const d = (num % 1 === 0) ? 0 : 2;
    return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
        useGrouping: true
    }).format(num);
};

export function ProposalModal({ isOpen, onClose, result, inputs }) {
    const proposalRef = useRef(null);
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [scale, setScale] = useState(1);

    // Ajustar la escala de la vista previa para que quepa en el ancho disponible
    useEffect(() => {
        if (!isOpen) return;

        const updateScale = () => {
            if (containerRef.current) {
                // El ancho fijo de nuestro diseño de página A4 es approx 794px (210mm a 96dpi) 
                // pero a efectos prácticos podemos usar ofsetWidth del prop-wrapper o constante
                const pagePixelWidth = 794;
                // Restamos un poco de padding al contenedor para que no pegue a los bordes
                const availableWidth = containerRef.current.clientWidth - 32;

                if (availableWidth < pagePixelWidth) {
                    setScale(availableWidth / pagePixelWidth);
                } else {
                    setScale(1);
                }
            }
        };

        // Ejecutar inicialmente y en cada resize
        updateScale();
        // Un pequeño timeout para asegurar que el DOM ha renderizado el contenedor
        setTimeout(updateScale, 50);

        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, [isOpen]);

    if (!isOpen || !result || !result.financials) return null;

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const element = proposalRef.current;
            if (!element) return;

            // Extraer el CSS inline (el <style> de baseCss)
            const styleTag = element.querySelector('style');
            const cssContent = styleTag ? styleTag.innerHTML : '';

            // Extraer el HTML de las páginas
            const pages = element.querySelectorAll('.prop-page');
            let pagesHtml = '';
            pages.forEach(page => {
                pagesHtml += page.outerHTML;
            });

            // Construir documento HTML completo autónomo
            const fullHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=794">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { width: 794px; margin: 0; padding: 0; }
        ${cssContent}
        .prop-page { box-shadow: none !important; margin: 0 !important; }
        @page { size: A4; margin: 0; }
    </style>
</head>
<body>
    <div class="prop-wrapper-inner" style="width: 794px; margin: 0;">
        ${pagesHtml}
    </div>
</body>
</html>`;

            // Enviar al backend para generar PDF con Puppeteer
            const response = await axios.post('/api/pdf/generate',
                { html: fullHtml },
                { timeout: 60000 }
            );

            // El backend devuelve { pdf: base64string } para evitar problemas
            // de serialización binaria en Vercel serverless
            const { pdf: pdfBase64, error: serverError, message: serverMessage } = response.data;

            if (serverError || !pdfBase64) {
                alert(`Error al generar PDF: ${serverMessage || 'Error desconocido'}`);
                setGenerating(false);
                return;
            }

            // Decodificar base64 a Blob
            const binaryStr = atob(pdfBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/pdf' });

            // Descargar el PDF recibido
            const safeRc = (inputs?.rc || 'Simulacion').replace(/[^a-zA-Z0-9_\-]/g, '_');
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Propuesta_Brokergy_${safeRc}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error generating PDF:', error);
            const msg = error.response?.data?.message || error.message || 'Error desconocido';
            alert(`Error al generar el PDF: ${msg}`);
        } finally {
            setGenerating(false);
        }
    };

    const f = result.financials;
    const discountCerts = result.discountCertificates || false;
    const date = new Date();
    const formattedDate = date.toLocaleDateString('es-ES');

    const validUntilDate = new Date();
    validUntilDate.setMonth(validUntilDate.getMonth() + 2);
    const formattedValidDate = validUntilDate.toLocaleDateString('es-ES');

    // Costs - conditional on discount toggle
    const costeCEE = discountCerts ? 0 : 220;
    const costeTasas = discountCerts ? 0 : 32.78;
    const costeGestion = 0; // Always 100% DTO
    const totalDescuentoGestion = costeCEE + costeTasas + costeGestion;
    const caeBonus = f.caeBonus || 0;
    const caeNeto = Math.max(0, caeBonus - totalDescuentoGestion);

    // Annual savings data
    const annualSavings = result.annualSavings;
    const payback = result.payback;
    const showAnnualSavings = result.includeAnnualSavings && annualSavings;

    const baseCss = `
        .prop-wrapper {
            transform-origin: top center;
            /* Se aplicará scale mediante style inline */
        }

        .prop-wrapper-inner {
            --orange: #F5A623;
            --orange-dark: #E0900F;
            --orange-light: #FFF8ED;
            --green: #5CB85C;
            --green-dark: #3D8B3D;
            --green-light: #EDF7ED;
            --dark: #1B2A4A;
            --dark-mid: #253658;
            --g800: #1F2937;
            --g700: #374151;
            --g600: #4B5563;
            --g500: #6B7280;
            --g400: #9CA3AF;
            --g300: #D1D5DB;
            --g200: #E5E7EB;
            --g100: #F3F4F6;
            --g50: #F9FAFB;
            --white: #FFFFFF;
            --red: #DC2626;
            --red-light: #FEF2F2;
            --yellow: #F5C842;
            --yellow-light: #FFFCE8;
            
            font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
            color: var(--g700);
            background: #DEE1E6;
            -webkit-font-smoothing: antialiased;
            line-height: 1.55;
            text-align: left;
            width: 794px; /* Ancho fijo A4 a 96 DPI */
            margin: 0 auto;
        }

        .prop-wrapper-inner * {
            box-sizing: border-box;
        }

        .prop-page {
            width: 794px; /* Cambiado de 210mm a px para escalado preciso */
            height: 1123px; /* Cambiado de 297mm a px */
            margin: 0 auto;
            background: var(--white);
            position: relative;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            box-shadow: 0 4px 40px rgba(0,0,0,0.1);
            margin-bottom: 24px;
        }
        
        .prop-page:first-child { margin-top: 24px; }
        .prop-page:last-child { page-break-after: avoid; break-after: avoid; }
        .prop-pb { padding: 0 44px; }

        .prop-hero {
            background: linear-gradient(145deg, var(--dark) 0%, var(--dark-mid) 60%, #2E4470 100%);
            padding: 28px 44px 24px;
            position: relative; overflow: hidden;
        }
        .prop-compact .prop-hero { padding: 22px 44px 18px; }
        .prop-compact .prop-hero .prop-htitle h2 { font-size: 19px; }
        .prop-compact .prop-hero .prop-hline { margin: 12px 0 8px; }
        .prop-compact .prop-hsub { margin-top: 3px; font-size: 11px; }
        .prop-hero::before {
            content: ''; position: absolute; top: -80px; right: -40px;
            width: 260px; height: 260px;
            background: radial-gradient(circle, var(--orange) 0%, transparent 70%); opacity: 0.07;
        }
        .prop-hero-top { display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
        .prop-hero-top h1 { margin: 0; padding: 0; }
        .prop-logo h1 { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; font-weight: 900; font-size: 28px; color: var(--white); letter-spacing: 3.5px; }
        .prop-logo h1 span { color: var(--orange); }
        .prop-ltag { color: rgba(255,255,255,0.55); font-size: 9.5px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; }
        .prop-hmeta { text-align: right; color: rgba(255,255,255,0.45); font-size: 10.5px; line-height: 1.6; position: relative; z-index: 1; }
        .prop-hmeta strong { color: var(--orange); font-size: 11px; display: block; font-weight: 700; }
        .prop-hline { height: 1px; background: rgba(255,255,255,0.1); margin: 18px 0 14px; position: relative; z-index: 1; }
        .prop-htitle { position: relative; z-index: 1; }
        .prop-htitle h2 { margin: 0; padding: 0; font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; color: var(--white); font-size: 22px; font-weight: 800; line-height: 1.3; }
        .prop-htitle h2 em { font-style: normal; color: var(--orange); }
        .prop-hsub { color: rgba(255,255,255,0.4); font-size: 11px; margin-top: 5px; position: relative; z-index: 1; }

        .prop-cbar { background: var(--orange); padding: 12px 44px; display: flex; gap: 24px; }
        .prop-compact .prop-cbar { padding: 10px 44px; }
        .prop-cf { display: flex; flex-direction: column; }
        .prop-cl { font-size: 7.5px; text-transform: uppercase; letter-spacing: 1.5px; color: rgba(255,255,255,0.6); font-weight: 700; }
        .prop-cv { color: var(--white); font-weight: 700; font-size: 12px; display: block; }

        .prop-stag { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 5px; }
        .prop-sn { width: 17px; height: 17px; background: var(--orange); color: white; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; line-height: 1; }
        .prop-st { font-size: 8.5px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; color: var(--orange-dark); }
        .prop-stitle { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; font-size: 18px; color: var(--dark); font-weight: 800; margin-bottom: 5px; line-height: 1.25; }
        .prop-compact .prop-stag { margin-bottom: 4px; }
        .prop-compact .prop-stitle { font-size: 16px; margin-bottom: 4px; }
        .prop-sintro { color: var(--g500); font-size: 11px; margin-bottom: 12px; line-height: 1.6; margin-top: 0; padding: 0; }
        .prop-compact .prop-sintro { font-size: 10.5px; margin-bottom: 8px; line-height: 1.5; }

        .prop-ftable { border-radius: 10px; overflow: hidden; box-shadow: 0 1px 10px rgba(0,0,0,0.05); }
        .prop-fth { background: var(--orange); padding: 10px 22px; display: flex; justify-content: space-between; }
        .prop-fth span { color: white; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; }
        .prop-compact .prop-fth { padding: 8px 22px; }
        .prop-compact .prop-fth span { font-size: 9.5px; }
        .prop-ftr { display: flex; justify-content: space-between; align-items: center; padding: 12px 22px; border-bottom: 1px solid var(--g100); }
        .prop-ftr:nth-child(odd) { background: var(--g50); }
        .prop-ftr .prop-fl { font-size: 12.5px; color: var(--g700); }
        .prop-ftr .prop-fl small { color: var(--g400); font-size: 10.5px; }
        .prop-ftr .prop-fv { font-weight: 800; font-size: 16px; min-width: 110px; text-align: right; }
        .prop-ftr .prop-fv.grn { color: var(--green-dark); }
        .prop-compact .prop-ftr { padding: 9px 22px; }
        .prop-compact .prop-ftr .prop-fl { font-size: 11.5px; }
        .prop-compact .prop-ftr .prop-fv { font-size: 15px; }
        .prop-ftaids { background: var(--yellow); padding: 12px 22px; display: flex; justify-content: space-between; align-items: center; }
        .prop-ftaids .prop-fl { font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--g800); }
        .prop-ftaids .prop-fv { font-weight: 900; font-size: 20px; color: var(--g800); }
        .prop-compact .prop-ftaids { padding: 9px 22px; }
        .prop-compact .prop-ftaids .prop-fv { font-size: 18px; }
        .prop-ftpct { background: #B8E6B8; padding: 10px 22px; display: flex; justify-content: space-between; align-items: center; }
        .prop-ftpct .prop-fl { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--green-dark); }
        .prop-ftpct .prop-fv { font-weight: 900; font-size: 18px; color: var(--green-dark); font-style: italic; }
        .prop-compact .prop-ftpct { padding: 8px 22px; }
        .prop-compact .prop-ftpct .prop-fv { font-size: 16px; }
        .prop-ftfin { background: var(--dark); padding: 16px 22px; display: flex; justify-content: space-between; align-items: center; border-radius: 0 0 10px 10px; }
        .prop-ftfin .prop-fl { color: white; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        .prop-ftfin .prop-fv { color: var(--orange); font-weight: 900; font-size: 30px; }
        .prop-compact .prop-ftfin { padding: 12px 22px; }
        .prop-compact .prop-ftfin .prop-fl { font-size: 13px; }
        .prop-compact .prop-ftfin .prop-fv { font-size: 26px; }

        .prop-nsm { margin-top: 10px; }
        .prop-compact .prop-nsm { margin-top: 8px; }
        .prop-nsm p { font-size: 9.5px; color: var(--g400); line-height: 1.5; margin-bottom: 3px; margin-top: 0; }
        .prop-compact .prop-nsm p { font-size: 8.5px; line-height: 1.4; margin-bottom: 2px; }
        .prop-nsm p b { color: var(--g600); }
        .prop-avl { text-align: center; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; color: var(--g400); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--g200); }
        .prop-compact .prop-avl { margin-top: 5px; padding-top: 5px; font-size: 8px; }

        .prop-cta {
            background: linear-gradient(145deg, var(--dark) 0%, var(--dark-mid) 100%);
            padding: 22px 44px; text-align: center;
            position: absolute; bottom: 0; left: 0; right: 0;
        }
        .prop-compact .prop-cta { padding: 18px 44px; }
        .prop-compact .prop-cta h3 { font-size: 15px; margin-bottom: 2px; }
        .prop-compact .prop-csub { font-size: 9.5px; margin-bottom: 10px; }
        .prop-compact .prop-cta-btn { font-size: 11px; padding: 9px 26px; }
        .prop-compact .prop-cfn { font-size: 7.5px; margin-top: 5px; }
        .prop-cta h3 { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; color: white; font-size: 17px; font-weight: 800; margin-bottom: 3px; margin-top: 0; }
        .prop-csub { color: rgba(255,255,255,0.45); font-size: 10.5px; margin-bottom: 14px; margin-top: 0;}
        .prop-cta-btn {
            display: inline-flex; align-items: center; gap: 8px;
            background: var(--orange); color: white; font-weight: 800;
            font-size: 13px; padding: 12px 36px; border-radius: 50px;
            text-decoration: none; letter-spacing: 0.5px; line-height: 1;
            font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
        }
        .prop-cfn { color: rgba(255,255,255,0.25); font-size: 8.5px; margin-top: 10px; line-height: 1.5; margin-bottom: 0; }

        .prop-mfoot {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 7px 44px; display: flex; justify-content: space-between;
            font-size: 8px; color: var(--g400); border-top: 1px solid var(--g200); background: white;
        }
        .prop-mfoot a { color: var(--orange-dark); text-decoration: none; font-weight: 600; }

        .prop-ebox { border-radius: 8px; padding: 13px 16px; margin-bottom: 10px; border: 1px solid var(--g200); background: var(--g50); }
        .prop-ebox.ora { border-left: 3px solid var(--orange); background: var(--orange-light); }
        .prop-ebox.grn { border-left: 3px solid var(--green); background: var(--green-light); }
        .prop-ebox h4 { margin: 0; padding: 0; font-size: 10.5px; font-weight: 700; color: var(--dark); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; }
        .prop-ebox p { margin: 0; padding: 0; font-size: 10.5px; color: var(--g600); line-height: 1.6; }
        .prop-ebox p+p { margin-top: 4px; }

        .prop-agrid { display: flex; gap: 8px; margin: 10px 0 4px; }
        .prop-ac { flex:1; text-align:center; padding:10px 4px; background:var(--g50); border-radius:7px; border:1px solid var(--g200); }
        .prop-ai { font-size:18px; margin-bottom:1px; }
        .prop-at { font-size:9.5px; font-weight:700; color:var(--dark); }
        .prop-as { font-size:8.5px; color:var(--g500); line-height:1.3; }

        .prop-sdiv { height:1px; background:var(--g200); margin:16px 0; }

        .prop-irow { display:flex; gap:10px; margin:6px 0 4px; }
        .prop-ibox { flex:1; background:var(--green-light); border-radius:7px; padding:9px; text-align:center; border:1px solid rgba(92,184,92,0.15); }
        .prop-iy { font-size:9.5px; color:var(--g500); font-weight:600; }
        .prop-ia { font-size:16px; font-weight:800; color:var(--green-dark); }

        .prop-srow { display:flex; margin:10px 0 4px; position:relative; }
        .prop-sl { position:absolute; top:13px; left:7%; right:7%; height:2px; background:var(--g200); z-index:0; }
        .prop-ps { flex:1; text-align:center; position:relative; z-index:1; padding:0 2px; }
        .prop-pn { width:26px; height:26px; border-radius:50%; background:var(--orange); color:white; font-weight:800; font-size:10px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:3px; line-height:1; }
        .prop-ps:nth-child(even) .prop-pn { background:var(--green); }
        .prop-pt { font-size:8px; font-weight:700; color:var(--dark); text-transform:uppercase; letter-spacing:0.2px; }
        .prop-pd { font-size:7.5px; color:var(--g500); line-height:1.3; }

        .prop-dcols { display:flex; gap:20px; }
        .prop-dcol { flex:1; }
        .prop-dph { font-size:12px; font-weight:700; color:var(--dark); padding-bottom:3px; margin-bottom:6px; border-bottom:2px solid var(--orange); display:inline-block; }
        .prop-dph.gr { border-bottom-color:var(--green); }
        .prop-dgt { font-size:9px; font-weight:700; color:var(--g600); text-transform:uppercase; letter-spacing:0.4px; margin:8px 0 3px; }
        .prop-dl { list-style:none; margin: 0; padding: 0; }
        .prop-dl li { font-size:10.5px; color:var(--g700); padding:2.5px 0 2.5px 17px; position:relative; line-height:1.4; }
        .prop-dl li::before { content:''; position:absolute; left:0; top:6px; width:10px; height:10px; border:1.5px solid var(--g300); border-radius:2px; }
        .prop-dl li.s { padding-left:30px; font-size:9.5px; color:var(--g600); }
        .prop-dl li.s::before { left:15px; width:7px; height:7px; border-radius:50%; top:7px; }
        .prop-tipbar { background:var(--yellow-light); border:1px solid rgba(245,200,66,0.25); border-left:3px solid var(--yellow); border-radius:0 6px 6px 0; padding:10px 14px; margin-top:12px; }
        .prop-tipbar h5 { margin: 0; padding: 0; font-size:9.5px; font-weight:700; color:var(--g800); margin-bottom:3px; }
        .prop-tipbar p { margin: 0; padding: 0; font-size:9.5px; color:var(--g600); line-height:1.55; }

        .prop-cl-box { background:var(--g50); border-left:3px solid var(--g300); padding:11px 15px; border-radius:0 6px 6px 0; margin-bottom:9px; }
        .prop-cl-box.ora { background:var(--orange-light); border-left-color:var(--orange); }
        .prop-cl-box.grn { background:var(--green-light); border-left-color:var(--green); }
        .prop-cl-box.red { background:var(--red-light); border-left-color:var(--red); }
        .prop-cl-box h4 { margin: 0; padding: 0; font-size:9.5px; font-weight:700; color:var(--dark); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:3px; }
        .prop-cl-box.red h4 { color:var(--red); }
        .prop-cl-box p { margin: 0; padding: 0; font-size:10.5px; color:var(--g700); line-height:1.6; }

        .prop-cgrid { margin-top:6px; background:rgba(255,255,255,0.6); border-radius:5px; overflow:hidden; }
        .prop-crow { display:flex; justify-content:space-between; padding:6px 12px; font-size:10.5px; border-bottom:1px solid rgba(0,0,0,0.04); }
        .prop-crow:last-child { border-bottom:none; }
        .prop-crow.ctot { background:rgba(0,0,0,0.03); font-weight:700; padding:7px 12px; font-size:11px; }
        .prop-crow em { font-style:normal; color:var(--green-dark); font-weight:700; }
        .prop-crow s { color:var(--g400); font-weight:400; }

        .prop-ptable { background:var(--red-light); border:1px solid rgba(220,38,38,0.12); border-radius:6px; overflow:hidden; margin:5px 0 9px; }
        .prop-pthead { background:rgba(220,38,38,0.07); padding:6px 12px; font-size:8.5px; font-weight:700; color:var(--red); text-transform:uppercase; letter-spacing:0.5px; }
        .prop-ptrow { display:flex; justify-content:space-between; padding:5px 12px; font-size:10.5px; border-bottom:1px dashed rgba(220,38,38,0.08); }
        .prop-ptrow:last-child { border-bottom:none; }
        .prop-pl { color:var(--g700); }
        .prop-pv { font-weight:700; color:var(--red); }
        .prop-ptrow.ptt { border-top:1.5px solid rgba(220,38,38,0.15); padding:7px 12px; font-weight:700; }
        .prop-ptrow.ptt .prop-pv { font-size:12px; }
    `;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div className="bg-slate-900 rounded-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden border border-amber-500/30 shadow-2xl relative" onClick={e => e.stopPropagation()}>

                <div className="flex justify-between items-center p-4 bg-slate-800 border-b border-slate-700">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <span className="text-amber-500">📄</span> Vista Previa de Propuesta
                    </h3>
                    <div className="flex gap-4">
                        <button
                            onClick={handleDownloadPdf}
                            disabled={generating}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 py-2 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {generating ? 'Generando PDF...' : 'Descargar PDF'}
                            {!generating && (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-slate-700 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div ref={containerRef} className="flex-1 overflow-auto bg-slate-200 p-4 sm:p-8 flex justify-center custom-scrollbar">

                    <div className="prop-wrapper" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: scale < 1 ? `-${1123 * 4 * (1 - scale)}px` : '0', height: `${1123 * 4 + 100}px` }}>
                        <div ref={proposalRef} className="prop-wrapper-inner" style={{ fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif' }}>
                            <style dangerouslySetInnerHTML={{ __html: baseCss }} />

                            {/* <!-- PAGINA 1 --> */}
                            <div className={`prop-page${showAnnualSavings ? ' prop-compact' : ''}`}>
                                <div className="prop-hero">
                                    <div className="prop-hero-top">
                                        <div className="prop-logo"><h1>BROKER<span>GY</span></h1><div className="prop-ltag">Especialistas en eficiencia energética</div></div>
                                        <div className="prop-hmeta"><strong>Propuesta {inputs?.rc ? `Nº ${inputs.rc.substring(0, 6)}` : 'Simulación'}</strong>Fecha: {formattedDate}<br />Oferta válida hasta: {formattedValidDate}</div>
                                    </div>
                                    <div className="prop-hline"></div>
                                    <div className="prop-htitle"><h2>Propuesta de <em>Bono Energético CAE</em> y servicios de eficiencia energética</h2></div>
                                    <div className="prop-hsub">Resumen personalizado de ayudas, subvenciones y deducciones fiscales</div>
                                </div>
                                <div className="prop-cbar">
                                    <div className="prop-cf"><span className="prop-cl">Cliente</span><span className="prop-cv">{inputs?.referenciaCliente || 'Sin Asignar'}</span></div>
                                    <div className="prop-cf"><span className="prop-cl">Ref. Catastral</span><span className="prop-cv">{inputs?.rc || 'MANUAL'}</span></div>
                                    <div className="prop-cf" style={{ flex: 1.5 }}><span className="prop-cl">Dirección</span><span className="prop-cv">{inputs?.direccion || inputs?.address || '---'}</span></div>
                                    <div className="prop-cf"><span className="prop-cl">Actuación</span><span className="prop-cv">Aerotermia</span></div>
                                </div>
                                <div className="prop-pb" style={{ paddingTop: showAnnualSavings ? '16px' : '22px' }}>
                                    <div className="prop-stag"><span className="prop-sn">1</span><span className="prop-st">Sus ayudas</span></div>
                                    <div className="prop-stitle">Análisis de subvenciones y deducciones</div>
                                    <p className="prop-sintro">Hemos analizado su proyecto de reforma energética y calculado las ayudas máximas a las que puede acceder. Este es el desglose personalizado de su propuesta.</p>
                                    <div className="prop-ftable">
                                        <div className="prop-fth"><span>Análisis de subvenciones y deducciones</span><span>Importe</span></div>
                                        <div className="prop-ftr"><span className="prop-fl">Inversión inicial estimada <small>(IVA INCLUIDO)</small></span><span className="prop-fv">{formatNumber(f.presupuesto)} €</span></div>
                                        <div className="prop-ftr"><span className="prop-fl">Ayuda 1: Bono Energético CAE <small>(Nota 1)</small></span><span className="prop-fv grn">– {formatNumber(f.caeBonus)} €</span></div>
                                        {Array.from({ length: Math.max(1, f.numOwners || 1) }).map((_, index) => (
                                            <div key={`owner-${index}`} className="prop-ftr">
                                                <span className="prop-fl">Ayuda {2 + index}: Deducciones en el IRPF Propietario {index + 1} <small>({f.irpfRate}%, Límite {formatNumber(f.irpfCap)} €)</small></span>
                                                <span className="prop-fv grn">– {formatNumber(f.irpfDeductionPerOwner || f.irpfDeduction)} €</span>
                                            </div>
                                        ))}
                                        <div className="prop-ftaids"><span className="prop-fl">Total ayudas conseguidas</span><span className="prop-fv">{formatNumber(f.totalAyuda)} €</span></div>
                                        <div className="prop-ftpct"><span className="prop-fl">Porcentaje cubierto gracias a las ayudas</span><span className="prop-fv">{formatNumber(f.porcentajeCubierto)}%</span></div>
                                        <div className="prop-ftfin"><span className="prop-fl">Inversión neta final</span><span className="prop-fv">{formatNumber(f.costeFinal)} €</span></div>
                                    </div>
                                    <div className="prop-nsm">
                                        <p><b>NOTA 1:</b> La ayuda Bono Energético CAE está garantizada por Brokergy. El importe es una estimación técnica que se ajustará tras emitir los CEE inicial y final.</p>
                                        <p><b>NOTA 2:</b> Las deducciones en el IRPF no suponen un descuento directo, sino un derecho a deducción en la renta. El ahorro dependerá de la situación fiscal del contribuyente.</p>
                                        {showAnnualSavings && (
                                            <p><b>NOTA 3:</b> El análisis de ahorro anual es un cálculo teórico basado en datos climáticos zonales. Los resultados reales dependerán de los hábitos de uso.</p>
                                        )}
                                        <div className="prop-avl">Aviso: Los cálculos son estimaciones teóricas. Los consumos reales pueden variar.</div>
                                    </div>

                                    {showAnnualSavings && (
                                        <div className="prop-ftable" style={{ marginTop: '10px' }}>
                                            <div className="prop-fth" style={{ background: 'var(--dark)', padding: '7px 22px' }}><span>Análisis de Ahorro y Rentabilidad</span><span>Importe</span></div>
                                            <div className="prop-ftr"><span className="prop-fl">Gasto aproximado actual con {annualSavings.fuelLabel}</span><span className="prop-fv" style={{ color: 'var(--red)' }}>{formatNumber(Math.round(annualSavings.costeActual))} €/año</span></div>
                                            <div className="prop-ftr"><span className="prop-fl">Gasto estimado con Aerotermia</span><span className="prop-fv grn">{formatNumber(Math.round(annualSavings.costeNuevo))} €/año</span></div>
                                            <div className="prop-ftpct"><span className="prop-fl">Ahorro económico anual</span><span className="prop-fv" style={{ fontWeight: '900', fontSize: '18px', color: 'var(--green-dark)' }}>{formatNumber(Math.round(annualSavings.ahorroAnual))} €</span></div>
                                            {payback && payback.paybackYears < 100 && (
                                                <div className="prop-ftfin" style={{ padding: '10px 22px' }}><span className="prop-fl" style={{ fontSize: '11px' }}>Plazo de amortización de la inversión</span><span className="prop-fv" style={{ fontSize: '22px' }}>{formatNumber(payback.paybackYears)} años</span></div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="prop-cta">
                                    <h3>¿Listo para empezar a ahorrar?</h3>
                                    <p className="prop-csub">Acepte esta propuesta y comenzaremos a trabajar en su expediente de inmediato.</p>
                                    <a href="https://brokergy.es/firma" target="_blank" rel="noopener noreferrer" className="prop-cta-btn">✍️&nbsp;&nbsp;FIRMAR Y ACEPTAR PROPUESTA</a>
                                    <p className="prop-cfn">Al firmar, acepta las condiciones descritas en este documento. Será redirigido a un formulario seguro.</p>
                                </div>
                            </div>

                            {/* <!-- PAGINA 2 --> */}
                            <div className="prop-page">
                                <div className="prop-pb" style={{ paddingTop: '30px' }}>
                                    <div className="prop-stag"><span className="prop-sn">2</span><span className="prop-st">Bono Energético CAE</span></div>
                                    <div className="prop-stitle">¿Qué son los Certificados de Ahorro Energético?</div>
                                    <p className="prop-sintro">Los CAE son un mecanismo regulado por el Ministerio para la Transición Ecológica y el Reto Demográfico (Real Decreto 36/2023) que premia económicamente las acciones de eficiencia energética realizadas en hogares y negocios.</p>

                                    <div className="prop-ebox" style={{ background: 'var(--g50)', borderLeft: '3px solid var(--dark)', marginBottom: '10px' }}>
                                        <h4>¿Cómo funcionan?</h4>
                                        <p>Cuando usted realiza una mejora que ahorra energía en su vivienda — como sustituir una caldera antigua por aerotermia, mejorar el aislamiento o cambiar ventanas — ese ahorro se puede cuantificar y convertir en un beneficio económico real a través de los Certificados de Ahorro Energético, dentro de un sistema oficial respaldado por el Gobierno de España.</p>
                                        <p>Las grandes empresas energéticas (llamadas "sujetos obligados") están obligadas por ley a comprar estos certificados. Sin embargo, <strong>solo adquieren CAE en grandes volúmenes</strong> y no negocian directamente con particulares. Además, el proceso requiere documentación técnica especializada, emisión de facturas específicas y una gestión administrativa compleja.</p>
                                    </div>

                                    <div className="prop-ebox ora">
                                        <h4>¿Por qué elegirnos? La solución BROKERGY</h4>
                                        <p>BROKERGY actúa como su intermediario especializado. Agrupamos su expediente con otros similares para crear paquetes atractivos para los grandes compradores, gestionamos toda la documentación técnica y administrativa, y negociamos directamente con los sujetos obligados para obtener el máximo precio por sus certificados.</p>
                                        <p><strong>Usted no tiene que preocuparse de nada:</strong> nosotros nos encargamos de todo el proceso de principio a fin, y usted solo necesita firmar dos documentos. Sin papeleo, sin complicaciones, y con la garantía de cobro.</p>
                                    </div>

                                    <div className="prop-agrid">
                                        <div className="prop-ac" style={{ background: 'var(--green-light)', borderColor: 'rgba(92,184,92,0.2)' }}><div className="prop-ai" style={{ fontSize: '22px' }}>🏆</div><div className="prop-at">100% de éxito</div><div className="prop-as">Todos los expedientes tramitados resueltos favorablemente</div></div>
                                        <div className="prop-ac"><div className="prop-ai" style={{ fontSize: '22px' }}>💸</div><div className="prop-at">Cobro 3-6 meses</div><div className="prop-as">Pago íntegro en plazo garantizado</div></div>
                                        <div className="prop-ac"><div className="prop-ai" style={{ fontSize: '22px' }}>📋</div><div className="prop-at">Solo 2 firmas</div><div className="prop-as">Mínima participación por su parte</div></div>
                                        <div className="prop-ac" style={{ background: 'var(--orange-light)', borderColor: 'rgba(245,166,35,0.2)' }}><div className="prop-ai" style={{ fontSize: '22px' }}>🎯</div><div className="prop-at">Sin adelantos</div><div className="prop-as">Cobramos a éxito del expediente</div></div>
                                    </div>

                                    <div className="prop-sdiv"></div>

                                    <div className="prop-stag"><span className="prop-sn">3</span><span className="prop-st">Ahorro adicional</span></div>
                                    <div className="prop-stitle">Deducciones en el IRPF — Hasta un 60%</div>
                                    <p className="prop-sintro">Además del Bono Energético, como contribuyente del IRPF puede deducirse hasta el 60% de la inversión (límite 9.000 €) en su declaración de la renta.</p>
                                    <div className="prop-ebox grn">
                                        <h4>Requisitos principales</h4>
                                        <p>Ser contribuyente del IRPF. Disponer de CEE antes y después de la actuación. No pagar en efectivo. Declarar en el ejercicio de la obra (ej: obras 2026 → renta 2027). Máximo deducible por año: 3.000 €; el exceso se prorratea en años siguientes.</p>
                                    </div>

                                    {(() => {
                                        const deduction = f.irpfDeductionPerOwner || f.irpfDeduction;
                                        const maxPerYear = 3000;
                                        const baseYear = new Date().getFullYear() + 1;
                                        const years = [];
                                        let remaining = deduction;
                                        while (remaining > 0 && years.length < 3) {
                                            const amount = Math.min(remaining, maxPerYear);
                                            years.push({ year: baseYear + years.length, amount });
                                            remaining -= amount;
                                        }
                                        return deduction > maxPerYear ? (
                                            <>
                                                <p style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--dark)' }}>Ejemplo de prorrateo (deducción de {formatNumber(deduction)} €):</p>
                                                <div className="prop-irow">
                                                    {years.map(y => (
                                                        <div key={y.year} className="prop-ibox"><div className="prop-iy">Renta {y.year}</div><div className="prop-ia">{formatNumber(y.amount)} €</div></div>
                                                    ))}
                                                </div>
                                                <p style={{ fontSize: '9px', color: 'var(--g400)', fontStyle: 'italic', marginTop: '2px' }}>Cuando la vivienda es de propiedad compartida, los límites se aplican por contribuyente, pudiendo duplicarse la ayuda.</p>
                                            </>
                                        ) : (
                                            <>
                                                <p style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--dark)' }}>Ejemplo (deducción de {formatNumber(deduction)} €):</p>
                                                <div className="prop-irow">
                                                    <div className="prop-ibox"><div className="prop-iy">Renta {baseYear}</div><div className="prop-ia">{formatNumber(deduction)} €</div></div>
                                                </div>
                                            </>
                                        );
                                    })()}

                                    <div className="prop-sdiv"></div>

                                    <div className="prop-stag"><span className="prop-sn">4</span><span className="prop-st">Proceso</span></div>
                                    <div className="prop-stitle">Pasos para obtener su Bono Energético</div>
                                    <div className="prop-srow">
                                        <div className="prop-sl"></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>01</div><div className="prop-pt">CEE Inicial</div><div className="prop-pd">Certificado antes de obra</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#5CB85C,#3D8B3D)' }}>02</div><div className="prop-pt">Reforma</div><div className="prop-pd">Mejora energética</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>03</div><div className="prop-pt">CEE Final</div><div className="prop-pd">Certificado posterior</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#5CB85C,#3D8B3D)' }}>04</div><div className="prop-pt">Facturas</div><div className="prop-pd">Recopilar facturas</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>05</div><div className="prop-pt">Expediente</div><div className="prop-pd">Tramitación CAE</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#5CB85C,#3D8B3D)' }}>06</div><div className="prop-pt">Justificación</div><div className="prop-pd">Verificación técnica</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>07</div><div className="prop-pt">Cobro</div><div className="prop-pd">Recepción importe</div></div>
                                    </div>
                                </div>
                                <div className="prop-mfoot"><span>BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L.</span><span><a href="mailto:info@brokergy.es">info@brokergy.es</a> · <a href="tel:623926179">623 926 179</a> · <a href="https://www.brokergy.es">brokergy.es</a></span></div>
                            </div>

                            {/* <!-- PAGINA 3 --> */}
                            <div className="prop-page">
                                <div className="prop-pb" style={{ paddingTop: '28px' }}>
                                    <div className="prop-stag"><span className="prop-sn">5</span><span className="prop-st">Documentación</span></div>
                                    <div className="prop-stitle">¿Qué debe preparar para continuar?</div>
                                    <p className="prop-sintro" style={{ marginBottom: '14px' }}>Para agilizar la tramitación, necesitaremos la siguiente documentación. Puede enviarla por email o WhatsApp.</p>
                                    <div className="prop-dcols">
                                        <div className="prop-dcol">
                                            <div className="prop-dph">Antes de la obra</div>

                                            <div className="prop-dgt">📐 Documentación técnica de la vivienda</div>
                                            <ul className="prop-dl">
                                                <li>Planos (si existen) o croquis de la vivienda</li>
                                                <li>Fotografías de la caldera existente:</li>
                                                <li className="s">Vista general instalada</li>
                                                <li className="s">Placa de características totalmente legible</li>
                                                <li className="s">Si no está instalada: fotos del hueco donde estaba</li>
                                                <li>Fotografías del sistema de emisión:</li>
                                                <li className="s">Radiadores (al menos uno por estancia)</li>
                                                <li className="s">Suelo radiante (foto del cuadro/colector)</li>
                                            </ul>

                                            <div className="prop-dgt">🏠 Documentación de envolvente</div>
                                            <ul className="prop-dl">
                                                <li>Vídeo recorriendo la vivienda mostrando:</li>
                                                <li className="s">Ventanas, puertas y accesos a exteriores</li>
                                                <li className="s">Estancias y distribución general</li>
                                                <li>Fotos de todas las paredes exteriores (incl. patios):</li>
                                                <li className="s">Ventanas y puertas</li>
                                                <li className="s">Cerramientos singulares</li>
                                            </ul>

                                            <div className="prop-dgt">➕ Mejoras que pueden aumentar la ayuda</div>
                                            <ul className="prop-dl">
                                                <li>Si valora mejorar ventanas o añadir aislamiento:</li>
                                                <li className="s">Fotografías y/o vídeos de los elementos a sustituir</li>
                                                <li className="s">Presupuestos disponibles (ventanas, aislamiento…)</li>
                                            </ul>
                                        </div>
                                        <div className="prop-dcol">
                                            <div className="prop-dph gr">Después de la obra</div>
                                            <p style={{ fontSize: '9.5px', color: 'var(--g500)', marginBottom: '8px', lineHeight: '1.5' }}>Una vez finalizada la instalación, debemos justificar técnicamente la actuación y emitir el CEE Final.</p>

                                            <div className="prop-dgt">📸 Documentación fotográfica</div>
                                            <ul className="prop-dl">
                                                <li>Fotos del desmontaje de la caldera antigua</li>
                                                <li>Fotos de la caldera antigua ya desmontada</li>
                                                <li>Fotos de la unidad exterior nueva:</li>
                                                <li className="s">Vista general instalada</li>
                                                <li className="s">Placa de características visible y legible</li>
                                                <li>Fotos de la unidad interior de ACS y/o depósitos de inercia, con sus placas identificativas</li>
                                            </ul>

                                            <div className="prop-dgt">📄 Documentación obligatoria</div>
                                            <ul className="prop-dl">
                                                <li>Todas las facturas de la instalación (materiales + mano de obra)</li>
                                                <li>Certificado RITE de la instalación térmica</li>
                                                <li>Si existen depósitos ACS, buffer o kits hidráulicos externos: fotos y placas identificativas</li>
                                            </ul>

                                            <div style={{ background: 'var(--green-light)', border: '1px solid rgba(92,184,92,0.15)', borderRadius: '6px', padding: '10px 12px', marginTop: '12px' }}>
                                                <p style={{ fontSize: '9.5px', fontWeight: '700', color: 'var(--green-dark)', marginBottom: '3px' }}>📩 ¿Cómo enviar la documentación?</p>
                                                <p style={{ fontSize: '9.5px', color: 'var(--g600)', lineHeight: '1.5' }}>Puede enviar toda la documentación a <strong>info@brokergy.es</strong> o por WhatsApp al <strong>623 926 179</strong>. No es necesario enviarla toda de una vez; puede ir recopilándola progresivamente.</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="prop-tipbar">
                                        <h5>⚠️ Recomendaciones para evitar retrasos en el expediente</h5>
                                        <p>Las placas de características deben ser completamente legibles. Las fotos deben hacerse con buena luz y evitando reflejos. Si la caldera antigua se retira antes de contactarnos, es imprescindible documentar bien el hueco donde estaba ubicada. Se debe comprobar que el modelo de aerotermia coincide exactamente con el presupuesto inicial, ya que afecta directamente al cálculo del CAE.</p>
                                    </div>

                                    <div style={{ background: 'var(--orange-light)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: '8px', padding: '14px 18px', marginTop: '14px', display: 'flex', gap: '18px', alignItems: 'center' }}>
                                        <div style={{ fontSize: '32px', flexShrink: 0 }}>💡</div>
                                        <div>
                                            <p style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--dark)', marginBottom: '3px' }}>¿Sabía que puede aumentar considerablemente su ayuda?</p>
                                            <p style={{ fontSize: '10px', color: 'var(--g600)', lineHeight: '1.55' }}>Si además de la aerotermia tiene previsto mejorar las ventanas o el aislamiento térmico de su vivienda, el ahorro energético certificado será mayor, lo que se traduce en un <strong>importe CAE significativamente superior</strong>. Consúltenos sin compromiso y le realizaremos una nueva simulación incluyendo estas mejoras.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="prop-mfoot"><span>BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L.</span><span><a href="mailto:info@brokergy.es">info@brokergy.es</a> · <a href="tel:623926179">623 926 179</a> · <a href="https://www.brokergy.es">brokergy.es</a></span></div>
                            </div>

                            {/* <!-- PAGINA 4 --> */}
                            <div className="prop-page">
                                <div className="prop-pb" style={{ paddingTop: '26px' }}>
                                    <div className="prop-stag"><span className="prop-sn">6</span><span className="prop-st">Condiciones</span></div>
                                    <div className="prop-stitle">Condiciones del acuerdo y costes del servicio</div>

                                    <div className="prop-cl-box ora">
                                        <h4>Cláusula 1 — Objeto del acuerdo</h4>
                                        <p>BROKERGY se compromete a realizar los Certificados de Eficiencia Energética (inicial y final) y a gestionar íntegramente el expediente del Certificado de Ahorro Energético (CAE) asociado a la actuación de mejora energética del cliente.</p>
                                    </div>

                                    <div className="prop-cl-box grn">
                                        <h4>Cláusula 2 — Cobro a éxito y desglose de costes</h4>
                                        <p>El cliente no deberá realizar ningún pago anticipado. Los costes serán descontados directamente del importe obtenido por la venta de los CAE, una vez resuelto favorablemente:</p>
                                        <div className="prop-cgrid">
                                            <div className="prop-crow"><span>Certificados de Eficiencia Energética (inicial + final){discountCerts && <em> (PROMOCIÓN BROKERGY 100% DTO.)</em>}</span><strong>{discountCerts ? <><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 220,00 €)</span>0,00 €</> : '220,00 €'}</strong></div>
                                            <div className="prop-crow"><span>Tasas registro de certificados de eficiencia energética{discountCerts && <em> (PROMOCIÓN BROKERGY 100% DTO.)</em>}</span><strong>{discountCerts ? <><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 32,78 €)</span>0,00 €</> : '32,78 €'}</strong></div>
                                            <div className="prop-crow"><span>Gestión técnica y adm. expediente CAE <em>(PROMOCIÓN BROKERGY 100% DTO.)</em></span><strong><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 450,00 €)</span>0,00 €</strong></div>
                                            <div className="prop-crow prop-ctot"><span>Total a descontar del importe del CAE</span><span>{formatNumber(totalDescuentoGestion)} € + IVA</span></div>
                                        </div>
                                        <div style={{ background: 'var(--green-light)', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', padding: '9px 12px', marginTop: '6px', alignItems: 'center', border: '1px solid rgba(92,184,92,0.2)' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--green-dark)' }}>Importe CAE neto que recibirá el cliente</span>
                                            <span style={{ fontSize: '15px', fontWeight: '900', color: 'var(--green-dark)' }}>{formatNumber(caeNeto)} €*</span>
                                        </div>
                                        <p style={{ marginTop: '4px', fontSize: '9px', color: 'var(--g400)', fontStyle: 'italic' }}>* Importe estimado resultante de descontar los costes de gestión del Bono Energético CAE.</p>
                                    </div>

                                    <div className="prop-cl-box">
                                        <h4>Cláusula 3 — Vinculación de servicios</h4>
                                        <p>La presente propuesta forma parte de una promoción vinculada a la realización de los CEE necesarios para la tramitación del expediente CAE. Los certificados emitidos por BROKERGY forman parte inseparable del mismo.</p>
                                    </div>

                                    <div className="prop-cl-box red">
                                        <h4>Cláusula 4 — Penalización por incumplimiento</h4>
                                        <p>Si los CEE son realizados por BROKERGY pero no se utilizan para gestionar el expediente CAE a través de BROKERGY —por causas ajenas a esta—, el cliente abonará en un máximo de 15 días naturales el importe total sin descuentos, en concepto de compensación:</p>
                                    </div>
                                    <div className="prop-ptable">
                                        <div className="prop-pthead">Desglose de penalización por incumplimiento</div>
                                        <div className="prop-ptrow"><span className="prop-pl">Certificados de Eficiencia Energética (inicial + final)</span><span className="prop-pv">220,00 €</span></div>
                                        <div className="prop-ptrow"><span className="prop-pl">Tasas registro de certificados de eficiencia energética</span><span className="prop-pv">32,78 €</span></div>
                                        <div className="prop-ptrow"><span className="prop-pl">Gestión técnica y adm. expediente CAE (sin dto.)</span><span className="prop-pv">450,00 €</span></div>
                                        <div className="prop-ptrow ptt"><span className="prop-pl">Total penalización</span><span className="prop-pv">702,78 € + IVA</span></div>
                                    </div>

                                    <div className="prop-cl-box">
                                        <h4>Cláusula 5 — Vigencia de la oferta</h4>
                                        <p>Propuesta válida <strong>2 meses</strong> desde la fecha de emisión. El importe estimado del Bono Energético CAE se mantendrá hasta septiembre de 2026. Transcurrido el plazo sin aceptación expresa, la propuesta quedará sin efecto.</p>
                                    </div>

                                    <div className="prop-cl-box">
                                        <h4>Cláusula 6 — Protección de datos</h4>
                                        <p>BROKERGY tratará los datos personales conforme al RGPD y la LO 3/2018 exclusivamente para la gestión del expediente CAE. Derechos: info@brokergy.es.</p>
                                    </div>
                                </div>

                                <div className="prop-cta">
                                    <h3>¿Listo para empezar a ahorrar?</h3>
                                    <p className="prop-csub">Acepte esta propuesta de forma digital y comenzaremos a trabajar en su expediente de inmediato.</p>
                                    <a href="https://brokergy.es/firma" target="_blank" rel="noopener noreferrer" className="prop-cta-btn">✍️&nbsp;&nbsp;FIRMAR Y ACEPTAR PROPUESTA</a>
                                    <p className="prop-cfn">Al firmar, acepta las condiciones descritas en este documento. Será redirigido a un formulario seguro.<br />© 2026 BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L. · CIF: B19350222</p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
