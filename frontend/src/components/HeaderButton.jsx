// src/components/HeaderButton.jsx

import React from 'react';
import { MenuIcon } from '../icons';

export default function HeaderButton({ title, onClick }) {
  return (
    <button className="header-button" onClick={onClick} aria-label="Open sidebar">
      <MenuIcon style={{ color: '#374151' }} />
      <span className="title">{title}</span>
    </button>
  );
}
