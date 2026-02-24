export type SystemSettingsConfig = {
  maintenanceMode: boolean;
  enableVoice: boolean;
  enableRealtime: boolean;
  enableMusicMode: boolean;
  maxTokensPerMessage: number;
  maxDailyTokensPerUser: number;
};

export const defaultSystemSettings: SystemSettingsConfig = {
  maintenanceMode: false,
  enableVoice: true,
  enableRealtime: true,
  enableMusicMode: false,
  maxTokensPerMessage: 2000,
  maxDailyTokensPerUser: 20000,
};

