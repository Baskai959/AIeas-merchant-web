import { create } from 'zustand';
import defaultSettings from '@/settings.json';
import {
  AppSettings,
  readSettingsSnapshot,
  writeSettingsSnapshot,
} from '@/services/http/storage';

function applyColorWeek(enabled: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.style.filter = enabled ? 'invert(80%)' : 'none';
}

interface SettingsState {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

const initialSettings = {
  ...defaultSettings,
  ...readSettingsSnapshot(),
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: initialSettings,
  updateSettings(patch) {
    const nextSettings = {
      ...get().settings,
      ...patch,
    };
    writeSettingsSnapshot(nextSettings);
    applyColorWeek(!!nextSettings.colorWeek);
    set({ settings: nextSettings });
  },
}));

applyColorWeek(!!initialSettings.colorWeek);
