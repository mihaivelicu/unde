// src/components/MapView.jsx
import { useEffect, useRef } from 'react';
import L from 'leaflet';

import icon2x from 'leaflet/dist/images/marker-icon-2x.png';
import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';

/* Leaflet default icon paths */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: icon2x, iconUrl: icon, shadowUrl: shadow });

/* Helper: make “/media/…” paths absolute */
const API_BASE =
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.REACT_APP_API_BASE &&
    process.env.REACT_APP_API_BASE.replace(/\/$/, '')) ||
  '';

const abs = (u = '') => {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  if (u.startsWith('/media/')) return `${API_BASE}/api${u}`;
  return `${API_BASE}${u}`;
};


// ★★★ HELPER FUNCTIONS MOVED OUTSIDE THE COMPONENT ★★★

/* ---------- Icon Utilities ---------- */
const expandHex = h => {
  let s=h.replace('#',''); if(s.length===3) s=s.split('').map(c=>c+c).join('');
  return /^[0-9a-f]{6}$/i.test(s)?`#${s}`:'#ef4444';
};
const hexToRgb = h => [0,2,4].map(i=>parseInt(h.slice(1+i,3+i),16));
const dist = (a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);
const nearestName = (hex,pal)=>Object.entries(pal)
      .reduce((best,[n,v])=>dist(hexToRgb(hex),hexToRgb(v))<best[1]?[n,dist(hexToRgb(hex),hexToRgb(v))]:best,['red',Infinity])[0];

function chooseIcon(pin, statuses = []) {
  let status = statuses.find(s => Number(s.id) === Number(pin.status_id)) ||
                statuses.find(s => s.label === pin.status) || null;

  const palette = {
    red:'#ef4444', green:'#10b981', blue:'#3b82f6',
    orange:'#f97316', yellow:'#f59e0b', violet:'#8b5cf6',
    grey:'#6b7280', black:'#111827'
  };
  let color = (status?.color || '').toLowerCase().trim();
  let hex   = color.startsWith('#') ? expandHex(color)
            : palette[color]       ? palette[color]
            : palette.red;

  const markerColor = nearestName(hex, palette);
  const iconUrl = `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`;
  return new L.Icon({
    iconUrl, shadowUrl:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize:[25,41], iconAnchor:[12,41], popupAnchor:[1,-34], shadowSize:[41,41]
  });
}

/* ---------- Popup HTML & Utils ---------- */
const thumbSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/></svg>`;
const escapeHtml = s => s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function popupHtml(pin, statuses = []) {
  const photos = Array.isArray(pin.photos) ? pin.photos.filter(Boolean) : [];
  const absList = photos.map(abs);
  const first   = absList[0] || '';
  const photoAttr = absList.map(u=>u.replaceAll('|','%7C')).join('|');

  const statusOpts = statuses.map(s=>{
    const sel = String(pin.status_id||'')===String(s.id)||pin.status===s.label?'selected':'';
    return `<option value="${s.id}" ${sel}>${s.label}</option>`;
  }).join('');

  return `
    <div class="pin-pop" data-pin-id="${pin.id}" data-photos="${photoAttr}" data-index="0">
      <div class="pin-pop-media ${absList.length?'':'empty'}">
        ${absList.length
          ? `<img class="pin-pop-img" src="${first}" alt="photo"/>`
          : `<div class="pin-pop-placeholder" aria-hidden="true"></div>` }
        <button class="pin-pop-nav prev ${absList.length<=1?'hidden':''}" aria-label="Previous">‹</button>
        <button class="pin-pop-nav next ${absList.length<=1?'hidden':''}" aria-label="Next">›</button>
        ${absList.length>1
          ? `<div class="pin-pop-count"><span class="cur">1</span>/<span class="tot">${absList.length}</span></div>`
          : '' }
      </div>
      <div class="pin-pop-body">
        <p class="pin-pop-desc">${escapeHtml(pin.description||'')}</p>
        <div class="pin-pop-row">
          <button class="upvote-btn" aria-label="Upvote">${thumbSvg()}<span class="upvote-count">${pin.upvotes||0}</span></button>
          <select class="status-select pin-pop-status">${statusOpts}</select>
        </div>
      </div>
    </div>`;
}


// ★★★ MAPVIEW COMPONENT BEGINS ★★★

export default function MapView({
  groupData,
  onUpvote,
  onChangeStatus,
  autoFit = false,
}) {
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const userMarker = useRef(null);
  const didFitRef = useRef(false);

  /* ------------- initialise Leaflet map (once) ------------- */
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map('map', { zoomControl: false })
                 .setView([44.4396, 26.0963], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapRef.current = map;

    const GpsControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function (mapInstance) {
        const container = L.DomUtil.create('button', 'map-gps leaflet-bar');
        container.setAttribute('aria-label', 'Center on my location');
        container.title = 'Center on my location';
        container.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 5a1 1 0 0 1 1 1v1.06A5 5 0 0 1 16.94 11H18a1 1 0 1 1 0 2h-1.06A5 5 0 0 1 13 16.94V18a1 1 0 1 1-2 0v-1.06A5 5 0 0 1 7.06 13H6a1 1 0 1 1 0-2h1.06A5 5 0 0 1 11 7.06V6a1 1 0 0 1 1-1Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>`;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(container, 'click', L.DomEvent.stop);
        L.DomEvent.on(container, 'click', () => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const p = [pos.coords.latitude, pos.coords.longitude];
              mapInstance.setView(p, Math.max(mapInstance.getZoom(), 16), { animate: true });
              if (userMarker.current) userMarker.current.remove();
              userMarker.current = L.circleMarker(p, {
                radius: 6, color: '#2563eb', weight: 2,
                fillColor: '#60a5fa', fillOpacity: 0.8
              }).addTo(mapInstance);
            },
            () => {},
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        });
        
        return container;
      }
    });
    new GpsControl().addTo(map);
    
    const mapContainer = document.getElementById('map');
    mapContainer.addEventListener('click', handleClick);
    mapContainer.addEventListener('change', handleChange);

    return () => {
      mapContainer.removeEventListener('click', handleClick);
      mapContainer.removeEventListener('change', handleChange);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* reset auto‑fit flag each time group ID/slug changes */
  useEffect(() => { didFitRef.current = false; },
           [groupData?.id, groupData?.slug]);

  /* ------------- render markers whenever pins update ------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) { layerRef.current.remove(); layerRef.current = null; }

    const pins = groupData?.pins || [];
    if (!pins.length) return;

    const markers = pins.map(pin => {
      // These functions are now stable and defined outside the component
      const m = L.marker([pin.lat, pin.lng],
                         { icon: chooseIcon(pin, groupData?.statuses) });
      m.bindPopup(popupHtml(pin, groupData?.statuses), { closeButton: false });
      return m;
    });

    const layer = L.featureGroup(markers).addTo(map);
    layerRef.current = layer;

    if (autoFit && !didFitRef.current && layer.getBounds().isValid()) {
      map.fitBounds(layer.getBounds().pad(0.15));
      didFitRef.current = true;
    }
    // The dependency array is now correct, and the warning is gone!
  }, [groupData, autoFit]);

  /* ---------- delegated events ---------- */
  function handleClick(e) {
    const nav = e.target.closest?.('.pin-pop-nav');
    if (nav) {
      const wrap = nav.closest('.pin-pop');
      const list = (wrap.dataset.photos||'').split('|').filter(Boolean);
      if (!list.length) return;
      let idx = parseInt(wrap.dataset.index||'0',10);
      idx = nav.classList.contains('next') ? (idx+1)%list.length
                                           : (idx-1+list.length)%list.length;
      wrap.dataset.index=idx;
      wrap.querySelector('.pin-pop-img').src = list[idx];
      wrap.querySelector('.pin-pop-count .cur').textContent = idx+1;
      return;
    }

    const up = e.target.closest?.('.upvote-btn');
    if (up) {
      const wrap = up.closest('.pin-pop');
      onUpvote?.(Number(wrap.dataset.pinId), up.querySelector('.upvote-count'));
    }
  }
  function handleChange(e){
    if(!e.target.classList.contains('status-select'))return;
    const wrap=e.target.closest('.pin-pop');
    onChangeStatus?.(Number(wrap.dataset.pinId), e.target.value);
  }

  return null;
}