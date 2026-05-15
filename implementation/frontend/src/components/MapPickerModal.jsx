import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { DwellingPicker } from './DwellingPicker';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let leafletPromise = null;

function loadLeaflet() {
    if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
        // CSS (idempotente)
        if (!document.querySelector(`link[data-leaflet]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS;
            link.setAttribute('data-leaflet', 'true');
            document.head.appendChild(link);
        }

        const existing = document.querySelector('script[data-leaflet]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.L));
            existing.addEventListener('error', reject);
            if (window.L) resolve(window.L);
            return;
        }

        const script = document.createElement('script');
        script.src = LEAFLET_JS;
        script.async = true;
        script.setAttribute('data-leaflet', 'true');
        script.onload = () => resolve(window.L);
        script.onerror = reject;
        document.body.appendChild(script);
    });

    return leafletPromise;
}

export function MapPickerModal({ initialLat, initialLng, onConfirm, onCancel }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const debounceRef = useRef(null);

    const [ready, setReady] = useState(false);
    const [coords, setCoords] = useState({ lat: initialLat, lng: initialLng });
    const [resolving, setResolving] = useState(false);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);
    const [pickingDwelling, setPickingDwelling] = useState(false);

    const handleSelectDwelling = async (dwelling) => {
        if (!preview || dwelling.rc === preview.rc) return;
        setPickingDwelling(true);
        try {
            const res = await axios.get('/api/catastro/property-data', { params: { rc: dwelling.rc } });
            setPreview({ rc: res.data.rc, address: res.data.address, fullData: res.data });
        } catch (err) {
            console.error('No se pudo cargar la vivienda', err);
            setError('No se pudo cargar la vivienda seleccionada.');
        } finally {
            setPickingDwelling(false);
        }
    };

    // Init Leaflet map once
    useEffect(() => {
        let cancelled = false;

        loadLeaflet()
            .then((L) => {
                if (cancelled || !containerRef.current) return;

                const map = L.map(containerRef.current, {
                    center: [initialLat, initialLng],
                    zoom: 20,
                    minZoom: 5,
                    maxZoom: 22,
                    zoomControl: true,
                    attributionControl: true
                });

                // Base: OpenStreetMap (tiles solo existen hasta zoom 19 → escalamos a 21).
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxNativeZoom: 19,
                    maxZoom: 21,
                    minZoom: 5,
                    attribution: '© OpenStreetMap'
                }).addTo(map);

                // Overlay: cartografía Catastro (WMS) con parcelas.
                L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx', {
                    layers: 'CATASTRO',
                    format: 'image/png',
                    transparent: true,
                    version: '1.1.1',
                    opacity: 0.7,
                    maxZoom: 21,
                    minZoom: 5,
                    attribution: '© Catastro España'
                }).addTo(map);

                // Custom marker icon (chincheta brand)
                const pinIcon = L.divIcon({
                    className: 'brokergy-pin',
                    html: `<div style="
                        position: relative;
                        width: 32px;
                        height: 42px;
                        transform: translate(-50%, -100%);
                    ">
                        <div style="
                            position: absolute;
                            top: 0;
                            left: 50%;
                            transform: translateX(-50%);
                            width: 32px;
                            height: 32px;
                            background: #FFA000;
                            border-radius: 50% 50% 50% 0;
                            transform: translateX(-50%) rotate(-45deg);
                            box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 0 3px rgba(255,160,0,0.25);
                        "></div>
                        <div style="
                            position: absolute;
                            top: 10px;
                            left: 50%;
                            transform: translateX(-50%);
                            width: 12px;
                            height: 12px;
                            background: #0C0E12;
                            border-radius: 50%;
                        "></div>
                    </div>`,
                    iconSize: [32, 42],
                    iconAnchor: [0, 0]
                });

                const marker = L.marker([initialLat, initialLng], {
                    draggable: true,
                    icon: pinIcon
                }).addTo(map);

                marker.on('dragend', () => {
                    const pos = marker.getLatLng();
                    setCoords({ lat: pos.lat, lng: pos.lng });
                });

                map.on('click', (e) => {
                    marker.setLatLng(e.latlng);
                    setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
                });

                mapRef.current = map;
                markerRef.current = marker;
                setReady(true);
            })
            .catch((err) => {
                console.error('Leaflet load failed:', err);
                if (!cancelled) setError('No se pudo cargar el mapa.');
            });

        return () => {
            cancelled = true;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                markerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Resolver RC al mover marker (debounced)
    useEffect(() => {
        if (!ready) return;
        setPreview(null);
        setError(null);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setResolving(true);
            try {
                const res = await axios.post('/api/catastro/reverse-geocode', {
                    lat: coords.lat,
                    lng: coords.lng,
                    source: 'gps'
                });
                const dwellingsCount = res.data.dwellings?.length || 0;
                console.log(
                    `%c[MapPicker]%c RC=${res.data.rc} | dwellings=${dwellingsCount}`,
                    'color: #FFA000; font-weight: bold',
                    'color: inherit'
                );
                if (dwellingsCount > 0) {
                    console.log('[MapPicker] primer dwelling:', JSON.stringify(res.data.dwellings[0]));
                    console.log('[MapPicker] respuesta completa:', res.data);
                } else {
                    console.warn('[MapPicker] ⚠️ El backend NO devolvió dwellings. Reinicia el backend.');
                    console.log('[MapPicker] respuesta completa:', res.data);
                }
                setPreview({
                    rc: res.data.rc,
                    address: res.data.address,
                    fullData: res.data
                });
            } catch (err) {
                if (err.response?.status === 404) {
                    setError('Sin parcela detectada aquí. Coloca la chincheta sobre el edificio.');
                } else {
                    setError('No se pudo resolver la ubicación.');
                }
            } finally {
                setResolving(false);
            }
        }, 700);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [coords.lat, coords.lng, ready]);

    const handleConfirm = () => {
        if (preview?.fullData) onConfirm(preview.fullData);
    };

    return (
        <div className="fixed inset-0 z-[800] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
            <div className="bg-bkg-surface border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden" style={{ height: '94vh' }}>
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/15 border border-brand/30 flex items-center justify-center text-brand flex-shrink-0">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-white tracking-tight">Ajusta la ubicación exacta</h3>
                            <p className="text-white/50 text-xs mt-1 leading-relaxed">
                                Arrastra la chincheta o haz clic sobre el tejado de tu vivienda. La capa azul muestra la cartografía oficial del Catastro.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-white/40 hover:text-white text-3xl leading-none p-1"
                        aria-label="Cerrar"
                    >
                        ×
                    </button>
                </div>

                {/* Map */}
                <div className="relative flex-1 min-h-[260px]">
                    <div ref={containerRef} className="absolute inset-0" />
                    {!ready && !error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-bkg-deep z-10">
                            <div className="flex items-center gap-3 text-white/60">
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                <span className="text-sm">Cargando mapa…</span>
                            </div>
                        </div>
                    )}

                    {/* Thumbnail de fachada (foto oficial Catastro) flotante en el mapa */}
                    {preview?.rc && !resolving && (
                        <FacadeThumbnail rc={preview.rc} />
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 sm:p-5 border-t border-white/10 max-h-[42vh] overflow-y-auto">
                    <div className="mb-3 min-h-[48px]">
                        {resolving ? (
                            <div className="flex items-center gap-3 text-white/60 text-sm">
                                <svg className="w-4 h-4 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                Buscando referencia catastral…
                            </div>
                        ) : error ? (
                            <p className="text-red-400 text-sm">{error}</p>
                        ) : preview ? (
                            <div>
                                <p className="text-white/40 text-[10px] uppercase tracking-[0.25em] mb-1">Inmueble detectado</p>
                                <p className="text-white font-medium text-sm leading-snug">{preview.address}</p>
                                <code className="text-brand font-mono text-xs mt-1 inline-block break-all">{preview.rc}</code>
                            </div>
                        ) : (
                            <p className="text-white/40 text-sm">Mueve la chincheta para detectar la referencia.</p>
                        )}
                    </div>

                    {/* Selector de vivienda si la parcela tiene división horizontal */}
                    {preview?.fullData?.dwellings && preview.fullData.dwellings.length > 1 && (
                        <DwellingPicker
                            dwellings={preview.fullData.dwellings}
                            selectedRc={preview.rc}
                            onSelect={handleSelectDwelling}
                            loading={pickingDwelling}
                            compact={true}
                        />
                    )}

                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-black uppercase tracking-widest transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!preview || resolving}
                            className="flex-[2] py-3 rounded-xl bg-brand hover:bg-brand-500 text-bkg-deep font-black text-xs uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Usar esta ubicación
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Thumbnail flotante con la foto oficial de fachada del Catastro.
 * Se posiciona en la esquina superior derecha del mapa.
 */
function FacadeThumbnail({ rc }) {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setLoaded(false);
        setFailed(false);
    }, [rc]);

    if (failed) return null;

    return (
        <div
            className="absolute top-2 right-2 sm:top-3 sm:right-3 z-[1000] animate-fade-in pointer-events-none"
            style={{ animationDuration: '300ms' }}
        >
            <div className="relative w-28 sm:w-44 rounded-xl overflow-hidden border-2 border-brand/50 shadow-2xl bg-bkg-deep">
                <div className="aspect-[4/3] w-full bg-bkg-deep flex items-center justify-center">
                    {!loaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-5 h-5 animate-spin text-brand/60" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                            </svg>
                        </div>
                    )}
                    <img
                        src={`/api/catastro/image/${rc}`}
                        alt="Fachada Catastro"
                        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => setLoaded(true)}
                        onError={() => setFailed(true)}
                    />
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-1">
                    <p className="text-[8px] sm:text-[9px] text-white/90 font-bold uppercase tracking-wider text-center">
                        Foto Catastro
                    </p>
                </div>
            </div>
        </div>
    );
}
