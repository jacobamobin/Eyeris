import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Mic, Shield, ArrowRight, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { savePreference, getPreference } from '../services/memoryService';

const STEPS = [
  {
    icon: Eye,
    color: 'bg-[#1040C0]',
    iconColor: 'white',
    num: '01',
    title: 'SCENE UNDERSTANDING',
    desc: 'VisionCompanion uses your camera to describe your surroundings in real time. Point at anything and ask questions.',
    detail: 'AI-powered scene analysis every 2.5 seconds',
  },
  {
    icon: Mic,
    color: 'bg-[#D02020]',
    iconColor: 'white',
    num: '02',
    title: 'VOICE CONTROLS',
    desc: 'Tap TALK to ask questions naturally. "What\'s in front of me?" "Read that sign." "Find the door."',
    detail: 'Powered by Whisper + ElevenLabs',
  },
  {
    icon: Shield,
    color: 'bg-[#F0C020]',
    iconColor: '#121212',
    num: '03',
    title: 'PERMISSIONS NEEDED',
    desc: 'We need your camera and microphone to provide assistance. Nothing is stored externally.',
    detail: 'Grant permissions to get started',
    isPermissions: true,
  },
];

export default function OnboardingModal({ onComplete }) {
  const [step, setStep] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const current = STEPS[step];
  const Icon = current.icon;

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Request permissions
      setRequesting(true);
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        savePreference('onboarded', true);
        onComplete();
      } catch (err) {
        console.warn('Permission denied:', err);
        // Still proceed - camera will show error
        savePreference('onboarded', true);
        onComplete();
      } finally {
        setRequesting(false);
      }
    }
  };

  const handleSkip = () => {
    savePreference('onboarded', true);
    onComplete();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#F0F0F0] border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] max-w-sm w-full"
      >
        {/* Header */}
        <div className={`${current.color} border-b-4 border-[#121212] p-6 relative`}>
          <button
            onClick={handleSkip}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            aria-label="Skip onboarding"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center border-2 border-white/40">
              <Icon size={28} color={current.iconColor} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-white/60 text-xs font-bold uppercase tracking-widest">STEP {current.num}</div>
              <div className="text-white font-black text-xl uppercase tracking-tight">{current.title}</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="p-6"
          >
            <p className="text-[#121212] font-medium leading-relaxed mb-4">{current.desc}</p>
            <div className="bg-[#121212] text-white/70 text-xs font-bold uppercase tracking-wider px-3 py-2">
              {current.detail}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          {/* Step dots */}
          <div className="flex gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full border-2 border-[#121212] ${i === step ? 'bg-[#121212]' : 'bg-transparent'}`}
              />
            ))}
          </div>

          <motion.button
            onClick={handleNext}
            disabled={requesting}
            whileTap={{ x: 2, y: 2 }}
            className="bg-[#121212] text-white px-6 py-3 font-black uppercase tracking-wider border-2 border-[#121212] shadow-[4px_4px_0px_0px_#1040C0] flex items-center gap-2 disabled:opacity-60"
            aria-label={step === STEPS.length - 1 ? 'Grant permissions and start' : 'Next step'}
          >
            {requesting ? 'REQUESTING...' : step === STEPS.length - 1 ? 'START' : 'NEXT'}
            <ArrowRight size={16} />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
