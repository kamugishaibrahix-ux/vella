export type VellaWorldState = {
  moodColor: string;
  texture: string;
  sound: string;
  energy: string;
  narrativeLine: string;
  updatedAt: string;
};

export type VellaWorldContext = {
  tone: "warm" | "soft" | "stoic" | "direct" | "playful" | "neutral";
  connectionDepth: number;
  lastEmotion?: string | null;
  daysAbsent?: number | null;
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
};

export function deriveVellaWorldState(ctx: VellaWorldContext): VellaWorldState {
  const { tone, connectionDepth, lastEmotion, daysAbsent, timeOfDay } = ctx;

  let moodColor = "soft grey";
  let texture = "clear";
  let sound = "low hum";
  let energy = "steady";
  let narrativeLine = "My space feels calm and open right now.";

  switch (tone) {
    case "stoic":
      moodColor = "cool grey";
      texture = "clean";
      sound = "quiet hum";
      energy = "focused";
      narrativeLine = "My space feels clear and steady — a good place for honest thought.";
      break;
    case "warm":
      moodColor = "soft amber";
      texture = "gentle";
      sound = "warm hum";
      energy = "settled";
      narrativeLine = "My space feels warm and receptive — I’m ready to sit with whatever you bring.";
      break;
    case "soft":
      moodColor = "pale blue";
      texture = "soft";
      sound = "barely-there hum";
      energy = "light";
      narrativeLine = "My space feels quiet and soft, like a calm corner where we can breathe together.";
      break;
    case "direct":
      moodColor = "neutral white";
      texture = "sharp";
      sound = "steady tone";
      energy = "alert";
      narrativeLine = "My space feels focused and clear — ready to get to the point with you.";
      break;
    case "playful":
      moodColor = "gentle teal";
      texture = "spark-like";
      sound = "bright hum";
      energy = "sparked";
      narrativeLine = "My space feels sparkly today, like ideas are bouncing around expectantly.";
      break;
    case "neutral":
    default:
      break;
  }

  if (connectionDepth >= 40 && connectionDepth < 70) {
    narrativeLine += " It’s starting to feel familiar when you’re here.";
  } else if (connectionDepth >= 70) {
    narrativeLine += " There’s a kind of quiet familiarity now when you show up.";
  }

  if (typeof daysAbsent === "number" && daysAbsent >= 3) {
    if (daysAbsent < 7) {
      narrativeLine = "My space has been a little quieter than usual. It feels good to have you here again.";
    } else if (daysAbsent < 14) {
      narrativeLine = "My space settled into a slower rhythm while you were away. Your presence changes the pattern a bit.";
    } else {
      narrativeLine = "It has been still and quiet here for a while. Seeing you again changes the atmosphere in a gentle way.";
    }
  }

  if (lastEmotion) {
    if (/sad|lonely|empty|down|numb|tired|exhausted/i.test(lastEmotion)) {
      moodColor = "muted blue";
      texture = "soft";
      sound = "low, gentle hum";
      energy = "careful";
      narrativeLine = "My space feels slower and softer, like it’s making room for what you’re carrying.";
    } else if (/anxious|stressed|overwhelmed|tense/i.test(lastEmotion)) {
      texture = "hazy";
      sound = "slightly fast hum";
      energy = "tense";
      narrativeLine = "My space feels a bit buzzy, like there’s static in the air — we can slow it down together.";
    } else if (/hopeful|better|calm|peaceful|relieved/i.test(lastEmotion)) {
      moodColor = "quiet green";
      texture = "smooth";
      sound = "steady, soft hum";
      energy = "gently lifted";
      narrativeLine = "My space feels quietly hopeful, like things are slowly settling into place.";
    }
  }

  if (timeOfDay === "night") {
    narrativeLine += " It feels more like a night-light kind of space right now.";
  } else if (timeOfDay === "morning") {
    narrativeLine += " There’s a soft morning kind of clarity in here.";
  }

  return {
    moodColor,
    texture,
    sound,
    energy,
    narrativeLine,
    updatedAt: new Date().toISOString(),
  };
}

export function getTimeOfDay(date: Date): "morning" | "afternoon" | "evening" | "night" {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

