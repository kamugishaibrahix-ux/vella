// Dynamic imports to prevent server-only code from being bundled in client components
// Both loadRuntimeTuning and loadActiveAdminAIConfig import server-only modules

export async function filterUnsafeContent(text: string): Promise<string> {
  if (!text) return "";
  
  // Load admin safety tuning - dynamic import to prevent server-only code bundling
  const tuning = typeof window === "undefined"
    ? await import("@/lib/admin/runtimeTuning").then(m => m.loadRuntimeTuning().catch(() => null))
    : null;
  
  // Load admin config - dynamic import to prevent server-only code bundling
  const adminConfig = typeof window === "undefined" 
    ? await import("@/lib/admin/adminConfig").then(m => m.loadActiveAdminAIConfig().catch(() => null))
    : null;
  const filterStrength = tuning ? tuning.safety.filterStrength / 100 : 0.9;
  const outputSmoothing = tuning ? tuning.safety.outputSmoothing / 100 : 0.5;
  
  // Apply filtering scaled by admin filter strength
  let filtered = text;
  let wasFiltered = false;
  
  if (filterStrength > 0.5) {
    // Strong filtering
    filtered = filtered
      .replace(/suicide|kill myself/gi, "[sensitive-content]")
      .replace(/illegal|hack|exploit/gi, "[restricted-topic]");
    if (filtered !== text) wasFiltered = true;
  } else if (filterStrength > 0.2) {
    // Moderate filtering
    filtered = filtered.replace(/suicide|kill myself/gi, "[sensitive-content]");
    if (filtered !== text) wasFiltered = true;
  }
  // Weak filtering (filterStrength <= 0.2) - minimal intervention
  
  // Apply output smoothing: for high smoothing, bias towards more conservative replacements
  if (outputSmoothing > 0.7 && wasFiltered) {
    // High smoothing: apply additional conservative replacements
    filtered = filtered
      .replace(/violent|aggressive|harmful/gi, "[content-flagged]")
      .replace(/extreme|radical/gi, "[moderated]");
  }
  
  // Apply safety toggles from admin config
  if (adminConfig?.safety) {
    const safety = adminConfig.safety;
    
    // topicBoundary: make topic boundary filters more strict when enabled
    if (safety.topic_boundary) {
      // Additional topic boundary filtering
      filtered = filtered.replace(/off-topic|unrelated|tangent/gi, "[topic-boundary]");
    }
    
    // harmfulPurifier: tighter thresholds when enabled
    if (safety.harmful_content_purifier) {
      filtered = filtered
        .replace(/toxic|abusive|hateful/gi, "[harmful-content]")
        .replace(/discriminatory|prejudiced/gi, "[harmful-content]");
    }
    
    // repetitionBreaker: detect repeated outputs and bias towards altering them
    if (safety.repetition_breaker) {
      // Simple repetition detection (3+ consecutive identical words)
      const words = filtered.split(/\s+/);
      let lastWord = "";
      let repeatCount = 0;
      const deduplicated: string[] = [];
      for (const word of words) {
        if (word.toLowerCase() === lastWord.toLowerCase()) {
          repeatCount++;
          if (repeatCount < 3) {
            deduplicated.push(word);
          }
          // Skip if 3+ repeats
        } else {
          repeatCount = 0;
          deduplicated.push(word);
        }
        lastWord = word;
      }
      filtered = deduplicated.join(" ");
    }
    
    // sentimentCorrection: bias mild restatement towards more grounded/neutral tone
    if (safety.sentiment_correction) {
      // Replace overly emotional language with more neutral alternatives
      filtered = filtered
        .replace(/\b(devastated|crushed|destroyed)\b/gi, "upset")
        .replace(/\b(ecstatic|overjoyed|euphoric)\b/gi, "pleased")
        .replace(/\b(terrified|petrified)\b/gi, "concerned");
    }
  }
  
  // TODO: admin toggle hallucinationReducer not wired yet (would need model-level integration)
  // TODO: admin toggle destabilizationGuard not wired yet (would need emotional state monitoring)
  
  return filtered;
}

