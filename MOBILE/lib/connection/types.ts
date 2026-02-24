export type ConnectionHistoryPoint = {
  date: string;
  score: number;
};

export type ConnectionMilestone = {
  level: number;
  title: string;
  unlocked: boolean;
  unlockedAt?: string | null;
};

export type ConnectionPattern = {
  label: string;
  description: string;
};

export type ConnectionDashboard = {
  score: number;
  smoothedScore: number | null;
  lastUpdated: string | null;
  history: ConnectionHistoryPoint[];
  streakDays: number;
  longestStreak: number;
  daysAbsent: number | null;
  milestones: ConnectionMilestone[];
  patterns: ConnectionPattern[];
  insights: string[];
  suggestions: string[];
  shortEmotionalLine: string;
};

