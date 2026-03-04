/**
 * Deterministic Journal Signal Extractor — client-side only.
 * Rule-based keyword/regex mapping to FocusDomains + SignalCodes.
 * No LLM. No network calls. Text never leaves device.
 */

import type { FocusDomain } from "@/lib/focusAreas";
import type { OSSignal, SignalCode, SignalSeverity } from "./taxonomy";

// ---------------------------------------------------------------------------
// Keyword rule definition
// ---------------------------------------------------------------------------

type KeywordRule = {
  domain: FocusDomain;
  code: SignalCode;
  /** Patterns matched case-insensitively against the full text. */
  patterns: RegExp[];
  /** Base severity when a single match is found. */
  baseSeverity: SignalSeverity;
  /** Base confidence (0–100) for a single match. */
  baseConfidence: number;
};

// ---------------------------------------------------------------------------
// Rule table (~35 codes, grouped by domain)
// ---------------------------------------------------------------------------

const RULES: KeywordRule[] = [
  // self-mastery
  { domain: "self-mastery", code: "SM_DISCIPLINE_LAPSE", patterns: [/\bgave\s+in\b/i, /\black\s+of\s+discipline\b/i, /\bno\s+willpower\b/i, /\bcouldn'?t\s+resist\b/i], baseSeverity: "moderate", baseConfidence: 60 },
  { domain: "self-mastery", code: "SM_ROUTINE_BREAK", patterns: [/\bskipped\s+(my\s+)?routine\b/i, /\bbroke\s+(my\s+)?routine\b/i, /\bmissed\s+(my\s+)?(morning|evening|night)\b/i, /\bdidn'?t\s+follow\s+through\b/i], baseSeverity: "low", baseConfidence: 55 },
  { domain: "self-mastery", code: "SM_IMPULSE_SURGE", patterns: [/\bimpulse\b/i, /\bimpulsive\b/i, /\bacted\s+on\s+impulse\b/i, /\bcouldn'?t\s+stop\s+myself\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "self-mastery", code: "SM_HABIT_STREAK_RISK", patterns: [/\bstreak\b.*\b(broke|lost|ended|ruined)\b/i, /\b(broke|lost|ended|ruined)\b.*\bstreak\b/i, /\bfell\s+off\b/i], baseSeverity: "moderate", baseConfidence: 60 },
  { domain: "self-mastery", code: "SM_DIGITAL_OVERUSE", patterns: [/\bscrolling\b/i, /\bphone\s+addiction\b/i, /\bscreen\s+time\b/i, /\bsocial\s+media\b.*\btoo\s+much\b/i, /\btoo\s+much\b.*\bsocial\s+media\b/i], baseSeverity: "low", baseConfidence: 50 },

  // addiction-recovery
  { domain: "addiction-recovery", code: "AR_URGE_MENTION", patterns: [/\burge\b/i, /\burges\b/i, /\btempted\b/i, /\btemptation\b/i], baseSeverity: "moderate", baseConfidence: 65 },
  { domain: "addiction-recovery", code: "AR_RELAPSE_RISK", patterns: [/\brelapse\b/i, /\brelapsed\b/i, /\bslipped\b/i, /\bfell\s+back\b/i, /\bback\s+to\s+(old|using|drinking)\b/i], baseSeverity: "high", baseConfidence: 75 },
  { domain: "addiction-recovery", code: "AR_CRAVING_SPIKE", patterns: [/\bcraving\b/i, /\bcravings\b/i, /\breally\s+want(ed)?\s+to\s+(use|drink|smoke)\b/i], baseSeverity: "moderate", baseConfidence: 65 },
  { domain: "addiction-recovery", code: "AR_ISOLATION_PATTERN", patterns: [/\bisolat(ed|ing|ion)\b/i, /\bwithdrawing\b/i, /\bcutting\s+(people|everyone)\s+off\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "addiction-recovery", code: "AR_RECOVERY_DOUBT", patterns: [/\bcan'?t\s+(do|handle)\s+this\b/i, /\brecovery\b.*\b(pointless|hopeless|failing)\b/i, /\bwhy\s+bother\b/i], baseSeverity: "high", baseConfidence: 60 },

  // emotional-intelligence
  { domain: "emotional-intelligence", code: "EI_ANXIETY_ELEVATED", patterns: [/\banxi(ous|ety)\b/i, /\bpanic\b/i, /\bworried\b/i, /\bnervous\b/i, /\bon\s+edge\b/i], baseSeverity: "moderate", baseConfidence: 60 },
  { domain: "emotional-intelligence", code: "EI_ANGER_SPIKE", patterns: [/\bfurious\b/i, /\brage\b/i, /\bso\s+angry\b/i, /\bseething\b/i, /\binfuriat/i], baseSeverity: "high", baseConfidence: 65 },
  { domain: "emotional-intelligence", code: "EI_MOOD_INSTABILITY", patterns: [/\bmood\s+swing/i, /\bup\s+and\s+down\b/i, /\bunstable\b/i, /\bemotional\s+roller/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "emotional-intelligence", code: "EI_STRESS_OVERLOAD", patterns: [/\bstress(ed)?\b/i, /\bpressure\b/i, /\boverloaded\b/i, /\btoo\s+much\s+on\s+my\s+plate\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "emotional-intelligence", code: "EI_OVERWHELM", patterns: [/\boverwhelm(ed|ing)?\b/i, /\bcan'?t\s+cope\b/i, /\bdrowning\b/i, /\bshutting\s+down\b/i], baseSeverity: "high", baseConfidence: 65 },

  // relationships
  { domain: "relationships", code: "RE_CONFLICT_MENTION", patterns: [/\bargument\b/i, /\bfight\b/i, /\bfighting\b/i, /\bconflict\b/i, /\byelling\b/i, /\bscreaming\b/i], baseSeverity: "moderate", baseConfidence: 60 },
  { domain: "relationships", code: "RE_LONELINESS_SIGNAL", patterns: [/\blonely\b/i, /\bloneliness\b/i, /\balone\b/i, /\bno\s+one\s+(cares|understands)\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "relationships", code: "RE_TRUST_EROSION", patterns: [/\bbetrayed\b/i, /\bcan'?t\s+trust\b/i, /\blied\s+to\s+me\b/i, /\btrust\s+(broken|gone|lost)\b/i], baseSeverity: "high", baseConfidence: 65 },
  { domain: "relationships", code: "RE_COMMUNICATION_BREAKDOWN", patterns: [/\bstopped\s+talking\b/i, /\bsilent\s+treatment\b/i, /\bwon'?t\s+(listen|communicate)\b/i, /\bcan'?t\s+talk\s+to\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "relationships", code: "RE_BOUNDARY_VIOLATION", patterns: [/\bboundary\b.*\b(crossed|violated|ignored)\b/i, /\b(crossed|violated|ignored)\b.*\bboundary\b/i, /\bpushing\s+my\s+limits\b/i], baseSeverity: "high", baseConfidence: 60 },

  // performance-focus
  { domain: "performance-focus", code: "PF_FOCUS_DECLINE", patterns: [/\bcan'?t\s+(focus|concentrate)\b/i, /\bdistracted\b/i, /\battention\b.*\b(scattered|gone)\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "performance-focus", code: "PF_PROCRASTINATION", patterns: [/\bprocrastinat/i, /\bkeep\s+putting\s+(it\s+)?off\b/i, /\bavoiding\s+(work|tasks)\b/i], baseSeverity: "low", baseConfidence: 55 },
  { domain: "performance-focus", code: "PF_BURNOUT_RISK", patterns: [/\bburnout\b/i, /\bburnt?\s+out\b/i, /\bexhausted\b.*\b(work|job)\b/i, /\b(work|job)\b.*\bexhausted\b/i], baseSeverity: "high", baseConfidence: 65 },
  { domain: "performance-focus", code: "PF_PRODUCTIVITY_DROP", patterns: [/\bproductiv(e|ity)\b.*\b(low|dropped|gone)\b/i, /\bgetting\s+nothing\s+done\b/i, /\bunproductive\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "performance-focus", code: "PF_MOTIVATION_LOSS", patterns: [/\bno\s+motivation\b/i, /\bunmotivated\b/i, /\bdon'?t\s+(care|see\s+the\s+point)\b/i, /\bwhat'?s\s+the\s+point\b/i], baseSeverity: "moderate", baseConfidence: 60 },

  // identity-purpose
  { domain: "identity-purpose", code: "IP_PURPOSE_DOUBT", patterns: [/\bno\s+purpose\b/i, /\bpurposeless\b/i, /\bwhat\s+am\s+i\s+doing\b/i, /\bwasting\s+my\s+life\b/i], baseSeverity: "high", baseConfidence: 60 },
  { domain: "identity-purpose", code: "IP_VALUES_CONFLICT", patterns: [/\bvalues\b.*\b(conflict|clash|compromise)\b/i, /\bagainst\s+my\s+(values|principles|beliefs)\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "identity-purpose", code: "IP_DIRECTION_LOST", patterns: [/\blost\b/i, /\bno\s+direction\b/i, /\bstuck\b/i, /\bdon'?t\s+know\s+where\b/i], baseSeverity: "moderate", baseConfidence: 45 },
  { domain: "identity-purpose", code: "IP_MEANING_VOID", patterns: [/\bmeaningless\b/i, /\bno\s+meaning\b/i, /\bempty\s+inside\b/i, /\bvoid\b/i, /\bnumb\b/i], baseSeverity: "high", baseConfidence: 60 },

  // physical-health
  { domain: "physical-health", code: "PH_SLEEP_DISRUPTION", patterns: [/\bcan'?t\s+sleep\b/i, /\binsomnia\b/i, /\bbad\s+sleep\b/i, /\bwoke\s+up\s+(multiple|several)\s+times\b/i, /\btossing\s+and\s+turning\b/i], baseSeverity: "moderate", baseConfidence: 60 },
  { domain: "physical-health", code: "PH_ENERGY_DEPLETION", patterns: [/\bno\s+energy\b/i, /\bdrained\b/i, /\bexhausted\b/i, /\bfatigued\b/i, /\bso\s+tired\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "physical-health", code: "PH_EXERCISE_SKIP", patterns: [/\bskipped\s+(gym|workout|exercise|training)\b/i, /\bdidn'?t\s+(work\s+out|exercise|train)\b/i], baseSeverity: "low", baseConfidence: 55 },
  { domain: "physical-health", code: "PH_BODY_NEGLECT", patterns: [/\bstopped\s+(eating|caring)\b/i, /\bnot\s+eating\b/i, /\bneglecting\s+(my\s+)?body\b/i, /\bjunk\s+food\s+(every|all)\b/i], baseSeverity: "moderate", baseConfidence: 55 },
  { domain: "physical-health", code: "PH_FATIGUE_CHRONIC", patterns: [/\balways\s+tired\b/i, /\bchronic(ally)?\s+(tired|fatigued|exhausted)\b/i, /\bnever\s+(rested|have\s+energy)\b/i], baseSeverity: "high", baseConfidence: 65 },

  // financial-discipline
  { domain: "financial-discipline", code: "FD_IMPULSE_SPEND", patterns: [/\bimpulse\s+(buy|purchase|spend|bought)\b/i, /\bbought\b.*\bdidn'?t\s+need\b/i, /\bsplurge\b/i], baseSeverity: "moderate", baseConfidence: 60 },
  { domain: "financial-discipline", code: "FD_BUDGET_BREACH", patterns: [/\bover\s+budget\b/i, /\bblew\s+(my\s+)?budget\b/i, /\boverspent\b/i, /\boverspending\b/i], baseSeverity: "moderate", baseConfidence: 65 },
  { domain: "financial-discipline", code: "FD_FINANCIAL_ANXIETY", patterns: [/\bmoney\b.*\b(worr|anxious|scared|stress)\b/i, /\b(worr|anxious|scared|stress)\b.*\bmoney\b/i, /\bcan'?t\s+afford\b/i, /\bfinancial(ly)?\s+(stressed|anxious|worried)\b/i], baseSeverity: "moderate", baseConfidence: 60 },
  { domain: "financial-discipline", code: "FD_SAVINGS_DRAIN", patterns: [/\bsavings\b.*\b(gone|drained|empty|depleted)\b/i, /\bdipped\s+into\s+savings\b/i, /\bno\s+savings\b/i], baseSeverity: "high", baseConfidence: 65 },
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<SignalSeverity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
};

function escalateSeverity(base: SignalSeverity, matchCount: number): SignalSeverity {
  if (matchCount >= 3) return "high";
  if (matchCount >= 2 && base === "low") return "moderate";
  if (matchCount >= 2 && base === "moderate") return "high";
  return base;
}

function adjustConfidence(base: number, matchCount: number): number {
  const adjusted = Math.min(100, base + (matchCount - 1) * 10);
  return Math.max(0, adjusted);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MAX_SIGNALS = 8;

/**
 * Extract OS signals from journal text. Pure, deterministic, client-side only.
 * Returns at most 8 signals, deduped by code, sorted by severity desc then confidence desc.
 */
export function extractSignalsFromJournalText(text: string): OSSignal[] {
  if (!text || !text.trim()) return [];

  const normalized = text.toLowerCase();
  const candidates: OSSignal[] = [];

  for (const rule of RULES) {
    let matchCount = 0;
    for (const pattern of rule.patterns) {
      // Count all matches for this pattern in the text
      const matches = normalized.match(new RegExp(pattern.source, "gi"));
      if (matches) {
        matchCount += matches.length;
      }
    }

    if (matchCount === 0) continue;

    candidates.push({
      domain: rule.domain,
      code: rule.code,
      severity: escalateSeverity(rule.baseSeverity, matchCount),
      confidence: adjustConfidence(rule.baseConfidence, matchCount),
      source: "journal",
    });
  }

  // Dedupe by code: keep highest severity+confidence per code
  const byCode = new Map<SignalCode, OSSignal>();
  for (const signal of candidates) {
    const existing = byCode.get(signal.code);
    if (!existing) {
      byCode.set(signal.code, signal);
    } else {
      const existingSev = SEVERITY_ORDER[existing.severity];
      const newSev = SEVERITY_ORDER[signal.severity];
      if (newSev > existingSev || (newSev === existingSev && signal.confidence > existing.confidence)) {
        byCode.set(signal.code, signal);
      }
    }
  }

  // Sort: highest severity first, then highest confidence
  const sorted = Array.from(byCode.values()).sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  return sorted.slice(0, MAX_SIGNALS);
}
