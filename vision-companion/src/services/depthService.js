import { useAppStore } from '../store/useAppStore';
import { DEPTH_INTERVAL_MS } from '../config';

let worker = null;
let intervalId = null;
let frameCount = 0;
let fpsTimer = null;
let lastObstacleAlert = 0;
let obstacleCount = 0;
let isCapturing = false;

export function initDepthService(videoElement) {
  if (worker) return;

  worker = new Worker(new URL('../workers/depthWorker.js', import.meta.url), { type: 'module' });

  worker.onmessage = (e) => {
    const store = useAppStore.getState();
    if (e.data.type === 'loading') {
      store.setDepthModelLoading(true);
      store.setDepthModelProgress(e.data.progress);
    } else if (e.data.type === 'ready') {
      store.setDepthModelLoading(false);
      store.setDepthReady(true);
      startCapture(videoElement);
    } else if (e.data.type === 'depth') {
      store.setDepthBuffer(e.data.depthData, e.data.width, e.data.height);
      frameCount++;
      checkObstacle(e.data.depthData, e.data.width, e.data.height);
    }
  };

  worker.postMessage({ type: 'init' });

  // FPS counter
  fpsTimer = setInterval(() => {
    useAppStore.getState().setDepthFPS(frameCount);
    frameCount = 0;
  }, 1000);
}

function checkObstacle(depthData, width, height) {
  const startY = Math.floor(height * 0.8);
  const startX = Math.floor(width * 0.25);
  const endX = Math.floor(width * 0.75);
  let closePixels = 0;
  let totalPixels = 0;

  for (let y = startY; y < height; y++) {
    for (let x = startX; x < endX; x++) {
      const idx = y * width + x;
      totalPixels++;
      if (depthData[idx] > 200) closePixels++;
    }
  }

  const ratio = closePixels / totalPixels;
  const now = Date.now();

  if (ratio > 0.3) {
    obstacleCount++;
    if (obstacleCount <= 3 && now - lastObstacleAlert > 3000) {
      lastObstacleAlert = now;
      useAppStore.getState().setSafetyAlert({
        id: 'obstacle-' + now,
        level: 'critical',
        message: 'Careful, something close ahead',
        sfSymbol: 'alert-triangle',
      });
      if (navigator.vibrate) navigator.vibrate(200);
    }
  } else {
    obstacleCount = 0;
  }
}

function startCapture(videoElement) {
  if (intervalId) return;
  intervalId = setInterval(() => {
    if (isCapturing || !videoElement || videoElement.readyState < 2) return;
    isCapturing = true;
    try {
      const canvas = new OffscreenCanvas(256, 256);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, 256, 256);
      // transferToImageBitmap is synchronous and properly transfers ownership
      const bitmap = canvas.transferToImageBitmap();
      worker.postMessage({ type: 'frame', imageBitmap: bitmap }, [bitmap]);
    } catch (e) {
      console.warn('Frame capture failed:', e);
    }
    isCapturing = false;
  }, DEPTH_INTERVAL_MS);
}

export function stopDepthService() {
  if (intervalId) clearInterval(intervalId);
  if (fpsTimer) clearInterval(fpsTimer);
  if (worker) { worker.terminate(); worker = null; }
  intervalId = null;
  isCapturing = false;
}
