"use client";

interface WeeklyCrystalProps {
  completedDays: number; // 0-7
  isLocked?: boolean; // For microcopy context
}

export function WeeklyCrystal({ completedDays, isLocked }: WeeklyCrystalProps) {
  // Clamp to 0-7 range
  const days = Math.max(0, Math.min(7, completedDays));
  
  // Progress calculation for stroke dasharray
  const progress = (days / 7) * 100;
  const circumference = 2 * Math.PI * 50; // r=50
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // Generate 7 segment dots
  const segments = Array.from({ length: 7 }, (_, i) => i < days);

  // Microcopy logic
  const getMicrocopy = () => {
    if (days === 7) return "Weekly alignment complete.";
    if (isLocked) return "Edge secured.";
    return "Feed the crystal.";
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Crystal Circle */}
      <div 
        key={days}
        className="relative w-16 h-16"
      >
        <svg
          viewBox="0 0 120 120"
          className="w-full h-full -rotate-90"
        >
          {/* Background track */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="6"
          />
          
          {/* Progress arc */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="#059669"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-semibold ${
            days === 7 ? 'text-emerald-600' : 'text-slate-700'
          }`}>
            {days}
          </span>
        </div>
      </div>

      {/* 7 segment dots */}
      <div className="flex gap-1">
        {segments.map((filled, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              filled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          />
        ))}
      </div>

      {/* Microcopy */}
      <p className="text-xs text-slate-500 text-center tracking-wide">
        {getMicrocopy()}
      </p>
    </div>
  );
}
