"use server";

export type VoiceEmotionSnapshot = {
  emotion: string;
  stress: number;
  calm: number;
  energy: number;
  urgency: number;
};

export type VoiceAnalysisResult = {
  transcript: string;
  emotion: VoiceEmotionSnapshot | null;
  intent: string | null;
};

