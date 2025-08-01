// src/components/LocationPicker.jsx
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import '../styles/locationPicker.css';

import icon2x from 'leaflet/dist/images/marker-icon-2x.png';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

const THRESHOLD_METERS = 20;
const LS_LAST_POS = 'unde:lastUserPos';

export default function LocationPicker({
  open,
  start,
  onCancel,
  onConfirm,
  mode = 'sheet',           // 'sheet' | 'inline'
  onChange,
  zoom = 18,
}) {
  const mapBoxRef = useRef(null);
  const mapEl = useRef(null);
  const mapRef = useRef(null);

  const [center, setCenter] = useState(start || { lat: 44.9424, lng: 26.0235 });
  const [userPos, setUserPos] = useState(null);
  const [isCentered, setIsCentered] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const gotFirstFixRef = useRef(false);   // auto-center only once per open
  const userMovedRef   = useRef(false);   // user dragged map
  const timersRef      = useRef([]);
  const roRef          = useRef(null);    // ResizeObserver

  const isInline = mode === 'inline';
  const showActions = !isInline;

  // Create / destroy map when open toggles
  useEffect(() => {
    if (!open) {
      // ---- CLEANUP WHEN SHEET CLOSES ----
      clearTimers();
      if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
      return;
    }

    // ---- INITIALISE WHEN SHEET OPENS ----
    clearTimers();
    userMovedRef.current = false;
    gotFirstFixRef.current = false;

    const initCenter = start || { lat: 44.9424, lng: 26.0235 };
    setCenter(initCenter);

    // Always create a fresh Leaflet map for a fresh DOM node
    const map = L.map(mapEl.current, { zoomControl: true }).setView([initCenter.lat, initCenter.lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20 }).addTo(map);

    map.on('movestart', () => {
      userMovedRef.current = true;
      setIsMoving(true);
    });
    map.on('move', () => {
      const c = map.getCenter();
      const cur = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) };
      setCenter(cur);
      updateCenteredFlag(map, userPos, setIsCentered);
    });
    map.on('moveend', () => {
      setIsMoving(false);
      onChange?.(map.getCenter());
    });

    mapRef.current = map;

    // Invalidate after the sheet animation settles
    pushTimer(() => map.invalidateSize(), 150);
    pushTimer(() => map.invalidateSize(), 450);

        /* ------------------------------------------------------------------ */
    /*  ResizeObserver – keep the map from “whiting-out” after re-layout   */
    /* ------------------------------------------------------------------ */
    if ('ResizeObserver' in window && mapBoxRef.current) {
      // save the node so we’re not chasing a nullable ref later
      const boxEl = mapBoxRef.current;

      const ro = new ResizeObserver(() => {
        if (!mapRef.current || !boxEl) return;         // <-- guard against null
        const { width, height } = boxEl.getBoundingClientRect();
        if (width > 0 && height > 0) mapRef.current.invalidateSize();
      });

      ro.observe(boxEl);
      roRef.current = ro;
    }


    // last-known quick fix + one live attempt
    pushTimer(() => tryGetPositionOnce(), 500);

    return () => {
      // If the component unmounts while open, ensure cleanup
      clearTimers();
      if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch {}
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // do NOT depend on `start`

  // Ignore `start` changes while open to avoid snap-back
  useEffect(() => {
    if (!open) return;
    // Intentionally no action.
  }, [open, start]);

  function pushTimer(fn, ms) {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }
  function clearTimers() {
    timersRef.current.forEach(id => clearTimeout(id));
    timersRef.current = [];
  }

  function tryGetPositionOnce() {
    // 1) last saved fix (no recenter)
    try {
      const saved = localStorage.getItem(LS_LAST_POS);
      if (saved) {
        const p = JSON.parse(saved);
        if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
          handleFix({ coords: { latitude: p.lat, longitude: p.lng } }, false);
        }
      }
    } catch {}

    // 2) live fix; center only if user hasn't moved yet
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const shouldCenter = !gotFirstFixRef.current && !userMovedRef.current;
          handleFix(pos, shouldCenter);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    }
  }

  function handleFix(pos, forceRecentre) {
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setUserPos(p);
    try { localStorage.setItem(LS_LAST_POS, JSON.stringify(p)); } catch {}

    const map = mapRef.current;
    if (!map) return;

    if (forceRecentre || !gotFirstFixRef.current) {
      const z = Math.max(map.getZoom(), 18);
      map.setView([p.lat, p.lng], z, { animate: true });
      gotFirstFixRef.current = true;
    }
    updateCenteredFlag(map, p, setIsCentered);
  }

  function recenterToUser() {
    // Instant fallback to last saved position
    try {
      const saved = localStorage.getItem(LS_LAST_POS);
      if (saved) {
        const p = JSON.parse(saved);
        if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
          const map = mapRef.current;
          if (map) {
            const z = Math.max(map.getZoom(), 18);
            map.setView([p.lat, p.lng], z, { animate: true });
            setUserPos(p);
            gotFirstFixRef.current = true;
            updateCenteredFlag(map, p, setIsCentered);
          }
        }
      }
    } catch {}

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => handleFix(pos, true),
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function confirm() {
    onConfirm?.(center);
  }

  if (!open) return null;

  const pinColor = isMoving ? '#111827' : '#10b981';

  return (
    <div className={`lp-wrap ${isInline ? 'lp-inline' : ''}`}>
      <div className="lp-mapBox" ref={mapBoxRef}>
        <div ref={mapEl} className="lp-map" />

        <div className={`lp-pin ${isMoving ? 'moving' : ''}`}>
          <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
            <path
              d="M12 2C8.686 2 6 4.686 6 8c0 4.25 6 13 6 13s6-8.75 6-13c0-3.314-2.686-6-6-6Zm0 8.25A2.25 2.25 0 1 1 12 5.75a2.25 2.25 0 0 1 0 4.5Z"
              fill={pinColor}
            />
          </svg>
        </div>

        <div className={`lp-dot ${isMoving ? 'show' : ''}`} />

        <div className="lp-coord">{center.lat.toFixed(6)}, {center.lng.toFixed(6)}</div>

        <button
          type="button"
          className={`lp-gps ${userPos ? (isCentered ? 'inactive' : 'active') : 'active'}`}
          aria-label="Center on my location"
          onClick={recenterToUser}
          title={userPos ? (isCentered ? 'Already centered' : 'Center on GPS') : 'Tap to get GPS fix'}
        >
          <span className="ring" aria-hidden="true" />
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 5a1 1 0 0 1 1 1v1.06A5 5 0 0 1 16.94 11H18a1 1 0 1 1 0 2h-1.06A5 5 0 0 1 13 16.94V18a1 1 0 1 1-2 0v-1.06A5 5 0 0 1 7.06 13H6a1 1 0 1 1 0-2h1.06A5 5 0 0 1 11 7.06V6a1 1 0 0 1 1-1Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
          </svg>
        </button>

        {showActions && (
          <div className="lp-actions">
            <button type="button" className="lp-btn ghost" onClick={onCancel}>Cancel</button>
            <button type="button" className="lp-btn primary" onClick={confirm}>Confirm Location</button>
          </div>
        )}
      </div>
    </div>
  );
}

function updateCenteredFlag(map, userPos, setIsCentered) {
  if (!map || !userPos) {
    setIsCentered(false);
    return;
  }
  const c = map.getCenter();
  const d = map.distance([c.lat, c.lng], [userPos.lat, userPos.lng]);
  setIsCentered(d <= THRESHOLD_METERS);
}
