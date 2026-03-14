export function geminiToScreen(bbox, canvasWidth, canvasHeight) {
  const [yMin, xMin, yMax, xMax] = bbox;
  return {
    x: (xMin / 1000) * canvasWidth,
    y: (yMin / 1000) * canvasHeight,
    width: ((xMax - xMin) / 1000) * canvasWidth,
    height: ((yMax - yMin) / 1000) * canvasHeight,
  };
}
