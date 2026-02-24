export type ConnectionProgress = {
  consistencyScore: number;
  emotionalOpenness: number;
  improvementScore: number;
  stabilityScore: number;
  connectionIndex: number;
};

export const DEFAULT_CONNECTION_PROGRESS: ConnectionProgress = {
  consistencyScore: 0,
  emotionalOpenness: 0,
  improvementScore: 0,
  stabilityScore: 0,
  connectionIndex: 0,
};

export type ConnectionProgressWithMeta = ConnectionProgress & {
  updatedAt: string | null;
};

