// src/components/MiniMap.jsx
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function MiniMap({ lat, lng }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(ref.current, { zoomControl: false, attributionControl: false, dragging: false })
        .setView([lat, lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(mapRef.current);
      L.marker([lat, lng]).addTo(mapRef.current);
    } else {
      mapRef.current.setView([lat, lng], 14);
    }
    return () => {};
  }, [lat, lng]);

  return (
    <div style={{ height: 160, width: '100%', borderRadius: 12, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }} ref={ref} />
  );
}
