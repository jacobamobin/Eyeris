import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { Scan, Mic, BookOpen, Search } from 'lucide-react';
import { stopAgentLoop, startAgentLoop, runOnce } from '../services/agentLoop';
import { speak, stopSpeaking } from '../services/ttsService';

const MODES = [
  { id: 'scan', label: 'SCAN', Icon: Scan, color: 'bg-[#1040C0]', activeText: 'text-white' },
  { id: 'talk', label: 'TALK', Icon: Mic, color: 'bg-[#D02020]', activeText: 'text-white' },
  { id: 'read', label: 'READ', Icon: BookOpen, color: 'bg-[#F0C020]', activeText: 'text-[#121212]' },
  { id: 'find', label: 'FIND', Icon: Search, color: 'bg-[#121212]', activeText: 'text-white' },
];

export default function ControlBar() {
  const { mode, setMode, setIsScanning, setAvatarState, avatarState } = useAppStore();

  const handleModeChange = async (newMode) => {
    if (newMode === mode) return;
    stopSpeaking();
    setMode(newMode);

    if (newMode === 'scan') {
      setIsScanning(true);
      setAvatarState('idle');
      startAgentLoop();
    } else {
      setIsScanning(false);
      stopAgentLoop();
      setAvatarState('idle');

      if (newMode === 'read' || newMode === 'find') {
        const result = await runOnce(newMode, null);
        if (result?.spoken_response) {
          setAvatarState('speaking');
          await speak(result.spoken_response);
          setAvatarState('idle');
        } else {
          setAvatarState('idle');
        }
      }
      // TALK mode: voice agent is always running from MainView — no action needed here
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex border-t-4 border-[#121212]" role="toolbar" aria-label="Mode controls">
      {MODES.map(({ id, label, Icon, color, activeText }) => (
        <motion.button
          key={id}
          onClick={() => handleModeChange(id)}
          whileTap={{ x: 2, y: 2 }}
          className={`flex-1 py-5 flex flex-col items-center gap-1 font-black uppercase tracking-wider text-[10px] border-r-2 border-[#121212] last:border-r-0 transition-colors ${
            mode === id
              ? `${color} ${activeText} shadow-none`
              : 'bg-[#121212] text-white/70'
          }`}
          aria-label={`${label} mode`}
          aria-pressed={mode === id}
        >
          <Icon size={20} strokeWidth={2.5} />
          <span>{label}</span>
          {id === 'talk' && mode === 'talk' && avatarState === 'listening' && (
            <motion.div
              className="w-2 h-2 bg-green-400 rounded-full"
              animate={{ opacity: [1, 0.3] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
        </motion.button>
      ))}
    </div>
  );
}
