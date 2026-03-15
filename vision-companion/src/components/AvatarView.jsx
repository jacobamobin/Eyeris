import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { Eye, Mic, Brain, AudioLines } from 'lucide-react';

const STATE_CONFIG = {
  idle: {
    icon: Eye,
    color: '#1040C0',
    bg: 'bg-[#1040C0]',
    label: 'READY',
    pulse: true,
    pulseColor: 'rgba(16,64,192,0.3)',
  },
  listening: {
    icon: Mic,
    color: '#22c55e',
    bg: 'bg-green-500',
    label: 'LISTENING',
    pulse: true,
    pulseColor: 'rgba(34,197,94,0.3)',
  },
  thinking: {
    icon: Brain,
    color: '#F0C020',
    bg: 'bg-[#F0C020]',
    label: 'THINKING',
    pulse: false,
    spin: true,
  },
  speaking: {
    icon: AudioLines,
    color: '#a855f7',
    bg: 'bg-purple-500',
    label: 'SPEAKING',
    pulse: true,
    pulseColor: 'rgba(168,85,247,0.3)',
  },
};

export default function AvatarView() {
  const { avatarState } = useAppStore();
  const config = STATE_CONFIG[avatarState] || STATE_CONFIG.idle;
  const Icon = config.icon;

  return (
    <div className="absolute bottom-28 right-4 z-20 flex flex-col items-center gap-2">

      {/* Main icon circle */}
      <AnimatePresence mode="wait">
        <motion.div
          key={avatarState}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`relative w-14 h-14 rounded-full ${config.bg} border-3 border-[#121212] shadow-[4px_4px_0px_0px_#121212] flex items-center justify-center`}
          style={{ border: '3px solid #121212' }}
        >
          <motion.div
            animate={config.spin ? { rotate: 360 } : {}}
            transition={config.spin ? { duration: 1.5, repeat: Infinity, ease: 'linear' } : {}}
          >
            <Icon
              size={26}
              color={avatarState === 'thinking' ? '#121212' : 'white'}
              strokeWidth={2.5}
            />
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Label */}
      <div className="bg-black/80 text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border border-white/30">
        {config.label}
      </div>
    </div>
  );
}
