import defaultSettings from '@/settings.json';
import { PermissionMap } from './session';

export interface GlobalState {
  settings: typeof defaultSettings;
  userInfo: {
    nickname?: string;
    role?: string;
    avatar?: string;
    permissions: PermissionMap;
  };
  userLoading: boolean;
}

export { useQueryStore } from './query';
export { useSessionStore } from './session';
export { useSettingsStore } from './settings';
