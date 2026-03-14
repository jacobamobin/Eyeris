import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';

export default function CaptionBar() {
  const { currentCaption, isProcessing } = useAppStore();

  return (
    <div className="absolute bottom-24 left-0 right-0 z-20 px-4" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        {(currentCaption || isProcessing) && (
          <motion.div
            key={currentCaption}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="bg-black/80 border-2 border-white/30 px-4 py-3 flex items-center gap-3"
          >
            {isProcessing && (
              <div className="flex gap-1 flex-shrink-0">
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 bg-[#F0C020] rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                  />
                ))}
              </div>
            )}
            <p className="text-white text-sm font-medium leading-relaxed">
              {currentCaption || 'Analyzing scene...'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
