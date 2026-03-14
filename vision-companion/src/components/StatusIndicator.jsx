import { useAppStore } from '../store/useAppStore';

export default function StatusIndicator() {
  const { geminiConnected, depthFPS, mode, depthReady, isProcessing } = useAppStore();
  return (
    <div className="absolute top-3 right-3 z-20 flex flex-col gap-1 items-end">
      <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-white ${geminiConnected ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
        {geminiConnected ? '● CONNECTED' : '○ OFFLINE'}
      </div>
      {depthReady && (
        <div className="bg-black/70 text-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-white/30">
          ◆ DEPTH {depthFPS}FPS
        </div>
      )}
      <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border border-white ${isProcessing ? 'bg-[#F0C020] text-black' : 'bg-black/70 text-white border-white/30'}`}>
        ▣ {mode.toUpperCase()}
      </div>
    </div>
  );
}
