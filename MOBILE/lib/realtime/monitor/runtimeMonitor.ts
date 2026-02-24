export interface RealtimeRuntimeSnapshot {
  avgDeltaLength: number;
  lastDelta: string;
  lastStage: string;
  driftScore: number;
  emotionArc: string;
  pacingScore: number;
}

export class RuntimeMonitor {
  private deltas: string[] = [];
  private driftScore = 0;
  private pacingScore = 0;
  private lastStage = "idle";
  private lastArc = "neutral";

  recordDelta(text: string) {
    if (!text) return;
    this.deltas.push(text);
    if (this.deltas.length > 40) {
      this.deltas.shift();
    }
  }

  setStage(stage: string) {
    this.lastStage = stage;
  }

  setEmotionArc(arc: string) {
    this.lastArc = arc;
  }

  getSnapshot(): RealtimeRuntimeSnapshot {
    const avgLength =
      this.deltas.length === 0
        ? 0
        : this.deltas.join("").length / this.deltas.length;

    return {
      avgDeltaLength: avgLength,
      lastDelta: this.deltas[this.deltas.length - 1] ?? "",
      lastStage: this.lastStage,
      driftScore: this.driftScore,
      emotionArc: this.lastArc,
      pacingScore: this.pacingScore,
    };
  }

  updateDrift(amount: number) {
    this.driftScore = Math.max(0, Math.min(100, this.driftScore + amount));
  }

  updatePacing(amount: number) {
    this.pacingScore = Math.max(0, Math.min(100, this.pacingScore + amount));
  }
}

