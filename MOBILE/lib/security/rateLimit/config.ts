/**
 * Rate limit presets per route class. Use with rateLimitByUser() or rateLimitByIp().
 * See SECURITY_HARDENING_PLAN.md for rationale.
 */
export const RATE_LIMIT_CONFIG = {
  /** Public AI (pre-auth): strict IP limits to prevent abuse */
  publicAI: {
    ipBurst: { limit: 5, window: 60 },
    ipSustained: { limit: 20, window: 600 },
  },
  /** Authenticated AI: per-user limits */
  authAI: {
    user: { limit: 30, window: 600 },
  },
  /** Auth login/signup: strict IP + per-identifier to prevent brute force */
  authLogin: {
    ip: { limit: 10, window: 300 },
    perIdentifier: { limit: 5, window: 300 },
  },
  /** Stricter per-route overrides (apply in addition to or instead of class) */
  routes: {
    clarity: { limit: 3, window: 120 },
    strategy: { limit: 3, window: 120 },
    compass: { limit: 3, window: 120 },
    "emotion-intel": { limit: 5, window: 180 },
    deepdive: { limit: 2, window: 600 },
    insights_patterns: { limit: 5, window: 300 },
    insights_generate: { limit: 5, window: 300 },
    reflection: { limit: 5, window: 300 },
    "audio/vella": { limit: 10, window: 300 },
    "voice/standard": { limit: 10, window: 300 },
    "realtime/offer": { limit: 3, window: 300 },
    transcribe: { limit: 10, window: 300 },
  },
} as const;
