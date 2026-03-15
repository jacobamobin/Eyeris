// Module worker — NO top-level await so message handler registers immediately
console.log('[DepthWorker] Script loaded');

let estimator = null;
let isProcessing = false;
let RawImageRef = null;

async function initModel() {
  console.log('[DepthWorker] initModel: importing transformers...');
  self.postMessage({ type: 'loading', progress: 0 });

  let pipeline, env, RawImage;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
    pipeline = mod.pipeline;
    env = mod.env;
    RawImage = mod.RawImage;
    RawImageRef = RawImage;
    console.log('[DepthWorker] Transformers imported OK');
  } catch (e) {
    console.error('[DepthWorker] CDN import failed:', e);
    self.postMessage({ type: 'error', message: 'CDN import failed: ' + e.message });
    return;
  }

  env.allowLocalModels = false;
  env.backends.onnx.wasm.numThreads = 1;

  try {
    console.log('[DepthWorker] Creating pipeline (webgpu)...');
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
    console.log('[DepthWorker] WebGPU failed, trying WASM:', e.message);
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
      console.error('[DepthWorker] WASM also failed:', err);
      self.postMessage({ type: 'error', message: err.message });
      return;
    }
  }

  console.log('[DepthWorker] Model ready');
  self.postMessage({ type: 'ready' });
}

self.onmessage = async (e) => {
  console.log('[DepthWorker] Received:', e.data.type);
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
      const rawImage = new RawImageRef(imageData.data, bmpW, bmpH, 4);
      const result = await estimator(rawImage);
      const depthData = result.depth.data;
      const uint8 = new Uint8Array(depthData.length);
      for (let i = 0; i < depthData.length; i++) {
        uint8[i] = Math.round(depthData[i] * 255);
      }
      self.postMessage({ type: 'depth', depthData: uint8, width: result.depth.width, height: result.depth.height }, [uint8.buffer]);
    } catch (err) {
      console.error('[DepthWorker] Frame error:', err);
    }
    isProcessing = false;
  }
};

console.log('[DepthWorker] Message handler registered');
