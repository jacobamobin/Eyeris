import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import {
  Eye, Zap, Mic, Shield, Brain, Globe,
  Scan, BookOpen, Search, AudioLines, AlertTriangle,
} from 'lucide-react';
import OnboardingModal from './OnboardingModal';
import { getPreference, savePreference } from '../services/memoryService';
import { unlockAudio } from '../services/ttsService';

// ── Data ──────────────────────────────────────────────

const SCENE_GRADIENTS = [
  'linear-gradient(180deg, #5B8EC9 0%, #5B8EC9 40%, #7BAF6E 40%, #5A9A4E 100%)', // blue sky + green ground
  'linear-gradient(180deg, #6A9FD8 0%, #6A9FD8 45%, #8BBF7A 45%, #6AAF5A 100%)', // lighter sky + grass
  'linear-gradient(180deg, #E8A44A 0%, #E8A44A 38%, #5A9A4E 38%, #4A8A3E 100%)', // sunset sky + green ground
];

const DEMO_OBJECTS = [
  { label: 'PERSON', distance: '1.2m', x: 8, y: 30, w: 24, h: 45, color: '#F0C020', img: '/demo/person.png', imgScale: 2.0 },
  { label: 'BENCH', distance: '2.8m', x: 55, y: 44, w: 35, h: 26, color: '#F0C020', img: '/demo/bench.png' },
  { label: 'SIGN', distance: '3.5m', x: 38, y: 28, w: 16, h: 12, color: '#F0C020', img: '/demo/sign.png' },
  { label: 'DOG', distance: '1.8m', x: 58, y: 62, w: 20, h: 16, color: '#F0C020', img: '/demo/dog.png' },
];

const DEMO_CAPTIONS = [
  'I see a bench on your right, about 3 meters ahead...',
  'There is a person walking toward you on the left...',
  'A street sign reads: MAIN STREET...',
  'Small dog detected nearby, 2 meters to your right...',
];

const AVATAR_STATES = [
  { key: 'idle', icon: Eye, color: '#1040C0', label: 'READY', pulse: true, pulseColor: 'rgba(16,64,192,0.4)', textColor: 'white', duration: 3000 },
  { key: 'thinking', icon: Brain, color: '#F0C020', label: 'THINKING', pulse: false, spin: true, textColor: '#121212', duration: 2000 },
  { key: 'speaking', icon: AudioLines, color: '#a855f7', label: 'SPEAKING', pulse: true, pulseColor: 'rgba(168,85,247,0.4)', textColor: 'white', duration: 4000 },
];

const MODE_BUTTONS = [
  { id: 'scan', label: 'SCAN', Icon: Scan, color: 'bg-[#1040C0]', activeText: 'text-white' },
  { id: 'read', label: 'READ', Icon: BookOpen, color: 'bg-[#F0C020]', activeText: 'text-[#121212]' },
  { id: 'find', label: 'FIND', Icon: Search, color: 'bg-white', activeText: 'text-[#121212]' },
];


const FEATURES = [
  { icon: Eye, title: 'SCENE UNDERSTANDING', desc: 'Gemini 2.5 Flash identifies objects, people, text and spatial relationships in real time.', accent: '#1040C0' },
  { icon: Zap, title: 'DEPTH VISION', desc: 'Depth Anything V2 creates a live 3D depth map to detect obstacles before you reach them.', accent: '#F0C020' },
  { icon: Mic, title: 'VOICE CONVERSATION', desc: 'Ask questions naturally. ElevenLabs TTS responds with a warm, clear voice instantly.', accent: '#D02020' },
  { icon: Shield, title: 'PROACTIVE SAFETY', desc: 'Automatic alerts for stairs, vehicles, obstacles, and crosswalks with haptic feedback.', accent: '#D02020' },
  { icon: Brain, title: 'MEMORY SYSTEM', desc: 'Remembers your environment, preferences, and recurring patterns for smarter assistance.', accent: '#1040C0' },
  { icon: Globe, title: 'CROSS-PLATFORM', desc: 'Works on any device with a camera and browser — iOS, Android, desktop, no app needed.', accent: '#F0C020' },
];

const STEPS = [
  { num: '01', title: 'POINT', desc: 'Point your phone camera at your surroundings' },
  { num: '02', title: 'ANALYZE', desc: 'AI analyzes depth and scene every 2.5 seconds' },
  { num: '03', title: 'LISTEN', desc: 'Hear spatial descriptions and safety alerts' },
  { num: '04', title: 'ASK', desc: 'Press Talk to ask specific questions about your environment' },
];

const STATS = [
  { stat: '2.2B', label: 'People with vision impairment worldwide' },
  { stat: '0', label: 'Install required — runs in browser' },
  { stat: 'REAL-TIME', label: 'Depth sensing at up to 10fps' },
];

// ── Corner Markers ────────────────────────────────────

function CornerMarkers({ color = '#F0C020', size = 12, thickness = 2 }) {
  const style = { position: 'absolute', width: size, height: size };
  const line = { position: 'absolute', backgroundColor: color };
  return (
    <>
      {/* Top-left */}
      <div style={{ ...style, top: -1, left: -1 }}>
        <div style={{ ...line, top: 0, left: 0, width: size, height: thickness }} />
        <div style={{ ...line, top: 0, left: 0, width: thickness, height: size }} />
      </div>
      {/* Top-right */}
      <div style={{ ...style, top: -1, right: -1 }}>
        <div style={{ ...line, top: 0, right: 0, width: size, height: thickness }} />
        <div style={{ ...line, top: 0, right: 0, width: thickness, height: size }} />
      </div>
      {/* Bottom-left */}
      <div style={{ ...style, bottom: -1, left: -1 }}>
        <div style={{ ...line, bottom: 0, left: 0, width: size, height: thickness }} />
        <div style={{ ...line, bottom: 0, left: 0, width: thickness, height: size }} />
      </div>
      {/* Bottom-right */}
      <div style={{ ...style, bottom: -1, right: -1 }}>
        <div style={{ ...line, bottom: 0, right: 0, width: size, height: thickness }} />
        <div style={{ ...line, bottom: 0, right: 0, width: thickness, height: size }} />
      </div>
    </>
  );
}

// ── Phone Mockup ──────────────────────────────────────

function PhoneMockup() {
  const prefersReduced = useReducedMotion();
  const [visibleBoxes, setVisibleBoxes] = useState([0, 2]);
  const [captionIdx, setCaptionIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [avatarIdx, setAvatarIdx] = useState(0);
  const [activeMode, setActiveMode] = useState(0);
  const [showBanner, setShowBanner] = useState(false);
  const [showProcessingDots, setShowProcessingDots] = useState(true);
  const [sceneIdx, setSceneIdx] = useState(0);
  const charRef = useRef(0);

  // Scene gradient cycling
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(() => {
      setSceneIdx(prev => (prev + 1) % SCENE_GRADIENTS.length);
    }, 9000);
    return () => clearInterval(id);
  }, [prefersReduced]);

  // Bounding box cycling
  useEffect(() => {
    if (prefersReduced) return;
    const patterns = [[0, 2], [1, 3], [0, 1, 3], [2, 3], [0, 1, 2]];
    let idx = 0;
    const id = setInterval(() => {
      idx = (idx + 1) % patterns.length;
      setVisibleBoxes(patterns[idx]);
    }, 3000);
    return () => clearInterval(id);
  }, [prefersReduced]);

  // Typewriter caption
  useEffect(() => {
    if (prefersReduced) {
      setDisplayedText(DEMO_CAPTIONS[0]);
      return;
    }
    const caption = DEMO_CAPTIONS[captionIdx];
    charRef.current = 0;
    setDisplayedText('');
    setShowProcessingDots(true);

    // Brief processing dots before typing
    const dotTimeout = setTimeout(() => {
      setShowProcessingDots(false);
      const typeId = setInterval(() => {
        charRef.current += 1;
        if (charRef.current <= caption.length) {
          setDisplayedText(caption.slice(0, charRef.current));
        } else {
          clearInterval(typeId);
        }
      }, 40);
      return () => clearInterval(typeId);
    }, 800);

    return () => clearTimeout(dotTimeout);
  }, [captionIdx, prefersReduced]);

  // Caption cycling
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(() => {
      setCaptionIdx(prev => (prev + 1) % DEMO_CAPTIONS.length);
    }, 7000);
    return () => clearInterval(id);
  }, [prefersReduced]);

  // Avatar state cycling
  useEffect(() => {
    if (prefersReduced) return;
    const cycle = () => {
      setAvatarIdx(prev => {
        const next = (prev + 1) % AVATAR_STATES.length;
        return next;
      });
    };
    const id = setInterval(cycle, 3000);
    return () => clearInterval(id);
  }, [prefersReduced]);

  // Mode cycling
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(() => {
      setActiveMode(prev => (prev + 1) % MODE_BUTTONS.length);
    }, 4500);
    return () => clearInterval(id);
  }, [prefersReduced]);

  // Safety banner
  useEffect(() => {
    if (prefersReduced) return;
    const id = setInterval(() => {
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
    }, 14000);
    // Show once early
    const initial = setTimeout(() => {
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
    }, 6000);
    return () => { clearInterval(id); clearTimeout(initial); };
  }, [prefersReduced]);

  const avatar = AVATAR_STATES[avatarIdx];
  const AvatarIcon = avatar.icon;

  return (
    <motion.div
      className="relative will-change-transform"
      initial={{ rotate: -2 }}
      whileHover={{ rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      {/* Phone frame */}
      <div className="relative w-[260px] lg:w-[300px] border-4 border-[#121212] rounded-[40px] shadow-[12px_12px_0px_0px_#121212] bg-[#0a0a0a] overflow-hidden"
        style={{ aspectRatio: '9/19.5' }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-[6px] left-1/2 -translate-x-1/2 w-[90px] h-[22px] bg-[#121212] rounded-full z-30" />

        {/* Interior */}
        <div className="absolute inset-[4px] rounded-[36px] overflow-hidden">

          {/* iOS Status Bar */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 pt-[6px] pb-1 bg-black/40 backdrop-blur-sm rounded-t-[36px]">
            <span className="text-white text-[9px] font-bold" style={{ fontFeatureSettings: '"tnum"' }}>9:41</span>
            <div style={{ width: 90 }} /> {/* spacer for dynamic island */}
            <div className="flex items-center gap-[3px]">
              {/* Signal bars */}
              <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                <rect x="0" y="6" width="2" height="3" rx="0.5" fill="white" />
                <rect x="3" y="4" width="2" height="5" rx="0.5" fill="white" />
                <rect x="6" y="2" width="2" height="7" rx="0.5" fill="white" />
                <rect x="9" y="0" width="2" height="9" rx="0.5" fill="white" />
              </svg>
              {/* WiFi */}
              <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                <path d="M5.5 8.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="white" />
                <path d="M3.2 5.8a3.2 3.2 0 0 1 4.6 0" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M1.2 3.8a6 6 0 0 1 8.6 0" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {/* Battery */}
              <svg width="18" height="9" viewBox="0 0 18 9" fill="none">
                <rect x="0.5" y="0.5" width="14" height="8" rx="1.5" stroke="white" strokeWidth="1" />
                <rect x="2" y="2" width="10" height="5" rx="0.5" fill="white" />
                <rect x="15.5" y="2.5" width="1.5" height="4" rx="0.5" fill="white" opacity="0.5" />
              </svg>
            </div>
          </div>
          {/* Sky with subtle gradient */}
          <div
            className="absolute inset-0 transition-all duration-[2000ms] ease-in-out"
            style={{ background: sceneIdx === 2
              ? 'linear-gradient(180deg, #c4724a 0%, #E8A44A 60%, #f0c06a 100%)'
              : sceneIdx === 1
              ? 'linear-gradient(180deg, #4a7ab8 0%, #6A9FD8 60%, #8bbce8 100%)'
              : 'linear-gradient(180deg, #3a6aaa 0%, #5B8EC9 60%, #7aaade 100%)'
            }}
          />
          {/* Rolling hills - smooth landscape */}
          <svg className="absolute bottom-0 left-0 w-full h-[55%]" viewBox="0 0 400 180" preserveAspectRatio="none">
            {/* Far hill - lightest */}
            <path d="M-20 80 C60 30, 140 50, 200 40 C260 30, 340 60, 420 35 L420 180 L-20 180 Z" fill="#78b866" />
            {/* Mid hill */}
            <path d="M-20 110 C40 70, 120 95, 180 80 C250 62, 320 90, 420 70 L420 180 L-20 180 Z" fill="#5ea648" />
            {/* Near hill - darkest */}
            <path d="M-20 140 C80 115, 150 130, 220 120 C290 110, 350 130, 420 115 L420 180 L-20 180 Z" fill="#4a8f38" />
          </svg>

          {/* Bounding Boxes */}
          <AnimatePresence>
            {DEMO_OBJECTS.map((obj, i) => (
              visibleBoxes.includes(i) && (
                <motion.div
                  key={`box-${i}-${visibleBoxes.join()}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4 }}
                  className="absolute overflow-visible"
                  style={{
                    left: `${obj.x}%`, top: `${obj.y}%`,
                    width: `${obj.w}%`, height: `${obj.h}%`,
                  }}
                >
                  {/* Object image */}
                  <img
                    src={obj.img}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain drop-shadow-md origin-center"
                    style={obj.imgScale ? { transform: `scale(${obj.imgScale})` } : undefined}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  {/* Bounding box border */}
                  <div
                    className="absolute inset-0"
                    style={{ border: `1.5px dashed ${obj.color}` }}
                  >
                    <CornerMarkers color={obj.color} size={8} thickness={2} />
                  </div>
                  {/* Label */}
                  <div className="absolute -top-4 left-0 flex items-center gap-1">
                    <div className="bg-[#F0C020] text-[#121212] text-[7px] font-bold uppercase px-1 py-[1px] leading-tight whitespace-nowrap">
                      {obj.label}
                    </div>
                    <div className="bg-black/70 text-white text-[7px] font-bold px-1 py-[1px] leading-tight">
                      {obj.distance}
                    </div>
                  </div>
                </motion.div>
              )
            ))}
          </AnimatePresence>

          {/* Depth Mini-Map */}
          <div className="absolute top-8 left-2 z-20">
            <div className="w-[52px] h-[38px] border-[1.5px] border-white rounded-[2px] overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #22d3ee, #facc15 50%, #ef4444)' }}
            />
            <div className="bg-black text-white text-[6px] font-bold tracking-wider px-1 py-[1px] text-center mt-[1px]">
              3D DEPTH
            </div>
          </div>

          {/* Status Badges */}
          <div className="absolute top-8 right-2 z-20 flex flex-col gap-1 items-end">
            <div className="bg-green-700 text-white text-[6px] font-bold px-1.5 py-[2px] border border-white/40 flex items-center gap-1">
              <span className="w-1 h-1 bg-green-300 rounded-full inline-block" />
              CONNECTED
            </div>
            <div className="bg-black/70 text-white text-[6px] font-bold px-1.5 py-[2px] border border-white/20">
              DEPTH 8FPS
            </div>
          </div>

          {/* Safety Banner */}
          <AnimatePresence>
            {showBanner && (
              <motion.div
                initial={{ y: -40 }}
                animate={{ y: 0 }}
                exit={{ y: -40 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="absolute top-6 left-0 right-0 z-30 bg-[#D02020] border-b-2 border-[#121212] px-2 py-1.5 flex items-center gap-1.5"
              >
                <AlertTriangle size={10} color="white" strokeWidth={2.5} />
                <span className="text-white text-[7px] font-bold uppercase tracking-wide">
                  CAUTION: STAIRS AHEAD
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Caption Bar */}
          <div className="absolute bottom-[72px] left-2 right-2 z-20">
            <div className="bg-black/80 border border-white/30 px-2 py-1.5 flex items-center gap-2">
              {showProcessingDots && (
                <div className="flex gap-[3px] flex-shrink-0">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1 h-1 bg-[#F0C020] rounded-full"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                    />
                  ))}
                </div>
              )}
              <p className="text-white text-[8px] font-medium leading-tight">
                {displayedText || 'Analyzing scene...'}
              </p>
            </div>
          </div>

          {/* Avatar Indicator */}
          <div className="absolute bottom-[76px] right-2 z-20 flex flex-col items-center gap-1">
            {avatar.pulse && !prefersReduced && (
              <>
                <motion.div
                  className="absolute w-7 h-7 rounded-full"
                  style={{ backgroundColor: avatar.pulseColor }}
                  animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="absolute w-7 h-7 rounded-full"
                  style={{ backgroundColor: avatar.pulseColor }}
                  animate={{ scale: [1, 2.2, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2, delay: 0.4, repeat: Infinity }}
                />
              </>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={avatar.key}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: avatar.color, border: '2px solid #121212' }}
              >
                <motion.div
                  animate={avatar.spin ? { rotate: 360 } : {}}
                  transition={avatar.spin ? { duration: 1.5, repeat: Infinity, ease: 'linear' } : {}}
                >
                  <AvatarIcon size={13} color={avatar.textColor} strokeWidth={2.5} />
                </motion.div>
              </motion.div>
            </AnimatePresence>
            <div className="bg-black/80 text-white text-[5px] font-black uppercase tracking-widest px-1 py-[1px] border border-white/20">
              {avatar.label}
            </div>
          </div>

          {/* Control Bar */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex border-t-2 border-[#121212]">
            {MODE_BUTTONS.map((btn, i) => {
              const isActive = activeMode === i;
              return (
                <div
                  key={btn.id}
                  className={`flex-1 py-2 flex flex-col items-center gap-[2px] text-[7px] font-black uppercase tracking-wider border-r border-[#121212] last:border-r-0 transition-colors duration-300 ${
                    isActive
                      ? `${btn.color} ${btn.activeText}`
                      : 'bg-[#121212] text-white/60'
                  }`}
                >
                  <btn.Icon size={12} strokeWidth={2.5} />
                  <span>{btn.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Mini Phone (static, for How It Works) ─────────────

function MiniPhone({ children }) {
  return (
    <div className="w-[100px] h-[180px] border-2 border-[#F0F0F0]/30 rounded-[16px] bg-[#0a0a0a] overflow-hidden flex-shrink-0 hidden sm:block">
      <div className="relative w-full h-full rounded-[14px] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ── Main Landing Page ─────────────────────────────────

export default function LandingPage() {
  const { setScreen } = useAppStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleLaunch = () => {
    unlockAudio();
    const alreadyOnboarded = getPreference('onboarded', false);
    if (!alreadyOnboarded) {
      setShowOnboarding(true);
    } else {
      setScreen('app');
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    setScreen('app');
  };

  return (
    <div className="min-h-screen bg-[#F0F0F0] font-['Outfit'] overflow-x-hidden">
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal onComplete={handleOnboardingComplete} />
        )}
      </AnimatePresence>

      {/* ── Hero ──────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Text Content */}
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-16 lg:py-20 z-10 relative">
          <div className="relative z-10 max-w-xl">
            <div className="inline-block bg-[#1040C0] text-white px-4 py-2 text-sm font-bold uppercase tracking-widest border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] mb-8">
              Eyeris — AI Visual Assistant
            </div>

            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.9] text-[#121212] mb-8">
              SEE THE<br />
              <span className="text-[#D02020]">WORLD,</span><br />
              TOGETHER.
            </h1>

            <p className="text-lg sm:text-xl font-medium text-[#121212] max-w-lg mb-6 leading-relaxed">
              Real-time AI vision assistance for blind and low-vision users.
              Powered by Gemini 2.5 Flash and depth sensing technology.
            </p>

            {/* Tech badges */}
            <div className="flex flex-wrap gap-2 mb-10">
              {[
                { label: 'GEMINI 2.5 FLASH', color: '#1040C0', text: 'white' },
                { label: 'DEPTH SENSING', color: '#F0C020', text: '#121212' },
                { label: 'VOICE AI', color: '#D02020', text: 'white' },
              ].map(badge => (
                <div
                  key={badge.label}
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border-2 border-[#121212]"
                  style={{ backgroundColor: badge.color, color: badge.text }}
                >
                  {badge.label}
                </div>
              ))}
            </div>

            <div className="flex flex-col items-start gap-2">
              <motion.button
                onClick={handleLaunch}
                whileTap={{ x: 2, y: 2 }}
                className="bg-[#121212] text-[#F0F0F0] px-8 py-4 text-lg font-bold uppercase tracking-wider border-2 border-[#121212] shadow-[6px_6px_0px_0px_#D02020] hover:shadow-[8px_8px_0px_0px_#D02020] transition-shadow"
                aria-label="Launch Eyeris camera app"
              >
                LAUNCH APP →
              </motion.button>
              <span className="text-sm font-medium uppercase tracking-wider text-[#121212]/50 ml-1">
                No install needed. Runs in browser.
              </span>
            </div>
          </div>
        </div>

        {/* Right: Phone Mockup */}
        <div
          className="relative lg:w-[45%] min-h-[60vh] lg:min-h-screen border-l-0 lg:border-l-4 border-[#121212] overflow-hidden flex items-center justify-center py-12 lg:py-0"
          style={{
            backgroundColor: '#1040C0',
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        >
          {/* Decorative geometric shapes */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#D02020] opacity-20" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-[#F0C020] opacity-15 rounded-full" />

          <PhoneMockup />
        </div>
      </section>

      {/* ── Stats ─────────────────────────────── */}
      <section className="bg-[#F0C020] border-y-4 border-[#121212] py-16">
        <div className="max-w-6xl mx-auto px-6 sm:px-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
            {STATS.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className={`p-8 text-center ${i < 2 ? 'sm:border-r-4 border-b-4 sm:border-b-0 border-[#121212]' : ''}`}
              >
                <div className="text-5xl sm:text-6xl font-black text-[#121212] uppercase tracking-tighter">{item.stat}</div>
                <div className="mt-2 text-sm font-bold uppercase tracking-wider text-[#121212] opacity-80">{item.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Not Just ChatGPT ──────────────── */}
      <section className="bg-[#121212] py-20 px-6 sm:px-12 border-b-4 border-[#1040C0]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 text-center">
            <div className="inline-block bg-[#D02020] text-white text-xs font-bold uppercase tracking-widest px-3 py-1.5 border-2 border-white/20 mb-6">
              NOT JUST AI CHAT
            </div>
            <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white leading-tight">
              WHAT MAKES <span className="text-[#F0C020]">EYERIS DIFFERENT</span>
            </h2>
            <p className="mt-4 text-white/50 font-medium text-base max-w-xl mx-auto">
              ChatGPT describes a photo. Eyeris inhabits your camera and acts on what it sees, without you asking.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y-4 md:divide-y-0 md:divide-x-4 divide-white/10">

            {/* ① Live Visual Overlays */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4 }}
              className="px-8 py-10 flex flex-col gap-6"
            >
              <div className="text-sm font-black uppercase tracking-widest text-[#1040C0]">01 LIVE VISUAL OVERLAYS</div>
              {/* Diagram */}
              <div className="w-full aspect-[4/3] bg-[#0a0a0a] border-2 border-white/10 relative overflow-hidden flex-shrink-0">
                {/* Simulated camera scene */}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #3a6aaa 0%, #5B8EC9 55%, #4a8f38 55%, #3a7028 100%)' }} />

                {/* Person box with gray depth silhouette */}
                <div className="absolute border-[1.5px] border-dashed border-[#F0C020]" style={{ left: '12%', top: '18%', width: '22%', height: '52%' }}>
                  <CornerMarkers color="#F0C020" size={6} thickness={1.5} />
                  {/* depth silhouette - person shape: head oval + body rect */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 40 80" preserveAspectRatio="none">
                    <ellipse cx="20" cy="14" rx="9" ry="11" fill="rgba(100,100,100,0.55)" />
                    <rect x="10" y="24" width="20" height="38" rx="3" fill="rgba(100,100,100,0.55)" />
                    <rect x="12" y="62" width="7" height="14" rx="2" fill="rgba(100,100,100,0.5)" />
                    <rect x="21" y="62" width="7" height="14" rx="2" fill="rgba(100,100,100,0.5)" />
                  </svg>
                  <div className="absolute -top-4 left-0 bg-[#F0C020] text-[#121212] text-[6px] font-black px-1 py-[1px] uppercase whitespace-nowrap">PERSON · 1.2m</div>
                </div>

                {/* Bench box with warm yellow-orange depth silhouette */}
                <div className="absolute border-[1.5px] border-dashed border-[#1040C0]" style={{ left: '54%', top: '46%', width: '34%', height: '28%' }}>
                  <CornerMarkers color="#1040C0" size={6} thickness={1.5} />
                  {/* depth silhouette - bench shape: seat + legs */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 60 40" preserveAspectRatio="none">
                    <rect x="4" y="10" width="52" height="8" rx="2" fill="rgba(240,192,32,0.45)" />
                    <rect x="6" y="18" width="6" height="16" rx="1" fill="rgba(240,192,32,0.4)" />
                    <rect x="48" y="18" width="6" height="16" rx="1" fill="rgba(240,192,32,0.4)" />
                    <rect x="18" y="18" width="6" height="16" rx="1" fill="rgba(240,192,32,0.35)" />
                    <rect x="36" y="18" width="6" height="16" rx="1" fill="rgba(240,192,32,0.35)" />
                  </svg>
                  <div className="absolute -top-4 left-0 bg-[#1040C0] text-white text-[6px] font-black px-1 py-[1px] uppercase whitespace-nowrap">BENCH · 3.1m</div>
                </div>

                {/* depth minimap */}
                <div className="absolute top-2 left-2 w-9 h-7 border border-white/40" style={{ background: 'linear-gradient(135deg, #22d3ee, #facc15 50%, #ef4444)' }} />
                <div className="absolute bottom-2 right-2 text-[6px] text-white/40 font-bold uppercase tracking-wider">DEPTH OVERLAY</div>
              </div>
              <div>
                <p className="text-white/40 text-xs font-medium line-through decoration-white/20 mb-2">ChatGPT describes a photo you upload.</p>
                <p className="text-white text-sm font-medium leading-relaxed">Eyeris draws labeled bounding boxes and depth-colored silhouette overlays directly onto your live feed, so you see exactly what it sees.</p>
              </div>
            </motion.div>

            {/* ② Proactive Hazard Alerts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: 0.1 }}
              className="px-8 py-10 flex flex-col gap-6"
            >
              <div className="text-sm font-black uppercase tracking-widest text-[#D02020]">02 PROACTIVE HAZARD ALERTS</div>
              {/* Diagram */}
              <div className="w-full aspect-[4/3] bg-[#0a0a0a] border-2 border-white/10 relative overflow-hidden flex-shrink-0">
                {/* Background scene */}
                <div className="absolute inset-0 bg-[#111]" />
                {/* Staircase SVG */}
                <svg className="absolute bottom-0 left-0 w-full h-[55%]" viewBox="0 0 200 80" preserveAspectRatio="none">
                  <path d="M0 80 L0 60 L40 60 L40 44 L80 44 L80 30 L120 30 L120 18 L160 18 L160 8 L200 8 L200 80 Z" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
                  <line x1="0" y1="60" x2="40" y2="60" stroke="#444" strokeWidth="1" />
                  <line x1="40" y1="44" x2="80" y2="44" stroke="#444" strokeWidth="1" />
                  <line x1="80" y1="30" x2="120" y2="30" stroke="#444" strokeWidth="1" />
                  <line x1="120" y1="18" x2="160" y2="18" stroke="#444" strokeWidth="1" />
                  <line x1="160" y1="8" x2="200" y2="8" stroke="#444" strokeWidth="1" />
                </svg>
                {/* Alert banner */}
                <div className="absolute top-3 left-3 right-3 bg-[#D02020] border border-white/30 px-2 py-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={10} color="white" strokeWidth={2.5} />
                  <span className="text-white text-[7px] font-black uppercase tracking-wide">CAUTION: STAIRS AHEAD</span>
                </div>
              </div>
              <div>
                <p className="text-white/40 text-xs font-medium line-through decoration-white/20 mb-2">AI chatbots wait for you to ask.</p>
                <p className="text-white text-sm font-medium leading-relaxed">Eyeris detects stairs, vehicles, and obstacles automatically and fires a haptic vibration + spoken warning before you reach them.</p>
              </div>
            </motion.div>

            {/* ③ Spatial Awareness */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: 0.2 }}
              className="px-8 py-10 flex flex-col gap-6"
            >
              <div className="text-sm font-black uppercase tracking-widest text-[#F0C020]">03 SPATIAL AWARENESS</div>
              {/* Diagram - top-down radar */}
              <div className="w-full aspect-[4/3] bg-[#0a0a0a] border-2 border-white/10 relative overflow-hidden flex-shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 160 120" className="w-full h-full">
                  {/* Range rings */}
                  {[40, 70, 100].map((r, i) => (
                    <ellipse key={i} cx="80" cy="105" rx={r * 0.7} ry={r * 0.45}
                      fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 3" />
                  ))}
                  {/* Distance labels */}
                  <text x="107" y="87" fill="rgba(255,255,255,0.25)" fontSize="5" fontFamily="monospace">1m</text>
                  <text x="125" y="72" fill="rgba(255,255,255,0.2)" fontSize="5" fontFamily="monospace">2m</text>
                  <text x="143" y="60" fill="rgba(255,255,255,0.15)" fontSize="5" fontFamily="monospace">3m</text>
                  {/* Direction lines */}
                  <line x1="80" y1="105" x2="80" y2="10" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <line x1="80" y1="105" x2="20" y2="60" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <line x1="80" y1="105" x2="140" y2="60" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  {/* Object: bench to right */}
                  <motion.g animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, repeat: Infinity }}>
                    <rect x="112" y="74" width="14" height="8" rx="1" fill="#1040C0" opacity="0.9" />
                    <text x="119" y="80" textAnchor="middle" fill="white" fontSize="4" fontWeight="bold" fontFamily="monospace">BENCH</text>
                    {/* line from user to object */}
                    <line x1="80" y1="105" x2="116" y2="78" stroke="#1040C0" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
                    <text x="102" y="97" fill="#1040C0" fontSize="5" fontWeight="bold" fontFamily="monospace">2.8m</text>
                  </motion.g>
                  {/* Object: person to left */}
                  <motion.g animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 2, delay: 0.5, repeat: Infinity }}>
                    <rect x="36" y="68" width="16" height="8" rx="1" fill="#F0C020" opacity="0.9" />
                    <text x="44" y="74" textAnchor="middle" fill="#121212" fontSize="4" fontWeight="bold" fontFamily="monospace">PERSON</text>
                    <line x1="80" y1="105" x2="43" y2="72" stroke="#F0C020" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
                    <text x="52" y="97" fill="#F0C020" fontSize="5" fontWeight="bold" fontFamily="monospace">1.2m</text>
                  </motion.g>
                  {/* User marker */}
                  <circle cx="80" cy="105" r="5" fill="#D02020" stroke="white" strokeWidth="1.5" />
                  <text x="80" y="117" textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="5" fontFamily="monospace">YOU</text>
                </svg>
              </div>
              <div>
                <p className="text-white/40 text-xs font-medium line-through decoration-white/20 mb-2">"There's a bench somewhere in the scene."</p>
                <p className="text-white text-sm font-medium leading-relaxed">"Bench to your right, 2.8 meters." On-device depth turns every detected object into a real distance and direction.</p>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────── */}
      <section className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="mb-12 flex items-center gap-6">
          <div className="h-2 flex-1 bg-[#121212]" />
          <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-[#121212] whitespace-nowrap">FEATURES</h2>
          <div className="h-2 flex-1 bg-[#D02020]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
              className="relative bg-white p-8 border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] hover:shadow-[6px_6px_0px_0px_#121212] transition-shadow"
              style={{ borderLeft: `6px solid ${f.accent}` }}
            >
              <CornerMarkers color={f.accent} size={10} thickness={2} />
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-4 border-2 border-[#121212]"
                style={{ backgroundColor: f.accent }}
              >
                <f.icon size={22} color={f.accent === '#F0C020' ? '#121212' : 'white'} strokeWidth={2} />
              </div>
              <h3 className="text-base font-black uppercase tracking-tight mb-3 text-[#121212]">{f.title}</h3>
              <p className="text-sm font-medium leading-relaxed text-[#121212] opacity-80">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How It Works ──────────────────────── */}
      <section className="bg-[#121212] py-20 px-6 sm:px-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white mb-16 text-center">HOW IT WORKS</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.35, delay: i * 0.1 }}
                className="border-l-4 border-[#1040C0] p-6 flex flex-col gap-4"
              >
                <div>
                  <div className="text-4xl font-black text-[#1040C0] mb-2">{step.num}</div>
                  <h3 className="text-xl font-black uppercase text-white mb-2">{step.title}</h3>
                  <p className="text-sm text-white/70 font-medium leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────── */}
      <section className="bg-[#D02020] py-20 px-6 sm:px-12 border-y-4 border-[#121212] relative overflow-hidden">
        <div className="absolute -right-16 top-1/2 -translate-y-1/2 w-64 h-64 bg-[#F0C020] rounded-full border-4 border-[#121212] opacity-60" />
        <div className="absolute right-32 bottom-0 w-32 h-32 bg-[#121212] opacity-40" />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter text-white mb-6">
            START SEEING<br />DIFFERENTLY
          </h2>
          <p className="text-lg text-white/90 font-medium mb-10">
            No download. No account. Just point and listen.
          </p>
          <motion.button
            onClick={handleLaunch}
            whileTap={{ x: 2, y: 2 }}
            className="bg-[#F0F0F0] text-[#121212] px-12 py-5 text-xl font-black uppercase tracking-wider border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] hover:shadow-[10px_10px_0px_0px_#121212] transition-shadow"
            aria-label="Launch Eyeris"
          >
            LAUNCH EYERIS →
          </motion.button>
        </div>
      </section>

      {/* ── Footer ────────────────────────────── */}
      <footer className="bg-[#121212] text-white py-10 px-6 sm:px-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#1040C0] rounded-full border-2 border-white flex items-center justify-center">
              <Eye size={20} color="white" />
            </div>
            <span className="font-black text-xl uppercase tracking-tighter">EYERIS</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/60 font-medium uppercase tracking-wider">
              For Gen AI Genesis · By Jacob Mobin
            </span>
            <button
              onClick={() => { savePreference('onboarded', false); setShowOnboarding(true); }}
              className="text-[10px] text-white/30 hover:text-white/60 uppercase tracking-wider border border-white/20 px-2 py-1 transition-colors"
            >
              Reset Onboarding
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
