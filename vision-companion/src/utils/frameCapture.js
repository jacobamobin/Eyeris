export async function captureFrame(videoElement, quality = 0.6, maxWidth = 640) {
  if (!videoElement || videoElement.readyState < 2) return null;
  const canvas = document.createElement('canvas');
  const scale = maxWidth / videoElement.videoWidth;
  canvas.width = maxWidth;
  canvas.height = Math.round(videoElement.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  // Brightness check
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  for (let i = 0; i < imageData.data.length; i += 4) sum += imageData.data[i];
  const avg = sum / (imageData.data.length / 4);
  if (avg < 20) return null; // Too dark

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1];
  if (base64.length * 0.75 > 500000) return null; // >500KB
  return base64;
}
