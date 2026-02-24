"use client";

type Preset = {
  title: string;
  description: string;
};

type PresetsProps = {
  presets: Preset[];
};

export function Presets({ presets }: PresetsProps) {
  return (
    <div className="space-y-4">
      {presets.map((preset) => (
        <div
          key={preset.title}
          className="flex items-center justify-between rounded-xl border border-border bg-card/50 p-4 transition hover:bg-accent/10"
        >
          <div>
            <h3 className="font-medium text-foreground">{preset.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
          </div>
          <button className="rounded-lg border border-primary/30 px-3 py-1 text-sm text-primary hover:bg-primary/10">
            Apply
          </button>
        </div>
      ))}
    </div>
  );
}

