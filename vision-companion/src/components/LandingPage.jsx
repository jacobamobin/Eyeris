import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { Eye, Zap, Mic, Shield, Brain, Globe } from 'lucide-react';
import OnboardingModal from './OnboardingModal';
import { getPreference } from '../services/memoryService';

export default function LandingPage() {
  const { setScreen } = useAppStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleLaunch = () => {
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
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Text Content */}
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 py-20 z-10 relative">
          {/* Geometric Decorations */}
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-[#F0C020] rounded-full opacity-30 z-0" />
          <div className="absolute top-10 left-10 w-32 h-32 border-4 border-[#121212] z-0" />

          <div className="relative z-10">
            <div className="inline-block bg-[#1040C0] text-white px-4 py-2 text-sm font-bold uppercase tracking-widest border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] mb-8">
              AI Visual Assistant
            </div>

            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black uppercase tracking-tighter leading-none text-[#121212] mb-8">
              SEE THE<br />
              <span className="text-[#D02020]">WORLD,</span><br />
              TOGETHER.
            </h1>

            <p className="text-lg sm:text-xl font-medium text-[#121212] max-w-lg mb-10 leading-relaxed">
              Real-time AI vision assistance for blind and low-vision users.
              Powered by Gemini 2.5 Flash and depth sensing technology.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <motion.button
                onClick={handleLaunch}
                whileTap={{ x: 2, y: 2 }}
                className="bg-[#121212] text-[#F0F0F0] px-8 py-4 text-lg font-bold uppercase tracking-wider border-2 border-[#121212] shadow-[6px_6px_0px_0px_#D02020] hover:shadow-[8px_8px_0px_0px_#D02020] transition-shadow"
                aria-label="Launch VisionCompanion camera app"
              >
                LAUNCH APP →
              </motion.button>
              <div className="bg-[#F0C020] text-[#121212] px-8 py-4 text-lg font-bold uppercase tracking-wider border-2 border-[#121212] shadow-[6px_6px_0px_0px_#121212] text-center">
                NO INSTALL
              </div>
            </div>
          </div>
        </div>

        {/* Right: Blue Panel with Geometric Composition */}
        <div className="relative lg:w-[45%] min-h-[50vh] lg:min-h-screen bg-[#1040C0] border-l-4 border-[#121212] overflow-hidden flex items-center justify-center">
          {/* Background geometric shapes */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#D02020] opacity-80" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
          <div className="absolute bottom-20 left-0 w-48 h-48 bg-[#F0C020] border-4 border-[#121212]" />
          <div className="absolute top-1/3 right-1/4 w-40 h-40 bg-[#F0F0F0] rounded-full border-4 border-[#121212]" />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-[#F0C020] opacity-60 rounded-full" />

          {/* Center eye icon */}
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="w-32 h-32 bg-[#F0F0F0] rounded-full border-4 border-[#121212] shadow-[8px_8px_0px_0px_#121212] flex items-center justify-center">
              <Eye size={64} color="#121212" strokeWidth={2} />
            </div>
            <div className="bg-[#121212] text-white px-6 py-3 font-black uppercase tracking-wider text-xl border-2 border-white shadow-[4px_4px_0px_0px_white]">
              VISION AI
            </div>
          </div>

          {/* Decorative lines */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-[#F0F0F0] opacity-20" />
          <div className="absolute top-0 left-1/2 h-full w-1 bg-[#F0F0F0] opacity-20" />
        </div>
      </section>

      {/* Stats Section - Yellow */}
      <section className="bg-[#F0C020] border-y-4 border-[#121212] py-16">
        <div className="max-w-6xl mx-auto px-6 sm:px-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
            {[
              { stat: '2.2B', label: 'People with vision impairment worldwide' },
              { stat: '0', label: 'Install required — runs in browser' },
              { stat: 'REAL-TIME', label: 'Depth sensing at up to 10fps' },
            ].map((item, i) => (
              <div key={i} className={`p-8 text-center ${i < 2 ? 'border-r-4 border-[#121212]' : ''}`}>
                <div className="text-5xl sm:text-6xl font-black text-[#121212] uppercase tracking-tighter">{item.stat}</div>
                <div className="mt-2 text-sm font-bold uppercase tracking-wider text-[#121212] opacity-80">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="mb-12 flex items-center gap-6">
          <div className="h-2 flex-1 bg-[#121212]" />
          <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-[#121212] whitespace-nowrap">FEATURES</h2>
          <div className="h-2 flex-1 bg-[#D02020]" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 border-2 border-[#121212]">
          {[
            { icon: Eye, title: 'SCENE UNDERSTANDING', desc: 'Gemini 2.5 Flash identifies objects, people, text and spatial relationships in real time.', color: 'bg-[#1040C0]', textColor: 'text-white' },
            { icon: Zap, title: 'DEPTH VISION', desc: 'Depth Anything V2 creates a live 3D depth map to detect obstacles before you reach them.', color: 'bg-[#F0C020]', textColor: 'text-[#121212]' },
            { icon: Mic, title: 'VOICE CONVERSATION', desc: 'Ask questions naturally. ElevenLabs TTS responds with a warm, clear voice instantly.', color: 'bg-[#F0F0F0]', textColor: 'text-[#121212]' },
            { icon: Shield, title: 'PROACTIVE SAFETY', desc: 'Automatic alerts for stairs, vehicles, obstacles, and crosswalks with haptic feedback.', color: 'bg-[#D02020]', textColor: 'text-white' },
            { icon: Brain, title: 'MEMORY SYSTEM', desc: 'Remembers your environment, preferences, and recurring patterns for smarter assistance.', color: 'bg-[#121212]', textColor: 'text-white' },
            { icon: Globe, title: 'CROSS-PLATFORM', desc: 'Works on any device with a camera and browser — iOS, Android, desktop, no app needed.', color: 'bg-[#F0F0F0]', textColor: 'text-[#121212]' },
          ].map((f, i) => (
            <div key={i} className={`${f.color} ${f.textColor} p-8 border-b-2 border-r-2 border-[#121212] last:border-r-0`}>
              <f.icon size={40} strokeWidth={2} className="mb-4" />
              <h3 className="text-lg font-black uppercase tracking-tight mb-3">{f.title}</h3>
              <p className="text-sm font-medium leading-relaxed opacity-90">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-[#121212] py-20 px-6 sm:px-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter text-white mb-16 text-center">HOW IT WORKS</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
            {[
              { num: '01', title: 'POINT', desc: 'Point your phone camera at your surroundings' },
              { num: '02', title: 'ANALYZE', desc: 'AI analyzes depth and scene every 2.5 seconds' },
              { num: '03', title: 'LISTEN', desc: 'Hear spatial descriptions and safety alerts' },
              { num: '04', title: 'ASK', desc: 'Press Talk to ask specific questions about your environment' },
            ].map((step, i) => (
              <div key={i} className="border-l-4 border-[#1040C0] p-8 border-b border-white/10">
                <div className="text-5xl font-black text-[#1040C0] mb-4">{step.num}</div>
                <h3 className="text-xl font-black uppercase text-white mb-3">{step.title}</h3>
                <p className="text-sm text-white/70 font-medium leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-[#D02020] py-20 px-6 sm:px-12 border-y-4 border-[#121212] relative overflow-hidden">
        {/* Geometric decorations */}
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
            aria-label="Launch VisionCompanion"
          >
            LAUNCH VISION COMPANION →
          </motion.button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#121212] text-white py-10 px-6 sm:px-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#1040C0] rounded-full border-2 border-white flex items-center justify-center">
              <Eye size={20} color="white" />
            </div>
            <span className="font-black text-xl uppercase tracking-tighter">VISION COMPANION</span>
          </div>
          <div className="text-sm text-white/60 font-medium uppercase tracking-wider">
            Hackathon 2026 · Built with Gemini + ElevenLabs
          </div>
        </div>
      </footer>
    </div>
  );
}
