export interface LongHorizonState {
  lastSessionTime: number;
  connectionDepth: number;
  trustLevel: number;
}

export const DEFAULT_LHCS: LongHorizonState = {
  lastSessionTime: Date.now(),
  connectionDepth: 0.2,
  trustLevel: 0.3,
};

export function loadLHCS(): LongHorizonState {
  try {
    const data = localStorage.getItem("vella_lhcs");
    if (!data) return DEFAULT_LHCS;
    return { ...DEFAULT_LHCS, ...JSON.parse(data) };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[persona/longHorizonState] persistence failed:", err);
    }
    return DEFAULT_LHCS;
  }
}

export function saveLHCS(state: LongHorizonState) {
  try {
    localStorage.setItem("vella_lhcs", JSON.stringify(state));
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[persona/longHorizonState] persistence failed:", err);
    }
  }
}

