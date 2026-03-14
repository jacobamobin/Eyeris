import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { AlertTriangle, X } from 'lucide-react';

const LEVEL_COLORS = {
  critical: { bg: 'bg-[#D02020]', text: 'text-white', border: 'border-white' },
  warning: { bg: 'bg-orange-500', text: 'text-white', border: 'border-white' },
  info: { bg: 'bg-[#1040C0]', text: 'text-white', border: 'border-white' },
};

export default function SafetyBanner() {
  const { safetyAlert, dismissedAlerts, dismissAlert } = useAppStore();

  const isVisible = safetyAlert && !dismissedAlerts.includes(safetyAlert.id);
  const colors = safetyAlert ? (LEVEL_COLORS[safetyAlert.level] || LEVEL_COLORS.info) : LEVEL_COLORS.info;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className={`absolute top-0 left-0 right-0 z-30 ${colors.bg} border-b-4 border-[#121212] flex items-center gap-3 px-4 py-3`}
          role="alert"
          aria-live="assertive"
        >
          <AlertTriangle size={20} className={colors.text} strokeWidth={2.5} />
          <span className={`${colors.text} font-bold uppercase tracking-wider text-sm flex-1`}>
            {safetyAlert.message}
          </span>
          <button
            onClick={() => dismissAlert(safetyAlert.id)}
            className={`${colors.text} hover:opacity-70 p-1`}
            aria-label="Dismiss safety alert"
          >
            <X size={18} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
