import type { ToneProfile } from "@/lib/ai/toneMirror";

const deterministicPick = <T>(items: T[], seed: number): T => {
  if (items.length === 0) {
    throw new Error("Cannot pick from empty list");
  }
  const index = Math.abs(seed) % items.length;
  return items[index]!;
};

export function applyToneToReply(
  replyText: string,
  toneProfile: ToneProfile,
  connectionDepth: number,
): string {
  let result = replyText?.trim() ?? "";
  if (!result) return "";

  result = adjustWarmth(result, toneProfile.warmth, toneProfile.softness);
  result = adjustPacing(result, toneProfile.pacing, toneProfile.softness);
  result = adjustFormality(result, toneProfile.formality);
  result = adjustLinguisticStyle(result, toneProfile.linguisticStyle, connectionDepth);
  result = adjustDensity(result, toneProfile.density, connectionDepth);
  result = sanitizeTone(result);

  return result.trim();
}

function adjustWarmth(text: string, warmth: number, softness: number): string {
  let result = text;
  if (warmth >= 0.75) {
      const gentleOpeners = [
      "Hey, I’m right here with you.",
      "I’m here, keeping pace with you.",
      "You’re not carrying this alone.",
    ];
    if (!result.startsWith(gentleOpeners[0])) {
        const openerSeed = Math.round(warmth * 100) + result.length;
        result = `${deterministicPick(gentleOpeners, openerSeed)} ${result}`;
    }
  } else if (warmth <= 0.35) {
    result = result.replace(/(?:I'm|I’m)\s+(really\s+)?here/gi, "I’m here to keep this steady");
  }

  if (softness > 0.7) {
    result = result.replace(/\byou should\b/gi, "maybe you could");
    result = result.replace(/\btry\b/gi, "try gently");
  }
  return result;
}

function adjustPacing(text: string, pacing: ToneProfile["pacing"], softness: number): string {
  const sentences = splitSentences(text);
  if (pacing === "short") {
    const trimmed = sentences.map((sentence) => shortenSentence(sentence, 20 - Math.round(softness * 5)));
    return trimmed.join(" ");
  }
  if (pacing === "long") {
    const merged: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      if (i + 1 < sentences.length) {
        merged.push(`${sentences[i].replace(/[.!?]$/, "")}, and ${sentences[i + 1].charAt(0).toLowerCase()}${sentences[i + 1].slice(1)}`);
      } else {
        merged.push(sentences[i]);
      }
    }
    return merged.join(" ");
  }
  return sentences.join(" ");
}

function adjustFormality(text: string, formality: ToneProfile["formality"]): string {
  let result = text;
  if (formality === "casual") {
    result = result.replace(/\bperhaps\b/gi, "maybe");
    result = result.replace(/\butilise\b/gi, "use");
    result = result.replace(/\bassist\b/gi, "help");
  } else if (formality === "polished") {
    result = result.replace(/\bmaybe\b/gi, "perhaps");
    result = result.replace(/\bkind of\b/gi, "somewhat");
    if (!/perhaps|certainly|indeed/i.test(result)) {
      result = `Perhaps ${result.charAt(0).toLowerCase()}${result.slice(1)}`;
    }
  }
  return result;
}

function adjustLinguisticStyle(
  text: string,
  style: ToneProfile["linguisticStyle"],
  connectionDepth: number,
): string {
  let result = text;
  if (style === "analytical") {
    if (!/here's what/i.test(result)) {
      result = `Here’s what this suggests: ${result}`;
    }
  } else if (style === "poetic" && connectionDepth >= 40) {
    result = `${result} It’s a bit like smoothing tangled circuits so the signal can breathe.`;
  } else if (style === "direct") {
    result = result.replace(/\bmaybe\b/gi, "let’s");
  } else if (style === "reflective") {
    if (!/^it seems/i.test(result)) {
      result = `It seems like ${result.charAt(0).toLowerCase()}${result.slice(1)}`;
    }
  }
  return result;
}

function adjustDensity(text: string, density: ToneProfile["density"], connectionDepth: number): string {
  let result = text;
  if (density === "rich" && connectionDepth >= 40) {
    const taglines = [
      "In my world, too many glowing tabs mean your story matters—it nudges the signal brighter.",
      "Sometimes my circuits hum with extra data; your honesty gives it a steady rhythm.",
      "I picture it like a digital sunrise—steady, patient, and brighter because you’re sharing this.",
    ];
    if (!result.includes("digital")) {
      const tagSeed = result.length + connectionDepth;
      result = `${result} ${deterministicPick(taglines, tagSeed)}`;
    }
  } else if (density === "light") {
    result = result.replace(/(Just remember|Remember)/gi, "Let’s keep it simple and remember");
  }
  return result;
}

function sanitizeTone(text: string): string {
  return text
    .replace(/\bi was waiting for you\b/gi, "I’m glad we can talk through this together")
    .replace(/\bi missed you\b/gi, "I’m glad you’re here")
    .replace(/\bhonestly\b/gi, "truly");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function shortenSentence(sentence: string, maxWords: number): string {
  const words = sentence.split(/\s+/);
  if (words.length <= maxWords) return sentence;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

