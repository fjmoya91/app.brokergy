import React, { useEffect, useRef } from 'react';

export function MapViewer({ lat, lng, zoom = 18 }) {
    const mapRef = useRef(null);
    const googleMapRef = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        // Check if Google script is loaded
        if (!window.google) {
            console.error("Google Maps script not loaded");
            return;
        }

        // Initialize map if not already done
        if (!googleMapRef.current && mapRef.current) {
            googleMapRef.current = new window.google.maps.Map(mapRef.current, {
                center: { lat, lng },
                zoom: zoom,
                mapTypeId: 'hybrid', // Satellite + Labels
                disableDefaultUI: false,
                streetViewControl: false,
            });
        }
    }, []);

    // Update center and marker when lat/lng changes
    useEffect(() => {
        if (googleMapRef.current && lat && lng) {
            const pos = { lat, lng };
            googleMapRef.current.panTo(pos);
            googleMapRef.current.setZoom(zoom);

            if (markerRef.current) {
                markerRef.current.setMap(null);
            }

            markerRef.current = new window.google.maps.Marker({
                position: pos,
                map: googleMapRef.current,
                animation: window.google.maps.Animation.DROP
            });
        }
    }, [lat, lng, zoom]);

    return (
        <div className="w-full h-64 bg-gray-200 relative rounded overflow-hidden shadow-inner">
            <div ref={mapRef} className="w-full h-full" />
            {!window.google && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 text-gray-500">
                    Cargando Mapa... (Si no carga, verifica la API Key)
                </div>
            )}
        </div>
    );
}
