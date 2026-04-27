import React, { useState, useRef } from 'react';

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

export function PropertySheet({ data, onCalculateDemand, initialSelection }) {
    const [copied, setCopied] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [parcelImageError, setParcelImageError] = useState(false);
    const pdfRef = useRef(null);
    const [selectedElements, setSelectedElements] = useState([]);

    // Actualizar selección cuando cambian los datos
    React.useEffect(() => {
        if (data.constructions) {
            // Si ya tenemos una selección inicial (viniendo de la calculadora), la respetamos
            if (initialSelection && Array.isArray(initialSelection)) {
                setSelectedElements(initialSelection);
            } else {
                // Si no, inicializamos con todas las viviendas por defecto
                const initial = data.constructions
                    .map((c, i) => (c.type || '').toUpperCase().includes('VIVIENDA') ? i : null)
                    .filter(i => i !== null);
                setSelectedElements(initial);
            }
        }
    }, [data.constructions, initialSelection]);

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
        
        // Sup. Útil (Total Vivienda) vs Sup. Calefactable (Selección actual)
        const totalVivienda = data.summaryByType?.['VIVIENDA'] || data.totalSurface || 0;
        const superficie = totalVivienda;
        const superficieCalefactable = currentSelectedSurface || totalVivienda;

        const rc = data.rc;
        const zona = data.climateInfo?.climateZone || 'D3';

        // Obtener participación
        const participationStr = (data.participation || '100,00').replace('%', '').replace(',', '.');
        const participation = parseFloat(participationStr);

        const tipo = (participation < 100) ? 'piso' : 'unifamiliar';

        console.log('PropertySheet -> Calculator:', { anio, plantas, superficie, superficieCalefactable, rc, zona, tipo, participation });

        if (onCalculateDemand) {
            onCalculateDemand({
                anio,
                plantas,
                superficie,
                superficieCalefactable,
                selectedConstructions: selectedElements, // Persistimos los índices seleccionados
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
                    {/* Reorganized Header: Title, RC and Actions in one row */}
                    <div className="flex flex-col md:flex-row items-end justify-between gap-6 mb-10 pb-6 border-b border-white/10">
                        {/* Left Column: Title & Address */}
                        <div className="flex flex-col items-center md:items-start text-center md:text-left">
                            <h2 className="text-3xl font-black text-white mb-3">Ficha Técnica</h2>
                            <p className="text-white/60 text-sm flex items-start justify-center md:justify-start gap-2 max-w-lg">
                                <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                </svg>
                                <span className="leading-tight font-medium">{data.address}</span>
                            </p>
                        </div>

                        {/* Right Group: RC, Calculator and Links */}
                        <div className="flex flex-wrap items-center justify-center md:items-end md:justify-end gap-3 w-full md:w-auto">
                            {/* RC Display */}
                            <div className="flex flex-col gap-2 min-w-fit">
                                <p className="text-white/40 text-[10px] uppercase font-black tracking-[0.2em] ml-1">Referencia Catastral</p>
                                <div className="h-[52px] flex items-center bg-white/5 px-4 rounded-xl border border-white/10 shadow-inner">
                                    <span className="text-sm md:text-base font-mono font-black text-white select-all tracking-tight">{data.rc}</span>
                                </div>
                            </div>

                            {/* Calculator Button */}
                            <button
                                onClick={handleCalculateDemand}
                                className="h-[52px] px-8 bg-brand hover:bg-brand-400 text-bkg-deep font-black uppercase tracking-widest text-xs rounded-xl shadow-xl shadow-brand/20 transition-all active:scale-95 flex items-center justify-center gap-3"
                                title="Calcular Demanda Energética en Brokergy"
                            >
                                <svg className="w-5 h-5 font-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <div className="flex flex-col items-start leading-none gap-0.5">
                                    <span className="text-[9px] font-black opacity-60">Proceder a</span>
                                    <span className="text-xs font-black">Calculadora</span>
                                </div>
                            </button>

                            {/* Action Links */}
                            <div className="flex gap-2">
                                <button
                                    onClick={handleOpenPDF}
                                    className="h-[52px] px-4 btn-secondary text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-white/10 rounded-xl"
                                    title="Ir a la Sede Electrónica del Catastro"
                                >
                                    <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    <span className="hidden sm:inline">Enlace a Catastro</span>
                                </button>
                                <button
                                    onClick={() => {
                                        const query = encodeURIComponent(data.address);
                                        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
                                    }}
                                    className="h-[52px] px-4 btn-secondary text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border-white/10 rounded-xl"
                                    title="Ver en Google Maps"
                                >
                                    <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <span className="hidden sm:inline">Ver en Maps</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Año Construcción</p>
                            <p className="text-xl font-bold text-white leading-none">{data.yearBuilt || 'N/D'}</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Superficie Cálculo</p>
                            <p className="text-lg font-bold text-white">{currentSelectedSurface} m²</p>
                        </div>

                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xs text-white/40 uppercase tracking-wider">Inmueble</p>
                            <p className="text-[10px] font-bold text-white leading-tight uppercase tracking-tight">
                                {data.typeCatastro || 'Parcela sin división horizontal'}
                            </p>
                        </div>
                    </div>

                    {/* UTM & Climate Data */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                        {/* UTM Coordinates */}
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    <svg className="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                    </svg>
                                    Datos Climáticos
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1 font-bold">Altitud</p>
                                        <p className="text-xl font-mono font-bold text-brand leading-none">
                                            {data.climateInfo.altitude} <span className="text-xs font-normal text-brand/40">m</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-white/20 uppercase tracking-widest mb-1 font-bold">Zona CTE</p>
                                        <p className="text-xl font-black text-brand tracking-tighter leading-none">
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
