"use client";

type PersonaPreviewProps = {
  text: string;
};

export function PersonaPreview({ text }: PersonaPreviewProps) {
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        readOnly
        className="w-full resize-none rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground"
        rows={6}
      />
      <p className="text-sm text-muted-foreground leading-relaxed">
        This instruction is used to seed personaSynth across realtime, text, and voice mode.
      </p>
    </div>
  );
}


