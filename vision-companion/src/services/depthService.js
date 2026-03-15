import { useAppStore } from '../store/useAppStore';
import { DEPTH_INTERVAL_MS } from '../config';
import { pipeline, env, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;

let estimator = null;
let intervalId = null;
let frameCount = 0;
let fpsTimer = null;
let lastObstacleAlert = 0;
let obstacleCount = 0;
let isRunning = false;
let isCapturing = false;

export async function initDepthService(videoElement) {
  if (isRunning) return;
  isRunning = true;

  const store = useAppStore.getState();
  store.setDepthModelLoading(true);
  store.setDepthModelProgress(0);
  console.log('[Depth] Loading model...');

  try {
    estimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
      device: 'webgpu',
      dtype: 'fp16',
      progress_callback: (p) => {
        if (p.status === 'progress') {
          useAppStore.getState().setDepthModelProgress(Math.round(p.progress));
        }
      }
    });
    console.log('[Depth] Model loaded (webgpu)');
  } catch (e) {
    console.log('[Depth] WebGPU failed, trying WASM:', e.message);
    try {
      estimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress') {
            useAppStore.getState().setDepthModelProgress(Math.round(p.progress));
          }
        }
      });
      console.log('[Depth] Model loaded (wasm)');
    } catch (err) {
      console.error('[Depth] Failed to load model:', err);
      store.setDepthModelLoading(false);
      isRunning = false;
      return;
    }
  }

  store.setDepthModelLoading(false);
  store.setDepthReady(true);
  console.log('[Depth] Starting capture loop');
  startCapture(videoElement);

  fpsTimer = setInterval(() => {
    useAppStore.getState().setDepthFPS(frameCount);
    frameCount = 0;
  }, 1000);
}

async function processFrame(videoElement) {
  if (isCapturing || !estimator || !videoElement || videoElement.readyState < 2) return;
  isCapturing = true;
  try {
    const canvas = new OffscreenCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, 256, 256);
    const imageData = ctx.getImageData(0, 0, 256, 256);
    const rawImage = new RawImage(imageData.data, 256, 256, 4);
    const result = await estimator(rawImage);
    const depthData = result.depth.data;
    const uint8 = new Uint8Array(depthData.length);
    for (let i = 0; i < depthData.length; i++) {
      uint8[i] = Math.round(depthData[i] * 255);
    }
    useAppStore.getState().setDepthBuffer(uint8, result.depth.width, result.depth.height);
    frameCount++;
    checkObstacle(uint8, result.depth.width, result.depth.height);
  } catch (err) {
    console.error('[Depth] Frame error:', err);
  }
  isCapturing = false;
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
  intervalId = setInterval(() => processFrame(videoElement), DEPTH_INTERVAL_MS);
}

export function stopDepthService() {
  if (intervalId) clearInterval(intervalId);
  if (fpsTimer) clearInterval(fpsTimer);
  intervalId = null;
  isRunning = false;
  isCapturing = false;
}
