import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CameraFeed from './CameraFeed';
import DepthMiniMap from './DepthMiniMap';
import StatusIndicator from './StatusIndicator';
import OverlayCanvas from './OverlayCanvas';
import CaptionBar from './CaptionBar';
import SafetyBanner from './SafetyBanner';
import AvatarView from './AvatarView';
import ControlBar from './ControlBar';
import { useAppStore } from '../store/useAppStore';
import { startAgentLoop, stopAgentLoop, startVoiceAgent, stopVoiceAgent } from '../services/agentLoop';
import { stopDepthService } from '../services/depthService';

export default function MainView() {
  const { cameraError, cameraReady, avatarState } = useAppStore();

  useEffect(() => {
    if (cameraReady) {
      startAgentLoop();
      startVoiceAgent(); // Always-on voice listener
    }
    return () => {
      stopAgentLoop();
      stopVoiceAgent();
      stopDepthService();
    };
  }, [cameraReady]);

  return (
    <main
      className="relative w-full h-screen bg-black overflow-hidden"
      role="main"
      aria-label="Eyeris camera view"
    >
      {/* Thinking edge glow */}
      <AnimatePresence>
        {(avatarState === 'thinking') && (
          <motion.div
            key="thinking-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 z-30 pointer-events-none"
            style={{ boxShadow: 'inset 0 0 30px 8px rgba(240,192,32,0.5)' }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Camera Feed */}
      <CameraFeed />

      {/* Overlay Canvas */}
      <OverlayCanvas />

      {/* Safety Banner */}
      <SafetyBanner />

      {/* Error State */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-50" role="alert">
          <div className="bg-[#D02020] text-white p-8 border-4 border-white shadow-[8px_8px_0px_0px_white] max-w-sm mx-4">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-3">CAMERA ERROR</h2>
            <p className="font-medium">{cameraError}</p>
            <p className="text-sm mt-3 text-white/80">Please grant camera permissions and reload.</p>
          </div>
        </div>
      )}

      {/* Overlays */}
      {cameraReady && (
        <>
          <DepthMiniMap />
          <StatusIndicator />
          <CaptionBar />
          <AvatarView />
        </>
      )}

      {/* Control Bar - always visible when app is open */}
      <ControlBar />

      {/* Loading state when camera not ready */}
      {!cameraReady && !cameraError && (
        <div className="absolute inset-0 flex items-center justify-center z-30" role="status" aria-live="polite">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-white border-t-[#1040C0] rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
            <p className="text-white font-bold uppercase tracking-wider">INITIALIZING CAMERA...</p>
          </div>
        </div>
      )}
    </main>
  );
}
