import type { MonitoringSnapshot } from "./types";

export function getPredictiveAlerts(snapshot: MonitoringSnapshot): string[] {
  const alerts: string[] = [];

  if (snapshot.driftScore > 6 && snapshot.clarity < 0.5) {
    alerts.push("High risk of persona drift.");
  }

  if (snapshot.tension > 0.7) {
    alerts.push("User emotional tension rising.");
  }

  if (snapshot.riskLevel > 0.65) {
    alerts.push("Overall system stability degrading.");
  }

  return alerts;
}

