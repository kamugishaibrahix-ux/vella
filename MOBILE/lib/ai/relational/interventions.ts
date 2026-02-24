export function microIntervention(emotion: string): string | null {
  const e = emotion.toLowerCase();

  if (e.includes("stress")) {
    return "If you're open to it, try a slow breath: inhale for 4, exhale for 6. Just once. Notice what shifts.";
  }

  if (e.includes("sad") || e.includes("low")) {
    return "If it feels okay, place your hand on your chest for two seconds. That tiny gesture can signal safety to your nervous system.";
  }

  if (e.includes("fear") || e.includes("anxiety")) {
    return "You could try naming the sensation: “My body is trying to protect me.” Sometimes that alone softens the spike.";
  }

  return null;
}

