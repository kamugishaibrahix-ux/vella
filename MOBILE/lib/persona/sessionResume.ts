import { loadLHCS, saveLHCS } from "./longHorizonState";

export function getSessionResumeMessage(): string {
  const lhcs = loadLHCS();
  const now = Date.now();
  const delta = now - lhcs.lastSessionTime;

  let message = "";
  if (delta > 2 * 24 * 60 * 60 * 1000) {
    message = "It's been a while. How have you been feeling lately?";
    lhcs.trustLevel *= 0.95;
  } else if (delta > 6 * 60 * 60 * 1000) {
    message = "Good to see you again. What's been on your mind today?";
    lhcs.trustLevel *= 1.01;
  } else {
    message = "I'm here with you. How are you feeling right now?";
    lhcs.trustLevel *= 1.02;
  }

  lhcs.lastSessionTime = now;
  saveLHCS(lhcs);
  return message;
}

