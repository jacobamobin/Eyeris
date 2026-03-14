import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { Scan, BookOpen, Search, Mic, MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { stopAgentLoop, startAgentLoop, runOnceRead, stopVoiceAgent } from '../services/agentLoop';
import { stopSpeaking, setSpeakerMuted } from '../services/ttsService';
import { setMicMuted } from '../services/continuousListener';

const MODE_BUTTONS = [
  { id: 'scan', label: 'SCAN', Icon: Scan, color: 'bg-[#1040C0]', activeText: 'text-white' },
  { id: 'read', label: 'READ', Icon: BookOpen, color: 'bg-[#F0C020]', activeText: 'text-[#121212]' },
  { id: 'find', label: 'FIND', Icon: Search, color: 'bg-[#121212]', activeText: 'text-white' },
];

export default function ControlBar() {
  const {
    mode, setMode, setIsScanning, setAvatarState,
    micMuted, setMicMuted: storeMicMuted,
    speakerMuted, setSpeakerMuted: storeSpeakerMuted,
    setScreen, setCurrentCaption,
  } = useAppStore();

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

      if (newMode === 'read') {
        await runOnceRead();
      } else if (newMode === 'find') {
        // Prompt user to speak — voice agent will handle the query
        setCurrentCaption('Say what you\'re looking for...');
        setAvatarState('listening');
      }
    }
  };

  const handleMicToggle = () => {
    const next = !micMuted;
    storeMicMuted(next);
    setMicMuted(next); // update continuousListener module state
  };

  const handleSpeakerToggle = () => {
    const next = !speakerMuted;
    storeSpeakerMuted(next);
    setSpeakerMuted(next); // update ttsService module state
  };

  const handleExit = () => {
    stopSpeaking();
    stopVoiceAgent();
    stopAgentLoop();
    setScreen('landing');
  };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 flex border-t-4 border-[#121212]"
      role="toolbar"
      aria-label="App controls"
    >
      {/* Left group: mode buttons */}
      {MODE_BUTTONS.map(({ id, label, Icon, color, activeText }) => (
        <motion.button
          key={id}
          onClick={() => handleModeChange(id)}
          whileTap={{ x: 2, y: 2 }}
          className={`flex-1 py-5 flex flex-col items-center gap-1 font-black uppercase tracking-wider text-[10px] border-r-2 border-[#121212] transition-colors ${
            mode === id
              ? `${color} ${activeText} shadow-none`
              : 'bg-[#121212] text-white/70'
          }`}
          aria-label={`${label} mode`}
          aria-pressed={mode === id}
        >
          <Icon size={20} strokeWidth={2.5} />
          <span>{label}</span>
        </motion.button>
      ))}

      {/* Divider */}
      <div className="w-[2px] bg-[#333]" />

      {/* Right group: mic mute, speaker mute, exit */}
      <motion.button
        onClick={handleMicToggle}
        whileTap={{ x: 2, y: 2 }}
        className={`w-16 py-5 flex flex-col items-center gap-1 font-black uppercase tracking-wider text-[10px] border-r-2 border-[#121212] transition-colors ${
          micMuted ? 'bg-[#D02020] text-white' : 'bg-[#121212] text-white/70'
        }`}
        aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
        aria-pressed={micMuted}
      >
        {micMuted ? <MicOff size={20} strokeWidth={2.5} /> : <Mic size={20} strokeWidth={2.5} />}
        <span>{micMuted ? 'MUTED' : 'MIC'}</span>
      </motion.button>

      <motion.button
        onClick={handleSpeakerToggle}
        whileTap={{ x: 2, y: 2 }}
        className={`w-16 py-5 flex flex-col items-center gap-1 font-black uppercase tracking-wider text-[10px] border-r-2 border-[#121212] transition-colors ${
          speakerMuted ? 'bg-[#D02020] text-white' : 'bg-[#121212] text-white/70'
        }`}
        aria-label={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
        aria-pressed={speakerMuted}
      >
        {speakerMuted ? <VolumeX size={20} strokeWidth={2.5} /> : <Volume2 size={20} strokeWidth={2.5} />}
        <span>{speakerMuted ? 'MUTED' : 'SPK'}</span>
      </motion.button>

      <motion.button
        onClick={handleExit}
        whileTap={{ x: 2, y: 2 }}
        className="w-16 py-5 flex flex-col items-center gap-1 font-black uppercase tracking-wider text-[10px] bg-[#D02020] text-white transition-colors"
        aria-label="Exit to landing page"
      >
        <X size={20} strokeWidth={2.5} />
        <span>EXIT</span>
      </motion.button>
    </div>
  );
}
