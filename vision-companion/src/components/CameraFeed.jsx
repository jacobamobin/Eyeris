import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { initDepthService } from '../services/depthService';

export default function CameraFeed() {
  const videoRef = useRef(null);
  const { setCameraReady, setCameraError, setVideoRef } = useAppStore();

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            setCameraReady(true);
            setVideoRef(videoRef.current);
            initDepthService(videoRef.current);
          };
        }
      } catch (err) {
        setCameraError(err.message || 'Camera permission denied');
      }
    })();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}
