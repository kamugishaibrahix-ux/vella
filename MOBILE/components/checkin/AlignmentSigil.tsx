"use client";

interface AlignmentSigilProps {
  completedDays: number;
  isAnimating: boolean;
}

export function AlignmentSigil({ completedDays, isAnimating }: AlignmentSigilProps) {
  const days = Math.max(0, Math.min(7, completedDays));
  
  // Generate 7 radiating lines from center
  const segments = Array.from({ length: 7 }, (_, i) => {
    const angle = (i * 360) / 7 - 90; // Start from top
    const radius = 40;
    const x2 = 50 + radius * Math.cos((angle * Math.PI) / 180);
    const y2 = 50 + radius * Math.sin((angle * Math.PI) / 180);
    return {
      x2,
      y2,
      filled: i < days,
      isNewest: i === days - 1 && isAnimating,
    };
  });

  const getMicrocopy = () => {
    if (days === 7) return "Weekly alignment secured.";
    return "Edge strengthened.";
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-32 h-32">
        {segments.map((segment, i) => {
          const isActive = segment.filled;
          const isNewest = segment.isNewest;
          
          // Calculate line length for dash animation
          const lineLength = 40; // radius
          const dashArray = `${lineLength} ${lineLength}`;
          const dashOffset = isNewest ? lineLength : 0;
          
          return (
            <line
              key={i}
              x1="50"
              y1="50"
              x2={segment.x2}
              y2={segment.y2}
              stroke={isActive ? "#059669" : "#CBD5E1"} // emerald-600 : slate-300
              strokeWidth={isActive ? 3 : 2}
              strokeLinecap="round"
              strokeDasharray={isNewest ? dashArray : undefined}
              strokeDashoffset={isNewest ? dashOffset : undefined}
              style={
                isNewest
                  ? {
                      animation: "drawSegment 600ms ease-out forwards",
                    }
                  : undefined
              }
            />
          );
        })}
        
        {/* Center dot */}
        <circle
          cx="50"
          cy="50"
          r={days === 7 ? 6 : 4}
          fill={days === 7 ? "#059669" : "#CBD5E1"}
          className="transition-all duration-300"
        />
        
        {/* Animation definition */}
        <defs>
          <style>{`
            @keyframes drawSegment {
              from {
                stroke-dashoffset: 40;
              }
              to {
                stroke-dashoffset: 0;
              }
            }
          `}</style>
        </defs>
      </svg>
      
      <p className="text-sm text-slate-600 text-center tracking-wide">
        {getMicrocopy()}
      </p>
    </div>
  );
}
