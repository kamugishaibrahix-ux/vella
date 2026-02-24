"use client";

type CLTabsProps = {
  tabs: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
};

export function CLTabs({ tabs, activeId, onChange }: CLTabsProps) {
  return (
    <div className="border-b border-border">
      <div className="flex gap-6">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={[
                "pb-2 text-sm transition",
                isActive
                  ? "border-b-2 border-primary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

