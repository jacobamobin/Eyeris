import CameraFeed from './CameraFeed';
import DepthMiniMap from './DepthMiniMap';
import StatusIndicator from './StatusIndicator';
import { useAppStore } from '../store/useAppStore';

export default function MainView() {
  const { cameraError, cameraReady } = useAppStore();

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Camera Feed */}
      <CameraFeed />

      {/* Error State */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
          <div className="bg-[#D02020] text-white p-8 border-4 border-white shadow-[8px_8px_0px_0px_white] max-w-sm mx-4">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-3">CAMERA ERROR</h2>
            <p className="font-medium">{cameraError}</p>
          </div>
        </div>
      )}

      {/* Overlays */}
      {cameraReady && (
        <>
          <DepthMiniMap />
          <StatusIndicator />
        </>
      )}

      {/* Loading state when camera not ready */}
      {!cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-white border-t-[#1040C0] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-bold uppercase tracking-wider">INITIALIZING CAMERA...</p>
          </div>
        </div>
      )}
    </div>
  );
}
