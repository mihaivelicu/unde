// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import HeaderButton from './components/HeaderButton';
import Sidebar from './components/Sidebar';
import NotificationToast from './components/NotificationToast';
import MapView from './components/MapView';
import AddPinSheet from './components/AddPinSheet';
import GroupSettingsSheet from './components/GroupSettingsSheet';
import { PlusIcon } from './icons';
import './styles/notification.css';

export default function App() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [currentSlug, setCurrentSlug] = useState(slug || null);
  const [groupData, setGroupData] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notification, setNotification] = useState({ message: '', visible: false });

  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [confirmedLocation, setConfirmedLocation] = useState(null);

  const notificationTimer = useRef(null);

  // map fit control
  const [autoFit, setAutoFit] = useState(true);
  const firstLoadRef = useRef(true);

  // websocket refs
  const wsRef = useRef(null);
  const wsSlugRef = useRef(null);
  const wsHeartbeatRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  /* ---------------- load groups on mount ---------------- */
  useEffect(() => {
    api.getGroups()
      .then((gs) => {
        setGroups(gs);
        if (!slug) {
          const defaultSlug = gs[0]?.slug || 'forest-cleanup';
          navigate(`/${defaultSlug}`, { replace: true });
          setCurrentSlug(defaultSlug);
        }
      })
      .catch((err) => showError(`Failed to load groups: ${err.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /* keep body class in‑sync so CSS can hide the pill */
useEffect(() => {
  document.body.classList.toggle('sidebar-open', sidebarOpen);
}, [sidebarOpen]);

  

  /* ---------------- load current group ------------------ */
  useEffect(() => {
    if (!slug) return;
    setCurrentSlug(slug);

    // on slug change, first load => allow auto fit
    firstLoadRef.current = true;
    setAutoFit(true);

    api.getGroupDetails(slug)
      .then((data) => {
        setGroupData(data);
        firstLoadRef.current = false; // subsequent updates won't auto fit
      })
      .catch(async (err) => {
        const msg = String(err?.message || '');
        if (err.status === 404 || /HTTP\s+404/.test(msg)) {
          try {
            const gs = await api.getGroups();
            const fallback = gs[0]?.slug || 'forest-cleanup';
            showError(`Group "${slug}" not found. Redirected to "${fallback}".`);
            navigate(`/${fallback}`, { replace: true });
          } catch {
            showError(`Group "${slug}" not found.`);
          }
        } else {
          showError(`Failed to load group: ${msg}`);
        }
      });

    // connect / re-subscribe WS
    connectWS(slug);

    return () => {
      // do not close socket when slug changes; we re-subscribe instead in connectWS
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, navigate]);

  /* ---------------- WebSocket ---------------- */
  function connectWS(targetSlug) {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws`;

    // if socket exists but wrong slug, just (re)send subscribe
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (wsSlugRef.current !== targetSlug) {
        wsRef.current.send(JSON.stringify({ type: 'subscribe', slug: targetSlug }));
        wsSlugRef.current = targetSlug;
      }
      return;
    }

    // if an old socket exists, close it
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // subscribe
      ws.send(JSON.stringify({ type: 'subscribe', slug: targetSlug }));
      wsSlugRef.current = targetSlug;

      // heartbeat
      clearInterval(wsHeartbeatRef.current);
      wsHeartbeatRef.current = setInterval(() => {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch {}
      }, 25000);
    };

    ws.onmessage = (ev) => {
  let data;
  try { data = JSON.parse(ev.data); } catch { return; }
  const t = data.type;

  if (t === 'subscribed') return;
  if (data.slug && data.slug !== wsSlugRef.current) return;

  if (t === 'pin_created') {
    const pin = data.pin;
    setGroupData(prev => {
      if (!prev) return prev;
      if (prev.pins.some(p => p.id === pin.id)) return prev;
      return { ...prev, pins: [...prev.pins, pin] };
    });
    setAutoFit(false);
  }
  else if (t === 'pin_upvoted') {
    setGroupData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pins: prev.pins.map(p => p.id === data.id ? { ...p, upvotes: data.upvotes } : p),
      };
    });
  }
  else if (t === 'pin_updated') {
    const pin = data.pin;
    setGroupData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pins: prev.pins.map(p => p.id === pin.id ? pin : p),
      };
    });
  }
  else if (t === 'pins_updated') {
    const pins = data.pins || [];
    setGroupData(prev => prev ? { ...prev, pins } : prev);
  }
  else if (t === 'statuses_changed') {
    const statuses = data.statuses || [];
    setGroupData(prev => {
      if (!prev) return prev;
      // refresh pin labels from status_id using the new statuses list
      const byId = new Map(statuses.map(s => [String(s.id), s]));
      const pins = (prev.pins || []).map(p => {
        const sid = p.status_id != null ? String(p.status_id) : '';
        const s = sid ? byId.get(sid) : null;
        return { ...p, status: s ? s.label : null };
      });
      return { ...prev, statuses, pins };
    });
  }
};


    ws.onclose = () => {
      clearInterval(wsHeartbeatRef.current);
      wsHeartbeatRef.current = null;
      // reconnect with backoff
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => connectWS(wsSlugRef.current || targetSlug), 1500);
    };

    ws.onerror = () => {
      try { ws.close(); } catch {}
    };
  }

  /* ---------------- helpers ------------------ */
  function showError(msg) {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification({ message: msg, visible: true });
    notificationTimer.current = setTimeout(() => {
      setNotification({ message: '', visible: false });
    }, 3000);
  }

  const currentGroupName = useMemo(() => groupData?.name || '', [groupData]);

  function handleSelectGroup(newSlug) {
    navigate(`/${newSlug}`);
    setSidebarOpen(false);
  }

  function handleCopyLink(slugToCopy) {
    const url = `${window.location.origin}/${slugToCopy}`;
    navigator.clipboard.writeText(url)
      .then(() => {
        if (notificationTimer.current) clearTimeout(notificationTimer.current);
        setNotification({ message: `"${url}" copied to clipboard`, visible: true });
        notificationTimer.current = setTimeout(() => {
          setNotification({ message: '', visible: false });
        }, 3000);
      })
      .catch(() => {
        setNotification({ message: 'Failed to copy link', visible: true });
      });
  }

  function openAddPin() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setConfirmedLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setConfirmedLocation(null),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
    setAddOpen(true);
  }

  function handleUpvote(pinId) {
    // optimistic
    setGroupData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        pins: prev.pins.map(p => p.id === pinId ? { ...p, upvotes: (p.upvotes || 0) + 1 } : p),
      };
    });
    api.upvotePin(pinId).catch(() => {
      showError('Failed to upvote. Please try again.');
      setGroupData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pins: prev.pins.map(p => p.id === pinId ? { ...p, upvotes: Math.max(0, (p.upvotes || 1) - 1) } : p),
        };
      });
    });
  }

function handleChangeStatus(pinId, newStatusId) {
  const s = (groupData?.statuses || []).find(
    (x) => String(x.id) === String(newStatusId)
  );
  const newStatusLabel = s?.label || null;

  // optimistic: set both label and id
  setGroupData((prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      pins: prev.pins.map((p) =>
        p.id === pinId
          ? { ...p, status: newStatusLabel, status_id: Number(newStatusId) }
          : p
      ),
    };
  });

  api.updatePin(pinId, { status_id: Number(newStatusId) }).catch(() => {
    showError('Failed to update status.');
    api.getGroupDetails(currentSlug).then(setGroupData).catch(() => {});
  });
}


  async function handleCreatePin(payload, files) {
    const tempId = Math.floor(Math.random() * 1e9);
    const previewUrls = (files || []).map(f => URL.createObjectURL(f));

    setGroupData(prev => prev ? {
      ...prev,
      pins: [
        ...prev.pins,
        {
          id: tempId,
          lat: payload.lat,
          lng: payload.lng,
          description: payload.description,
          upvotes: 0,
          status: null,
          photos: previewUrls,
        },
      ],
    } : prev);

    setAutoFit(false);
    setAddOpen(false);

    try {
      const uploadedUrls = await api.uploadPhotos(payload.group_id, files || []);
      const created = await api.createPin({ ...payload, photos: uploadedUrls });

      setGroupData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          pins: prev.pins.map(p => p.id === tempId ? created : p),
        };
      });
    } catch (err) {
      console.error(err);
      showError('Failed to create pin.');
      setGroupData(prev => {
        if (!prev) return prev;
        return { ...prev, pins: prev.pins.filter(p => p.id !== tempId) };
      });
    }
  }

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <div id="map"></div>
      <MapView
        groupData={groupData}
        onUpvote={handleUpvote}
        onChangeStatus={handleChangeStatus}
        autoFit={autoFit}
      />

      <HeaderButton
        title={currentGroupName}
        onClick={() => setSidebarOpen(true)}
        style={{ display: sidebarOpen ? 'none' : 'inline-flex' }}   // ← just this
      />


      <Sidebar
        open={sidebarOpen}
        currentGroupName={currentGroupName}
        currentSlug={currentSlug}
        groups={(groups || []).filter(g => g.slug !== currentSlug)}
        onSelectGroup={handleSelectGroup}
        onCopyLink={handleCopyLink}
        onOpenSettings={() => { setSettingsOpen(true); }}
        onClose={() => setSidebarOpen(false)}
      />

      <button className="fab" onClick={openAddPin} aria-label="Add pin">
        <PlusIcon />
      </button>

      <NotificationToast message={notification.message} visible={notification.visible} />

      <AddPinSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleCreatePin}
        statuses={groupData?.statuses || []}
        group={groupData}
        initialLatLng={confirmedLocation}
      />

      <GroupSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        group={groupData}
        statuses={groupData?.statuses || []}
        onGroupUpdate={(upd) => setGroupData(upd)}
      />
    </div>
  );
}
