export type IntelligenceCategory =
  | "wellbeing"
  | "productivity"
  | "mindset"
  | "language"
  | "creativity";

export interface IntelligenceItem {
  id: string;
  category: IntelligenceCategory;
  title: string;
  summary: string;
  tags: string[];
  timestamp: number;
}

export interface IntelligenceFeed {
  items: IntelligenceItem[];
  lastUpdated: number;
}

