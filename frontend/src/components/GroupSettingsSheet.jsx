// src/components/GroupSettingsSheet.jsx

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { TrashIcon } from '../icons';
import ConfirmModal from './ConfirmModal'; // Import the new modal
import '../styles/groupSettings.css';
import '../styles/confirmModal.css'; // Import the modal styles

const toHex = (v='') => {
  const m = { red:'#ef4444', green:'#10b981', blue:'#3b82f6', grey:'#6b7280', gray:'#6b7280' };
  let s = v.trim().toLowerCase();
  if (m[s]) return m[s];
  if (!s.startsWith('#')) s = `#${s}`;
  if (s.length===4) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-f]{6}$/i.test(s)?s:'#ef4444';
};
const useDebounce = (fn,ms=400) => {
  const t = useRef();
  return (...a) => {
    clearTimeout(t.current);
    t.current = setTimeout(()=>fn(...a), ms);
  };
};

function ColourPicker({ colour, onChange }) {
  const pick = () => {
    const i = document.createElement('input');
    i.type = 'color'; i.value = colour;
    i.style.position = 'fixed'; i.style.left = '-9999px';
    document.body.appendChild(i);
    i.click();
    i.addEventListener('input', e => onChange(e.target.value), { once:true });
    i.addEventListener('change', () => { onChange(i.value); i.remove() }, { once:true });
  };
  return (
    <button
      type="button"
      className="swatch"
      style={{ background: colour }}
      onClick={pick}
      aria-label="Pick colour"
    />
  );
}

export default function GroupSettingsSheet({
  open,
  onClose,
  group,
  onGroupUpdate,
}) {
  const navigate = useNavigate();

  const [name, setName]     = useState('');
  const [slug, setSlug]     = useState('');
  const [rows, setRows]     = useState([]);
  const [busy, setBusy]     = useState(false);
  const [err,  setErr]      = useState('');
  const [flash, setFlash]   = useState({ name:false, slug:false, rows:new Set() });
  const [confirmOpen, setConfirmOpen] = useState(false); // New state for modal

  useEffect(() => {
    if (!open || !group) return;
    setName(group.name);
    setSlug(group.slug);
    setRows(group.statuses.map(s => ({ ...s, color: toHex(s.color) })));
    setErr('');
  }, [open, group]);

  const poke    = k  => { setFlash(p => ({ ...p, [k]: true })); setTimeout(()=>setFlash(p=>({ ...p, [k]:false })),750); };
  const pokeRow = id => { setFlash(p=>{const n=new Set(p.rows);n.add(id);return{...p,rows:n}}); setTimeout(()=>setFlash(p=>{const n=new Set(p.rows);n.delete(id);return{...p,rows:n}}),750); };

  const debName = useDebounce(async v => {
    try {
      await api.updateGroup(group.id, { name: v.trim(), slug });
      poke('name');
      onGroupUpdate?.({ ...group, name: v.trim() });
    } catch(e){ setErr(e.message||'Save failed'); }
  },450);

  const debSlug = useDebounce(async s => {
    try {
      await api.updateGroup(group.id, { name, slug: s.trim() });
      poke('slug');
      if (s.trim() !== group.slug) {
        navigate(`/${s.trim()}`, { replace:true });
        onGroupUpdate?.({ ...group, slug: s.trim() });
      }
    } catch(e){ setErr(e.message||'Save failed'); }
  },450);

  const updateStatusRow = useDebounce(async row => {
    if (!row.label.trim()) {
      setErr('Status label cannot be empty.');
      return;
    }
    try {
      setErr('');
      await api.updateStatus(row.id, { label:row.label.trim(), color:row.color });
      pokeRow(row.id);
    } catch(e){ setErr(e.message||'Update failed'); }
  },400);

  const changeRow = (row, k, v) => {
    const n = { ...row, [k]: k==='color'?toHex(v):v };
    setRows(r=>r.map(x=>x.id===row.id?n:x));
    updateStatusRow(n);
  };

  const addStatus = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.createStatus(group.id, { label: 'New Status', color: '#3b82f6' });
    } catch (e) {
      setErr(e.message || 'Add failed');
    } finally {
      setBusy(false);
    }
  };

  const delStatus = async row => {
    if (!window.confirm(`Delete "${row.label}"?`)) return;
    try {
      await api.deleteStatus(row.id);
      setRows(r=>r.filter(x=>x.id!==row.id));
    } catch(e){ setErr(e.message||'Delete failed'); }
  };
  
  // This is the function that runs after confirming in the modal
  const killGroup = async () => {
    setConfirmOpen(false); // Close modal
    setBusy(true); 
    setErr('');
    try {
      await api.deleteGroup(group.id);
      navigate('/', { replace:true });
      onClose();
    } catch(e){ 
      setErr(e.message||'Delete failed'); 
      setBusy(false); 
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="gs-overlay" onClick={onClose}/>
      <div className="gs-wrap" onClick={e=>e.stopPropagation()}>
        <section className="gs-sheet">
          <header className="gs-h">
            <h2>Group Settings</h2>
            <button className="close" onClick={onClose} aria-label="Close">×</button>
          </header>

          <div className="gs-b">
            {/* Name */}
            <label className="gs-field">
              <span>Name</span>
              <input
                className="underline"
                value={name}
                onChange={e=>{ setName(e.target.value); debName(e.target.value); }}
              />
              <span className={`saved-tick ${flash.name?'show':''}`}>✓ Saved</span>
            </label>

            {/* Slug */}
            <label className="gs-field">
              <span>URL</span>
              <div className="url-input-wrapper">
                <span className="url-prefix">https://unde.app/</span>
                <input
                  className="underline"
                  value={slug}
                  onChange={e => { setSlug(e.target.value); debSlug(e.target.value); }}
                />
              </div>
              <span className={`saved-tick ${flash.slug ? 'show' : ''}`}>✓ Saved</span>
            </label>

            <h3 className="sec">Statuses</h3>
            {rows.map(r=>(
              <div key={r.id} className="row">
                <input
                  className="row-input"
                  value={r.label}
                  onChange={e=>changeRow(r,'label',e.target.value)}
                />
                <ColourPicker colour={r.color} onChange={c => changeRow(r,'color',c)} />
                <span className={`saved-tick row-tick ${flash.rows.has(r.id)?'show':''}`}>
                  ✓ Saved
                </span>
                <button className="icon" onClick={()=>delStatus(r)} aria-label="Delete">
                  <TrashIcon/>
                </button>
              </div>
            ))}

            <div className="btn-row">
              <button className="btn primary" onClick={addStatus} disabled={busy}>
                Add status
              </button>
            </div>

            {err && <div className="err">{err}</div>}
          </div>

          <footer className="gs-f">
            {/* This button now opens the modal instead of calling window.confirm */}
            <button className="btn danger" onClick={() => setConfirmOpen(true)} disabled={busy}>
              Delete group
            </button>
          </footer>
        </section>
      </div>

      {/* The new modal is rendered here */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={killGroup}
        title="Delete Group"
        confirmText="Delete"
        cancelText="Cancel"
        confirmClass="btn danger"
        cancelClass="btn secondary"
      >
        You want to permanently delete “{group?.name}”?
      </ConfirmModal>
    </>
  );
}