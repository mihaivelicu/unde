// src/components/ConfirmModal.jsx

import React from 'react';
import '../styles/confirmModal.css';

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmClass = 'primary',
}) {
  if (!open) return null;

  return (
    <div className="confirm-modal-overlay open" onClick={onClose}>
      <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{children}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            {cancelText}
          </button>
          <button type="button" className={`button ${confirmClass}`} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}