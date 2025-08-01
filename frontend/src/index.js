// index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './index.css';

const container = document.getElementById('root');
createRoot(container).render(
  <BrowserRouter>
    <Routes>
      <Route path="/:slug?" element={<App />} />
    </Routes>
  </BrowserRouter>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('✅ Service worker registered:', reg))
      .catch(err => console.error('❌ Service worker registration failed:', err));
  });
}
