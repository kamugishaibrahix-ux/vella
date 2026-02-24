"use client";

type PersonaControl = {
  label: string;
  value: number;
};

type PersonaSlidersProps = {
  controls: PersonaControl[];
};

export function PersonaSliders({ controls }: PersonaSlidersProps) {
  return (
    <div className="divide-y divide-border/60">
      {controls.map((control) => (
        <div
          key={control.label}
          className="flex flex-col gap-3 py-3 text-sm text-muted-foreground"
        >
          <div className="flex items-center justify-between">
            <span>{control.label}</span>
            <span>{control.value}%</span>
          </div>
          <input
            type="range"
            defaultValue={control.value}
            min={0}
            max={100}
            className="range-slider w-full appearance-none"
          />
        </div>
      ))}
      <style jsx>{`
        .range-slider::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 9999px;
          background: hsl(var(--muted));
        }
        .range-slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: hsl(var(--primary));
          border: 1px solid hsl(var(--border));
          margin-top: -4px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }
        .range-slider::-moz-range-track {
          height: 8px;
          border-radius: 9999px;
          background: hsl(var(--muted));
        }
        .range-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: hsl(var(--primary));
          border: 1px solid hsl(var(--border));
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }
      `}</style>
    </div>
  );
}


