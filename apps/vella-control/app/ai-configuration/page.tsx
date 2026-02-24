"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { fetchAdminConfig, saveAdminConfig } from "@/lib/api/adminConfigClient";
import { AdminConfig } from "@/lib/types/adminConfig";

type SliderItem = {
  id: string;
  label: string;
  value: number;
  setValue: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  formatValue?: (value: number) => string;
};

type ToggleConfig = {
  id: string;
  label: string;
};

type SectionCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

type SliderListProps = {
  items: SliderItem[];
};

type ToggleListProps = {
  configs: ToggleConfig[];
  values: Record<string, boolean>;
  onChange: (id: string, value: boolean) => void;
};

type Preset = {
  title: string;
  description: string;
};

type PresetsProps = {
  presets: Preset[];
};

type ReasoningDepth = "Light" | "Normal" | "Analytical" | "Deep";

const personaPresets: Preset[] = [
  {
    title: "Warm Mentor",
    description: "High empathy, medium structure, supportive pacing.",
  },
  {
    title: "Calm Therapist",
    description: "Slow cadence, depth-first, strong emotional containment.",
  },
  {
    title: "Minimalist Guide",
    description: "Low verbosity, facts-forward, reflective prompts.",
  },
];

const presetConfigs: Record<
  string,
  {
    persona: { empathy: number; directness: number; energy: number };
    behaviour: Partial<Record<string, number>>;
    models: { text: string; realtime: string; embedding: string };
  }
> = {
  "Warm Mentor": {
    persona: { empathy: 90, directness: 35, energy: 65 },
    behaviour: { empathy: 85, directness: 35, containment: 70, playfulness: 45 },
    models: { text: "gpt-4o-mini", realtime: "gpt-4o-mini", embedding: "text-embedding-3-small" },
  },
  "Calm Therapist": {
    persona: { empathy: 88, directness: 30, energy: 40 },
    behaviour: { empathy: 80, directness: 25, containment: 75, safety: 90 },
    models: { text: "gpt-4o-mini-tts", realtime: "gpt-4o-realtime-mini", embedding: "text-embedding-3-large" },
  },
  "Minimalist Guide": {
    persona: { empathy: 60, directness: 55, energy: 35 },
    behaviour: { conciseness: 80, analysis: 75, empathy: 55 },
    models: { text: "gpt-4.1-mini", realtime: "gpt-4o-light", embedding: "text-embedding-3-small" },
  },
};

const hiddenModuleToggleConfig: ToggleConfig[] = [
  { id: "mentorMode", label: "Mentor Mode" },
  { id: "therapistMode", label: "Therapist Mode" },
  { id: "stoicMode", label: "Stoic Philosophy Mode" },
  { id: "coachingMode", label: "Coaching Mode" },
  { id: "listeningMode", label: "Non-directive Listening Mode" },
  { id: "childSafeMode", label: "Child-Safe Persona Mode" },
  { id: "noAttachmentMode", label: "No-Attachment Guard Mode" },
];

const memoryToggleConfig: ToggleConfig[] = [
  { id: "longTermMemory", label: "Enable Long-Term Memory" },
  { id: "emotionalMemory", label: "Enable Emotional Memory" },
  { id: "continuity", label: "Conversational Continuity" },
  { id: "insightRetention", label: "Insight Retention" },
];

const safetyToggleConfig: ToggleConfig[] = [
  { id: "hallucinationReducer", label: "Hallucination Reducer" },
  { id: "destabilizationGuard", label: "Emotional Destabilization Guard" },
  { id: "topicBoundary", label: "Topic Boundary Filter" },
  { id: "overEmpathyLimiter", label: "Over-Empathy Limiter" },
  { id: "harmfulPurifier", label: "Harmful Content Purifier" },
  { id: "attachmentPrevention", label: "Attachment Prevention" },
  { id: "repetitionBreaker", label: "Repetition Breaker" },
  { id: "sentimentCorrection", label: "Sentiment Correction Layer" },
];

const automationToggleConfig: ToggleConfig[] = [
  { id: "insightInjection", label: "Insight Injection" },
  { id: "storytellingEnhancement", label: "Storytelling Enhancement" },
  { id: "motivationalReframes", label: "Motivational Reframes" },
  { id: "moodAdaptive", label: "Mood-Adaptive Behaviour" },
  { id: "contextualPacing", label: "Contextual Pacing Control" },
];

const reasoningDepthOptions: ReasoningDepth[] = [
  "Light",
  "Normal",
  "Analytical",
  "Deep",
] as const;

const cheapTextModels = [
  "gpt-4.1-mini",
  "gpt-4o-mini",
  "gpt-4o-realtime-mini",
  "gpt-4o-light",
  "gpt-4.1",
  "gpt-4o-mini-tts",
];

const cheapRealtimeModels = ["gpt-4o-mini", "gpt-4o-realtime-mini", "gpt-4o-realtime-preview"];

const cheapEmbeddingModels = ["text-embedding-3-small", "text-embedding-3-large"];

const defaultPersonaInstruction =
  "You are Vella – calm, steady, emotionally intelligent. Maintain one voice identity. Prioritise grounded presence, ultra-low verbosity, and reflective prompts at the end of every turn.";

const createToggleState = (configs: ToggleConfig[]) =>
  configs.reduce<Record<string, boolean>>((acc, config) => {
    acc[config.id] = false;
    return acc;
  }, {});

function buildAdminConfigFromState(state: {
  personaEmpathy: number;
  personaDirectness: number;
  personaEnergy: number;
  empathy: number;
  directness: number;
  containment: number;
  analysis: number;
  playfulness: number;
  introspection: number;
  conciseness: number;
  safety: number;
  softness: number;
  cadence: number;
  breathiness: number;
  pauseLength: number;
  whisperSensitivity: number;
  warmth: number;
  interruptionRecovery: number;
  temperature: number;
  topP: number;
  maxOutputLength: number;
  memorySelectivity: number;
  contextHistory: number;
  ragRecall: number;
  emotionalWeighting: number;
  safetyFilterStrength: number;
  redFlagSensitivity: number;
  outputSmoothing: number;
  hiddenModules: Record<string, boolean>;
  memoryToggles: Record<string, boolean>;
  safetyToggles: Record<string, boolean>;
  automationToggles: Record<string, boolean>;
  textModel: string;
  realtimeModel: string;
  embeddingModel: string;
  reasoningDepth: "Light" | "Normal" | "Analytical" | "Deep";
  personaInstruction: string;
}): AdminConfig {
  return {
    persona: {
      empathy: state.personaEmpathy,
      directness: state.personaDirectness,
      energy: state.personaEnergy,
    },
    behaviour: {
      empathy_regulation: state.empathy,
      directness: state.directness,
      emotional_containment: state.containment,
      analytical_depth: state.analysis,
      playfulness: state.playfulness,
      introspection_depth: state.introspection,
      conciseness: state.conciseness,
      safety_strictness: state.safety,
    },
    voice: {
      softness: state.softness,
      cadence: state.cadence,
      breathiness: state.breathiness,
      pause_length: state.pauseLength,
      whisper_sensitivity: state.whisperSensitivity,
      warmth: state.warmth,
      interruption_recovery: state.interruptionRecovery,
    },
    model: {
      temperature: state.temperature,
      top_p: state.topP,
      max_output: state.maxOutputLength,
    },
    models: {
      text_model: state.textModel,
      realtime_model: state.realtimeModel,
      embedding_model: state.embeddingModel,
      reasoning_depth: state.reasoningDepth,
    },
    memory: {
      selectivity: state.memorySelectivity,
      context_history: state.contextHistory,
      rag_recall_strength: state.ragRecall,
      emotional_weighting: state.emotionalWeighting,
      long_term: state.memoryToggles.longTermMemory ?? false,
      emotional_memory: state.memoryToggles.emotionalMemory ?? false,
      continuity: state.memoryToggles.continuity ?? false,
      insight_retention: state.memoryToggles.insightRetention ?? false,
    },
    safety: {
      filter_strength: state.safetyFilterStrength,
      red_flag_sensitivity: state.redFlagSensitivity,
      output_smoothing: state.outputSmoothing,
      hallucination_reducer: state.safetyToggles.hallucinationReducer ?? false,
      destabilization_guard: state.safetyToggles.destabilizationGuard ?? false,
      topic_boundary: state.safetyToggles.topicBoundary ?? false,
      over_empathy_limiter: state.safetyToggles.overEmpathyLimiter ?? false,
      harmful_content_purifier: state.safetyToggles.harmfulPurifier ?? false,
      attachment_prevention: state.safetyToggles.attachmentPrevention ?? false,
      repetition_breaker: state.safetyToggles.repetitionBreaker ?? false,
      sentiment_correction: state.safetyToggles.sentimentCorrection ?? false,
    },
    hidden_modules: {
      mentorMode: state.hiddenModules.mentorMode ?? false,
      therapistMode: state.hiddenModules.therapistMode ?? false,
      stoicMode: state.hiddenModules.stoicMode ?? false,
      coachingMode: state.hiddenModules.coachingMode ?? false,
      listeningMode: state.hiddenModules.listeningMode ?? false,
      childSafeMode: state.hiddenModules.childSafeMode ?? false,
      noAttachmentMode: state.hiddenModules.noAttachmentMode ?? false,
    },
    automation: {
      insightInjection: state.automationToggles.insightInjection ?? false,
      storytellingEnhancement: state.automationToggles.storytellingEnhancement ?? false,
      motivationalReframes: state.automationToggles.motivationalReframes ?? false,
      moodAdaptive: state.automationToggles.moodAdaptive ?? false,
      contextualPacing: state.automationToggles.contextualPacing ?? false,
    },
    persona_instruction: state.personaInstruction,
  };
}

const SectionCard = ({ title, description, children, className }: SectionCardProps) => (
  <section
    className={cn(
      "group rounded-xl bg-background/40 p-6 shadow-inner shadow-black/5 backdrop-blur-md transition-colors duration-200 hover:bg-background/50 hover:shadow-[0_0_35px_rgba(0,0,0,0.15)]",
      className,
    )}
  >
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const SliderList = ({ items }: SliderListProps) => (
  <div className="space-y-6">
    {items.map((item) => {
      const displayValue = item.formatValue
        ? item.formatValue(item.value)
        : item.unit
          ? `${Math.round(item.value)}${item.unit}`
          : `${Math.round(item.value)}`;

      return (
        <div key={item.id} className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{item.label}</span>
            <span className="text-muted-foreground">{displayValue}</span>
          </div>
          <Slider
            value={[item.value]}
            min={item.min ?? 0}
            max={item.max ?? 100}
            step={item.step ?? 1}
            onValueChange={(value) => item.setValue(value[0] ?? item.value)}
            className="slider-control mt-2 w-full data-[state=active]:bg-primary"
          />
        </div>
      );
    })}
  </div>
);

const ToggleList = ({ configs, values, onChange }: ToggleListProps) => (
  <div className="space-y-4">
    {configs.map((config) => {
      const switchId = `${config.id}-switch`;

      return (
        <div
          key={config.id}
          className="flex items-center justify-between gap-4 rounded-lg bg-background/30 px-4 py-3 transition-colors hover:bg-background/40"
        >
          <label htmlFor={switchId} className="text-sm text-foreground">
            {config.label}
          </label>
          <Switch
            id={switchId}
            checked={values[config.id]}
            onCheckedChange={(checked) => onChange(config.id, checked)}
            className="bg-muted transition-all data-[state=checked]:bg-primary"
          />
        </div>
      );
    })}
  </div>
);

const PresetsGrid = ({
  presets,
  onApply,
  appliedPreset,
}: PresetsProps & { onApply: (title: string) => void; appliedPreset: string | null }) => (
  <div className="grid gap-4 md:grid-cols-3">
    {presets.map((preset) => (
      <div
        key={preset.title}
        className={cn(
          "rounded-lg bg-background/30 p-4 shadow-inner shadow-black/5 transition-all duration-200 hover:bg-background/50",
          appliedPreset === preset.title && "ring-1 ring-primary/40",
        )}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{preset.title}</h3>
          {appliedPreset === preset.title ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Applied</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{preset.description}</p>
        <Button size="sm" className="mt-3" variant="secondary" onClick={() => onApply(preset.title)}>
          Apply preset
        </Button>
      </div>
    ))}
  </div>
);

type ModelSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
};

const ModelSelect = ({ label, value, onChange, placeholder, options }: ModelSelectProps) => (
  <div className="flex flex-col gap-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-lg border border-transparent bg-background/60 px-3 py-2 text-sm text-foreground shadow-inner shadow-black/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>{value || placeholder}</span>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[220px]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            className="flex cursor-pointer items-center justify-between text-sm"
            onClick={() => onChange(option)}
          >
            <span>{option}</span>
            {value === option ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

type ReasoningDepthSelectorProps = {
  value: ReasoningDepth;
  onChange: (next: ReasoningDepth) => void;
};

const ReasoningDepthSelector = ({ value, onChange }: ReasoningDepthSelectorProps) => (
  <div className="space-y-3">
    <p className="text-sm font-medium text-foreground">Reasoning Depth</p>
    <div className="flex flex-wrap gap-3">
      {reasoningDepthOptions.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            "rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option
              ? "bg-primary/10 text-foreground ring-1 ring-primary/40"
              : "bg-muted/20 text-muted-foreground hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
);

const SliderStyles = () => (
  <style jsx global>{`
    .slider-control > span {
      height: 0.5rem;
      border-radius: 9999px;
      background-color: hsl(var(--muted) / 0.3);
    }
    .slider-control > span > span {
      background-color: hsl(var(--primary));
    }
    .slider-control [role="slider"] {
      height: 1rem;
      width: 1rem;
      border-radius: 9999px;
      background-color: hsl(var(--primary));
      border: none;
    }
    .slider-control [role="slider"]:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px hsl(var(--ring));
    }
  `}</style>
);

export default function AiConfigurationPage() {
  const [personaInstruction, setPersonaInstruction] = useState(defaultPersonaInstruction);
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);

  const [personaEmpathy, setPersonaEmpathy] = useState(80);
  const [personaDirectness, setPersonaDirectness] = useState(45);
  const [personaEnergy, setPersonaEnergy] = useState(58);

  const [empathy, setEmpathy] = useState(72);
  const [directness, setDirectness] = useState(48);
  const [containment, setContainment] = useState(63);
  const [analysis, setAnalysis] = useState(67);
  const [playfulness, setPlayfulness] = useState(34);
  const [introspection, setIntrospection] = useState(58);
  const [conciseness, setConciseness] = useState(41);
  const [safety, setSafety] = useState(82);

  const [softness, setSoftness] = useState(65);
  const [cadence, setCadence] = useState(54);
  const [breathiness, setBreathiness] = useState(46);
  const [pauseLength, setPauseLength] = useState(38);
  const [whisperSensitivity, setWhisperSensitivity] = useState(42);
  const [warmth, setWarmth] = useState(71);
  const [interruptionRecovery, setInterruptionRecovery] = useState(58);

  const [temperature, setTemperature] = useState(0.8);
  const [topP, setTopP] = useState(0.92);
  const [maxOutputLength, setMaxOutputLength] = useState(1200);

  const [memorySelectivity, setMemorySelectivity] = useState(58);
  const [contextHistory, setContextHistory] = useState(18);
  const [ragRecall, setRagRecall] = useState(64);
  const [emotionalWeighting, setEmotionalWeighting] = useState(52);

  const [safetyFilterStrength, setSafetyFilterStrength] = useState(90);
  const [redFlagSensitivity, setRedFlagSensitivity] = useState(76);
  const [outputSmoothing, setOutputSmoothing] = useState(48);

  const [hiddenModules, setHiddenModules] = useState(() =>
    createToggleState(hiddenModuleToggleConfig),
  );
  const [memoryToggles, setMemoryToggles] = useState(() => createToggleState(memoryToggleConfig));
  const [safetyToggles, setSafetyToggles] = useState(() => createToggleState(safetyToggleConfig));
  const [automationToggles, setAutomationToggles] = useState(() =>
    createToggleState(automationToggleConfig),
  );

  const [textModel, setTextModel] = useState("gpt-4o-mini");
  const [realtimeModel, setRealtimeModel] = useState("gpt-4o-mini");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [reasoningDepth, setReasoningDepth] = useState<ReasoningDepth>("Normal");

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const saveMessageIsError = Boolean(saveMessage && saveMessage.toLowerCase().includes("fail"));

  const hydrateStateFromAdminConfig = useCallback(
    (config: AdminConfig) => {
      setPersonaEmpathy(config.persona?.empathy ?? 80);
      setPersonaDirectness(config.persona?.directness ?? 45);
      setPersonaEnergy(config.persona?.energy ?? 58);

      setEmpathy(config.behaviour?.empathy_regulation ?? 72);
      setDirectness(config.behaviour?.directness ?? 48);
      setContainment(config.behaviour?.emotional_containment ?? 63);
      setAnalysis(config.behaviour?.analytical_depth ?? 67);
      setPlayfulness(config.behaviour?.playfulness ?? 34);
      setIntrospection(config.behaviour?.introspection_depth ?? 58);
      setConciseness(config.behaviour?.conciseness ?? 41);
      setSafety(config.behaviour?.safety_strictness ?? 82);

      setSoftness(config.voice?.softness ?? 65);
      setCadence(config.voice?.cadence ?? 54);
      setBreathiness(config.voice?.breathiness ?? 46);
      setPauseLength(config.voice?.pause_length ?? 38);
      setWhisperSensitivity(config.voice?.whisper_sensitivity ?? 42);
      setWarmth(config.voice?.warmth ?? 71);
      setInterruptionRecovery(config.voice?.interruption_recovery ?? 58);

      setTemperature(config.model?.temperature ?? 0.8);
      setTopP(config.model?.top_p ?? 0.92);
      setMaxOutputLength(config.model?.max_output ?? 1200);

      setMemorySelectivity(config.memory?.selectivity ?? 58);
      setContextHistory(config.memory?.context_history ?? 18);
      setRagRecall(config.memory?.rag_recall_strength ?? 64);
      setEmotionalWeighting(config.memory?.emotional_weighting ?? 52);

      setSafetyFilterStrength(config.safety?.filter_strength ?? 90);
      setRedFlagSensitivity(config.safety?.red_flag_sensitivity ?? 76);
      setOutputSmoothing(config.safety?.output_smoothing ?? 48);

      setHiddenModules({
        mentorMode: config.hidden_modules?.mentorMode ?? false,
        therapistMode: config.hidden_modules?.therapistMode ?? false,
        stoicMode: config.hidden_modules?.stoicMode ?? false,
        coachingMode: config.hidden_modules?.coachingMode ?? false,
        listeningMode: config.hidden_modules?.listeningMode ?? false,
        childSafeMode: config.hidden_modules?.childSafeMode ?? false,
        noAttachmentMode: config.hidden_modules?.noAttachmentMode ?? false,
      });

      setMemoryToggles({
        longTermMemory: config.memory?.long_term ?? false,
        emotionalMemory: config.memory?.emotional_memory ?? false,
        continuity: config.memory?.continuity ?? false,
        insightRetention: config.memory?.insight_retention ?? false,
      });

      setSafetyToggles({
        hallucinationReducer: config.safety?.hallucination_reducer ?? false,
        destabilizationGuard: config.safety?.destabilization_guard ?? false,
        topicBoundary: config.safety?.topic_boundary ?? false,
        overEmpathyLimiter: config.safety?.over_empathy_limiter ?? false,
        harmfulPurifier: config.safety?.harmful_content_purifier ?? false,
        attachmentPrevention: config.safety?.attachment_prevention ?? false,
        repetitionBreaker: config.safety?.repetition_breaker ?? false,
        sentimentCorrection: config.safety?.sentiment_correction ?? false,
      });

      setAutomationToggles({
        insightInjection: config.automation?.insightInjection ?? false,
        storytellingEnhancement: config.automation?.storytellingEnhancement ?? false,
        motivationalReframes: config.automation?.motivationalReframes ?? false,
        moodAdaptive: config.automation?.moodAdaptive ?? false,
        contextualPacing: config.automation?.contextualPacing ?? false,
      });

      setTextModel(config.models?.text_model ?? "gpt-4o-mini");
      setRealtimeModel(config.models?.realtime_model ?? "gpt-4o-mini");
      setEmbeddingModel(config.models?.embedding_model ?? "text-embedding-3-small");
      setReasoningDepth(config.models?.reasoning_depth ?? "Normal");

      setPersonaInstruction(config.persona_instruction ?? defaultPersonaInstruction);
    },
    [],
  );

  useEffect(() => {
    let isActive = true;

    const loadConfig = async () => {
      try {
        setLoadError(null);
        const config = await fetchAdminConfig();
        if (config && isActive) {
          hydrateStateFromAdminConfig(config);
        }
      } catch (error) {
        console.error(error);
        if (isActive) {
          setLoadError("Failed to load configuration.");
        }
      } finally {
        if (isActive) {
          setIsLoadingConfig(false);
        }
      }
    };

    loadConfig();

    return () => {
      isActive = false;
    };
  }, [hydrateStateFromAdminConfig]);

  const personaSliderItems: SliderItem[] = [
    { id: "persona-empathy", label: "Empathy", value: personaEmpathy, setValue: setPersonaEmpathy, unit: "%" },
    { id: "persona-directness", label: "Directness", value: personaDirectness, setValue: setPersonaDirectness, unit: "%" },
    { id: "persona-energy", label: "Energy", value: personaEnergy, setValue: setPersonaEnergy, unit: "%" },
  ];

  const behaviourControls = [
    { label: "Empathy Regulation", value: empathy, setter: setEmpathy },
    { label: "Directness", value: directness, setter: setDirectness },
    { label: "Emotional Containment", value: containment, setter: setContainment },
    { label: "Analytical Depth", value: analysis, setter: setAnalysis },
    { label: "Playfulness", value: playfulness, setter: setPlayfulness },
    { label: "Introspection Depth", value: introspection, setter: setIntrospection },
    { label: "Conciseness vs Verbosity", value: conciseness, setter: setConciseness },
    { label: "Safety Strictness", value: safety, setter: setSafety },
  ];

  const voiceEngineSliderItems: SliderItem[] = [
    { id: "softness", label: "Softness", value: softness, setValue: setSoftness, unit: "%" },
    { id: "cadence", label: "Cadence", value: cadence, setValue: setCadence, unit: "%" },
    { id: "breathiness", label: "Breathiness", value: breathiness, setValue: setBreathiness, unit: "%" },
    { id: "pause-length", label: "Pause Length", value: pauseLength, setValue: setPauseLength, unit: "%" },
    { id: "whisper-sensitivity", label: "Whisper Sensitivity", value: whisperSensitivity, setValue: setWhisperSensitivity, unit: "%" },
    { id: "warmth", label: "Warmth", value: warmth, setValue: setWarmth, unit: "%" },
    {
      id: "interruption-recovery",
      label: "Interruption Recovery Strength",
      value: interruptionRecovery,
      setValue: setInterruptionRecovery,
      unit: "%",
    },
  ];

  const modelSliderItems: SliderItem[] = [
    {
      id: "temperature",
      label: "Temperature",
      value: temperature,
      setValue: setTemperature,
      min: 0,
      max: 2,
      step: 0.1,
      formatValue: (value) => value.toFixed(1),
    },
    {
      id: "top-p",
      label: "Top-P",
      value: topP,
      setValue: setTopP,
      min: 0,
      max: 1,
      step: 0.05,
      formatValue: (value) => value.toFixed(2),
    },
    {
      id: "max-output",
      label: "Max Output Length",
      value: maxOutputLength,
      setValue: setMaxOutputLength,
      min: 200,
      max: 4000,
      step: 50,
      formatValue: (value) => `${Math.round(value)} tokens`,
    },
  ];

  const memorySliderItems: SliderItem[] = [
    {
      id: "memory-selectivity",
      label: "Memory Selectivity",
      value: memorySelectivity,
      setValue: setMemorySelectivity,
      unit: "%",
    },
    {
      id: "context-history",
      label: "Max Context History",
      value: contextHistory,
      setValue: setContextHistory,
      min: 4,
      max: 50,
      step: 1,
      formatValue: (value) => `${Math.round(value)} turns`,
    },
    {
      id: "rag-recall",
      label: "RAG Recall Strength",
      value: ragRecall,
      setValue: setRagRecall,
      unit: "%",
    },
    {
      id: "emotional-weighting",
      label: "Emotional Weighting Strength",
      value: emotionalWeighting,
      setValue: setEmotionalWeighting,
      unit: "%",
    },
  ];

  const safetySliderItems: SliderItem[] = [
    {
      id: "safety-filter-strength",
      label: "Safety Filter Strength",
      value: safetyFilterStrength,
      setValue: setSafetyFilterStrength,
      unit: "%",
    },
    {
      id: "red-flag-sensitivity",
      label: "Red-Flag Sensitivity",
      value: redFlagSensitivity,
      setValue: setRedFlagSensitivity,
      unit: "%",
    },
    {
      id: "output-smoothing",
      label: "Output Smoothing Aggressiveness",
      value: outputSmoothing,
      setValue: setOutputSmoothing,
      unit: "%",
    },
  ];

  const behaviourSliderItems: SliderItem[] = behaviourControls.map((control) => ({
    id: control.label.toLowerCase().replace(/\s+/g, "-"),
    label: control.label,
    value: control.value,
    setValue: control.setter,
    unit: "%",
  }));

  const updateToggleState =
    (setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>) =>
    (id: string, value: boolean) => {
      setter((prev) => ({ ...prev, [id]: value }));
    };

  const handleApplyPreset = (title: string) => {
    const config = presetConfigs[title];
    if (!config) return;
    setPersonaEmpathy(config.persona.empathy);
    setPersonaDirectness(config.persona.directness);
    setPersonaEnergy(config.persona.energy);
    if (config.behaviour.empathy !== undefined) setEmpathy(config.behaviour.empathy);
    if (config.behaviour.directness !== undefined) setDirectness(config.behaviour.directness);
    if (config.behaviour.containment !== undefined) setContainment(config.behaviour.containment);
    if (config.behaviour.analysis !== undefined) setAnalysis(config.behaviour.analysis);
    if (config.behaviour.playfulness !== undefined) setPlayfulness(config.behaviour.playfulness);
    if (config.behaviour.introspection !== undefined) setIntrospection(config.behaviour.introspection);
    if (config.behaviour.conciseness !== undefined) setConciseness(config.behaviour.conciseness);
    if (config.behaviour.safety !== undefined) setSafety(config.behaviour.safety);
    setTextModel(config.models.text);
    setRealtimeModel(config.models.realtime);
    setEmbeddingModel(config.models.embedding);
    setAppliedPreset(title);
    setTimeout(() => setAppliedPreset(null), 2500);
  };

  const handleSavePersonaInstruction = async () => {
    try {
      setIsSavingConfig(true);
      setSaveMessage(null);

      const config = buildAdminConfigFromState({
        personaEmpathy,
        personaDirectness,
        personaEnergy,
        empathy,
        directness,
        containment,
        analysis,
        playfulness,
        introspection,
        conciseness,
        safety,
        softness,
        cadence,
        breathiness,
        pauseLength,
        whisperSensitivity,
        warmth,
        interruptionRecovery,
        temperature,
        topP,
        maxOutputLength,
        memorySelectivity,
        contextHistory,
        ragRecall,
        emotionalWeighting,
        safetyFilterStrength,
        redFlagSensitivity,
        outputSmoothing,
        hiddenModules,
        memoryToggles,
        safetyToggles,
        automationToggles,
        textModel,
        realtimeModel,
        embeddingModel,
        reasoningDepth,
        personaInstruction,
      });

      await saveAdminConfig(config);
      setSaveMessage("Configuration saved");
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (error) {
      console.error(error);
      setSaveMessage("Failed to save configuration");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleResetPersonaInstruction = () => {
    setPersonaInstruction(defaultPersonaInstruction);
  };

  return (
    <>
      <div className="space-y-8">
      <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">AI Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Curate persona settings, tone profiles, models, and safety monitors.
        </p>
      </div>

        {isLoadingConfig ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-background/40 p-6 text-sm text-muted-foreground">
            Loading configuration...
          </div>
        ) : (
          <>
            {loadError ? (
              <p className="text-sm text-destructive">
                Failed to load configuration. Showing defaults.
              </p>
            ) : null}
            <div className="grid gap-6 md:grid-cols-2">
        <SectionCard
          title="Global Persona Settings"
          description="High-level persona tone controls."
          className="md:col-span-2"
        >
          <SliderList items={personaSliderItems} />
        </SectionCard>

        <SectionCard
          title="Presets"
          description="Quickly load previously approved persona shells."
          className="md:col-span-2"
        >
          <PresetsGrid presets={personaPresets} onApply={handleApplyPreset} appliedPreset={appliedPreset} />
        </SectionCard>

        <SectionCard
          title="Core Behaviour Controls"
          description="Fine-grained behavioural sliders for admin overrides."
          className="md:col-span-2"
        >
          <SliderList items={behaviourSliderItems} />
        </SectionCard>

        <SectionCard title="Hidden Persona Modules">
          <ToggleList
            configs={hiddenModuleToggleConfig}
            values={hiddenModules}
            onChange={updateToggleState(setHiddenModules)}
          />
        </SectionCard>

        <SectionCard
          title="Voice Engine Controls"
          description="Realtime voice shaping for conversational output."
          className="md:col-span-2"
        >
          <SliderList items={voiceEngineSliderItems} />
        </SectionCard>

        <SectionCard title="Model Behaviour" className="md:col-span-2">
          <div className="space-y-6">
            <SliderList items={modelSliderItems} />
            <div className="grid gap-4 md:grid-cols-3">
              <ModelSelect
                label="Text Model"
                value={textModel}
                onChange={setTextModel}
                placeholder="Select text model"
                options={cheapTextModels}
              />
              <ModelSelect
                label="Realtime Voice Model"
                value={realtimeModel}
                onChange={setRealtimeModel}
                placeholder="Select realtime model"
                options={cheapRealtimeModels}
              />
              <ModelSelect
                label="Embeddings Model"
                value={embeddingModel}
                onChange={setEmbeddingModel}
                placeholder="Select embedding model"
                options={cheapEmbeddingModels}
              />
            </div>
            <ReasoningDepthSelector value={reasoningDepth} onChange={setReasoningDepth} />
          </div>
        </SectionCard>

        <SectionCard
          title="Memory & Context Engine"
          description="Configure how contextual state is retained."
          className="md:col-span-2"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <ToggleList
              configs={memoryToggleConfig}
              values={memoryToggles}
              onChange={updateToggleState(setMemoryToggles)}
            />
            <SliderList
              items={memorySliderItems}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Safety & Stability"
          description="Harmonise safety layers with runtime guards."
          className="md:col-span-2"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <ToggleList
              configs={safetyToggleConfig}
              values={safetyToggles}
              onChange={updateToggleState(setSafetyToggles)}
            />
            <SliderList
              items={safetySliderItems}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Behaviour Automation"
          description="High-impact automation flags for admin-only experimentation."
        >
          <ToggleList
            configs={automationToggleConfig}
            values={automationToggles}
            onChange={updateToggleState(setAutomationToggles)}
          />
        </SectionCard>

        <SectionCard
          title="Persona Instruction Preview"
          description="Edit, save, or export the live persona directive."
          className="md:col-span-2"
        >
          <div className="space-y-4">
            <textarea
              value={personaInstruction}
              onChange={(event) => setPersonaInstruction(event.target.value)}
              className="min-h-[220px] w-full rounded-lg bg-background/60 px-4 py-3 text-sm text-foreground shadow-inner shadow-black/5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              {saveMessage ? (
                <span
                  className={cn(
                    "text-xs",
                    saveMessageIsError ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {saveMessage}
                </span>
              ) : null}
              <Button variant="ghost" type="button" onClick={handleResetPersonaInstruction}>
                Revert to default
              </Button>
              <Button type="button" onClick={handleSavePersonaInstruction} disabled={isSavingConfig}>
                {isSavingConfig ? "Saving..." : "Save as active system prompt"}
              </Button>
            </div>
          </div>
        </SectionCard>
            </div>
          </>
        )}
    </div>
      <SliderStyles />
    </>
  );
}


