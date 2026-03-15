export function createDepthMask(bbox, _depthMaskRange, depthBuffer, depthWidth, depthHeight, canvasWidth, canvasHeight, color, label) {
  if (!depthBuffer) return null;
  const [yMin, xMin, yMax, xMax] = bbox;

  const pxX = Math.round((xMin / 1000) * canvasWidth);
  const pxY = Math.round((yMin / 1000) * canvasHeight);
  const pxW = Math.round(((xMax - xMin) / 1000) * canvasWidth);
  const pxH = Math.round(((yMax - yMin) / 1000) * canvasHeight);

  if (pxW <= 0 || pxH <= 0) return null;

  // Sample the center 50% of the bbox to find the object's median depth
  const sX = Math.round(pxX + pxW * 0.25);
  const sY = Math.round(pxY + pxH * 0.25);
  const sW = Math.round(pxW * 0.5);
  const sH = Math.round(pxH * 0.5);

  const samples = [];
  for (let py = sY; py < sY + sH; py += 2) {
    for (let px = sX; px < sX + sW; px += 2) {
      const dx = Math.min(Math.round((px / canvasWidth) * depthWidth), depthWidth - 1);
      const dy = Math.min(Math.round((py / canvasHeight) * depthHeight), depthHeight - 1);
      const val = depthBuffer[dy * depthWidth + dx];
      if (val != null) samples.push(val);
    }
  }

  if (samples.length === 0) return null;
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const threshold = 40; // ±40 depth units around the object's median
  const lo = Math.max(0, median - threshold);
  const hi = Math.min(255, median + threshold);

  // People get a subtle gray overlay; everything else gets the object color
  const isPerson = label && label.toLowerCase().includes('person');
  const [r, g, b] = isPerson ? [100, 100, 100] : color;
  const alpha = isPerson ? 130 : 140;
  const imageData = new ImageData(pxW, pxH);

  for (let py = 0; py < pxH; py++) {
    for (let px = 0; px < pxW; px++) {
      const cx = pxX + px;
      const cy = pxY + py;
      const dx = Math.min(Math.round((cx / canvasWidth) * depthWidth), depthWidth - 1);
      const dy = Math.min(Math.round((cy / canvasHeight) * depthHeight), depthHeight - 1);
      const val = depthBuffer[dy * depthWidth + dx] || 0;
      const idx = (py * pxW + px) * 4;
      if (val >= lo && val <= hi) {
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = alpha;
      }
    }
  }

  return { imageData, x: pxX, y: pxY };
}
