import { LOCAL_INTELLIGENCE_FEED } from "./localFeed";
import type { IntelligenceItem } from "./types";
import type { EmotionalState } from "@/lib/realtime/emotion/state";
import type { InsightSnapshot } from "@/lib/insights/types";

interface SelectIntelligenceParams {
  emotionalState: EmotionalState;
  insights?: InsightSnapshot | null;
  language?: string | null;
}

export function selectIntelligenceItems({
  emotionalState,
  insights,
}: SelectIntelligenceParams): IntelligenceItem[] {
  const items = LOCAL_INTELLIGENCE_FEED.items;

  if (emotionalState.tension > 0.6) {
    return items.filter((i) => i.category === "wellbeing").slice(0, 1);
  }

  if (emotionalState.valence > 0.3) {
    return items.filter((i) => i.category === "creativity" || i.category === "mindset").slice(0, 1);
  }

  if (insights?.patterns?.length) {
    return items.filter((i) => i.category === "productivity").slice(0, 1);
  }

  return items.slice(0, 1);
}

