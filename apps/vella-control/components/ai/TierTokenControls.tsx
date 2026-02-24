"use client";

type Tier = {
  name: string;
  tokens: number;
};

type TierTokenControlsProps = {
  tiers: Tier[];
  onUpdate: (name: string, value: number) => void;
};

export function TierTokenControls({ tiers, onUpdate }: TierTokenControlsProps) {
  return (
    <div className="space-y-4">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className="flex items-center justify-between py-2 text-sm text-muted-foreground"
        >
          <span>{tier.name}</span>
          <input
            type="number"
            value={tier.tokens}
            onChange={(event) => onUpdate(tier.name, Number(event.target.value))}
            className="w-28 rounded-lg border border-border bg-background/40 p-2 text-sm text-foreground"
          />
        </div>
      ))}
    </div>
  );
}


