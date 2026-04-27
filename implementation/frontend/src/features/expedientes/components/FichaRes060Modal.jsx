import React, { useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation';

// ─── Márgenes exactos Word: Sup 2,47cm Inf 0,49cm Izq 3cm Der 2,5cm ──────────
// Conversión cm→px (96dpi): 1cm = 37.795px
// Sup=93px  Inf=19px  Izq=113px  Der=95px
// Fuente: Arial 12pt / Footnotes 8pt

const PAGE_PADDING = '93px 95px 19px 113px';

const DOC_CSS = `
    .doc-wrap { background: #e8e8e8; width: 794px; }
    .doc-page {
        font-family: 'Arial MT', Arial, Helvetica, sans-serif;
        font-size: 12pt;
        color: #000;
        background: white;
        width: 794px;
        min-height: 1123px;
        padding: ${PAGE_PADDING};
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin-bottom: 12px;
        box-shadow: 0 2px 16px rgba(0,0,0,0.18);
    }
    .doc-page:last-child { page-break-after: avoid; }
    .doc-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 12px;
        font-size: 12pt;
    }
    .doc-table td, .doc-table th {
        border: 1px solid #000;
        padding: 3px 5px;
        vertical-align: middle;
        line-height: 1.3;
    }
    .doc-table th {
        font-weight: normal;
        text-align: center;
        font-size: 11pt;
        padding: 2px 3px;
    }
    .doc-table td.lbl { background-color: #f2f2f2; }
    
    .table-no-border, .table-no-border td, .table-no-border th { border: none !important; }

    .doc-section-num {
        font-size: 12pt;
        font-weight: normal;
        text-align: center;
        margin: 16px 0 10px 0;
    }
    .doc-p {
        font-size: 12pt;
        line-height: 1.45;
        margin-bottom: 6px;
        text-align: justify;
    }
    .doc-formula {
        font-size: 12pt;
        margin: 10px 0 10px 20px;
        line-height: 1.6;
    }
    .doc-hr {
        border: none;
        border-top: 1px solid #000;
        width: 200px;
        margin: 10px 0 3px 0;
    }
    .doc-footnote {
        font-size: 8pt;
        line-height: 1.3;
        margin-top: 1px;
        text-align: justify;
    }
    .doc-spacer { flex: 1; }
    
    .calc-table-group { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; justify-content: space-between; }
    .calc-table { border-collapse: collapse; font-size: 11pt; }
    .calc-table th, .calc-table td { border: 1px solid #000; padding: 4px 2px; text-align: center; font-weight: normal; }
    .calc-table th { background-color: #f2f2f2; }
    
    .grey-row td { background-color: #d9d9d9; font-style: italic; font-weight: normal !important; }
`;

const PDF_CSS = `
body { margin: 0; padding: 0; }
.doc-page {
    font-family: 'Arial MT', Arial, Helvetica, sans-serif;
    font-size: 12pt;
    color: #000;
    background: white;
    width: 794px;
    height: 1122px;
    padding: ${PAGE_PADDING};
    box-sizing: border-box;
    page-break-after: always;
    display: flex;
    flex-direction: column;
}
.doc-page:last-child { page-break-after: avoid; }
@page { size: A4; margin: 0; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12pt; }
td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; line-height: 1.3; }
th { font-weight: normal; text-align: center; font-size: 11pt; padding: 2px 3px; }
td.lbl { background-color: #f2f2f2; }
.sec { font-size:12pt; font-weight:normal; text-align:center; margin:16px 0 10px; }
.p { font-size:12pt; line-height:1.45; margin-bottom:6px; text-align:justify; }
.formula { font-size:12pt; margin:10px 0 10px 20px; line-height:1.6; }
.doc-hr { border:none; border-top:1px solid #000; width:200px; margin:10px 0 3px 0; }
.fn { font-size:8pt; line-height:1.3; margin-top:1px; text-align:justify; }
.spacer { flex:1; }
.calc-table-group { display: flex; gap: 12px; margin-bottom: 12px; justify-content: space-between; align-items: flex-start; }
.calc-table { border-collapse: collapse; font-size: 11pt; }
.calc-table th, .calc-table td { border: 1px solid #000; padding: 4px 2px; text-align: center; font-weight: normal; }
.calc-table th { background-color: #f2f2f2; }
.grey-row td { background-color:#d9d9d9; font-style:italic; font-weight: normal !important; }
`;

// ─── Componente Principal ─────────────────────────────────────────────────────
export function FichaRes060Modal({ isOpen, onClose, expediente, results, onSaveDrive }) {
    const { user } = useAuth();
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [scale, setScale] = useState(1);

    const updateScale = useCallback(() => {
        if (!containerRef.current) return;
        const avail = containerRef.current.clientWidth - 48;
        setScale(avail < 794 ? avail / 794 : 1);
    }, []);

    React.useEffect(() => {
        if (!isOpen) return;
        updateScale();
        const t = setTimeout(updateScale, 80);
        window.addEventListener('resize', updateScale);
        return () => { clearTimeout(t); window.removeEventListener('resize', updateScale); };
    }, [isOpen, updateScale]);

    if (!isOpen || !expediente) return null;

    // ── DATA EXTRACTION ──
    const op   = expediente.oportunidades || {};
    const cli  = expediente.cliente || {};
    const inst = expediente.instalacion || {};
    const numexpte = expediente.numero_expediente || '';

    // ── Métricas para Header ──
    const aeKwh = Math.round(results?.savingsKwh || 0).toLocaleString('es-ES');
    const beneficioStr = Math.round((results?.savingsKwh || 0) * (results?.price_kwh || 0.10)).toLocaleString('es-ES');

    // Robust extraction of folderId
    const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;

    const doc     = expediente.documentacion || {};
    const cee     = expediente.cee           || {};

    const ceeFinal = cee.cee_final || {};
    const dcalRaw = parseFloat(ceeFinal.demandaCalefaccion) || 0;
    const dcal = dcalRaw.toFixed(2).replace('.', ',');

    const sRaw = parseFloat(ceeFinal.superficieHabitable) || 0;
    const sStr = sRaw.toFixed(2).replace('.', ',');

    const dacsStr = '2.731,40';

    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEffEntry = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId);
    const etaBoiler = boilerEffEntry?.value || 0.92;
    const etaStr = etaBoiler.toFixed(2).replace('.', ',');

    const scopCal = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCal ? scopCal.toFixed(2).replace('.', ',') : '—';

    const tieneAcs = (inst.cambio_acs !== false) && (!!inst.aerotermia_acs?.aerotermia_db_id || !!inst.misma_aerotermia_acs);
    const scopAcsRaw = tieneAcs ? parseFloat(inst.aerotermia_acs?.scop || inst.aerotermia_cal?.scop || 0) : null;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

    // El ahorro ya está calculado arriba como aeKwh

    const formatFecha = (isoDate) => {
        if (!isoDate) return '—';
        const d = new Date(isoDate + 'T00:00:00');
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
    };
    const fechaInicio = formatFecha(doc.fecha_inicio_cifo);
    const fechaFin    = formatFecha(doc.fecha_fin_cifo);

    const REPRESENTANTE_NOMBRE = 'Pedro José López Montero';
    const REPRESENTANTE_NIF    = '06239730-Z';

    // ═══════════════════════════════════════════════════════════════════════════
    // BUILD HTML PARA PDF
    // ═══════════════════════════════════════════════════════════════════════════
    const buildStaticHtml = () => {
        return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${PDF_CSS}</style>
</head><body>

<!-- PAGE 1 -->
<div class="doc-page">
<table style="margin-bottom:16px">
<tbody>
<tr style="background-color:#f2f2f2"><td style="width:15%">Ficha</td><td><strong>RES060: Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico.</strong></td></tr>
<tr><td>Código</td><td>RES060</td></tr>
<tr><td>Versión</td><td>V1.1</td></tr>
<tr><td>Sector</td><td>Residencial</td></tr>
</tbody>
</table>

<div class="sec">1. ÁMBITO DE APLICACIÓN</div>
<div class="p">Sustitución<sup>1</sup> de la caldera de combustión en un edificio de uso residencial privado<sup>2</sup> por una bomba de calor de accionamiento eléctrico tipo aire-aire, aire-agua, agua-agua, tierra-agua o tierra-aire para calefacción y/o agua caliente sanitaria (ACS). La actuación no afecta a los elementos terminales que configuran la instalación térmica.</div>
<div class="p">No son aplicables las bombas de calor cuyo compresor esté accionados térmicamente.</div>

<div class="sec">2. REQUISITOS</div>
<div class="p">Esta ficha no establece requisitos específicos, lo que en ningún caso exonera del cumplimiento de los requisitos de obligado cumplimiento establecidos en la normativa vigente: Reglamento de Instalaciones Térmicas en los Edificios (RITE), Reglamento europeo sobre los gases fluorados<sup>3</sup> u otras disposiciones en este Código Técnico de Edificación (CTE), ámbito de aplicación.</div>

<div class="sec">3. CÁLCULO DEL AHORRO DE ENERGÍA</div>
<div class="p">El ahorro de energía se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>
<div class="formula">&nbsp;&nbsp;&nbsp;AE<sub>TOTAL</sub> = F<sub>P</sub> · [ (D<sub>CAL</sub> · S ) · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP<sub>bdc</sub></sub>) + D<sub>ACS</sub> · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP<sub>dhw</sub></sub>)]</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>1</sup> Ver Anexo III para aquellos casos donde la caldera de combustión se mantenga para situaciones de emergencia, fortuita o de respaldo cuando las condiciones climáticas lo requieran en las zonas climáticas D1, D2, D3 y F1</div>
<div class="fn"><sup>2</sup> "Uso residencial privado" según el Anejo A "Terminología" del CTE DB HE (Documento Básico de Ahorro de Energía).</div>
<div class="fn"><sup>3</sup> Reglamento (UE) n.° 517/2014 del Parlamento Europeo y del Consejo, de 16 de abril de 2014 sobre los gases fluorados de efecto invernadero y por el que se deroga el Reglamento (CE) n.° 842/2006.</div>
</div>

<!-- PAGE 2 -->
<div class="doc-page">
<div class="p">Donde:</div>
<table style="border:none">
<tbody>
<tr><td style="width:13%;text-align:left;border:none">F<sub>P</sub></td><td style="text-align:left;border:none">Factor de ponderación<sup>4</sup></td><td style="width:16%;text-align:left;border:none">1</td></tr>
<tr><td style="text-align:left;border:none">D<sub>cal</sub></td><td style="text-align:left;border:none">Demanda de energía en calefacción del edificio or vivienda según certificado de eficiencia energética antes de la actuación</td><td style="text-align:left;border:none">kWh/m<sup>2</sup> · año</td></tr>
<tr><td style="text-align:left;border:none">S</td><td style="text-align:left;border:none">Superficie útil habitable del edificio or vivienda</td><td style="text-align:left;border:none">m<sup>2</sup></td></tr>
<tr><td style="text-align:left;border:none">D<sub>ACS</sub></td><td style="text-align:left;border:none">Demanda de energía en agua caliente sanitaria del edificio or vivienda según certificado de eficiencia energética antes de la actuación</td><td style="text-align:left;border:none">kWh/año</td></tr>
<tr><td style="text-align:left;border:none">η<sub>i</sub></td><td style="text-align:left;border:none">Rendimiento de caldera combustible fósil<sup>5</sup> sobre energía final referido a PCS<sup>6, 7</sup></td><td style="text-align:left;border:none">0,92</td></tr>
<tr><td style="text-align:left;border:none">SCOP</td><td style="text-align:left;border:none">Coeficiente de rendimiento estacional de la bomba calor en calefacción<sup>8</sup></td><td style="text-align:left;border:none"></td></tr>
<tr><td style="text-align:left;border:none"><em>SCOP<sub>dhw</sub></em></td><td style="text-align:left;border:none">Coeficiente de rendimiento estacional de la bomba de calor en ACS<sup>9</sup></td><td style="text-align:left;border:none"></td></tr>
<tr><td style="text-align:left;border:none">AE<sub>TOTAL</sub></td><td style="text-align:left;border:none">Ahorro anual de energía final total</td><td style="text-align:left;border:none">kWh/año</td></tr>
</tbody>
</table>

<div class="sec">4. RESULTADO DEL CÁLCULO</div>

<div class="calc-table-group" style="width: 100%; display: flex; justify-content: space-between">
    <table class="calc-table" style="width: 72%">
        <thead>
            <tr><th>F<sub>p</sub></th><th>D<sub>CAL</sub></th><th>S</th><th>D<sub>ACS</sub></th><th>η<sub>i</sub></th><th>SCOP</th><th>SCOP<sub>dhw</sub></th></tr>
        </thead>
        <tbody>
            <tr><td>1</td><td>${dcal}</td><td>${sStr}</td><td>${dacsStr}</td><td>${etaStr}</td><td>${scopCalStr}</td><td>${scopAcsStr}</td></tr>
        </tbody>
    </table>
    
    <table class="calc-table" style="width: 16%">
        <thead>
            <tr><th>AE<sub>TOTAL</sub></th></tr>
        </thead>
        <tbody>
            <tr><td>${aeKwh}</td></tr>
        </tbody>
    </table>
    
    <table class="calc-table" style="width: 8%">
        <thead>
            <tr><th><em>D<sub>i</sub></em></th></tr>
        </thead>
        <tbody>
            <tr><td>15</td></tr>
        </tbody>
    </table>
</div>

<table style="border:none; margin-bottom:12px"><tbody>
<tr class="grey-row" style="border:none">
    <td style="width:8%; border:none"><em>D<sub>i</sub></em></td>
    <td style="border:none"><em>Duración indicativa de la actuación<sup>10</sup></em></td>
    <td style="text-align:left; width:12%; border:none"><em>años</em></td>
</tr>
</tbody></table>

<table><tbody>
<tr><td class="lbl" style="width:38%">Fecha inicio actuación</td><td>${fechaInicio}</td></tr>
<tr><td class="lbl">Fecha fin actuación</td><td>${fechaFin}</td></tr>
</tbody></table>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>4</sup> Factor de ponderación para ajustar el valor de la demanda de energía estimado por métodos reconocidos al valor del consumo real de energía final.</div>
<div class="fn"><sup>5</sup> Apartado 4.5 del Documento básico de Ahorro de Energía del Código Técnico de la Edificación (DB HE0 CTE).</div>
<div class="fn"><sup>6</sup> Para la conversión de PCI a PCS se usará la fórmula (PCS = PCI x F<sub>conv</sub>). Para gas natural se utilizará el factor de conversión de F<sub>conv</sub>= 1,106, para gasóleo F<sub>conv</sub>= 1,059, para propano F<sub>conv</sub>= 1,087 y para butano F<sub>conv</sub>= 1,083, según Tabla CB-01 Poderes caloríficos de los combustibles del documento "Diseño de centrales de calor eficientes".<br>https://www.idae.es/uploads/documentos/documentos_11_Guia_tecnica_de_diseno_de_centrales_de_calor_eficientes_e63f312e.pdf</div>
<div class="fn"><sup>7</sup> O alternativamente el valor de la última inspección.</div>
<div class="fn"><sup>8</sup> Ver Anexos III y IV. En caso de secuencia de varias bombas de calor, el SCOP utilizado en esta expresión será el ponderado, en el caso de ser de diferentes características.</div>
<div class="fn"><sup>9</sup> Ver Anexo IV y V de condiciones generales para cálculo de la eficiencia estacional anual en lo relativo al calentamiento de ACS.</div>
<div class="fn"><sup>10</sup> Según Recomendación (UE) 2019/1658, de la Comisión, de 25 de septiembre, relativa a la transposición de la obligación de ahorro de energía en virtud de la Directiva de eficiencia energética, o en su defecto a criterio de la persona técnica responsable.</div>
</div>

<!-- PAGE 3 -->
<div class="doc-page">
<table style="margin-bottom:20px"><tbody>
<tr><td style="width:38%;background-color:#f2f2f2">Representante del solicitante</td><td>${REPRESENTANTE_NOMBRE}</td></tr>
<tr><td style="background-color:#f2f2f2">NIF/NIE</td><td>${REPRESENTANTE_NIF}</td></tr>
<tr><td style="background-color:#f2f2f2">Firma electrónica</td><td></td></tr>
</tbody></table>

<div class="sec">5. DOCUMENTACIÓN PARA JUSTIFICAR LOS AHORROS DE LA ACTUACIÓN Y SU REALIZACIÓN</div>

<div class="p" style="text-indent:28px">1. Ficha cumplimentada y firmada por el representante legal del solicitante de la emisión de CAE.</div>
<div class="p" style="text-indent:28px">2. Declaración responsable formalizada por el propietario inicial del ahorro de energía final referida a la solicitud y/u obtención de ayudas públicas para la misma actuación de ahorro de energía según el modelo del Anexo I de esta ficha.</div>
<div class="p" style="text-indent:28px">3. Facturas justificativas de la inversión realizada<sup>11</sup> que incluyan una descripción detallada de los elementos principales (por ejemplo, aquellos de cuya ficha técnica se toman datos para calcular el ahorro).</div>
<div class="p" style="text-indent:28px">4. Informe fotográfico de la instalación térmica antes y después de la actuación.</div>
<div class="p" style="text-indent:28px">5. Certificado de la instalación de la empresa instaladora donde se detallen los valores de las variables de la fórmula de cálculo del ahorro de energía del apartado 3.</div>
<div class="p" style="text-indent:28px">6. Copia de la comunicación<sup>12</sup> de puesta en funcionamiento de la instalación térmica, no industrial, presentada en el registro habilitado por el órgano competente de la comunidad autónoma.</div>
<div class="p" style="text-indent:28px">7. Certificado final de eficiencia energética del edificio<sup>13</sup> con el justificante de registro. Alternativamente se admitirá el certificado correspondiente al estado previo justo antes del inicio de la actuación, con el justificante de registro, y que incluya como mejora la actuación objeto del ahorro energético.</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>11</sup> Todas las facturas deben contener, como mínimo, los datos y requisitos exigidos por la Agencia Tributaria.</div>
<div class="fn"><sup>12</sup> Si la potencia no es superior a 70 kW, podrá sustituirse la comunicación por el acta de puesta en servicio, si la instalación térmica ya está inscrita en el registro habilitado y la sustitución es total no parcial de la caldera.</div>
<div class="fn"><sup>13</sup> Para la elaboración del certificado se debe emplear una herramienta informática de las registradas como documentos reconocidos para la certificación de la eficiencia energética de los edificios.</div>
</div>

</body></html>`;
    };

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildStaticHtml() });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${numexpte || 'DRAFT'} - Ficha RES060.pdf`;
            a.click();
        } catch { alert('Error al generar el PDF.'); }
        finally { setGenerating(false); }
    };

    const handleSaveToDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) { alert('No se encontró el identificador de la carpeta de Drive en la oportunidad.'); return; }
        setSavingDrive(true);
        try {
            const { data } = await axios.post('/api/pdf/save-to-drive', {
                html: buildStaticHtml(),
                folderId,
                fileName: `${numexpte || 'DRAFT'} - Ficha RES060`,
                subfolderName: '6. ANEXOS CAE'
            });
            if (data.driveLink) {
                if (onSaveDrive) onSaveDrive(data.driveLink);
                alert('✅ Guardado en Drive (carpeta 6. ANEXOS CAE)');
            }
        } catch { alert('Error al guardar en Drive.'); }
        finally { setSavingDrive(false); }
    };

    const handleSendByEmail = async () => {
        const toEmail = cli.email;
        if (!toEmail) {
            alert("❌ El cliente no tiene un email registrado.");
            return;
        }
        setSendingEmail(true);
        try {
            const summaryData = {
                id: numexpte,
                docType: 'Ficha RES060',
                userName: [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ')
            };

            const response = await axios.post('/api/pdf/send-proposal', {
                html: buildStaticHtml(),
                to: toEmail,
                userName: summaryData.userName,
                summaryData: { ...summaryData, id: numexpte }
            });

            if (response.data.success) {
                alert(`✅ Ficha RES060 enviada correctamente a ${toEmail}`);
            }
        } catch (error) {
            console.error('Error sending email:', error);
            alert("❌ Error al enviar el correo: " + (error.response?.data?.message || error.message));
        } finally {
            setSendingEmail(false);
        }
    };

    const handleSendByWhatsapp = async () => {
        const toPhone = cli.tlf || cli.telefono || opInputs?.phone;
        if (!toPhone) {
            alert("❌ El cliente no tiene un teléfono registrado.");
            return;
        }
        setSendingWhatsapp(true);
        try {
            // 1. Comprobar WhatsApp status
            const st = await axios.get('/api/whatsapp/status');
            if (!st.data?.ready) {
                alert("❌ WhatsApp no está conectado.");
                return;
            }

            // 2. Generar PDF
            const pdfResp = await axios.post('/api/pdf/generate', { html: buildStaticHtml() });
            const pdfBase64 = pdfResp.data?.pdf;

            // 3. Construir mensaje
            const firstName = (cli.nombre_razon_social || '').split(/\s+/)[0];
            const caption = `Hola ${firstName},\n\nTe adjunto la *Ficha RES060* de tu expediente *${numexpte}*.\n\nUn saludo,\n*BROKERGY*`;

            // 4. Enviar
            await axios.post('/api/whatsapp/send-media', {
                phone: toPhone,
                caption,
                media: { base64: pdfBase64, filename: `${numexpte}_Ficha_RES060.pdf`, mimetype: 'application/pdf' },
                asDocument: true,
            });

            alert(`✅ Ficha RES060 enviada por WhatsApp correctamente.`);
        } catch (error) {
            console.error('Error sending WhatsApp:', error);
            alert("❌ Error al enviar por WhatsApp: " + (error.response?.data?.message || error.message));
        } finally {
            setSendingWhatsapp(false);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" 
                 style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                
                {/* ── Toolbar ── */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-wider uppercase">Ficha RES060</h2>
                            <p className="text-white/30 text-xs mt-0.5">{numexpte} · 3 páginas</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Métricas rápidas */}
                        <div className="hidden sm:flex items-center gap-4 mr-3 pr-3 border-r border-white/10">
                            <div className="text-center">
                                <div className="text-brand font-black text-sm">{aeKwh} kWh</div>
                                <div className="text-white/25 text-[10px] uppercase tracking-wider">Ahorro</div>
                            </div>
                            <div className="text-center">
                                <div className="text-amber-400 font-black text-sm">{beneficioStr} €</div>
                                <div className="text-white/25 text-[10px] uppercase tracking-wider">Bono CAE</div>
                            </div>
                        </div>
                        {user?.rol?.toUpperCase() === 'ADMIN' && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={savingDrive || generating || sendingEmail || sendingWhatsapp}
                                title="Guardar en Drive"
                                className="text-white/40 hover:text-blue-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                            >
                                {savingDrive ? (
                                    <div className="w-5 h-5 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                    </svg>
                                )}
                            </button>
                        )}

                        {/* Botón ENVIAR POR EMAIL */}
                        <button
                            onClick={handleSendByEmail}
                            disabled={sendingEmail || generating || savingDrive || sendingWhatsapp}
                            title="Enviar por Correo"
                            className="text-white/40 hover:text-brand w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                        >
                            {sendingEmail ? (
                                <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" />
                                </svg>
                            )}
                        </button>

                        {/* Botón ENVIAR POR WHATSAPP */}
                        <button
                            onClick={handleSendByWhatsapp}
                            disabled={sendingWhatsapp || generating || savingDrive || sendingEmail}
                            title="Enviar por WhatsApp"
                            className="text-white/40 hover:text-emerald-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                        >
                            {sendingWhatsapp ? (
                                <div className="w-5 h-5 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                            ) : (
                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                            )}
                        </button>

                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive || sendingEmail || sendingWhatsapp} 
                                className="flex items-center gap-2 px-5 py-2 bg-brand text-white text-xs font-black rounded-xl uppercase tracking-wider hover:bg-brand/90 transition-all disabled:opacity-30">
                            {generating ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                            {generating ? 'Generando...' : 'Descargar PDF'}
                        </button>
                    </div>
                </div>

                {/* Área scrolleable */}
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center">
                    <div className="inline-block text-left" 
                         style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 794, flexShrink: 0 }}>
                        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />

                        <div className="doc-wrap">

                            {/* ══════════ PÁGINA 1 ══════════ */}
                            <div className="doc-page">
                                <table className="doc-table" style={{ marginBottom: 16 }}>
                                    <tbody>
                                        <tr style={{ backgroundColor: '#f2f2f2' }}><td style={{ width: '15%' }}>Ficha</td><td><strong>RES060: Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico.</strong></td></tr>
                                        <tr><td>Código</td><td>RES060</td></tr>
                                        <tr><td>Versión</td><td>V1.1</td></tr>
                                        <tr><td>Sector</td><td>Residencial</td></tr>
                                    </tbody>
                                </table>

                                <div className="doc-section-num">1. ÁMBITO DE APLICACIÓN</div>
                                <div className="doc-p">Sustitución<sup>1</sup> de la caldera de combustión en un edificio de uso residencial privado<sup>2</sup> por una bomba de calor de accionamiento eléctrico tipo aire-aire, aire-agua, agua-agua, tierra-agua o tierra-aire para calefacción y/o agua caliente sanitaria (ACS). La actuación no afecta a los elementos terminales que configuran la instalación térmica.</div>
                                <div className="doc-p">No son aplicables las bombas de calor cuyo compresor esté accionados térmicamente.</div>

                                <div className="doc-section-num">2. REQUISITOS</div>
                                <div className="doc-p">Esta ficha no establece requisitos específicos, lo que en ningún caso exonera del cumplimiento de los requisitos de obligado cumplimiento establecidos en la normativa vigente: Reglamento de Instalaciones Térmicas en los Edificios (RITE), Reglamento europeo sobre los gases fluorados<sup>3</sup> u otras disposiciones en este Código Técnico de Edificación (CTE), ámbito de aplicación.</div>

                                <div className="doc-section-num">3. CÁLCULO DEL AHORRO DE ENERGÍA</div>
                                <div className="doc-p">El ahorro de energía se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>
                                <div className="doc-formula">
                                    &nbsp;&nbsp;&nbsp;AE<sub>TOTAL</sub> = F<sub>P</sub> · [ (D<sub>CAL</sub> · S ) · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP<sub>bdc</sub></sub>) + D<sub>ACS</sub> · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP<sub>dhw</sub></sub>)]
                                </div>

                                <div className="doc-spacer" />
                                <hr className="doc-hr"/>
                                <div className="doc-footnote"><sup>1</sup> Ver Anexo III para aquellos casos donde la caldera de combustión se mantenga para situaciones de emergencia, fortuita o de respaldo cuando las condiciones climáticas lo requieran en las zonas climáticas D1, D2, D3 y F1</div>
                                <div className="doc-footnote"><sup>2</sup> "Uso residencial privado" según el Anejo A "Terminología" del CTE DB HE (Documento Básico de Ahorro de Energía).</div>
                                <div className="doc-footnote"><sup>3</sup> Reglamento (UE) n.° 517/2014 del Parlamento Europeo y del Consejo, de 16 de abril de 2014 sobre los gases fluorados de efecto invernadero y por el que se deroga el Reglamento (CE) n.° 842/2006.</div>
                            </div>

                            {/* ══════════ PÁGINA 2 ══════════ */}
                            <div className="doc-page">
                                <div className="doc-p">Donde:</div>

                                <table className="doc-table table-no-border">
                                    <tbody>
                                        <tr><td style={{ width: '13%', textAlign: 'left' }}>F<sub>P</sub></td><td style={{ textAlign: 'left' }}>Factor de ponderación<sup>4</sup></td><td style={{ width: '16%', textAlign: 'left' }}>1</td></tr>
                                        <tr><td style={{ textAlign: 'left' }}>D<sub>cal</sub></td><td style={{ textAlign: 'left' }}>Demanda de energía en calefacción del edificio o vivienda según certificado de eficiencia energética antes de la actuación</td><td style={{ textAlign: 'left' }}>kWh/m<sup>2</sup> · año</td></tr>
                                        <tr><td style={{ textAlign: 'left' }}>S</td><td style={{ textAlign: 'left' }}>Superficie útil habitable del edificio o vivienda</td><td style={{ textAlign: 'left' }}>m<sup>2</sup></td></tr>
                                        <tr><td style={{ textAlign: 'left' }}>D<sub>ACS</sub></td><td style={{ textAlign: 'left' }}>Demanda de energía en agua caliente sanitaria del edificio o vivienda según certificado de eficiencia energética antes de la actuación</td><td style={{ textAlign: 'left' }}>kWh/año</td></tr>
                                        <tr><td style={{ textAlign: 'left' }}>η<sub>i</sub></td><td style={{ textAlign: 'left' }}>Rendimiento de caldera combustible fósil<sup>5</sup> sobre energía final referido a PCS<sup>6, 7</sup></td><td style={{ textAlign: 'left' }}>0,92</td></tr>
                                        <tr><td style={{ textAlign: 'left' }}>SCOP</td><td style={{ textAlign: 'left' }}>Coeficiente de rendimiento estacional de la bomba calor en calefacción<sup>8</sup></td><td style={{ textAlign: 'left' }}></td></tr>
                                        <tr><td style={{ textAlign: 'left' }}><em>SCOP<sub>dhw</sub></em></td><td style={{ textAlign: 'left' }}>Coeficiente de rendimiento estacional de la bomba de calor en ACS<sup>9</sup></td><td style={{ textAlign: 'left' }}></td></tr>
                                        <tr><td style={{ textAlign: 'left' }}>AE<sub>TOTAL</sub></td><td style={{ textAlign: 'left' }}>Ahorro anual de energía final total</td><td style={{ textAlign: 'left' }}>kWh/año</td></tr>
                                    </tbody>
                                </table>

                                <div className="doc-section-num">4. RESULTADO DEL CÁLCULO</div>

                                <div className="calc-table-group" style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }}>
                                    <table className="calc-table" style={{ width: '72%' }}>
                                        <thead>
                                            <tr><th>F<sub>p</sub></th><th>D<sub>CAL</sub></th><th>S</th><th>D<sub>ACS</sub></th><th>η<sub>i</sub></th><th>SCOP</th><th>SCOP<sub>dhw</sub></th></tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>1</td><td>{dcal}</td><td>{sStr}</td><td>{dacsStr}</td><td>{etaStr}</td><td>{scopCalStr}</td><td>{scopAcsStr}</td></tr>
                                        </tbody>
                                    </table>
                                    
                                    <table className="calc-table" style={{ width: '16%' }}>
                                        <thead>
                                            <tr><th>AE<sub>TOTAL</sub></th></tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>{aeKwh}</td></tr>
                                        </tbody>
                                    </table>
                                    
                                    <table className="calc-table" style={{ width: '8%' }}>
                                        <thead>
                                            <tr><th><em>D<sub>i</sub></em></th></tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>15</td></tr>
                                        </tbody>
                                    </table>
                                </div>

                                <table className="doc-table table-no-border" style={{ marginBottom: 12 }}>
                                    <tbody>
                                        <tr className="grey-row">
                                            <td style={{ width: '8%' }}><em>D<sub>i</sub></em></td>
                                            <td><em>Duración indicativa de la actuación<sup>10</sup></em></td>
                                            <td style={{ textAlign: 'left', width: '12%' }}><em>años</em></td>
                                        </tr>
                                    </tbody>
                                </table>

                                <table className="doc-table">
                                    <tbody>
                                        <tr><td className="lbl" style={{ width: '38%' }}>Fecha inicio actuación</td><td>{fechaInicio}</td></tr>
                                        <tr><td className="lbl">Fecha fin actuación</td><td>{fechaFin}</td></tr>
                                    </tbody>
                                </table>

                                <div className="doc-spacer" />
                                <hr className="doc-hr"/>
                                <div className="doc-footnote"><sup>4</sup> Factor de ponderación para ajustar el valor de la demanda de energía estimado por métodos reconocidos al valor del consumo real de energía final.</div>
                                <div className="doc-footnote"><sup>5</sup> Apartado 4.5 del Documento básico de Ahorro de Energía del Código Técnico de la Edificación (DB HE0 CTE).</div>
                                <div className="doc-footnote"><sup>6</sup> Para la conversión de PCI a PCS se usará la fórmula (PCS = PCI x F<sub>conv</sub>). Para gas natural se utilizará el factor de conversión de F<sub>conv</sub>= 1,106, para gasóleo F<sub>conv</sub>= 1,059, para propano F<sub>conv</sub>= 1,087 y para butano F<sub>conv</sub>= 1,083, según Tabla CB-01 Poderes caloríficos de los combustibles del documento "Diseño de centrales de calor eficientes". https://www.idae.es/uploads/documentos/documentos_11_Guia_tecnica_de_diseno_de_centrales_de_calor_eficientes_e63f312e.pdf</div>
                                <div className="doc-footnote"><sup>7</sup> O alternativamente el valor de la última inspección.</div>
                                <div className="doc-footnote"><sup>8</sup> Ver Anexos III y IV. En caso de secuencia de varias bombas de calor, el SCOP utilizado en esta expresión será el ponderado, en el caso de ser de diferentes características.</div>
                                <div className="doc-footnote"><sup>9</sup> Ver Anexo IV y V de condiciones generales para cálculo de la eficiencia estacional anual en lo relativo al calentamiento de ACS.</div>
                                <div className="doc-footnote"><sup>10</sup> Según Recomendación (UE) 2019/1658, de la Comisión, de 25 de septiembre, relativa a la transposición de la obligación de ahorro de energía en virtud de la Directiva de eficiencia energética, o en su defecto a criterio de la persona técnica responsable.</div>
                            </div>

                            {/* ══════════ PÁGINA 3 ══════════ */}
                            <div className="doc-page">
                                <table className="doc-table" style={{ marginBottom: 20 }}>
                                    <tbody>
                                        <tr><td style={{ width: '38%', backgroundColor: '#f2f2f2' }}>Representante del solicitante</td><td>{REPRESENTANTE_NOMBRE}</td></tr>
                                        <tr><td style={{ backgroundColor: '#f2f2f2' }}>NIF/NIE</td><td>{REPRESENTANTE_NIF}</td></tr>
                                        <tr><td style={{ backgroundColor: '#f2f2f2' }}>Firma electrónica</td><td></td></tr>
                                    </tbody>
                                </table>

                                <div className="doc-section-num">5. DOCUMENTACIÓN PARA JUSTIFICAR LOS AHORROS DE LA ACTUACIÓN Y SU REALIZACIÓN</div>

                                <div className="doc-p" style={{ textIndent: 28 }}>1. Ficha cumplimentada y firmada por el representante legal del solicitante de la emisión de CAE.</div>
                                <div className="doc-p" style={{ textIndent: 28 }}>2. Declaración responsable formalizada por el propietario inicial del ahorro de energía final referida a la solicitud y/u obtención de ayudas públicas para la misma actuación de ahorro de energía según el modelo del Anexo I de esta ficha.</div>
                                <div className="doc-p" style={{ textIndent: 28 }}>3. Facturas justificativas de la inversión realizada<sup>11</sup> que incluyan una descripción detallada de los elementos principales (por ejemplo, aquellos de cuya ficha técnica se toman datos para calcular el ahorro).</div>
                                <div className="doc-p" style={{ textIndent: 28 }}>4. Informe fotográfico de la instalación térmica antes y después de la actuación.</div>
                                <div className="doc-p" style={{ textIndent: 28 }}>5. Certificado de la instalación de la empresa instaladora donde se detallen los valores de las variables de la fórmula de cálculo del ahorro de energía del apartado 3.</div>
                                <div className="doc-p" style={{ textIndent: 28 }}>6. Copia de la comunicación<sup>12</sup> de puesta en funcionamiento de la instalación térmica, no industrial, presentada en el registro habilitado por el órgano competente de la comunidad autónoma.</div>
                                <div className="doc-p" style={{ textIndent: 28 }}>7. Certificado final de eficiencia energética del edificio<sup>13</sup> con el justificante de registro. Alternativamente se admitirá el certificado correspondiente al estado previo justo antes del inicio de la actuación, con el justificante de registro, and que incluya como mejora la actuación objeto del ahorro energético.</div>

                                <div className="doc-spacer" />
                                <hr className="doc-hr"/>
                                <div className="doc-footnote"><sup>11</sup> Todas las facturas deben contener, como mínimo, los datos y requisitos exigidos por la Agencia Tributaria.</div>
                                <div className="doc-footnote"><sup>12</sup> Si la potencia no es superior a 70 kW, podrá sustituirse la comunicación por el acta de puesta en servicio, si la instalación térmica ya está inscrita en el registro habilitado y la sustitución es total no parcial de la caldera.</div>
                                <div className="doc-footnote"><sup>13</sup> Para la elaboración del certificado se debe emplear una herramienta informática de las registradas como documentos reconocidos para la certificación de la eficiencia energética de los edificios.</div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Spinner component locally
function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );
}
