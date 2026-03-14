// Maps depth value 0-255 to RGB. 255=near (red/warm), 0=far (cyan/cool)
export function depthToRGB(value) {
  const t = value / 255;
  // cyan (0,200,255) → yellow (255,200,0) → red (255,0,0)
  let r, g, b;
  if (t < 0.5) {
    const s = t * 2;
    r = Math.round(s * 255);
    g = Math.round(200);
    b = Math.round((1 - s) * 255);
  } else {
    const s = (t - 0.5) * 2;
    r = 255;
    g = Math.round((1 - s) * 200);
    b = 0;
  }
  return [r, g, b];
}
