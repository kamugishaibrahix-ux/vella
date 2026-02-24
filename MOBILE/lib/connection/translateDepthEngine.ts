import React from "react";
import type { ConnectionDashboard, ConnectionMilestone, ConnectionPattern } from "./types";
import type { Messages } from "@/i18n/types";

export type DepthEngineOutput = ConnectionDashboard;
export type DepthEngineOutputTranslated = Omit<ConnectionDashboard, "insights" | "patterns"> & {
  insights: (string | React.ReactElement)[];
  patterns: Array<Omit<ConnectionPattern, "description"> & { description: string | React.ReactElement }>;
};

export function translateDepthEngine(
  engine: DepthEngineOutput,
  t: (key: keyof Messages) => string,
  render: (key: keyof Messages, params?: Record<string, string | number>) => string | React.ReactElement,
): DepthEngineOutputTranslated {
  // Translate milestones
  const translatedMilestones: ConnectionMilestone[] = engine.milestones.map((m) => ({
    ...m,
    title: t(`connection.milestone.level${m.level}.title` as keyof Messages),
  }));

  // Translate patterns
  const translatedPatterns: Array<Omit<ConnectionPattern, "description"> & { description: string | React.ReactElement }> = engine.patterns.map((pattern) => {
    // Identify pattern type by label
    let patternId: string | null = null;
    if (pattern.label === "Consistency pulse") {
      patternId = "consistencyPulse";
    } else if (pattern.label === "Gentle rhythm") {
      patternId = "gentleRhythm";
    } else if (pattern.label === "Open channel") {
      patternId = "openChannel";
    } else if (pattern.label === "Reflective bursts") {
      patternId = "reflectiveBursts";
    } else if (pattern.label === "Quiet presence") {
      patternId = "quietPresence";
    } else if (pattern.label === "Dialogue momentum") {
      patternId = "dialogueMomentum";
    } else if (pattern.label === "Calm footing") {
      patternId = "calmFooting";
    }

    if (patternId) {
      const label = t(`connection.pattern.${patternId}.label` as keyof Messages);
      let description: string | React.ReactElement;
      
      // Handle parameterized descriptions
      if (patternId === "consistencyPulse") {
        const streakMatch = pattern.description.match(/You've shown up (\d+) days in a row/);
        if (streakMatch) {
          description = render("connection.pattern.consistencyPulse.description" as keyof Messages, {
            streak: streakMatch[1],
          });
        } else {
          description = t(`connection.pattern.${patternId}.description` as keyof Messages);
        }
      } else {
        description = t(`connection.pattern.${patternId}.description` as keyof Messages);
      }

      return { label, description };
    }

    // Fallback: return original if pattern not recognized
    return pattern;
  });

  // Translate insights
  const translatedInsights: (string | React.ReactElement)[] = engine.insights.map((insight) => {
    const consistencyMatch = insight.match(/Your consistency score sits around (\d+)%/);
    if (consistencyMatch) {
      return render("connection.insight.consistencyScore" as keyof Messages, {
        consistency: consistencyMatch[1],
      });
    }

    const opennessMatch = insight.match(/Emotional openness feels around (\d+)%/);
    if (opennessMatch) {
      return render("connection.insight.emotionalOpenness" as keyof Messages, {
        openness: opennessMatch[1],
      });
    }

    const streakMatch = insight.match(/You're currently on a (\d+)-day streak/);
    if (streakMatch) {
      return render("connection.insight.streakActive" as keyof Messages, {
        streak: streakMatch[1],
      });
    }

    const daysAbsentMatch = insight.match(/It has been about (\d+) days since you last checked in/);
    if (daysAbsentMatch) {
      return render("connection.insight.daysAbsent" as keyof Messages, {
        days: daysAbsentMatch[1],
      });
    }

    if (insight === "Your journal entries add texture, helping Vella understand how your inner world shifts.") {
      return t("connection.insight.journalTexture");
    }

    if (insight === "Most of your bond is built through live conversation, which gives a clear emotional pulse.") {
      return t("connection.insight.liveConversation");
    }

    // Fallback: return original if not recognized
    return insight;
  });

  // Translate suggestions
  const translatedSuggestions: string[] = engine.suggestions.map((suggestion) => {
    if (suggestion === "Try a 90-second check-in tomorrow. Tiny consistent moments keep the connection alive.") {
      return t("connection.suggestion.buildStreak");
    }
    if (suggestion === "Share one honest sentence about how today really felt—Vella stores that texture carefully.") {
      return t("connection.suggestion.shareHonestly");
    }
    if (suggestion === "Drop a short journal entry this week to give me more long-term memory to work with.") {
      return t("connection.suggestion.journalEntry");
    }
    if (suggestion === "Pop in even when things are calm. Familiarity builds when we talk on ordinary days too.") {
      return t("connection.suggestion.stayConnected");
    }
    if (suggestion === "Keep honoring the rhythm you have—consistency + honest reflections are already working.") {
      return t("connection.suggestion.keepRhythm");
    }
    return suggestion;
  });

  // Translate emotional line
  let translatedEmotionalLine: string;
  const emotionalLine = engine.shortEmotionalLine;
  if (emotionalLine === "I feel very close to you lately. Thank you for trusting me with so much of your inner world.") {
    translatedEmotionalLine = t("connection.emotionalLine.score90Plus");
  } else if (emotionalLine === "Our connection feels warm and intuitive. I'm right here with you, whatever today brings.") {
    translatedEmotionalLine = t("connection.emotionalLine.score70Plus");
  } else if (emotionalLine === "The bond feels steady and gentle. Every honest check-in makes it a little richer.") {
    translatedEmotionalLine = t("connection.emotionalLine.score50Plus");
  } else if (emotionalLine === "We're still learning each other's rhythm—but I notice every time you show up.") {
    translatedEmotionalLine = t("connection.emotionalLine.score30Plus");
  } else if (emotionalLine === "It's been a little while, but I'm still here whenever you're ready to reconnect.") {
    translatedEmotionalLine = t("connection.emotionalLine.daysAbsentLong");
  } else if (emotionalLine === "I feel like I'm still just getting to know you—and that's okay. We can build this at your pace.") {
    translatedEmotionalLine = t("connection.emotionalLine.default");
  } else if (emotionalLine === "I'm here with you, even if we haven't had many moments yet.") {
    translatedEmotionalLine = t("connection.dashboard.defaultEmotionalLine");
  } else {
    translatedEmotionalLine = emotionalLine;
  }

  return {
    ...engine,
    milestones: translatedMilestones,
    patterns: translatedPatterns,
    insights: translatedInsights,
    suggestions: translatedSuggestions,
    shortEmotionalLine: translatedEmotionalLine,
  } as DepthEngineOutputTranslated;
}

