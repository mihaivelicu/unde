// src/components/Sidebar.jsx
import React, { useEffect, useRef, useState } from 'react';
import { CogIcon, ShareIcon } from '../icons';
import InputModal from './InputModal';
import '../styles/sidebar.css';

export default function Sidebar({
  open,
  currentGroupName,
  currentSlug,
  groups,
  onSelectGroup,
  onOpenSettings,
  onCopyLink,
  onClose
}) {

  const sidebarRef = useRef(null);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragDelta = useRef(0);
  const onCloseRef = useRef(onClose);

  // States for the new group modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (sidebar && !dragging.current) {
      sidebar.style.transform = '';
      sidebar.style.transition = '';
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    const isInteractive = (el) =>
      !!(el && el.closest('button, a, input, textarea, select, label'));
    const getX = (e) =>
      (e.touches && e.touches[0] ? e.touches[0].clientX : typeof e.clientX === 'number' ? e.clientX : 0);
    const threshold = 100;
    const activeIdRef = { current: null };
    const startDrag = (e) => {
      if (isInteractive(e.target)) return;
      dragging.current = true;
      dragStartX.current = getX(e);
      dragDelta.current = 0;
      sidebar.style.transition = 'none';
      const pid = e.pointerId != null ? e.pointerId : 'mouse';
      activeIdRef.current = pid;
      if (e.target.setPointerCapture) {
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };
    const onMove = (e) => {
      if (!dragging.current) return;
      if (activeIdRef.current != null && e.pointerId != null && e.pointerId !== activeIdRef.current) return;
      const deltaX = Math.min(0, getX(e) - dragStartX.current);
      dragDelta.current = deltaX;
      sidebar.style.transform = `translateX(${deltaX}px)`;
    };
    const finishDrag = (e) => {
      dragging.current = false;
      if (!sidebarRef.current) return;
      const shouldClose = dragDelta.current < -threshold;
      sidebarRef.current.style.transition = '';
      if (shouldClose) {
        onCloseRef.current?.();
      } else {
        sidebarRef.current.style.transform = '';
      }
      if (activeIdRef.current != null && e.target?.releasePointerCapture) {
        try { e.target.releasePointerCapture(activeIdRef.current); } catch (_) {}
      }
      activeIdRef.current = null;
    };

    sidebar.addEventListener('pointerdown', startDrag);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      sidebar.removeEventListener('pointerdown', startDrag);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [open]);

  // Updated handler with loading state
  const handleCreateGroup = async (name) => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error('Server responded with an error');
      const g = await res.json();
      
      onSelectGroup(g.slug); // Navigate to new group
      onClose();             // Close the sidebar
    } catch (err) {
      alert('Failed to create group.');
    } finally {
      setIsCreating(false);
      setIsModalOpen(false); // Close the modal
    }
  };

  return (
    <>
      <div
        className={`sidebar-overlay ${open ? 'open' : ''}`}
        onClick={onClose}
      />
      <aside
        ref={sidebarRef}
        className={`sidebar ${open ? 'open' : ''}`}
        aria-label="Groups sidebar"
      >
        <div className="sidebar-grabber" />
        <button className="sidebar-close" aria-label="Close sidebar" onClick={onClose}>
          ×
        </button>
        <section>
          <p className="current-group-label">Current Group</p>
          <div className="sg-header-row">
            <h2 className="current-group-name" title={currentGroupName} onClick={() => { onSelectGroup(currentSlug); onClose(); }} style={{ cursor: 'pointer' }}>
              {currentGroupName}
            </h2>
            <div className="sg-header-actions">
              <button className="icon-btn" aria-label="Group settings" title="Settings" onClick={onOpenSettings}>
                <CogIcon />
              </button>
              <button className="icon-btn" aria-label="Copy link" title="Copy link" onClick={() => onCopyLink(currentSlug)}>
                <ShareIcon />
              </button>
            </div>
          </div>
        </section>
        <section aria-labelledby="all-groups-title">
          <p id="all-groups-title" className="group-list-title">All Groups</p>
          <ul className="sg-list">
            {groups.map(g => (
              <li key={g.id} className="sg-item">
                <a href={`/${g.slug}`} className="group-item sg-name" onClick={(event) => { event.preventDefault(); onSelectGroup(g.slug); onClose(); }} title={g.name}>
                  {g.name}
                </a>
                <button className="icon-btn" aria-label={`Copy link to ${g.name}`} title="Copy link" onClick={() => onCopyLink(g.slug)}>
                  <ShareIcon />
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="create-group">
          <button
            className="button primary"
            onClick={() => setIsModalOpen(true)}
          >
            Create new group
          </button>
        </section>
      </aside>

      <InputModal
        open={isModalOpen}
        onClose={() => !isCreating && setIsModalOpen(false)}
        onSubmit={handleCreateGroup}
        isLoading={isCreating}
        title="Create New Group"
        inputLabel="Group Name"
        inputPlaceholder="e.g., Forest Cleanup Crew"
        submitText="Create"
      />
    </>
  );
}