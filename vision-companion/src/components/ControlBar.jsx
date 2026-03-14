import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { Scan, Mic, BookOpen, Search } from 'lucide-react';
import { stopAgentLoop, startAgentLoop, runOnce } from '../services/agentLoop';
import { speak, stopSpeaking } from '../services/ttsService';
import { startRecording, stopRecording, createAnalyser, detectSilence } from '../utils/audioUtils';
import { transcribeAudio, startWebSpeechRecognition } from '../services/sttService';

const MODES = [
  { id: 'scan', label: 'SCAN', Icon: Scan, color: 'bg-[#1040C0]', activeText: 'text-white' },
  { id: 'talk', label: 'TALK', Icon: Mic, color: 'bg-[#D02020]', activeText: 'text-white' },
  { id: 'read', label: 'READ', Icon: BookOpen, color: 'bg-[#F0C020]', activeText: 'text-[#121212]' },
  { id: 'find', label: 'FIND', Icon: Search, color: 'bg-[#121212]', activeText: 'text-white' },
];

export default function ControlBar() {
  const { mode, setMode, setIsScanning, isRecording, setIsRecording, setAvatarState, videoRef, setUserQuery } = useAppStore();

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
        // Auto-run once for read/find
        const result = await runOnce(newMode, null);
        if (result?.spoken_response) {
          await speak(result.spoken_response);
        }
      }
    }
  };

  const handleTalk = async () => {
    if (mode !== 'talk') {
      handleModeChange('talk');
      return;
    }

    if (isRecording) return;

    // Try to get audio stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsRecording(true);
      setAvatarState('listening');
      stopSpeaking();

      let transcript = null;
      try {
        await startRecording(stream);
        const analyser = createAnalyser(stream);
        await detectSilence(analyser, 0.01, 2000);
        const audioBlob = await stopRecording();
        stream.getTracks().forEach(t => t.stop());

        setAvatarState('thinking');
        transcript = await transcribeAudio(audioBlob);
      } catch (err) {
        console.warn('Recording/transcription failed:', err);
        stream.getTracks().forEach(t => t.stop());
      }

      // Fallback to Web Speech if Whisper failed
      if (!transcript) {
        try {
          setAvatarState('listening');
          transcript = await startWebSpeechRecognition();
        } catch (err) {
          console.warn('Web Speech fallback failed:', err);
        }
      }

      setIsRecording(false);

      if (transcript) {
        setUserQuery(transcript);
        setAvatarState('thinking');
        const result = await runOnce('talk', transcript);
        if (result?.spoken_response) {
          await speak(result.spoken_response);
        }
      } else {
        setAvatarState('idle');
        await speak("I didn't catch that. Please try again.");
      }
    } catch (err) {
      setIsRecording(false);
      setAvatarState('idle');
      console.error('Talk flow error:', err);
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex border-t-4 border-[#121212]" role="toolbar" aria-label="Mode controls">
      {MODES.map(({ id, label, Icon, color, activeText }) => (
        <motion.button
          key={id}
          onClick={id === 'talk' ? handleTalk : () => handleModeChange(id)}
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
          {id === 'talk' && isRecording && (
            <motion.div
              className="w-2 h-2 bg-red-500 rounded-full"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            />
          )}
        </motion.button>
      ))}
    </div>
  );
}
