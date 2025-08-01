// src/components/InputModal.jsx

import React, { useState, useEffect } from 'react';
import '../styles/inputModal.css';

export default function InputModal({
  open,
  onClose,
  onSubmit,
  title,
  inputLabel,
  inputPlaceholder,
  submitText = 'Submit',
  cancelText = 'Cancel',
  isLoading = false, // New prop for loading state
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) {
      setValue('');
    }
  }, [open]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim() && !isLoading) {
      onSubmit(value.trim());
    }
  };

  if (!open) return null;

  return (
    <div className="input-modal-overlay open" onClick={isLoading ? undefined : onClose}>
      <div className="input-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <label>
            <span className="input-label-text">{inputLabel}</span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={inputPlaceholder}
              disabled={isLoading}
              autoFocus
            />
          </label>
          <div className="input-modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={isLoading}
            >
              {cancelText}
            </button>
            <button type="submit" className="button primary" disabled={isLoading}>
              {isLoading ? 'Creating...' : submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}