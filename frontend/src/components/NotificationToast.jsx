// src/components/NotificationToast.jsx

import React from 'react';

export default function NotificationToast({ message, visible }) {
  return (
    <div className={`notification ${visible ? 'visible' : ''}`}>
      <div className="content">{message}</div>
    </div>
  );
}
