import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { geminiToScreen } from '../utils/bboxMapper';
import { createDepthMask } from '../utils/depthMask';

const STALE_OVERLAY_TTL_MS = 8000; // Clear overlays after 8s of no updates

const ICON_MAP = {
  'alert-triangle': '⚠',
  'stop-circle': '⛔',
  'footprints': '👣',
  'arrow-left': '←',
  'arrow-right': '→',
  'arrow-up': '↑',
  'door-open': '🚪',
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ] : [255, 255, 0];
}

export default function OverlayCanvas() {
  const canvasRef = useRef(null);
  const lastUpdateRef = useRef(Date.now());
  const staleTimerRef = useRef(null);
  const { detectedObjects, depthBuffer, depthWidth, depthHeight, setDetectedObjects } = useAppStore();

  // Stale overlay cleanup
  useEffect(() => {
    if (detectedObjects && detectedObjects.length > 0) {
      lastUpdateRef.current = Date.now();
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        setDetectedObjects([]);
      }, STALE_OVERLAY_TTL_MS);
    }
    return () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [detectedObjects]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!detectedObjects || detectedObjects.length === 0) return;

    detectedObjects.forEach((obj) => {
      if (!obj.bbox || obj.bbox.length < 4) return;
      const screen = geminiToScreen(obj.bbox, W, H);
      const color = obj.overlayColor || '#F0C020';
      const rgb = hexToRgb(color);

      // Draw depth heatmap inside bbox (on-device depth buffer → blue→green→red)
      if (depthBuffer && depthWidth && depthHeight) {
        const pxW = Math.round(screen.width);
        const pxH = Math.round(screen.height);
        if (pxW > 0 && pxH > 0) {
          const heatmapData = new ImageData(pxW, pxH);
          for (let py = 0; py < pxH; py++) {
            for (let px = 0; px < pxW; px++) {
              const cx = screen.x + px;
              const cy = screen.y + py;
              const dx = Math.min(Math.round((cx / W) * depthWidth), depthWidth - 1);
              const dy = Math.min(Math.round((cy / H) * depthHeight), depthHeight - 1);
              const val = depthBuffer[dy * depthWidth + dx] || 0;
              // blue (far=0) → green (mid=128) → red (near=255)
              const r = val > 128 ? Math.round(((val - 128) / 127) * 255) : 0;
              const g = val < 128 ? Math.round((val / 128) * 255) : Math.round(((255 - val) / 127) * 255);
              const b = val < 128 ? Math.round(((128 - val) / 128) * 255) : 0;
              const idx = (py * pxW + px) * 4;
              heatmapData.data[idx] = r;
              heatmapData.data[idx + 1] = g;
              heatmapData.data[idx + 2] = b;
              heatmapData.data[idx + 3] = 90; // ~35% opacity
            }
          }
          const tmp = document.createElement('canvas');
          tmp.width = pxW;
          tmp.height = pxH;
          tmp.getContext('2d').putImageData(heatmapData, 0, 0);
          ctx.drawImage(tmp, screen.x, screen.y);
        }
      }

      // Depth range mask overlay (if LLM provided depthMaskRange)
      if (obj.depthMaskRange && depthBuffer) {
        const mask = createDepthMask(
          obj.bbox,
          obj.depthMaskRange,
          depthBuffer, depthWidth, depthHeight,
          W, H,
          rgb
        );
        if (mask) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = mask.imageData.width;
          tempCanvas.height = mask.imageData.height;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.putImageData(mask.imageData, 0, 0);
          ctx.drawImage(tempCanvas, mask.x, mask.y);
        }
      }

      // Bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = obj.isTarget ? 3 : 2;
      ctx.setLineDash(obj.isTarget ? [] : [6, 3]);
      ctx.strokeRect(screen.x, screen.y, screen.width, screen.height);
      ctx.setLineDash([]);

      // Corner markers (Bauhaus style)
      const cs = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      // Top-left
      ctx.beginPath(); ctx.moveTo(screen.x, screen.y + cs); ctx.lineTo(screen.x, screen.y); ctx.lineTo(screen.x + cs, screen.y); ctx.stroke();
      // Top-right
      ctx.beginPath(); ctx.moveTo(screen.x + screen.width - cs, screen.y); ctx.lineTo(screen.x + screen.width, screen.y); ctx.lineTo(screen.x + screen.width, screen.y + cs); ctx.stroke();
      // Bottom-left
      ctx.beginPath(); ctx.moveTo(screen.x, screen.y + screen.height - cs); ctx.lineTo(screen.x, screen.y + screen.height); ctx.lineTo(screen.x + cs, screen.y + screen.height); ctx.stroke();
      // Bottom-right
      ctx.beginPath(); ctx.moveTo(screen.x + screen.width - cs, screen.y + screen.height); ctx.lineTo(screen.x + screen.width, screen.y + screen.height); ctx.lineTo(screen.x + screen.width, screen.y + screen.height - cs); ctx.stroke();

      // Label background
      const label = (obj.sfSymbol ? (ICON_MAP[obj.sfSymbol] || '') + ' ' : '') + obj.label.toUpperCase();
      ctx.font = 'bold 11px Outfit, sans-serif';
      const textW = ctx.measureText(label).width;
      const labelX = screen.x;
      const labelY = screen.y > 18 ? screen.y - 4 : screen.y + screen.height + 18;

      ctx.fillStyle = color;
      ctx.fillRect(labelX, labelY - 14, textW + 8, 18);

      ctx.fillStyle = '#121212';
      ctx.fillText(label, labelX + 4, labelY);

      // Depth estimate badge
      if (obj.depthEstimate != null) {
        const dist = `${obj.depthEstimate.toFixed(1)}m`;
        ctx.font = 'bold 10px Outfit, sans-serif';
        const dW = ctx.measureText(dist).width;
        ctx.fillStyle = '#121212';
        ctx.fillRect(screen.x + screen.width - dW - 10, screen.y + 2, dW + 8, 16);
        ctx.fillStyle = '#F0F0F0';
        ctx.fillText(dist, screen.x + screen.width - dW - 6, screen.y + 14);
      }

      // Target pulse indicator
      if (obj.isTarget) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.strokeRect(screen.x - 6, screen.y - 6, screen.width + 12, screen.height + 12);
        ctx.globalAlpha = 0.2;
        ctx.strokeRect(screen.x - 12, screen.y - 12, screen.width + 24, screen.height + 24);
        ctx.globalAlpha = 1;
      }
    });
  }, [detectedObjects, depthBuffer]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    observer.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
      aria-hidden="true"
    />
  );
}
