import { useState, useEffect, useRef, useCallback } from 'react';
import type { CameraConfig, HAState } from '../types';
import { cameraStreamUrl, cameraSnapshotUrl, cameraSupportsStream } from '../services/cameraApi';
import './LightModal.css';
import './CameraModal.css';

interface Props {
  visible: boolean;
  camera: CameraConfig | null;
  state: HAState | null;
  /** Demo/simulation → render a generated feed instead of hitting the network. */
  demo: boolean;
  onClose: () => void;
}

type Mode = 'loading' | 'live' | 'snapshot' | 'error';

export default function CameraModal({ visible, camera, state, demo, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('loading');
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [snapshotBust, setSnapshotBust] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Resolve the feed URL (live stream preferred, else snapshot). Skipped in demo.
  useEffect(() => {
    if (!visible || !camera || demo) return;
    const stream = cameraStreamUrl(state);
    if (stream) {
      setMode('live');
      setImgSrc(stream);
      return;
    }
    const snap = cameraSnapshotUrl(state);
    if (snap) {
      setMode('snapshot');
      setImgSrc(`${snap}${snap.includes('?') ? '&' : '?'}_=${Date.now()}`);
      return;
    }
    setMode('error');
    setImgSrc(null);
  }, [visible, camera, state, demo, snapshotBust]);

  // Refresh the still image periodically in snapshot mode.
  useEffect(() => {
    if (!visible || demo || mode !== 'snapshot') return;
    const id = setInterval(() => setSnapshotBust((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [visible, demo, mode]);

  // Animated placeholder feed for the demo / simulation.
  useEffect(() => {
    if (!visible || !demo) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = (canvas.width = 640);
    const H = (canvas.height = 360);
    let raf = 0;
    let t = 0;
    const draw = () => {
      t += 1;
      // Backdrop
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1b2430');
      grad.addColorStop(1, '#0c1016');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      // Perspective floor grid
      ctx.strokeStyle = 'rgba(120,150,190,0.16)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const y = H * 0.55 + (i * i) * 2.2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2, H * 0.55);
        ctx.lineTo(W / 2 + i * 90, H);
        ctx.stroke();
      }
      // A patrolling subject
      const px = W / 2 + Math.sin(t / 60) * W * 0.32;
      const py = H * 0.62 + Math.cos(t / 90) * 8;
      ctx.fillStyle = 'rgba(180,200,220,0.85)';
      ctx.beginPath();
      ctx.ellipse(px, py + 34, 14, 6, 0, 0, Math.PI * 2); // shadow
      ctx.fill();
      ctx.fillStyle = '#9fb3c8';
      ctx.fillRect(px - 8, py - 14, 16, 34);
      ctx.beginPath();
      ctx.arc(px, py - 22, 8, 0, Math.PI * 2);
      ctx.fill();
      // Scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      // Overlay: label, REC, timestamp
      ctx.font = '600 15px monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText((camera?.label || 'CAMERA').toUpperCase(), 14, 26);
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.arc(W - 78, 21, 5 + (Math.sin(t / 12) > 0 ? 1 : 0), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f87171';
      ctx.fillText('REC', W - 64, 26);
      ctx.fillStyle = 'rgba(226,232,240,0.85)';
      ctx.font = '13px monospace';
      ctx.fillText(new Date().toLocaleTimeString(), 14, H - 14);
      ctx.fillStyle = 'rgba(226,232,240,0.35)';
      ctx.fillText('SIMULATED', W - 96, H - 14);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [visible, demo, camera]);

  const handleImgError = useCallback(() => {
    // Live stream failed → try a snapshot; snapshot failed → error state.
    if (mode === 'live') {
      const snap = cameraSnapshotUrl(state);
      if (snap) {
        setMode('snapshot');
        setImgSrc(`${snap}${snap.includes('?') ? '&' : '?'}_=${Date.now()}`);
        return;
      }
    }
    setMode('error');
  }, [mode, state]);

  const badge = demo ? 'SIMULATED' : mode === 'live' ? 'LIVE' : mode === 'snapshot' ? 'SNAPSHOT' : '';
  const online = demo || state?.state !== 'unavailable';

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="light-modal camera-modal">
        <div className="modal-header">
          <div className="modal-title">
            <div className="modal-bulb-icon" style={{ borderColor: online ? '#60a5fa' : '#334155' }}>
              &#128247;
            </div>
            <div>
              <div className="modal-entity-name">{camera?.label || 'Camera'}</div>
              <div className="modal-entity-id">{camera?.entityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>&#10005;</button>
        </div>

        <div className="camera-feed">
          {badge && !demo && (
            <span className={`camera-badge${badge === 'LIVE' ? ' live' : ''}`}>
              {badge === 'LIVE' && <span className="camera-badge-dot" />}
              {badge}
            </span>
          )}
          {demo ? (
            <canvas ref={canvasRef} className="camera-canvas" />
          ) : mode === 'error' ? (
            <div className="camera-empty">
              No feed available
              {!cameraSupportsStream(state) && state && <div className="camera-empty-sub">This camera has no live stream.</div>}
            </div>
          ) : (
            <>
              {mode === 'loading' && <div className="camera-spinner" />}
              {imgSrc && (
                <img
                  className="camera-img"
                  src={imgSrc}
                  alt={camera?.label || 'camera'}
                  onLoad={() => setMode((m) => (m === 'loading' ? 'snapshot' : m))}
                  onError={handleImgError}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
