export interface ProsodyVector {
  pitch: number;
  pace: number;
  pause: number;
  breathiness: number;
  emphasis: number;
}

export const PROSODY_PRESETS: Record<string, ProsodyVector> = {
  neutral: {
    pitch: 0.4,
    pace: 0.5,
    pause: 0.4,
    breathiness: 0.3,
    emphasis: 0.4,
  },
  comforting: {
    pitch: 0.55,
    pace: 0.4,
    pause: 0.7,
    breathiness: 0.7,
    emphasis: 0.45,
  },
  encouraging: {
    pitch: 0.75,
    pace: 0.65,
    pause: 0.35,
    breathiness: 0.4,
    emphasis: 0.75,
  },
  calm: {
    pitch: 0.35,
    pace: 0.35,
    pause: 0.6,
    breathiness: 0.6,
    emphasis: 0.3,
  },
  excited: {
    pitch: 0.85,
    pace: 0.8,
    pause: 0.25,
    breathiness: 0.4,
    emphasis: 0.9,
  },
};

