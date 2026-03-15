import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';

export default function CaptionBar() {
  const { currentCaption, isProcessing, avatarState } = useAppStore();
  const isThinking = avatarState === 'thinking';

  return (
    <div className="absolute bottom-24 left-0 right-0 z-20 px-4" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {(currentCaption || isProcessing || isThinking) && (
          <motion.div
            key={currentCaption + (isThinking ? '-thinking' : '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className={`px-4 py-3 flex items-center gap-3 ${
              isThinking
                ? 'bg-[#F0C020]/20 border-2 border-[#F0C020]'
                : 'bg-black/80 border-2 border-white/30'
            }`}
          >
            {(isProcessing || isThinking) && (
              <div className="flex gap-1 flex-shrink-0">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-[#F0C020] rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
                  />
                ))}
              </div>
            )}
            <p className={`text-sm font-medium leading-relaxed ${isThinking ? 'text-[#F0C020]' : 'text-white'}`}>
              {currentCaption || 'Analyzing scene...'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
