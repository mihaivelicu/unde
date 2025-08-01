// src/components/PhotoChoiceModal.jsx

import React, { useEffect, useMemo } from 'react';
import '../styles/photochoice.css';

export default function PhotoChoiceModal({
  open,
  onClose,
  onTakePhoto,
  onChooseLibrary,
  anchorRect,       // DOMRect from the Add tile
}) {
  // compute position (fixed, visual viewport)
  const style = useMemo(() => {
    const w = 220;     // popover width
    const h = 132;     // popover height
    const gap = 10;

    if (!anchorRect) {
      // center fallback
      return {
        top: `calc(50dvh - ${h / 2}px)`,
        left: `calc(50vw - ${w / 2}px)`,
        width: w,
        height: h,
      };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // try place above the tile, otherwise below
    let top = anchorRect.top - gap - h;
    let placeAbove = true;
    if (top < 12) {
      top = anchorRect.bottom + gap;
      placeAbove = false;
    }

    // prefer left aligned with tile
    let left = anchorRect.left;
    if (left + w > vw - 12) left = vw - 12 - w; // keep inside viewport
    if (left < 12) left = 12;

    // arrow position
    const arrowLeft = Math.min(
      Math.max(anchorRect.left + anchorRect.width / 2 - left, 18),
      w - 18
    );

    return {
      top,
      left,
      width: w,
      height: h,
      '--arrow-left': `${arrowLeft}px`,
      '--arrow-dir': placeAbove ? 'down' : 'up',
    };
  }, [anchorRect]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="pcm-overlay" onClick={onClose} />
      <div className="pcm-pop" style={style} role="dialog" aria-modal="true">
        <div className="pcm-arrow" data-dir={style['--arrow-dir']} />
        <button className="pcm-item" onClick={onTakePhoto}>
          <span className="pcm-ic">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M9 4a1 1 0 0 0-.894.553L7.382 6H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-1.382l-.724-1.447A1 1 0 0 0 13.999 4H9Zm3 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"/>
            </svg>
          </span>
          <span className="pcm-t">Take photo</span>
        </button>

        <button className="pcm-item" onClick={onChooseLibrary}>
          <span className="pcm-ic">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V5Z"/>
            </svg>
          </span>
          <span className="pcm-t">Choose from library</span>
        </button>
      </div>
    </>
  );
}
