import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { depthToRGB } from '../utils/depthColorMap';

export default function DepthMiniMap() {
  const canvasRef = useRef(null);
  const { depthBuffer, depthWidth, depthHeight, depthModelLoading, depthModelProgress, depthFPS, depthReady } = useAppStore();

  useEffect(() => {
    if (!depthBuffer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = 120, H = 90;
    const imageData = ctx.createImageData(W, H);

    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const sx = Math.round((px / W) * depthWidth);
        const sy = Math.round((py / H) * depthHeight);
        const val = depthBuffer[sy * depthWidth + sx] || 0;
        const [r, g, b] = depthToRGB(val);
        const i = (py * W + px) * 4;
        imageData.data[i] = r;
        imageData.data[i+1] = g;
        imageData.data[i+2] = b;
        imageData.data[i+3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [depthBuffer]);

  return (
    <div className="absolute top-3 left-3 z-20">
      <div className="relative border-2 border-white overflow-hidden" style={{ width: 120, height: 90, background: '#000' }}>
        <canvas ref={canvasRef} width={120} height={90} />
        {depthModelLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-white text-xs text-center">
              <div className="font-bold">LOADING</div>
              <div>{depthModelProgress}%</div>
            </div>
          </div>
        )}
        {!depthReady && !depthModelLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-white text-xs text-center">
              <div className="font-bold">INIT</div>
            </div>
          </div>
        )}
      </div>
      <div className="bg-black text-white text-[9px] font-bold uppercase tracking-widest px-1 py-0.5 flex items-center justify-between">
        <span>3D DEPTH</span>
        {depthReady && <span>{depthFPS}fps</span>}
      </div>
    </div>
  );
}
