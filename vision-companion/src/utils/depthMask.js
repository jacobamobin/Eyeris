export function createDepthMask(bbox, depthMaskRange, depthBuffer, depthWidth, depthHeight, canvasWidth, canvasHeight, color) {
  if (!depthBuffer || !depthMaskRange) return null;
  const [near, far] = depthMaskRange;
  const [yMin, xMin, yMax, xMax] = bbox;

  const pxX = Math.round((xMin / 1000) * canvasWidth);
  const pxY = Math.round((yMin / 1000) * canvasHeight);
  const pxW = Math.round(((xMax - xMin) / 1000) * canvasWidth);
  const pxH = Math.round(((yMax - yMin) / 1000) * canvasHeight);

  if (pxW <= 0 || pxH <= 0) return null;

  const imageData = new ImageData(pxW, pxH);
  const [r, g, b] = color;

  for (let py = 0; py < pxH; py++) {
    for (let px = 0; px < pxW; px++) {
      const canvasPixelX = pxX + px;
      const canvasPixelY = pxY + py;
      const depthX = Math.round((canvasPixelX / canvasWidth) * depthWidth);
      const depthY = Math.round((canvasPixelY / canvasHeight) * depthHeight);
      const depthIdx = depthY * depthWidth + depthX;
      const depthVal = depthBuffer[depthIdx];

      const idx = (py * pxW + px) * 4;
      if (depthVal >= Math.min(near, far) && depthVal <= Math.max(near, far)) {
        imageData.data[idx] = r;
        imageData.data[idx+1] = g;
        imageData.data[idx+2] = b;
        imageData.data[idx+3] = 77; // 30% opacity
      } else {
        imageData.data[idx+3] = 0;
      }
    }
  }
  return { imageData, x: pxX, y: pxY };
}
