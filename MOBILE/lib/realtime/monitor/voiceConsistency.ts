export function adjustVoiceConsistency(drift: number): string {
  if (drift > 50) return "ground-voice";
  if (drift > 25) return "steady-voice";
  return "consistent";
}

