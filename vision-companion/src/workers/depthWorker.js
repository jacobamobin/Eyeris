import { pipeline, env, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;

let estimator = null;
let isProcessing = false;

async function initModel() {
  self.postMessage({ type: 'loading', progress: 0 });
  try {
    estimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
      device: 'webgpu',
      dtype: 'fp16',
      progress_callback: (p) => {
        if (p.status === 'progress') {
          self.postMessage({ type: 'loading', progress: Math.round(p.progress) });
        }
      }
    });
  } catch (e) {
    // WASM fallback
    try {
      estimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress') {
            self.postMessage({ type: 'loading', progress: Math.round(p.progress) });
          }
        }
      });
    } catch (err) {
      self.postMessage({ type: 'error', message: err.message });
      return;
    }
  }
  self.postMessage({ type: 'ready' });
}

self.onmessage = async (e) => {
  if (e.data.type === 'init') {
    await initModel();
    return;
  }
  if (e.data.type === 'frame' && estimator && !isProcessing) {
    isProcessing = true;
    try {
      const { imageBitmap } = e.data;
      const { width: bmpW, height: bmpH } = imageBitmap;
      const offscreen = new OffscreenCanvas(bmpW, bmpH);
      offscreen.getContext('2d').drawImage(imageBitmap, 0, 0);
      const imageData = offscreen.getContext('2d').getImageData(0, 0, bmpW, bmpH);
      imageBitmap.close();
      const rawImage = new RawImage(imageData.data, bmpW, bmpH, 4);
      const result = await estimator(rawImage);
      const depthData = result.depth.data;
      // Normalize to Uint8Array (0-255)
      const uint8 = new Uint8Array(depthData.length);
      for (let i = 0; i < depthData.length; i++) {
        uint8[i] = Math.round(depthData[i] * 255);
      }
      self.postMessage({ type: 'depth', depthData: uint8, width: result.depth.width, height: result.depth.height }, [uint8.buffer]);
    } catch (err) {
      console.error('Depth error:', err);
    }
    isProcessing = false;
  }
};
