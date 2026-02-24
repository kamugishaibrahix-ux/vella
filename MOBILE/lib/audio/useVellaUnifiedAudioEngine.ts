import { useMemo } from "react";
import {
  getVellaUnifiedAudioEngine,
  debugPlayTestTone,
  type VellaAudioPreset,
  type VellaAudioTrackKind,
  type VellaAudioEngineState,
} from "./vellaUnifiedAudio";

export function useVellaUnifiedAudioEngine() {
  const engine = useMemo(() => getVellaUnifiedAudioEngine(), []);


  return useMemo(
    () => ({
      playPreset: (preset: VellaAudioPreset) => {
        console.log("[Engine] playPreset:", preset.id);
        return engine.playPreset(preset);
      },
      stopKind: (kind: VellaAudioTrackKind, options?: { fadeMs?: number }) =>
        engine.stopKind(kind, options),
      stopAll: (options?: { fadeMs?: number }) => engine.stopAll(options),
      setMasterVolume: (volume: number) => engine.setMasterVolume(volume),
      getState: () => engine.getState(),
      subscribe: (listener: (state: VellaAudioEngineState) => void) => engine.subscribe(listener),
      debugPlayTestTone: () => debugPlayTestTone(),
    }),
    [engine],
  );
}

