import React, { useState, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const API_URL = '/api/catastro';

function getTypeTag(type) {
    const typeUpper = (type || '').toUpperCase();
    if (typeUpper.includes('VIVIENDA')) return { class: 'tag-vivienda', icon: '🏠', label: 'Vivienda' };
    if (typeUpper.includes('ALMACEN')) return { class: 'tag-almacen', icon: '📦', label: 'Almacén' };
    if (typeUpper.includes('APARCAMIENTO') || typeUpper.includes('GARAJE')) return { class: 'tag-aparcamiento', icon: '🚗', label: 'Aparcamiento' };
    if (typeUpper.includes('LOCAL')) return { class: 'tag-local', icon: '🏪', label: 'Local' };
    if (typeUpper.includes('OFICINA')) return { class: 'tag-local', icon: '🏢', label: 'Oficina' };
    return { class: 'tag-otro', icon: '🏗️', label: type || 'Otro' };
}

function getFloorLabel(floor) {
    const num = parseInt(floor);
    if (num < 0) return `Sótano ${Math.abs(num)}`;
    if (num === 0) return 'Planta Baja';
    return `Planta ${num}`;
}

export function PropertySheet({ data, onCalculateDemand }) {
    const [copied, setCopied] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [parcelImageError, setParcelImageError] = useState(false);
    const pdfRef = useRef(null);
    const [generatingPdf, setGeneratingPdf] = useState(false);
    const [showDownloadMenu, setShowDownloadMenu] = useState(false); // New state for download menu
    const [selectedElements, setSelectedElements] = useState([]);

    // Actualizar selección cuando cambian los datos
    React.useEffect(() => {
        if (data.constructions) {
            const initialSelection = data.constructions
                .map((c, i) => (c.type || '').toUpperCase().includes('VIVIENDA') ? i : null)
                .filter(i => i !== null);
            setSelectedElements(initialSelection);
        }
    }, [data.constructions]);

    const toggleSelection = (idx) => {
        setSelectedElements(prev =>
            prev.includes(idx)
                ? prev.filter(i => i !== idx)
                : [...prev, idx]
        );
    };

    const currentSelectedSurface = (data.constructions && selectedElements.length > 0)
        ? data.constructions
            .filter((_, i) => selectedElements.includes(i))
            .reduce((acc, c) => acc + (c.surface || 0), 0)
        : data.summaryByType?.['VIVIENDA'] || data.totalSurface || 0;

    const currentSelectedFloors = (data.constructions && selectedElements.length > 0)
        ? new Set(data.constructions
            .filter((_, i) => selectedElements.includes(i))
            .map(c => c.floor)).size
        : data.floors?.total || 1;

    if (!data) return null;

    const handleGeneratePDF = async () => {
        if (!pdfRef.current) return;
        setGeneratingPdf(true);
        try {
            // Esperar un momento para asegurar renderizado de imágenes
            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await html2canvas(pdfRef.current, {
                scale: 2, // Mejorar calidad
                useCORS: true,
                logging: false,
                backgroundColor: '#1e1e2e',
                allowTaint: true
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth(); // 210mm
            const pdfHeight = pdf.internal.pageSize.getHeight(); // 297mm

            const imgProps = pdf.getImageProperties(imgData);
            const imgRatio = imgProps.width / imgProps.height;

            // Calcular altura basada en ancho de página
            let finalWidth = pdfWidth;
            let finalHeight = finalWidth / imgRatio;

            // Si la altura calculada es mayor que la página, escalar para ajustar a la altura (fit-to-page)
            if (finalHeight > pdfHeight) {
                finalHeight = pdfHeight;
                finalWidth = finalHeight * imgRatio;
            }

            // Centrar horizontalmente
            const xOffset = (pdfWidth - finalWidth) / 2;

            pdf.addImage(imgData, 'JPEG', xOffset, 0, finalWidth, finalHeight);
            pdf.save(`Ficha_Catastral_${data.rc}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error al generar el PDF. Asegúrate de que las imágenes se han cargado completamente.');
        } finally {
            setGeneratingPdf(false);
        }
    };

    const handleGenerateImage = async () => {
        if (!pdfRef.current) return;
        setGeneratingPdf(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 500));
            const canvas = await html2canvas(pdfRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#1e1e2e',
                allowTaint: true
            });

            const link = document.createElement('a');
            link.download = `Ficha_Catastral_${data.rc}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error generating image:', error);
            alert('Error al generar la imagen.');
        } finally {
            setGeneratingPdf(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const imageUrl = data.rc ? `${API_URL}/image/${data.rc}` : null;
    const parcelUrl = data.rc ? `${API_URL}/parcel-image/${data.rc}` : null;

    // Agrupar construcciones por planta
    const constructionsByFloor = {};
    (data.constructions || []).forEach(c => {
        if (!constructionsByFloor[c.floor]) {
            constructionsByFloor[c.floor] = [];
        }
        constructionsByFloor[c.floor].push(c);
    });

    const handleDownload = async (urlToDownload, prefix) => {
        if (!urlToDownload) return;
        try {
            const response = await fetch(urlToDownload, { mode: 'cors' });
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${prefix}_${data.rc}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            alert('Error al descargar la imagen');
        }
    };

    const handleOpenMap = () => {
        if (!data.provinceCode || !data.municipalityCode) {
            alert('Datos insuficientes para abrir el mapa directo.');
            return;
        }
        const url = `https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?del=${data.provinceCode}&mun=${data.municipalityCode}&refcat=${data.rc}`;
        window.open(url, '_blank');
    };

    const handleOpenPDF = () => {
        const rc1 = data.rc.substring(0, 7);
        const rc2 = data.rc.substring(7, 14);
        const url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCListaBienes.aspx?rc1=${rc1}&rc2=${rc2}&RCCompleta=${data.rc}`;
        window.open(url, '_blank');
    };

    const handleCalculateDemand = () => {
        const anio = data.yearBuilt || 2000;
        const plantas = currentSelectedFloors || 1;
        const superficie = currentSelectedSurface || 100;
        const rc = data.rc;
        const zona = data.climateInfo?.climateZone || 'D3';

        // Obtener participación
        const participationStr = (data.participation || '100,00').replace('%', '').replace(',', '.');
        const participation = parseFloat(participationStr);

        // Determinar tipo inicial:
        // - Si participación < 100% -> sugerimos 'piso' (división horizontal)
        // - Pero el usuario puede cambiarlo a 'hilera' si aplica
        const tipo = (participation < 100) ? 'piso' : 'unifamiliar';

        console.log('PropertySheet -> Calculator:', { anio, plantas, superficie, rc, zona, tipo, participation });

        if (onCalculateDemand) {
            onCalculateDemand({
                anio,
                plantas,
                superficie,
                rc,
                zona,
                tipo,
                participation,
                provincia: data.provinceCode || '',
                direccion: data.address || ''
            });
        }
    };

    return (
        <div className="space-y-6" ref={pdfRef}>
            {/* Main Card */}
            <div className="glass-card overflow-hidden">

                {/* Images Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 h-auto gap-0">
                    {/* Fachada Image */}
                    <div className="h-64 md:h-80 relative overflow-hidden group md:border-r border-white/10">
                        <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] md:text-xs font-semibold text-white/80 uppercase tracking-wider">
                            Fachada
                        </div>
                        {imageUrl && !imageError ? (
                            <>
                                <img
                                    src={imageUrl}
                                    alt="Fachada del inmueble"
                                    className="w-full h-full object-cover"
                                    crossOrigin="anonymous"
                                    onError={() => setImageError(true)}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDownload(imageUrl, 'fachada');
                                        }}
                                        className="btn-secondary flex items-center gap-2 cursor-pointer bg-black/50 hover:bg-black/70 border-white/20"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Descargar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/5">
                                <div className="text-center">
                                    <span className="text-white/30 text-sm">Sin imagen de fachada</span>
                                </div>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
                    </div>

                    {/* Parcel Map Image */}
                    <div className="h-64 md:h-80 relative overflow-hidden group">
                        <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] md:text-xs font-semibold text-white/80 uppercase tracking-wider">
                            Plano Catastral
                        </div>
                        {parcelUrl && !parcelImageError ? (
                            <>
                                <img
                                    src={parcelUrl}
                                    alt="Plano Catastral"
                                    className="w-full h-full object-cover"
                                    crossOrigin="anonymous"
                                    onError={() => setParcelImageError(true)}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDownload(parcelUrl, 'parcela');
                                        }}
                                        className="btn-secondary flex items-center gap-2 cursor-pointer bg-black/50 hover:bg-black/70 border-white/20"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Descargar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/5">
                                <div className="text-center">
                                    <span className="text-white/30 text-sm">Sin URL de mapa</span>
                                </div>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none"></div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8">
                    {/* RC Header (Selectable) */}
                    <div className="mb-6 pb-6 border-b border-white/10">
                        <div className="flex flex-col items-center md:items-start md:flex-row md:justify-between gap-6">
                            <div className="text-center md:text-left">
                                <p className="text-white/40 text-[10px] md:text-xs uppercase tracking-[0.2em] mb-2 font-bold">Referencia Catastral</p>
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                                    <h1 className="text-lg md:text-xl font-mono font-bold text-white select-all bg-white/5 px-4 py-2 rounded-lg border border-white/10 shadow-inner">
                                        {data.rc}
                                    </h1>
                                </div>
                            </div>
                            <div className="flex flex-row items-center justify-center gap-2 w-full md:w-auto">
                                {/* Link to Catastro (Sede) */}
                                <button
                                    onClick={handleOpenPDF}
                                    className="flex-1 btn-secondary text-[10px] sm:text-xs flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-white/10 px-2 sm:px-4 py-2.5 sm:py-2 min-h-[44px]"
                                    title="Ir a la Sede Electrónica del Catastro"
                                >
                                    <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    <span className="truncate">Enlace a Catastro</span>
                                </button>
                                {/* Link to Google Maps */}
                                <button
                                    onClick={() => {
                                        const query = encodeURIComponent(data.address);
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                                    }}
                                    className="flex-1 btn-secondary text-[10px] sm:text-xs flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-white/10 px-2 sm:px-4 py-2.5 sm:py-2 min-h-[44px]"
                                    title="Ver en Google Maps"
                                >
                                    <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="truncate">Ver en Maps</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Title & Actions */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 text-center md:text-left">
                        <div className="flex flex-col items-center md:items-start">
                            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Ficha Técnica</h2>
                            <p className="text-white/60 text-sm flex items-start justify-center md:justify-start gap-2 max-w-lg">
                                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                </svg>
                                <span className="leading-tight">{data.address}</span>
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 print:hidden">
                            {/* Download Button with Popup */}
                            <div className="relative w-full sm:w-auto">
                                <button
                                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                                    disabled={generatingPdf}
                                    className="btn-secondary text-sm flex items-center justify-center gap-2 w-full sm:w-auto py-3 sm:py-2.5"
                                    title="Descargar ficha"
                                >
                                    {generatingPdf ? (
                                        <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                    )}
                                    <span>{generatingPdf ? 'Generando...' : 'Descargar Ficha'}</span>
                                </button>

                                {showDownloadMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#1e1e2e] border border-white/20 rounded-xl shadow-xl z-50 overflow-hidden ring-1 ring-black ring-opacity-5 focus:outline-none">
                                        <div className="py-1">
                                            <button
                                                onClick={() => {
                                                    handleGeneratePDF();
                                                    setShowDownloadMenu(false);
                                                }}
                                                className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/10 flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                                Guardar como PDF
                                            </button>
                                            <button
                                                onClick={() => {
                                                    handleGenerateImage();
                                                    setShowDownloadMenu(false);
                                                }}
                                                className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/10 flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                Guardar como Imagen
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Calcular Demanda Button */}
                            <button
                                onClick={handleCalculateDemand}
                                className="btn-primary text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-lime-500 hover:from-amber-400 hover:to-lime-400 border-none text-slate-900 font-bold shadow-lg shadow-amber-500/20 w-full sm:w-auto py-3.5 sm:py-2.5"
                                title="Calcular Demanda Energética en Brokergy"
                            >
                                <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span>Calcular Demanda</span>
                            </button>
                        </div>
                    </div>

                    {/* Main Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-8">
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Uso Principal</p>
                            <p className="text-lg font-bold text-white">{data.use}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Año Construcción</p>
                            <p className="text-lg font-bold text-white">{data.yearBuilt || 'N/D'}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Superficie Cálculo</p>
                            <p className="text-lg font-bold text-white">{currentSelectedSurface} m²</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Nº Plantas</p>
                            <p className="text-lg font-bold text-white">{currentSelectedFloors}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Participación</p>
                            <p className="text-lg font-bold text-white">{(data.participation || '100,00').replace('%', '')}%</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-slate-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Tipo de Inmueble</p>
                            <p className="text-sm font-bold text-white leading-tight">
                                {data.typeCatastro || 'Parcela construida sin división horizontal'}
                            </p>
                        </div>
                    </div>

                    {/* UTM & Climate Data Grouped */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                        {/* UTM Coordinates */}
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                Coordenadas UTM
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1 font-bold">X (Este)</p>
                                    <p className="text-xl font-mono font-bold text-white leading-none">
                                        {data.utm?.x ? Math.round(data.utm.x) : 'N/D'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1 font-bold">Y (Norte)</p>
                                    <p className="text-xl font-mono font-bold text-white leading-none">
                                        {data.utm?.y ? Math.round(data.utm.y) : 'N/D'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Climate Data */}
                        {data.climateInfo && (
                            <div className="p-4 rounded-xl bg-white/5 border border-white/10 overflow-hidden relative">
                                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                    </svg>
                                    Datos Climáticos
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1 font-bold">Altitud</p>
                                        <p className="text-xl font-mono font-bold text-cyan-400 leading-none">
                                            {data.climateInfo.altitude} <span className="text-xs font-normal text-cyan-400/40">m</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1 font-bold">Zona CTE</p>
                                        <p className="text-xl font-black text-cyan-400 tracking-tighter leading-none">
                                            {data.climateInfo.climateZone}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Summary by Type */}
                    {data.summaryByType && Object.keys(data.summaryByType).length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Superficie por Uso
                            </h3>
                            <div className="flex flex-wrap justify-center md:justify-start gap-3">
                                {Object.entries(data.summaryByType).map(([type, surface]) => {
                                    const tagInfo = getTypeTag(type);
                                    return (
                                        <div key={type} className="flex items-center justify-between w-full sm:w-auto gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                                            <span className={`tag ${tagInfo.class}`}>
                                                {tagInfo.icon} {tagInfo.label}
                                            </span>
                                            <span className="text-white font-bold">{surface} m²</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Constructions Table */}
                    {data.constructions && data.constructions.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                Detalle de Construcciones
                            </h3>
                            <div className="rounded-xl bg-white/5 border border-white/10 overflow-x-auto scrollbar-thin">
                                <table className="data-table min-w-[600px]">
                                    <thead>
                                        <tr>
                                            <th className="w-10">Calc.</th>
                                            <th>Tipo</th>
                                            <th>Planta</th>
                                            <th>Código</th>
                                            <th className="text-right">Superficie</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.constructions.map((c, idx) => {
                                            const tagInfo = getTypeTag(c.type);
                                            const isSelected = selectedElements.includes(idx);
                                            return (
                                                <tr
                                                    key={idx}
                                                    onClick={() => toggleSelection(idx)}
                                                    className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary-500/10' : 'hover:bg-white/5 opacity-60'}`}
                                                >
                                                    <td className="text-center">
                                                        <div className={`w-5 h-5 rounded border ${isSelected ? 'bg-primary-500 border-primary-500' : 'border-white/20'} flex items-center justify-center`}>
                                                            {isSelected && (
                                                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`tag ${tagInfo.class}`}>
                                                            {tagInfo.icon} {tagInfo.label}
                                                        </span>
                                                    </td>
                                                    <td className="text-white/80">{getFloorLabel(c.floor)}</td>
                                                    <td className="font-mono text-white/60 text-sm">{c.code}</td>
                                                    <td className="text-right font-bold text-white">{c.surface} m²</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t border-white/10">
                                            <td colSpan={3} className="text-right font-semibold text-white/60 uppercase text-xs">Total</td>
                                            <td className="text-right font-bold text-xl text-white">{data.totalSurface} m²</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Source Footer */}
            <div className="text-center">
                <p className="text-white/30 text-sm flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Datos oficiales: {data.source}
                </p>
            </div>
        </div>
    );
}
