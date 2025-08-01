import React, { useEffect, useRef, useState } from 'react';
import LocationPicker from './LocationPicker';
import PhotoChoiceModal from './PhotoChoiceModal';
import '../styles/addpin.css';
import cameraPlusIcon from '../assets/icons8-camera-plus-96.png'; // Import the new icon

const DEFAULT_CENTER = { lat: 44.9424, lng: 26.0235 };
const MAX_PHOTOS = 5;

export default function AddPinSheet({
  open, onClose, onSubmit, statuses, group, initialLatLng
}) {
  const [coords, setCoords] = useState(initialLatLng || DEFAULT_CENTER);
  const [photos, setPhotos] = useState([]);
  const [photoModal, setPhotoModal] = useState(false);
  const [description, setDescription] = useState('');

  const wrapperRef = useRef(null);
  const headerRef  = useRef(null);
  const cameraInputRef  = useRef(null);
  const libraryInputRef = useRef(null);

  // drag
  const dragStartY = useRef(0);
  const dragDelta  = useRef(0);
  const dragging   = useRef(false);
  const lastScrollY = useRef(0);

  /* lock page behind */
  useEffect(() => {
    if (!open) return;
    lastScrollY.current = window.scrollY || 0;
    const prev = {
      pos: document.body.style.position,
      top: document.body.style.top,
      w: document.body.style.width,
    };
    document.body.dataset.prevPos = JSON.stringify(prev);
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lastScrollY.current}px`;
    document.body.style.width = '100%';
    return () => {
      try {
        const p = JSON.parse(document.body.dataset.prevPos || '{}');
        document.body.style.position = p.pos || '';
        document.body.style.top = p.top || '';
        document.body.style.width = p.w || '';
      } catch {}
      window.scrollTo(0, lastScrollY.current);
    };
  }, [open]);

  /* reset on open */
  useEffect(() => {
    if (!open) return;
    setCoords(initialLatLng || DEFAULT_CENTER);
    setPhotos([]);
    setDescription('');
    const w = wrapperRef.current;
    if (w) { w.style.transition = ''; w.style.transform = ''; }
  }, [open, initialLatLng]);

  /* drag from grabber or header background to close (pure JS, with pointer capture) */
  useEffect(() => {
    const w = wrapperRef.current;
    const header = headerRef.current;
    if (!w || !header) return;

    const grabber = header.querySelector('.ap-grabber');
    const threshold = 140;
    const activeIdRef = { current: null };

    const getY = (e) =>
      (e.touches && e.touches[0] ? e.touches[0].clientY :
      typeof e.clientY === 'number' ? e.clientY : 0);

    const isInteractive = (el) =>
      !!(el && el.closest('.ap-close,button,a,input,textarea,select,label'));

    const startDrag = (e) => {
      dragging.current = true;
      dragStartY.current = getY(e);
      dragDelta.current = 0;
      w.style.transition = 'none';

      const pid = e.pointerId != null ? e.pointerId : 'mouse';
      activeIdRef.current = pid;

      const tgt = e.target;
      if (tgt && typeof tgt.setPointerCapture === 'function' && e.pointerId != null) {
        try { tgt.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };

    const onHeaderDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const t = e.target;
      if (!t) return;
      if (t.closest('.ap-grabber')) return;
      if (isInteractive(t)) return;
      if (!t.closest('.ap-header')) return;
      startDrag(e);
      if (e.pointerType === 'touch') e.preventDefault();
    };

    const onGrabberDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      startDrag(e);
      if (e.pointerType === 'touch') e.preventDefault();
      e.stopPropagation();
    };

    const onMove = (e) => {
      if (!dragging.current) return;
      if (activeIdRef.current != null && e.pointerId != null && e.pointerId !== activeIdRef.current) return;
      const dy = Math.max(0, getY(e) - dragStartY.current);
      dragDelta.current = dy;
      w.style.transform = `translateY(${dy}px)`;
      if (e.pointerType === 'touch') e.preventDefault();
    };

    const finishDrag = (commit) => {
      dragging.current = false;
      const dy = dragDelta.current;
      w.style.transition = '';
      if (commit && dy > threshold) {
        w.style.transform = 'translateY(100%)';
        setTimeout(() => onClose && onClose(), 200);
      } else {
        w.style.transform = 'translateY(0)';
      }
      activeIdRef.current = null;
    };

    const onUp = (e) => {
      if (!dragging.current) return;
      if (activeIdRef.current != null && e.pointerId != null && e.pointerId !== activeIdRef.current) return;
      finishDrag(true);
    };

    const onCancel = () => {
      if (!dragging.current) return;
      finishDrag(false);
    };

    header.addEventListener('pointerdown', onHeaderDown, { passive: false });
    if (grabber) grabber.addEventListener('pointerdown', onGrabberDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });

    return () => {
      header.removeEventListener('pointerdown', onHeaderDown);
      if (grabber) grabber.removeEventListener('pointerdown', onGrabberDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [onClose]);

  /* photos */
  function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotos(prev => {
      const room = MAX_PHOTOS - prev.length;
      return [...prev, ...files.slice(0, Math.max(0, room))];
    });
    e.target.value = '';
  }
  const onTakePhoto     = () => { setPhotoModal(false); cameraInputRef.current?.click(); };
  const onChooseLibrary = () => { setPhotoModal(false); libraryInputRef.current?.click(); };
  const openPhotoPopover = () => setPhotoModal(true);
  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  /* submit */
  function submit() {
    if (!coords) { alert('Please choose a location.'); return; }
    const payload = {
      group_id: group?.id,
      description: description || '',
      lat: coords.lat,
      lng: coords.lng,
      status_id: null,
      photos: []
    };
    onSubmit(payload, photos);
  }

  // ★★★ CHANGE 1: The "add" button is now placed at the end of the array ★★★
  const tiles = photos.length < MAX_PHOTOS
    ? [...photos.map((f, i) => ({ kind: 'photo', file: f, i })), { kind: 'add' }]
    : photos.map((f, i) => ({ kind: 'photo', file: f, i }));

  if (!open) return null;
  return (
    <>
      <div className={`sheet-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <div ref={wrapperRef} className={`sheet-wrapper sheet-85 ${open ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet ap-sheet">
          <div ref={headerRef} className="ap-header">
            <div className="ap-grabber" aria-hidden />
            <h2 className="ap-title">Add New Spot</h2>
            <button type="button" onClick={() => { onClose?.(); }} aria-label="Close" className="ap-close">
              ×
            </button>
          </div>

          <div className="ap-body">
            <div className="ap-map">
              <LocationPicker open={open} start={coords} mode="inline" zoom={18} onChange={(c) => setCoords({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) })} />
            </div>
            <div className="ap-desc">
              <textarea className="ap-desc-input one-line" rows={1} placeholder="What is this?" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="ap-photos">
              <div className="ap-photo-grid">
                {tiles.map((t) => {
                  if (t.kind === 'add') {
                    // ★★★ CHANGE 2: The button now uses your PNG icon ★★★
                    return (
                      <button
                        key="add"
                        type="button"
                        className="ap-photo-add"
                        onClick={openPhotoPopover}
                        aria-label="Add photo"
                      >
                        <img src={cameraPlusIcon} alt="Add photo" className="ap-photo-add-img" />
                      </button>
                    );
                  }
                  const url = URL.createObjectURL(t.file);
                  return (
                    <div key={t.i} className="ap-photo-thumb">
                      <img src={url} alt="" />
                      <button className="ap-photo-remove" aria-label="Remove photo" onClick={() => removePhoto(t.i)}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ap-footer">
            <button type="button" className="button ap-submit" onClick={submit}>
              Add Spot
            </button>
          </div>
        </div>
      </div>

      <PhotoChoiceModal open={photoModal} onClose={() => setPhotoModal(false)} onTakePhoto={onTakePhoto} onChooseLibrary={onChooseLibrary} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden multiple onChange={onFilesSelected} />
      <input ref={libraryInputRef} type="file" accept="image/*" hidden multiple onChange={onFilesSelected} />
    </>
  );
}